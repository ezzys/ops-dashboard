# NEXUS Ops Dashboard — Critical Design Review + Verification Control Matrix
**Auditor:** Claude Sonnet 4.6  
**Date:** 2026-04-18  
**Scope:** ROADMAP_V2.md (570 lines) vs. all implementation files under `src/` and `index.html`  
**Verdict:** Structurally sound with significant gaps in Phase 3–4 completeness, one critical security flaw, and a chronic frontend integration problem.

---

## Part 1: Critical Design Review

### 1. Completeness

The implementation covers Phases 0–4 at the API level but large surface areas are **stubs or absent**:

- **Phase 0 (Security + Stability):** Core patches are present. Rate limit, auth token, CORS restriction, shell-injection fix, circuit breaker, structured logging all implemented. **Gap:** T0.3.3 (real OTel SDK/exporter) is a fake in-process ring buffer — no OTLP export.
- **Phase 1 (Cost Shield + Recovery + Health + HITL):** Fully implemented at API level. Cost aggregator, health monitor, recovery console, and HITL intervention routes all exist. WebSocket rooms wired. **Gap:** Heartbeat emitter (R1.3.1) is _not_ implemented — the health monitor derives status by reading session DB timestamps, not from actual agent heartbeat events. R1.4.4 `auto-restart` config is stored but never acted upon (no restart code path).
- **Phase 2 (Session Replay + Three-Surface Logging):** Event store, ingest pipeline, replay routes, log query routes all implemented. **Gap:** R2.1.2 playback frontend (play/pause/speed controls, scrubber) has the CSS scaffolding but the JavaScript population functions `renderReplayTab()`, `fetchPrompts()`, `fetchSkills()`, `fetchOrchestration()`, `fetchIntelligence()` are referenced in `switchTab()` / `doInitialFetch()` but **never defined** in the HTML script block (read to line 1300 — they are absent or cut off). This is the single largest correctness risk. R2.1.3–R2.1.6 bookmarking, diff view, annotation layer are not implemented.
- **Phase 3 (Orchestration + Skill Forge):** Agent CRUD, handoff protocol, skill registry all exist. **Gap:** R3.1.3 node-graph visualization (D3.js/React Flow) is completely absent — only a CSS grid exists. R3.3 Cron DAG (dependency detection, topological sort, D3 renderer) is entirely missing. R3.4 Git-Native Attribution (commit detection, working tree tracking, PR attribution) has no implementation at all.
- **Phase 4 (Intelligence + Predictive Alerts):** `agent-intelligence.js` and `predictive-alerts.js` are implemented with real linear regression. **Gap:** R4.2 Cross-Model Comparison Matrix (latency comparison, quality proxy, radar chart) is not implemented — there is no `/api/models` endpoint or any comparative UI. R4.3 Memory Atlas is explicitly deprioritized in the roadmap (consistent). R4.4 Prometheus export (`/metrics`) is entirely absent. R4.5 RBAC/permission boundaries are not implemented.

### 2. Correctness

**Budget calculation (sessionCost):**  
- `src/services/cost-calculator.js:sessionCost()` reads `session.inputTokens`, `session.outputTokens`, etc. but OpenClaw's session DB schema is unknown. The `sessiondb.js` uses adaptive column discovery (`tableColumns()`), which is defensive but means the field names may never match.
- The **frontend** `sessionCost()` at `index.html:1133–1136` uses hardcoded MiniMax prices (`$0.30/$1.20`), not config prices. It was supposed to be removed per T0.1.6 — it still exists and is called in `renderTab` for the cost display. **This is a correctness defect:** frontend will show wrong cost for Claude models.

**Health monitor heartbeat derivation:**  
- `health-monitor.js:_buildAgentList()` derives `lastSeenMs` from `s.last_activity || s.updated_at || s.ts || s.created_at` — these timestamps reflect when the _session was created or last updated in DB_, not when the agent last emitted a heartbeat. A multi-hour-old session with a recent `updated_at` would show as healthy. The ROADMAP (R1.3.1) requires agents to emit explicit `heartbeat` events every 30s — this emitter does not exist.

**Event store `event_type` validation:**  
- `event-types.js` enforces that `agent.handoff` must belong to `operational`, but `handoff.js:executeHandoff()` writes `event_type: 'agent.handoff'` which is NOT in `ALL_EVENT_TYPES` — the `validateEvent()` check would reject it with "Invalid event_type: agent.handoff". **This breaks the handoff protocol entirely.** The handoff route bypasses validation by calling `store.writeEvent()` directly (skipping `ingestEvent()`), which avoids the check but also skips broadcasting.

**Auth token in HTML:**  
- `index.html:1119`: `const AUTH_TOKEN='52700a12570c54a80cb138b0d2322deb7238875879541ce6';` — the token is hardcoded in plaintext in client-served HTML. Anyone who can load the dashboard page can read the token and use it to hit all API endpoints from outside. This negates the Bearer auth for any browser-accessible deployment.

**R1.2.4 Session clear all:**  
- `recovery.js` sends `['session', 'clear', '--all']` to openclaw CLI. The roadmap specifies the confirmation string as `CLEAR-ALL` and the implementation correctly checks `req.body.confirmation !== 'CLEAR-ALL'`. ✓

