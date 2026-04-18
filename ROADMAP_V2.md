# NEXUS — AI Agent Operations Dashboard v2
## Staged Roadmap for Agentic Implementation

> **Based on:** Claude Code creative brief (1963 lines, 15 features) + arxiv research (AgentTrace, AgentSight, GAAT, AgentOps papers) + Tavily/LangSmith/LangFuse practitioner research + Reddit pain point analysis  
> **Date:** 2026-04-18 | **Status:** Research Complete — Awaiting Approval  
> **Repo:** github.com/ezzys/ops-dashboard

---

## Executive Summary

The current Claw Ops Dashboard (v1) monitors OpenClaw/Hermes via HTTP polling, shows basic health/cost/sessions, and allows cron management. It was built as a lightweight internal tool.

**v2 — NEXUS** — transforms this into a **mission-control center** for multi-agent AI ecosystems. Based on research into LangSmith, LangFuse, AgentOps, arxiv observability papers, and Reddit practitioner pain points, this roadmap defines a 4-phase implementation plan prioritizing what actually matters: **agent visibility**, **cost control**, **one-click recovery**, **HITL safety**, and **session replay**.

**Key insight from research:** Practitioners overwhelmingly complain about three things:
1. **No visibility into agent decisions** — "stuck vs thinking" ambiguity
2. **Unbounded costs** — token spirals, retry loops, no circuit breakers
3. **No session replay** — tasks die mid-execution, context is lost
4. **No ability to intervene** — operators are powerless while agents misbehave

The v2 dashboard directly addresses all four.

**Total implementation:** ~7 weeks across 4 phases (Phase 0 security foundation is prerequisite)

---

## Design Principles

1. **Observability first** — Every agent action is a structured event (OpenTelemetry `gen_ai` semantic conventions)
2. **Cost as a first-class citizen** — Real-time cost tracking, predictive alerting, per-agent attribution
3. **Actionable over decorative** — Every metric should link to a remediation action
4. **Safe by default** — Recovery actions require confirmation, destructive actions require typed confirmation
5. **Git-native** — Agent activities are versioned, attributable, and reviewable like code

---

## Priority Feature Matrix

Based on practitioner research, weighted by frequency of complaint and feasibility:

| Priority | Feature | Why It Matters | Research Source |
|----------|---------|----------------|-----------------|
| P0 | **One-Click Gateway Reset** | "Stuck agents burn through budgets overnight" — Reddit | User request |
| P0 | **Session Replay / Flight Recorder** | "Agent dies mid-task, context lost" — Reddit | User request |
| P0 | **Real-time Cost Tracking + Alerts** | "Retry logic doubles spend" — Reddit | User request |
| P0 | **Human-in-the-Loop (HITL) Intervention** | Operators must be able to pause/terminate dangerous agents before they cascade — Gemini review | Practitioner safety |
| P1 | **Agent Health Heartbeat Grid** | "Stuck vs thinking ambiguity" — Reddit | User request |
| P1 | **Three-Surface Logging** (cognitive + operational + contextual) | AgentTrace paper (arxiv) | arxiv:2602.10133 |
| P1 | **Predictive Cost Alerting** | "Alert before budget hit, not after" — LangFuse | Practitioner research |
| P1 | **Multi-Agent Orchestration View** | "One brain reviewing itself" — Reddit | Practitioner research |
| P2 | **Skill Registry + Usage Tracking** | Skills are the unit of work — must be observable | Claude Code brief |
| P2 | **Git-Native Workflow Attribution** | Every agent action is a git event | Claude Code brief |
| P2 | **Cron Dependency Graph (DAG)** | Cascading job failures are common failure mode | Claude Code brief |
| P3 | **Cross-Model Comparison Matrix** | Claude vs Gemini vs Ollama cost/quality | Claude Code brief |
| P3 | **Token Streaming Visualization** | "Visceral understanding of cost" | Claude Code brief |
| P3 | **Memory Atlas / Knowledge Gap Detection** | "Context compression causes amnesia" | Reddit |

---

## Phase 0: Foundation (Security + Stability)
### Before any v2 features — must be done first

**Duration:** 2–3 days | **Goal:** Production-safe baseline

