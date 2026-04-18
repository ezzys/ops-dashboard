'use strict';

// Shared better-sqlite3 connection for all services.
// Single file, WAL mode, created once and reused.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'events.db');

let _db = null;

/**
 * Return the shared database connection, opening it on first call.
 * WAL mode and NORMAL synchronous are applied once on creation.
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = OFF');
  return _db;
}

/**
 * Close the shared connection (called on graceful shutdown).
 */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb };
