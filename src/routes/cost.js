'use strict';

// R1.1 Cost Shield routes — budget tracking, aggregator summary, alert history.

const { aggregateUsage, checkBudget } = require('../services/cost-calculator');
const { getCostSummary, getSpendRate, getBudgetStatus } = require('../services/cost-aggregator');
const { getConfig } = require('../config');

async function routes(fastify) {
  // R1.1: Live cost summary from aggregator
  fastify.get('/api/cost/summary', async (req, reply) => {
    const summary = getCostSummary();
    if (!summary) {
      // Aggregator hasn't run yet — return budget stubs
      const cfg = getConfig();
      return {
        ok: true,
        ready: false,
        budgets: cfg.budgets,
        ts: Date.now(),
      };
    }
    return { ok: true, ready: true, ...summary };
  });

  // Budget snapshot: current spend vs daily/monthly limits
  fastify.get('/api/cost/budget', async (req, reply) => {
    const cfg = getConfig();
    const summary = getCostSummary();

    if (summary) {
      return {
        ok: true,
        cost: summary.totalCost,
        spendRate: summary.spendRate,
        projectedDaily: summary.projectedDaily,
        hoursLeft: isFinite(summary.hoursLeft) ? summary.hoursLeft : null,
        daily: summary.budgetStatus.daily,
        monthly: summary.budgetStatus.monthly,
        budgets: cfg.budgets,
        level: summary.budgetStatus.level,
        ts: summary.ts,
      };
    }

    // Fallback: use CLI data directly
    const { getStatus } = require('../services/openclaw');
    const statusResult = getStatus();
    const sessions = statusResult.data?.sessions?.recent || [];
    const { totals } = aggregateUsage(sessions);
    return {
      ok: true,
      cost: totals.cost,
      spendRate: 0,
      projectedDaily: 0,
      hoursLeft: null,
      daily: checkBudget(totals.cost, 'daily'),
      monthly: checkBudget(totals.cost, 'monthly'),
      budgets: cfg.budgets,
      level: 'ok',
      ts: Date.now(),
    };
  });

  // Cost events — note: real-time data comes via WebSocket room cost-events
  fastify.get('/api/cost/events', async (req, reply) => {
    const summary = getCostSummary();
    return {
      ok: true,
      note: 'Real-time updates: WebSocket room cost-events',
      snapshot: summary,
      ts: Date.now(),
    };
  });

  // Spend rate endpoint
  fastify.get('/api/cost/rate', async (req, reply) => {
    const rate = getSpendRate();
    const budgetStatus = getBudgetStatus();
    return { ok: true, spendRate: rate, budgetStatus, ts: Date.now() };
  });
}

module.exports = routes;