### T0.1 — Security patches (from v1 audit)

| Task | Description | Verification |
|------|-------------|--------------|
| T0.1.1 | Apply `esc()` to all user data in index.html template literals (~10 vectors) | Manual XSS test with `<script>alert(1)</script>` in cron name |
| T0.1.2 | Replace CORS `*` with same-origin restriction | Verify dashboard only loads from `:18790` |
| T0.1.3 | Add `Authorization: Bearer <token>` check to all `/api/*` routes | `curl` each endpoint without token → 401 |
| T0.1.4 | Fix `getLogs()` shell injection — use array-form `spawn` | Pass `30 && rm -rf /` as limit → rejected |
| T0.1.5 | Validate `jspawnCron` result — return `{ok: false}` on CLI failure | Mock CLI failure, verify JSON error response |
| T0.1.6 | Fix `sessionCost` duplication — backend calculates all costs, frontend only displays | Backend `sessionCost` includes `cacheWrite`, frontend removed |
| T0.1.7 | Add per-client rate limiting — 100 req/min per IP | `ab -n 200` against endpoint → 429 after 100 |

### T0.2 — Stability patches

| Task | Description | Verification |
|------|-------------|--------------|
| T0.2.1 | Add request timeouts — `setTimeout` on all HTTP routes | Slow client → connection closes after 30s |
| T0.2.2 | Fix tab timer memory leak — clear all timers on tab switch | Switch tabs 20x, verify no timers accumulate |
| T0.2.3 | Fix duplicate `sysmetrics` fetch — remove redundant call | Network tab shows 1 `/api/sysmetrics` per 30s cycle |
| T0.2.4 | Add circuit breaker — if `openclaw` CLI fails 3x, return cached data + alert | Kill openclaw, verify dashboard shows stale data + warning |
| T0.2.5 | Add structured error responses — all API errors return `{ok: false, error: string, code: string}` | All error paths return consistent JSON shape |

### T0.3 — Observability foundation

| Task | Description | Verification |
|------|-------------|--------------|
| T0.3.1 | Add structured logging (pino) — replace all `console.log/error` | Logs are JSON with `level`, `ts`, `traceId` |
| T0.3.2 | Add request ID to all log entries — `X-Request-ID` header support | Every API log line has a `reqId` field |
| T0.3.3 | Add OpenTelemetry `gen_ai` spans to all CLI exec calls | Spans appear in any OTel-compatible collector |
| T0.3.4 | Add `/health/detailed` endpoint — returns CLI reachability, disk space, memory pressure | JSON response with per-check status |
| T0.3.5 | **Data retention policy** — Add TTL-based event pruning (default: 30 days) to prevent SQLite unbounded growth. Implement `DELETE FROM events WHERE timestamp < :cutoff` as a nightly cron. Make retention configurable. | Events older than 30 days auto-deleted; dashboard handles missing events gracefully |

**Phase 0 exit gate:** Dashboard runs for 24h without crash, all security tests pass, no memory leak detected.

---

## Phase 1: Cost Shield + Recovery Console
### P0 features — cost control and one-click recovery

**Duration:** 5–7 days | **Goal:** Operators can see and control spend in real-time

### Architecture for this phase

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NEXUS Frontend (React)                      │
│  Cost Shield Panel  │  Recovery Console  │  Agent Health Grid       │
└─────────────────────────────────────────────────────────────────────┘
                              │ WebSocket