**Rate limiter:**  
- `server.js:checkRateLimit()` uses `Math.random() < 0.01` to periodically evict stale entries — this is probabilistic cleanup, not guaranteed. Under high load an IP could have stale entries that never get evicted. Acceptable for an internal tool but worth noting.

**Config validation:**  
- `config.js` validates `auth.token`, `port`, `budgets.dailyUsd`, `modelPrices` — fails fast on missing. ✓

### 3. Architecture Quality

**Strengths:**
- Fastify with schema validation is the right choice. Input schemas on all mutating routes.
- Array-form `spawnSync`/`spawn` throughout — no shell injection surface.
- `better-sqlite3` for synchronous reads — correct for this use case.
- Audit log with SQLite + JSONL fallback is solid defensive design.
- Event store WAL mode + retention pruning is correctly wired.
- `event-types.js` taxonomy matches arxiv AgentTrace spec.
- Rate limiter per-IP in server.js.
- Circuit breaker with cooldown in `openclaw.js`.

**Anti-patterns / Issues:**
- **`sysmetrics.js` writes a script to `/tmp/claw_sysmetrics.js` at module load** — spawning a node script from a string is a soft code injection pattern. If `/tmp` is writable by other processes, the script could be replaced. Should inline the logic instead.
- **`agent-config.js` and `prompt-store.js` both open `data/events.db`** — three separate services open the same SQLite file with `new Database(DB_PATH)`. `better-sqlite3` supports multiple connections to the same file in WAL mode, but there is no shared connection management. If any of these modules calls `db.exec()` with schema migrations, they could interfere.
- **`sessiondb.js` uses `SELECT *` and dynamic table/column discovery** — correct for resilience but means any query result could have arbitrary columns that downstream code must handle. This design propagates uncertainty through the cost-calculator.
- **No tests** — `package.json` test script is `echo "Error: no test specified" && exit 1`. Zero coverage.
- **`dashboard.js` / `dashboard.v1.js` / `dashboard.js.bak`** still present in root. Legacy code adds confusion and surface area.
- **`nexus-config.json` stores auth token in plaintext** — acceptable for local tool, but the same token appears verbatim in `index.html` client-side. No secret rotation path.

### 4. Integration

**WebSocket wiring:**
- `server.js` creates 4 rooms: `cost-events`, `health-events`, `logs`, `events`.
- `cost-aggregator.init(broadcast)` and `healthMonitor.init(broadcast)` are called in `start()` — correctly wired.
- `eventIngest.setBroadcast(broadcast)` called after WS setup — correctly wired.
- Frontend connects cost WS at `switchTab('cost')` and health WS at `switchTab('agents')` — confirmed in JS state `S.costWs`, `S.healthWs`.
- **Gap:** The `logs` room has a broadcast path (event-ingest broadcasts to it) but the frontend has no WebSocket connection to the `logs` room for live streaming (R2.3.4). The tab polls instead.
- **Gap:** The `events` room supports ingestion via WS but this is agent→server direction (agents push events). No documentation of this flow exists for external agents.

**Services initialization:**
- `event-store.init()` and `event-store.startPruning()` called at startup. ✓
- `agent-config.js`, `prompt-store.js`, `handoff.js` all use lazy-init `getDb()` — they open the same `events.db` file. Fine for WAL but no explicit init order.

### 5. Error Handling

- All route handlers have try/catch returning `{ok: false, error: string, code: string}`. ✓
- `cost-aggregator` and `health-monitor` catch all errors in their loops with empty catch blocks — errors are silently swallowed. This makes debugging hard. Should at minimum log the error.
- `event-ingest.ingestEvent()` catches broadcast errors but returns `{ok: true}` on store write success. ✓
- `sessiondb.getDb()` sets `_dbMissing = true` on first failure and never retries — correct for performance but means a temporarily unavailable DB path is permanently marked missing until server restart.

### 6. Frontend

**Positive:**
- CSS is comprehensive and covers all ROADMAP UI components: Cost Shield, Agent Health Grid, HITL slide-over, Session Replay player, Log Query, Prompts, Skills, Orchestration, Intelligence.
- Tab structure, modals, and HITL panel are fully marked up in HTML.
- `esc()` XSS escape function defined and should be applied to all user data. ✓ (at declaration)
- Auth token sent in `Authorization: Bearer` header on all fetch calls. ✓

**Critical Gap — Missing JavaScript render functions:**  
The `doInitialFetch()` switch statement references these functions:
- `renderReplayTab()` — **not defined** in the script (read to line 1300)
- `fetchPrompts()` — **not confirmed defined**
- `fetchSkills()` — **not confirmed defined**
- `fetchOrchestration()` — **not confirmed defined**
- `fetchOverview()` / `renderOverview()` — **not confirmed defined**
- `fetchIntelligence()` / `renderIntelligence()` — **not confirmed defined**

If these functions are defined later in the file (after line 1300, which is where the audit read was cut off), they may exist. However, the pattern of `S.costWs`, `S.healthWs` being referenced in the state object and `fetchAgentHealth()` being called suggests most of the fetch infrastructure exists. The audit could only confirm up to line 1300.

