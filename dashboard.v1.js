#!/usr/bin/env node
// Claw Ops Dashboard — HTTP polling server (NEXUS v2 — Phase 0 patched)
// Browser polls this server; this server execs openclaw CLI
// No WebSocket needed; gateway stays untouched

const http = require('http');
const { execSync, spawnSync, spawn: spawnProcess } = require('child_process');
const fs = require('fs');
const url = require('url');
const path = require('path');

const PORT = 18790;
const HOST = '0.0.0.0';
const CANVAS_HTML = '/Users/openclaw/.openclaw/canvas/index.html';
const REFRESH_MS = 30000;
const IDLE_MS = 300000;

const TOKEN = '52700a12570c54a80cb138b0d2322deb7238875879541ce6';
const GW_URL = 'http://127.0.0.1:18789';

// ── T0.1.7: Rate limiting (100 req/min per IP) ──────────────────────────────
const rateLimitMap = new Map(); // ip → { count, resetAt }
const RATE_LIMIT_WINDOW = 60_000; // 60 seconds
const RATE_LIMIT_MAX = 100;

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  // Periodic cleanup: evict expired entries every 100 checks
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }
  return entry.count <= RATE_LIMIT_MAX;
}

// ── T0.1.3: Auth middleware
// ── T0.2.4: Circuit breaker (3 consecutive CLI failures → cached mode)
let cliFailCount = 0;
const CLI_FAIL_THRESHOLD = 3;
let circuitOpen = false;
let circuitOpenSince = 0;
const CIRCUIT_COOLDOWN = 60_000; // retry after 60s
const cliCache = new Map(); // last known good responses

function wrapCli(fn, cacheKey) {
  if (circuitOpen && Date.now() - circuitOpenSince < CIRCUIT_COOLDOWN) {
    const cached = cliCache.get(cacheKey);
    log.warn({ circuit: 'open', cacheKey, cached: !!cached }, 'Circuit breaker open, returning cached');
    return cached;
  }
  const result = fn();
  if (result === null || (typeof result === 'string' && result.startsWith('ERROR'))) {
    cliFailCount++;
    if (cliFailCount >= CLI_FAIL_THRESHOLD) {
      circuitOpen = true;
      circuitOpenSince = Date.now();
      log.error({ cliFailCount, cacheKey }, 'Circuit breaker opened');
    }
  } else {
    cliFailCount = 0;
    if (circuitOpen) { circuitOpen = false; log.info({ cacheKey }, 'Circuit breaker closed'); }
    cliCache.set(cacheKey, result);
  }
  return result;
}

// ── T0.3.1-2: Structured logging with request IDs
let reqIdCounter = 0;
const log = {
  _json(level, obj, msg) {
    const entry = { level, ts: new Date().toISOString(), ...obj, msg };
    process.stderr.write(JSON.stringify(entry) + '\n');
  },
  info(obj, msg) { this._json('info', typeof obj === 'string' ? { msg: obj } : obj, msg || ''); },
  warn(obj, msg) { this._json('warn', typeof obj === 'string' ? { msg: obj } : obj, msg || ''); },
  error(obj, msg) { this._json('error', typeof obj === 'string' ? { msg: obj } : obj, msg || ''); },
};

// ── T0.1.3: Auth middleware ──────────────────────────────────────────────────
function checkAuth(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === TOKEN;
}

// ── CLI wrappers ─────────────────────────────────────────────────────────────