┌─────────────────────────────────────────────────────────────────────┐
│                    nexus-backend (Fastify)                          │
│  routes/                                                            │
│    ├── cost.ts        ← Aggregates token usage, calculates costs   │
│    ├── recovery.ts     ← Gateway restart, session clear, agent kill  │
│    ├── health.ts       ← Agent heartbeat, stuck detection           │
│    └── telemetry.ts    ← OTel events → session store                │
│  services/                                                          │
│    ├── openclaw.ts      ← CLI wrapper (spawn array-form)            │
│    ├── sessiondb.ts     ← Direct SQLite read (replaces CLI exec)    │
│    ├── cost-calculator.ts ← Per-model pricing, projections           │
│    └── stuck-detector.ts ← Activity-based stuck detection           │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                   OpenClaw / Hermes Stack                            │
│  Session DB (SQLite)  │  Gateway (:18789)  │  Cron scheduler       │
└─────────────────────────────────────────────────────────────────────┘
```

### R1.1 — Cost Shield

Real-time cost tracking with predictive alerting. **Why:** Research shows practitioners' #1 pain point is unbounded costs from retry loops and token spirals.

| Task | Description | Data Needed |
|------|-------------|-------------|
| R1.1.1 | **Backend cost service** — Read session DB directly (SQLite), calculate per-session/per-model costs using dynamic pricing from config | `session.db` schema, model price config |
| R1.1.2 | **Real-time cost WebSocket** — Push cost updates on every token event (not polling) | `sessionCost` computed incrementally |
| R1.1.3 | **Cost velocity tracking** — Rolling 5-minute spend rate, projected exhaustion time | `spendRate = costLast5min / 5` |
| R1.1.4 | **Predictive alert thresholds** — Alert at 50%, 80%, 95% of daily/monthly budget | Config: `{budgetUsd, period: 'daily'\|'monthly'}` |
| R1.1.5 | **Cost per agent/skill attribution** — Which skill or agent is driving spend | Session DB has `agent_id`, skill log has `skill_name` |
| R1.1.6 | **Anomaly detection** — Alert when cost rate >3x rolling average (token spiral signal) | `avgCostRate` rolling window |
| R1.1.7 | **Frontend Cost Shield panel** — Stacked area chart (daily cost over time), spend velocity gauge, alert badges | Recharts or similar |

**Cost alert severity levels:**
- 🟡 **50% budget** — Informational banner
- 🟠 **80% budget** — Warning banner + Slack alert
- 🔴 **95% budget** — Modal confirmation required for new sessions
- 🚨 **Budget exceeded** — All new sessions blocked until acknowledged

### R1.2 — One-Click Recovery Console

Buttons to reset stuck agents, clear sessions, restart gateway. **Why:** "Agents stuck overnight burning budgets" is the most common ops complaint.

| Task | Description | Safety |
|------|-------------|--------|
| R1.2.1 | **Gateway restart** — `openclaw gateway restart` via spawn with output capture | Confirmation modal, shows restart duration |
| R1.2.2 | **Session clear** — Clear specific sessions from DB (not all — selective) | Confirmation modal, shows which sessions |
| R1.2.3 | **Agent kill** — Kill specific agent subprocess by PID | Warning modal, shows agent's current task |
| R1.2.4 | **Session clear all** — Nuclear option: clear all sessions | Requires typed confirmation (`CLEAR-ALL`) |
| R1.2.5 | **Recovery action audit log** — Every recovery action logged with timestamp, operator, target | Stored in session DB, viewable in dashboard |
| R1.2.6 | **Recovery console UI** — Grid of action cards with risk coding (green=safe, amber=moderate, red=destructive) | Color-coded, icon + label + confirmation |

**Recovery action card format:**
```
┌─────────────────────────────────────────┐
│  ⏻  Restart Gateway                     │
│      Risk: ● Amber                       │
│      Impact: All sessions dropped        │
│      Duration: ~5 seconds                │
│  [Cancel]  [Restart — 1 click]          │
└─────────────────────────────────────────┘
```

### R1.3 — Agent Health Heartbeat Grid

Real-time grid showing every agent's last-seen time, with stuck detection.

| Task | Description | Algorithm |
|------|-------------|-----------|
| R1.3.1 | **Heartbeat emitter** — Agents emit `heartbeat` events to session store every 30s | `heartbeat_ts` written to session |
| R1.3.2 | **Health check backend** — Read heartbeat timestamps, compute age | `stale = now - heartbeat_ts > threshold` |
| R1.3.3 | **Stuck detection** — If agent has no activity for >`STUCK_THRESHOLD` (default: 5min), mark as stuck | Activity = any CLI call, tool use, or message |
| R1.3.4 | **Auto-restart config** — Per-agent configurable: alert-only / auto-restart / manual | Config stored in `nexus-config.yaml` |
| R1.3.5 | **Health grid UI** — Cards per agent: name, status (healthy/stuck/warning/offline), last seen, context %, auto-restart toggle | Color-coded status dots |

**Health states:**
- 🟢 **Healthy** — Heartbeat < 30s ago
- 🟡 **Warning** — Heartbeat 30s–2min ago
- 🔴 **Stuck** — Heartbeat > 2min ago (configurable per agent)
- ⚫ **Offline** — No heartbeat ever or agent disabled

### R1.4 — Human-in-the-Loop (HITL) Intervention

Operator ability to pause, inspect, and guide running agents in real-time. **Why:** Critical for safety; operators must be able to interrupt before costly mistakes cascade.

| Task | Description | Safety |
|------|-------------|--------|
| R1.4.1 | **Session pause** — Signal to gateway to pause a specific session (no new model calls) | Confirmation modal showing session summary |
| R1.4.2 | **Session resume** — Resume a paused session from exact checkpoint | Confirmation modal |
| R1.4.3 | **Message injection** — Inject a user message into a running session (e.g., "STOP, that file is production") | Confirmation + preview of injected message |
| R1.4.4 | **Session termination** — Hard kill a running session with optional graceful wind-down | Typed confirmation: `TERMINATE-<session-id>` |
| R1.4.5 | **Intervention audit log** — Every HITL action logged with: operator, session, action, timestamp, before/after state | Stored in audit_log table |
| R1.4.6 | **HITL UI** — "INTERVENE" button on active session cards; opens slide-over panel with pause/resume/inject/terminate options | Confirmation flows for each action |

### R1.5 — Phase 1 Infrastructure

| Task | Description |
|------|-------------|
| R1.4.1 | **Fastify backend scaffold** — Replace `http.createServer` with Fastify (adds validation, typed routes, plugins) |
| R1.4.2 | **WebSocket server** — `ws` library integrated with Fastify, room-based subscriptions (cost-events, health-events, logs) |
| R1.4.3 | **Config file** — `nexus-config.yaml` for budgets, thresholds, STUCK_THRESHOLD, model prices, auth tokens |
| R1.4.4 | **Session DB reader** — Direct SQLite queries (no CLI exec for reads) via `better-sqlite3` |
| R1.4.5 | **Shared OpenTelemetry setup** — `gen_ai` semantic conventions, trace/span IDs in all log events |

---

## Phase 2: Session Replay + Three-Surface Logging
### P0 features — debugging and observability

**Duration:** 14–21 days | **Goal:** Operators can replay any session and see full reasoning chains

> **Note:** This phase is the most complex. The timeline reflects the reality of building a timeline scrubber, event ingestion pipeline, and multi-surface filtering simultaneously.

### R2.1 — Session Replay / Flight Recorder

Complete time-travel debugging of agent sessions. **Why:** "Agent dies mid-task, context lost" and "debugging is archaeology" are top Reddit complaints.

| Task | Description | Data Structure |
|------|-------------|-----------------|
| R2.1.1 | **Event log schema** — Every agent event written to append-only log: `{traceId, spanId, surface, eventType, ts, data}` | See R2.2 for surface taxonomy |
| R2.1.2 | **Playback frontend** — Timeline scrubber, play/pause, speed controls (1x, 2x, 4x, 8x) | Timeline slider with event density markers |
| R2.1.3 | **Event bookmarking** — Mark interesting moments during playback for later reference | Bookmarks stored in session metadata |
| R2.1.4 | **Diff view** — Compare two sessions side-by-side (same task, different dates) | Split panel, synchronized scrolling |
| R2.1.5 | **Export** — Download session as JSON (full fidelity) or HTML (readable) | `GET /api/sessions/:id/export?format=json\|html` |
| R2.1.6 | **Annotation layer** — Add text notes to specific events post-hoc | Stored separately, displayed as tooltips |

**Session replay UI elements:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Session: s_8f3k2  │ Model: claude-sonnet-4  │  Duration: 12:34   │
├─────────────────────────────────────────────────────────────────────┤
│  [▶ Play] [⏸ Pause] [⏮ Start] [⏭ End]  Speed: [1x ▼]  [🔖 Bookmark] │
├─────────────────────────────────────────────────────────────────────┤
│ ──●────────────────────────────●─────────────────────○──▶ Time     │
│   ↑                            ↑                            ↑       │
│   Session start         Tool call: browse         Output complete   │
├─────────────────────────────────────────────────────────────────────┤
│ [Event Timeline — colored markers by surface type]                  │
│  🔵 Tool  🟢 Cognitive  🟡 Operational  🟣 Contextual               │
├─────────────────────────────────────────────────────────────────────┤
│  [Chat/Event Detail Panel — shows selected event content]           │
│  Role: assistant | Model: claude-sonnet-4 | Tokens: 2,847 | 340ms  │
│  ─────────────────────────────────────────────────────────────────   │
│  [Full message/reasoning chain content here]                         │
└─────────────────────────────────────────────────────────────────────┘
```