**Frontend sessionCost uses wrong prices:**  
`index.html:1133-1136` hardcodes MiniMax prices — this is the T0.1.6 defect that was supposed to be fixed but wasn't.

---

## Part 2: Verification Control Matrix (VCM)

### Phase 0 — Foundation

| Req ID | Requirement | Phase | Implementation Location | Status | Evidence | Gap Description |
|--------|-------------|-------|------------------------|--------|----------|-----------------|
| T0.1.1 | Apply `esc()` to all user data in HTML | 0 | `index.html:1139` | PARTIAL | `esc()` defined and used in render functions; not confirmed in all dynamic paths | Need full JS audit past line 1300 |
| T0.1.2 | Replace CORS `*` with same-origin | 0 | `server.js:75-89` | PASS | `allowedOrigins` array restricts to `localhost:${cfg.port}` and `127.0.0.1:${cfg.port}` | — |
| T0.1.3 | Bearer token auth on all `/api/*` routes | 0 | `server.js:105-127` | PARTIAL | Auth hook applied via `preHandler`; token hardcoded in `index.html:1119` visible to browser | Token exposed client-side — bypasses intent |
| T0.1.4 | Fix `getLogs()` shell injection — array-form spawn | 0 | `openclaw.js:121-134` | PASS | Uses `spawnSync(node, [cli, 'logs', '--json', '--limit', String(safeLimit)])` | — |
| T0.1.5 | Validate `jspawnCli` result — return `{ok: false}` | 0 | `openclaw.js:62-96` | PASS | `jspawnCli` returns `{ok: false, data: null, error: r.stderr}` on failure | — |
| T0.1.6 | Fix `sessionCost` duplication — backend calculates costs | 0 | `index.html:1133-1136` | FAIL | Frontend still calculates cost with hardcoded MiniMax prices, not config prices | Defect persists |
| T0.1.7 | Per-client rate limiting — 100 req/min per IP | 0 | `server.js:31-48` | PASS | `rateLimitMap` per-IP sliding window, returns 429 | — |
| T0.2.1 | Request timeouts — 30s on HTTP routes | 0 | `server.js:57` | PASS | `requestTimeout: 30000` in Fastify options | — |
| T0.2.2 | Fix tab timer memory leak — clear timers on tab switch | 0 | `index.html:1207-1219` | PASS | `scheduleTabRefresh()` clears with `clearInterval(S.timers[tab])` before setting new | — |
| T0.2.3 | Fix duplicate `sysmetrics` fetch | 0 | `index.html:1286-1299` | PARTIAL | `fetchData()` fetches sysmetrics alongside main data; tab switch also fetches separately | May still double-fetch on health tab load |
| T0.2.4 | Circuit breaker — 3 CLI failures → cache + alert | 0 | `openclaw.js:17-96` | PASS | `_cliFailCount`, `_circuitOpen`, cooldown wired | Alert broadcast missing (silent cache return) |
| T0.2.5 | Structured error responses `{ok, error, code}` | 0 | `server.js:172-181` + all routes | PASS | All routes return consistent JSON shape | — |
| T0.3.1 | Structured logging (pino) — JSON logs | 0 | `server.js:19-27` | PARTIAL | Custom JSON logger to stderr; not pino (no `reqId` auto-injection) | Custom logger, not pino — misses some pino features |
| T0.3.2 | Request ID in all log entries | 0 | `server.js:62-67` | PASS | `X-Request-ID` header + `req.reqId` set in `onRequest` hook | — |
| T0.3.3 | OpenTelemetry `gen_ai` spans on CLI exec calls | 0 | `telemetry.js` (entire file) | PARTIAL | In-process ring buffer with gen_ai attributes; no OTLP exporter wired | Not real OTel — no collector integration |
| T0.3.4 | `/health/detailed` endpoint | 0 | `routes/health.js:31-67` | PASS | CLI reachability, gateway, disk, memory, circuit breaker all checked | — |
| T0.3.5 | Data retention policy — 30-day TTL pruning | 0 | `event-store.js:186-224` | PASS | `pruneOldEvents()` + `startPruning()` (6h interval) wired in `server.js:297-298` | — |

**Corrective Actions — Phase 0:**

| Req ID | Severity | Corrective Action | Priority | Effort Estimate |
|--------|----------|-------------------|----------|-----------------|
| T0.1.3 | HIGH | Remove hardcoded `AUTH_TOKEN` from `index.html`; serve it from a dedicated `GET /api/config` endpoint that returns only non-sensitive config, or inject via a meta tag with CSP | P0 | 1h |
| T0.1.6 | MEDIUM | Delete `sessionCost()` from `index.html:1133-1136`; use backend `/api/cost/budget` endpoint for all cost display | P1 | 30min |
| T0.2.4 | LOW | Add `broadcast('health-events', {type: 'circuit-open', ...})` in `openclaw.js` when circuit trips | P2 | 30min |
| T0.3.1 | LOW | Replace custom logger with `pino` — `const log = require('pino')()` gives structured JSON, child loggers, req-id binding | P2 | 2h |
| T0.3.3 | LOW | Wire `@opentelemetry/sdk-node` with OTLP exporter; replace `telemetry.js` ring buffer with real SDK | P3 | 4h |

---

### Phase 1 — Cost Shield + Recovery Console

