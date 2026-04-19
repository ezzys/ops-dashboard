'use strict';

// R3.4 — Git-native attribution
// All git operations use spawnSync with array args — no shell injection.

const { spawnSync } = require('child_process');
const path = require('path');

// Repo root: two levels up from src/services/
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── Agent signature extraction ────────────────────────────────────────────────
// Looks for common patterns agents write into commit messages:
//   [agent:worker-r3]
//   agent: my-agent
//   Co-Authored-By: Claude Sonnet 4.6
//   [WORKER-R3] Fix thing   (uppercase bracket prefix)

const AGENT_PATTERNS = [
  { re: /\[agent:([^\]]+)\]/i,           group: 1 },
  { re: /^agent:\s*(\S+)/im,             group: 1 },
  { re: /Co-Authored-By:\s*([^\s<\n]+)/i, group: 1 },
  { re: /^\[([A-Z][A-Z0-9\-]{2,})\]/m,  group: 1 },
];

function extractAgent(message) {
  for (const { re, group } of AGENT_PATTERNS) {
    const m = re.exec(message || '');
    if (m && m[group]) return m[group].trim();
  }
  return null;
}

// ── git log ───────────────────────────────────────────────────────────────────

/**
 * Returns recent commits with agent attribution.
 * @param {number} limit
 * @returns {Array<{hash,author,email,timestamp,subject,message,files,agent}>}
 */
function getCommits(limit = 20) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 20)));

  // Use a unique printable separator (no null bytes — Node 25 rejects them in spawn args)
  const SEP = '<<<COMMITSEP>>>';

  const result = spawnSync('git', [
    'log',
    `--max-count=${safeLimit}`,
    `--pretty=format:%H%x09%an%x09%ae%x09%aI%x09%s%x09%b%n${SEP}`,
    '--name-only',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) return [];

  const raw = (result.stdout || '').trim();
  if (!raw) return [];

  const entries = raw.split(SEP).filter(s => s.trim());

  return entries.map(entry => {
    const newlineIdx = entry.indexOf('\n');
    const headerLine = newlineIdx === -1 ? entry.trim() : entry.slice(0, newlineIdx).trim();
    const rest = newlineIdx === -1 ? '' : entry.slice(newlineIdx + 1);

    const parts = headerLine.split('\t');
    if (parts.length < 5) return null;

    const [hash, author, email, timestamp, subject, ...bodyParts] = parts;
    const body = bodyParts.join('\t').trim();
    const message = subject + (body ? '\n' + body : '');
    const files = rest.split('\n').map(f => f.trim()).filter(f => f && !f.startsWith(' '));

    return {
      hash: hash.trim(),
      author: author.trim(),
      email: email.trim(),
      timestamp: timestamp.trim(),
      subject: subject.trim(),
      message: message.trim(),
      files,
      agent: extractAgent(message) || author.trim(),
    };
  }).filter(Boolean);
}

// ── git status + diff ─────────────────────────────────────────────────────────

/**
 * Returns uncommitted working tree changes.
 * @returns {{ changes: Array, statSummary: string }}
 */
function getWorkingTreeChanges() {
  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const statResult = spawnSync('git', ['diff', '--stat'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const changes = [];
  if (!statusResult.error && statusResult.status === 0) {
    for (const line of (statusResult.stdout || '').split('\n')) {
      if (!line.trim()) continue;
      const xy   = line.slice(0, 2);
      const file = line.slice(3).trim();
      const staged   = xy[0] !== ' ' && xy[0] !== '?';
      const unstaged = xy[1] !== ' ' && xy[1] !== '?';
      changes.push({ file, staged, unstaged, status: xy.trim() });
    }
  }

  const statLines = (statResult.stdout || '').trim().split('\n');
  const statSummary = statLines[statLines.length - 1] || '';

  return { changes, statSummary };
}

// ── gh pr list ────────────────────────────────────────────────────────────────

/**
 * Returns open PRs with agent attribution from commit body.
 * Falls back gracefully if gh CLI is absent.
 */
function getOpenPRs() {
  const result = spawnSync('gh', [
    'pr', 'list',
    '--state', 'open',
    '--json', 'number,title,author,headRefName,body,createdAt,url,reviewDecision',
    '--limit', '20',
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) return [];

  try {
    const prs = JSON.parse(result.stdout || '[]');
    return prs.map(pr => ({
      number:         pr.number,
      title:          pr.title,
      url:            pr.url,
      headRefName:    pr.headRefName,
      createdAt:      pr.createdAt,
      reviewDecision: pr.reviewDecision,
      author:         pr.author?.login || 'unknown',
      agent:          extractAgent(pr.body || '') || pr.author?.login || 'unknown',
    }));
  } catch {
    return [];
  }
}

// ── Attribution summary ───────────────────────────────────────────────────────

/**
 * Returns per-agent attribution summary across recent commits.
 * @param {number} limit
 */
function getAttribution(limit = 100) {
  const commits = getCommits(limit);
  const byAgent = {};

  for (const c of commits) {
    const agent = c.agent;
    if (!byAgent[agent]) {
      byAgent[agent] = { agent, commits: 0, files: new Set(), lastCommit: null };
    }
    byAgent[agent].commits++;
    for (const f of c.files) byAgent[agent].files.add(f);
    if (!byAgent[agent].lastCommit || c.timestamp > byAgent[agent].lastCommit) {
      byAgent[agent].lastCommit = c.timestamp;
    }
  }

  return Object.values(byAgent).map(a => ({
    agent:       a.agent,
    commits:     a.commits,
    files:       [...a.files].slice(0, 50),
    fileCount:   a.files.size,
    lastCommit:  a.lastCommit,
  })).sort((a, b) => b.commits - a.commits);
}

/**
 * Returns file change heatmap (most-edited files across recent commits).
 * @param {number} limit  number of commits to analyze
 */
function getFileHeatmap(limit = 100) {
  const commits = getCommits(limit);
  const freq = {};

  for (const c of commits) {
    for (const f of c.files) {
      freq[f] = (freq[f] || 0) + 1;
    }
  }

  return Object.entries(freq)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
}

module.exports = {
  getCommits,
  getWorkingTreeChanges,
  getOpenPRs,
  getAttribution,
  getFileHeatmap,
};
