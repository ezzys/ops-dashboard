# NEXUS v2 — Usage Guide

NEXUS is a single-page dashboard. All tabs update in real time via WebSocket. The UI authenticates automatically using the token from the config file embedded in the page at load time.

---

## Navigation

The top header contains tab buttons for every feature area. A badge on some tabs shows a count or a red dot when attention is needed (e.g., stuck agents, unread alerts).

Dark mode toggle (🌙/☀️) is in the top-right corner. The preference is saved in `localStorage` and persists across sessions.

---

## 1. Overview

*Screenshot: [4 stat cards + quick-nav grid + activity feed]*

The Overview tab is the landing page. It provides a system-at-a-glance view.

**Stat cards**
| Card | What it shows |
|------|---------------|
| Alerts | Active predictive alerts (critical + warn) |
| Active Agents | Agents with recent heartbeats |
| Cost Today | USD spent since midnight |
| Skills | Total skills discovered from skill directories |

**Quick-nav grid** — 8 shortcut links to every major feature section.

**Alert banner** — Shown at the top when predictive alerts exist. Links directly to the Intelligence tab.

**Recent activity feed** — Last 10 events ingested into the event store, across all surfaces. Click any event to go to the Replay tab.

---

## 2. Cost Shield

*Screenshot: [Budget bars + velocity gauge + alert list + per-model breakdown]*

Real-time spend monitoring with budget tracking, velocity analysis, and anomaly detection.

### Budget bars

Two progress bars (daily / monthly) color-code your spend:
- **Green** — below 50%
- **Blue** — 50–79%
- **Yellow** — 80–94%
- **Red (pulsing)** — 95%+

A live indicator dot in the card header shows whether the WebSocket feed is active.

### Velocity gauge

- **Spend rate** — USD/hour, computed over a rolling 5-minute window
- **Projected daily** — linear extrapolation to end-of-day
- **Hours until exhausted** — time until the daily budget runs out at the current rate
- **⚡** = actively spending | **💤** = idle | **🚨** = anomaly (spend rate >3× rolling average)

### Alert list

The last 5 budget/anomaly alerts with severity badges (info / warn / critical). Alerts are deduplicated within a calendar day to avoid noise.

Alert levels and triggers:
| Level | Trigger |
|-------|---------|
| `info` | 50% of daily budget consumed |
| `warn` | 80% of daily budget consumed |
| `critical` | 95% of daily budget consumed |
| `blocked` | 100% of daily budget consumed |
| `warn` | Spend rate >3× 6-minute rolling average (anomaly) |

### Mini cost chart

30-minute history at 30-second granularity, rendered as CSS bars. Shows the shape of recent spend.

### By Model breakdown

Session count, token breakdown (input / output / cache read / cache write), and cost per model.

### By Agent/Skill attribution

Cost grouped by `agent_id`, `skill_name`, or `tool` fields on sessions. Only shown when at least one session has attribution data.

### Session Detail table

Per-session rows from `/api/modelusage` — session ID, model, token counts, cost.

---

## 3. Recovery Console

*Screenshot: [Risk-coded action cards + confirmation modal + audit log]*

One-click recovery actions for common failure scenarios. Every action is audit-logged.

### Action cards

Four cards, each with a risk level indicated by a colored top border:

| Action | Risk | Confirmation required |
|--------|------|-----------------------|
| Clear Session | 🟢 Safe | Confirm button (auto `confirmed: true`) |
| Gateway Restart | 🟡 Moderate | Confirm button |
| Kill Agent by PID | 🟡 Moderate | Enter PID + confirm |
| Clear ALL Sessions | 🔴 Destructive | Type `CLEAR-ALL` exactly |

### Confirmation flow

1. Click the action button on a card.
2. A modal appears with a risk banner color-coded to the action's level.
3. For actions requiring input (PID, session ID, `CLEAR-ALL`), the relevant field appears in the modal.
4. Click the execute button (colored to match risk level) to confirm and send the request.
5. The modal closes and an inline result banner appears on the card (auto-dismisses after 8 s).

