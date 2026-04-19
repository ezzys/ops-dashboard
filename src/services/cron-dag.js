'use strict';

// R3.3.1 — Cron DAG service
// Parses cron job configs to detect depends:/after: patterns,
// builds adjacency lists, and provides topological sort + cycle detection.

const { getCronList } = require('./openclaw');

// ── Dependency extraction ─────────────────────────────────────────────────────
// Supported patterns in job description or name:
//   "depends: job-a, job-b"
//   "depends on: job-a"
//   "after: job-a"

const DEP_RE = /(?:depends?(?:\s+on)?|after)\s*:\s*([^\n;|]+)/i;

function extractDeps(text) {
  if (!text) return [];
  const m = DEP_RE.exec(text);
  if (!m) return [];
  return m[1].split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
}

// ── DAG builder ───────────────────────────────────────────────────────────────

/**
 * Fetch cron jobs and build the dependency graph.
 *
 * Returns:
 *   nodes      Map<id, jobObject>
 *   adj        Map<id, string[]>  — id depends-on these upstream ids
 *   reverseAdj Map<id, string[]>  — these ids depend on id (downstream)
 *   jobs       raw job array
 */
function buildDAG() {
  const result = getCronList();
  const jobs = Array.isArray(result.data) ? result.data : [];

  const nodes      = new Map();
  const adj        = new Map(); // upstream deps
  const reverseAdj = new Map(); // downstream dependents

  // First pass: register all jobs
  for (const job of jobs) {
    const id = job.id || job.name;
    if (!id) continue;
    nodes.set(id, job);
    adj.set(id, []);
    reverseAdj.set(id, []);
  }

  // Second pass: extract dependency edges
  for (const job of jobs) {
    const id = job.id || job.name;
    if (!id) continue;
    const text = [job.description, job.message, job.name].filter(Boolean).join(' ');
    const deps = extractDeps(text);
    for (const dep of deps) {
      if (nodes.has(dep) && dep !== id) {
        adj.get(id).push(dep);
        reverseAdj.get(dep).push(id);
      }
    }
  }

  return { nodes, adj, reverseAdj, jobs };
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────────────

/**
 * Returns execution order respecting dependencies.
 * { order: string[], complete: boolean }
 * complete=false indicates cycles exist (not all nodes in order).
 */
function getDependencyOrder() {
  const { nodes, adj } = buildDAG();
  const ids = [...nodes.keys()];

  // in-degree = number of things this node depends on
  const inDeg = new Map(ids.map(id => [id, 0]));
  for (const [id, deps] of adj) {
    inDeg.set(id, deps.length);
  }

  const queue = ids.filter(id => inDeg.get(id) === 0);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    // For each node that depends on us (downstream), reduce their in-degree
    for (const downstream of (reverseAdjOf(adj, id))) {
      const d = inDeg.get(downstream) - 1;
      inDeg.set(downstream, d);
      if (d === 0) queue.push(downstream);
    }
  }

  return { order, complete: order.length === ids.length };
}

// Helper: build reverse map inline from adj
function reverseAdjOf(adj, source) {
  const result = [];
  for (const [id, deps] of adj) {
    if (deps.includes(source)) result.push(id);
  }
  return result;
}

// ── Cycle detection (DFS coloring) ───────────────────────────────────────────

/**
 * Detect circular dependencies via DFS.
 * Returns { cycles: string[][], hasCycles: boolean }
 * Each cycle is an array of job IDs forming the loop.
 */
function detectCycles() {
  const { nodes, adj } = buildDAG();
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...nodes.keys()].map(id => [id, WHITE]));
  const cycles = [];

  function dfs(id, path) {
    color.set(id, GRAY);
    for (const dep of (adj.get(id) || [])) {
      if (color.get(dep) === GRAY) {
        // Back-edge found — record cycle
        const start = path.indexOf(dep);
        cycles.push([...path.slice(start), dep]);
      } else if (color.get(dep) === WHITE) {
        dfs(dep, [...path, dep]);
      }
    }
    color.set(id, BLACK);
  }

  for (const id of nodes.keys()) {
    if (color.get(id) === WHITE) dfs(id, [id]);
  }

  return { cycles, hasCycles: cycles.length > 0 };
}

module.exports = { buildDAG, getDependencyOrder, detectCycles };
