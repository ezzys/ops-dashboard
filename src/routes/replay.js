'use strict';

// R2.1.2 — Session Replay API Routes
// Surfaces session data from sessiondb + linked events from event-store.

const { getSessionById, getSessions, getRecentSessions } = require('../sessiondb');
const store = require('../services/event-store');

// ── HTML export template ──────────────────────────────────────────────────────

function buildHtmlExport(session, events) {
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const rows = events.map(e => `
    <tr>
      <td>${new Date(e.timestamp).toISOString()}</td>
      <td>${esc(e.surface)}</td>
      <td>${esc(e.event_type)}</td>
      <td>${esc(e.agent_id ?? '')}</td>
      <td>${esc(e.status)}</td>
      <td>${e.duration_ms ?? ''}</td>
      <td><pre>${esc(JSON.stringify(e.data, null, 2))}</pre></td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Session Export — ${esc(session.id ?? 'unknown')}</title>
<style>
body{font-family:monospace;background:#0d1117;color:#c9d1d9;padding:20px}
h1{font-size:16px;margin-bottom:12px}
table{border-collapse:collapse;width:100%;font-size:11px}
th,td{border:1px solid #21262d;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#161b22;color:#8b949e}
pre{margin:0;white-space:pre-wrap;max-width:400px}
.meta{background:#161b22;border:1px solid #21262d;padding:12px;border-radius:6px;margin-bottom:16px;font-size:12px}
.meta dt{color:#484f58;display:inline-block;width:120px}
</style>
</head>
<body>
<h1>Session Replay Export</h1>
<div class="meta">
  <dl>
    <dt>Session ID</dt><dd>${esc(session.id ?? '')}</dd><br>
    <dt>Agent</dt><dd>${esc(session.agent ?? '')}</dd><br>
    <dt>Model</dt><dd>${esc(session.model ?? '')}</dd><br>
    <dt>Events</dt><dd>${events.length}</dd><br>
    <dt>Exported</dt><dd>${new Date().toISOString()}</dd>
  </dl>
</div>
<table>
  <thead><tr><th>Timestamp</th><th>Surface</th><th>Event Type</th><th>Agent</th><th>Status</th><th>Duration ms</th><th>Data</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;
}

// ── Route plugin ──────────────────────────────────────────────────────────────

async function replayRoutes(fastify) {

  // GET /api/sessions — list sessions with optional filters
  fastify.get('/api/sessions', async (req, reply) => {
    const { limit = 50, offset = 0, agent_id, model, status } = req.query;

    let sessions;
    try {
      sessions = getSessions ? getSessions() : getRecentSessions(200);
    } catch {
      sessions = [];
    }

    // Apply optional client-side filters (sessiondb returns all)
    if (agent_id) sessions = sessions.filter(s => s.agent === agent_id || s.agent_id === agent_id);
    if (model)    sessions = sessions.filter(s => s.model === model);
    if (status)   sessions = sessions.filter(s => s.status === status);

    const total  = sessions.length;
    const page   = sessions.slice(Number(offset), Number(offset) + Number(limit));

    // Enrich each session with event count from event store
    const enriched = page.map(s => {
      let eventCount = 0;
      try {
        const traceId = s.trace_id || s.id;
        if (traceId) {
          const evts = store.queryEvents({ trace_id: traceId, limit: 1 });
          // Quick count via separate query isn't available so we skip exact count here
          eventCount = evts.length > 0 ? -1 : 0; // -1 = has events (unknown exact count)
        }
      } catch { /* event store may not be inited yet */ }
      return { ...s, _event_count: eventCount };
    });

    reply.send({ ok: true, total, sessions: enriched });
  });

  // GET /api/sessions/:id — session details + summary of linked events
  fastify.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params;

    let session = null;
    try {
      session = getSessionById ? getSessionById(id) : null;
    } catch { /* ignore */ }

    // If sessiondb doesn't have it, synthesise a stub from event store traces
    if (!session) {
      const traceEvents = store.getEventsByTrace(id);
      if (traceEvents.length === 0) {
        return reply.code(404).send({ ok: false, error: 'Session not found', code: 'NOT_FOUND' });
      }
      const first = traceEvents[0];
      const last  = traceEvents[traceEvents.length - 1];
      session = {
        id,
        trace_id:  id,
        agent_id:  first.agent_id,
        model:     first.model,
        start_ts:  first.timestamp,
        end_ts:    last.timestamp,
        duration:  last.timestamp - first.timestamp,
        _synthetic: true,
      };
    }

    // Surface counts
    const traceId = session.trace_id || id;
    let surfaces = {};
    try {
      const events = store.getEventsByTrace(traceId);
      for (const e of events) {
        surfaces[e.surface] = (surfaces[e.surface] || 0) + 1;
      }
      session._event_count   = events.length;
      session._surface_counts = surfaces;
    } catch { /* event store not ready */ }

    reply.send({ ok: true, session });
  });

  // GET /api/sessions/:id/events — all events, chronological
  fastify.get('/api/sessions/:id/events', async (req, reply) => {
    const { id } = req.params;

    let session = null;
    try { session = getSessionById ? getSessionById(id) : null; } catch { /* */ }
    const traceId = (session && session.trace_id) || id;

    const events = store.getEventsByTrace(traceId);
    reply.send({ ok: true, trace_id: traceId, count: events.length, events });
  });

  // GET /api/sessions/:id/export?format=json|html
  fastify.get('/api/sessions/:id/export', async (req, reply) => {
    const { id } = req.params;
    const fmt    = (req.query.format || 'json').toLowerCase();

    let session = null;
    try { session = getSessionById ? getSessionById(id) : null; } catch { /* */ }
    if (!session) session = { id, trace_id: id };

    const traceId = session.trace_id || id;
    const events  = store.getEventsByTrace(traceId);

    if (fmt === 'html') {
      const html = buildHtmlExport(session, events);
      reply
        .type('text/html; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="session-${id}.html"`)
        .send(html);
      return;
    }

    // Default: JSON
    reply
      .type('application/json')
      .header('Content-Disposition', `attachment; filename="session-${id}.json"`)
      .send(JSON.stringify({ session, events }, null, 2));
  });
}

module.exports = replayRoutes;
