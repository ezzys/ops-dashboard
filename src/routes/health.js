'use strict';

const { spawnSync, execSync } = require('child_process');
const { getConfig } = require('../config');
const { circuitState } = require('../services/openclaw');
const eventIngest = require('../services/event-ingest');

async function routes(fastify) {
  const cfg = getConfig();

  // Unauthenticated basic health check
  fastify.get('/health', { config: { skipAuth: true } }, async (req, reply) => {
    return { ok: true, ts: Date.now() };
  });

  // R1.3.6 — Agent heartbeat endpoint
  fastify.post('/api/agents/:id/heartbeat', async (req, reply) => {
    const agentId = req.params.id;
    if (!agentId || typeof agentId !== 'string' || agentId.length > 128) {
      return reply.code(400).send({ ok: false, error: 'Invalid agent id' });
    }

    const result = eventIngest.ingestEvent({
      trace_id:   `hb_${agentId}`,
      span_id:    `hb_${Date.now().toString(36)}`,
      surface:    'operational',
      event_type: 'heartbeat',
      agent_id:   agentId,
      timestamp:  Date.now(),
      data:       { type: 'heartbeat' },
    });

    if (!result.ok) {
      return reply.code(500).send({ ok: false, error: result.error });
    }

    return { ok: true, id: result.id, agent_id: agentId, ts: Date.now() };
  });

  // R1.3.5 — Agent health grid data
  fastify.get('/api/health/agents', async (req, reply) => {
    const healthMonitor = require('../services/health-monitor');
    const summary = healthMonitor.getHealthSummary();
    if (!summary) {
      return {
        ok: true,
        agents: [],
        counts: { healthy: 0, warning: 0, stuck: 0, offline: 0 },
        ts: Date.now(),
      };
    }
    return { ok: true, ...summary };
  });

  // Authenticated detailed health check
  fastify.get('/health/detailed', async (req, reply) => {
    const checks = {};

    // CLI reachability
    try {
      const r = spawnSync(cfg.paths.openclawNode, [cfg.paths.openclawCli, '--version'], {
        timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      checks.cli = { ok: r.status === 0, version: (r.stdout || '').trim() };
    } catch (e) { checks.cli = { ok: false, error: e.message }; }

    // Gateway reachability
    try {
      const r = spawnSync('/usr/bin/curl', [
        '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '3', 'http://127.0.0.1:18789/health',
      ], { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      checks.gateway = { ok: r.stdout?.trim() === '200', statusCode: r.stdout?.trim() };
    } catch (e) { checks.gateway = { ok: false, error: e.message }; }

    // Disk space
    try {
      const df = execSync('/bin/df -k / | tail -1', { encoding: 'utf8' }).trim().split(/\s+/);
      const free = parseInt(df[3]) * 1024;
      checks.disk = { ok: free > 10 * 1024 * 1024 * 1024, freeGb: Math.round(free / 1024 / 1024 / 1024 * 10) / 10 };
    } catch (e) { checks.disk = { ok: false, error: e.message }; }

    // Memory pressure
    try {
      const mp = execSync('memory_pressure', { encoding: 'utf8', timeout: 5000 });
      checks.memory = { ok: !mp.includes('critical'), summary: mp.trim().split('\n')[0] };
    } catch { checks.memory = { ok: true, note: 'memory_pressure not available' }; }

    // Circuit breaker state
    checks.circuitBreaker = circuitState();

    return { ok: true, checks, ts: Date.now() };
  });
}

module.exports = routes;
