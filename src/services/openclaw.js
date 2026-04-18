'use strict';

// OpenClaw CLI wrapper — all invocations use spawnSync with argument arrays
// (no shell interpolation, no injection surface).

const { spawnSync, spawn } = require('child_process');
const { getConfig } = require('../config');

function paths() {
  const cfg = getConfig();
  return {
    node: cfg.paths.openclawNode,
    cli: cfg.paths.openclawCli,
  };
}

// ── Circuit breaker state (shared across this module) ───────────────────────
let _cliFailCount = 0;
let _circuitOpen = false;
let _circuitOpenSince = 0;
const _cliCache = new Map();
let _broadcastFn = null;

/**
 * Inject the broadcast function from server.js.
 * @param {Function} fn  broadcast(room, payload)
 */
function setBroadcast(fn) {
  _broadcastFn = fn;
}

function circuitState() {
  return { open: _circuitOpen, failCount: _cliFailCount };
}

function _tryClose() {
  const cfg = getConfig();
  const cooldown = cfg.circuitBreaker?.cooldownMs ?? 60_000;
  if (_circuitOpen && Date.now() - _circuitOpenSince >= cooldown) {
    _circuitOpen = false;
    _cliFailCount = 0;
  }
}

// ── Core spawn wrapper ────────────────────────────────────────────────────────

/**
 * Run openclaw CLI with argument array.
 * Returns { ok, stdout, stderr, status }
 */
function spawnCli(args, { timeout = 15000, maxBuffer = 10 * 1024 * 1024 } = {}) {
  const { node, cli } = paths();
  const result = spawnSync(node, [cli, ...args], {
    timeout,
    encoding: 'utf8',
    maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) return { ok: false, stdout: '', stderr: result.error.message, status: -1 };
  if (result.status !== 0) {
    return { ok: false, stdout: result.stdout || '', stderr: (result.stderr || '').trim(), status: result.status };
  }
  return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '', status: 0 };
}

/**
 * Run CLI and parse JSON from stdout.
 * Returns parsed object or null on failure.
 */
function jspawnCli(args, opts = {}) {
  _tryClose();
  const cfg = getConfig();
  const cacheKey = args.join(':');

  if (_circuitOpen) {
    const cached = _cliCache.get(cacheKey);
    return { ok: !!cached, data: cached || null, fromCache: true, error: cached ? null : 'Circuit open, no cache' };
  }

  const r = spawnCli(args, opts);

  if (!r.ok) {
    _cliFailCount++;
    if (_cliFailCount >= (cfg.circuitBreaker?.failThreshold ?? 3)) {
      _circuitOpen = true;
      _circuitOpenSince = Date.now();
      if (_broadcastFn) {
        try {
          _broadcastFn('health-events', {
            type: 'circuit-breaker-open',
            ts: _circuitOpenSince,
            failCount: _cliFailCount,
          });
        } catch { /* broadcast errors must not affect CLI logic */ }
      }
    }
    return { ok: false, data: null, error: r.stderr || 'CLI failed' };
  }

  // Reset on success
  _cliFailCount = 0;
  if (_circuitOpen) _circuitOpen = false;

  if (!r.stdout.trim()) return { ok: true, data: null };

  try {
    const data = JSON.parse(r.stdout);
    _cliCache.set(cacheKey, data);
    return { ok: true, data };
  } catch {
    return { ok: true, data: { raw: r.stdout.slice(0, 1000) } };
  }
}

// ── Validated cron ID ─────────────────────────────────────────────────────────

function validateCronId(id) {
  if (!id || typeof id !== 'string') throw new Error('Missing job id');
  if (!/^[\w\-.@]+$/.test(id)) throw new Error('Invalid job id format');
  return String(id);
}

// ── Fire-and-forget spawn (for cron run) ────────────────────────────────────

function spawnDetached(args) {
  const { node, cli } = paths();
  const proc = spawn(node, [cli, ...args], { stdio: 'ignore', detached: false });
  proc.on('error', err => { /* swallow — fire-and-forget */ });
  return proc;
}

// ── Named queries ─────────────────────────────────────────────────────────────

function getStatus() { return jspawnCli(['status', '--deep', '--json']); }
function getCronList() { return jspawnCli(['cron', 'list', '--all', '--json']); }
function getHealth() { return jspawnCli(['health', '--json']); }

function getLogs(limit = 30) {
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit)) || 30, 500));
  const { node, cli } = paths();
  const result = spawnSync(node, [cli, 'logs', '--json', '--limit', String(safeLimit)], {
    timeout: 15000,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return [];
  return (result.stdout || '').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function getVersion() {
  const r = spawnCli(['--version'], { timeout: 5000 });
  return { ok: r.ok, version: r.stdout.trim(), error: r.stderr };
}

module.exports = {
  spawnCli,
  jspawnCli,
  spawnDetached,
  validateCronId,
  circuitState,
  setBroadcast,
  getStatus,
  getCronList,
  getHealth,
  getLogs,
  getVersion,
};
