'use strict';

// R1.4 HITL (Human-in-the-Loop) Intervention routes.
// All actions are audit-logged. Destructive actions require explicit confirmation.

const { spawnCli } = require('../services/openclaw');
const { logAction, getRecentActions } = require('../services/audit-log');

// Session ID validation — alphanumeric + hyphens/underscores/dots only (no shell injection)
const SESSION_ID_RE = /^[\w\-.]+$/;

function validateSessionId(id, reply) {
  if (!SESSION_ID_RE.test(id)) {
    reply.code(400);
    return false;
  }
  return true;
}

async function routes(fastify) {

  // ── R1.4.1 — Pause session ────────────────────────────────────────────────

  fastify.post('/api/intervention/pause', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'confirmed'],
        properties: {
          sessionId: { type: 'string', minLength: 1, maxLength: 128 },
          confirmed: { type: 'boolean', enum: [true] },
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, confirmed } = req.body;

    if (!confirmed) {
      reply.code(400);
      return { ok: false, error: 'Confirmation required', code: 'CONFIRM_REQUIRED' };
    }
    if (!validateSessionId(sessionId, reply)) {
      return { ok: false, error: 'Invalid sessionId format', code: 'BAD_REQUEST' };
    }

    const result = spawnCli(['session', 'pause', '--id', sessionId], { timeout: 15_000 });

    logAction({
      operator: 'operator',
      action: 'session-pause',
      target: sessionId,
      ok: result.ok,
      error: result.ok ? null : result.stderr,
    });

    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.stderr || 'Session pause failed', code: 'CLI_ERROR' };
    }
    return { ok: true, sessionId, action: 'paused' };
  });

  // ── R1.4.2 — Resume session ───────────────────────────────────────────────

  fastify.post('/api/intervention/resume', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'confirmed'],
        properties: {
          sessionId: { type: 'string', minLength: 1, maxLength: 128 },
          confirmed: { type: 'boolean', enum: [true] },
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, confirmed } = req.body;

    if (!confirmed) {
      reply.code(400);
      return { ok: false, error: 'Confirmation required', code: 'CONFIRM_REQUIRED' };
    }
    if (!validateSessionId(sessionId, reply)) {
      return { ok: false, error: 'Invalid sessionId format', code: 'BAD_REQUEST' };
    }

    const result = spawnCli(['session', 'resume', '--id', sessionId], { timeout: 15_000 });

    logAction({
      operator: 'operator',
      action: 'session-resume',
      target: sessionId,
      ok: result.ok,
      error: result.ok ? null : result.stderr,
    });

    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.stderr || 'Session resume failed', code: 'CLI_ERROR' };
    }
    return { ok: true, sessionId, action: 'resumed' };
  });

  // ── R1.4.3 — Inject message into running session ─────────────────────────

  fastify.post('/api/intervention/inject', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'message'],
        properties: {
          sessionId: { type: 'string', minLength: 1, maxLength: 128 },
          message:   { type: 'string', minLength: 1, maxLength: 4096 },
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, message } = req.body;

    if (!validateSessionId(sessionId, reply)) {
      return { ok: false, error: 'Invalid sessionId format', code: 'BAD_REQUEST' };
    }

    const result = spawnCli(
      ['session', 'inject', '--id', sessionId, '--message', message],
      { timeout: 30_000 }
    );

    logAction({
      operator: 'operator',
      action: 'session-inject',
      target: sessionId,
      after: { message: message.slice(0, 200) },
      ok: result.ok,
      error: result.ok ? null : result.stderr,
    });

    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.stderr || 'Message injection failed', code: 'CLI_ERROR' };
    }
    return { ok: true, sessionId, action: 'injected' };
  });

  // ── R1.4.4 — Terminate session (hard kill, typed confirmation) ────────────

  fastify.post('/api/intervention/terminate', {
    schema: {
      body: {
        type: 'object',
        required: ['sessionId', 'confirmation'],
        properties: {
          sessionId:    { type: 'string', minLength: 1, maxLength: 128 },
          confirmation: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { sessionId, confirmation } = req.body;

    if (!validateSessionId(sessionId, reply)) {
      return { ok: false, error: 'Invalid sessionId format', code: 'BAD_REQUEST' };
    }

    const required = `TERMINATE-${sessionId}`;
    if (confirmation !== required) {
      reply.code(400);
      return {
        ok: false,
        error: `Exact confirmation string "${required}" required`,
        code: 'CONFIRM_REQUIRED',
      };
    }

    const result = spawnCli(
      ['session', 'terminate', '--id', sessionId, '--force'],
      { timeout: 15_000 }
    );

    logAction({
      operator: 'operator',
      action: 'session-terminate',
      target: sessionId,
      after: { confirmation: required },
      ok: result.ok,
      error: result.ok ? null : result.stderr,
    });

    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.stderr || 'Session termination failed', code: 'CLI_ERROR' };
    }
    return { ok: true, sessionId, action: 'terminated' };
  });

  // ── R1.4.5 — Intervention audit log (filtered view) ──────────────────────

  fastify.get('/api/intervention/audit', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const INTERVENTION_ACTIONS = new Set([
      'session-pause', 'session-resume', 'session-inject', 'session-terminate',
    ]);
    const entries = getRecentActions(limit).filter(e => INTERVENTION_ACTIONS.has(e.action));
    return { ok: true, entries, count: entries.length, ts: Date.now() };
  });
}

module.exports = routes;