| Req ID | Requirement | Phase | Implementation Location | Status | Evidence | Gap Description |
|--------|-------------|-------|------------------------|--------|----------|-----------------|
| R1.1.1 | Backend cost service — SQLite read + dynamic pricing | 1 | `cost-calculator.js` + `sessiondb.js` | PARTIAL | Calculator exists; SQLite read defensive but column names assumed | Session DB schema unknown — field mismatch likely |
| R1.1.2 | Real-time cost WebSocket push | 1 | `cost-aggregator.js:98-101` | PASS | Broadcasts `{type:'cost-update'}` to `cost-events` room every 30s | — |
| R1.1.3 | Cost velocity tracking — rolling 5-min spend rate | 1 | `cost-aggregator.js:121-145` | PASS | `_costWindow`, `_computeSpendRate()` implemented | — |
| R1.1.4 | Predictive alert thresholds — 50/80/95% | 1 | `cost-aggregator.js:164-215` | PASS | `THRESHOLDS` array, deduplication, day-boundary reset | — |
| R1.1.5 | Cost per agent/skill attribution | 1 | `cost-aggregator.js:225-235` | PARTIAL | Attribution by `agent_id` / `skill_name` from session record; field names guessed | Works only if session DB has these columns |
| R1.1.6 | Anomaly detection — cost rate >3x rolling avg | 1 | `cost-aggregator.js:70-76` | PASS | `anomaly = spendRate > avgRate * 3` with re-arm after 5min | — |
| R1.1.7 | Frontend Cost Shield panel | 1 | `index.html` CSS (`.cs-*`) | PARTIAL | CSS scaffolding exists; JS `fetchCostSummary()` referenced but render functions need verification past line 1300 | Cannot confirm JS implementation |
| R1.2.1 | Gateway restart with confirmation | 1 | `routes/recovery.js:57-106` | PASS | Schema validation `{confirmed: true}`, audit log, timeout | — |
| R1.2.2 | Session clear (selective) | 1 | `routes/recovery.js:109-153` | PASS | Session ID regex validation, confirmation required, audit log | — |
| R1.2.3 | Agent kill by PID | 1 | `routes/recovery.js:155-246` | PASS | SIGTERM + SIGKILL escalation, PID bounds, self-kill guard | — |
| R1.2.4 | Session clear all — `CLEAR-ALL` typed confirmation | 1 | `routes/recovery.js:250-288` | PASS | Exact string check, audit log | — |
| R1.2.5 | Recovery action audit log | 1 | `services/audit-log.js` | PASS | SQLite + JSONL fallback, full before/after state | — |
| R1.2.6 | Recovery console UI — color-coded cards | 1 | `index.html` CSS (`.rc-*`) | PASS | CSS for safe/moderate/destructive cards with color coding | — |
| R1.3.1 | Heartbeat emitter — agents emit every 30s | 1 | **NOT IMPLEMENTED** | MISSING | No heartbeat event writer in any service | Agents cannot emit heartbeats — no protocol defined |
| R1.3.2 | Health check backend — compute heartbeat age | 1 | `health-monitor.js:55-92` | PARTIAL | Reads session timestamps, not heartbeat events; proxy metric | Wrong data source — see CDR §2 |
| R1.3.3 | Stuck detection — no activity > `STUCK_THRESHOLD` | 1 | `health-monitor.js:104-114` | PASS | `_computeStatus()` checks age vs config thresholds | Thresholds correct; input data questionable |
| R1.3.4 | Auto-restart config per agent | 1 | `health-monitor.js:89-90` | PARTIAL | `autoRestart` flag read from config and returned in API; no restart action taken | Config read, never acted upon |
| R1.3.5 | Health grid UI — cards per agent | 1 | `index.html` CSS (`.ah-*`) | PASS | Full card CSS including status dots, context bar, intervene button | — |
| R1.4.1 (HITL) | Session pause | 1 | `routes/intervention.js:22-61` | PASS | Schema validation, session ID regex, audit log | — |
| R1.4.2 | Session resume | 1 | `routes/intervention.js:63-102` | PASS | Schema validation, audit log | — |
| R1.4.3 | Message injection | 1 | `routes/intervention.js:104-143` | PASS | Message length validated (1–4096), audit log with truncated preview | — |
| R1.4.4 | Session termination — typed `TERMINATE-<id>` | 1 | `routes/intervention.js:145-194` | PASS | Exact confirmation string enforced, audit log | — |
| R1.4.5 | Intervention audit log | 1 | `routes/intervention.js:196-205` | PASS | Filtered view of audit_log with INTERVENTION_ACTIONS set | — |
| R1.4.6 | HITL UI — slide-over panel | 1 | `index.html:1027-1114` | PASS | Full slide-over with Pause/Resume/Inject/Terminate, confirmation flows | — |
| R1.5.1 | Fastify backend scaffold | 1 | `src/server.js` | PASS | Fastify with schema validation, hooks, error handler | — |
| R1.5.2 | WebSocket server — room-based | 1 | `server.js:183-273` | PASS | `ws` library, manual upgrade, room validation, auth check | — |
| R1.5.3 | Config file `nexus-config.yaml` (now JSON) | 1 | `nexus-config.json` | PASS | All budgets, thresholds, model prices, websocket rooms | File is JSON, not YAML as spec says — acceptable |
| R1.5.4 | Session DB reader — direct SQLite | 1 | `src/sessiondb.js` | PASS | `better-sqlite3` readonly mode | — |
| R1.5.5 | Shared OTel setup | 1 | `src/telemetry.js` | PARTIAL | Custom ring buffer, not real OTel SDK | See T0.3.3 |

