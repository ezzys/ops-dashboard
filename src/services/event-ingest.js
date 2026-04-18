'use strict';

// R2.1.3 — Event ingestion pipeline
// Validates incoming events and writes to the event store.
// Called from POST /api/events and the WebSocket 'events' room.

const { validateEvent } = require('./event-types');
const store             = require('./event-store');

// broadcast function — injected by server.js after WS is set up
let _broadcast = null;

/**
 * Inject the broadcast function from server.js.
 * @param {Function} fn  broadcast(room, payload)
 */
function setBroadcast(fn) {
  _broadcast = fn;
}

/**
 * Ingest a single event object.
 * - Validates schema
 * - Writes to SQLite
 * - Broadcasts to 'logs' WebSocket room
 *
 * @param {object} event  Raw event payload (may include `data` as object or JSON string)
 * @returns {{ ok: boolean, id?: number, error?: string }}
 */
function ingestEvent(event) {
  // Normalise data field — accept both object and JSON string from callers
  let normalised = event;
  if (typeof event.data === 'string') {
    try { normalised = { ...event, data: JSON.parse(event.data) }; }
    catch { normalised = { ...event, data: {} }; }
  } else if (event.data === undefined || event.data === null) {
    normalised = { ...event, data: {} };
  }

  // Default timestamp to now if missing/invalid
  if (!normalised.timestamp || typeof normalised.timestamp !== 'number') {
    normalised = { ...normalised, timestamp: Date.now() };
  }

  const validation = validateEvent(normalised);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  let id;
  try {
    id = store.writeEvent(normalised);
  } catch (err) {
    return { ok: false, error: `Store write failed: ${err.message}` };
  }

  // Broadcast to live 'logs' subscribers
  if (_broadcast) {
    try {
      _broadcast('logs', {
        type:       'event',
        id,
        trace_id:   normalised.trace_id,
        span_id:    normalised.span_id,
        surface:    normalised.surface,
        event_type: normalised.event_type,
        timestamp:  normalised.timestamp,
        agent_id:   normalised.agent_id || null,
        model:      normalised.model    || null,
        status:     normalised.status   || 'success',
        data:       normalised.data,
      });
    } catch { /* broadcast errors must not fail ingestion */ }
  }

  return { ok: true, id };
}

/**
 * Ingest an array of events (batch).
 * @param {object[]} events
 * @returns {{ ok: boolean, accepted: number, rejected: number, errors: string[] }}
 */
function ingestBatch(events) {
  if (!Array.isArray(events)) {
    return { ok: false, accepted: 0, rejected: 0, errors: ['events must be an array'] };
  }
  if (events.length > 500) {
    return { ok: false, accepted: 0, rejected: 0, errors: ['batch too large (max 500)'] };
  }

  let accepted = 0;
  let rejected = 0;
  const errors = [];

  for (let i = 0; i < events.length; i++) {
    const result = ingestEvent(events[i]);
    if (result.ok) {
      accepted++;
    } else {
      rejected++;
      errors.push(`[${i}] ${result.error}`);
    }
  }

  return { ok: rejected === 0, accepted, rejected, errors };
}

/**
 * Handle a message from a WebSocket client in the 'events' room.
 * Expects JSON with `type: 'event' | 'batch'`.
 *
 * @param {WebSocket} ws
 * @param {Buffer|string} raw
 */
function handleWsMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    ws.send(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    return;
  }

  if (msg.type === 'event') {
    const result = ingestEvent(msg.event || msg);
    ws.send(JSON.stringify({ ok: result.ok, id: result.id, error: result.error }));

  } else if (msg.type === 'batch') {
    const result = ingestBatch(msg.events);
    ws.send(JSON.stringify(result));

  } else if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));

  } else {
    // Treat entire message as a single event (convenience)
    const result = ingestEvent(msg);
    ws.send(JSON.stringify({ ok: result.ok, id: result.id, error: result.error }));
  }
}

module.exports = {
  setBroadcast,
  ingestEvent,
  ingestBatch,
  handleWsMessage,
};
