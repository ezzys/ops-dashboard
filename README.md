# Claw Ops Dashboard — Legacy Audit & Modernization Blueprint

> **Status:** Legacy | **Date:** 2026-04-18 | **Files:** 3 source files (~108KB)  
> **Repo:** `~/projects/ops-dashboard/` | **Live:** `http://192.168.1.201:18790/`  
> **Reviewed by:** Claude Code (x2 parallel tasks) + Gemini CLI research

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [File Inventory](#3-file-inventory)
4. [Backend Audit: `dashboard.js`](#4-backend-audit-dashboardjs)
5. [Frontend Audit: `index.html`](#5-frontend-audit-indexhtml)
6. [Security Issues](#6-security-issues)
7. [Performance Analysis](#7-performance-analysis)
8. [Modernization Roadmap](#8-modernization-roadmap)
9. [Git Commit Log](#9-git-commit-log)

---

## 1. Project Overview

**What it does:** Monitors OpenClaw/Hermes agent system — health, cron jobs, sessions, model token usage/costs, research pipeline, system metrics (CPU/RAM/disk/network on macOS).

**Tabs:** Health | Research | Schedule | System | Sessions | Cost | Logs

**Stack:**
- **Backend:** Plain Node.js `http` module (no framework), single `dashboard.js`
- **Frontend:** Vanilla JS SPA (~1339 lines, all CSS+JS embedded in `index.html`)
- **Serving:** Node.js on port 18790, launchd/plist-managed on macOS
- **Data source:** Polls `openclaw` CLI every 30s (`openclaw status --deep --json`, `cron list`, etc.)
- **Auth:** None (open CORS)

---

## 2. Architecture

```
Browser (HTTP polling 30s)
    ↓
dashboard.js  (Node.js HTTP :18790)
    ↓ shell exec (execSync/spawnSync)
openclaw CLI  →  openclaw gateway (:18789)
```

**Key design decisions (legacy):**
- HTTP polling (no WebSockets)
- CLI exec pattern (parse JSON stdout)
- No framework — raw `http.createServer`
- Single HTML file with embedded CSS/JS
- macOS-only system metrics

---

## 3. File Inventory

| File | Lines | Size | Purpose |
|------|-------|------|---------|
| `dashboard.js` | 558 | 22KB | Node.js HTTP server — all backend |
| `index.html` | ~1339 | 84KB | Single-file SPA — all frontend |
| `com.ai.openclaw.ops-dashboard.plist` | — | 1KB | macOS launchd auto-start |
| `README.md` | — | this | Audit document |

---

## 4. Backend Audit: `dashboard.js`

### Code Quality: ⚠️ MEDIUM-LOW

**Good patterns:**
- Argument arrays for `spawnCron()` (no shell injection in cron calls) — L47–61
- `validateCronId()` with regex whitelist — L41–45
- Request body size limit — L72
- JSON error handling in `jexec()` — L33–37

**Problematic patterns:**

| # | Issue | Lines | Severity |
|---|-------|-------|----------|
| B1 | Hardcoded TOKEN defined but never used — all routes unauthenticated | L18 | 🔴 CRITICAL |
| B2 | Wildcard CORS (`*`) — any origin can trigger cron mutations | L391–394 | 🔴 CRITICAL |
| B3 | Shell injection in `getLogs()` — `limit` interpolated into exec string | L100 | 🔴 CRITICAL |
| B4 | Unauthenticated cron toggle/edit — no ownership check | L453–534 | 🔴 CRITICAL |
| B5 | Arbitrary file read via grep — `exec()` on hardcoded path every API call | L377 | 🔴 CRITICAL |
| B6 | `exec()` swallows exit codes — returns error string, passes to `JSON.parse()` | L23–31 | 🟠 HIGH |
| B7 | Detached spawn with no exit tracking — caller gets `dispatched: true` regardless | L474 | 🟠 HIGH |
| B8 | No request timeouts — slow client attack possible | L69–76 | 🟠 HIGH |
| B9 | `sysHistory` race condition — non-atomic push-then-shift | L216–222 | 🟡 MEDIUM |
| B10 | macOS-only hardcoded paths — `/opt/homebrew/...`, `/Users/openclaw/...` | L80, 83–84, 14, 305 | 🟡 MEDIUM |
| B11 | Hardcoded MiniMax M2.7 token prices only — no multi-model support | L254–258 | 🟡 MEDIUM |
| B12 | `description` passed as CLI arg without sanitization | L510 | 🟡 MEDIUM |
| B13 | `/tmp/claw_sysmetrics.js` written once at startup — silent failure possible | L245 | 🟡 MEDIUM |
| B14 | No request logging / audit trail | — | 🟢 LOW |
| B15 | `OPENCLAW_CLI` path not validated | L49 | 🟢 LOW |

### CLI Exec Pattern Analysis

```
getStatus()     → execSync("openclaw status --deep --json")
getCronList()   → execSync("openclaw cron list --all --json")
getHealth()     → execSync("openclaw health --json")
getLogs(limit)  → execSync("openclaw logs --json --limit ${limit}")  ← ⚠️ INJECTION
```

**Problem:** `execSync(cmd)` with string interpolation. While `limit` goes through `parseInt`, the pattern is fragile. Should use `spawn` with array args throughout.

### Cron API Surface

| Endpoint | Method | Auth | Safety |
|----------|--------|------|--------|
| `/api/cron/toggle` | POST | ❌ None | ⚠️ format-only validation |
| `/api/cron/edit` | POST | ❌ None | ⚠️ description not sanitized |
| `/api/cron/run` | POST | ❌ None | ⚠️ detached spawn, no tracking |
| `/api/cron/runs` | GET | ❌ None | ✅ args in array |

### System Metrics (macOS-only)

Uses: `os.cpus()`, `os.totalmem()`, `df -k /`, `netstat -ib`, `sysctl vm.loadavg`, `os.uptime()`, `ps -ax`, `osx-cpu-temp`, `pmset -g batt`, `sw_vers`

**Not portable to:** Linux, Docker containers, cloud VMs.

---

## 5. Frontend Audit: `index.html`

### Code Quality: ⚠️ MEDIUM

**Good patterns:**
- `buildJobRow()` uses `document.createElement` for user data — prevents innerHTML XSS — L1013–1026
- `esc()` helper defined at L836
- Lazy loading via `S.loaded[tab]` — L581
- Visibility-based polling (30s active ↔ 5m idle) — L565
- iOS safe-area support for mobile nav
- Skeleton loading states
- `S.timers` object for interval management

**Problematic patterns:**

| # | Issue | Lines | Severity |
|---|-------|-------|----------|
| F1 | `esc()` defined but NEVER USED — all render functions interpolate raw user data | L836, 1070, 813, 1205, 1297 | 🔴 CRITICAL |
| F2 | Memory leak — tab timers not cleared on switch, only one cleared | L583 | 🔴 CRITICAL |
| F3 | Duplicate sysmetrics fetch — fetched twice per 30s cycle | L608, L627 | 🟠 HIGH |
| F4 | Race condition — `deriveIssues()` runs before `rd.research` is set | L614, 618–619 | 🟠 HIGH |
| F5 | Fragile DOM assumption — `.grid` selector for cron job insertion | L1041 | 🟠 HIGH |
| F6 | `fmt.num` truncates ≥1K to integer — 1500→`1K`, 9999→`10K` | L482 | 🟡 MEDIUM |
| F7 | No request deduplication — concurrent refreshes possible | — | 🟡 MEDIUM |
| F8 | No ARIA live regions for toast announcements | L839–848 | 🟡 MEDIUM |
| F9 | `accent-color` on checkbox — patchy browser support | L271 | 🟡 MEDIUM |
| F10 | `sessionId` not coerced to string before `.slice()` | L1205, L1253 | 🟡 MEDIUM |
| F11 | `fmt.ts` returns `'Invalid Date'` string instead of `'—'` on invalid dates | L487 | 🟢 LOW |

### XSS Attack Vector (Critical — F1)

Cron job names, log messages, and research labels are rendered via template literals without `esc()`:

```javascript
// renderSchedule() L1070
`<td><strong style="color:#e6edf3">${f.lines} ln</strong></td>`
// should be:
`<td><strong style="color:#e6edf3">${esc(f.lines)}</strong></td>`
```

If a cron job has name `<script>alert('xss')</script>`, it executes in the browser.

---

## 6. Security Issues

### Summary

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 CRITICAL | 9 | Auth bypass, XSS, shell injection, unauthenticated cron mutations |
| 🟠 HIGH | 7 | Race conditions, memory leaks, duplicate fetches, swallowed errors |
| 🟡 MEDIUM | 10 | Fragile DOM, missing ARIA, no request dedup, hardcoded paths |
| 🟢 LOW | 6 | Logging, invalid date handling, minor UX issues |

### Top 5 Immediate Risks

1. **Unauthenticated cron mutations** — Anyone on the network can enable/disable/edit/run cron jobs
2. **XSS via unescaped user data** — `esc()` helper exists but unused everywhere
3. **Shell injection in `getLogs()`** — `limit` param interpolated into exec string
4. **CORS `*`** — Any origin can make requests; combined with unauth = full control
5. **Hardcoded TOKEN unused** — Auth infrastructure exists but bypassed

---

## 7. Performance Analysis

### Polling Efficiency

**Per 30-second cycle:**
- 7 fetch calls: `/api/data`, `/api/logs`, `/api/sysmetrics`, `/api/modelusage`, `/api/research`, + cron runs/history on demand
- Each spawns `execSync` to `openclaw` CLI → full process spawn overhead
- ~20,000+ execSync calls per hour

**Duplicate fetches:** `sysmetrics` fetched twice per cycle (in `fetchData` and `fetchSysMetrics`)

### Memory

- `sysHistory`: max 20 data points, 4 arrays → negligible
- `S.data`: holds latest response from each endpoint
- Tab timers leak (not cleared on tab switch) → grows with tab switching

### Latency

- CLI exec timeout: 15s (generous)
- System metrics script: up to 15s if commands block
- No circuit breakers — one slow command blocks the response

---

## 8. Modernization Roadmap

### Phase 1: Quick Security Fixes (1 day)

| Change | Effort | Impact |
|--------|--------|--------|
| Apply `esc()` to all user data interpolation | 30min | Fix XSS |
| Replace CORS `*` with same-origin restriction | 5min | Close auth bypass |
| Add `Authorization: Bearer <token>` check to all API routes | 1hr | Close cron mutations |
| Fix `getLogs()` to use array-form spawn | 15min | Close shell injection |
| Clear all tab timers on switch | 15min | Fix memory leak |

### Phase 2: Architecture Upgrade (1 week)

**Backend:**
- Migrate from `http` module to **Express** or **Fastify**
- Add **WebSocket** (via `ws`) for realtime updates — eliminate 30s polling lag
- Add **Prometheus `/metrics`** endpoint
- Move cost calculation to backend (remove from frontend)
- Abstract system metrics behind platform detection (Linux/macOS)
- Add structured logging (pino)
- Read session DB directly (SQLite) instead of CLI exec

**Frontend:**
- Split `index.html` → `app.js` + `styles.css` + `index.html`
- Migrate from vanilla JS to **React** (reuse from portfolio-analytics frontend)
- Add `aria-live` regions for toasts/logs
- Add request deduplication
- Add `fmt.num` decimal precision for K values

### Phase 3: Multi-Model Support (2 days)

- Dynamic model registry from `openclaw models --json`
- Per-model pricing from config file or CLI
- Support Claude, Gemini, Ollama, and local models
- Per-session model attribution

### Phase 4: Portability (2 days)

- Add `Dockerfile` + `docker-compose.yml`
- Abstract macOS-specific metrics to Linux equivalents
- Environment-based configuration (`.env` file)

### Phase 5: Hermes/OpenClaw Integration (3 days)

- Expose dashboard as Hermes tools (`claw_ops_health`, `claw_ops_cron_*`)
- Git-aware cron display (branch, last commit, uncommitted changes)
- Read token usage from session SQLite DB directly
- Event-driven updates from gateway → dashboard

---

## 9. Git Commit Log

```
02c5c9d Initial commit: Claw Ops Dashboard legacy files (dashboard.js, index.html, plist)
```

---

## Appendices

### A. Model Pricing (Hardcoded — L254–258)

```javascript
const MODEL_PRICES = {
  'MiniMax-M2.7':     { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0.10 },
  'minimax/MiniMax-M2.7': { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0.10 },
  'default':           { input: 0.30, output: 1.20, cacheRead: 0.06, cacheWrite: 0.10 },
};
```

### B. System Metrics Commands (macOS-only)

```bash
# CPU idle
os.cpus() → Object.values(c.times).reduce → 100 - idle%

# Memory
os.totalmem() - os.freemem()

# Disk
df -k / | tail -1

# Network I/O
netstat -ib | grep ^en0

# Load average
sysctl -n vm.loadavg

# Uptime
os.uptime()

# CPU temp
osx-cpu-temp -c

# Battery
pmset -g batt | grep -E "[0-9]+%"
```

### C. Gemini CLI Research Notes

> **SSE over WebSockets:** For Logs/Sessions tabs, implement Server-Sent Events (SSE). Unidirectional (server→browser), easier to add to existing Node.js HTTP server, ideal for token streaming and live logs.
>
> **Cost proxy pattern:** Move all `MODEL_PRICES` to backend. Frontend should receive pre-calculated costs only. Consider LiteLLM/Bifrost as middleware for multi-provider normalization.
>
> **Prometheus hybrid:** Keep custom UI for orchestration (cron management, live traces). Export aggregated metrics via `/metrics` endpoint for Grafana long-term storage.
>
> **Security minimum:** Header-based auth + origin lockdown. `spawn` with argument arrays throughout (not exec strings).

---

*Generated: 2026-04-18 | Claude Code (x2 parallel) + Gemini CLI research | OpenClaw Agent*
