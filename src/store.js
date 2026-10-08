// Armazenamento permanente dos relatórios (SQLite embutido do Node, sem dependências).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Chave usada para agrupar análises da mesma página (histórico/evolução). */
export function pageKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '') || ''}`;
  } catch {
    return url;
  }
}

export function openStore(dir = process.env.DATA_DIR || path.resolve('data')) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'relatorios.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reports (
      id          TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      page_key    TEXT NOT NULL,
      url         TEXT NOT NULL,
      overall     INTEGER,
      categories  TEXT NOT NULL,
      competitors TEXT NOT NULL,
      result      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reports_page ON reports (page_key, created_at);
    CREATE INDEX IF NOT EXISTS reports_created ON reports (created_at);
    CREATE TABLE IF NOT EXISTS images (
      report_id TEXT NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
      n         INTEGER NOT NULL,
      type      TEXT NOT NULL,
      data      BLOB NOT NULL,
      PRIMARY KEY (report_id, n)
    );
  `);

  const insertReport = db.prepare(
    'INSERT INTO reports (id, created_at, page_key, url, overall, categories, competitors, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insertImage = db.prepare('INSERT INTO images (report_id, n, type, data) VALUES (?, ?, ?, ?)');

  return {
    save({ id, createdAt, result, images }) {
      const main = result.main;
      db.exec('BEGIN');
      try {
        insertReport.run(
          id,
          createdAt,
          pageKey(main.finalUrl || main.url),
          main.finalUrl || main.url,
          main.score.overall ?? null,
          JSON.stringify(main.score.categories),
          JSON.stringify(result.competitors.map((c) => ({ url: c.finalUrl || c.url, overall: c.score?.overall ?? null, error: c.error || null }))),
          JSON.stringify(result),
        );
        images.forEach((img, n) => insertImage.run(id, n, img.type, img.buf));
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    get(id) {
      const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
      if (!row) return null;
      return { id: row.id, createdAt: row.created_at, pageKey: row.page_key, result: JSON.parse(row.result) };
    },

    image(id, n) {
      return db.prepare('SELECT type, data FROM images WHERE report_id = ? AND n = ?').get(id, n) || null;
    },

    /** Todas as análises da mesma página, da mais antiga para a mais recente. */
    history(key) {
      return db
        .prepare('SELECT id, created_at, overall, categories FROM reports WHERE page_key = ? ORDER BY created_at')
        .all(key)
        .map((r) => ({ id: r.id, createdAt: r.created_at, overall: r.overall, categories: JSON.parse(r.categories) }));
    },

    list({ limit = 30, q = '' } = {}) {
      const like = `%${q.toLowerCase()}%`;
      return db
        .prepare('SELECT id, created_at, url, overall, competitors FROM reports WHERE lower(url) LIKE ? ORDER BY created_at DESC LIMIT ?')
        .all(like, Math.min(Number(limit) || 30, 200))
        .map((r) => ({ id: r.id, createdAt: r.created_at, url: r.url, overall: r.overall, competitors: JSON.parse(r.competitors) }));
    },

    remove(id) {
      db.prepare('DELETE FROM images WHERE report_id = ?').run(id);
      return db.prepare('DELETE FROM reports WHERE id = ?').run(id).changes > 0;
    },

    close() {
      db.close();
    },
  };
}
