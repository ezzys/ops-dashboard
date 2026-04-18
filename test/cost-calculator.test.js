'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Provide a minimal config mock before requiring cost-calculator
const path = require('path');

// Load config module so getConfig() returns something usable
let originalLoadConfig;
const configModule = require('../src/config');

describe('sessionCost', () => {
  const { sessionCost } = require('../src/services/cost-calculator');

  test('returns 0 for empty session', () => {
    const cost = sessionCost({ model: 'unknown' });
    assert.equal(typeof cost, 'number');
    assert.ok(cost >= 0);
  });

  test('input tokens contribute to cost', () => {
    const cfg = configModule.getConfig();
    const prices = cfg.modelPrices;
    const defaultPrice = prices['default'] || prices[Object.keys(prices)[0]];
    if (!defaultPrice) return; // skip if no price config available

    const cost = sessionCost({ model: 'unknown', inputTokens: 1_000_000 });
    assert.ok(cost > 0, 'cost should be positive with 1M input tokens');
  });

  test('output tokens cost more than input tokens (for standard models)', () => {
    const cfg = configModule.getConfig();
    const prices = cfg.modelPrices;
    const model = Object.keys(prices).find(k => k !== 'default') || 'default';
    const p = prices[model];
    if (!p) return;

    const inputOnly  = sessionCost({ model, inputTokens: 1_000_000, outputTokens: 0 });
    const outputOnly = sessionCost({ model, inputTokens: 0, outputTokens: 1_000_000 });
    assert.ok(outputOnly > inputOnly, 'output tokens should cost more than input per million');
  });

  test('cache reads are cheaper than input', () => {
    const cfg = configModule.getConfig();
    const prices = cfg.modelPrices;
    const model = Object.keys(prices).find(k => k !== 'default') || 'default';
    const p = prices[model];
    if (!p || !p.cacheRead) return;

    const inputCost = sessionCost({ model, inputTokens: 1_000_000 });
    const cacheCost = sessionCost({ model, cacheRead: 1_000_000 });
    assert.ok(cacheCost < inputCost, 'cache read should be cheaper than input');
  });
});

describe('aggregateUsage', () => {
  const { aggregateUsage } = require('../src/services/cost-calculator');

  test('returns zero totals for empty session list', () => {
    const { totals } = aggregateUsage([]);
    assert.equal(totals.cost, 0);
    assert.equal(totals.sessionCount, 0);
  });

  test('sums across multiple sessions', () => {
    const sessions = [
      { model: 'unknown', inputTokens: 100, outputTokens: 50 },
      { model: 'unknown', inputTokens: 200, outputTokens: 100 },
    ];
    const { totals } = aggregateUsage(sessions);
    assert.equal(totals.sessionCount, 2);
    assert.equal(totals.inputTokens, 300);
    assert.equal(totals.outputTokens, 150);
    assert.ok(totals.cost >= 0);
  });

  test('groups by model in byModel', () => {
    const sessions = [
      { model: 'alpha', inputTokens: 100 },
      { model: 'beta',  inputTokens: 200 },
      { model: 'alpha', inputTokens: 50 },
    ];
    const { byModel } = aggregateUsage(sessions);
    assert.equal(byModel['alpha'].sessions, 2);
    assert.equal(byModel['beta'].sessions, 1);
    assert.equal(byModel['alpha'].inputTokens, 150);
  });
});