### Audit log

Below the action cards, a table shows recent recovery actions with timestamps, operator (always `operator` in v2), action type, target, and success/failure status. The log is fetched from `/api/recovery/audit`.

---

## 4. Agents (Health Grid)

*Screenshot: [Agent status cards grid + summary pills]*

Live health monitoring for every active OpenClaw agent session.

### Summary pills

At the top of the tab: counts of **Healthy** / **Warning** / **Stuck** / **Offline** agents, plus a live/polling indicator.

The tab badge shows total agent count. A red dot appears when any agent is stuck.

### Agent cards

Each card shows:
- **Status icon** — 🟢 Healthy | 🟡 Warning | 🔴 Stuck | ⚫ Offline
- **Agent name / ID**
- **Last seen** — time since last heartbeat
- **Context %** — context window utilization (`context_tokens / context_limit`)
- **Auto-restart mode** — `alert-only` | `auto-restart` | `manual`
- **INTERVENE** button — opens the HITL slide-over for this agent

Stuck cards pulse red (CSS animation).

### Status thresholds

| Status | Condition |
|--------|-----------|
| Healthy | Last heartbeat < `warnHeartbeatMs` (default 2 min) |
| Warning | Heartbeat between 2 min and `stuckMinutes` (default 5 min) |
| Stuck | Heartbeat > `stuckMinutes` |
| Offline | No timestamp or no session data found |

### Auto-restart configuration

Set per-agent in `nexus-config.json`:

```json
"agentHealth": {
  "mode": "alert-only",
  "agents": {
    "my-worker-agent": { "autoRestart": true }
  }
}
```

Restart is triggered by the OpenClaw CLI — the `mode` field controls what NEXUS does when it detects a stuck agent.

---

## 5. HITL Intervention

*Screenshot: [Slide-over panel with pause/resume/inject/terminate controls]*

Human-in-the-loop controls for individual agent sessions. Opened from any agent card's **INTERVENE** button.

### Slide-over panel

Shows the session ID, current status, last-seen timestamp, and context %. Below that, four action sections:

**Pause** (🟡 Moderate)
Halts new model calls for the session. Sends `POST /api/intervention/pause`.

**Resume** (🟢 Safe)
Unblocks a paused session. Sends `POST /api/intervention/resume`.

**Inject Message** (🟡 Moderate)
Expands a compose area. Type a message (max 4 096 characters) and click Inject. Sends `POST /api/intervention/inject` with `{sessionId, message}`. Use this to redirect an agent mid-task without terminating it.

**Terminate** (🔴 Destructive)
Expands an input requiring you to type `TERMINATE-<sessionId>` exactly. This sends a hard-kill signal via the CLI. Sends `POST /api/intervention/terminate`.

Inline result banners (✓ green / ✗ red) appear after each action and auto-dismiss after 8 seconds.

**Intervention audit log** — Bottom section of the slide-over shows recent intervention actions for this specific session, filtered from `/api/intervention/audit`.

Close the panel by clicking the overlay or pressing Escape.

---

## 6. Replay (Session Replay)

*Screenshot: [Session list + timeline scrubber + event detail panel]*

Step through the full event timeline of any agent session.

### Session list

A filterable table of all sessions:
- **Search bar** — filter by session ID, agent name, or model
- **Surface filter** — All / Cognitive / Operational / Contextual

Columns: Session ID, Agent, Model, Start time, Duration, Status, Event count. Click a row to open the player.

### Replay player

**Timeline scrubber** — horizontal bar with colored tick marks per event (🟢 Cognitive, 🟡 Operational, 🟣 Contextual). Drag or click to jump.

**Play controls:**
- ▶/⏸ Play/Pause — advances through events respecting real timing (capped at 2 s per step)
- ⏭ Step — move one event forward
- Speed selector: **1× / 2× / 4× / 8×**

**Event list** — scrollable list of all events. The current event is highlighted. Click any event to jump to it.

