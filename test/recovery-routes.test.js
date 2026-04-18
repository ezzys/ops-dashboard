'use strict';

// Recovery route tests — schema validation and confirmation enforcement.
// Uses fastify.inject() so no real CLI/server port is needed.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');

// Stub out openclaw CLI so tests don't need a real binary
const Module = require('module');
const _origLoad = Module._load.bind(Module);
Module._load = function (request, parent, isMain) {
  if (request.endsWith('/services/openclaw') || request.endsWith('/services/openclaw.js')) {
    return {
      spawnCli: () => ({ ok: true, stdout: '{}', stderr: '', status: 0 }),
      jspawnCli: () => ({ ok: true, data: {} }),
      circuitState: () => ({ open: false, failCount: 0 }),
      setBroadcast: () => {},
    };
  }
  if (request.endsWith('/services/audit-log') || request.endsWith('/services/audit-log.js')) {
    return {
      logAction: () => {},
      getRecentActions: () => [],
    };
  }
  return _origLoad(request, parent, isMain);
};

async function buildApp() {
  const fastify = Fastify({ logger: false });
  // Register recovery routes
  fastify.register(require('../src/routes/recovery'));
  await fastify.ready();
  return fastify;
}

describe('POST /api/recovery/gateway-restart', () => {
  let app;
  before(async () => { app = await buildApp(); });
  after(async () => { await app.close(); });

  test('rejects missing body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery/gateway-restart',
      payload: {},
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.ok(body.ok === false || body.error || body.message);
  });

  test('rejects confirmed: false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery/gateway-restart',
      payload: { confirmed: false },
    });
    assert.equal(res.statusCode, 400);
  });

  test('rejects confirmed as string "true"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery/gateway-restart',
      payload: { confirmed: 'true' },
    });
    assert.ok(res.statusCode === 400 || res.statusCode === 500);
  });
});

describe('POST /api/recovery/session-clear', () => {
  let app;
  before(async () => { app = await buildApp(); });
  after(async () => { await app.close(); });

  test('rejects missing sessionId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery/session-clear',
      payload: { confirmed: true },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.ok(body.ok === false || body.error || body.message);
  });

  test('rejects missing confirmed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery/session-clear',
      payload: { sessionId: 'sess_abc123' },
    });
    assert.equal(res.statusCode, 400);
  });

  test('rejects empty sessionId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recovery/session-clear',
      payload: { sessionId: '', confirmed: true },
    });
    assert.equal(res.statusCode, 400);
  });
});
