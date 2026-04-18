'use strict';

// R1.3 Agent Health Heartbeat Monitor
// Tracks agent activity from heartbeat events in the event store (falling back to session DB / CLI).
// Broadcasts health-update events to the 'health-events' WebSocket room every 30s.

const { getRecentSessions } = require('../sessiondb');
const { getStatus } = require('./openclaw');
const { queryEvents } = require('./event-store');
const { getConfig } = require('../config');

// ── State ─────────────────────────────────────────────────────────────────────

let _broadcastFn = null;
let _lastSummary = null;
let _intervalId = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Start the health monitor loop.
 * @param {function} broadcastFn — server's broadcast(room, payload)
 */
function init(broadcastFn) {
  _broadcastFn = broadcastFn;
  check(); // immediate first pass
  _intervalId = setInterval(check, 30_000);
}

// ── Health check cycle ────────────────────────────────────────────────────────

function check() {
  try {
    const cfg = getConfig();
    const agents = _buildAgentList(cfg);

    const counts = {
      healthy: agents.filter(a => a.status === 'healthy').length,
      warning: agents.filter(a => a.status === 'warning').length,
      stuck:   agents.filter(a => a.status === 'stuck').length,
      offline: agents.filter(a => a.status === 'offline').length,
    };

    _lastSummary = { ts: Date.now(), agents, counts };

    if (_broadcastFn) {
      _broadcastFn('health-events', { type: 'health-update', data: _lastSummary });
    }
  } catch (_) {
    // Health check errors must never crash the server
  }
}

// ── Agent list builder ────────────────────────────────────────────────────────

function _buildAgentList(cfg) {
  // Prefer heartbeat events from event store; fall back to session DB
  const heartbeats = _getAgentHeartbeats();
  if (heartbeats && heartbeats.length > 0) {
    return heartbeats.map(agent => {
      const status    = _computeStatus(agent.lastSeenMs, cfg);
      const ageMs     = agent.lastSeenMs ? Date.now() - agent.lastSeenMs : null;
      const lastSeen  = agent.lastSeenMs ? new Date(agent.lastSeenMs).toISOString() : null;
      const agentCfg  = cfg.agentHealth?.agents?.[agent.id] || {};
      const autoRestart = agentCfg.autoRestart ?? cfg.agentHealth?.mode ?? 'alert-only';
      return { ...agent, status, lastSeen, ageMs, autoRestart };
    });
  }

  const sessions = _getSessions();
  if (sessions.length === 0) return [];

  // Group sessions by agent identity — keep only the most recent entry per agent
  const agentMap = new Map();

  for (const s of sessions) {
    const id = s.agent_id || s.agentId || s.skill_name || s.skillName ||
               s.session_id || s.sessionId || s.id || 'agent-unknown';
    const name = s.agent_name || s.agentName || s.name || s.skill_name ||
                 s.skillName || String(id);

    // Extract last-activity timestamp from any plausible column
    const rawTs = s.last_activity || s.lastActivity || s.updated_at || s.updatedAt ||
                  s.last_seen || s.lastSeen || s.ts || s.created_at || s.createdAt;
    const lastSeenMs = rawTs ? new Date(rawTs).getTime() : null;

    // Context usage percentage
    const ctxUsed = s.context_tokens || s.contextTokens || s.input_tokens || s.inputTokens || 0;
    const ctxMax  = s.context_limit  || s.contextLimit  || 200_000;
    const contextPct = ctxMax > 0 ? Math.min(Math.round((ctxUsed / ctxMax) * 100), 100) : 0;

    const existing = agentMap.get(id);
    if (!existing || (lastSeenMs && lastSeenMs > (existing._lastSeenMs || 0))) {
      agentMap.set(id, { id, name, lastSeenMs, contextPct, _lastSeenMs: lastSeenMs || 0 });
    }
  }

  return Array.from(agentMap.values()).map(({ _lastSeenMs, ...agent }) => {
    const status   = _computeStatus(agent.lastSeenMs, cfg);
    const ageMs    = agent.lastSeenMs ? Date.now() - agent.lastSeenMs : null;
    const lastSeen = agent.lastSeenMs ? new Date(agent.lastSeenMs).toISOString() : null;
    const agentCfg = cfg.agentHealth?.agents?.[agent.id] || {};
    const autoRestart = agentCfg.autoRestart ?? cfg.agentHealth?.mode ?? 'alert-only';
    return { ...agent, status, lastSeen, ageMs, autoRestart };
  });
}

// ── Status computation ────────────────────────────────────────────────────────

/**
 * Derive health status from last-seen timestamp.
 *
 * Thresholds (from nexus-config.json):
 *   warnHeartbeatMs   — silence longer than this = warning       (default 120s)
 *   stuckMinutes      — silence longer than this = stuck         (default 5m)
 *   If no timestamp at all                       = offline
 */
function _computeStatus(lastSeenMs, cfg) {
  if (!lastSeenMs || isNaN(lastSeenMs)) return 'offline';
  const age    = Date.now() - lastSeenMs;
  const warnMs = cfg.thresholds?.warnHeartbeatMs ?? 120_000;
  const stuckMs = (cfg.thresholds?.stuckMinutes ?? 5) * 60_000;
  // Guard against clock drift or future timestamps
  if (age < 0) return 'healthy';
  if (age > stuckMs) return 'stuck';
  if (age > warnMs)  return 'warning';
  return 'healthy';
}

// ── Heartbeat source ──────────────────────────────────────────────────────────

/**
 * Build agent list from heartbeat events (primary) falling back to session DB.
 * Returns array of { id, name, lastSeenMs } objects.
 */
function _getAgentHeartbeats() {
  try {
    // Query last heartbeat per agent_id from event store
    const events = queryEvents({ event_type: 'heartbeat', limit: 500 });
    if (events.length > 0) {
      const agentMap = new Map();
      for (const e of events) {
        const id = e.agent_id || 'agent-unknown';
        if (!agentMap.has(id) || e.timestamp > agentMap.get(id).lastSeenMs) {
          agentMap.set(id, { id, name: id, lastSeenMs: e.timestamp, contextPct: 0 });
        }
      }
      return Array.from(agentMap.values());
    }
  } catch { /* fall through to legacy source */ }
  return null;
}

// ── Session source (legacy fallback) ─────────────────────────────────────────

function _getSessions() {
  const dbSessions = getRecentSessions(100);
  if (dbSessions.length > 0) return dbSessions;
  const statusResult = getStatus();
  return statusResult?.data?.sessions?.recent || [];
}

// ── Public API ────────────────────────────────────────────────────────────────

function getHealthSummary() {
  return _lastSummary;
}

function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = { init, check, getHealthSummary, stop };
