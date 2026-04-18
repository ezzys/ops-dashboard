'use strict';

// R2.1.4 — Session Diff View
// Compare two sessions side-by-side, showing event-level differences

const store = require('../services/event-store');
const { getSessionById, getRecentSessions } = require('../sessiondb');

function diffEvents(eventsA, eventsB) {
  // Align events by index, compare by type+surface+agent
  const maxLen = Math.max(eventsA.length, eventsB.length);
  const diffs = [];

  for (let i = 0; i < maxLen; i++) {
    const a = eventsA[i] || null;
    const b = eventsB[i] || null;

    if (!a) {
      diffs.push({ idx: i, type: 'added_b', event_b: b });
    } else if (!b) {
      diffs.push({ idx: i, type: 'removed_a', event_a: a });
    } else if (a.event_type !== b.event_type || a.surface !== b.surface) {
      diffs.push({ idx: i, type: 'changed', event_a: a, event_b: b });
    } else {
      // Same type — check data diff
      const dataA = JSON.stringify(a.data || {});
      const dataB = JSON.stringify(b.data || {});
      if (dataA !== dataB) {
        diffs.push({ idx: i, type: 'data_diff', event_a: a, event_b: b });
      } else {
        diffs.push({ idx: i, type: 'match', event_a: a, event_b: b });
      }
    }
  }

  return diffs;
}

async function diffRoutes(fastify) {

  // GET /api/sessions/diff?a=<id>&b=<id>
  fastify.get('/api/sessions/diff', async (req, reply) => {
    const { a, b } = req.query;
    if (!a || !b) return reply.code(400).send({ ok: false, error: 'Query params a and b required' });

    // Get events for both sessions
    const traceA = (getSessionById(a)?.trace_id) || a;
    const traceB = (getSessionById(b)?.trace_id) || b;

    const eventsA = store.getEventsByTrace(traceA);
    const eventsB = store.getEventsByTrace(traceB);

    const diffs = diffEvents(eventsA, eventsB);

    const summary = {
      total:     diffs.length,
      match:     diffs.filter(d => d.type === 'match').length,
      changed:   diffs.filter(d => d.type === 'changed').length,
      data_diff: diffs.filter(d => d.type === 'data_diff').length,
      added_b:   diffs.filter(d => d.type === 'added_b').length,
      removed_a: diffs.filter(d => d.type === 'removed_a').length,
    };

    reply.send({ ok: true, session_a: a, session_b: b, summary, diffs });
  });
}

module.exports = diffRoutes;
