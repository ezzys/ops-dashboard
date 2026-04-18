#!/usr/bin/env node
'use strict';

// NEXUS Ops Dashboard — Fastify server (Phase 1)
// Replaces dashboard.js (raw http.createServer) with Fastify + WebSocket support.

const path = require('path');
const fs = require('fs');
const { loadConfig, getConfig } = require('./config');

// Load config eagerly — fail fast on misconfiguration
const cfg = loadConfig();

const Fastify = require('fastify');
const { WebSocketServer } = require('ws');

// ── Logger ────────────────────────────────────────────────────────────────────

const log = {
  _json(level, obj, msg) {
    const entry = { level, ts: new Date().toISOString(), ...(typeof obj === 'string' ? { msg: obj } : obj), msg: msg || '' };
    process.stderr.write(JSON.stringify(entry) + '\n');
  },
  info(obj, msg) { this._json('info', obj, msg); },
  warn(obj, msg) { this._json('warn', obj, msg); },
  error(obj, msg) { this._json('error', obj, msg); },
};

// ── Rate limiting (in-process, per-IP) ───────────────────────────────────────

const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const { windowMs, max } = cfg.rateLimit;
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  return entry.count <= max;
}

// ── Fastify instance ──────────────────────────────────────────────────────────

const fastify = Fastify({
  // Use built-in logger (pino-compatible JSON to stderr)
  logger: false, // We use our own structured logger via hooks
  trustProxy: true,
  requestTimeout: 30000,
});

// ── Request ID + structured logging ─────────────────────────────────────────

let reqIdCounter = 0;
fastify.addHook('onRequest', async (req, reply) => {
  const id = req.headers['x-request-id'] || `req-${++reqIdCounter}`;
  req.reqId = id;
  reply.header('X-Request-ID', id);
  log.info({ reqId: id, method: req.method, url: req.url, ip: req.ip }, 'request');
});

fastify.addHook('onResponse', async (req, reply) => {
  log.info({ reqId: req.reqId, status: reply.statusCode, ms: Math.round(reply.elapsedTime) }, 'response');
});

// ── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  `http://localhost:${cfg.port}`,
  `http://127.0.0.1:${cfg.port}`,
];

fastify.addHook('onRequest', async (req, reply) => {
  const origin = req.headers['origin'];
  if (origin && allowedOrigins.includes(origin)) {
    reply.header('Access-Control-Allow-Origin', origin);
  } else {
    reply.header('Access-Control-Allow-Origin', `http://localhost:${cfg.port}`);
  }
  reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
});

fastify.options('/*', async (req, reply) => {
  reply.code(204).send();
});

// ── Rate limit hook ───────────────────────────────────────────────────────────

