'use strict';

// Lightweight OTel-shaped telemetry helpers.
// Structured to be drop-in compatible with @opentelemetry/api if we wire a real
// SDK later. gen_ai semantic conventions used for span attribute naming.

const { randomUUID } = require('crypto');

// ── In-memory span store (ring buffer, last 1000 spans) ─────────────────────
const MAX_SPANS = 1000;
const spanStore = [];

function _pushSpan(span) {
  spanStore.push(span);
  if (spanStore.length > MAX_SPANS) spanStore.shift();
}

// ── Span factory ─────────────────────────────────────────────────────────────

/**
 * Start a new span. Returns a span object with helpers.
 *
 * @param {string} name  — operation name (e.g. "openclaw.status")
 * @param {object} [attrs] — initial attributes (gen_ai.* keys encouraged)
 * @returns {object} span
 */
function startSpan(name, attrs = {}) {
  const span = {
    traceId: randomUUID().replace(/-/g, ''),
    spanId: randomUUID().replace(/-/g, '').slice(0, 16),
    name,
    startTime: Date.now(),
    endTime: null,
    durationMs: null,
    attributes: { ...attrs },
    events: [],
    status: 'ok',
    error: null,
  };
  return span;
}

/**
 * End a span and record it.
 *
 * @param {object} span
 * @param {object} [opts]
 * @param {'ok'|'error'} [opts.status]
 * @param {string|Error} [opts.error]
 * @param {object} [opts.attrs] — additional attributes to merge
 */
function endSpan(span, opts = {}) {
  span.endTime = Date.now();
  span.durationMs = span.endTime - span.startTime;
  if (opts.status) span.status = opts.status;
  if (opts.error) {
    span.status = 'error';
    span.error = opts.error instanceof Error ? opts.error.message : String(opts.error);
  }
  if (opts.attrs) Object.assign(span.attributes, opts.attrs);
  _pushSpan(span);
  return span;
}

/**
 * Add a timestamped event to a span.
 *
 * @param {object} span
 * @param {string} name
 * @param {object} [attrs]
 */
function addEvent(span, name, attrs = {}) {
  span.events.push({ name, ts: Date.now(), attributes: attrs });
}

/**
 * Wrap an async function with a span. Automatically ends with ok/error status.
 *
 * @param {string} spanName
 * @param {object} attrs
 * @param {function} fn
 */
async function withSpan(spanName, attrs, fn) {
  const span = startSpan(spanName, attrs);
  try {
    const result = await fn(span);
    endSpan(span);
    return result;
  } catch (err) {
    endSpan(span, { error: err });
    throw err;
  }
}

/**
 * Return recent spans (for diagnostics).
 * @param {number} [limit=50]
 */
function getRecentSpans(limit = 50) {
  return spanStore.slice(-limit);
}

// ── gen_ai semantic convention helpers ───────────────────────────────────────

const GenAI = {
  SYSTEM: 'gen_ai.system',
  MODEL: 'gen_ai.request.model',
  INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  CACHE_READ_TOKENS: 'gen_ai.usage.cache_read_input_tokens',
  CACHE_WRITE_TOKENS: 'gen_ai.usage.cache_creation_input_tokens',
  FINISH_REASON: 'gen_ai.response.finish_reasons',
};

module.exports = { startSpan, endSpan, addEvent, withSpan, getRecentSpans, GenAI };