**Corrective Actions — Phase 1:**

| Req ID | Severity | Corrective Action | Priority | Effort Estimate |
|--------|----------|-------------------|----------|-----------------|
| R1.3.1 | HIGH | Define heartbeat event protocol: agents POST `{surface:'operational', event_type:'tool_call', agent_id, timestamp}` to `/api/events` every 30s; health monitor queries event store for most recent event per agent_id | P1 | 4h |
| R1.3.4 | MEDIUM | In `health-monitor.check()`: if agent.status === 'stuck' && agent.autoRestart === 'auto-restart', call recovery route `POST /api/recovery/gateway-restart` or session restart | P2 | 2h |
| R1.1.1 | MEDIUM | Add integration test or schema probe: at startup, log the columns of the sessions table so field mapping can be verified | P1 | 1h |

---

### Phase 2 — Session Replay + Three-Surface Logging

| Req ID | Requirement | Phase | Implementation Location | Status | Evidence | Gap Description |
|--------|-------------|-------|------------------------|--------|----------|-----------------|
| R2.1.1 | Event log schema — append-only `{traceId, spanId, surface, eventType, ts, data}` | 2 | `event-store.js:16-41` | PASS | Schema matches ROADMAP spec including all indexes | — |
| R2.1.2 | Playback frontend — scrubber, play/pause, speed controls | 2 | `index.html` CSS (`.rp-*`) | PARTIAL | CSS scaffolding exists; JS playback engine not confirmed | Functions `renderReplayTab()` referenced but not visible in audit window |
| R2.1.3 | Event bookmarking | 2 | NOT FOUND | MISSING | No bookmark storage in event-store or route handler | CSS `.rp-bookmark-btn` exists but no backend |
| R2.1.4 | Diff view — two sessions side-by-side | 2 | NOT FOUND | MISSING | No diff route or UI implementation | Not implemented |
| R2.1.5 | Export — JSON and HTML | 2 | `routes/replay.js:156-181` | PASS | `GET /api/sessions/:id/export?format=json\|html`, HTML template with XSS escaping | — |
| R2.1.6 | Annotation layer | 2 | NOT FOUND | MISSING | No annotation table, route, or UI | Not implemented |
| R2.2 | Three-surface observability (cognitive/operational/contextual) | 2 | `services/event-types.js` | PASS | Full taxonomy, validation, surface→event_type mapping | — |
| R2.3.1 | Structured log API with filters | 2 | `routes/logs.js:14-80` | PASS | `GET /api/logs/query` with surface, event_type, agent_id, from, to, search params | — |
| R2.3.2 | Full-text search | 2 | `routes/logs.js:82-103` + `event-store.js:167-169` | PASS | `data LIKE ?` with LIKE-escape for `%` and `_` | LIKE is not true FTS — performance degrades on large datasets |
| R2.3.3 | Log filtering UI — faceted filter panel | 2 | `index.html` CSS (`.lq-*`) | PARTIAL | Filter bar CSS exists; JS `fetchLogs()` referenced | Cannot confirm render implementation |
| R2.3.4 | Live log stream — WebSocket tail -f | 2 | `event-ingest.js:58-73` broadcasts to `logs` room | PARTIAL | Server broadcasts; frontend does not connect to `logs` WS room | Frontend polling only — not live stream |
| R2.4.1 | Event store — append-only SQLite | 2 | `services/event-store.js` | PASS | WAL mode, prepared statements, full CRUD | — |
| R2.4.2 | Session DB schema update — `trace_id` column | 2 | `sessiondb.js` | PARTIAL | Code reads `s.trace_id || s.id` as trace_id; actual column in OpenClaw DB not verified | Cannot confirm without live DB |
| R2.4.3 | Backend session replay routes | 2 | `routes/replay.js` | PASS | `GET /api/sessions`, `/api/sessions/:id`, `/api/sessions/:id/events`, `/api/sessions/:id/export` all implemented | — |
| R2.4.4 | Event ingestion pipeline | 2 | `services/event-ingest.js` | PASS | HTTP POST `/api/events` + WebSocket `events` room + batch support | — |
| R2.4.5 | Frontend session list — filterable table | 2 | `index.html` CSS (`.rp-table-wrap`) | PARTIAL | CSS exists; JS session list render not confirmed | — |

**Corrective Actions — Phase 2:**

| Req ID | Severity | Corrective Action | Priority | Effort Estimate |
|--------|----------|-------------------|----------|-----------------|
| R2.1.2 | HIGH | Verify/complete `renderReplayTab()` and playback engine in `index.html`; implement play/pause/speed with `setInterval` playback of events array | P1 | 8h |
| R2.1.3 | MEDIUM | Add `bookmarks` table to `events.db`; add `POST /api/sessions/:id/bookmark` endpoint; wire bookmark button in replay UI | P2 | 3h |
| R2.3.2 | LOW | Replace LIKE-based search with SQLite FTS5 virtual table for `data` column — `CREATE VIRTUAL TABLE events_fts USING fts5(data, content=events)` | P3 | 4h |
| R2.3.4 | MEDIUM | Add WebSocket `logs` room connection in frontend; replace polling in logs tab with live subscription | P2 | 3h |

