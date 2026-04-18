'use strict';

// R4.1.4 — Cache hit rate tracking
// R4.2.2 — Latency comparison (P50/P95/P99)
// R4.2.4 — Cross-model comparison data

const store = require('../services/event-store');

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function modelAnalyticsRoutes(fastify) {

  // GET /api/intelligence/cache — cache hit/miss rate over time
  fastify.get('/api/intelligence/cache', async (req, reply) => {
    const windowMs = Number(req.query.windowMs) || 24 * 60 * 60 * 1000; // 24h default
    const since = Date.now() - windowMs;

    try {
      const hits   = store.queryEvents({ event_type: 'cache_hit',  limit: 50000 });
      const misses = store.queryEvents({ event_type: 'cache_miss', limit: 50000 });

      const recentHits   = hits.filter(e => e.timestamp >= since);
      const recentMisses = misses.filter(e => e.timestamp >= since);
      const total = recentHits.length + recentMisses.length;
      const hitRate = total > 0 ? (recentHits.length / total * 100).toFixed(2) : null;

      // Per-model breakdown
      const byModel = {};
      for (const e of [...recentHits, ...recentMisses]) {
        const m = e.model || e.data?.model || 'unknown';
        if (!byModel[m]) byModel[m] = { hits: 0, misses: 0 };
        if (e.event_type === 'cache_hit') byModel[m].hits++;
        else byModel[m].misses++;
      }
      for (const m of Object.keys(byModel)) {
        const t = byModel[m].hits + byModel[m].misses;
        byModel[m].rate = t > 0 ? (byModel[m].hits / t * 100).toFixed(2) : 0;
      }

      reply.send({ ok: true, windowMs, total, hits: recentHits.length, misses: recentMisses.length, hitRate, byModel });
    } catch {
      reply.send({ ok: true, windowMs, total: 0, hits: 0, misses: 0, hitRate: null, byModel: {} });
    }
  });

  // GET /api/intelligence/latency — P50/P95/P99 per model
  fastify.get('/api/intelligence/latency', async (req, reply) => {
    try {
      const events = store.queryEvents({ limit: 50000 });
      const withDuration = events.filter(e => e.duration_ms != null && e.duration_ms > 0);

      // Group by model
      const byModel = {};
      for (const e of withDuration) {
        const m = e.model || e.data?.model || 'unknown';
        if (!byModel[m]) byModel[m] = [];
        byModel[m].push(e.duration_ms);
      }

      const result = {};
      for (const [model, durations] of Object.entries(byModel)) {
        const sorted = durations.sort((a, b) => a - b);
        result[model] = {
          count:  sorted.length,
          p50:    percentile(sorted, 50),
          p95:    percentile(sorted, 95),
          p99:    percentile(sorted, 99),
          avg:    Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
          min:    sorted[0],
          max:    sorted[sorted.length - 1],
        };
      }

      reply.send({ ok: true, models: result });
    } catch {
      reply.send({ ok: true, models: {} });
    }
  });

  // GET /api/intelligence/models — cross-model comparison matrix
  fastify.get('/api/intelligence/models', async (req, reply) => {
    try {
      const events = store.queryEvents({ limit: 50000 });

      const byModel = {};
      for (const e of events) {
        const m = e.model || e.data?.model || 'unknown';
        if (!byModel[m]) byModel[m] = { total: 0, success: 0, error: 0, cost: 0, durations: [], tokens: { in: 0, out: 0 } };
        byModel[m].total++;
        if (e.status === 'error') byModel[m].error++;
        else byModel[m].success++;
        if (e.duration_ms) byModel[m].durations.push(e.duration_ms);
        if (e.data?.cost) byModel[m].cost += e.data.cost;
        if (e.data?.inputTokens)  byModel[m].tokens.in  += e.data.inputTokens;
        if (e.data?.outputTokens) byModel[m].tokens.out += e.data.outputTokens;
      }

      const matrix = {};
      for (const [model, d] of Object.entries(byModel)) {
        const sorted = d.durations.sort((a, b) => a - b);
        matrix[model] = {
          totalRequests:  d.total,
          successRate:    d.total > 0 ? (d.success / d.total * 100).toFixed(1) : 0,
          errorRate:      d.total > 0 ? (d.error / d.total * 100).toFixed(1) : 0,
          totalCost:      d.cost.toFixed(4),
          costPerRequest: d.total > 0 ? (d.cost / d.total).toFixed(6) : 0,
          avgLatencyMs:   sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0,
          p50LatencyMs:   percentile(sorted, 50),
          p95LatencyMs:   percentile(sorted, 95),
          totalTokensIn:  d.tokens.in,
          totalTokensOut: d.tokens.out,
          tokensPerRequest: d.total > 0 ? Math.round((d.tokens.in + d.tokens.out) / d.total) : 0,
        };
      }

      reply.send({ ok: true, models: matrix });
    } catch {
      reply.send({ ok: true, models: {} });
    }
  });
}

module.exports = modelAnalyticsRoutes;
