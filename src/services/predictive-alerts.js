'use strict';

// R4.2 — Predictive Alerts Service
// Simple linear extrapolation for cost forecasting, agent failure prediction, and
// resource exhaustion warnings. No ML libraries — just rolling averages and linear regression.

const { queryEvents } = require('./event-store');
const { getCostSummary } = require('./cost-aggregator');
const { getConfig } = require('../config');

// ── Simple linear regression ──────────────────────────────────────────────────

/**
 * Fit a least-squares line through [{x, y}] points.
 * Returns { slope, intercept, predict(x) } or null if under-determined.
 */
function _linfit(points) {
  if (points.length < 2) return null;
  const n    = points.length;
  const sumX  = points.reduce((s, p) => s + p.x, 0);
  const sumY  = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;
  const slope     = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept, predict: (x) => slope * x + intercept };
}

// ── R4.2.1 Cost Forecasting ───────────────────────────────────────────────────

function getCostForecast() {
  const summary = getCostSummary();
  const cfg     = getConfig();

  if (!summary) return { ready: false };

  const totalCost     = summary.totalCost   || 0;
  const spendRate     = summary.spendRate   || 0; // $/min
  const history       = summary.dailyHistory || []; // [{ts, totalCost}]
  const dailyBudget   = cfg.budgets?.dailyUsd   || 1;
  const monthlyBudget = cfg.budgets?.monthlyUsd || 30;

  const now             = new Date();
  const minutesElapsed  = now.getHours() * 60 + now.getMinutes();
  const minutesRemaining = 24 * 60 - minutesElapsed;

  let projectedDaily   = totalCost;
  let projectedMonthly = totalCost * 30;
  let confidence       = 'low';

  if (history.length >= 5) {
    // Fit trend line to cost history (x = minutes since first point)
    const t0 = history[0].ts;
    const pts = history.map(h => ({ x: (h.ts - t0) / 60000, y: h.totalCost }));
    const fit = _linfit(pts);

    if (fit) {
      const lastX        = (history[history.length - 1].ts - t0) / 60000;
      const endOfDayX    = lastX + minutesRemaining;
      projectedDaily     = Math.max(totalCost, fit.predict(endOfDayX));
      projectedMonthly   = projectedDaily * 30;
      confidence         = history.length >= 20 ? 'high' : 'medium';
    }
  } else if (spendRate > 0) {
    projectedDaily   = totalCost + spendRate * minutesRemaining;
    projectedMonthly = projectedDaily * 30;
    confidence       = 'medium';
  }

  // Clamp to realistic bounds
  projectedDaily   = Math.max(totalCost, Math.max(0, projectedDaily));
  projectedMonthly = Math.max(0, projectedMonthly);

  const dailyPct   = dailyBudget   > 0 ? (projectedDaily   / dailyBudget   * 100) : 0;
  const monthlyPct = monthlyBudget > 0 ? (projectedMonthly / monthlyBudget * 100) : 0;

  const alerts = [];
  if (dailyPct >= 100) {
    alerts.push({
      level: 'critical',
      type:  'daily_overrun',
      msg:   `Projected daily spend $${projectedDaily.toFixed(3)} exceeds $${dailyBudget.toFixed(2)} budget`,
      confidence,
    });
  } else if (dailyPct >= 80) {
    alerts.push({
      level: 'warn',
      type:  'daily_high',
      msg:   `Projected to reach ${dailyPct.toFixed(0)}% of daily budget by end of day`,
      confidence,
    });
  }

  if (monthlyPct >= 80) {
    alerts.push({
      level: 'warn',
      type:  'monthly_high',
      msg:   `Projected monthly spend $${projectedMonthly.toFixed(2)} (${monthlyPct.toFixed(0)}% of $${monthlyBudget})`,
      confidence,
    });
  }

  return {
    ready:            true,
    totalCost,
    projectedDaily,
    projectedMonthly,
    dailyBudget,
    monthlyBudget,
    dailyPct:         Math.min(dailyPct, 300),
    monthlyPct:       Math.min(monthlyPct, 300),
    confidence,
    spendRate,
    minutesRemaining,
    minutesElapsed,
    alerts,
    // Compact history for mini-chart (last 30 points)
    history:          history.slice(-30).map(h => ({ ts: h.ts, cost: h.totalCost })),
  };
}

