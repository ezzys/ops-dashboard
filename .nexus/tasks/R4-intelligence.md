# Worker Task: Phase 4 — Intelligence Layer + Predictive Alerts

## Project: /tmp/ops-dashboard
## Read /tmp/ops-dashboard/.nexus/worker-reports/R1.5-infrastructure.md FIRST for codebase context.

## Context
Phases 0-3 done. You're building the final phase — intelligence, predictions, and the finishing touches.

## R4.1 — Agent Intelligence Dashboard

### R4.1.1 — Agent performance metrics
Create `src/services/agent-intelligence.js`:
- Track per-agent metrics from event store: success rate, avg duration, tool usage frequency, cost efficiency
- Rolling 24h + 7d windows
- Expose: `getAgentMetrics(agentId)`, `getLeaderboard()`

### R4.1.2 — Skill usage analytics
- Which skills are used most, success rates, avg cost per skill execution
- From event store `tool_selected` + `tool_result` events

### R4.1.3 — Cost anomaly patterns
- Detect recurring cost spikes (same agent, same time of day)
- Learn typical spend patterns per hour-of-day

## R4.2 — Predictive Alerts

### R4.2.1 — Predictive cost forecasting
Create `src/services/predictive-alerts.js`:
- Simple linear extrapolation from last 24h spend data
- Project remaining daily/monthly cost
- Alert when projected > budget threshold

### R4.2.2 — Agent failure prediction
- Track error rates per agent over time windows
- Alert when error rate exceeds baseline by >2x
- "This agent may be heading toward a failure spiral"

### R4.2.3 — Resource exhaustion prediction
- Monitor context window usage trends
- Alert when approaching context limit (80%, 90%)
- Estimate time-to-exhaustion

## R4.3 — Smart Recommendations

### R4.3.1 — Model routing suggestions
- If agent consistently uses cheap model successfully → suggest downgrading
- If agent frequently fails on cheap model → suggest upgrading
- Based on success rate + cost per task

### R4.3.2 — Skill optimization tips
- Unused skills (installed but never called in 7d) → suggest removal
- High-cost skills → suggest alternatives

## R4.4 — Frontend: Intelligence Tab

Add to `index.html`:
- **📊 Intelligence** tab
- Agent leaderboard (success rate, cost efficiency, avg speed)
- Skill usage chart (bar chart, top 10 skills by usage)
- Predictive alerts panel (active warnings with confidence)
- Recommendations cards (dismissable)
- Cost forecast mini-chart (projected vs budget)

## R4.5 — Final Polish

### R4.5.1 — Dashboard overview/home
- First tab should be a summary overview:
  - Active agents count, total cost today, alerts count
  - Quick links to each section
  - Recent activity feed (last 10 events)

### R4.5.2 — Mobile responsive
- Ensure all tabs work on mobile (stacked layouts, collapsible sections)

### R4.5.3 — Dark mode
- CSS variable-based theming with light/dark toggle
- Persist preference in localStorage

## File Structure
```
src/services/agent-intelligence.js    # NEW — metrics + analytics
src/services/predictive-alerts.js     # NEW — forecasting + alerts
src/routes/intelligence.js            # NEW — intelligence API routes
src/server.js                         # MODIFY — wire new routes
index.html                            # MODIFY — Intelligence tab + overview + dark mode
```

## Output
Write summary to /tmp/ops-dashboard/.nexus/worker-reports/R4-intelligence.md

## IMPORTANT
- Predictive models should be SIMPLE — linear extrapolation, rolling averages. No ML libraries.
- Intelligence tab should load fast — cache metrics, don't recompute on every request
- Dark mode: CSS variables only, no framework
- Test: `node src/server.js` should still start
