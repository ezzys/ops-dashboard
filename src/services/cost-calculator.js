'use strict';

const { getConfig } = require('../config');

/**
 * Calculate the USD cost for a session object.
 * Uses model prices from config.
 *
 * @param {object} session
 * @param {string} session.model
 * @param {number} [session.inputTokens]
 * @param {number} [session.outputTokens]
 * @param {number} [session.cacheRead]
 * @param {number} [session.cacheWrite]
 * @returns {number} cost in USD
 */
function sessionCost(session) {
  const cfg = getConfig();
  const prices = cfg.modelPrices;
  const m = prices[session.model] || prices['default'];
  const i = session.inputTokens || 0;
  const o = session.outputTokens || 0;
  const cr = session.cacheRead || 0;
  const cw = session.cacheWrite || 0;
  return (i / 1e6) * m.input
    + (o / 1e6) * m.output
    + (cr / 1e6) * m.cacheRead
    + (cw / 1e6) * m.cacheWrite;
}

/**
 * Aggregate model usage from a list of sessions.
 * Returns { byModel, totals }
 */
function aggregateUsage(sessions) {
  const byModel = {};
  let totalCost = 0;
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;

  for (const s of sessions) {
    const model = s.model || 'unknown';
    if (!byModel[model]) {
      byModel[model] = { sessions: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    }
    byModel[model].sessions++;
    byModel[model].inputTokens += s.inputTokens || 0;
    byModel[model].outputTokens += s.outputTokens || 0;
    byModel[model].cacheRead += s.cacheRead || 0;
    byModel[model].cacheWrite += s.cacheWrite || 0;
    const c = sessionCost(s);
    byModel[model].cost += c;
    totalCost += c;
    totalInput += s.inputTokens || 0;
    totalOutput += s.outputTokens || 0;
    totalCacheRead += s.cacheRead || 0;
    totalCacheWrite += s.cacheWrite || 0;
  }

  return {
    byModel,
    totals: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      cost: totalCost,
      sessionCount: sessions.length,
    },
  };
}

/**
 * Check whether a cost value breaches configured budget thresholds.
 * @param {number} cost — USD amount to check
 * @param {'daily'|'monthly'} period
 * @returns {{ ok: boolean, pct: number, limit: number }}
 */
function checkBudget(cost, period = 'daily') {
  const cfg = getConfig();
  const limit = period === 'monthly' ? cfg.budgets.monthlyUsd : cfg.budgets.dailyUsd;
  const pct = limit > 0 ? Math.round((cost / limit) * 100) : 0;
  return { ok: cost <= limit, pct, limit, cost };
}

module.exports = { sessionCost, aggregateUsage, checkBudget };
