'use strict';

// R3.2.2 — Agent orchestration routes
// R3.2.3 — Handoff protocol routes

const {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  createSession,
  listSessions,
} = require('../services/agent-config');

const {
  executeHandoff,
  listHandoffs,
  getHandoff,
} = require('../services/handoff');

// ── Agent config schema ───────────────────────────────────────────────────────

const AGENT_BODY_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name:          { type: 'string', minLength: 1, maxLength: 128 },
    description:   { type: 'string', maxLength: 1024 },
    model:         { type: 'string' },
    temperature:   { type: 'number', minimum: 0, maximum: 2 },
    max_tokens:    { type: 'integer', minimum: 1, maximum: 200000 },
    system_prompt: { type: 'string' },
    tools:         { type: 'array', items: { type: 'string' } },
    constraints:   { type: 'object' },
  },
};

// ── Route plugin ──────────────────────────────────────────────────────────────

async function routes(fastify) {

  // ── Agent configs ─────────────────────────────────────────────────────────

  // GET /api/agents — list all agent configs
  fastify.get('/api/agents', async (req, reply) => {
    try {
      return reply.send({ ok: true, agents: listAgents() });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to list agents' });
    }
  });

  // GET /api/agents/:id — get single agent config
  fastify.get('/api/agents/:id', async (req, reply) => {
    const agent = getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found' });
    return reply.send({ ok: true, agent });
  });

  // POST /api/agents — create agent config
  fastify.post('/api/agents', { schema: { body: AGENT_BODY_SCHEMA } }, async (req, reply) => {
    try {
      const agent = createAgent(req.body);
      return reply.code(201).send({ ok: true, agent });
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return reply.code(409).send({ ok: false, error: 'Agent id already exists' });
      }
      return reply.code(500).send({ ok: false, error: 'Failed to create agent' });
    }
  });

  // PUT /api/agents/:id — update agent config
  fastify.put('/api/agents/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const agent = updateAgent(id, req.body);
      if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found' });
      return reply.send({ ok: true, agent });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to update agent' });
    }
  });

  // DELETE /api/agents/:id — delete agent config
  fastify.delete('/api/agents/:id', async (req, reply) => {
    const { id } = req.params;
    try {
      const deleted = deleteAgent(id);
      if (!deleted) return reply.code(404).send({ ok: false, error: 'Agent not found' });
      return reply.send({ ok: true });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to delete agent' });
    }
  });

  // ── Agent launch ──────────────────────────────────────────────────────────

  // POST /api/agents/:id/launch — launch an agent session (stub)
  fastify.post('/api/agents/:id/launch', {
    schema: {
      body: {
        type: 'object',
        properties: {
          input:   { type: 'object' },
          message: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const agent  = getAgent(id);
    if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found' });

    try {
      const input   = req.body?.input || { message: req.body?.message };
      const session = createSession(id, input);

      // Stub: record the launch as a session. Real execution would invoke Claude API here.
      return reply.code(202).send({
        ok: true,
        session_id: session.id,
        agent_id:   id,
        status:     'running',
        message:    'Session created. Agent execution is async — poll /api/agents/:id/sessions for status.',
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to launch agent' });
    }
  });

  // GET /api/agents/:id/sessions — list sessions for an agent
  fastify.get('/api/agents/:id/sessions', async (req, reply) => {
    const { id } = req.params;
    const agent  = getAgent(id);
    if (!agent) return reply.code(404).send({ ok: false, error: 'Agent not found' });

    try {
      const limit    = Math.min(Number(req.query.limit) || 20, 100);
      const sessions = listSessions(id, limit);
      return reply.send({ ok: true, agent_id: id, sessions });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to list sessions' });
    }
  });

  // ── Handoff protocol ──────────────────────────────────────────────────────

  // GET /api/handoffs — list recent handoffs
  fastify.get('/api/handoffs', async (req, reply) => {
    try {
      const limit    = Math.min(Number(req.query.limit) || 50, 200);
      const handoffs = listHandoffs(limit);
      return reply.send({ ok: true, handoffs });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to list handoffs' });
    }
  });

  // GET /api/handoffs/:id — get handoff detail
  fastify.get('/api/handoffs/:id', async (req, reply) => {
    try {
      const handoff = getHandoff(req.params.id);
      if (!handoff) return reply.code(404).send({ ok: false, error: 'Handoff not found' });
      return reply.send({ ok: true, handoff });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get handoff' });
    }
  });

  // POST /api/handoffs — execute a handoff
  fastify.post('/api/handoffs', {
    schema: {
      body: {
        type: 'object',
        required: ['from_agent', 'to_agent', 'context_summary'],
        properties: {
          from_agent:      { type: 'string', minLength: 1 },
          to_agent:        { type: 'string', minLength: 1 },
          context_summary: { type: 'string', minLength: 1 },
          pending_tasks:   { type: 'array',  items: { type: 'string' } },
          artifacts:       { type: 'object' },
          trace_id:        { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const result = executeHandoff(req.body);
      return reply.code(201).send({ ok: true, ...result });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to execute handoff' });
    }
  });

  // Also support legacy path /api/handoff (singular) for spec compatibility
  fastify.post('/api/handoff', {
    schema: {
      body: {
        type: 'object',
        required: ['from_agent', 'to_agent', 'context_summary'],
        properties: {
          from_agent:      { type: 'string' },
          to_agent:        { type: 'string' },
          context_summary: { type: 'string' },
          pending_tasks:   { type: 'array', items: { type: 'string' } },
          artifacts:       { type: 'object' },
          trace_id:        { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const result = executeHandoff(req.body);
      return reply.code(201).send({ ok: true, ...result });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to execute handoff' });
    }
  });

  fastify.get('/api/handoff/:id', async (req, reply) => {
    try {
      const handoff = getHandoff(req.params.id);
      if (!handoff) return reply.code(404).send({ ok: false, error: 'Handoff not found' });
      return reply.send({ ok: true, handoff });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get handoff' });
    }
  });
}

module.exports = routes;
