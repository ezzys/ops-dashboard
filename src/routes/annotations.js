'use strict';

// R2.1.6 — Annotation Layer
// Allows operators to annotate session events with notes, tags, and severity

const db = require('../services/db');

function _ensureTable() {
  db.getDb().exec(`
    CREATE TABLE IF NOT EXISTS annotations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT    NOT NULL,
      event_id   INTEGER,
      note       TEXT    NOT NULL DEFAULT '',
      tags       TEXT    DEFAULT '[]',
      severity   TEXT    DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
      author     TEXT    DEFAULT 'operator',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_event ON annotations(event_id);
  `);
}

try { _ensureTable(); } catch { /* DB may not be ready at module load */ }

async function annotationRoutes(fastify) {

  // GET /api/sessions/:id/annotations
  fastify.get('/api/sessions/:id/annotations', async (req, reply) => {
    try {
      const rows = db.getDb().prepare(
        'SELECT * FROM annotations WHERE session_id = ? ORDER BY created_at ASC'
      ).all(req.params.id);
      reply.send({ ok: true, annotations: rows });
    } catch (e) {
      reply.send({ ok: true, annotations: [] });
    }
  });

  // POST /api/sessions/:id/annotations
  fastify.post('/api/sessions/:id/annotations', {
    schema: {
      body: {
        type: 'object',
        required: ['note'],
        properties: {
          event_id: { type: ['integer', 'null'] },
          note:     { type: 'string', minLength: 1, maxLength: 5000 },
          tags:     { type: 'array', items: { type: 'string' }, maxItems: 10 },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          author:   { type: 'string', maxLength: 100 },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const { event_id = null, note, tags = [], severity = 'info', author = 'operator' } = req.body;
    const tagsJson = JSON.stringify(tags);
    const result = db.getDb().prepare(
      'INSERT INTO annotations (session_id, event_id, note, tags, severity, author) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, event_id, note, tagsJson, severity, author);
    reply.code(201).send({ ok: true, annotation_id: result.lastInsertRowid });
  });

  // DELETE /api/sessions/:id/annotations/:annotationId
  fastify.delete('/api/sessions/:id/annotations/:annotationId', async (req, reply) => {
    db.getDb().prepare('DELETE FROM annotations WHERE id = ?').run(req.params.annotationId);
    reply.send({ ok: true });
  });
}

module.exports = annotationRoutes;