### R2.2 — Three-Surface Observability Logging

Based on arxiv paper **AgentTrace (2602.10133)** — the most complete taxonomy for agent logging.

| Surface | What It Captures | Event Types |
|---------|-----------------|-------------|
| **Cognitive** | Raw prompts, completions, reasoning chains (CoT), confidence estimates, tool selection rationale | `reasoning_step`, `tool_selected`, `confidence_score`, `context_built` |
| **Operational** | Method calls, arguments, return values, execution timing, exceptions | `tool_call`, `tool_result`, `function_invoked`, `error`, `retry` |
| **Contextual** | HTTP APIs, SQL/NoSQL, cache hits/misses, vector DB queries, file I/O | `http_request`, `db_query`, `cache_hit`, `cache_miss`, `file_read`, `file_write` |

**Event schema (OpenTelemetry `gen_ai` compatible):**
```typescript
interface AgentEvent {
  trace_id: string;        // UUID — groups all events in a session
  span_id: string;          // UUID — individual event
  parent_span_id?: string;  // For nested spans
  surface: 'cognitive' | 'operational' | 'contextual';
  event_type: string;       // e.g. 'tool_call', 'reasoning_step'
  timestamp: number;        // Unix ms
  agent_id: string;
  model?: string;
  data: Record<string, unknown>;  // Type-specific payload
  duration_ms?: number;     // For timed events
  status?: 'success' | 'error' | 'retry';
}
```

