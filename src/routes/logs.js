'use strict';

// R2.3 — Structured Log Query Routes
// GET /api/logs/query  — filtered, paginated event query
// GET /api/logs/search — full-text search across event data

const store = require('../services/event-store');
const { ingestEvent, ingestBatch } = require('../services/event-ingest');
const { SURFACE, EVENT_TYPE, ALL_SURFACES, ALL_EVENT_TYPES } = require('../services/event-types');

async function logsRoutes(fastify) {

  // ── GET /api/logs/query ────────────────────────────────────────────────────
  // Query event store with filters + pagination.
  // ?surface=cognitive&event_type=tool_call&agent_id=X&from=ms&to=ms&limit=50&offset=0
  fastify.get('/api/logs/query', async (req, reply) => {
    const {
      surface,
      event_type,
      agent_id,
      trace_id,
      from,
      to,
      search,
      limit  = 50,
      offset = 0,
    } = req.query;

    // Validate enums if provided
    if (surface && !ALL_SURFACES.has(surface)) {
      return reply.code(400).send({
        ok: false,
        error: `Invalid surface '${surface}'. Valid: ${[...ALL_SURFACES].join(', ')}`,
        code: 'BAD_REQUEST',
      });
    }
    if (event_type && !ALL_EVENT_TYPES.has(event_type)) {
      return reply.code(400).send({
        ok: false,
        error: `Invalid event_type '${event_type}'`,
        code: 'BAD_REQUEST',
      });
    }

    const filters = {
      surface:    surface    || undefined,
      event_type: event_type || undefined,
      agent_id:   agent_id   || undefined,
      trace_id:   trace_id   || undefined,
      from:       from       ? Number(from)   : undefined,
      to:         to         ? Number(to)     : undefined,
      search:     search     || undefined,
      limit:      Math.min(Number(limit)  || 50,  500),
      offset:     Math.max(Number(offset) || 0,   0),
    };

    let events;
    try {
      events = store.queryEvents(filters);
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message, code: 'STORE_ERROR' });
    }

    reply.send({
      ok: true,
      count:  events.length,
      filters: {
        surface:    filters.surface,
        event_type: filters.event_type,
        agent_id:   filters.agent_id,
        trace_id:   filters.trace_id,
        from:       filters.from,
        to:         filters.to,
        search:     filters.search,
        limit:      filters.limit,
        offset:     filters.offset,
      },
      events,
    });
  });

  // ── GET /api/logs/search ───────────────────────────────────────────────────
  // Full-text search across event data JSON (LIKE-based substring match).
  // ?q=<term>&limit=50
  fastify.get('/api/logs/search', async (req, reply) => {
    const { q, limit = 50 } = req.query;
    if (!q || q.trim().length < 2) {
      return reply.code(400).send({
        ok: false,
        error: 'Search term must be at least 2 characters',
        code: 'BAD_REQUEST',
      });
    }

    let events;
    try {
      events = store.queryEvents({ search: q.trim(), limit: Math.min(Number(limit), 200) });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message, code: 'STORE_ERROR' });
    }

    reply.send({ ok: true, query: q, count: events.length, events });
  });

  // ── GET /api/logs/recent ───────────────────────────────────────────────────
  // Quick access to most recent N events across all surfaces.
  fastify.get('/api/logs/recent', async (req, reply) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    let events;
    try {
      events = store.getRecentEvents(limit);
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message, code: 'STORE_ERROR' });
    }
    reply.send({ ok: true, count: events.length, events });
  });

  // ── GET /api/logs/stats ────────────────────────────────────────────────────
  // Event count totals by surface. Useful for dashboard widget.
  fastify.get('/api/logs/stats', async (req, reply) => {
    let stats;
    try {
      stats = store.getStats();
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message, code: 'STORE_ERROR' });
    }
    reply.send({ ok: true, ...stats });
  });

  // ── POST /api/events ───────────────────────────────────────────────────────
  // R2.1.3 — HTTP event ingestion endpoint (authenticated via server preHandler).
  // Accepts a single event object or { events: [...] } batch.
  fastify.post('/api/events', {
    schema: {
      body: {
        type: 'object',
        // Loose schema — full validation done inside ingestEvent/ingestBatch
      },
    },
  }, async (req, reply) => {
    const body = req.body;
    if (!body) {
      return reply.code(400).send({ ok: false, error: 'Empty body', code: 'BAD_REQUEST' });
    }

    // Batch mode: { events: [...] }
    if (Array.isArray(body.events)) {
      const result = ingestBatch(body.events);
      return reply.code(result.ok ? 200 : 207).send(result);
    }

    // Array at root
    if (Array.isArray(body)) {
      const result = ingestBatch(body);
      return reply.code(result.ok ? 200 : 207).send(result);
    }

    // Single event
    const result = ingestEvent(body);
    if (!result.ok) {
      return reply.code(400).send({ ok: false, error: result.error, code: 'VALIDATION_ERROR' });
    }
    reply.code(201).send({ ok: true, id: result.id });
  });

  // ── GET /api/logs/surfaces ─────────────────────────────────────────────────
  // Return valid surface + event_type taxonomy for frontend use.
  fastify.get('/api/logs/surfaces', { config: { skipAuth: true } }, async (req, reply) => {
    reply.send({
      ok: true,
      surfaces: Object.values(SURFACE),
      event_types: Object.values(EVENT_TYPE),
      taxonomy: {
        cognitive:   ['reasoning_step','tool_selected','confidence_score','context_built'],
        operational: ['tool_call','tool_result','function_invoked','error','retry'],
        contextual:  ['http_request','db_query','cache_hit','cache_miss','file_read','file_write'],
      },
    });
  });
}

module.exports = logsRoutes;
