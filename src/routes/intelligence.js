'use strict';

// R4 — Intelligence API Routes
// Exposes agent metrics, skill analytics, predictive alerts, and recommendations.

const agentIntelligence = require('../services/agent-intelligence');
const predictiveAlerts  = require('../services/predictive-alerts');
const { getRecentEvents } = require('../services/event-store');
const { getCostSummary } = require('../services/cost-aggregator');

async function routes(fastify) {

  // GET /api/intelligence — full bundle (cached)
  fastify.get('/api/intelligence', async (req, reply) => {
    try {
      const all         = agentIntelligence.getAll();
      const predictions = predictiveAlerts.getAllPredictions(all.agents, all.skills);
      return reply.send({ ok: true, ...all, predictions });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Intelligence unavailable' });
    }
  });

  // GET /api/intelligence/overview — lightweight summary for the overview tab
  fastify.get('/api/intelligence/overview', async (req, reply) => {
    try {
      const all         = agentIntelligence.getAll();
      const predictions = predictiveAlerts.getAllPredictions(all.agents, all.skills);
      const costSummary = getCostSummary();
      const recentEvents = getRecentEvents(10);

      const activeAgents = all.agents.filter(a => a.events_24h > 0).length;

      return reply.send({
        ok:           true,
        activeAgents,
        totalAgents:  all.agents.length,
        skillCount:   all.skills.length,
        alertCount:   predictions.alertCount,
        warnCount:    predictions.warnCount,
        totalCost:    costSummary?.totalCost      ?? 0,
        spendRate:    costSummary?.spendRate       ?? 0,
        budgetStatus: costSummary?.budgetStatus    ?? null,
        recentEvents,
        ts:           Date.now(),
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to compute overview' });
    }
  });

  // GET /api/intelligence/agents — agent leaderboard
  fastify.get('/api/intelligence/agents', async (req, reply) => {
    try {
      const leaderboard = agentIntelligence.getLeaderboard();
      return reply.send({ ok: true, count: leaderboard.length, agents: leaderboard });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to compute agent metrics' });
    }
  });

  // GET /api/intelligence/agents/:id — single agent metrics
  fastify.get('/api/intelligence/agents/:id', async (req, reply) => {
    try {
      const metrics = agentIntelligence.getAgentMetrics(req.params.id);
      if (!metrics) return reply.code(404).send({ ok: false, error: 'Agent not found in event store' });
      return reply.send({ ok: true, metrics });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get agent metrics' });
    }
  });

  // GET /api/intelligence/skills — skill usage analytics
  fastify.get('/api/intelligence/skills', async (req, reply) => {
    try {
      const skills = agentIntelligence.getSkillAnalytics();
      return reply.send({ ok: true, count: skills.length, skills });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to compute skill analytics' });
    }
  });

  // GET /api/intelligence/alerts — predictive alerts + forecast
  fastify.get('/api/intelligence/alerts', async (req, reply) => {
    try {
      const all         = agentIntelligence.getAll();
      const predictions = predictiveAlerts.getAllPredictions(all.agents, all.skills);
      return reply.send({ ok: true, ...predictions });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to compute predictions' });
    }
  });

  // GET /api/intelligence/recommendations — smart recommendations
  fastify.get('/api/intelligence/recommendations', async (req, reply) => {
    try {
      const all  = agentIntelligence.getAll();
      const recs = predictiveAlerts.getRecommendations(all.agents, all.skills);
      return reply.send({ ok: true, count: recs.length, recommendations: recs });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to compute recommendations' });
    }
  });
}

module.exports = routes;
