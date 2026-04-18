# Worker Task: Phase 3 — Orchestration + Skill Forge

## Project: /tmp/ops-dashboard
## Read /tmp/ops-dashboard/.nexus/worker-reports/R1.5-infrastructure.md FIRST for codebase context.

## Context
Phase 0-2 done. Event store, session replay, three-surface logging all working. You're building the orchestration and skill management layer.

## R3.1 — Prompt Versioning

### R3.1.1 — Prompt store
Create `src/services/prompt-store.js`:
- SQLite table in `data/events.db` or new `data/nexus.db`:
```sql
CREATE TABLE prompt_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1
);
CREATE UNIQUE INDEX idx_prompt_active ON prompt_versions(prompt_key, is_active);
```
- Methods: `savePrompt(key, content, desc)`, `getActivePrompt(key)`, `listPrompts()`, `getPromptHistory(key)`, `activatePrompt(key, version)`

### R3.1.2 — Prompt API routes
Create `src/routes/prompts.js`:
- `GET /api/prompts` — list all prompt keys
- `GET /api/prompts/:key` — get active version
- `GET /api/prompts/:key/history` — version history
- `POST /api/prompts/:key` — save new version
- `POST /api/prompts/:key/activate` — activate specific version
- `POST /api/prompts/:key/rollback` — rollback to previous version

## R3.2 — Agent Orchestration

### R3.2.1 — Agent config store
Create `src/services/agent-config.js`:
- Store agent configurations: model, temperature, max_tokens, system_prompt, tools, constraints
- CRUD operations backed by JSON file `data/agent-configs.json` or SQLite

### R3.2.2 — Agent launch API
Create `src/routes/orchestration.js`:
- `GET /api/agents` — list configured agents
- `POST /api/agents` — create agent config
- `PUT /api/agents/:id` — update agent config
- `DELETE /api/agents/:id` — delete agent config
- `POST /api/agents/:id/launch` — launch agent session
- `GET /api/agents/:id/sessions` — list sessions for agent

### R3.2.3 — Handoff protocol
Create `src/services/handoff.js`:
- Define handoff schema: `{from_agent, to_agent, context_summary, pending_tasks, artifacts}`
- `POST /api/handoff` — execute handoff
- `GET /api/handoff/:id` — get handoff details
- Store handoffs in event store as special events

## R3.3 — Skill Forge

### R3.3.1 — Skill registry
Create `src/services/skill-registry.js`:
- Scan skills from OpenClaw skill directories
- Parse SKILL.md metadata (name, description, triggers)
- Cache skill index with periodic refresh

### R3.3.2 — Skill API routes
Create `src/routes/skills.js`:
- `GET /api/skills` — list available skills
- `GET /api/skills/:name` — skill details + SKILL.md content
- `POST /api/skills/execute` — trigger skill execution
- `GET /api/skills/:name/history` — execution history from event store

### R3.3.3 — Skill marketplace UI
Add to `index.html`:
- Skills tab: grid of skill cards with name, description, trigger phrases
- Click to view detail (SKILL.md rendered)
- Execute button with confirmation
- Execution history list

## R3.4 — Frontend: Orchestration UI

Add to `index.html`:
- Prompts tab: prompt list, version history diff, edit + save, rollback button
- Agents tab extension: agent config cards, launch button, session history
- Handoff visualization: timeline showing agent handoffs with context summaries

## File Structure
```
src/services/prompt-store.js      # NEW
src/services/agent-config.js      # NEW
src/services/handoff.js           # NEW
src/services/skill-registry.js    # NEW
src/routes/prompts.js             # NEW
src/routes/orchestration.js       # NEW
src/routes/skills.js              # NEW
src/server.js                     # MODIFY
index.html                        # MODIFY
```

## Output
Write summary to /tmp/ops-dashboard/.nexus/worker-reports/R3-orchestration-skill-forge.md

## IMPORTANT
- Use existing SQLite infrastructure (event-store pattern)
- Skill scanning should handle missing directories gracefully
- Test: `node src/server.js` should still start
