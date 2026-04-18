'use strict';

// R2.2 — Three-Surface Event Types (AgentTrace taxonomy)
// Surface → set of valid event_type values.

// ── Surface constants ─────────────────────────────────────────────────────────

const SURFACE = Object.freeze({
  COGNITIVE:    'cognitive',
  OPERATIONAL:  'operational',
  CONTEXTUAL:   'contextual',
});

// ── Event type constants ──────────────────────────────────────────────────────

const EVENT_TYPE = Object.freeze({
  // Cognitive surface — agent thinking / planning
  REASONING_STEP:   'reasoning_step',
  TOOL_SELECTED:    'tool_selected',
  CONFIDENCE_SCORE: 'confidence_score',
  CONTEXT_BUILT:    'context_built',

  // Operational surface — tool / function execution
  TOOL_CALL:        'tool_call',
  TOOL_RESULT:      'tool_result',
  FUNCTION_INVOKED: 'function_invoked',
  ERROR:            'error',
  RETRY:            'retry',
  AGENT_HANDOFF:    'agent.handoff',
  HEARTBEAT:        'heartbeat',

  // Contextual surface — external I/O
  HTTP_REQUEST:     'http_request',
  DB_QUERY:         'db_query',
  CACHE_HIT:        'cache_hit',
  CACHE_MISS:       'cache_miss',
  FILE_READ:        'file_read',
  FILE_WRITE:       'file_write',
});

// ── Surface → valid event types mapping ──────────────────────────────────────

const SURFACE_EVENTS = Object.freeze({
  [SURFACE.COGNITIVE]: new Set([
    EVENT_TYPE.REASONING_STEP,
    EVENT_TYPE.TOOL_SELECTED,
    EVENT_TYPE.CONFIDENCE_SCORE,
    EVENT_TYPE.CONTEXT_BUILT,
  ]),
  [SURFACE.OPERATIONAL]: new Set([
    EVENT_TYPE.TOOL_CALL,
    EVENT_TYPE.TOOL_RESULT,
    EVENT_TYPE.FUNCTION_INVOKED,
    EVENT_TYPE.ERROR,
    EVENT_TYPE.RETRY,
    EVENT_TYPE.AGENT_HANDOFF,
    EVENT_TYPE.HEARTBEAT,
  ]),
  [SURFACE.CONTEXTUAL]: new Set([
    EVENT_TYPE.HTTP_REQUEST,
    EVENT_TYPE.DB_QUERY,
    EVENT_TYPE.CACHE_HIT,
    EVENT_TYPE.CACHE_MISS,
    EVENT_TYPE.FILE_READ,
    EVENT_TYPE.FILE_WRITE,
  ]),
});

// All valid event types as a flat set for fast lookup
const ALL_EVENT_TYPES = new Set(Object.values(EVENT_TYPE));
const ALL_SURFACES    = new Set(Object.values(SURFACE));

// Reverse map: event_type → surface
const EVENT_TYPE_TO_SURFACE = (() => {
  const m = new Map();
  for (const [surface, types] of Object.entries(SURFACE_EVENTS)) {
    for (const t of types) m.set(t, surface);
  }
  return m;
})();

// ── Display metadata ──────────────────────────────────────────────────────────

const SURFACE_META = Object.freeze({
  [SURFACE.COGNITIVE]:   { label: 'Cognitive',   color: '#3fb950', dot: '🟢' },
  [SURFACE.OPERATIONAL]: { label: 'Operational', color: '#d29922', dot: '🟡' },
  [SURFACE.CONTEXTUAL]:  { label: 'Contextual',  color: '#a371f7', dot: '🟣' },
});

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a surface value.
 * @param {string} surface
 * @returns {boolean}
 */
function isValidSurface(surface) {
  return ALL_SURFACES.has(surface);
}

/**
 * Validate an event_type value.
 * @param {string} eventType
 * @returns {boolean}
 */
function isValidEventType(eventType) {
  return ALL_EVENT_TYPES.has(eventType);
}

/**
 * Validate that surface + event_type are a compatible pair.
 * @param {string} surface
 * @param {string} eventType
 * @returns {boolean}
 */
function isValidSurfaceEventPair(surface, eventType) {
  const valid = SURFACE_EVENTS[surface];
  return valid ? valid.has(eventType) : false;
}

/**
 * Validate a full event object. Returns { ok: true } or { ok: false, error }.
 * @param {object} event
 * @returns {{ ok: boolean, error?: string }}
 */
function validateEvent(event) {
  if (!event || typeof event !== 'object') {
    return { ok: false, error: 'Event must be an object' };
  }

  const required = ['trace_id', 'span_id', 'surface', 'event_type', 'timestamp'];
  for (const field of required) {
    if (event[field] === undefined || event[field] === null || event[field] === '') {
      return { ok: false, error: `Missing required field: ${field}` };
    }
  }

  if (!isValidSurface(event.surface)) {
    return { ok: false, error: `Invalid surface: ${event.surface}. Must be one of: ${[...ALL_SURFACES].join(', ')}` };
  }

  if (!isValidEventType(event.event_type)) {
    return { ok: false, error: `Invalid event_type: ${event.event_type}` };
  }

  if (!isValidSurfaceEventPair(event.surface, event.event_type)) {
    return { ok: false, error: `event_type '${event.event_type}' does not belong to surface '${event.surface}'` };
  }

  if (typeof event.timestamp !== 'number' || event.timestamp <= 0) {
    return { ok: false, error: 'timestamp must be a positive integer (Unix ms)' };
  }

  if (event.data !== undefined && typeof event.data !== 'object') {
    return { ok: false, error: 'data must be an object' };
  }

  if (event.duration_ms !== undefined && event.duration_ms !== null &&
      (typeof event.duration_ms !== 'number' || event.duration_ms < 0)) {
    return { ok: false, error: 'duration_ms must be a non-negative number' };
  }

  return { ok: true };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  SURFACE,
  EVENT_TYPE,
  SURFACE_EVENTS,
  SURFACE_META,
  ALL_EVENT_TYPES,
  ALL_SURFACES,
  EVENT_TYPE_TO_SURFACE,
  isValidSurface,
  isValidEventType,
  isValidSurfaceEventPair,
  validateEvent,
};