**Example events:**
```json
{"trace_id":"abc","span_id":"1","surface":"cognitive","event_type":"reasoning_step","agent_id":"planner-01","data":{"step":1,"thought":"Need to check current date first","confidence":0.94}}
{"trace_id":"abc","span_id":"2","parent_span_id":"1","surface":"operational","event_type":"tool_call","agent_id":"planner-01","data":{"tool":"web_search","input":{"query":"current date"}}}
{"trace_id":"abc","span_id":"3","parent_span_id":"2","surface":"contextual","event_type":"cache_hit","agent_id":"planner-01","data":{"key":"date_lookup","ttl_remaining":3600}}
```

### R2.3 — Log Query Interface

| Task | Description |
|------|-------------|
| R2.3.1 | **Structured log API** — `GET /api/logs?surface=cognitive&event_type=tool_call&agent_id=planner-01&from=ts&to=ts` |
| R2.3.2 | **Full-text search** — Search across all event content (prompts, responses) |
| R2.3.3 | **Log filtering UI** — Faceted filter panel (surface, event_type, agent, status, time range) |
| R2.3.4 | **Live log stream** — WebSocket subscription to new events (tail -f behavior) |

### R2.4 — Phase 2 Infrastructure

| Task | Description |
|------|-------------|
| R2.4.1 | **Event store** — Append-only SQLite table or separate SQLite file for event log (separate from session DB for performance) |
| R2.4.2 | **Session DB schema update** — Add `trace_id` column to sessions, link to event store |
| R2.4.3 | **Backend: session replay routes** — `GET /api/sessions/:id`, `GET /api/sessions/:id/events`, `GET /api/sessions/:id/export` |
| R2.4.4 | **Event ingestion pipeline** — Hermes/OpenClaw gateway emits events → nexus-backend collects via WebSocket/Unix socket → writes to event store |
| R2.4.5 | **Frontend: session list** — Filterable table with: session ID, agent, model, start time, duration, cost, status, trace link |

---

