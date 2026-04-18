# Worker Task: Documentation — SETUP.md + USAGE.md

## Project: /tmp/ops-dashboard
## Read all worker reports in .nexus/worker-reports/ to understand the full system.

## Task
Create comprehensive user documentation for the NEXUS v2 AI Agent Operations Dashboard.

## SETUP.md — Installation & Configuration

Cover:
1. Prerequisites (Node.js 18+, npm, OpenClaw running, optionally better-sqlite3 native deps)
2. Clone + `npm install`
3. Configuration: `nexus-config.json` — explain every field:
   - budgets (dailyUsd, monthlyUsd)
   - thresholds (stuckMinutes, warnHeartbeatMs, errorHeartbeatMs)
   - modelPrices
   - auth.token (or NEXUS_TOKEN env var)
   - rateLimit
   - retention
   - paths (openclaw CLI, node, sessionDb, researchDir)
   - websocket.rooms
   - agentHealth
4. Starting the server: `node src/server.js` (or `npm start`)
5. Environment variables: NEXUS_TOKEN, NEXUS_PORT, NEXUS_CONFIG
6. Connecting to OpenClaw: how the dashboard discovers the gateway
7. Reverse proxy / production deployment tips
8. Troubleshooting common issues

## USAGE.md — Feature Guide

Cover every tab/feature:
1. Overview tab — what you see, summary cards, activity feed
2. Cost Shield — budget bars, spend velocity, alerts, anomaly detection, per-model breakdown
3. Recovery Console — risk-coded action cards, confirmation flows, audit log
4. Agents (Health Grid) — agent status cards, stuck detection, auto-restart config
5. HITL Intervention — pause/resume/inject/terminate, slide-over panel
6. Replay (Session Replay) — session list, timeline scrubber, play controls, event details, export
7. Prompts — version history, activate/rollback, editor
8. Skills — registry, usage stats, execute
9. Orchestrate — agent configs, launch, handoffs
10. Intelligence — leaderboard, skill analytics, predictive alerts, recommendations
11. Dark mode toggle
12. WebSocket real-time updates (how they work)

Also include:
- API Reference section listing all endpoints grouped by feature
- Keyboard shortcuts if any
- Configuration tips for different use cases (single agent vs multi-agent)

## Output
Write SETUP.md and USAGE.md to /tmp/ops-dashboard/

## IMPORTANT
- Be concise but complete — this is an operator's manual
- Include example config snippets
- Include example API calls with curl
- Don't include screenshots (just note "Screenshot: [description]" as placeholder)
