'use strict';

// R3.2.3 — Handoff Protocol
// Stores agent handoffs as special events in the event store.
// Handoff schema: { from_agent, to_agent, context_summary, pending_tasks, artifacts }

const { queryEvents } = require('./event-store');
const eventIngest    = require('./event-ingest');

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return `hoff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function spanId() {
  return Math.random().toString(36).slice(2, 12);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Execute a handoff between two agents. Writes a special 'agent.handoff' event.
 *
 * @param {object} handoff
 * @param {string} handoff.from_agent       — source agent id
 * @param {string} handoff.to_agent         — target agent id
 * @param {string} handoff.context_summary  — human-readable summary
 * @param {string[]} [handoff.pending_tasks] — list of pending task descriptions
 * @param {object}  [handoff.artifacts]     — key/value artifact map
 * @param {string}  [handoff.trace_id]      — existing trace to attach to, or new one
 * @returns {{ id: string, trace_id: string, event_id: number }}
 */
function executeHandoff(handoff) {
  const {
    from_agent,
    to_agent,
    context_summary,
    pending_tasks = [],
    artifacts     = {},
    trace_id: existingTrace,
  } = handoff;

  const id       = uid();
  const trace_id = existingTrace || id;
  const sid      = spanId();

  const result = eventIngest.ingestEvent({
    trace_id,
    span_id:        sid,
    parent_span_id: null,
    surface:        'operational',
    event_type:     'agent.handoff',
    timestamp:      Date.now(),
    agent_id:       from_agent,
    model:          null,
    data: {
      handoff_id:      id,
      from_agent,
      to_agent,
      context_summary,
      pending_tasks,
      artifacts,
    },
    status: 'success',
  });

  if (!result.ok) throw new Error(`Handoff event write failed: ${result.error}`);

  return { id, trace_id, event_id: result.id };
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Get all handoff events, newest first.
 * @param {number} [limit=50]
 * @returns {object[]}
 */
function listHandoffs(limit = 50) {
  const events = queryEvents({ event_type: 'agent.handoff', limit });
  return events.map(e => ({
    id:              e.data.handoff_id || e.span_id,
    trace_id:        e.trace_id,
    event_id:        e.id,
    from_agent:      e.data.from_agent,
    to_agent:        e.data.to_agent,
    context_summary: e.data.context_summary,
    pending_tasks:   e.data.pending_tasks || [],
    artifacts:       e.data.artifacts     || {},
    timestamp:       e.timestamp,
    status:          e.status,
  }));
}

/**
 * Get a single handoff by its handoff id.
 * @param {string} handoffId
 * @returns {object|null}
 */
function getHandoff(handoffId) {
  const events = queryEvents({ event_type: 'agent.handoff', search: handoffId, limit: 10 });
  const event  = events.find(e => e.data && e.data.handoff_id === handoffId);
  if (!event) return null;

  return {
    id:              event.data.handoff_id,
    trace_id:        event.trace_id,
    event_id:        event.id,
    from_agent:      event.data.from_agent,
    to_agent:        event.data.to_agent,
    context_summary: event.data.context_summary,
    pending_tasks:   event.data.pending_tasks || [],
    artifacts:       event.data.artifacts     || {},
    timestamp:       event.timestamp,
    status:          event.status,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  executeHandoff,
  listHandoffs,
  getHandoff,
};
