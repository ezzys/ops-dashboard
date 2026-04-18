'use strict';

// R3.1.5 — Agent mode indicators (autonomous vs guided)
// R3.2.4 — Skill failure analysis with last error + suggested fix
// R3.2.5 — Skill performance by agent (per-agent x skill success rate)

const store = require('../services/event-store');
const db    = require('../services/db');

function _ensureTable() {
  db.getDb().exec(`
    CREATE TABLE IF NOT EXISTS agent_modes (
      agent_id TEXT PRIMARY KEY,
      mode     TEXT NOT NULL DEFAULT 'autonomous' CHECK(mode IN ('autonomous','guided','supervised')),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
}

try { _ensureTable(); } catch { /* */ }

const FAILURE_SUGGESTIONS = {
  'timeout':          'Increase request timeout or check network connectivity',
  'rate_limit':       'Add exponential backoff or reduce request frequency',
  'auth_error':       'Check API key validity and permissions',
  'context_overflow': 'Reduce context window usage or increase model limit',
  'tool_error':       'Verify tool configuration and input parameters',
  'parse_error':      'Validate response format expectations',
  'default':          'Check agent logs for detailed error information',
};

function suggestFix(errorMessage) {
  if (!errorMessage) return FAILURE_SUGGESTIONS.default;
  const lower = errorMessage.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) return FAILURE_SUGGESTIONS.timeout;
  if (lower.includes('rate') || lower.includes('429') || lower.includes('limit')) return FAILURE_SUGGESTIONS.rate_limit;
  if (lower.includes('auth') || lower.includes('401') || lower.includes('403') || lower.includes('key')) return FAILURE_SUGGESTIONS.auth_error;
  if (lower.includes('context') || lower.includes('token') || lower.includes('overflow')) return FAILURE_SUGGESTIONS.context_overflow;
  if (lower.includes('tool') || lower.includes('function')) return FAILURE_SUGGESTIONS.tool_error;
  if (lower.includes('parse') || lower.includes('json') || lower.includes('syntax')) return FAILURE_SUGGESTIONS.parse_error;
  return FAILURE_SUGGESTIONS.default;
}

async function agentAnalyticsRoutes(fastify) {

  // GET /api/agents/modes — list all agent modes
  fastify.get('/api/agents/modes', async (req, reply) => {
    try {
      const rows = db.getDb().prepare('SELECT * FROM agent_modes').all();
      reply.send({ ok: true, modes: rows });
    } catch {
      reply.send({ ok: true, modes: [] });
    }
  });

  // PUT /api/agents/:id/mode — set agent mode
  fastify.put('/api/agents/:id/mode', {
    schema: {
      body: {
        type: 'object',
        required: ['mode'],
        properties: { mode: { type: 'string', enum: ['autonomous', 'guided', 'supervised'] } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const { mode } = req.body;
    db.getDb().prepare(
      'INSERT OR REPLACE INTO agent_modes (agent_id, mode, updated_at) VALUES (?, ?, ?)'
    ).run(id, mode, Date.now());
    reply.send({ ok: true, agent_id: id, mode });
  });

  // GET /api/skills/failures — skill failure analysis
  fastify.get('/api/skills/failures', async (req, reply) => {
    try {
      const errors = store.queryEvents({ event_type: 'error', limit: 5000 });
      const toolResults = store.queryEvents({ event_type: 'tool_result', limit: 5000 });

      // Group errors by tool/skill
      const bySkill = {};
      for (const e of errors) {
        const skill = e.data?.tool || e.data?.skill || e.data?.function || 'unknown';
        if (!bySkill[skill]) bySkill[skill] = { count: 0, lastError: null, lastFix: null, agents: new Set() };
        bySkill[skill].count++;
        if (!bySkill[skill].lastError || e.timestamp > bySkill[skill].lastError.ts) {
          bySkill[skill].lastError = { ts: e.timestamp, message: e.data?.error || e.data?.message || 'Unknown error' };
          bySkill[skill].lastFix = suggestFix(e.data?.error || e.data?.message);
        }
        if (e.agent_id) bySkill[skill].agents.add(e.agent_id);
      }

      // Convert sets to arrays
      const result = {};
      for (const [skill, data] of Object.entries(bySkill)) {
        result[skill] = { ...data, agents: [...data.agents] };
      }

      reply.send({ ok: true, failures: result });
    } catch {
      reply.send({ ok: true, failures: {} });
    }
  });

  // GET /api/skills/performance — per-agent x skill success rate
  fastify.get('/api/skills/performance', async (req, reply) => {
    try {
      const toolSelected = store.queryEvents({ event_type: 'tool_selected', limit: 50000 });
      const toolResult   = store.queryEvents({ event_type: 'tool_result',  limit: 50000 });

      // Build map: agent_id -> skill -> { attempts, successes, failures }
      const perf = {};
      for (const e of toolSelected) {
        const agent = e.agent_id || 'unknown';
        const skill = e.data?.tool || e.data?.skill || 'unknown';
        if (!perf[agent]) perf[agent] = {};
        if (!perf[agent][skill]) perf[agent][skill] = { attempts: 0, successes: 0, failures: 0, successRate: 0 };
        perf[agent][skill].attempts++;
      }

      for (const e of toolResult) {
        const agent = e.agent_id || 'unknown';
        const skill = e.data?.tool || e.data?.skill || 'unknown';
        if (perf[agent]?.[skill]) {
          if (e.status === 'error' || e.data?.error) perf[agent][skill].failures++;
          else perf[agent][skill].successes++;
          const t = perf[agent][skill].successes + perf[agent][skill].failures;
          perf[agent][skill].successRate = t > 0 ? (perf[agent][skill].successes / t * 100).toFixed(1) : 0;
        }
      }

      reply.send({ ok: true, performance: perf });
    } catch {
      reply.send({ ok: true, performance: {} });
    }
  });
}

module.exports = agentAnalyticsRoutes;
