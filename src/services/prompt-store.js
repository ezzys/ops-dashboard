'use strict';

// R3.1.1 — Prompt Store (SQLite, append-only versioning)
// Uses the same events.db for colocation, creating prompt_versions table.

const { getDb: _getSharedDb } = require('./db');

let _schemaApplied = false;

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS prompt_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_key  TEXT    NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  content     TEXT    NOT NULL,
  description TEXT,
  created_at  INTEGER NOT NULL,
  is_active   INTEGER DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_active
  ON prompt_versions(prompt_key, is_active)
  WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS idx_prompt_key ON prompt_versions(prompt_key);
`;

// ── Lazy init ─────────────────────────────────────────────────────────────────

function getDb() {
  const db = _getSharedDb();
  if (!_schemaApplied) {
    db.exec(SCHEMA);
    _schemaApplied = true;
  }
  return db;
}

// ── Write ops ─────────────────────────────────────────────────────────────────

/**
 * Save a new prompt version. Deactivates any current active version for the key,
 * then inserts a new active version with version = max(existing) + 1.
 *
 * @param {string} key
 * @param {string} content
 * @param {string} [description]
 * @returns {{ id: number, version: number }}
 */
function savePrompt(key, content, description = '') {
  const d = getDb();

  const save = d.transaction(() => {
    // Determine next version number
    const row = d.prepare('SELECT MAX(version) AS v FROM prompt_versions WHERE prompt_key = ?').get(key);
    const nextVersion = (row && row.v != null ? row.v : 0) + 1;

    // Deactivate existing active version
    d.prepare('UPDATE prompt_versions SET is_active = 0 WHERE prompt_key = ? AND is_active = 1').run(key);

    // Insert new version
    const result = d.prepare(`
      INSERT INTO prompt_versions (prompt_key, version, content, description, created_at, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(key, nextVersion, content, description || '', Date.now());

    return { id: result.lastInsertRowid, version: nextVersion };
  });

  return save();
}

/**
 * Get the currently active version for a key.
 * @param {string} key
 * @returns {object|null}
 */
function getActivePrompt(key) {
  return getDb().prepare(
    'SELECT * FROM prompt_versions WHERE prompt_key = ? AND is_active = 1'
  ).get(key) || null;
}

/**
 * List all distinct prompt keys with their active version metadata.
 * @returns {object[]}
 */
function listPrompts() {
  return getDb().prepare(`
    SELECT prompt_key, version, description, created_at, id
    FROM prompt_versions
    WHERE is_active = 1
    ORDER BY prompt_key ASC
  `).all();
}

/**
 * Full version history for a key, newest first.
 * @param {string} key
 * @returns {object[]}
 */
function getPromptHistory(key) {
  return getDb().prepare(`
    SELECT id, prompt_key, version, description, created_at, is_active,
           SUBSTR(content, 1, 200) AS content_preview,
           LENGTH(content) AS content_length
    FROM prompt_versions
    WHERE prompt_key = ?
    ORDER BY version DESC
  `).all(key);
}

/**
 * Get a specific version (full content).
 * @param {string} key
 * @param {number} version
 * @returns {object|null}
 */
function getPromptVersion(key, version) {
  return getDb().prepare(
    'SELECT * FROM prompt_versions WHERE prompt_key = ? AND version = ?'
  ).get(key, version) || null;
}

/**
 * Activate a specific version of a prompt key.
 * Deactivates the current active version first.
 *
 * @param {string} key
 * @param {number} version
 * @returns {{ ok: boolean, error?: string }}
 */
function activatePrompt(key, version) {
  const d = getDb();

  const activate = d.transaction(() => {
    const target = d.prepare(
      'SELECT * FROM prompt_versions WHERE prompt_key = ? AND version = ?'
    ).get(key, version);

    if (!target) return { ok: false, error: `Version ${version} not found for key "${key}"` };
    if (target.is_active) return { ok: true }; // already active

    d.prepare('UPDATE prompt_versions SET is_active = 0 WHERE prompt_key = ? AND is_active = 1').run(key);
    d.prepare('UPDATE prompt_versions SET is_active = 1 WHERE id = ?').run(target.id);
    return { ok: true };
  });

  return activate();
}

/**
 * Rollback to the previous version (version = current - 1).
 * @param {string} key
 * @returns {{ ok: boolean, version?: number, error?: string }}
 */
function rollbackPrompt(key) {
  const d = getDb();

  const rollback = d.transaction(() => {
    const current = d.prepare(
      'SELECT * FROM prompt_versions WHERE prompt_key = ? AND is_active = 1'
    ).get(key);

    if (!current) return { ok: false, error: `No active version for key "${key}"` };
    if (current.version <= 1) return { ok: false, error: 'Already at version 1, cannot roll back further' };

    const prev = d.prepare(
      'SELECT * FROM prompt_versions WHERE prompt_key = ? AND version = ?'
    ).get(key, current.version - 1);

    if (!prev) return { ok: false, error: `Previous version ${current.version - 1} not found` };

    d.prepare('UPDATE prompt_versions SET is_active = 0 WHERE id = ?').run(current.id);
    d.prepare('UPDATE prompt_versions SET is_active = 1 WHERE id = ?').run(prev.id);
    return { ok: true, version: prev.version };
  });

  return rollback();
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  savePrompt,
  getActivePrompt,
  listPrompts,
  getPromptHistory,
  getPromptVersion,
  activatePrompt,
  rollbackPrompt,
};