// ── R4.2.2 Agent Failure Prediction ──────────────────────────────────────────

function getAgentFailurePrediction() {
  const now    = Date.now();
  const from24h = now - 24 * 60 * 60 * 1000;
  const from1h  = now -  1 * 60 * 60 * 1000;
  const from30m = now -       30 * 60 * 1000;

  const events = queryEvents({ from: from24h, limit: 3000 });

  const stats = new Map();

  for (const evt of events) {
    if (!evt.agent_id) continue;
    const id = evt.agent_id;

    if (!stats.has(id)) {
      stats.set(id, {
        total_24h: 0, errors_24h: 0,
        total_1h:  0, errors_1h:  0,
        total_30m: 0, errors_30m: 0,
      });
    }

    const s   = stats.get(id);
    const isErr = evt.status === 'error' || evt.event_type === 'error';

    s.total_24h++;
    if (isErr) s.errors_24h++;

    if (evt.timestamp >= from1h) {
      s.total_1h++;
      if (isErr) s.errors_1h++;
    }

    if (evt.timestamp >= from30m) {
      s.total_30m++;
      if (isErr) s.errors_30m++;
    }
  }

  const predictions = [];

  for (const [agentId, s] of stats) {
    const baseRate   = s.total_24h > 0 ? s.errors_24h / s.total_24h : 0;
    const recentRate = s.total_1h  > 0 ? s.errors_1h  / s.total_1h  : 0;
    const latestRate = s.total_30m > 0 ? s.errors_30m / s.total_30m : 0;

    const multiplier    = baseRate > 0.01 ? recentRate / baseRate : null;
    const spiralRisk    = multiplier !== null && multiplier > 2;
    const criticalRisk  = latestRate >= 0.5  && s.total_30m >= 3;

    if (spiralRisk || criticalRisk) {
      predictions.push({
        agent_id:          agentId,
        base_error_rate:   Math.round(baseRate   * 1000) / 10, // %
        recent_error_rate: Math.round(recentRate * 1000) / 10,
        latest_error_rate: Math.round(latestRate * 1000) / 10,
        multiplier:        multiplier !== null ? Math.round(multiplier * 10) / 10 : null,
        level:             criticalRisk ? 'critical' : 'warn',
        msg:               criticalRisk
          ? `${agentId}: error rate ${(latestRate * 100).toFixed(0)}% in last 30m — possible failure spiral`
          : `${agentId}: error rate ${(multiplier ?? 0).toFixed(1)}x above 24h baseline`,
        events_1h:  s.total_1h,
        errors_1h:  s.errors_1h,
        events_30m: s.total_30m,
        errors_30m: s.errors_30m,
      });
    }
  }

  return predictions;
}

// ── R4.2.3 Resource Exhaustion Prediction ────────────────────────────────────

