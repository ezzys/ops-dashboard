'use strict';

// R4.5.4 — Compliance Export + Audit routes
// R4.5.2 — Basic role-based access (viewer/operator/admin)

const auditLog = require('../services/audit-log');
const db = require('../services/db');

// ── Role config ───────────────────────────────────────────────────────────────
// Roles are defined in nexus-config.json: auth.roles = { admin: [token1], ... }
// Default: if token matches auth.token, role = admin

function getRole(token, cfg) {
  const roles = cfg.auth?.roles;
  if (!roles) return 'admin'; // single-token mode = admin
  for (const [role, tokens] of Object.entries(roles)) {
    if (Array.isArray(tokens) && tokens.includes(token)) return role;
  }
  return null; // unknown token
}

// ── Route plugin ──────────────────────────────────────────────────────────────
async function complianceRoutes(fastify) {

  // GET /api/compliance/audit?format=json|csv&from=ts&to=ts&limit=1000
  fastify.get('/api/compliance/audit', async (req, reply) => {
    const fmt   = (req.query.format || 'json').toLowerCase();
    const from  = req.query.from ? Number(req.query.from) : 0;
    const to    = req.query.to   ? Number(req.query.to)   : Date.now();
    const limit = Math.min(Number(req.query.limit || 1000), 5000);

    let rows;
    try {
      rows = auditLog.query({ from, to, limit });
    } catch {
      rows = [];
    }

    if (fmt === 'csv') {
      const header = 'timestamp,action,operator,target,before,after\n';
      const csvRows = rows.map(r =>
        `"${new Date(r.timestamp).toISOString()}","${r.action}","${r.operator || ''}","${r.target || ''}","${String(r.before || '').replace(/"/g,'""')}","${String(r.after || '').replace(/"/g,'""')}"`
      ).join('\n');
      reply
        .type('text/csv')
        .header('Content-Disposition', 'attachment; filename="audit-log.csv"')
        .send(header + csvRows);
      return;
    }

    reply
      .type('application/json')
      .header('Content-Disposition', 'attachment; filename="audit-log.json"')
      .send(JSON.stringify({ ok: true, count: rows.length, entries: rows }, null, 2));
  });

  // GET /api/compliance/summary — audit stats
  fastify.get('/api/compliance/summary', async (req, reply) => {
    let rows;
    try { rows = auditLog.query({ limit: 10000 }); } catch { rows = []; }

    const byAction = {};
    const byOperator = {};
    for (const r of rows) {
      byAction[r.action] = (byAction[r.action] || 0) + 1;
      if (r.operator) byOperator[r.operator] = (byOperator[r.operator] || 0) + 1;
    }

    reply.send({
      ok: true,
      total: rows.length,
      byAction,
      byOperator,
      firstEntry: rows[0]?.timestamp || null,
      lastEntry: rows[rows.length - 1]?.timestamp || null,
    });
  });
}

module.exports = { complianceRoutes, getRole };
