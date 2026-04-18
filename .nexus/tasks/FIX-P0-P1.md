# Worker Task: Fix P0 + P1 Audit Findings

## Project: /tmp/ops-dashboard
## Read /tmp/ops-dashboard/.nexus/worker-reports/AUDIT-MERGED.md for the full findings list.

## Fix ALL of these issues. Do NOT skip any.

## P0 — Security + Correctness (MUST FIX)

### P0.1 — Remove AUTH_TOKEN from index.html
- `index.html:1119` has `const AUTH_TOKEN='52700a12570c54a80cb138b0d2322deb7238875879541ce6';`
- The server should inject the token at serve time instead
- Fix: In `src/server.js`, when serving index.html, replace a placeholder like `__NEXUS_TOKEN__` with the actual token from config
- In `index.html`, replace the hardcoded token with `__NEXUS_TOKEN__` placeholder
- This way the token is never in the source file, only injected at runtime

### P0.2 — Fix agent.handoff event type validation
- `src/services/event-types.js` — add `AGENT_HANDOFF: 'agent.handoff'` to the operational surface event types
- `src/services/handoff.js` — change from calling `store.writeEvent()` directly to using `eventIngest.ingestEvent()` so validation + broadcasting works
- Make sure handoff.js imports eventIngest correctly

### P0.3 — Delete frontend sessionCost() and use API
- `index.html:1133-1136` has a hardcoded `sessionCost()` function with MiniMax prices
- Delete this function entirely
- Any code that calls it should instead use cost data from the `/api/cost/budget` endpoint response
- Search for all references to `sessionCost` in index.html and update them

## P1 — Before Deploy

### P1.1 — Define heartbeat protocol
- Add `POST /api/agents/:id/heartbeat` route in `src/routes/health.js` or a new file
- It should write an event: `{surface:'operational', event_type:'tool_call', agent_id: id, timestamp: Date.now(), data:{type:'heartbeat'}}`
- Use eventIngest to write it so it gets broadcast
- Update health-monitor.js to query event store for last heartbeat per agent_id instead of session timestamps
- Add HEARTBEAT event type to event-types.js

### P1.2 — Add circuit breaker alert broadcast
- In `src/services/openclaw.js`, when circuit breaker trips (sets `_circuitOpen = true`), broadcast to `health-events` WebSocket room
- The broadcast function needs to be passed in — add a `setBroadcast(fn)` method similar to other services
- Wire it in server.js startup

### P1.3 — Consolidate DB connections
- Create `src/services/db.js` — single shared better-sqlite3 connection to `data/events.db`
- Replace individual `new Database(DB_PATH)` calls in: event-store.js, agent-config.js, prompt-store.js
- Export shared instance

### P1.4 — Replace /tmp sysmetrics script with inline logic
- `src/services/sysmetrics.js` writes a script to `/tmp/claw_sysmetrics.js` and executes it
- Replace with inline Node.js `os` module calls: `os.cpus()`, `os.totalmem()`, `os.freemem()`, `os.loadavg()`
- Keep spawn for `df` disk usage (can't avoid it), but use array-form args
- Remove the temp file write entirely

### P1.5 — Add basic test suite
- Install `tap` or `node:test` (built-in)
- Create `test/` directory
- Write tests for: recovery routes (schema validation, confirmation enforcement), cost calculator, event validation
- Use `fastify.inject()` for route testing
- Update `package.json` test script

## Output
Write summary to /tmp/ops-dashboard/.nexus/worker-reports/FIX-P0-P1.md

## IMPORTANT
- Fix P0 items FIRST, then P1
- After ALL fixes, run `node src/server.js` and verify it starts
- If it doesn't start, fix the error before finishing
- Commit-style summary of what changed
