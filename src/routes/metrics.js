'use strict';

// R4.4.1 — Prometheus metrics export endpoint

const costAggregator    = require('../services/cost-aggregator');
const healthMonitor     = require('../services/health-monitor');
const agentIntelligence = require('../services/agent-intelligence');
const eventStore        = require('../services/event-store');

function formatMetric(name, type, help, samples) {
  let out = `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n`;
  for (const s of samples) {
    const labels = Object.entries(s.labels || {}).map(([k,v]) => `${k}="${String(v).replace(/"/g,'\\"')}"`).join(',');
    out += `${name}{${labels}} ${s.value}\n`;
  }
  return out;
}

async function metricsRoute(fastify) {
  // GET /metrics — Prometheus scrape target (no auth, standard path)
  fastify.get('/metrics', async (req, reply) => {
    const parts = [];

    // Cost metrics
    try {
      const summary = costAggregator.getCostSummary();
      const budget  = costAggregator.getBudgetStatus();
      parts.push(formatMetric('nexus_cost_total_usd', 'gauge', 'Total cost in USD', [
        { labels: { period: 'session' }, value: (summary.totalCost || 0).toFixed(6) },
      ]));
      parts.push(formatMetric('nexus_budget_daily_usd', 'gauge', 'Daily budget in USD', [
        { labels: {}, value: (budget.daily?.limit || 0).toFixed(2) },
      ]));
      parts.push(formatMetric('nexus_budget_daily_used_pct', 'gauge', 'Daily budget used percentage', [
        { labels: {}, value: (budget.daily?.pct || 0).toFixed(2) },
      ]));
      // Per-model
      if (summary.byModel) {
        const modelSamples = Object.entries(summary.byModel).map(([model, data]) => ({
          labels: { model }, value: (data.cost || 0).toFixed(6),
        }));
        parts.push(formatMetric('nexus_cost_by_model_usd', 'gauge', 'Cost per model in USD', modelSamples));
      }
    } catch { /* cost not available */ }

    // Agent health
    try {
      const agents = healthMonitor.getAgentStatus();
      const total = agents.length;
      const stuck = agents.filter(a => a.status === 'stuck').length;
      const healthy = agents.filter(a => a.status === 'healthy').length;
      parts.push(formatMetric('nexus_agents_total', 'gauge', 'Total agents seen', [
        { labels: {}, value: total },
      ]));
      parts.push(formatMetric('nexus_agents_stuck', 'gauge', 'Stuck agents', [
        { labels: {}, value: stuck },
      ]));
      parts.push(formatMetric('nexus_agents_healthy', 'gauge', 'Healthy agents', [
        { labels: {}, value: healthy },
      ]));
    } catch { /* health not available */ }

    // Event store
    try {
      const stats = eventStore.getStats();
      parts.push(formatMetric('nexus_events_total', 'gauge', 'Total events in store', [
        { labels: {}, value: stats.total || 0 },
      ]));
      if (stats.bySurface) {
        const surfSamples = Object.entries(stats.bySurface).map(([s, c]) => ({
          labels: { surface: s }, value: c,
        }));
        parts.push(formatMetric('nexus_events_by_surface', 'gauge', 'Events by surface', surfSamples));
      }
    } catch { /* event store not available */ }

    reply.type('text/plain; version=0.0.4; charset=utf-8').send(parts.join('\n'));
  });
}

module.exports = metricsRoute;