**Detail panel** — right side shows:
- Event type + surface
- Trace ID and span ID
- Status badge
- Full `data` JSON payload, formatted

**Bookmark** — ★ button on each event for personal annotation (stored client-side).

**Export:**
- **JSON** — downloads full session + events as `.json`
- **HTML** — downloads a self-contained HTML report (inline styles, no external deps)

### Log Query UI

Below the player, a query panel lets you search the raw event store:
- Surface selector, event-type selector, agent ID filter, data search, limit
- Results rendered as expandable cards; click to see full detail

---

## 7. Prompts

*Screenshot: [Key list + editor + version history]*

Version-controlled prompt management. All versions are append-only — nothing is ever overwritten.

### Key list (left panel)

Lists all prompt keys with their active version number. Click a key to load it into the editor. An **Active** badge shows the currently deployed version.

**New Key** — inline form at the bottom of the list. Type a name and press Enter.

### Editor (right panel)

- **Content** textarea — prompt text. Edit freely before saving.
- **Description** field — optional label for this version (e.g. "Add tool-use instructions").
- **Save New Version** — creates a new version number, does not modify any previous version.
- **↩ Rollback** — reverts to version N-1 with a confirmation step.

### Version history

Below the editor, a list of all versions for the selected key with timestamps and descriptions. Each version has an **Activate** button to deploy it as the active version without creating a new one.

---

## 8. Skills

*Screenshot: [Skill card grid + detail panel + execute form]*

Registry and executor for skills discovered from your skill directories.

NEXUS scans three directories automatically:
- `~/.claude/skills/`
- `~/.openclaw/skills/`
- `~/.config/claude/skills/`

Each subdirectory containing a `SKILL.md` file is registered as a skill. A 60-second cache prevents excessive filesystem scans.

### Skill grid

Cards show skill name, description, and trigger chips (keywords from `SKILL.md`). The tab badge shows total skill count.

### Detail panel

Click a skill card to open its detail view:
- Full `SKILL.md` content
- Usage statistics: use count, success rate, average duration, unique agents
- **Idle badge** if the skill has had no events in the past 7 days

### Execute

At the bottom of the detail panel:
- **Args** input — arguments to pass to the skill
- **▶ Execute** — calls `POST /api/skills/execute`
- **Dry run** checkbox — validates without running
- Inline stdout/stderr output rendered below

**Refresh** button (top-right of tab) forces a cache invalidation via `GET /api/skills/refresh`.

---

## 9. Orchestrate

*Screenshot: [Agent config grid + handoff timeline]*

Define and launch agent configurations, and manage agent-to-agent handoffs.

### Agent Configs

A grid of cards, one per configured agent:
- Name, model, description, system prompt preview
- **▶ Launch** — creates a session record and returns a session ID (async; actual execution requires the OpenClaw CLI)
- **Delete** — with confirmation

**+ New Agent** form:
| Field | Notes |
|-------|-------|
| Name | Unique identifier |
| Model | Select from known models |
| Description | Human-readable purpose |
| System prompt | Full text |
| Tools | Comma-separated list |
| Constraints | Constraints text |

The tab badge shows count of configured agents.

### Handoffs

Timeline list showing agent-to-agent handoffs:
- From → To agents
- Context summary
- Pending task chips

**+ New Handoff** form with autocomplete from configured agent IDs. Handoffs are stored as events in the event store (`event_type = 'agent.handoff'`) and are also visible in the Replay/Logs tabs.

---

## 10. Intelligence

*Screenshot: [Leaderboard + skill analytics + predictive alerts + recommendations]*

Analytics, predictions, and recommendations derived from event-store data. All data is computed server-side with a 60-second cache.

### Agent Leaderboard

Top 10 agents ranked by 24h success rate (falls back to 7d). Columns: rank medal, agent ID, 24h success rate, average duration, 24h event count.

Success rate colors: green ≥90% | yellow ≥60% | red <60%.

### Skill Usage Chart