function exec(cmd, timeout = 15000) {
  try {
    return execSync(cmd, { timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const err = `ERROR(${e.status}): stdout=${e.stdout?.slice(0,300)} stderr=${e.stderr?.slice(0,300)}`;
    console.error('[exec] FAILED:', cmd, '|', err);
    return err;
  }
}

function jexec(cmd) {
  const out = exec(cmd);
  if (!out || out.trim() === '') { console.error('[jexec] EMPTY OUTPUT for:', cmd); return null; }
  try { return JSON.parse(out); } catch(e) { console.error('[jexec] PARSE ERROR for:', cmd, '| got:', out.slice(0, 200)); return null; }
}

// ── Safe spawn helpers (argument array, no shell injection) ──

function validateCronId(id) {
  if (!id || typeof id !== 'string') throw new Error('Missing job id');
  if (!/^[\w\-.@]+$/.test(id)) throw new Error('Invalid job id format');
  return String(id);
}

function spawnCron(args, timeout) {
  const ms = timeout || 30000;
  const result = spawnSync(OPENCLAW_NODE, [OPENCLAW_CLI, ...args], {
    timeout: ms,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error(result.error.message);
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || '').trim() || 'Command failed';
    throw new Error(msg.slice(0, 500));
  }
  return result.stdout || '';
}

// T0.1.5: jspawnCron returns {ok: false, error} on failure instead of null/throw
function jspawnCron(args, timeout) {
  try {
    const out = spawnCron(args, timeout);
    if (!out.trim()) return { ok: true, data: null };
    try { return { ok: true, data: JSON.parse(out) }; } catch { return { ok: true, data: { raw: out.slice(0, 500) } }; }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 65536) req.destroy(new Error('Request body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Invalid JSON body')); } });
    req.on('error', reject);
  });
}

// ── Data fetchers ────────────────────────────────────────────────────────────

const NODE = '/opt/homebrew/opt/node@22/bin/node';

// Use node directly to run openclaw CLI — bypasses shebang env lookup issues
const OPENCLAW_NODE = '/opt/homebrew/opt/node@22/bin/node';
const OPENCLAW_CLI = '/opt/homebrew/bin/openclaw';
const OPENCLAW = `${OPENCLAW_NODE} ${OPENCLAW_CLI}`;

function getStatus() {
  return jexec(`${OPENCLAW} status --deep --json`);
}

function getCronList() {
  return jexec(`${OPENCLAW} cron list --all --json`);
}

function getHealth() {
  return jexec(`${OPENCLAW} health --json`);
}

