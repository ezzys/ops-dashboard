# Merged Audit Report — NEXUS v2 Dashboard
**Date:** 2026-04-18
**Auditors:** Claude Sonnet 4.6 + Gemini (combined)

## Executive Summary

| Auditor | Total Reqs | PASS | PARTIAL | FAIL | MISSING | Coverage |
|---------|-----------|------|---------|------|---------|----------|
| Claude (granular) | 91 | 42 (46%) | 23 (25%) | 1 (1%) | 25 (27%) | Per-requirement |
| Gemini (high-level) | 14 | 14 (100%) | 0 | 0 | 0 | Per-feature |

Gemini gave a high-level PASS to all features. Claude went granular and found **25 missing requirements** — mostly in Phase 3 (Cron DAG, Git Attribution) and Phase 4 (Prometheus, RBAC, radar charts).

## Top 5 Critical Findings (both auditors agree)

### 1. 🔴 Auth token exposed in HTML (Claude-only, P0)
- `index.html:1119` hardcodes `AUTH_TOKEN` in plaintext
- Anyone who loads the page can read it and call all API endpoints including destructive ones
- **Fix:** Remove from HTML, serve via authenticated session or same-origin `/api/config`

### 2. 🔴 `agent.handoff` event type breaks validation (Claude-only, P0)
- `handoff.js` calls `store.writeEvent()` directly, bypassing `validateEvent()`
- Event type `agent.handoff` not in `ALL_EVENT_TYPES` → external agents get 400 on POST
- Handoff events not broadcast to WebSocket `logs` room
- **Fix:** Add to `event-types.js`, use `ingestEvent()` instead

### 3. 🟡 Frontend `sessionCost()` uses hardcoded wrong prices (Claude-only, P1)
- `index.html:1133-1136` hardcodes MiniMax prices for ALL models
- Claude Opus session would show 50× undercount
- This was supposed to be fixed in T0.1.6 but wasn't
- **Fix:** Delete frontend `sessionCost()`, use `/api/cost/budget` response

### 4. 🟡 Heartbeat emitter entirely absent (Claude-only, P1)
- Health monitor uses session DB timestamps, not actual agent heartbeats
- Finished sessions appear "stuck", housekeeping updates appear "healthy"
- **Fix:** Define heartbeat protocol, agents POST to `/api/events` every 30s

### 5. 🟡 Phase 3 Cron DAG + Git Attribution completely missing (Claude-only, P2)
- 9 requirements (R3.3.1-R3.3.5, R3.4.1-R3.4.4) have zero implementation
- No D3 graph, no topological sort, no git hooks
- **Fix:** Implement in follow-up sprint or descope from v2

## Merged Corrective Actions (Prioritized)

### P0 — Do Now (Security + Correctness)

| # | Finding | Effort | Auditor |
|---|---------|--------|---------|
| 1 | Remove AUTH_TOKEN from index.html, serve securely | 1h | Claude |
| 2 | Fix `agent.handoff` event type: add to event-types.js, use ingestEvent() | 30min | Claude |
| 3 | Delete frontend `sessionCost()`, use API cost data | 30min | Claude |

### P1 — Do Before Deploy

| # | Finding | Effort | Auditor |
|---|---------|--------|---------|
| 4 | Define heartbeat protocol + agent SDK endpoint | 4h | Claude |
| 5 | Add circuit breaker alert broadcast (currently silent) | 30min | Claude |
| 6 | Consolidate DB connections (3 services open same file) | 2h | Claude |
| 7 | Replace `/tmp` sysmetrics script pattern with inline logic | 1h | Claude |
| 8 | Add basic test suite (destructive routes at minimum) | 4h | Both |

### P2 — Follow-up Sprint

| # | Finding | Effort | Auditor |
|---|---------|--------|---------|
| 9 | Phase 3 Cron DAG (topological sort + D3 renderer) | 12h | Claude |
| 10 | Phase 3 Git Attribution (git hooks + PR tracking) | 6h | Claude |
| 11 | Phase 4 Prometheus `/metrics` endpoint | 4h | Claude |
| 12 | Phase 4 RBAC (viewer/operator/admin roles) | 6h | Claude |
| 13 | Frontend logs tab: WebSocket live stream instead of polling | 3h | Claude |
| 14 | Externalize budget thresholds to config | 1h | Gemini |
| 15 | SKILL.md schema validation | 2h | Gemini |
| 16 | Config Editor tab for live updates | 3h | Gemini |

### P3 — Nice to Have

| # | Finding | Effort | Auditor |
|---|---------|--------|---------|
| 17 | Phase 3 node-graph visualization (D3/Cytoscape) | 8h | Claude |
| 18 | Phase 4 radar chart (cross-model comparison) | 6h | Claude |
| 19 | Phase 4 compliance export (CSV/JSON) | 3h | Claude |
| 20 | SQLite FTS5 for full-text search | 4h | Claude |
| 21 | Replace custom logger with pino | 2h | Claude |
| 22 | Swagger/OpenAPI docs | 3h | Gemini |
| 23 | Refactor index.html into modular components | 8h | Gemini |
| 24 | WebSocket auth: headers instead of query params | 2h | Gemini |

## Stats
- P0 items: 3 (~2h total)
- P1 items: 5 (~11.5h total)
- P2 items: 8 (~37h total)
- P3 items: 8 (~36h total)
- **Total corrective effort: ~86.5h**

## Recommendation
Fix P0 (2h) and P1 (11.5h) before deploying. Descope P2/P3 to v2.1 milestone.
