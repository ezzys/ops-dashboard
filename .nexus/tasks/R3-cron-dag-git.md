# Worker Task: R3.3 Cron DAG + R3.4 Git Attribution

## Project: /tmp/ops-dashboard
## Read /tmp/ops-dashboard/.nexus/worker-reports/R1.5-infrastructure.md and AUDIT-MERGED.md first.

## R3.3 — Cron DAG (Dependency Graph)

### R3.3.1 — Cron dependency detection
Create `src/services/cron-dag.js`:
- Parse cron job configs to detect `depends:` or `after:` patterns in job descriptions/messages
- Build adjacency list: `{jobId → [dependsOnJobIds]}`
- Topological sort to detect circular dependencies
- Expose: `buildDAG()`, `getDependencyOrder()`, `detectCycles()`

### R3.3.2 — DAG renderer (API)
Create `src/routes/cron-dag.js`:
- `GET /api/cron/dag` — returns full DAG with nodes + edges
- `GET /api/cron/dag/:jobId/dependencies` — upstream deps for a job
- `GET /api/cron/dag/timeline` — next 24h projected execution order
- Use OpenClaw cron list API to fetch jobs

### R3.3.3 — Status propagation
- When a job fails, mark downstream jobs as "blocked"
- `GET /api/cron/dag/status` — propagation status

### R3.3.4 — Frontend DAG visualization
In `index.html`, add to Orchestrate tab or new section:
- Use D3.js (CDN) force-directed graph for DAG visualization
- Nodes = jobs, edges = dependencies
- Color by status: green=ok, yellow=running, red=failed, gray=blocked
- Click node to see job details
- 24h timeline view below

## R3.4 — Git-Native Attribution

### R3.4.1 — Commit detection
Create `src/services/git-attribution.js`:
- Run `git log --format=json` via spawnSync (array args)
- Parse commits to extract: hash, author, timestamp, message, files changed
- Map commits to agents via message patterns (agent signatures in commit msgs)

### R3.4.2 — Working tree change tracking
- `git diff --stat` + `git status --porcelain` for uncommitted changes
- Track which files agents are currently modifying

### R3.4.3 — PR review attribution
- `gh pr list --json` to fetch open PRs
- Link PRs to agents who created them
- Show review status

### R3.4.4 — Git Nexus routes
Create `src/routes/git.js`:
- `GET /api/git/log?limit=20` — recent commits with agent attribution
- `GET /api/git/status` — working tree changes
- `GET /api/git/prs` — open PRs
- `GET /api/git/attribution` — which agent authored what

### R3.4.5 — Git Nexus UI
In `index.html`:
- Git tab or section in Orchestrate
- Commit list with agent avatars
- File change heatmap (most-edited files)
- PR status cards

## File Structure
```
src/services/cron-dag.js         # NEW
src/services/git-attribution.js  # NEW
src/routes/cron-dag.js           # NEW
src/routes/git.js                # NEW
src/server.js                    # MODIFY — register routes
index.html                       # MODIFY — DAG viz + Git tab
```

## Output
Write summary to /tmp/ops-dashboard/.nexus/worker-reports/R3.3-R3.4-cron-dag-git.md

## IMPORTANT
- All git operations via spawnSync with array args (no shell injection)
- D3.js via CDN, no npm install needed
- Test: `node src/server.js` must still start
