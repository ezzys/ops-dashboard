'use strict';

// Phase 1 cost routes — budget tracking, daily/monthly summaries.
// Stubbed now; wired to real data in Phase 1 cost features.

const { getStatus } = require('../services/openclaw');
const { aggregateUsage, checkBudget } = require('../services/cost-calculator');
const { getConfig } = require('../config');

async function routes(fastify) {
  // Budget summary: current spend vs daily/monthly limits
  fastify.get('/api/cost/budget', async (req, reply) => {
    const cfg = getConfig();
    const statusResult = getStatus();
    const sessions = statusResult.data?.sessions?.recent || [];
    const { totals } = aggregateUsage(sessions);

    return {
      cost: totals.cost,
      daily: checkBudget(totals.cost, 'daily'),
      monthly: checkBudget(totals.cost, 'monthly'),
      budgets: cfg.budgets,
      ts: Date.now(),
    };
  });

  // Cost events — placeholder; Phase 1 will push via WebSocket
  fastify.get('/api/cost/events', async (req, reply) => {
    return { events: [], note: 'Phase 1 feature — use WebSocket room cost-events', ts: Date.now() };
  });
}

module.exports = routes;
