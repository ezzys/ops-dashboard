'use strict';

// R3.1.2 — Prompt versioning API routes

const {
  listPrompts,
  getActivePrompt,
  getPromptHistory,
  getPromptVersion,
  savePrompt,
  activatePrompt,
  rollbackPrompt,
} = require('../services/prompt-store');

async function routes(fastify) {

  // GET /api/prompts — list all prompt keys with active version metadata
  fastify.get('/api/prompts', async (req, reply) => {
    try {
      const prompts = listPrompts();
      return reply.send({ ok: true, prompts });
    } catch (err) {
      req.log?.error?.({ err: err.message }, 'prompts list error');
      return reply.code(500).send({ ok: false, error: 'Failed to list prompts' });
    }
  });

  // GET /api/prompts/:key — get active version for a key
  fastify.get('/api/prompts/:key', async (req, reply) => {
    const { key } = req.params;
    try {
      const prompt = getActivePrompt(key);
      if (!prompt) return reply.code(404).send({ ok: false, error: `Prompt key "${key}" not found` });
      return reply.send({ ok: true, prompt });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get prompt' });
    }
  });

  // GET /api/prompts/:key/history — version history
  fastify.get('/api/prompts/:key/history', async (req, reply) => {
    const { key } = req.params;
    try {
      const history = getPromptHistory(key);
      return reply.send({ ok: true, key, history });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get history' });
    }
  });

  // GET /api/prompts/:key/version/:version — full content of a specific version
  fastify.get('/api/prompts/:key/version/:version', async (req, reply) => {
    const { key, version } = req.params;
    try {
      const prompt = getPromptVersion(key, Number(version));
      if (!prompt) return reply.code(404).send({ ok: false, error: `Version ${version} not found` });
      return reply.send({ ok: true, prompt });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to get version' });
    }
  });

  // POST /api/prompts/:key — save new version
  fastify.post('/api/prompts/:key', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content:     { type: 'string', minLength: 1 },
          description: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { key } = req.params;
    const { content, description } = req.body;
    try {
      const result = savePrompt(key, content, description || '');
      return reply.code(201).send({ ok: true, id: result.id, version: result.version });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to save prompt' });
    }
  });

  // POST /api/prompts/:key/activate — activate a specific version
  fastify.post('/api/prompts/:key/activate', {
    schema: {
      body: {
        type: 'object',
        required: ['version'],
        properties: {
          version: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const { key } = req.params;
    const { version } = req.body;
    try {
      const result = activatePrompt(key, version);
      if (!result.ok) return reply.code(404).send({ ok: false, error: result.error });
      return reply.send({ ok: true, key, version });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to activate prompt' });
    }
  });

  // POST /api/prompts/:key/rollback — rollback to previous version
  fastify.post('/api/prompts/:key/rollback', async (req, reply) => {
    const { key } = req.params;
    try {
      const result = rollbackPrompt(key);
      if (!result.ok) return reply.code(400).send({ ok: false, error: result.error });
      return reply.send({ ok: true, key, version: result.version });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: 'Failed to rollback prompt' });
    }
  });
}

module.exports = routes;
