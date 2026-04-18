'use strict';

const { validateCronId, jspawnCli, spawnDetached } = require('../services/openclaw');

async function routes(fastify) {
  // Toggle cron job enabled/disabled
  fastify.post('/api/cron/toggle', {
    schema: {
      body: {
        type: 'object',
        required: ['id', 'enabled'],
        properties: {
          id: { type: 'string' },
          enabled: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    const { id, enabled } = req.body;
    validateCronId(id); // throws on invalid format
    const result = jspawnCli(['cron', enabled ? 'enable' : 'disable', id]);
    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.error, code: 'CLI_ERROR' };
    }
    return { ok: true, ts: Date.now() };
  });

  // Fire-and-forget cron run
  fastify.post('/api/cron/run', {
    schema: {
      body: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.body;
    validateCronId(id);
    spawnDetached(['cron', 'run', id]);
    return { ok: true, dispatched: true, ts: Date.now() };
  });

  // Cron run history
  fastify.get('/api/cron/runs', async (req, reply) => {
    const jobId = req.query.id;
    if (!jobId) {
      reply.code(400);
      return { ok: false, error: 'Missing job id', code: 'BAD_REQUEST' };
    }
    validateCronId(jobId);
    const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 100);
    const result = jspawnCli(['cron', 'runs', '--id', jobId, '--limit', String(limit)]);
    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.error, code: 'CLI_ERROR' };
    }
    return { runs: result.data, ts: Date.now() };
  });

  // Edit cron job
  fastify.post('/api/cron/edit', {
    schema: {
      body: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          enabled: { type: 'boolean' },
          schedule: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const { id, name, description, enabled, schedule } = req.body;
    validateCronId(id);

    const args = ['cron', 'edit', id];
    if (typeof name === 'string' && name.trim()) args.push('--name', name.trim());
    if (typeof description === 'string') args.push('--description', description.trim());
    if (typeof enabled === 'boolean') args.push(enabled ? '--enable' : '--disable');
    if (schedule) {
      if (schedule.kind === 'every' && schedule.every) {
        args.push('--every', String(schedule.every).trim());
      } else if (schedule.kind === 'cron' && schedule.expr) {
        args.push('--cron', String(schedule.expr).trim());
        if (schedule.tz) args.push('--tz', String(schedule.tz).trim());
      } else if (schedule.kind === 'at' && schedule.at) {
        args.push('--at', String(schedule.at).trim());
      }
    }

    if (args.length <= 3) {
      return { ok: true, noChanges: true, ts: Date.now() };
    }

    const result = jspawnCli(args);
    if (!result.ok) {
      reply.code(500);
      return { ok: false, error: result.error, code: 'CLI_ERROR' };
    }
    return { ok: true, result: result.data, ts: Date.now() };
  });
}

module.exports = routes;