function getResourceExhaustionAlerts() {
  const from24h = Date.now() - 24 * 60 * 60 * 1000;
  const events  = queryEvents({ from: from24h, limit: 2000 });

  const ctxMap = new Map();

  for (const evt of events) {
    if (!evt.agent_id || !evt.data) continue;
    const data = evt.data;

    // Accept context_pct directly or derive from context_tokens / context_limit
    let pct = data.context_pct ?? null;
    if (pct == null && data.context_tokens && data.context_limit > 0) {
      pct = (data.context_tokens / data.context_limit) * 100;
    }
    if (pct == null || pct <= 0) continue;

    if (!ctxMap.has(evt.agent_id)) ctxMap.set(evt.agent_id, []);
    ctxMap.get(evt.agent_id).push({ ts: evt.timestamp, pct });
  }

  const alerts = [];

  for (const [agentId, samples] of ctxMap) {
    if (samples.length === 0) continue;

    const sorted = samples.sort((a, b) => a.ts - b.ts);
    const latest = sorted[sorted.length - 1].pct;

    let timeToExhaustMin = null;

    if (sorted.length >= 2) {
      const t0  = sorted[0].ts;
      const pts = sorted.map(s => ({ x: (s.ts - t0) / 60000, y: s.pct }));
      const fit = _linfit(pts);
      if (fit && fit.slope > 0) {
        const minutesToFull = (100 - latest) / fit.slope;
        timeToExhaustMin = minutesToFull > 0 ? Math.round(minutesToFull) : 0;
      }
    }

    if (latest >= 90) {
      alerts.push({
        agent_id:          agentId,
        context_pct:       Math.round(latest * 10) / 10,
        level:             'critical',
        msg:               `${agentId}: context at ${latest.toFixed(0)}% — near exhaustion`,
        time_to_exhaust_min: timeToExhaustMin,
      });
    } else if (latest >= 80) {
      alerts.push({
        agent_id:          agentId,
        context_pct:       Math.round(latest * 10) / 10,
        level:             'warn',
        msg:               `${agentId}: context at ${latest.toFixed(0)}%${timeToExhaustMin ? ` — ~${timeToExhaustMin}m until full` : ''}`,
        time_to_exhaust_min: timeToExhaustMin,
      });
    }
  }

  return alerts;
}

// ── R4.3 Smart Recommendations ───────────────────────────────────────────────

function getRecommendations(agentMetrics, skillAnalytics) {
  const recs = [];

  // Model routing suggestions (R4.3.1)
  for (const agent of (agentMetrics || [])) {
    const sr    = agent.success_rate_24h ?? agent.success_rate_7d ?? null;
    const model = agent.primary_model || '';
    if (sr === null || !model) continue;

    if (agent.model_is_expensive && sr >= 0.95 && agent.events_7d >= 10) {
      recs.push({
        type:     'model_downgrade',
        agent_id: agent.agent_id,
        title:    `Consider downgrading ${agent.agent_id}`,
        detail:   `${(sr * 100).toFixed(0)}% success on ${model} — Haiku may work at ~${model.includes('opus') ? '19x' : '5x'} lower cost`,
        icon:     '💡',
        priority: 'low',
        dismissed: false,
      });
    }

    if (agent.model_is_cheap && sr < 0.5 && agent.events_7d >= 5) {
      recs.push({
        type:     'model_upgrade',
        agent_id: agent.agent_id,
        title:    `Consider upgrading ${agent.agent_id}`,
        detail:   `${(sr * 100).toFixed(0)}% success on ${model} — a more capable model may reduce errors`,
        icon:     '⬆️',
        priority: 'high',
        dismissed: false,
      });
    }
  }

  // Skill optimization (R4.3.2)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const skill of (skillAnalytics || [])) {
    if (skill.is_idle && skill.last_used < sevenDaysAgo && skill.uses > 0) {
      recs.push({
        type:     'unused_skill',
        skill:    skill.name,
        title:    `Unused skill: ${skill.name}`,
        detail:   `Not called in 7+ days (${skill.uses} total uses). Consider removing to reduce overhead.`,
        icon:     '🧹',
        priority: 'low',
        dismissed: false,
      });
    }
  }

  return recs;
}

// ── Full Bundle ───────────────────────────────────────────────────────────────

function getAllPredictions(agentMetrics, skillAnalytics) {
  const costForecast    = getCostForecast();
  const agentFailures   = getAgentFailurePrediction();
  const resourceAlerts  = getResourceExhaustionAlerts();
  const recommendations = getRecommendations(agentMetrics, skillAnalytics);

  const allAlerts = [
    ...(costForecast.alerts || []),
    ...agentFailures,
    ...resourceAlerts,
  ];

  return {
    costForecast,
    agentFailures,
    resourceAlerts,
    recommendations,
    alerts:     allAlerts,
    alertCount: allAlerts.filter(a => a.level === 'critical').length,
    warnCount:  allAlerts.filter(a => a.level === 'warn').length,
    ts:         Date.now(),
  };
}

module.exports = {
  getCostForecast,
  getAgentFailurePrediction,
  getResourceExhaustionAlerts,
  getRecommendations,
  getAllPredictions,
};
