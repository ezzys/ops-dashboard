# Claw Ops Dashboard — Audit & Modernization Review

> **Status:** Legacy — Current | **Date:** 2026-04-18 | **Reviewer:** OpenClaw Agent

---

## 1. Project Overview

**Name:** Claw Ops Dashboard  
**Type:** Operational monitoring & control dashboard  
**Location:** `/Users/openclaw/.openclaw/workspace/tools/ops-dashboard/`  
**Serving:** `http://192.168.1.201:18790/`  
**Process:** Node.js HTTP server (launchd/plist-managed)  
**Files:** 3 source files (~108KB total)

### What It Does
- Monitors OpenClaw agent system health, cron jobs, sessions, model usage, and costs
- Polls the OpenClaw CLI (`openclaw status --deep --json`, `openclaw cron list`, etc.)
- Displays research pipeline status (daily research files, findings)
- Allows cron job enable/disable/edit/run via HTTP API
- Shows macOS system metrics (CPU, memory, disk, network, battery)

### Tabs
| Tab | Function |
|-----|----------|
| Health | OpenClaw status + system metrics |
| Research | Daily research files + findings JSON |
| Schedule | Cron job management (list, toggle, edit, run) |
| System | macOS system metrics (CPU, RAM, disk, network, temp) |
| Sessions | Recent OpenClaw sessions with token counts |
| Cost | Model usage costs (MiniMax M2.7 pricing hardcoded) |
| Logs | Rolling log viewer with severity filters |

---

## 2. Architecture

```
Browser → HTTP Polling (30s active, 5min idle)
           ↓
   dashboard.js (Node.js HTTP server :18790)
           ↓
   openclaw CLI (execSync/spawnSync)
           ↓
   openclaw gateway (:18789)
```

### Key Design Decisions (Original)
- **No WebSockets** — HTTP polling every 30 seconds
- **CLI exec pattern** — spawns `openclaw status --deep --json`, parses JSON output
- **No framework** — plain Node.js `http` module, single file server
- **Embedded frontend** — all HTML/CSS/JS in `canvas/index.html` served as static file
- **Hardcoded token prices** — MiniMax M2.7 only
- **macOS-specific** — system metrics use `osx-cpu-temp`, `netstat -ib`, `pmset`, etc.

### Frontend Architecture
- Vanilla JS (no React/Vue/Angular)
- Template literals for DOM rendering
- Tab-based SPA with skeleton loading states
- Sparkline history for CPU/memory (last 20 data points)
- Responsive: mobile bottom nav + desktop top tabs

---

## 3. File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `dashboard.js` | 558 | Node.js HTTP server — all backend logic |
| `index.html` | ~1339 | Single-file SPA — all frontend (CSS+JS embedded) |
| `com.ai.openclaw.ops-dashboard.plist` | — | macOS launchd plist for auto-start |

### `dashboard.js` Breakdown

| Section | Lines | Description |
|---------|-------|-------------|
| CLI wrappers | 22–37 | `exec()` and `jexec()` — shell exec with timeout/parse |
| Safe spawn | 39–67 | `spawnCron()` with argument validation |
| Data fetchers | 87–104 | Wrappers for `openclaw status`, `cron list`, `health`, `logs` |
| System metrics | 108–226 | macOS-only sysmetrics: CPU, RAM, disk, net, load, uptime, temp, battery |
| Sysmetrics history | 248–249 | In-memory sparkline history (max 20 points) |
| Model pricing | 254–267 | Hardcoded MiniMax M2.7 token prices |
| Model usage | 269–300 | Session aggregation by model, cost calculation |
| Research pipeline | 304–382 | File-system reads: daily-research*.md, *-findings.json |
| HTTP route handler | 386–552 | All `/api/*` endpoints + static HTML serving |

### `index.html` Breakdown

| Section | Lines | Description |
|---------|-------|-------------|
| CSS | ~400 | Full dark theme (GitHub dark palette), responsive, animations |
| HTML | ~200 | Header, tab bars, 7 tab content areas |
| JS: State | — | `S` object: data cache, clock, refresh intervals |
| JS: Fmt | — | `fmt`: bytes, num, cost, ts, age, countdown formatters |
| JS: Sparkline | — | `sparkline()`: SVG sparkline renderer |
| JS: Fetch | — | `fetchData()`: polls all `/api/*` endpoints on 30s interval |
| JS: Tab renderers | — | `renderHealth()`, `renderResearch()`, `renderSchedule()`, etc. |
| JS: Schedule CRUD | — | `saveCron()`, `deleteCron()` — modals + POST to `/api/cron/*` |
| JS: Boot | — | `boot()`: clock start + initial tab switch |

---

## 4. Findings & Issues

### 🔴 Critical

1. **Hardcoded MiniMax M2.7 token pricing** — `MODEL_PRICES` only supports one model. Wrong for multi-model setups (Claude, Gemini, local Ollama, etc.)

2. **CLI token embedded in source** — `TOKEN='52700a...1ce6'` is a secret baked into source code. Not used in any route, but indicates credential handling was ad-hoc.

3. **CORS wide open** — `Access-Control-Allow-Origin: *` on all responses. If dashboard were exposed beyond LAN, would be a security issue.

4. **`execSync` with shell strings** — `jexec()` calls `execSync(cmd)` with constructed shell strings. Potential injection if any CLI argument were user-derived (currently server-side only, but fragile pattern).