## Phase 3: Orchestration + Skill Forge
### P1 features — multi-agent visibility and skill tracking

**Duration:** 14 days | **Goal:** Operators see the full agent graph and every skill invocation

### R3.1 — Multi-Agent Orchestration View

Based on the **AgentTrace** and **AgentOps** (arxiv 2411.05285) research. Node-graph of agent relationships.

| Task | Description | Data Model |
|------|-------------|------------|
| R3.1.1 | **Agent graph backend** — Track parent→child relationships, agent types (planner/specialist/synthesizer) | `AgentWorkload` interface from creative brief |
| R3.1.2 | **Real-time agent list** — Live list of all agents, sorted by activity, with status indicators | WebSocket push on agent state change |
| R3.1.3 | **Node-graph visualization** — D3.js or React Flow based graph showing agent relationships | Nodes = agents, edges = delegation relationships |
| R3.1.4 | **Context window utilization** — Per-agent context bar (how full is their context window) | `context_window_pct` per agent |
| R3.1.5 | **Mode indicators** — Show autonomous vs guided mode per agent with transition events | `mode` field + `mode_change` events |
| R3.1.6 | **Skill/tool invocation counts** — Per-agent breakdown of which skills/tools used | Aggregated from event store |

**Orchestration panel UI:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ AGENTS: 7 ACTIVE / 12 TOTAL  │  [List View] [Graph View]             │
├──────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │  [Hex] PLANNER-01  ══════════  ● Running                      │   │
│ │     Planning sub-tasks for research sweep  │ 0:34              │   │
│ │     Model: claude-sonnet-4  ████░░ 67% context                │   │
│ │     Mode: [AUTO]  Skills: 3  │ Tools: 12  │ Tokens: 8.4K     │   │
│ └────────────────────────────────────────────────────────────────┘   │
│       │                                                              │
│       ├──→ [Circle] CODER-03 ──→ [Diamond] REVIEW-07               │
│       │                                                           │
│       └──→ [Circle] RESEARCHER-02 ──→ [Diamond] SYNTHESIS-09        │
└──────────────────────────────────────────────────────────────────────┘
```

### R3.2 — Skill Registry + Skill Forge

Every skill invocation is tracked, attributed, and analyzed.

| Task | Description | Data |
|------|-------------|------|
| R3.2.1 | **Skill manifest** — Scan `~/.hermes/skills/` and `openclaw skills list`, build skill registry with: name, category, description, success rate, avg duration | `~/.hermes/skills/*.md` + CLI |
| R3.2.2 | **Skill invocation log** — Every skill call: `{skill_name, agent_id, session_id, success, duration_ms, tokens_used, ts}` | Event store |
| R3.2.3 | **Skill success rate** — Rolling 7-day success rate per skill, with trend arrow | Computed from event store |
| R3.2.4 | **Skill failure analysis** — When a skill fails, surface the last error + suggested fix | From event store `error` events |
| R3.2.5 | **Skill performance by agent** — Which agents use which skills most effectively | Aggregated per `agent_id × skill_name` |
| R3.2.6 | **Skill usage leaderboard** — Top 10 most-used skills this week | Computed from event store |

### R3.3 — Cron Dependency Graph (Chrono Topo)

DAG visualization of cron job dependencies — based on the creative brief's "Chrono Topo".

| Task | Description |
|------|-------------|
| R3.3.1 | **Job dependency detection** — Parse cron job `description` field for `triggers: job-id` or `depends: job-id` patterns |
| R3.3.2 | **DAG renderer** — Topological sort, render as directed graph with D3.js |
| R3.3.3 | **Status propagation** — If job A triggers job B, show dependency chain in health view |
| R3.3.4 | **Upcoming jobs timeline** — 24h timeline showing next N scheduled runs |
| R3.3.5 | **Job handoff logs** — When job A triggers job B, log the handoff event with trigger context |

### R3.4 — Git-Native Workflow Attribution (Git Nexus)

Every significant agent action is attributed to a git commit or working tree state.

| Task | Description |
|------|-------------|
| R3.4.1 | **Agent commit detection** — Hook into `openclaw` git operations, capture `{sha, branch, files_changed, message}` |
| R3.4.2 | **Working tree change tracking** — Track uncommitted changes per project: `git status --porcelain` |
| R3.4.3 | **PR review attribution** — Track which agent reviewed which PR, link to `gh` review events |
| R3.4.4 | **Git Nexus UI** — List of agent commits with: sha, branch, files, timestamp, linked diff |

---

## Phase 4: Intelligence Layer + Predictive Alerts
### P2/P3 features — advanced monitoring and cross-model intelligence

**Duration:** 10–14 days | **Goal:** The dashboard predicts problems before they happen

### R4.1 — Predictive Cost Alerting (Cost Shield Advanced)

| Task | Description | Algorithm |
|------|-------------|-----------|
| R4.1.1 | **Spend projection** — Linear regression on hourly spend rate → predict end-of-day total | `projected = avgHourlyRate × hoursRemaining` |
| R4.1.2 | **Budget exhaustion countdown** — "At current rate, budget lasts N hours" | `hoursLeft = budgetRemaining / currentSpendRate` |
| R4.1.3 | **Per-model cost comparison** — Side-by-side cost efficiency (cost per successful task) | `efficiency = totalCost / successfulTaskCount` |
| R4.1.4 | **Cache hit rate tracking** — Monitor cache hit rate over time, alert on degradation | `cacheRate = cacheHits / (cacheHits + cacheMisses)` |
| R4.1.5 | **Token efficiency scoring** — Avg tokens per successful completion (lower = more efficient) | Per-agent, per-skill breakdown |

### R4.2 — Cross-Model Comparison Matrix

| Task | Description | UI |
|------|-------------|-----|
| R4.2.1 | **Multi-model cost tracking** — Support any model: Claude, Gemini, MiniMax, Ollama, LM Studio | Model registry from config |
| R4.2.2 | **Latency comparison** — P50/P95/P99 latency per model over time | Line chart overlay |
| R4.2.3 | **Quality proxy** — Success rate per model (tasks completed vs abandoned) | Bar chart |
| R4.2.4 | **Radar chart** — Multi-axis comparison: cost, speed, quality, context window | Recharts radar |
| R4.2.5 | **Model routing recommendations** — Based on task type, suggest optimal model | Rule engine + learned preferences |

### R4.3 — Memory Atlas / Knowledge Gap Detection

| Task | Description |
|------|-------------|
| R4.3.1 | **Memory usage heatmap** — Visualize which knowledge domains are most referenced in vector store |
| R4.3.2 | **Gap detection** — Identify topics that frequently trigger web search (vs. answered from memory) → suggest memory ingestion |
| R4.3.3 | **Context density visualization** — Show how full context windows are per agent at each step |

### R4.4 — Prometheus Export + Grafana Integration

| Task | Description |
|------|-------------|
| R4.4.1 | **`/metrics` endpoint** — Prometheus format export of all numeric metrics |
| R4.4.2 | **Pre-built Grafana dashboard JSON** — One-click import for common agent ops metrics |
| R4.4.3 | **Alert rules** — Prometheus alertmanager rules for: stuck agents, budget threshold, error rate spike |

### R4.5 — Governance + Audit Trail (GAAT-inspired)

Based on arxiv paper **GAAT (2604.05119)** — closed-loop policy enforcement.

| Task | Description |
|------|-------------|
| R4.5.1 | **Action audit log** — Every dashboard action (recovery, config change, cron toggle) stored with: actor, target, timestamp, before/after state |
| R4.5.2 | **Permission boundaries** — Role-based access: viewer (read-only), operator (recovery), admin (config) |
| R4.5.3 | **Policy enforcement** — Configurable rules: e.g., "never auto-restart during business hours", "block sessions > $50 without approval" |
| R4.5.4 | **Compliance export** — Export audit log as CSV/JSON for compliance reporting |

---

## Data Architecture

### Event Store Schema (SQLite)

```sql
-- Sessions (existing + extended)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  trace_id TEXT,           -- Links to event store
  agent_id TEXT,
  model TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  status TEXT,             -- running|completed|failed|stuck
  total_cost_usd REAL,
  input_tokens INTEGER,
  output_tokens INTEGER
);

-- Event log (append-only, 3-surface taxonomy)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  parent_span_id TEXT,
  surface TEXT NOT NULL,  -- cognitive|operational|contextual
  event_type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  agent_id TEXT,
  model TEXT,
  data TEXT,              -- JSON payload
  duration_ms INTEGER,
  status TEXT
);

CREATE INDEX idx_events_trace ON events(trace_id);
CREATE INDEX idx_events_surface ON events(surface);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_agent ON events(agent_id);
CREATE INDEX idx_events_ts ON events(timestamp);

-- Audit log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,     -- 'operator' or 'system'
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  before TEXT,
  after TEXT,
  timestamp INTEGER NOT NULL
);
```

### OpenTelemetry Integration

```typescript
// Key spans to emit (gen_ai semantic conventions)
'session.start'           // New conversation
'session.end'             // Conversation complete
'gen_ai.choice'          // Model response generated
'gen_ai.token'            // Token consumed (input/output/cache)
'tool.call'               // Tool invocation
'tool.result'             // Tool response
'agent.delegation'        // Agent-to-agent handoff
'cognitive.reasoning'     // Reasoning step (CoT)
'context.retrieval'       // Memory/vector search
'skill.invocation'        // Skill called
```

---

## Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Backend framework | **Fastify** | 3x faster than Express, built-in validation, TypeScript-first, OTel plugin |
| Frontend framework | **React + Vite** | Already proven in portfolio-analytics; strong ecosystem |
| Visualization | **Recharts** + **React Flow** | Recharts for charts, React Flow for node graphs |
| Real-time | **WebSocket** (`ws` + Fastify) | Bi-directional, low latency; SSE for log streaming |
| Database | **SQLite** (event store) + existing session DB | Already in use, no new infrastructure |
| OTel collection | **OTLP** via `苯丙氨酸` | Standard; Grafana/Tempo compatible |
| Container | **Docker** + **docker-compose** | Phase 3 deliverable |

---

## Implementation Notes

### What not to build

Based on research, these features are **deprioritized** despite being mentioned in creative brief:

| Feature | Why Not | Alternative |
|---------|---------|-------------|
| Full conversation tree visualization (animated) | Very complex to build correctly, limited practical value over session replay | Session replay covers debugging needs |
| Token river streaming animation | Polling-style visualization adds no operational value; streaming speed is the useful signal | Cost velocity chart covers this |
| Memory Atlas knowledge gap detection | Context compression is a hermes/openclaw concern, not a dashboard concern | Future phase if context monitoring proves actionable |
| Cross-model quality scoring | No reliable automated quality metric; subjective | Use task completion rate as proxy |

### Migration path from v1

1. **Keep v1 running** until v2 Phase 1 is stable — they can run in parallel (v2 on different port)
2. **v2 reads same session DB** — no data migration needed
3. **WebSocket replaces polling** — v2 frontend connects via WS, not HTTP fetch
4. **CLI exec only for writes** — v2 uses direct SQLite reads for all monitoring data

---

## Research Sources

| Source | Key Contribution |
|--------|-----------------|
| arxiv:2602.10133 — AgentTrace | Three-surface observability model (cognitive/operational/contextual) |
| arxiv:2411.05285 — AgentOps | Framework for observing/analyzing/optimizing agentic AI systems |
| arxiv:2507.11277 | Six-stage AgentOps pipeline: Observe→Collect→Detect→Identify→Optimize→Automate |
| arxiv:2604.05119 — GAAT | Governance-aware agent telemetry, closed-loop enforcement |
| arxiv:2508.02736 — AgentSight | eBPF kernel-level monitoring, <3% overhead |
| LangSmith docs | Cost tracking patterns, per-user/session attribution |
| LangFuse docs | Token tracking taxonomy (input/output/cached/reasoning separate) |
| AgentOps SDK | Session replay + event waterfall visualization |
| Reddit r/LocalLLaMA, r/ClaudeAI | Practitioner pain points: stuck agents, unbounded costs, no replay |
| Creative Brief (Claude Code) | NEXUS design language, 15-feature UI mockups |

---

*NEXUS roadmap — v2.0 | github.com/ezzys/ops-dashboard*
