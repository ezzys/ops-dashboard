'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getStatus, getCronList, getHealth, getLogs } = require('../services/openclaw');
const { aggregateUsage } = require('../services/cost-calculator');
const { getSysMetrics } = require('../services/sysmetrics');
const { getConfig } = require('../config');

// ── Research pipeline helper ─────────────────────────────────────────────────

function getResearchPipeline() {
  const cfg = getConfig();
  const researchDir = cfg.paths.researchDir;

  const dailyFiles = (() => {
    try {
      return fs.readdirSync(researchDir)
        .filter(f => f.startsWith('daily-research') && f.endsWith('.md') && !f.endsWith('-latest.md'))
        .sort().reverse().slice(0, 7);
    } catch { return []; }
  })();

  const daily = dailyFiles.map(f => {
    try {
      const content = fs.readFileSync(path.join(researchDir, f), 'utf8');
      const m = content.match(/^#\s+(.+)/m);
      const tsMatch = content.match(/(\d{4}-\d{2}-\d{2}T[\d:]+)/);
      const lines = content.split('\n').length;
      const tokMatch = content.match(/(?:tokens?|tok)[:\s]+([0-9]+)/i);
      const stat = fs.statSync(path.join(researchDir, f));
      return {
        file: f,
        title: m ? m[1].trim() : f,
        ts: tsMatch ? new Date(tsMatch[1]).getTime() : stat.mtimeMs,
        lines,
        tokens: tokMatch ? parseInt(tokMatch[1].replace(/,/g, '')) : null,
        sizeKb: Math.round(stat.size / 1024),
      };
    } catch { return null; }
  }).filter(Boolean);

  const findingsOrder = ['bets', 'general', 'misc', 'news', 'ww', 'status'];
  const findings = findingsOrder.map(name => {
    try {
      const jsonPath = path.join(researchDir, `${name}-findings.json`);
      if (!fs.existsSync(jsonPath)) return { name, exists: false };
      const stats = fs.statSync(jsonPath);
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return {
        name, exists: true,
        posted: parsed.posted !== false,
        postedAt: parsed.postedAt || (parsed.posted ? stats.mtimeMs : null),
        generatedAt: parsed.generatedAt || stats.mtimeMs,
        channel: parsed.channel || null,
        summary: parsed.summary || null,
        tokenCost: parsed.tokenCost || null,
        mtimeMs: stats.mtimeMs,
      };
    } catch { return { name, exists: false }; }
  });

  let sessionState = null;
  try {
    const ssPath = path.join(researchDir, 'SESSION_STATE.md');
    if (fs.existsSync(ssPath)) {
      const content = fs.readFileSync(ssPath, 'utf8');
      const dateMatch = content.match(/\|\s*(\d{4}-\d{2}-\d{2})\s*\|/g);
      const lastUpdatedMatch = content.match(/Last updated:\s*(.+)/i);
      sessionState = {
        lastUpdated: lastUpdatedMatch ? lastUpdatedMatch[1].trim() : null,
        entryCount: dateMatch ? dateMatch.length : 0,
      };
    }
  } catch {}

  return { daily, findings, sessionState, ts: Date.now() };
}

// ── Routes ───────────────────────────────────────────────────────────────────

async function routes(fastify) {
  // Combined data dump (status + cron + health + logs)
  fastify.get('/api/data', async (req, reply) => {
    const statusResult = getStatus();
    const cronResult = getCronList();
    const healthResult = getHealth();
    const logs = getLogs(30);

    const status = statusResult.data;
    const cron = cronResult.data;
    const health = healthResult.data;

    if (status && cron?.jobs) {
      status.cron = cron;
    }

    return { status, cron, health, logs, ts: Date.now() };
  });

  // Logs only
  fastify.get('/api/logs', async (req, reply) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const logs = getLogs(limit);
    return { logs, ts: Date.now() };
  });

  // System metrics
  fastify.get('/api/sysmetrics', async (req, reply) => {
    const metrics = getSysMetrics();
    return { metrics, ts: Date.now() };
  });

  // Model usage / cost
  fastify.get('/api/modelusage', async (req, reply) => {
    const statusResult = getStatus();
    if (!statusResult.ok || !statusResult.data) {
      return { usage: null, ts: Date.now() };
    }
    const sessions = statusResult.data.sessions?.recent || [];
    const { byModel, totals } = aggregateUsage(sessions);
    return {
      usage: { sessions, byModel, totals, ts: Date.now() },
      ts: Date.now(),
    };
  });

  // Research pipeline
  fastify.get('/api/research', async (req, reply) => {
    const research = getResearchPipeline();
    return { research, ts: Date.now() };
  });
}

module.exports = routes;
