'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const { getConfig } = require('../config');

// ── Sysmetrics script (written to /tmp on first call) ────────────────────────

const SYS_SCRIPT_PATH = '/tmp/claw_sysmetrics.js';

const SYS_SCRIPT = `
const os = require('os');
const { execSync } = require('child_process');
function getMem(){const t=os.totalmem(),f=os.freemem();return{total:t,free:f,used:t-f,pct:Math.round(((t-f)/t)*100)};}
function getCpu(){const c=os.cpus();let idle=0,total=0;c.forEach(x=>{const t=Object.values(x.times).reduce((a,b)=>a+b,0);idle+=x.times.idle;total+=t;});return{cores:c.length,idlePct:Math.round((idle/total)*100)};}
function getDisk(){try{const o=execSync('/bin/df -k / | tail -1',{encoding:'utf8'}).trim().split(/\\s+/);return{total:parseInt(o[1])*1024,used:parseInt(o[2])*1024,free:parseInt(o[3])*1024,pct:Math.round((parseInt(o[2])/parseInt(o[1]))*100)};}catch(e){return null;}}
function getNet(){try{const b=execSync('/usr/sbin/netstat -ib | grep -E "^en0"',{encoding:'utf8'}).trim().split('\\n').pop();const c=b.split(/\\s+/).filter(Boolean);return{rx:parseInt(c[6])||0,tx:parseInt(c[9])||0};}catch(e){return null;}}
function getLoad(){try{const o=execSync('/usr/sbin/sysctl -n vm.loadavg',{encoding:'utf8'}).trim().replace(/[{}]/g,'').trim().split(/\\s+/).map(Number);return{m1:o[0],m5:o[1],m15:o[2]};}catch(e){return null;}}
function getUptime(){const t=os.uptime();const d=Math.floor(t/86400),h=Math.floor((t%86400)/3600),m=Math.floor((t%3600)/60);return{raw:t,str:d>0?d+'h '+h+'h '+m+'m':h+'h '+m+'m'};}
function getProcs(){try{return parseInt(execSync('/bin/ps -ax | wc -l',{encoding:'utf8'}).trim());}catch(e){return null;}}
let temp=null;try{const t=execSync('osx-cpu-temp -c 2>/dev/null || echo ""',{encoding:'utf8'}).trim();if(t)temp=parseFloat(t);}catch(e){}
let battery=null;try{const o=execSync('/usr/bin/pmset -g batt | grep -E "[0-9]+%"',{encoding:'utf8'}).trim();const m=o.match(/(\\d+)%/);if(m)battery={pct:parseInt(m[1]),charging:o.includes('AC')};}catch(e){}
const hostname=os.hostname();let osver=null;try{osver=execSync('/usr/bin/sw_vers -productVersion',{encoding:'utf8'}).trim();}catch(e){}
console.log(JSON.stringify({hostname,osver,nodeVersion:process.versions.node,cpu:getCpu(),mem:getMem(),disk:getDisk(),net:getNet(),load:getLoad(),uptime:getUptime(),procs:getProcs(),temp,battery,ts:Date.now()}));
`.trim();

let _scriptWritten = false;

function ensureScript() {
  if (_scriptWritten) return;
  try {
    fs.writeFileSync(SYS_SCRIPT_PATH, SYS_SCRIPT);
    _scriptWritten = true;
  } catch (e) { /* script write failed — getSysMetrics will error gracefully */ }
}

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

// ── Main getter ──────────────────────────────────────────────────────────────

function getSysMetrics() {
  ensureScript();
  const cfg = getConfig();
  const node = cfg.paths.openclawNode;

  const result = spawnSync(node, [SYS_SCRIPT_PATH], {
    timeout: 15000,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) return null;

  try {
    const data = JSON.parse(result.stdout);
    const cpuPct = data.cpu ? 100 - data.cpu.idlePct : 0;
    const memPct = data.mem ? data.mem.pct : 0;
    const diskPct = data.disk ? data.disk.pct : 0;
    pushHistory(cpuPct, memPct, diskPct);
    data.sysHistory = { ...sysHistory };
    return data;
  } catch { return null; }
}

// Write script on module load (non-fatal)
ensureScript();

module.exports = { getSysMetrics };