Horizontal bar chart of top 10 skills by use count. Bar color = success rate tier. Click a bar to jump to that skill in the Skills tab.

### Predictive Alerts

Live list of active alerts:

| Alert type | Description |
|------------|-------------|
| **Cost forecast** | Linear trend on daily spend history predicts ≥80% or ≥100% of daily budget |
| **Failure prediction** | Recent error rate >2× 24h baseline, or ≥50% error rate with ≥3 samples |
| **Resource exhaustion** | Context % trend predicts hitting 80–90% within the session |

Each alert shows severity (critical/warn), confidence (low/medium/high), and a plain-English message.

### Cost Forecast Mini-Chart

Projected daily cost vs budget line, spend rate sparkline, and confidence level (low = <5 data points, medium = 5–13, high = ≥14).

### Recommendations

Dismissable cards with actionable suggestions:

| Recommendation | Condition |
|----------------|-----------|
| Downgrade model | Expensive model + ≥95% success rate + ≥10 events/7d → suggest Haiku |
| Upgrade model | Cheap model + <50% success rate + ≥5 events/7d → suggest Sonnet |
| Remove unused skill | Skill has had no events in 7 days |

Dismissals are per-session (not persisted). The badge count on the Intelligence tab updates as you dismiss recommendations.

---

## WebSocket real-time updates

NEXUS pushes data over four WebSocket rooms. The frontend connects to all four on page load.

**Connection URL format:**
```
ws://localhost:18790/ws?room=<room>&token=<auth-token>
```

The token can also be passed as an `Authorization: Bearer <token>` header.

### Message types

| Room | Message type | Trigger |
|------|--------------|---------|
| `cost-events` | `cost-update` | Every 30 s (cost aggregation cycle) |
| `cost-events` | `cost-alert` | Budget threshold or anomaly detected |
| `health-events` | `health-update` | Every 30 s (health monitor cycle) |
| `logs` | `event` | When a new event is ingested via POST or WS |
| `events` | — | Bidirectional: send events to ingest, receive broadcast of accepted events |

**Welcome message** — On connect, every room sends:
```json
{"type": "connected", "room": "cost-events", "ts": 1713456789000}
```

**Auto-reconnect** — The frontend reconnects after 8 seconds on disconnect.

**Ingesting events via WebSocket** (room: `events`):
```json
// Single event
{"type": "event", "data": {"surface": "operational", "event_type": "tool_call", "agent_id": "my-agent", "data": {...}}}

// Batch
{"type": "batch", "events": [{...}, {...}]}
```

---

## API Reference

All API endpoints require `Authorization: Bearer <token>` except `/health`, `/`, and WebSocket upgrades.

Base URL: `http://localhost:18790`

### Health

```bash
GET /health
```
Returns `{"ok": true, "ts": "..."}`. No auth required.

```bash
curl http://localhost:18790/health
```

---

### Cost

```bash
GET /api/cost/summary     # Full aggregator snapshot
GET /api/cost/budget      # Budget-focused: level, spendRate, hoursLeft
GET /api/cost/events      # Snapshot + WebSocket note
GET /api/cost/rate        # Raw spend rate + budget status
```

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:18790/api/cost/summary
```

Response shape (`/api/cost/summary`):
```json
{
  "ok": true,
  "ready": true,
  "totalCost": 0.0042,
  "spendRate": 0.00001,
  "projectedDaily": 0.05,
  "hoursLeft": null,
  "byModel": {"claude-sonnet-4-6": {"sessions": 3, "cost": 0.004}},
  "budgetStatus": {"level": "ok", "dailyPct": 0.4, "monthlyPct": 0.01},
  "anomaly": false
}
```

---

### Recovery

```bash
POST /api/recovery/gateway-restart    body: {"confirmed": true}
POST /api/recovery/session-clear      body: {"sessionId": "abc-123", "confirmed": true}
POST /api/recovery/agent-kill         body: {"pid": 12345, "confirmed": true}
POST /api/recovery/session-clear-all  body: {"confirmation": "CLEAR-ALL"}
GET  /api/recovery/audit              ?limit=100
```

```bash
# Restart gateway
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"confirmed":true}' http://localhost:18790/api/recovery/gateway-restart

