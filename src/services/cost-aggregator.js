'use strict';

// R1.1 Cost Shield — periodic cost aggregation, velocity tracking, budget alerts, anomaly detection.
// Wired into server startup via init(broadcastFn).

const { getRecentSessions } = require('../sessiondb');
const { sessionCost, aggregateUsage, checkBudget } = require('./cost-calculator');
const { getStatus } = require('./openclaw');
const { getConfig } = require('../config');

// ── Rolling window state ──────────────────────────────────────────────────────

// 5-minute cost window: [{ts, cost}] — used for spend rate
const _costWindow = [];
const WINDOW_MS = 5 * 60 * 1000;

// Rolling hourly history for chart (up to 1 hour of 30s snapshots = 120 points)
const _dailyHistory = []; // [{ts, totalCost}]

// Rolling spend rates for anomaly detection (last 12 samples = 6 minutes)
const _rateHistory = [];

// Alert deduplication — reset at day boundary
let _alertsSent = new Set();
let _alertDay = new Date().toDateString();

// Cached summary from last aggregation cycle
let _lastSummary = null;

// Broadcast fn injected by server
let _broadcastFn = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Start the aggregation loop.
 * @param {function} broadcastFn — server's broadcast(room, payload)
 */
function init(broadcastFn) {
  _broadcastFn = broadcastFn;
  aggregate(); // immediate first run
  setInterval(aggregate, 30_000);
}

// ── Aggregation cycle ─────────────────────────────────────────────────────────

function aggregate() {
  try {
    const sessions = _getSessions();
    const { byModel, totals } = aggregateUsage(sessions);
    const now = Date.now();
    const totalCost = totals.cost;

    // ── Snapshot for velocity window
    _costWindow.push({ ts: now, cost: totalCost });
    while (_costWindow.length > 1 && now - _costWindow[0].ts > WINDOW_MS) {
      _costWindow.shift();
    }

    // ── Daily history for chart
    _dailyHistory.push({ ts: now, totalCost });
    if (_dailyHistory.length > 200) _dailyHistory.shift();

    // ── Compute speed metrics
    const spendRate = _computeSpendRate(); // $ per minute
    const projectedDaily = _projectDaily(spendRate);
    const hoursLeft = _budgetHoursLeft(totalCost, spendRate);

    // ── Anomaly detection
    _rateHistory.push(spendRate);
    if (_rateHistory.length > 12) _rateHistory.shift();
    const avgRate = _rateHistory.reduce((a, b) => a + b, 0) / _rateHistory.length;
    const anomaly = _rateHistory.length >= 3 && spendRate > 0 && avgRate > 0 && spendRate > avgRate * 3;

    // ── Budget status
    const budgetStatus = _computeBudgetStatus(totalCost);

    // ── Per-agent/skill attribution
    const byAttrib = _attributeCosts(sessions);

    _lastSummary = {
      ts: now,
      totalCost,
      spendRate,
      projectedDaily,
      hoursLeft,
      byModel,
      totals,
      budgetStatus,
      byAttrib,
      anomaly,
      avgRate,
      sessionCount: sessions.length,
      dailyHistory: _dailyHistory.slice(-60), // last 30 min
    };

    // ── Broadcast update
    if (_broadcastFn) {
      _broadcastFn('cost-events', { type: 'cost-update', data: _lastSummary });
    }

    // ── Threshold alerts
    _checkAlerts(totalCost, spendRate, budgetStatus, anomaly);
  } catch (_err) {
    // Aggregation errors must never crash the server
  }
}

// ── Session source ────────────────────────────────────────────────────────────

function _getSessions() {
  // Prefer DB; fall back to CLI data
  const dbSessions = getRecentSessions(200);
  if (dbSessions.length > 0) return dbSessions;
  const statusResult = getStatus();
  return statusResult.data?.sessions?.recent || [];
}

// ── Velocity tracking ─────────────────────────────────────────────────────────

function _computeSpendRate() {
  if (_costWindow.length < 2) return 0;
  const oldest = _costWindow[0];
  const newest = _costWindow[_costWindow.length - 1];
  const deltaMs = newest.ts - oldest.ts;
  if (deltaMs < 1000) return 0;
  const deltaCost = newest.cost - oldest.cost;
  if (deltaCost <= 0) return 0;
  return deltaCost / (deltaMs / 60_000); // $ per minute
}