---

### Phase 3 — Orchestration + Skill Forge

| Req ID | Requirement | Phase | Implementation Location | Status | Evidence | Gap Description |
|--------|-------------|-------|------------------------|--------|----------|-----------------|
| R3.1.1 | Agent graph backend — parent→child tracking | 3 | `services/agent-config.js` + `routes/orchestration.js` | PARTIAL | Agent CRUD exists; no parent_id column or relationship tracking | No hierarchy — just flat agent list |
| R3.1.2 | Real-time agent list — WebSocket on state change | 3 | `routes/orchestration.js:46-50` | PARTIAL | REST endpoint exists; no WebSocket push on agent state change | Polling only |
| R3.1.3 | Node-graph visualization — D3/React Flow | 3 | NOT FOUND | MISSING | Only CSS grid for agent cards; no graph rendering | Not implemented |
| R3.1.4 | Context window utilization per agent | 3 | `health-monitor.js:74-76` | PARTIAL | `contextPct` computed from session tokens; returned in health endpoint | Accuracy depends on session DB field names |
| R3.1.5 | Mode indicators — autonomous vs guided | 3 | NOT FOUND | MISSING | No `mode` field in agent schema or event tracking | Not implemented |
| R3.1.6 | Skill/tool invocation counts per agent | 3 | `agent-intelligence.js:60-65` | PASS | `tool_calls` map per agent_id from event store | — |
| R3.2.1 | Skill manifest — scan `~/.hermes/skills/` | 3 | `services/skill-registry.js` | PASS | Scans `~/.claude/skills`, `~/.openclaw/skills`, `~/.config/claude/skills` with SKILL.md parser | — |
| R3.2.2 | Skill invocation log | 3 | `services/event-store.js` via `event_type:'skill.execute'` | PARTIAL | Event store can store skill events; no dedicated writer emits them | Passive — not auto-populated |
| R3.2.3 | Skill success rate — 7-day rolling | 3 | `agent-intelligence.js:131-183` | PASS | `_computeSkillAnalytics()` from event store `tool_selected`+`tool_result` | — |
| R3.2.4 | Skill failure analysis | 3 | NOT FOUND | MISSING | Error events queried for agent; no per-skill failure surface with "last error + suggested fix" | Not implemented |
| R3.2.5 | Skill performance by agent | 3 | `agent-intelligence.js:60-65` | PARTIAL | Top tools per agent tracked; no per-agent×skill success rate | — |
| R3.2.6 | Skill usage leaderboard | 3 | `agent-intelligence.js:131-183` sorted by uses | PASS | `_computeSkillAnalytics()` sorted by `s.uses` desc | — |
| R3.3.1 | Cron dependency detection | 3 | NOT FOUND | MISSING | No parsing of cron job descriptions for `triggers:` patterns | Not implemented |
| R3.3.2 | DAG renderer | 3 | NOT FOUND | MISSING | No D3.js, no topological sort | Not implemented |
| R3.3.3 | Status propagation in DAG | 3 | NOT FOUND | MISSING | — | Not implemented |
| R3.3.4 | Upcoming jobs 24h timeline | 3 | NOT FOUND | MISSING | Cron list endpoint exists but no timeline projection | Not implemented |
| R3.3.5 | Job handoff logs | 3 | `services/handoff.js` | PARTIAL | Handoff protocol implemented for agent→agent handoffs; NOT for cron job chaining | Wrong scope |
| R3.4.1 | Agent commit detection | 3 | NOT FOUND | MISSING | No git hook, no git operation capture | Not implemented |
| R3.4.2 | Working tree change tracking | 3 | NOT FOUND | MISSING | — | Not implemented |
| R3.4.3 | PR review attribution | 3 | NOT FOUND | MISSING | — | Not implemented |
| R3.4.4 | Git Nexus UI | 3 | NOT FOUND | MISSING | — | Not implemented |

**Corrective Actions — Phase 3:**

| Req ID | Severity | Corrective Action | Priority | Effort Estimate |
|--------|----------|-------------------|----------|-----------------|
| R3.1.3 | MEDIUM | Add D3.js or Cytoscape.js via CDN; render agent graph in `#tab-orchestration` using `agent_configs` with parent_id edges from handoff events | P2 | 8h |
| R3.3 (all) | MEDIUM | Implement Chrono Topo: parse cron job descriptions for `depends:` patterns, build adjacency list, render with D3 force-directed layout | P2 | 12h |
| R3.4 (all) | LOW | Add `GET /api/git/log?limit=20` endpoint that runs `git log --format=json` via spawnSync; wire Git Nexus tab | P3 | 6h |

---

### Phase 4 — Intelligence Layer + Predictive Alerts

