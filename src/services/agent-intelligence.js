'use strict';

// R4.1 — Agent Intelligence Service
// Computes per-agent performance metrics, skill usage analytics, and cost anomaly patterns.
// All metrics are derived from the event store — no external dependencies.

const { queryEvents } = require('./event-store');

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

// ── Time windows ──────────────────────────────────────────────────────────────

const NOW_MS   = () => Date.now();
const WIN_24H  = () => NOW_MS() - 24 * 60 * 60 * 1000;
const WIN_7D   = () => NOW_MS() -  7 * 24 * 60 * 60 * 1000;

// ── Agent Metrics ─────────────────────────────────────────────────────────────

function _computeSuccessRate(events) {
  const scored = events.filter(e => e.status === 'success' || e.status === 'error');
  if (scored.length === 0) return null;
  return scored.filter(e => e.status === 'success').length / scored.length;
}

function _computeAgentMetrics() {
  const from7d  = WIN_7D();
  const from24h = WIN_24H();

  // Pull up to 5000 recent events — covers a busy 7-day window
  const allEvents = queryEvents({ from: from7d, limit: 5000 });

  const agentMap = new Map();

  for (const evt of allEvents) {
    if (!evt.agent_id) continue;
    const id = evt.agent_id;

    if (!agentMap.has(id)) {
      agentMap.set(id, {
        agent_id:       id,
        events_24h:     [],
        events_7d:      [],
        tool_calls:     {},
        errors_7d:      0,
        total_dur_ms:   0,
        dur_count:      0,
        models:         {},
        last_seen:      0,
      });
    }

    const a = agentMap.get(id);
    a.events_7d.push(evt);
    if (evt.timestamp >= from24h) a.events_24h.push(evt);
    if (evt.timestamp > a.last_seen) a.last_seen = evt.timestamp;

    // Tool / skill usage
    if (evt.event_type === 'tool_selected' || evt.event_type === 'tool_call') {
      const name = evt.data?.tool || evt.data?.skill || evt.data?.name || 'unknown';
      a.tool_calls[name] = (a.tool_calls[name] || 0) + 1;
    }

    // Error tracking
    if (evt.status === 'error' || evt.event_type === 'error') a.errors_7d++;

    // Duration
    if (evt.duration_ms && evt.duration_ms > 0) {
      a.total_dur_ms += evt.duration_ms;
      a.dur_count++;
    }

    // Model usage
    if (evt.model) a.models[evt.model] = (a.models[evt.model] || 0) + 1;
  }

  const result = [];
  for (const [, a] of agentMap) {
    const total7d   = a.events_7d.length;
    const sr24h     = _computeSuccessRate(a.events_24h);
    const sr7d      = _computeSuccessRate(a.events_7d);
    const avgDurMs  = a.dur_count > 0 ? Math.round(a.total_dur_ms / a.dur_count) : null;

    const topTools  = Object.entries(a.tool_calls)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const primaryModel = Object.entries(a.models)
      .sort((x, y) => y[1] - x[1])[0]?.[0] || null;

    const isExpensive = primaryModel && (primaryModel.includes('opus') || primaryModel.includes('sonnet'));
    const isCheap     = primaryModel && primaryModel.includes('haiku');

    // Cost efficiency tier: cheap+high-sr = great, expensive+low-sr = poor
    let costEfficiency = 'unknown';
    const sr = sr24h ?? sr7d;
    if (sr !== null) {
      if (isCheap  && sr >= 0.90) costEfficiency = 'excellent';
      else if (sr >= 0.90)         costEfficiency = 'good';
      else if (sr >= 0.70)         costEfficiency = 'fair';
      else                          costEfficiency = 'poor';
    }

    result.push({
      agent_id:        a.agent_id,
      events_24h:      a.events_24h.length,
      events_7d:       total7d,
      success_rate_24h: sr24h,
      success_rate_7d:  sr7d,
      avg_duration_ms:  avgDurMs,
      top_tools:        topTools,
      primary_model:    primaryModel,
      error_count_24h:  a.events_24h.filter(e => e.status === 'error' || e.event_type === 'error').length,
      error_count_7d:   a.errors_7d,
      last_seen:        a.last_seen,
      cost_efficiency:  costEfficiency,
      model_is_cheap:   isCheap,
      model_is_expensive: isExpensive,
    });
  }

  return result;
}

// ── Skill Usage Analytics ─────────────────────────────────────────────────────

