'use strict';

// R3.3.2 — Skills API routes

const { spawnCli } = require('../services/openclaw');
const {
  listSkills,
  getSkill,
  getSkillContent,
  refresh,
} = require('../services/skill-registry');
const { queryEvents } = require('../services/event-store');

async function routes(fastify) {

  // GET /api/skills — list all available skills
  fastify.get('/api/skills', async (req, reply) => {
    try {
      const skills = listSkills();
      return reply.send({
        ok: true,
        count: skills.length,
        skills: skills.map(s => ({
          name:         s.name,
          display_name: s.display_name,
          description:  s.description,
          triggers:     s.triggers,
          has_skill_md: s.has_skill_md,
        })),
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to list skills' });
    }
  });

  // GET /api/skills/refresh — force cache refresh
  fastify.get('/api/skills/refresh', async (req, reply) => {
    try {
      const skills = refresh();
      return reply.send({ ok: true, count: skills.length });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to refresh skills' });
    }
  });

  // GET /api/skills/:name — skill detail + SKILL.md content
  fastify.get('/api/skills/:name', async (req, reply) => {
    const { name } = req.params;
    try {
      const skill = getSkill(name);
      if (!skill) return reply.code(404).send({ ok: false, error: `Skill "${name}" not found` });

      const skillContent = getSkillContent(name);
      return reply.send({
        ok: true,
        skill: {
          name:         skill.name,
          display_name: skill.display_name,
          description:  skill.description,
          triggers:     skill.triggers,
          dir:          skill.dir,
          has_skill_md: skill.has_skill_md,
          content:      skillContent ? skillContent.content : null,
        },
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get skill' });
    }
  });

  // GET /api/skills/:name/history — execution history from event store
  fastify.get('/api/skills/:name/history', async (req, reply) => {
    const { name } = req.params;
    try {
      const limit  = Math.min(Number(req.query.limit) || 50, 200);
      // Search event store for skill execution events tagged with this skill name
      const events = queryEvents({
        event_type: 'skill.execute',
        search:     name,
        limit,
      });
      return reply.send({ ok: true, skill: name, history: events });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get skill history' });
    }
  });

  // POST /api/skills/execute — trigger a skill (via openclaw CLI)
  fastify.post('/api/skills/execute', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:    { type: 'string', minLength: 1 },
          args:    { type: 'string' },
          dry_run: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    const { name, args = '', dry_run = false } = req.body;

    // Validate skill exists
    const skill = getSkill(name);
    if (!skill) return reply.code(404).send({ ok: false, error: `Skill "${name}" not found` });

    if (dry_run) {
      return reply.send({ ok: true, dry_run: true, skill: name, args });
    }

    try {
      // Use openclaw CLI to trigger the skill
      const cliArgs = ['skill', 'run', name];
      if (args) cliArgs.push('--args', args);

      const result = spawnCli(cliArgs);

      return reply.send({
        ok:     result.ok,
        skill:  name,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        error:  result.error  || null,
      });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to execute skill' });
    }
  });
}

module.exports = routes;