### 🟠 Medium

5. **No authentication** — Dashboard has no auth. Anyone who can reach `:18790` can trigger cron jobs, toggle schedules.

6. **Polling inefficiency** — 7 separate fetch calls per 30s cycle. Each spawns a separate `execSync` to `openclaw` CLI. At 30s intervals = ~20k execSync calls/hour.

7. **No WebSocket/realtime** — 30s polling lag for critical alerts (cron failures, health degradation).

8. **In-memory state only** — `sysHistory` (sparkline data) lives in process memory. Restarts lose history. No persistence.

9. **macOS-specific metrics** — `osx-cpu-temp`, `netstat -ib`, `pmset` are macOS-only. Not portable to Linux/cloud agents.

10. **Research pipeline reads filesystem directly** — Assumes `~/.openclaw/workspace/research/` layout. No error handling if directory doesn't exist.

### 🟡 Low

11. **No test suite** — Zero tests for `dashboard.js` or `index.html`.

12. **No logging** — Server logs to stdout only (launchd redirects to `/tmp/openclaw/ops-dashboard.log`). No structured logging.

13. **HTML file too large** — 84KB single file is hard to navigate. Should be split: CSS file, JS file, HTML file.

14. **Stale socket handling** — No cleanup of idle connections. `server.listen` with no `server.close()` path.

15. **`spawnProcess` for cron run uses detached:false** — Fire-and-forget spawns process but doesn't `unref()`. Process stays in process table until completion.

---

## 5. Recommendations for Modernization

### Phase 1: Quick Wins (1–2 days)

1. **Split `index.html`** — Extract CSS to `styles.css`, JS to `app.js`. Enables caching, easier editing.
2. **Add `.env` config** — Move hardcoded values (`PORT`, `REFRESH_MS`, `MODEL_PRICES`) to environment variables or a `config.json`.
3. **Add basic auth** — Simple `Authorization: Bearer <token>` header check on all API routes.
4. **Add structured logging** — Replace `console.log/error` with `pino` or `winston`. Ship JSON logs.

### Phase 2: Multi-Model Support (2–3 days)

5. **Dynamic model pricing** — Read prices from `~/.openclaw/config.yaml` or `openclaw models` CLI output. Support Claude, Gemini, Ollama, etc.
6. **Model registry** — Fetch available models from `openclaw models --json` and display per-model costs.

### Phase 3: Realtime Architecture (3–5 days)

7. **WebSocket upgrade** — Replace polling with `ws` WebSocket. Server pushes updates on state change (cron event, session start/end, health alert).
8. **Event-driven updates** — OpenClaw gateway emits events; dashboard subscribes. Eliminates wasteful 30s polling.

### Phase 4: Portability & Production (3–5 days)

9. **Linux/Unix metrics** — Abstract system metrics behind platform detection. Use `os` module + platform-specific scripts for Linux (e.g., `/proc/stat`, `free`, `df`).
10. **Containerize** — Add `Dockerfile` + `docker-compose.yml`. Run as container on any host.
11. **Prometheus export** — Add `/metrics` endpoint in Prometheus format. Enables Grafana dashboards.
12. **Health check endpoint** — `/health` already exists but should return more detail (CLI reachable, disk space, memory pressure).

### Phase 5: Hermes/OpenClaw Integration (2–3 days)

13. **Expose as Hermes tool** — Register dashboard endpoints as Hermes tools (`claw_ops_health`, `claw_ops_cron_*`) so Hermes agents can query it.
14. **Git-aware cron display** — Show git branch, last commit, uncommitted changes for each project's cron job.
15. **LLM cost aggregation** — Hermes logs token usage to session store. Dashboard should read from session DB directly instead of `openclaw status`.

---

## 6. Suggested New Architecture

```
OpenClaw/Hermes Gateway (:18789)
         ↓ (event emission)
  ops-dashboard-backend/
    ├── server.js          # Express/Fastify + WebSocket
    ├── routes/
    │   ├── health.js      # GET /api/health
    │   ├── cron.js        # CRUD /api/cron/*
    │   ├── sessions.js     # GET /api/sessions (from session DB)
    │   ├── cost.js         # GET /api/cost (aggregated)
    │   └── research.js     # GET /api/research
    ├── services/
    │   ├── openclaw.js     # CLI wrapper (spawn with args array)
    │   ├── sysmetrics.js   # Platform-abstracted metrics
    │   └── sessiondb.js    # SQLite session store reader
    └── config.yaml

  ops-dashboard-frontend/  (React/Vite app)
    ├── src/
    │   ├── App.jsx
    │   ├── pages/
    │   │   ├── Health.tsx
    │   │   ├── Schedule.tsx
    │   │   ├── System.tsx
    │   │   ├── Sessions.tsx
    │   │   ├── Cost.tsx
    │   │   └── Logs.tsx
    │   ├── hooks/
    │   │   ├── useWebSocket.ts
    │   │   └── useMetrics.ts
    │   └── lib/
    │       ├── api.ts
    │       └── formatters.ts
    └── package.json
```

---

## 7. Git History

All files are currently in a new repo at `~/projects/ops-dashboard/`. No prior git history exists.

```bash
cd ~/projects/ops-dashboard
git add .
git commit -m "Initial commit: Claw Ops Dashboard legacy files"
git branch -M main
```

---

*Generated: 2026-04-18 | OpenClaw Agent Audit*