function _computeSkillAnalytics() {
  const from7d = WIN_7D();

  const selected = queryEvents({ event_type: 'tool_selected', from: from7d, limit: 2000 });
  const results  = queryEvents({ event_type: 'tool_result',   from: from7d, limit: 2000 });

  const skillMap = new Map();

  for (const evt of selected) {
    const name = evt.data?.tool || evt.data?.skill || evt.data?.name || 'unknown';
    if (!skillMap.has(name)) {
      skillMap.set(name, {
        name,
        uses:       0,
        successes:  0,
        errors:     0,
        dur_ms:     0,
        dur_count:  0,
        last_used:  0,
        agents:     new Set(),
      });
    }
    const s = skillMap.get(name);
    s.uses++;
    if (evt.timestamp > s.last_used) s.last_used = evt.timestamp;
    if (evt.agent_id) s.agents.add(evt.agent_id);
  }

  for (const evt of results) {
    const name = evt.data?.tool || evt.data?.skill || evt.data?.name || 'unknown';
    if (!skillMap.has(name)) continue;
    const s = skillMap.get(name);
    if (evt.status === 'error') s.errors++;
    else s.successes++;
    if (evt.duration_ms && evt.duration_ms > 0) {
      s.dur_ms += evt.duration_ms;
      s.dur_count++;
    }
  }

  const sevenDaysAgo = WIN_7D();
  return [...skillMap.values()]
    .map(s => ({
      name:           s.name,
      uses:           s.uses,
      success_rate:   (s.successes + s.errors) > 0 ? s.successes / (s.successes + s.errors) : null,
      avg_duration_ms: s.dur_count > 0 ? Math.round(s.dur_ms / s.dur_count) : null,
      last_used:      s.last_used,
      unique_agents:  s.agents.size,
      is_idle:        s.last_used < sevenDaysAgo,
    }))
    .sort((a, b) => b.uses - a.uses);
}

// ── Cost Anomaly Patterns ─────────────────────────────────────────────────────

function _computeCostAnomalyPatterns() {
  const from7d = WIN_7D();
  const events = queryEvents({ from: from7d, limit: 5000 });

  // Bucket by hour-of-day (0–23)
  const hourly = Array.from({ length: 24 }, () => ({ total: 0, days: new Set() }));

  for (const evt of events) {
    const d    = new Date(evt.timestamp);
    const hour = d.getHours();
    hourly[hour].total++;
    hourly[hour].days.add(d.toDateString());
  }

  const patterns = hourly.map((h, i) => ({
    hour:        i,
    avg_events:  h.days.size > 0 ? Math.round(h.total / h.days.size) : 0,
    total_events: h.total,
    sample_days: h.days.size,
  }));

  const sorted    = [...patterns].sort((a, b) => b.avg_events - a.avg_events);
  const peakHours = sorted.slice(0, 3).map(p => p.hour).sort((a, b) => a - b);

  return { patterns, peakHours };
}

// ── Cache management ──────────────────────────────────────────────────────────

function _refresh() {
  const agents  = _computeAgentMetrics();
  const skills  = _computeSkillAnalytics();
  const anomaly = _computeCostAnomalyPatterns();
  _cache = { agents, skills, anomaly, ts: Date.now() };
  _cacheTime = _cache.ts;
  return _cache;
}

function _getCache() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;
  return _refresh();
}

// ── Public API ─────────────────────────────────────────────────────────────────

function getAgentMetrics(agentId) {
  return _getCache().agents.find(a => a.agent_id === agentId) || null;
}

function getLeaderboard() {
  const { agents } = _getCache();
  return [...agents].sort((a, b) => {
    // Primary: success rate (24h preferred, fall back to 7d)
    const srA = a.success_rate_24h ?? a.success_rate_7d ?? 0;
    const srB = b.success_rate_24h ?? b.success_rate_7d ?? 0;
    if (Math.abs(srA - srB) > 0.01) return srB - srA;
    // Secondary: activity
    return b.events_24h - a.events_24h;
  });
}

function getSkillAnalytics() {
  return _getCache().skills;
}

function getCostAnomalyPatterns() {
  return _getCache().anomaly;
}

function getAll() {
  return _getCache();
}

module.exports = {
  getAgentMetrics,
  getLeaderboard,
  getSkillAnalytics,
  getCostAnomalyPatterns,
  getAll,
};
