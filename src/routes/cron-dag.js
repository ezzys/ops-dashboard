'use strict';

// R3.3.2 — Cron DAG API routes
// R3.3.3 — Status propagation

const { buildDAG, getDependencyOrder, detectCycles } = require('../services/cron-dag');

async function routes(fastify) {

  // GET /api/cron/dag — full DAG with nodes + edges
  fastify.get('/api/cron/dag', async (req, reply) => {
    try {
      const { nodes, adj, reverseAdj, jobs } = buildDAG();

      const nodeList = jobs.map(job => {
        const id = job.id || job.name;
        if (!id) return null;
        return {
          id,
          name:        job.name || id,
          enabled:     job.enabled !== false,
          schedule:    job.schedule,
          description: job.description || '',
          lastRun:     job.lastRun || job.last_run || null,
          nextRun:     job.nextRun || job.next_run || null,
          status:      job.status || 'unknown',
          deps:        adj.get(id) || [],
          downstream:  reverseAdj.get(id) || [],
        };
      }).filter(Boolean);

      const edges = [];
      for (const [from, deps] of adj) {
        for (const to of deps) {
          edges.push({ from, to, label: 'depends-on' });
        }
      }

      const { hasCycles, cycles } = detectCycles();

      return reply.send({
        ok:       true,
        nodes:    nodeList,
        edges,
        hasCycles,
        cycles,
        ts:       Date.now(),
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // GET /api/cron/dag/:jobId/dependencies — upstream deps for a job
  fastify.get('/api/cron/dag/:jobId/dependencies', async (req, reply) => {
    try {
      const { jobId } = req.params;
      // Basic validation — only allow safe job ID characters
      if (!/^[\w\-.@]+$/.test(jobId)) {
        return reply.code(400).send({ ok: false, error: 'Invalid job id' });
      }
      const { nodes, adj, reverseAdj } = buildDAG();
      if (!nodes.has(jobId)) {
        return reply.code(404).send({ ok: false, error: 'Job not found' });
      }
      return reply.send({
        ok:         true,
        jobId,
        upstream:   adj.get(jobId) || [],
        downstream: reverseAdj.get(jobId) || [],
        ts:         Date.now(),
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // GET /api/cron/dag/timeline — next 24h projected execution order
  fastify.get('/api/cron/dag/timeline', async (req, reply) => {
    try {
      const { nodes, adj } = buildDAG();
      const { order } = getDependencyOrder();
      const now     = Date.now();
      const horizon = now + 24 * 60 * 60 * 1000;

      const timeline = order.map((id, idx) => {
        const job = nodes.get(id);
        return {
          id,
          name:    job?.name || id,
          order:   idx,
          schedule: job?.schedule,
          nextRun: job?.nextRun || job?.next_run || null,
          deps:    adj.get(id) || [],
          enabled: job?.enabled !== false,
        };
      });

      // Include entries whose next run falls within the 24h window,
      // plus entries with unknown nextRun (show them anyway)
      const inWindow = timeline.filter(t => {
        if (!t.nextRun) return true;
        const ts = new Date(t.nextRun).getTime();
        return !isNaN(ts) && ts >= now && ts <= horizon;
      });

      return reply.send({
        ok:       true,
        timeline: inWindow,
        total:    timeline.length,
        ts:       Date.now(),
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // GET /api/cron/dag/status — propagation status (blocked jobs downstream of failures)
  fastify.get('/api/cron/dag/status', async (req, reply) => {
    try {
      const { nodes, reverseAdj } = buildDAG();
      const statusMap = {};

      for (const [id, job] of nodes) {
        statusMap[id] = job.status || (job.enabled === false ? 'disabled' : 'ok');
      }

      // BFS: mark all downstream jobs of failed ones as "blocked"
      const failed  = Object.keys(statusMap).filter(
        id => statusMap[id] === 'failed' || statusMap[id] === 'error'
      );
      const blocked = new Set();

      function markBlocked(id) {
        for (const ds of (reverseAdj.get(id) || [])) {
          if (!blocked.has(ds)) {
            blocked.add(ds);
            markBlocked(ds);
          }
        }
      }
      for (const id of failed) markBlocked(id);

      const propagated = {};
      for (const [id] of nodes) {
        propagated[id] = blocked.has(id) ? 'blocked' : statusMap[id];
      }

      return reply.send({
        ok:      true,
        status:  propagated,
        failed:  failed.length,
        blocked: blocked.size,
        ts:      Date.now(),
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });
}

module.exports = routes;
