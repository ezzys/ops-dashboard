'use strict';

// R3.4.4 — Git Nexus routes

const {
  getCommits,
  getWorkingTreeChanges,
  getOpenPRs,
  getAttribution,
  getFileHeatmap,
} = require('../services/git-attribution');

async function routes(fastify) {

  // GET /api/git/log?limit=20 — recent commits with agent attribution
  fastify.get('/api/git/log', async (req, reply) => {
    try {
      const limit   = Math.min(Number(req.query.limit) || 20, 200);
      const commits = getCommits(limit);
      return reply.send({ ok: true, commits, total: commits.length, ts: Date.now() });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // GET /api/git/status — working tree changes (staged + unstaged)
  fastify.get('/api/git/status', async (req, reply) => {
    try {
      const data = getWorkingTreeChanges();
      return reply.send({ ok: true, ...data, ts: Date.now() });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // GET /api/git/prs — open PRs with agent attribution
  fastify.get('/api/git/prs', async (req, reply) => {
    try {
      const prs = getOpenPRs();
      return reply.send({ ok: true, prs, total: prs.length, ts: Date.now() });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });

  // GET /api/git/attribution — per-agent commit attribution + file heatmap
  fastify.get('/api/git/attribution', async (req, reply) => {
    try {
      const limit       = Math.min(Number(req.query.limit) || 100, 500);
      const attribution = getAttribution(limit);
      const heatmap     = getFileHeatmap(limit);
      return reply.send({ ok: true, attribution, heatmap, ts: Date.now() });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message });
    }
  });
}

module.exports = routes;
