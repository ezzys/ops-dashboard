'use strict';

const os = require('os');
const { spawnSync } = require('child_process');

// ── History (sparklines) ─────────────────────────────────────────────────────
const SYS_HISTORY_MAX = 20;
const sysHistory = { cpu: [], mem: [], disk: [], ts: [] };

function pushHistory(cpu, mem, disk) {
  sysHistory.cpu.push(cpu);
  sysHistory.mem.push(mem);
  sysHistory.disk.push(disk);
  sysHistory.ts.push(Date.now());
  if (sysHistory.cpu.length > SYS_HISTORY_MAX) {
    sysHistory.cpu.shift();
    sysHistory.mem.shift();
    sysHistory.disk.shift();
    sysHistory.ts.shift();
  }
}

// ── Inline metric collectors ──────────────────────────────────────────────────

function getMem() {
  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  return { total, free, used, pct: Math.round((used / total) * 100) };
}

function getCpu() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const c of cpus) {
    const t = Object.values(c.times).reduce((a, b) => a + b, 0);
    idle += c.times.idle;
    total += t;
  }
  return { cores: cpus.length, idlePct: Math.round((idle / total) * 100) };
}

function getLoad() {
  const [m1, m5, m15] = os.loadavg();
  return { m1, m5, m15 };
}

function getUptime() {
  const t = os.uptime();
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  return { raw: t, str: d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m` };
}

function getDisk() {
  // df cannot be replicated with the os module — keep spawn with array args
  try {
    const r = spawnSync('/bin/df', ['-k', '/'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0 || r.error) return null;
    const line = r.stdout.trim().split('\n').pop();
    const cols = line.trim().split(/\s+/);
    const t = parseInt(cols[1]) * 1024;
    const u = parseInt(cols[2]) * 1024;
    const f = parseInt(cols[3]) * 1024;
    return { total: t, used: u, free: f, pct: Math.round((u / t) * 100) };
  } catch { return null; }
}

function getNet() {
  try {
    const r = spawnSync('/usr/sbin/netstat', ['-ib'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0 || r.error) return null;
    const line = r.stdout.trim().split('\n').find(l => l.startsWith('en0'));
    if (!line) return null;
    const cols = line.split(/\s+/).filter(Boolean);
    return { rx: parseInt(cols[6]) || 0, tx: parseInt(cols[9]) || 0 };
  } catch { return null; }
}

function getBattery() {
  try {
    const r = spawnSync('/usr/bin/pmset', ['-g', 'batt'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0 || r.error) return null;
    const m = r.stdout.match(/(\d+)%/);
    if (!m) return null;
    return { pct: parseInt(m[1]), charging: r.stdout.includes('AC') };
  } catch { return null; }
}

function getOsVer() {
  try {
    const r = spawnSync('/usr/bin/sw_vers', ['-productVersion'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return r.status === 0 ? r.stdout.trim() : null;
  } catch { return null; }
}

function getProcs() {
  try {
    const r = spawnSync('/bin/ps', ['-ax'], {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0 || r.error) return null;
    return r.stdout.trim().split('\n').length;
  } catch { return null; }
}

// ── Main getter ──────────────────────────────────────────────────────────────

function getSysMetrics() {
  try {
    const cpu     = getCpu();
    const mem     = getMem();
    const disk    = getDisk();
    const net     = getNet();
    const load    = getLoad();
    const uptime  = getUptime();
    const procs   = getProcs();
    const battery = getBattery();
    const osver   = getOsVer();
    const hostname = os.hostname();

    const cpuPct  = cpu ? 100 - cpu.idlePct : 0;
    const memPct  = mem ? mem.pct : 0;
    const diskPct = disk ? disk.pct : 0;
    pushHistory(cpuPct, memPct, diskPct);

    return {
      hostname,
      osver,
      nodeVersion: process.versions.node,
      cpu,
      mem,
      disk,
      net,
      load,
      uptime,
      procs,
      temp: null,
      battery,
      sysHistory: { ...sysHistory },
      ts: Date.now(),
    };
  } catch { return null; }
}

module.exports = { getSysMetrics };
