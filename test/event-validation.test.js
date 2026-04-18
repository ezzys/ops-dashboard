'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEvent,
  isValidSurface,
  isValidEventType,
  isValidSurfaceEventPair,
  EVENT_TYPE,
  SURFACE,
} = require('../src/services/event-types');

describe('validateEvent', () => {
  const base = {
    trace_id:   'tr_001',
    span_id:    'sp_001',
    surface:    SURFACE.OPERATIONAL,
    event_type: EVENT_TYPE.TOOL_CALL,
    timestamp:  Date.now(),
  };

  test('accepts a valid minimal event', () => {
    const result = validateEvent(base);
    assert.equal(result.ok, true);
  });

  test('accepts event with data object', () => {
    const result = validateEvent({ ...base, data: { key: 'value' } });
    assert.equal(result.ok, true);
  });

  test('rejects missing trace_id', () => {
    const { trace_id, ...bad } = base;
    const result = validateEvent(bad);
    assert.equal(result.ok, false);
    assert.match(result.error, /trace_id/);
  });

  test('rejects missing span_id', () => {
    const { span_id, ...bad } = base;
    const result = validateEvent(bad);
    assert.equal(result.ok, false);
    assert.match(result.error, /span_id/);
  });

  test('rejects invalid surface', () => {
    const result = validateEvent({ ...base, surface: 'unknown' });
    assert.equal(result.ok, false);
    assert.match(result.error, /surface/);
  });

  test('rejects invalid event_type', () => {
    const result = validateEvent({ ...base, event_type: 'not.real' });
    assert.equal(result.ok, false);
    assert.match(result.error, /event_type/);
  });

  test('rejects mismatched surface/event_type pair', () => {
    const result = validateEvent({
      ...base,
      surface:    SURFACE.COGNITIVE,
      event_type: EVENT_TYPE.TOOL_CALL, // operational type on cognitive surface
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /does not belong/);
  });

  test('rejects negative timestamp', () => {
    const result = validateEvent({ ...base, timestamp: -1 });
    assert.equal(result.ok, false);
    assert.match(result.error, /timestamp/);
  });

  test('rejects non-object event', () => {
    const result = validateEvent('not an object');
    assert.equal(result.ok, false);
  });

  test('agent.handoff is valid on operational surface', () => {
    const result = validateEvent({
      ...base,
      event_type: EVENT_TYPE.AGENT_HANDOFF,
    });
    assert.equal(result.ok, true);
  });

  test('heartbeat is valid on operational surface', () => {
    const result = validateEvent({
      ...base,
      event_type: EVENT_TYPE.HEARTBEAT,
    });
    assert.equal(result.ok, true);
  });
});

describe('isValidSurface', () => {
  test('accepts known surfaces', () => {
    assert.equal(isValidSurface('cognitive'), true);
    assert.equal(isValidSurface('operational'), true);
    assert.equal(isValidSurface('contextual'), true);
  });

  test('rejects unknown surface', () => {
    assert.equal(isValidSurface('unknown'), false);
    assert.equal(isValidSurface(''), false);
  });
});

describe('isValidSurfaceEventPair', () => {
  test('tool_call belongs to operational', () => {
    assert.equal(isValidSurfaceEventPair('operational', 'tool_call'), true);
  });

  test('reasoning_step belongs to cognitive', () => {
    assert.equal(isValidSurfaceEventPair('cognitive', 'reasoning_step'), true);
  });

  test('tool_call does not belong to cognitive', () => {
    assert.equal(isValidSurfaceEventPair('cognitive', 'tool_call'), false);
  });
});