# View audit log
curl -H "Authorization: Bearer $TOKEN" http://localhost:18790/api/recovery/audit?limit=20
```

---

### Agent Health

```bash
GET /api/health/agents
```

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:18790/api/health/agents
```

Response:
```json
{
  "ok": true,
  "agents": [
    {"id": "my-agent", "status": "healthy", "lastSeen": 1713456700000, "contextPct": 12}
  ],
  "counts": {"healthy": 1, "warning": 0, "stuck": 0, "offline": 0},
  "ts": 1713456789000
}
```

---

### Intervention

```bash
POST /api/intervention/pause      body: {"sessionId": "abc-123", "confirmed": true}
POST /api/intervention/resume     body: {"sessionId": "abc-123", "confirmed": true}
POST /api/intervention/inject     body: {"sessionId": "abc-123", "message": "Refocus on the primary task."}
POST /api/intervention/terminate  body: {"sessionId": "abc-123", "confirmation": "TERMINATE-abc-123"}
GET  /api/intervention/audit      ?limit=50
```

```bash
# Inject a message
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sessionId":"abc-123","message":"Stop and summarize progress."}' \
  http://localhost:18790/api/intervention/inject
```

---

### Session Replay

```bash
GET /api/sessions                          ?agent_id=&model=&status=&limit=50&offset=0
GET /api/sessions/:id
GET /api/sessions/:id/events
GET /api/sessions/:id/export               ?format=json|html
```

```bash
# List sessions
curl -H "Authorization: Bearer $TOKEN" "http://localhost:18790/api/sessions?limit=10"

# Export session as HTML
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:18790/api/sessions/abc-123/export?format=html" -o session.html
```

---

### Event Ingestion & Logs

```bash
POST /api/events                  # Ingest single event or batch
GET  /api/logs/query              ?surface=&event_type=&agent_id=&trace_id=&from=&to=&search=&limit=&offset=
GET  /api/logs/search             ?q=<term>
GET  /api/logs/recent             ?limit=20
GET  /api/logs/stats
GET  /api/logs/surfaces           # No auth required
```

```bash
# Ingest an event
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"surface":"operational","event_type":"tool_call","agent_id":"my-agent","data":{"tool":"bash","args":"ls"}}' \
  http://localhost:18790/api/events

# Ingest a batch
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"events":[{"surface":"cognitive","event_type":"reasoning_step","agent_id":"my-agent","data":{"thought":"Checking file list"}}]}' \
  http://localhost:18790/api/events

# Query logs
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:18790/api/logs/query?surface=operational&limit=50"

# Full-text search
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:18790/api/logs/search?q=bash"
```

**Event schema:**
```json
{
  "surface": "cognitive | operational | contextual",
  "event_type": "tool_call | tool_result | reasoning_step | ...",
  "agent_id": "my-agent",
  "trace_id": "optional-trace-uuid",
  "span_id": "optional-span-uuid",
  "data": {}
}
```

**Surface / event-type taxonomy:**
| Surface | Event types |
|---------|-------------|
| `cognitive` | `reasoning_step`, `tool_selected`, `confidence_score`, `context_built` |
| `operational` | `tool_call`, `tool_result`, `function_invoked`, `error`, `retry` |
| `contextual` | `http_request`, `db_query`, `cache_hit`, `cache_miss`, `file_read`, `file_write` |

---

### Prompts

```bash
GET  /api/prompts
GET  /api/prompts/:key
GET  /api/prompts/:key/history
GET  /api/prompts/:key/version/:version
POST /api/prompts/:key                    body: {"content": "...", "description": "..."}
POST /api/prompts/:key/activate           body: {"version": 3}
POST /api/prompts/:key/rollback
```