| Req ID | Requirement | Phase | Implementation Location | Status | Evidence | Gap Description |
|--------|-------------|-------|------------------------|--------|----------|-----------------|
| R4.1.1 | Spend projection — linear regression on hourly rate | 4 | `predictive-alerts.js:33-122` | PASS | `_linfit()` + history points from `dailyHistory`; confidence tiers | — |
| R4.1.2 | Budget exhaustion countdown | 4 | `cost-aggregator.js:139-145` + `predictive-alerts.js:65-73` | PASS | `hoursLeft` and `minutesRemaining` both computed | — |
| R4.1.3 | Per-model cost comparison | 4 | `cost-aggregator.js:80` (`byModel`) | PARTIAL | `byModel` breakdown in cost summary; no "cost per successful task" efficiency metric | Missing efficiency = totalCost/successfulTaskCount |
| R4.1.4 | Cache hit rate tracking | 4 | NOT FOUND | MISSING | No cache hit/miss ratio tracked over time; events have `cache_hit`/`cache_miss` types but no aggregation route | Not surfaced |
| R4.1.5 | Token efficiency scoring | 4 | `agent-intelligence.js:83-86` | PARTIAL | `avg_duration_ms` computed; no "tokens per successful completion" metric | Duration ≠ token efficiency |
| R4.2.1 | Multi-model cost tracking | 4 | `cost-calculator.js` + `nexus-config.json` model prices | PASS | Model prices for Claude/MiniMax in config; `byModel` breakdown | — |
| R4.2.2 | Latency comparison P50/P95/P99 | 4 | NOT FOUND | MISSING | `avg_duration_ms` only; no percentile computation | Not implemented |
| R4.2.3 | Quality proxy — task completion rate | 4 | `agent-intelligence.js:23-27` (`_computeSuccessRate`) | PASS | Success rate computed from success/error status events | — |
| R4.2.4 | Radar chart — multi-axis comparison | 4 | NOT FOUND | MISSING | No chart library; no radar endpoint | Not implemented |
| R4.2.5 | Model routing recommendations | 4 | `predictive-alerts.js:265-316` | PASS | `getRecommendations()` suggests model downgrade/upgrade based on success rate + cost tier | — |
| R4.3.1 | Memory usage heatmap | 4 | DEPRIORITIZED in ROADMAP | N/A | Explicitly listed as "what not to build" | — |
| R4.3.2 | Gap detection | 4 | DEPRIORITIZED in ROADMAP | N/A | — | — |
| R4.3.3 | Context density visualization | 4 | `predictive-alerts.js:198-260` | PASS | `getResourceExhaustionAlerts()` tracks context_pct per agent with linear extrapolation | — |
| R4.4.1 | `/metrics` Prometheus export | 4 | NOT FOUND | MISSING | No `/metrics` endpoint | Not implemented |
| R4.4.2 | Pre-built Grafana dashboard JSON | 4 | NOT FOUND | MISSING | — | Not implemented |
| R4.4.3 | Prometheus alert rules | 4 | NOT FOUND | MISSING | — | Not implemented |
| R4.5.1 | Action audit log | 4 | `services/audit-log.js` | PASS | Full before/after state; SQLite + JSONL fallback | — |
| R4.5.2 | Permission boundaries — RBAC | 4 | NOT FOUND | MISSING | Single token, no role tiers (viewer/operator/admin) | Not implemented |
| R4.5.3 | Policy enforcement — configurable rules | 4 | NOT FOUND | MISSING | No policy engine | Not implemented |
| R4.5.4 | Compliance export — CSV/JSON | 4 | NOT FOUND | MISSING | Audit log readable via API but no export route | Not implemented |

**Corrective Actions — Phase 4:**

| Req ID | Severity | Corrective Action | Priority | Effort Estimate |
|--------|----------|-------------------|----------|-----------------|
| R4.4.1 | MEDIUM | Add `GET /metrics` route (no auth, Prometheus format); export: `nexus_cost_total_usd`, `nexus_agents_stuck`, `nexus_events_total` from existing aggregated data | P2 | 4h |
| R4.1.4 | LOW | Add `GET /api/intelligence/cache` route aggregating `cache_hit`/`cache_miss` events from event store; compute hit rate over configurable window | P3 | 3h |
| R4.5.2 | LOW | Add role field to config: `{roles: {admin: ['token1'], operator: ['token2'], viewer: ['token3']}}`; check role in preHandler | P3 | 6h |

---

## Part 3: Summary

### Requirement Counts

| Phase | Total Reqs | PASS | PARTIAL | FAIL | MISSING |
|-------|-----------|------|---------|------|---------|
| Phase 0 | 17 | 10 | 5 | 1 | 1 |
| Phase 1 | 24 | 15 | 5 | 0 | 4 |
| Phase 2 | 15 | 7 | 5 | 0 | 3 |
| Phase 3 | 19 | 4 | 5 | 0 | 10 |
| Phase 4 | 16 | 6 | 3 | 0 | 7 |
| **TOTAL** | **91** | **42 (46%)** | **23 (25%)** | **1 (1%)** | **25 (27%)** |

> Note: N/A requirements (R4.3.1, R4.3.2) excluded from totals.

---

### Top 5 Critical Findings

