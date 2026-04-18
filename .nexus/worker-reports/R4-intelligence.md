# R4 — Intelligence Layer + Predictive Alerts
**Date:** 2026-04-18  
**Status:** Complete

---

## Files Created

| File | Purpose |
|------|---------|
| `src/services/agent-intelligence.js` | Per-agent metrics, skill analytics, cost anomaly patterns |
| `src/services/predictive-alerts.js` | Cost forecasting, failure prediction, resource exhaustion alerts |
| `src/routes/intelligence.js` | Intelligence API routes |

## Files Modified

| File | Changes |
|------|---------|
| `src/server.js` | Registered `./routes/intelligence` |
| `index.html` | Overview tab, Intelligence tab, dark mode, mobile polish |

---

## R4.1 — Agent Intelligence Service (`src/services/agent-intelligence.js`)

### Metrics computed
- **Per-agent**: `success_rate_24h`, `success_rate_7d`, `avg_duration_ms`, `top_tools[5]`, `primary_model`, `error_count_24h/7d`, `cost_efficiency` tier
- **Rolling windows**: 24h and 7d from event store
- **Leaderboard**: sorted by success rate (24h preferred), then event activity

### Skill analytics
- `uses`, `success_rate`, `avg_duration_ms`, `unique_agents`, `is_idle` (not seen in 7d)
- Derived from `tool_selected` + `tool_result` events

### Cost anomaly patterns
- Hourly event-density map (hour-of-day 0–23)
- `avg_events` per hour across sample days
- `peakHours` (top 3 busiest hours)

**Cache**: 60-second TTL, lazy-computed on first request

---

## R4.2 — Predictive Alerts (`src/services/predictive-alerts.js`)

### R4.2.1 Cost Forecasting
- Linear least-squares fit on `dailyHistory` from cost-aggregator
- Falls back to `spendRate × minutesRemaining` when < 5 data points
- Produces: `projectedDaily`, `projectedMonthly`, `dailyPct`, confidence (`low/medium/high`)
- Alerts at ≥80% projected usage (warn) and ≥100% (critical)

### R4.2.2 Agent Failure Prediction
- Computes error rates over 24h / 1h / 30m windows per agent
- Fires alert when `recentRate > 2× baseRate` (spiral) or `latestRate ≥ 50%` with ≥3 samples (critical)
- Returns multiplier (e.g. "3.4× above baseline")

### R4.2.3 Resource Exhaustion
- Reads `data.context_pct` or derives from `data.context_tokens / data.context_limit`
- Fits linear trend → estimates `time_to_exhaust_min`
- Alerts at ≥80% (warn) and ≥90% (critical)

---

## R4.3 — Smart Recommendations

- **Model downgrade**: expensive model + ≥95% SR + ≥10 events/7d → suggest Haiku
- **Model upgrade**: cheap model + <50% SR + ≥5 events/7d → suggest Sonnet
- **Unused skills**: `is_idle` (no events in 7d) → suggest removal

---

## R4.4 — Intelligence Tab (Frontend)

### Leaderboard
- Top 10 agents ranked by success rate (24h > 7d), with avg duration and 24h event count
- Gold/silver/bronze medals, colour-coded success rate

### Skill Usage Chart
- Horizontal bar chart, top 10 skills by usage
- Bar colour = success rate tier (green ≥90%, yellow ≥60%, red <60%)

### Predictive Alerts Panel
- Live list of `critical` + `warn` alerts from cost forecast, failure prediction, resource exhaustion
- Confidence badges

### Cost Forecast Mini-Chart
- Projected daily cost vs budget, spend rate sparkline, confidence level

### Recommendations Cards
- Dismissable per-session (stored in `_dismissedRecs` Set)
- Badge count updates on dismiss

---

## R4.5 — Overview Tab + Polish

### Overview Tab (first tab, `tab-overview`)
- 4 stat cards: Alerts, Active Agents, Cost Today, Skills tracked
- Quick-nav grid (8 links to all major sections)
- Recent activity feed (last 10 events from event store)
- Alert banner links to Intelligence tab when issues exist

### Dark Mode (`data-theme` attribute, CSS variables)
```css
:root           { --bg: #0d1117; --bg2: #161b22; ... }
[data-theme="light"] { --bg: #ffffff; --bg2: #f6f8fa; ... }
```
- Toggle button (🌙/☀️) in header
- Preference persisted in `localStorage` key `nexus-theme`
- Applied via `initTheme()` called in `boot()`

### Mobile Responsive
- Overview quick-links: 2→3 columns at 480px
- Intelligence grid: 2 columns on mobile
- Leaderboard hides Dur/Events columns on narrow screens
- Skill bar names truncated to 90px on mobile

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/intelligence` | Full bundle (agents + skills + anomaly + predictions) |
| GET | `/api/intelligence/overview` | Lightweight summary (overview tab) |
| GET | `/api/intelligence/agents` | Agent leaderboard |
| GET | `/api/intelligence/agents/:id` | Single agent metrics |
| GET | `/api/intelligence/skills` | Skill usage analytics |
| GET | `/api/intelligence/alerts` | Predictive alerts |
| GET | `/api/intelligence/recommendations` | Smart recommendations |

---

## Test Results

```
node src/server.js             → starts OK (port 18790)
GET /health                    → {"ok":true}
GET /api/intelligence/overview → {"ok":true,"activeAgents":0,...}
GET /api/intelligence          → {"ok":true,"agents":[],"skills":[],...}
```

All routes return 200. With empty event store, agents/skills are empty arrays and predictions report no alerts — correct baseline behaviour.

---

## Notes

- Intelligence metrics are read-only over the event store (no writes)
- Cache TTL = 60s keeps repeated tab refreshes cheap
- All predictive models are pure JavaScript — no ML libraries
- Dark mode uses only CSS custom properties; zero layout changes needed
