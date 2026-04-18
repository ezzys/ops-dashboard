'use strict';

// R3.3.1 — Skill Registry
// Scans skill directories, parses SKILL.md metadata, caches skill index.

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Candidate skill directories ────────────────────────────────────────────────

const SKILL_DIRS = [
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.openclaw', 'skills'),
  path.join(os.homedir(), '.config', 'claude', 'skills'),
];

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cache      = null;
let _cacheTime  = 0;
const CACHE_TTL = 60_000; // 1 minute

// ── SKILL.md parser ───────────────────────────────────────────────────────────

/**
 * Parse SKILL.md content into structured metadata.
 * Extracts: name, description, triggers, author from front-matter or headings.
 *
 * @param {string} content
 * @returns {object}
 */
function parseSkillMd(content) {
  const meta = { name: '', description: '', triggers: [], raw: content };

  // Try YAML-ish front-matter between --- delimiters
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const nameM = fm.match(/^name\s*:\s*(.+)$/m);
    const descM = fm.match(/^description\s*:\s*(.+)$/m);
    if (nameM) meta.name        = nameM[1].trim();
    if (descM) meta.description = descM[1].trim();

    // triggers as a YAML list
    const trigBlock = fm.match(/^triggers\s*:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (trigBlock) {
      meta.triggers = trigBlock[1]
        .split('\n')
        .map(l => l.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
    }
  }

  // Fall back to markdown headings / inline patterns
  if (!meta.name) {
    const h1 = content.match(/^#\s+(.+)$/m);
    if (h1) meta.name = h1[1].trim();
  }

  if (!meta.description) {
    // First non-empty line after front matter or heading
    const lines = content.replace(/^---[\s\S]*?---\s*\n/, '').split('\n');
    const firstContent = lines.find(l => l.trim() && !l.startsWith('#'));
    if (firstContent) meta.description = firstContent.trim().replace(/^>\s*/, '');
  }

  if (!meta.triggers.length) {
    // Look for TRIGGER or trigger: lines in the body
    const trigLines = content.match(/^(?:trigger[s]?\s*:\s*)(.+)$/gim);
    if (trigLines) {
      meta.triggers = trigLines
        .map(l => l.replace(/^trigger[s]?\s*:\s*/i, '').trim())
        .filter(Boolean);
    }
  }

  return meta;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * Scan all candidate skill directories and return an array of skill objects.
 * Handles missing directories gracefully.
 *
 * @returns {object[]}
 */
function scanSkills() {
  const skills = [];

  for (const dir of SKILL_DIRS) {
    if (!fs.existsSync(dir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir  = path.join(dir, entry.name);
      const skillMdPath = path.join(skillDir, 'SKILL.md');

      let skillMdContent = '';
      if (fs.existsSync(skillMdPath)) {
        try {
          skillMdContent = fs.readFileSync(skillMdPath, 'utf8');
        } catch (_) {
          skillMdContent = '';
        }
      }

      const meta = parseSkillMd(skillMdContent);

      skills.push({
        name:        entry.name,
        display_name: meta.name || entry.name,
        description: meta.description,
        triggers:    meta.triggers,
        dir:         skillDir,
        skill_md:    skillMdPath,
        has_skill_md: fs.existsSync(skillMdPath),
        source_dir:  dir,
      });
    }
  }

  return skills;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get all skills, using cache if fresh.
 * @returns {object[]}
 */
function listSkills() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;
  _cache     = scanSkills();
  _cacheTime = Date.now();
  return _cache;
}

/**
 * Get a specific skill by name (exact match).
 * @param {string} name
 * @returns {object|null}
 */
function getSkill(name) {
  const all = listSkills();
  return all.find(s => s.name === name) || null;
}

/**
 * Get the full SKILL.md content for a skill.
 * @param {string} name
 * @returns {{ content: string, path: string }|null}
 */
function getSkillContent(name) {
  const skill = getSkill(name);
  if (!skill || !skill.has_skill_md) return null;
  try {
    return {
      content: fs.readFileSync(skill.skill_md, 'utf8'),
      path:    skill.skill_md,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Force cache invalidation and rescan.
 */
function refresh() {
  _cache     = null;
  _cacheTime = 0;
  return listSkills();
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  listSkills,
  getSkill,
  getSkillContent,
  refresh,
  SKILL_DIRS,
};