// T0.1.4: Fixed shell injection — uses spawnSync with array args, validates limit
function getLogs(limit = 30) {
  // Validate limit is a positive integer
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit)) || 30, 500));
  const result = spawnSync(OPENCLAW_NODE, [OPENCLAW_CLI, 'logs', '--json', '--limit', String(safeLimit)], {
    timeout: 15000,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    console.error('[getLogs] FAILED:', result.stderr?.slice(0, 200) || result.error?.message);
    return [];
  }
  return (result.stdout || '').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// ── System metrics (macOS) ────────────────────────────────────────────────────

function getSysMetrics() {
  const node = NODE;

  const out = exec(`${NODE} /tmp/claw_sysmetrics.js`, 15000);
  try {
    const data = JSON.parse(out);
    // Update sparkline history
    const cpuPct = data.cpu ? 100 - data.cpu.idlePct : 0;
    const memPct = data.mem ? data.mem.pct : 0;
    const diskPct = data.disk ? data.disk.pct : 0;
    sysHistory.cpu.push(cpuPct);
    sysHistory.mem.push(memPct);
    sysHistory.disk.push(diskPct);
    sysHistory.ts.push(Date.now());
    if (sysHistory.cpu.length > SYS_HISTORY_MAX) {
      sysHistory.cpu.shift(); sysHistory.mem.shift(); sysHistory.disk.shift(); sysHistory.ts.shift();
    }
    data.sysHistory = { ...sysHistory };
    return data;
  } catch(e) { console.error('[sysmetrics] parse error:', out?.slice(0,200)); return null; }
}

// Write static sysmetrics script once on startup
const SYS_SCRIPT = `
const os = require('os');
const { execSync } = require('child_process');
function getMem(){const t=os.totalmem(),f=os.freemem();return{total:t,free:f,used:t-f,pct:Math.round(((t-f)/t)*100)};}
function getCpu(){const c=os.cpus();let idle=0,total=0;c.forEach(x=>{const t=Object.values(x.times).reduce((a,b)=>a+b,0);idle+=x.times.idle;total+=t;});return{cores:c.length,idlePct:Math.round((idle/total)*100)};}
function getDisk(){try{const o=execSync('/bin/df -k / | tail -1',{encoding:'utf8'}).trim().split(/\\s+/);return{total:parseInt(o[1])*1024,used:parseInt(o[2])*1024,free:parseInt(o[3])*1024,pct:Math.round((parseInt(o[2])/parseInt(o[1]))*100)};}catch(e){return null;}}
function getNet(){try{const b=execSync('/usr/sbin/netstat -ib | grep -E "^en0"',{encoding:'utf8'}).trim().split('\\n').pop();const c=b.split(/\\s+/).filter(Boolean);return{rx:parseInt(c[6])||0,tx:parseInt(c[9])||0};}catch(e){return null;}}
function getLoad(){try{const o=execSync('/usr/sbin/sysctl -n vm.loadavg',{encoding:'utf8'}).trim().replace(/[{}]/g,'').trim().split(/\\s+/).map(Number);return{m1:o[0],m5:o[1],m15:o[2]};}catch(e){return null;}}
function getUptime(){const t=os.uptime();const d=Math.floor(t/86400),h=Math.floor((t%86400)/3600),m=Math.floor((t%3600)/60);return{raw:t,str:d>0?d+'d '+h+'h '+m+'m':h+'h '+m+'m'};}
function getProcs(){try{return parseInt(execSync('/bin/ps -ax | wc -l',{encoding:'utf8'}).trim());}catch(e){return null;}}
let temp=null;try{const t=execSync('osx-cpu-temp -c 2>/dev/null || echo ""',{encoding:'utf8'}).trim();if(t)temp=parseFloat(t);}catch(e){}
let battery=null;try{const o=execSync('/usr/bin/pmset -g batt | grep -E "[0-9]+%"',{encoding:'utf8'}).trim();const m=o.match(/(\\d+)%/);if(m)battery={pct:parseInt(m[1]),charging:o.includes('AC')};}catch(e){}
const hostname=os.hostname();let osver=null;try{osver=execSync('/usr/bin/sw_vers -productVersion',{encoding:'utf8'}).trim();}catch(e){}
console.log(JSON.stringify({hostname,osver,nodeVersion:process.versions.node,cpu:getCpu(),mem:getMem(),disk:getDisk(),net:getNet(),load:getLoad(),uptime:getUptime(),procs:getProcs(),temp,battery,ts:Date.now()}));
`;

try { fs.writeFileSync('/tmp/claw_sysmetrics.js', SYS_SCRIPT.trim()); } catch(e) { console.error('[sysmetrics] failed to write script:', e.message); }

// ── Sysmetrics history (for sparklines) ──────────────────────────────────────
const SYS_HISTORY_MAX = 20;
const sysHistory = { cpu: [], mem: [], disk: [], ts: [] };

// ── Model usage ─────────────────────────────────────────────────────────────

// Prices per 1M tokens (MiniMax M2.7 approximate)
const MODEL_PRICES = {
  'MiniMax-M2.7':     { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0.10 },
  'minimax/MiniMax-M2.7': { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0.10 },
  'default':           { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0.10 },
};

// T0.1.6: Backend sessionCost includes cacheWrite — single source of truth
function sessionCost(s) {
  const m = MODEL_PRICES[s.model] || MODEL_PRICES['default'];
  const i = s.inputTokens || 0;
  const o = s.outputTokens || 0;
  const cr = s.cacheRead || 0;
  const cw = s.cacheWrite || 0;
  return (i/1e6)*m.input + (o/1e6)*m.output + (cr/1e6)*m.cacheRead + (cw/1e6)*m.cacheWrite;
}

function getModelUsage() {
  const status = getStatus();
  if (!status) return null;
  const sessions = status.sessions?.recent || [];
  const byModel = {};
  let totalCost = 0;
  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;

  sessions.forEach(s => {
    const model = s.model || 'unknown';
    if (!byModel[model]) byModel[model] = { sessions: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    byModel[model].sessions++;
    byModel[model].inputTokens += s.inputTokens || 0;
    byModel[model].outputTokens += s.outputTokens || 0;
    byModel[model].cacheRead += s.cacheRead || 0;
    byModel[model].cacheWrite += s.cacheWrite || 0;
    const c = sessionCost(s);
    byModel[model].cost += c;
    totalCost += c;
    totalInput += s.inputTokens || 0;
    totalOutput += s.outputTokens || 0;
    totalCacheRead += s.cacheRead || 0;
    totalCacheWrite += s.cacheWrite || 0;
  });

  return {
    sessions,
    byModel,
    totals: { inputTokens: totalInput, outputTokens: totalOutput, cacheRead: totalCacheRead, cacheWrite: totalCacheWrite, cost: totalCost, sessionCount: sessions.length },
    ts: Date.now()
  };
}

// ── Research pipeline ─────────────────────────────────────────────────────────

function getResearchPipeline() {
  const researchDir = '/Users/openclaw/.openclaw/workspace/research';

  const dailyFiles = (() => {
    try {
      return fs.readdirSync(researchDir)
        .filter(f => f.startsWith('daily-research') && f.endsWith('.md') && !f.endsWith('-latest.md'))
        .sort()
        .reverse()
        .slice(0, 7);
    } catch { return []; }
  })();

  const daily = dailyFiles.map(f => {
    try {
      const content = fs.readFileSync(path.join(researchDir, f), 'utf8');
      const m = content.match(/^#\s+(.+)/m);
      const tsMatch = content.match(/(\d{4}-\d{2}-\d{2}T[\d:]+)/);
      const lines = content.split('\n').length;
      const tokMatch = content.match(/(?:tokens?|tok)[:\s]+([0-9]+)/i);
      return {
        file: f,
        title: m ? m[1].trim() : f,
        ts: tsMatch ? new Date(tsMatch[1]).getTime() : fs.statSync(path.join(researchDir, f)).mtimeMs,
        lines,
        tokens: tokMatch ? parseInt(tokMatch[1].replace(/,/g,'')) : null,
        sizeKb: Math.round(fs.statSync(path.join(researchDir, f)).size / 1024)
      };
    } catch { return null; }
  }).filter(Boolean);

  const findingsOrder = ['bets', 'general', 'misc', 'news', 'ww', 'status'];
  const findings = findingsOrder.map(name => {
    try {
      const jsonPath = path.join(researchDir, `${name}-findings.json`);
      if (!fs.existsSync(jsonPath)) return { name, exists: false };
      const stats = fs.statSync(jsonPath);
      const raw = fs.readFileSync(jsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        name,
        exists: true,
        posted: parsed.posted !== false,
        postedAt: parsed.postedAt || (parsed.posted ? stats.mtimeMs : null),
        generatedAt: parsed.generatedAt || stats.mtimeMs,
        channel: parsed.channel || null,
        summary: parsed.summary || null,
        tokenCost: parsed.tokenCost || null,
        mtimeMs: stats.mtimeMs
      };
    } catch { return { name, exists: false }; }
  });

  let sessionState = null;
  try {
    const ssPath = path.join(researchDir, 'SESSION_STATE.md');
    if (fs.existsSync(ssPath)) {
      const content = fs.readFileSync(ssPath, 'utf8');
      const dateMatch = content.match(/\|\s*(\d{4}-\d{2}-\d{2})\s*\|/g);
      const lastUpdatedMatch = content.match(/Last updated:\s*(.+)/i);
      sessionState = {
        lastUpdated: lastUpdatedMatch ? lastUpdatedMatch[1].trim() : null,
        entryCount: dateMatch ? dateMatch.length : 0
      };
    }
  } catch {}

  let posterLastRun = null;
  try {
    const log = exec('grep -r "posted" /Users/openclaw/.openclaw/workspace/research/post-all.py 2>/dev/null | tail -1 || echo "never"');
    posterLastRun = log.includes('posted') ? 'script exists' : 'check manually';
  } catch { posterLastRun = null; }

  return { daily, findings, sessionState, posterLastRun, ts: Date.now() };
}

// ── HTTP Server ─────────────────────────────────────────────────────────────

// T0.1.6: Helper to get session cost from API response (frontend uses this, no duplication)
function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
  res.end(JSON.stringify(data));
}

async function route(req, res) {
  // T0.2.1: Request timeout (30s)
  const timeoutId = setTimeout(() => { if (!res.writableEnded) { res.writeHead(504, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'Request timeout',code:'TIMEOUT'})); } }, 30000);
  res.on('close', () => clearTimeout(timeoutId));

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const clientIp = req.socket.remoteAddress;
  // T0.3.2: Request ID
  const reqId = ++reqIdCounter;
  const clientReqId = req.headers['x-request-id'] || `req-${reqId}`;
  res.setHeader('X-Request-ID', clientReqId);

  // T0.1.7: Rate limiting
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED' }));
    return;
  }

  // T0.1.2: CORS — same-origin only (localhost)
  const origin = req.headers['origin'];
  const allowedOrigins = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', `http://localhost:${PORT}`);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check (unauthenticated)
  if (pathname === '/health') {
    sendJson(res, { ok: true, ts: Date.now() });
    return;
  }

  // T0.3.4: Detailed health check (authenticated)
  if (pathname === '/health/detailed') {
    if (!checkAuth(req)) { sendJson(res, {ok:false,error:'Unauthorized',code:'AUTH_REQUIRED'}, 401); return; }
    const checks = {};
    // CLI reachability
    try {
      const r = spawnSync(OPENCLAW_NODE, [OPENCLAW_CLI, '--version'], {timeout:5000, encoding:'utf8', stdio:['ignore','pipe','pipe']});
      checks.cli = { ok: r.status === 0, version: (r.stdout||'').trim(), ms: r.durationMs };
    } catch(e) { checks.cli = { ok: false, error: e.message }; }
    // Gateway reachability
    try {
      const r = spawnSync('/usr/bin/curl', ['-s','-o','/dev/null','-w','%{http_code}','--max-time','3','http://127.0.0.1:18789/health'], {timeout:5000,encoding:'utf8',stdio:['ignore','pipe','pipe']});
      checks.gateway = { ok: r.stdout?.trim() === '200', statusCode: r.stdout?.trim() };
    } catch(e) { checks.gateway = { ok: false, error: e.message }; }
    // Disk space
    try {
      const stat = fs.statSync('/');
      const df = execSync('/bin/df -k / | tail -1', {encoding:'utf8'}).trim().split(/\s+/);
      const free = parseInt(df[3]) * 1024;
      checks.disk = { ok: free > 10*1024*1024*1024, freeGb: Math.round(free/1024/1024/1024*10)/10 };
    } catch(e) { checks.disk = { ok: false, error: e.message }; }
    // Memory pressure
    try {
      const mp = execSync('memory_pressure', {encoding:'utf8',timeout:5000});
      checks.memory = { ok: !mp.includes('critical'), summary: mp.trim().split('\n')[0] };
    } catch(e) { checks.memory = { ok: true, note: 'memory_pressure not available' }; }
    // Circuit breaker state
    checks.circuitBreaker = { open: circuitOpen, failCount: cliFailCount };
    sendJson(res, { ok: true, checks, ts: Date.now() });
    return;
  }

  // Serve HTML dashboard (unauthenticated — browser loads this directly)
  if (pathname === '/' || pathname === '/index.html') {
    try {
      const html = fs.readFileSync(CANVAS_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    } catch(e) {
      res.writeHead(500);
      res.end('Dashboard HTML not found: ' + e.message);
    }
    return;
  }

  // T0.1.3: All /api/* routes require Bearer token auth
  if (pathname.startsWith('/api/') && !checkAuth(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' }));
    return;
  }

  // API: fetch all data server-side and return JSON
  if (pathname === '/api/data') {
    const [status, cron, health, logs] = [
      getStatus(),
      getCronList(),
      getHealth(),
      getLogs(30)
    ];
    if (status && cron && cron?.jobs) {
      status.cron = cron;
    }
    sendJson(res, { status, cron, health, logs, ts: Date.now() });
    return;
  }

  // API: fetch logs only
  if (pathname === '/api/logs') {
    const logs = getLogs(50);
    sendJson(res, { logs, ts: Date.now() });
    return;
  }

  // API: system metrics
  if (pathname === '/api/sysmetrics') {
    const metrics = getSysMetrics();
    sendJson(res, { metrics, ts: Date.now() });
    return;
  }

  // API: model usage
  if (pathname === '/api/modelusage') {
    const usage = getModelUsage();
    sendJson(res, { usage, ts: Date.now() });
    return;
  }

  // API: research pipeline
  if (pathname === '/api/research') {
    const research = getResearchPipeline();
    sendJson(res, { research, ts: Date.now() });
    return;
  }

  // API: cron toggle (enable/disable)
  if (pathname === '/api/cron/toggle' && req.method === 'POST') {
    try {
      const { id, enabled } = await readBody(req);
      validateCronId(id);
      if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
      const result = jspawnCron(['cron', enabled ? 'enable' : 'disable', String(id)]);
      if (!result.ok) {
        sendJson(res, { ok: false, error: result.error, code: 'CLI_ERROR' }, 500);
        return;
      }
      sendJson(res, { ok: true, ts: Date.now() });
    } catch(e) {
      sendJson(res, { ok: false, error: e.message, code: 'BAD_REQUEST' }, 400);
    }
    return;
  }

  // API: cron run (fire-and-forget)
  if (pathname === '/api/cron/run' && req.method === 'POST') {
    try {
      const { id } = await readBody(req);
      validateCronId(id);
      const proc = spawnProcess(OPENCLAW_NODE, [OPENCLAW_CLI, 'cron', 'run', String(id)], { stdio: 'ignore' });
      proc.on('error', err => console.error('[cron run]', err.message));
      sendJson(res, { ok: true, dispatched: true, ts: Date.now() });
    } catch(e) {
      sendJson(res, { ok: false, error: e.message, code: 'BAD_REQUEST' }, 400);
    }
    return;
  }

  // API: cron run history
  if (pathname === '/api/cron/runs' && req.method === 'GET') {
    try {
      const jobId = parsed.query.id;
      validateCronId(jobId);
      const limit = Math.min(parseInt(parsed.query.limit || '30', 10) || 30, 100);
      const result = jspawnCron(['cron', 'runs', '--id', String(jobId), '--limit', String(limit)]);
      if (!result.ok) {
        sendJson(res, { ok: false, error: result.error, code: 'CLI_ERROR' }, 500);
        return;
      }
      sendJson(res, { runs: result.data, ts: Date.now() });
    } catch(e) {
      sendJson(res, { ok: false, error: e.message, code: 'BAD_REQUEST' }, 400);
    }
    return;
  }

  // API: cron edit
  if (pathname === '/api/cron/edit' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { id, name, description, schedule, enabled } = body;
      validateCronId(id);

      const args = ['cron', 'edit', String(id)];
      if (typeof name === 'string' && name.trim()) args.push('--name', name.trim());
      if (typeof description === 'string') args.push('--description', description.trim());
      if (typeof enabled === 'boolean') args.push(enabled ? '--enable' : '--disable');
      if (schedule) {
        if (schedule.kind === 'every' && schedule.every) {
          args.push('--every', String(schedule.every).trim());
        } else if (schedule.kind === 'cron' && schedule.expr) {
          args.push('--cron', String(schedule.expr).trim());
          if (schedule.tz) args.push('--tz', String(schedule.tz).trim());
        } else if (schedule.kind === 'at' && schedule.at) {
          args.push('--at', String(schedule.at).trim());
        }
      }
      if (args.length <= 3) {
        sendJson(res, { ok: true, noChanges: true, ts: Date.now() });
        return;
      }
      const result = jspawnCron(args);
      if (!result.ok) {
        sendJson(res, { ok: false, error: result.error, code: 'CLI_ERROR' }, 500);
        return;
      }
      sendJson(res, { ok: true, result: result.data, ts: Date.now() });
    } catch(e) {
      sendJson(res, { ok: false, error: e.message, code: 'BAD_REQUEST' }, 400);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found', code: 'NOT_FOUND' }));
}

const server = http.createServer(route);
server.headersTimeout = 31000;
server.requestTimeout = 31000;
server.listen(PORT, HOST, () => {
  log.info({ port: PORT, refresh: REFRESH_MS/1000, idle: IDLE_MS/1000 }, 'NEXUS Dashboard started');
});