```bash
# Create / update a prompt
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"You are a helpful assistant. Be concise.","description":"Initial version"}' \
  http://localhost:18790/api/prompts/system-prompt

# Activate a specific version
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"version":2}' \
  http://localhost:18790/api/prompts/system-prompt/activate
```

---

### Skills

```bash
GET  /api/skills
GET  /api/skills/refresh
GET  /api/skills/:name
GET  /api/skills/:name/history
POST /api/skills/execute         body: {"name": "my-skill", "args": "arg1 arg2", "dry_run": false}
```

```bash
# List skills
curl -H "Authorization: Bearer $TOKEN" http://localhost:18790/api/skills

# Execute a skill
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"my-skill","args":"--verbose"}' \
  http://localhost:18790/api/skills/execute
```

---

### Orchestration

```bash
GET    /api/agents
POST   /api/agents                    body: {name, model, temperature, max_tokens, system_prompt, tools, constraints}
GET    /api/agents/:id
PUT    /api/agents/:id
DELETE /api/agents/:id
POST   /api/agents/:id/launch         body: {input?, message?}
GET    /api/agents/:id/sessions

GET    /api/handoffs
GET    /api/handoffs/:id
POST   /api/handoffs                  body: {from_agent, to_agent, context_summary, pending_tasks?, artifacts?, trace_id?}
POST   /api/handoff                   # Legacy alias for POST /api/handoffs
```

```bash
# Create agent config
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"summarizer","model":"claude-haiku-4-5-20251001","system_prompt":"Summarize the input in 3 bullets."}' \
  http://localhost:18790/api/agents

# Launch an agent
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"Summarize today'\''s research notes."}' \
  http://localhost:18790/api/agents/summarizer/launch

# Record a handoff
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"from_agent":"researcher","to_agent":"summarizer","context_summary":"Completed web research","pending_tasks":["Write report"]}' \
  http://localhost:18790/api/handoffs
```

---

### Intelligence

```bash
GET /api/intelligence                   # Full bundle
GET /api/intelligence/overview          # Lightweight summary (overview tab)
GET /api/intelligence/agents            # Agent leaderboard
GET /api/intelligence/agents/:id        # Single agent metrics
GET /api/intelligence/skills            # Skill usage analytics
GET /api/intelligence/alerts            # Predictive alerts
GET /api/intelligence/recommendations   # Smart recommendations
```

```bash
# Get predictive alerts
curl -H "Authorization: Bearer $TOKEN" http://localhost:18790/api/intelligence/alerts

# Get full intelligence bundle
curl -H "Authorization: Bearer $TOKEN" http://localhost:18790/api/intelligence
```

---

## Configuration tips

### Single agent setup

Minimal config: set `budgets.dailyUsd` to a comfortable daily limit, point `paths.sessionDb` at your sessions file, and leave `agentHealth.mode` as `"alert-only"`. You only need to watch one agent, so the health grid and cost attribution work immediately with no additional configuration.

### Multi-agent setup

Assign unique `agent_id` values to each agent session. NEXUS groups cost, health, and intelligence data by agent ID automatically. For critical agents, add an entry to `agentHealth.agents`:

```json
"agentHealth": {
  "mode": "alert-only",
  "agents": {
    "critical-worker": { "autoRestart": true },
    "batch-processor": { "autoRestart": false }
  }
}
```

Use the Orchestrate tab to define agent configs and record handoffs, which makes the full agent-to-agent workflow visible in the Replay tab.

### High-volume event ingestion

For high-throughput agents, use the batch endpoint or the WebSocket `events` room rather than one POST per event. The event store uses WAL mode and can handle bursts well; batches up to 500 events are processed atomically.

Tune `retention.days` downward if disk space is a concern — 7 days is sufficient for most debugging workflows.

### Cost monitoring only

If you only need cost visibility and don't have a session database, NEXUS degrades gracefully. The CLI fallback provides session data as long as `openclaw status` returns valid JSON. All other tabs (Replay, Prompts, Skills, etc.) work independently of the session database.
