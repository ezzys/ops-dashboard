'use strict';

// R4.4.2 — Pre-built Grafana dashboard JSON
// R4.4.3 — Prometheus alert rules (YAML)

const fs   = require('fs');
const path = require('path');

const GRAFANA_DASHBOARD = {
  annotations: { list: [] },
  editable: true,
  fiscalYearStartMonth: 0,
  graphTooltip: 0,
  id: null,
  links: [],
  panels: [
    {
      id: 1, title: 'Total Cost (USD)', type: 'stat',
      gridPos: { h: 4, w: 6, x: 0, y: 0 },
      targets: [{ expr: 'nexus_cost_total_usd', refId: 'A' }],
      fieldConfig: { defaults: { unit: 'currencyUSD', thresholds: { steps: [{ color: 'green', value: null }, { color: 'yellow', value: 0.5 }, { color: 'red', value: 1 }] } } },
    },
    {
      id: 2, title: 'Budget Used %', type: 'gauge',
      gridPos: { h: 4, w: 6, x: 6, y: 0 },
      targets: [{ expr: 'nexus_budget_daily_used_pct', refId: 'A' }],
      fieldConfig: { defaults: { unit: 'percent', max: 100, thresholds: { steps: [{ color: 'green', value: null }, { color: 'yellow', value: 50 }, { color: 'red', value: 80 }] } } },
    },
    {
      id: 3, title: 'Agents', type: 'stat',
      gridPos: { h: 4, w: 4, x: 12, y: 0 },
      targets: [{ expr: 'nexus_agents_total', refId: 'A' }],
    },
    {
      id: 4, title: 'Stuck Agents', type: 'stat',
      gridPos: { h: 4, w: 4, x: 16, y: 0 },
      targets: [{ expr: 'nexus_agents_stuck', refId: 'A' }],
      fieldConfig: { defaults: { thresholds: { steps: [{ color: 'green', value: null }, { color: 'red', value: 1 }] } } },
    },
    {
      id: 5, title: 'Cost by Model', type: 'piechart',
      gridPos: { h: 8, w: 8, x: 0, y: 4 },
      targets: [{ expr: 'nexus_cost_by_model_usd', refId: 'A' }],
    },
    {
      id: 6, title: 'Events by Surface', type: 'barchart',
      gridPos: { h: 8, w: 8, x: 8, y: 4 },
      targets: [{ expr: 'nexus_events_by_surface', refId: 'A' }],
    },
    {
      id: 7, title: 'Total Events', type: 'timeseries',
      gridPos: { h: 8, w: 8, x: 16, y: 4 },
      targets: [{ expr: 'nexus_events_total', refId: 'A' }],
    },
  ],
  schemaVersion: 39,
  tags: ['nexus', 'ai-agents'],
  templating: { list: [] },
  time: { from: 'now-6h', to: 'now' },
  title: 'NEXUS AI Agent Operations',
  uid: 'nexus-ops',
};

const PROMETHEUS_ALERTS = `# NEXUS AI Agent Operations — Prometheus Alert Rules
groups:
  - name: nexus-cost
    rules:
      - alert: NexusDailyBudget80Pct
        expr: nexus_budget_daily_used_pct >= 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "NEXUS daily budget >80% used"
          description: "Current usage: {{ $value }}%"

      - alert: NexusDailyBudget95Pct
        expr: nexus_budget_daily_used_pct >= 95
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "NEXUS daily budget >95% used"
          description: "Current usage: {{ $value }}%. Consider blocking new sessions."

  - name: nexus-agents
    rules:
      - alert: NexusAgentStuck
        expr: nexus_agents_stuck > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "{{ $value }} NEXUS agent(s) are stuck"
          description: "Agents have not responded within the stuck threshold."

      - alert: NexusAllAgentsStuck
        expr: nexus_agents_stuck == nexus_agents_total
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "All NEXUS agents are stuck"
          description: "No healthy agents. Investigate gateway or infrastructure issues."

  - name: nexus-events
    rules:
      - alert: NexusEventStoreGrowingFast
        expr: increase(nexus_events_total[1h]) > 100000
        for: 15m
        labels:
          severity: info
        annotations:
          summary: "Event store growing rapidly"
          description: "{{ $value }} events in the last hour. Check for runaway agents."
`;

async function grafanaRoutes(fastify) {

  // GET /api/grafana/dashboard — pre-built Grafana dashboard JSON
  fastify.get('/api/grafana/dashboard', async (req, reply) => {
    reply.send(GRAFANA_DASHBOARD);
  });

  // GET /api/grafana/alerts — Prometheus alert rules YAML
  fastify.get('/api/grafana/alerts', async (req, reply) => {
    reply.type('text/yaml').send(PROMETHEUS_ALERTS);
  });
}

module.exports = grafanaRoutes;