function _projectDaily(spendRatePerMin) {
  if (!spendRatePerMin) return 0;
  const now = new Date();
  const minutesRemaining = 24 * 60 - (now.getHours() * 60 + now.getMinutes());
  return spendRatePerMin * minutesRemaining;
}

function _budgetHoursLeft(totalCost, spendRatePerMin) {
  const cfg = getConfig();
  const remaining = cfg.budgets.dailyUsd - totalCost;
  if (remaining <= 0) return 0;
  if (!spendRatePerMin) return Infinity;
  return remaining / spendRatePerMin / 60; // minutes → hours
}

// ── Budget status ─────────────────────────────────────────────────────────────

function _computeBudgetStatus(totalCost) {
  const daily = checkBudget(totalCost, 'daily');
  const monthly = checkBudget(totalCost, 'monthly');

  let level = 'ok';
  if (daily.pct >= 100) level = 'blocked';
  else if (daily.pct >= 95) level = 'critical';
  else if (daily.pct >= 80) level = 'warning';
  else if (daily.pct >= 50) level = 'info';

  return { daily, monthly, level };
}

// ── Threshold alerts ──────────────────────────────────────────────────────────

const THRESHOLDS = [
  { pct: 50, level: 'info',     msg: '50% of daily budget reached' },
  { pct: 80, level: 'warn',     msg: '80% of daily budget — warning' },
  { pct: 95, level: 'critical', msg: '95% of daily budget — confirmation required for new sessions' },
  { pct: 100, level: 'critical', msg: 'Daily budget exhausted — blocking new sessions' },
];

function _checkAlerts(totalCost, spendRate, budgetStatus, anomaly) {
  // Reset alert deduplication at day boundary
  const today = new Date().toDateString();
  if (today !== _alertDay) {
    _alertsSent.clear();
    _alertDay = today;
  }

  // Budget threshold alerts
  for (const t of THRESHOLDS) {
    const key = `budget-${t.pct}`;
    if (!_alertsSent.has(key) && budgetStatus.daily.pct >= t.pct) {
      _alertsSent.add(key);
      _broadcast('cost-events', {
        type: 'cost-alert',
        level: t.level,
        data: {
          threshold: t.pct,
          msg: t.msg,
          pct: budgetStatus.daily.pct,
          totalCost,
          limit: budgetStatus.daily.limit,
          ts: Date.now(),
        },
      });
    }
  }

  // Anomaly alert — re-arms after 5 minutes
  if (anomaly && !_alertsSent.has('anomaly')) {
    _alertsSent.add('anomaly');
    _broadcast('cost-events', {
      type: 'cost-alert',
      level: 'warn',
      data: {
        threshold: 'anomaly',
        msg: 'Spend rate >3x rolling average — possible token spiral',
        spendRate: Math.round(spendRate * 10000) / 10000,
        ts: Date.now(),
      },
    });
    // Re-arm after 5 minutes
    setTimeout(() => _alertsSent.delete('anomaly'), 5 * 60 * 1000);
  }
}

function _broadcast(room, payload) {
  if (_broadcastFn) {
    try { _broadcastFn(room, payload); } catch (_) {}
  }
}

// ── Attribution ───────────────────────────────────────────────────────────────

function _attributeCosts(sessions) {
  const byAttrib = {};
  for (const s of sessions) {
    // Try common attribute fields — session schema may vary
    const key = s.agent_id || s.agentId || s.skill_name || s.skillName || s.tool || 'unattributed';
    if (!byAttrib[key]) byAttrib[key] = { sessions: 0, cost: 0 };
    byAttrib[key].sessions++;
    byAttrib[key].cost += sessionCost(s);
  }
  return byAttrib;
}

// ── Public API ────────────────────────────────────────────────────────────────

function getCostSummary() {
  return _lastSummary;
}

function getSpendRate() {
  return _computeSpendRate();
}

function getBudgetStatus() {
  return _lastSummary?.budgetStatus ?? null;
}

module.exports = { init, getCostSummary, getSpendRate, getBudgetStatus };