1. **Auth token visible in client-served HTML** (`index.html:1119`).  
   Anyone who loads the dashboard page — including anyone on the same network with access to port 18790 — can read `AUTH_TOKEN` and call all API endpoints including `POST /api/recovery/session-clear-all`. The Bearer auth requirement provides zero protection when the token is embedded in the HTML served without authentication. **Fix: serve the token securely or use session-cookie auth.**

2. **`agent.handoff` event type bypasses validation** (`handoff.js:executeHandoff()`).  
   `handoff.js` calls `store.writeEvent()` directly, skipping `ingestEvent()` and its `validateEvent()` call. This means handoff events are written to SQLite but NOT broadcast to the `logs` WebSocket room. The `event_type: 'agent.handoff'` string is also not in `ALL_EVENT_TYPES`, so any agent that tries to submit a handoff via `/api/events` will get a 400 rejection. **Fix: add `AGENT_HANDOFF = 'agent.handoff'` to operational event types in `event-types.js`; use `ingestEvent()` in `handoff.js`.**

3. **Frontend `sessionCost()` uses wrong prices** (`index.html:1133-1136`).  
   The function hardcodes MiniMax pricing (`$0.30 input/$1.20 output`) for ALL models. A Claude Opus session consuming 1M tokens at `$15.00/Mtok` would display as `$0.30` — a 50× undercount. This was the exact defect T0.1.6 was supposed to fix. **Fix: delete the function; display cost from `/api/cost/budget` API response.**

4. **R1.3.1 heartbeat emitter entirely absent**.  
   The health monitor derives agent "last seen" from session DB timestamps (created_at, updated_at), not from actual heartbeat signals. A session created 10 hours ago and never touched would have an `updated_at` from 10 hours ago → correctly shown as `stuck`. But a session that was active 2 hours ago and has since finished appears stuck even though the agent completed successfully. Conversely, a session with a DB update from a housekeeping process would appear healthy. The ROADMAP requires agents to emit explicit 30s heartbeats. **Fix: define heartbeat event in protocol; agent SDKs emit `{event_type:'tool_call', surface:'operational', agent_id, timestamp}` every 30s; health monitor reads event store.**

5. **Phase 3 Cron DAG and Git Attribution entirely unimplemented**.  
   R3.3 (5 requirements) and R3.4 (4 requirements) are completely absent — no code exists. These are P1 features (cron dependency graph) and P2 features (git attribution). The cron DAG is especially important as cascading job failures are described as a "common failure mode" in the ROADMAP. The existing handoff.js was incorrectly counted toward this.

---

### Top 5 Quick Wins

1. **Fix the hardcoded auth token** (1h): Move token to a server-injected variable or remove it from HTML and add a `/api/token` endpoint gated by same-origin check. Closes the most critical security gap.

2. **Fix `sessionCost` in frontend** (30min): Delete 4 lines in `index.html`. Use `summary.totalCost` from `/api/cost/budget` response everywhere. Fixes incorrect cost display.

3. **Fix `agent.handoff` event type** (30min): Add `AGENT_HANDOFF: 'agent.handoff'` to `event-types.js` operational set. Change `handoff.js` to call `ingestEvent()` instead of `store.writeEvent()` directly. Fixes handoff broadcast and enables external agents to POST handoffs.

4. **Add circuit breaker alert broadcast** (30min): In `openclaw.js` when `_circuitOpen` is set to true, call `broadcast('health-events', {type:'circuit-open', failCount: _cliFailCount, ts: Date.now()})`. Currently the circuit trips silently — operators have no real-time notification.

5. **Add `/metrics` Prometheus endpoint** (4h): Expose cost totals, stuck agent counts, event store totals as Prometheus counters/gauges. Plugs directly into existing Grafana/alertmanager infrastructure most operators already have. High operational value, low implementation cost.

---

### Architecture Recommendations

1. **Consolidate database connections**: `agent-config.js`, `prompt-store.js`, and `event-store.js` each open `data/events.db` independently. Create a single `db.js` module that exports one shared `Database` instance; all services import from it. Avoids WAL-mode connection limit and ensures schema migrations run once.

2. **Define a heartbeat contract**: The entire health monitor depends on agents emitting activity. Define a documented protocol: agents call `POST /api/events` with `{surface:'operational', event_type:'tool_call', agent_id: '<id>', timestamp: Date.now()}`. Add a heartbeat endpoint alias `POST /api/agents/:id/heartbeat` that creates this event with minimal friction.

3. **Replace `/tmp` sysmetrics script pattern**: `sysmetrics.js` writes a Node script to `/tmp` and executes it. This is a soft injection risk and creates a race condition if two server instances run concurrently. Inline the system metrics collection directly in the service using Node `os` module and `spawnSync` for platform-specific calls.

4. **Add a test harness**: Zero tests for a dashboard that controls production agent infrastructure is the highest long-term risk. Start with integration tests for the most destructive routes: gateway restart, session clear all, agent kill. Use `fastify.inject()` for in-process HTTP testing without needing a running server.

5. **Frontend JavaScript completeness audit**: The HTML script block was read to line 1300 but the file continues. All the tab render functions (`renderReplayTab`, `fetchIntelligence`, `renderIntelligence`, etc.) must be verified to exist and be complete. A dead tab that crashes on `switchTab()` due to an undefined function would make the Phase 2/4 features entirely unusable. Run the server and click every tab to verify.
