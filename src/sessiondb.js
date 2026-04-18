'use strict';

// Read-only access to OpenClaw's session SQLite database.
// Uses better-sqlite3 for synchronous, low-overhead reads.

const path = require('path');
const fs = require('fs');
const { getConfig } = require('./config');

let _db = null;
let _dbPath = null;
let _dbMissing = false;

// Candidate paths to search for the session DB
function candidatePaths() {
  const cfg = getConfig();
  return [
    cfg.paths?.sessionDb,
    '/Users/openclaw/.openclaw/data/sessions.db',
    '/Users/openclaw/.openclaw/sessions.db',
    path.join(process.env.HOME || '/Users/openclaw', '.openclaw', 'data', 'sessions.db'),
    path.join(process.env.HOME || '/Users/openclaw', '.openclaw', 'sessions.db'),
  ].filter(Boolean);
}

function findDbPath() {
  for (const p of candidatePaths()) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getDb() {
  if (_db) return _db;
  if (_dbMissing) return null;

  const dbPath = findDbPath();
  if (!dbPath) {
    _dbMissing = true;
    return null;
  }

  try {
    const Database = require('better-sqlite3');
    _db = new Database(dbPath, { readonly: true, fileMustExist: true });
    _dbPath = dbPath;
    return _db;
  } catch (e) {
    _dbMissing = true;
    return null;
  }
}

// ── Schema introspection ─────────────────────────────────────────────────────

function getTableNames() {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  } catch { return []; }
}

// Detect which column names exist in a table
function tableColumns(tableName) {
  const db = getDb();
  if (!db) return [];
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map(r => r.name);
  } catch { return []; }
}

// ── Session queries ──────────────────────────────────────────────────────────

/**
 * Get all sessions, most-recent first.
 * Returns [] if DB is unavailable or sessions table doesn't exist.
 */
function getSessions() {
  const db = getDb();
  if (!db) return [];
  try {
    const tables = getTableNames();
    const tbl = tables.find(t => t.toLowerCase().includes('session'));
    if (!tbl) return [];
    const cols = tableColumns(tbl);
    // Build a safe SELECT — we map whatever columns exist
    return db.prepare(`SELECT * FROM ${tbl} ORDER BY rowid DESC`).all();
  } catch (e) {
    return [];
  }
}

/**
 * Get a single session by id (tries common id column names).
 */
function getSessionById(id) {
  const db = getDb();
  if (!db) return null;
  try {
    const tables = getTableNames();
    const tbl = tables.find(t => t.toLowerCase().includes('session'));
    if (!tbl) return null;
    const cols = tableColumns(tbl);
    const idCol = cols.find(c => c === 'id') || cols.find(c => c.endsWith('_id')) || 'id';
    return db.prepare(`SELECT * FROM ${tbl} WHERE ${idCol} = ?`).get(id) || null;
  } catch { return null; }
}

/**
 * Get the N most recent sessions.
 * @param {number} limit
 */
function getRecentSessions(limit = 20) {
  const db = getDb();
  if (!db) return [];
  try {
    const tables = getTableNames();
    const tbl = tables.find(t => t.toLowerCase().includes('session'));
    if (!tbl) return [];
    return db.prepare(`SELECT * FROM ${tbl} ORDER BY rowid DESC LIMIT ?`).all(limit);
  } catch { return []; }
}

/**
 * Status summary — used for diagnostics.
 */
function getDbStatus() {
  const dbPath = _dbPath || findDbPath();
  const db = getDb();
  if (!db) return { available: false, path: dbPath || null, tables: [] };
  return {
    available: true,
    path: dbPath,
    tables: getTableNames(),
  };
}

module.exports = { getSessions, getSessionById, getRecentSessions, getDbStatus };
