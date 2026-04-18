'use strict';

// Recovery Console routes — all destructive actions require explicit confirmation
// and are audit-logged without exception.

const { spawn } = require('child_process');
const { getConfig } = require('../config');
const { spawnCli } = require('../services/openclaw');
const { logAction, getRecentActions } = require('../services/audit-log');

// ── Async spawn helper (awaitable, for gateway restart) ──────────────────────

function spawnAsync(node, cliArgs, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const proc = spawn(node, cliArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGTERM'); } catch (_) {}
        resolve({ ok: false, stdout, stderr: (stderr + '\nTimeout after ' + timeoutMs + 'ms').trim() });
      }
    }, timeoutMs);

    proc.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: code === 0, stdout, stderr: stderr.trim() });
      }
    });

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, stdout, stderr: err.message });
      }
    });
  });
}

// ── Route plugin ─────────────────────────────────────────────────────────────

async function routes(fastify) {

  // ── R1.2.1 Gateway restart ────────────────────────────────────────────────

  fastify.post('/api/recovery/gateway-restart', {
    schema: {
      body: {
        type: 'object',
        required: ['confirmed'],
        properties: {
          confirmed: { type: 'boolean', enum: [true] },
        },
      },
    },
  }, async (req, reply) => {
    if (!req.body.confirmed) {
      reply.code(400);
      return { ok: false, error: 'Confirmation required', code: 'CONFIRM_REQUIRED' };
    }

    const cfg = getConfig();
    const t0 = Date.now();

    let result;
    try {
      result = await spawnAsync(
        cfg.paths.openclawNode,
        [cfg.paths.openclawCli, 'gateway', 'restart'],
        30000
      );
    } catch (e) {
      result = { ok: false, stderr: e.message };
    }

    const duration = Date.now() - t0;

    logAction({
      operator: 'operator',
      action: 'gateway-restart',
      target: 'gateway',
      before: null,
      after: { duration },
      ok: result.ok,
      error: result.ok ? null : result.stderr,
    });

    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.stderr || 'Gateway restart failed', duration };
    }

    return { ok: true, duration };
  });

  // ── R1.2.2 Session clear (selective) ─────────────────────────────────────

  fastify.post('/api/recovery/session-clear', {
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

    // Validate sessionId — alphanumeric + hyphens only (no shell injection surface)
    if (!/^[\w\-.]+$/.test(sessionId)) {
      reply.code(400);
      return { ok: false, error: 'Invalid sessionId format', code: 'BAD_REQUEST' };
    }

    const result = spawnCli(['session', 'clear', '--id', sessionId], { timeout: 15000 });

    logAction({
      operator: 'operator',
      action: 'session-clear',
      target: sessionId,
      before: null,
      after: null,
      ok: result.ok,
      error: result.ok ? null : result.stderr,
    });

    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.stderr || 'Session clear failed', code: 'CLI_ERROR' };
    }

    return { ok: true, sessionId };
  });

  // ── R1.2.3 Agent kill by PID ──────────────────────────────────────────────

  fastify.post('/api/recovery/agent-kill', {
    schema: {
      body: {
        type: 'object',
        required: ['pid', 'confirmed'],
        properties: {
          pid: { type: 'integer', minimum: 2, maximum: 4194304 },
          confirmed: { type: 'boolean', enum: [true] },
        },
      },
    },
  }, async (req, reply) => {
    const { pid, confirmed } = req.body;

    if (!confirmed) {
      reply.code(400);
      return { ok: false, error: 'Confirmation required', code: 'CONFIRM_REQUIRED' };
    }

    // Safety: refuse to kill our own process or init (pid 1)
    if (pid === process.pid || pid === 1) {
      reply.code(400);
      return { ok: false, error: 'Cannot kill dashboard process or init', code: 'FORBIDDEN' };
    }

    let signalUsed;
    try {
      // Verify process exists before attempting kill
      process.kill(pid, 0);
    } catch (e) {
      logAction({
        operator: 'operator',
        action: 'agent-kill',
        target: String(pid),
        before: null,
        after: null,
        ok: false,
        error: 'Process not found: ' + e.message,
      });
      reply.code(404);
      return { ok: false, error: 'Process not found (pid ' + pid + ')', code: 'NOT_FOUND' };
    }

    try {
      process.kill(pid, 'SIGTERM');
      signalUsed = 'SIGTERM';

      // Schedule SIGKILL after 5s if process still alive
      setTimeout(() => {
        try {
          process.kill(pid, 0); // throws if already dead
          process.kill(pid, 'SIGKILL');
          logAction({
            operator: 'operator',
            action: 'agent-kill-escalate',
            target: String(pid),
            before: { signal: 'SIGTERM' },
            after: { signal: 'SIGKILL' },
            ok: true,
          });
        } catch (_) {
          // process already exited — expected path
        }
      }, 5000);

    } catch (e) {
      logAction({
        operator: 'operator',
        action: 'agent-kill',
        target: String(pid),
        before: null,
        after: null,
        ok: false,
        error: e.message,
      });
      reply.code(500);
      return { ok: false, error: e.message, code: 'KILL_FAILED' };
    }

    logAction({
      operator: 'operator',
      action: 'agent-kill',
      target: String(pid),
      before: null,
      after: { signal: signalUsed },
      ok: true,
    });

    return { ok: true, pid, signal: signalUsed };
  });

  // ── R1.2.4 Session clear all (nuclear) ───────────────────────────────────

  fastify.post('/api/recovery/session-clear-all', {
    schema: {
      body: {
        type: 'object',
        required: ['confirmation'],
        properties: {
          confirmation: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    if (req.body.confirmation !== 'CLEAR-ALL') {
      reply.code(400);
      return {
        ok: false,
        error: 'Exact confirmation string "CLEAR-ALL" required',
        code: 'CONFIRM_REQUIRED',
      };
    }

    const result = spawnCli(['session', 'clear', '--all'], { timeout: 30000 });

    logAction({
      operator: 'operator',
      action: 'session-clear-all',
      target: 'ALL',
      before: null,
      after: null,
      ok: result.ok,
      error: result.ok ? null : result.stderr,
    });

    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.stderr || 'Session clear-all failed', code: 'CLI_ERROR' };
    }

    return { ok: true };
  });

  // ── R1.2.5 Audit log read ─────────────────────────────────────────────────

  fastify.get('/api/recovery/audit', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);
    const entries = getRecentActions(limit);
    return { ok: true, entries, count: entries.length, ts: Date.now() };
  });
}

module.exports = routes;
