'use strict';

// R3.2.1 — Agent Config Store (SQLite-backed)
// Stores agent configurations: model, temperature, max_tokens, system_prompt, tools, constraints.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'events.db');

let db = null;

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_configs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT DEFAULT '',
  model        TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  temperature  REAL DEFAULT 0.7,
  max_tokens   INTEGER DEFAULT 4096,
  system_prompt TEXT DEFAULT '',
  tools        TEXT DEFAULT '[]',
  constraints  TEXT DEFAULT '{}',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  started_at   INTEGER,
  ended_at     INTEGER,
  input        TEXT DEFAULT '{}',
  output       TEXT DEFAULT '{}',
  error        TEXT,
  FOREIGN KEY (agent_id) REFERENCES agent_configs(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions(status);
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return `ag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sessionUid() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function getDb() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.exec(SCHEMA);
  return db;
}

function _deserializeConfig(row) {
  if (!row) return null;
  return {
    ...row,
    tools:       JSON.parse(row.tools       || '[]'),
    constraints: JSON.parse(row.constraints || '{}'),
  };
}

function _deserializeSession(row) {
  if (!row) return null;
  return {
    ...row,
    input:  JSON.parse(row.input  || '{}'),
    output: JSON.parse(row.output || '{}'),
  };
}

// ── Agent Config CRUD ─────────────────────────────────────────────────────────

/**
 * List all agent configs.
 * @returns {object[]}
 */
function listAgents() {
  return getDb().prepare('SELECT * FROM agent_configs ORDER BY name ASC').all()
    .map(_deserializeConfig);
}

/**
 * Get a single agent config by id.
 * @param {string} id
 * @returns {object|null}
 */
function getAgent(id) {
  return _deserializeConfig(
    getDb().prepare('SELECT * FROM agent_configs WHERE id = ?').get(id)
  );
}

/**
 * Create a new agent config.
 * @param {object} cfg
 * @returns {object} created config
 */
function createAgent(cfg) {
  const d = getDb();
  const now = Date.now();
  const id = cfg.id || uid();

  d.prepare(`
    INSERT INTO agent_configs (id, name, description, model, temperature, max_tokens, system_prompt, tools, constraints, created_at, updated_at)
    VALUES (@id, @name, @description, @model, @temperature, @max_tokens, @system_prompt, @tools, @constraints, @created_at, @updated_at)
  `).run({
    id,
    name:          cfg.name,
    description:   cfg.description   || '',
    model:         cfg.model         || 'claude-sonnet-4-6',
    temperature:   cfg.temperature   ?? 0.7,
    max_tokens:    cfg.max_tokens    ?? 4096,
    system_prompt: cfg.system_prompt || '',
    tools:         JSON.stringify(cfg.tools       || []),
    constraints:   JSON.stringify(cfg.constraints || {}),
    created_at:    now,
    updated_at:    now,
  });

  return getAgent(id);
}

/**
 * Update an existing agent config. Only updates provided fields.
 * @param {string} id
 * @param {object} updates
 * @returns {object|null} updated config, or null if not found
 */
function updateAgent(id, updates) {
  const d = getDb();
  const existing = getAgent(id);
  if (!existing) return null;

  const now = Date.now();
  const merged = {
    name:          updates.name          ?? existing.name,
    description:   updates.description   ?? existing.description,
    model:         updates.model         ?? existing.model,
    temperature:   updates.temperature   ?? existing.temperature,
    max_tokens:    updates.max_tokens    ?? existing.max_tokens,
    system_prompt: updates.system_prompt ?? existing.system_prompt,
    tools:         JSON.stringify(updates.tools       ?? existing.tools),
    constraints:   JSON.stringify(updates.constraints ?? existing.constraints),
    updated_at:    now,
    id,
  };

  d.prepare(`
    UPDATE agent_configs
    SET name=@name, description=@description, model=@model, temperature=@temperature,
        max_tokens=@max_tokens, system_prompt=@system_prompt, tools=@tools,
        constraints=@constraints, updated_at=@updated_at
    WHERE id=@id
  `).run(merged);

  return getAgent(id);
}

/**
 * Delete an agent config (and its sessions).
 * @param {string} id
 * @returns {boolean}
 */
function deleteAgent(id) {
  const d = getDb();
  const del = d.transaction(() => {
    d.prepare('DELETE FROM agent_sessions WHERE agent_id = ?').run(id);
    const r = d.prepare('DELETE FROM agent_configs WHERE id = ?').run(id);
    return r.changes > 0;
  });
  return del();
}

// ── Session management ────────────────────────────────────────────────────────

/**
 * Create a new session record for an agent launch.
 * @param {string} agentId
 * @param {object} input
 * @returns {object} session
 */
function createSession(agentId, input = {}) {
  const d = getDb();
  const id = sessionUid();
  const now = Date.now();

  d.prepare(`
    INSERT INTO agent_sessions (id, agent_id, status, started_at, input)
    VALUES (?, ?, 'running', ?, ?)
  `).run(id, agentId, now, JSON.stringify(input));

  return _deserializeSession(d.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(id));
}

/**
 * Update a session's status and/or output.
 * @param {string} id
 * @param {object} updates — { status, output, error }
 */
function updateSession(id, updates) {
  const d = getDb();
  const fields = [];
  const params = {};

  if (updates.status !== undefined) { fields.push('status = @status'); params.status = updates.status; }
  if (updates.output !== undefined) { fields.push('output = @output'); params.output = JSON.stringify(updates.output); }
  if (updates.error  !== undefined) { fields.push('error = @error');   params.error  = updates.error; }
  if (updates.status === 'completed' || updates.status === 'failed') {
    fields.push('ended_at = @ended_at');
    params.ended_at = Date.now();
  }

  if (!fields.length) return;
  params.id = id;
  d.prepare(`UPDATE agent_sessions SET ${fields.join(', ')} WHERE id = @id`).run(params);
}

/**
 * List sessions for an agent, newest first.
 * @param {string} agentId
 * @param {number} [limit=20]
 * @returns {object[]}
 */
function listSessions(agentId, limit = 20) {
  return getDb().prepare(
    'SELECT * FROM agent_sessions WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?'
  ).all(agentId, limit).map(_deserializeSession);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  createSession,
  updateSession,
  listSessions,
};
