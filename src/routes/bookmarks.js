'use strict';

// R2.1.3 — Session Bookmark routes
// Store bookmarks against sessions in events.db

const db = require('../services/db');

// ── Schema bootstrap ──────────────────────────────────────────────────────────
function _ensureTable() {
  db.getDb().exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT    NOT NULL,
      event_idx  INTEGER,
      label      TEXT    NOT NULL DEFAULT '',
      note       TEXT    DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(session_id, event_idx)
    );
    CREATE INDEX IF NOT EXISTS idx_bookmarks_session ON bookmarks(session_id);
  `);
}

_ensureTable();

// ── Route plugin ──────────────────────────────────────────────────────────────
async function bookmarkRoutes(fastify) {

  // GET /api/sessions/:id/bookmarks
  fastify.get('/api/sessions/:id/bookmarks', async (req, reply) => {
    const { id } = req.params;
    const rows = db.getDb().prepare(
      'SELECT * FROM bookmarks WHERE session_id = ? ORDER BY event_idx ASC'
    ).all(id);
    reply.send({ ok: true, bookmarks: rows });
  });

  // POST /api/sessions/:id/bookmarks
  fastify.post('/api/sessions/:id/bookmarks', {
    schema: {
      body: {
        type: 'object',
        required: ['label'],
        properties: {
          event_idx: { type: ['integer', 'null'] },
          label:     { type: 'string', minLength: 1, maxLength: 200 },
          note:      { type: 'string', maxLength: 2000 },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params;
    const { event_idx = null, label, note = '' } = req.body;
    const result = db.getDb().prepare(
      'INSERT OR REPLACE INTO bookmarks (session_id, event_idx, label, note) VALUES (?, ?, ?, ?)'
    ).run(id, event_idx, label, note);
    reply.code(201).send({ ok: true, bookmark_id: result.lastInsertRowid });
  });

  // DELETE /api/sessions/:id/bookmarks/:bookmarkId
  fastify.delete('/api/sessions/:id/bookmarks/:bookmarkId', async (req, reply) => {
    const { bookmarkId } = req.params;
    db.getDb().prepare('DELETE FROM bookmarks WHERE id = ?').run(bookmarkId);
    reply.send({ ok: true });
  });
}

module.exports = bookmarkRoutes;