fastify.addHook('onRequest', async (req, reply) => {
  if (!checkRateLimit(req.ip)) {
    reply.code(429).send({ ok: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
  }
});

// ── Auth hook ────────────────────────────────────────────────────────────────

function checkAuth(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return authHeader.slice(7) === cfg.auth.token;
}

fastify.addHook('preHandler', async (req, reply) => {
  // Skip auth for: /, /index.html, /health, OPTIONS, WebSocket upgrade, and skip-auth routes
  const skip =
    req.routeOptions?.config?.skipAuth ||
    req.url === '/' ||
    req.url === '/index.html' ||
    req.url === '/health' ||
    req.url.startsWith('/health?') ||
    req.method === 'OPTIONS' ||
    req.headers.upgrade === 'websocket';

  if (skip) return;

  if (!checkAuth(req)) {
    reply.code(401).send({ ok: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' });
  }
});

// ── Serve dashboard HTML ──────────────────────────────────────────────────────

fastify.get('/', { config: { skipAuth: true } }, async (req, reply) => {
  // Try canvas HTML first, fall back to local index.html
  const canvasPath = cfg.paths.canvasHtml;
  const localPath = path.join(__dirname, '..', 'index.html');

  for (const p of [canvasPath, localPath]) {
    if (fs.existsSync(p)) {
      const html = fs.readFileSync(p, 'utf8');
      reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(html);
      return;
    }
  }
  reply.code(404).send('Dashboard HTML not found');
});

fastify.get('/index.html', { config: { skipAuth: true } }, async (req, reply) => {
  reply.redirect('/');
});

// ── API Routes ────────────────────────────────────────────────────────────────

fastify.register(require('./routes/health'));
fastify.register(require('./routes/data'));
fastify.register(require('./routes/cron'));
fastify.register(require('./routes/cost'));

// ── 404 handler ───────────────────────────────────────────────────────────────

fastify.setNotFoundHandler(async (req, reply) => {
  reply.code(404).send({ ok: false, error: 'Not found', code: 'NOT_FOUND' });
});

// ── Error handler ─────────────────────────────────────────────────────────────

fastify.setErrorHandler(async (err, req, reply) => {
  // Fastify validation errors
  if (err.validation) {
    reply.code(400).send({ ok: false, error: err.message, code: 'BAD_REQUEST' });
    return;
  }
  log.error({ reqId: req.reqId, err: err.message, stack: err.stack }, 'unhandled error');
  reply.code(500).send({ ok: false, error: 'Internal server error', code: 'SERVER_ERROR' });
});

// ── WebSocket Server ──────────────────────────────────────────────────────────
// Manual integration using the 'ws' library — avoids @fastify/websocket complexity
// and keeps the upgrade path decoupled from Fastify routing.

const VALID_ROOMS = new Set(cfg.websocket.rooms);

// roomClients: room → Set<WebSocket>
const roomClients = new Map();
for (const room of VALID_ROOMS) roomClients.set(room, new Set());

let wss = null; // created after server starts

/**
 * Broadcast a message to all clients subscribed to a room.
 * @param {string} room
 * @param {object} payload
 */
function broadcast(room, payload) {
  const clients = roomClients.get(room);
  if (!clients || clients.size === 0) return;
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(msg);
    }
  }
}

function setupWebSocket(server) {
  wss = new WebSocketServer({ noServer: true });

  // Handle upgrade manually so we can validate ?room= before accepting
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Auth check on WS handshake (token in query param or Authorization header)
    const token = url.searchParams.get('token') || (() => {
      const auth = request.headers['authorization'] || '';
      return auth.startsWith('Bearer ') ? auth.slice(7) : null;
    })();
    if (token !== cfg.auth.token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const room = url.searchParams.get('room');
    if (!room || !VALID_ROOMS.has(room)) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws._room = room;
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    const room = ws._room;
    roomClients.get(room).add(ws);
    log.info({ room, clients: roomClients.get(room).size }, 'ws connected');

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', room, ts: Date.now() }));

    ws.on('close', () => {
      roomClients.get(room).delete(ws);
      log.info({ room, clients: roomClients.get(room).size }, 'ws disconnected');
    });

    ws.on('error', (err) => {
      log.warn({ room, err: err.message }, 'ws error');
      roomClients.get(room).delete(ws);
    });

    // Pong handler for keep-alive
    ws.on('ping', () => ws.pong());
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  try {
    await fastify.listen({ port: cfg.port, host: cfg.host });
    setupWebSocket(fastify.server);
    log.info({ port: cfg.port, host: cfg.host, ws: '/ws?room=<room>' }, 'NEXUS Dashboard started');
    log.info({ rooms: [...VALID_ROOMS] }, 'WebSocket rooms available');
  } catch (err) {
    log.error({ err: err.message }, 'Failed to start server');
    process.exit(1);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  log.info({}, 'SIGTERM received, shutting down');
  if (wss) wss.close();
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  if (wss) wss.close();
  await fastify.close();
  process.exit(0);
});

start();

// Export for testing / programmatic use
module.exports = { fastify, broadcast };
