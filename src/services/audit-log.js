'use strict';

// Audit log service — records every recovery action.
// Primary store: SQLite table `audit_log` via better-sqlite3.
// Fallback: append-only JSON lines file (audit.jsonl) if SQLite unavailable.

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'audit.db');
const JSONL_PATH = path.join(DATA_DIR, 'audit.jsonl');

let _db = null;
let _usingSqlite = false;
let _initialized = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initSqlite() {
  try {
    ensureDataDir();
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        ts        TEXT    NOT NULL,
        operator  TEXT    NOT NULL DEFAULT 'operator',
        action    TEXT    NOT NULL,
        target    TEXT,
        before    TEXT,
        after     TEXT,
        ok        INTEGER NOT NULL DEFAULT 1,
        error_msg TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
    `);
    _db = db;
    _usingSqlite = true;
    return true;
  } catch (e) {
    _usingSqlite = false;
    return false;
  }
}

function init() {
  if (_initialized) return;
  _initialized = true;
  initSqlite();
}

// ── Write an audit entry ────────────────────────────────────────────────────

/**
 * Log a recovery action.
 * @param {object} entry
 * @param {string} entry.operator  - Who performed the action (default: 'operator')
 * @param {string} entry.action    - e.g. 'gateway-restart', 'agent-kill', 'session-clear'
 * @param {string} [entry.target]  - e.g. sessionId, PID
 * @param {any}    [entry.before]  - state before action
 * @param {any}    [entry.after]   - state after action
 * @param {boolean} [entry.ok]     - outcome (default true)
 * @param {string}  [entry.error]  - error message if ok=false
 */
function logAction(entry) {
  init();

  const record = {
    ts: new Date().toISOString(),
    operator: entry.operator || 'operator',
    action: entry.action,
    target: entry.target != null ? String(entry.target) : null,
    before: entry.before != null ? JSON.stringify(entry.before) : null,
    after: entry.after != null ? JSON.stringify(entry.after) : null,
    ok: entry.ok !== false ? 1 : 0,
    error_msg: entry.error || null,
  };

  if (_usingSqlite && _db) {
    try {
      _db.prepare(`
        INSERT INTO audit_log (ts, operator, action, target, before, after, ok, error_msg)
        VALUES (@ts, @operator, @action, @target, @before, @after, @ok, @error_msg)
      `).run(record);
      return;
    } catch (e) {
      // fall through to JSONL
    }
  }

  // JSONL fallback
  try {
    ensureDataDir();
    const line = JSON.stringify({
      ts: record.ts,
      operator: record.operator,
      action: record.action,
      target: record.target,
      before: record.before ? JSON.parse(record.before) : undefined,
      after: record.after ? JSON.parse(record.after) : undefined,
      ok: record.ok === 1,
      error: record.error_msg,
    }) + '\n';
    fs.appendFileSync(JSONL_PATH, line, 'utf8');
  } catch (_) {
    // swallow — logging must never crash the server
  }
}

// ── Read recent entries ─────────────────────────────────────────────────────

/**
 * Return the N most recent audit entries, newest first.
 * @param {number} limit  max rows (default 100)
 */
function getRecentActions(limit = 100) {
  init();
  const n = Math.max(1, Math.min(Number(limit) || 100, 500));

  if (_usingSqlite && _db) {
    try {
      const rows = _db.prepare(
        'SELECT * FROM audit_log ORDER BY id DESC LIMIT ?'
      ).all(n);
      return rows.map(r => ({
        id: r.id,
        ts: r.ts,
        operator: r.operator,
        action: r.action,
        target: r.target,
        before: r.before ? (() => { try { return JSON.parse(r.before); } catch { return r.before; } })() : null,
        after: r.after ? (() => { try { return JSON.parse(r.after); } catch { return r.after; } })() : null,
        ok: r.ok === 1,
        error: r.error_msg || null,
      }));
    } catch (e) {
      // fall through
    }
  }

  // JSONL fallback — read tail of file
  try {
    if (!fs.existsSync(JSONL_PATH)) return [];
    const lines = fs.readFileSync(JSONL_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    return lines.slice(-n).reverse();
  } catch (_) {
    return [];
  }
}

/**
 * Storage backend currently in use.
 */
function getStatus() {
  init();
  return {
    backend: _usingSqlite ? 'sqlite' : 'jsonl',
    path: _usingSqlite ? DB_PATH : JSONL_PATH,
  };
}


/**
 * Query audit log with filters.
 * @param {{ from?: number, to?: number, limit?: number }} opts
 */
function query(opts = {}) {
  const { from = 0, to = Date.now(), limit = 1000 } = opts;
  if (!_db) return [];
  try {
    return _db.prepare(
      'SELECT * FROM audit_log WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp DESC LIMIT ?'
    ).all(from, to, limit);
  } catch {
    return _jsonlFallback.slice(-limit).filter(e => e.timestamp >= from && e.timestamp <= to);
  }
}

module.exports = { logAction, getRecentActions, getStatus, query, init };
