'use strict';

// R2.1.1 — Event Store (SQLite, WAL mode, append-only)
// Separate DB from sessions.db for performance isolation.

const path = require('path');
const Database = require('better-sqlite3');
const { getConfig } = require('../config');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'events.db');

let db = null;

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id      TEXT    NOT NULL,
  span_id       TEXT    NOT NULL,
  parent_span_id TEXT,
  surface       TEXT    NOT NULL CHECK(surface IN ('cognitive','operational','contextual')),
  event_type    TEXT    NOT NULL,
  timestamp     INTEGER NOT NULL,
  agent_id      TEXT,
  model         TEXT,
  data          TEXT    NOT NULL DEFAULT '{}',
  duration_ms   INTEGER,
  status        TEXT    DEFAULT 'success'
);

CREATE INDEX IF NOT EXISTS idx_events_trace   ON events(trace_id);
CREATE INDEX IF NOT EXISTS idx_events_surface ON events(surface);
CREATE INDEX IF NOT EXISTS idx_events_type    ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_agent   ON events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_ts      ON events(timestamp);
`;

// ── Prepared statements (set after init) ─────────────────────────────────────

let stmtInsert        = null;
let stmtByTrace       = null;
let stmtRecent        = null;
let stmtDeleteOlderThan = null;

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Open the events DB and apply schema. Idempotent.
 */
function init() {
  if (db) return; // already initialised
  db = new Database(DB_PATH);
  db.exec(SCHEMA);

  // Prepare reusable statements
  stmtInsert = db.prepare(`
    INSERT INTO events
      (trace_id, span_id, parent_span_id, surface, event_type,
       timestamp, agent_id, model, data, duration_ms, status)
    VALUES
      (@trace_id, @span_id, @parent_span_id, @surface, @event_type,
       @timestamp, @agent_id, @model, @data, @duration_ms, @status)
  `);

  stmtByTrace = db.prepare(`
    SELECT * FROM events WHERE trace_id = ? ORDER BY timestamp ASC
  `);

  stmtRecent = db.prepare(`
    SELECT * FROM events ORDER BY timestamp DESC LIMIT ?
  `);

  stmtDeleteOlderThan = db.prepare(`
    DELETE FROM events WHERE timestamp < ?
  `);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Append a single event to the store.
 * Caller should have already validated via event-types.validateEvent().
 *
 * @param {object} event
 * @returns {number} inserted row id
 */
function writeEvent(event) {
  if (!db) init();
  const row = {
    trace_id:       event.trace_id,
    span_id:        event.span_id,
    parent_span_id: event.parent_span_id || null,
    surface:        event.surface,
    event_type:     event.event_type,
    timestamp:      event.timestamp,
    agent_id:       event.agent_id || null,
    model:          event.model    || null,
    data:           typeof event.data === 'object' ? JSON.stringify(event.data) : (event.data || '{}'),
    duration_ms:    event.duration_ms ?? null,
    status:         event.status || 'success',
  };
  const result = stmtInsert.run(row);
  return result.lastInsertRowid;
}

// ── Read helpers ──────────────────────────────────────────────────────────────

function _deserialize(rows) {
  return rows.map(r => ({
    ...r,
    data: (() => { try { return JSON.parse(r.data); } catch { return {}; } })(),
  }));
}

/**
 * All events for a trace, oldest-first.
 * @param {string} traceId
 * @returns {object[]}
 */
function getEventsByTrace(traceId) {
  if (!db) init();
  return _deserialize(stmtByTrace.all(traceId));
}

/**
 * Recent events across all traces, newest-first.
 * @param {number} limit
 * @returns {object[]}
 */
function getRecentEvents(limit = 100) {
  if (!db) init();
  return _deserialize(stmtRecent.all(Math.min(limit, 1000)));
}

/**
 * Flexible query with optional filters + pagination.
 *
 * @param {object} filters
 * @param {string}  [filters.surface]
 * @param {string}  [filters.event_type]
 * @param {string}  [filters.agent_id]
 * @param {string}  [filters.trace_id]
 * @param {number}  [filters.from]     — Unix ms
 * @param {number}  [filters.to]       — Unix ms
 * @param {string}  [filters.search]   — substring match against data JSON
 * @param {number}  [filters.limit=50]
 * @param {number}  [filters.offset=0]
 * @returns {object[]}
 */
function queryEvents(filters = {}) {
  if (!db) init();

  const conditions = [];
  const params     = [];

  if (filters.surface)    { conditions.push('surface = ?');    params.push(filters.surface); }
  if (filters.event_type) { conditions.push('event_type = ?'); params.push(filters.event_type); }
  if (filters.agent_id)   { conditions.push('agent_id = ?');   params.push(filters.agent_id); }
  if (filters.trace_id)   { conditions.push('trace_id = ?');   params.push(filters.trace_id); }
  if (filters.from)       { conditions.push('timestamp >= ?'); params.push(Number(filters.from)); }
  if (filters.to)         { conditions.push('timestamp <= ?'); params.push(Number(filters.to)); }
  if (filters.search) {
    conditions.push('data LIKE ?');
    params.push(`%${filters.search.replace(/[%_]/g, c => '\\' + c)}%`);
  }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit  = Math.min(Number(filters.limit)  || 50,  1000);
  const offset = Math.max(Number(filters.offset) || 0,   0);

  const sql  = `SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  const rows = db.prepare(sql).all(...params, limit, offset);
  return _deserialize(rows);
}

// ── Retention pruning ─────────────────────────────────────────────────────────

/**
 * Delete events older than retention.days from config.
 * @returns {number} rows deleted
 */
function pruneOldEvents() {
  if (!db) init();
  const cfg        = getConfig();
  const days       = (cfg.retention && cfg.retention.days) || 30;
  const cutoffMs   = Date.now() - days * 24 * 60 * 60 * 1000;
  const result     = stmtDeleteOlderThan.run(cutoffMs);
  return result.changes;
}

// ── Periodic pruning task ────────────────────────────────────────────────────

const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
let pruneTimer = null;

/**
 * Start the background retention pruning loop.
 * Safe to call multiple times (no-op if already running).
 */
function startPruning() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    try {
      const deleted = pruneOldEvents();
      if (deleted > 0) {
        process.stderr.write(JSON.stringify({
          level: 'info', ts: new Date().toISOString(),
          msg: 'event-store pruned', deleted,
        }) + '\n');
      }
    } catch (err) {
      process.stderr.write(JSON.stringify({
        level: 'warn', ts: new Date().toISOString(),
        msg: 'event-store prune failed', err: err.message,
      }) + '\n');
    }
  }, PRUNE_INTERVAL_MS);
  pruneTimer.unref(); // don't block process exit
}

// ── Stats ────────────────────────────────────────────────────────────────────

/**
 * Count events total and by surface. Useful for health/debug.
 * @returns {{ total: number, bySurface: object }}
 */
function getStats() {
  if (!db) init();
  const total     = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  const bySurface = db.prepare(`
    SELECT surface, COUNT(*) AS n FROM events GROUP BY surface
  `).all().reduce((acc, r) => { acc[r.surface] = r.n; return acc; }, {});
  return { total, bySurface };
}

// ── Close ────────────────────────────────────────────────────────────────────

function close() {
  if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = null; }
  if (db) { db.close(); db = null; }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  init,
  writeEvent,
  getEventsByTrace,
  getRecentEvents,
  queryEvents,
  pruneOldEvents,
  startPruning,
  getStats,
  close,
};
