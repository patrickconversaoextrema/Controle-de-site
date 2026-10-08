// Armazenamento permanente dos relatórios (SQLite embutido do Node, sem dependências).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

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
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member',
      disabled      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS images (
      report_id TEXT NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
      n         INTEGER NOT NULL,
      type      TEXT NOT NULL,
      data      BLOB NOT NULL,
      PRIMARY KEY (report_id, n)
    );
  `);

  // Migrações de colunas adicionadas depois da primeira versão
  const cols = db.prepare('PRAGMA table_info(reports)').all().map((c) => c.name);
  if (!cols.includes('created_by')) db.exec('ALTER TABLE reports ADD COLUMN created_by TEXT');
  if (!cols.includes('share_token')) db.exec('ALTER TABLE reports ADD COLUMN share_token TEXT');
  if (!cols.includes('niche')) db.exec('ALTER TABLE reports ADD COLUMN niche TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS reports_share ON reports (share_token) WHERE share_token IS NOT NULL');

  const insertReport = db.prepare(
    'INSERT INTO reports (id, created_at, page_key, url, overall, categories, competitors, result, created_by, niche) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
  const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role, disabled: !!u.disabled, createdAt: u.created_at };
  const insertImage = db.prepare('INSERT INTO images (report_id, n, type, data) VALUES (?, ?, ?, ?)');

  return {
    save({ id, createdAt, result, images, createdBy = null, niche = null }) {
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
          createdBy,
          niche,
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
      return { id: row.id, createdAt: row.created_at, pageKey: row.page_key, createdBy: row.created_by, shareToken: row.share_token, result: JSON.parse(row.result) };
    },

    getByShareToken(token) {
      const row = db.prepare('SELECT id FROM reports WHERE share_token = ?').get(token);
      return row ? this.get(row.id) : null;
    },

    setShareToken(id, token) {
      return db.prepare('UPDATE reports SET share_token = ? WHERE id = ?').run(token, id).changes > 0;
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
        .prepare(
          `SELECT r.id, r.created_at, r.url, r.overall, r.competitors, r.created_by, r.niche, r.share_token IS NOT NULL AS shared, u.name AS author
           FROM reports r LEFT JOIN users u ON u.id = r.created_by
           WHERE lower(r.url) LIKE ? OR lower(coalesce(r.niche, '')) LIKE ? ORDER BY r.created_at DESC LIMIT ?`,
        )
        .all(like, like, Math.min(Number(limit) || 30, 200))
        .map((r) => ({ id: r.id, createdAt: r.created_at, url: r.url, overall: r.overall, competitors: JSON.parse(r.competitors), createdBy: r.created_by, author: r.author, niche: r.niche, shared: !!r.shared }));
    },

    remove(id) {
      db.prepare('DELETE FROM images WHERE report_id = ?').run(id);
      return db.prepare('DELETE FROM reports WHERE id = ?').run(id).changes > 0;
    },

    // ---------- Usuários e sessões ----------
    countUsers() {
      return db.prepare('SELECT count(*) AS n FROM users').get().n;
    },
    createUser({ email, name, passwordHash, role = 'member' }) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, email.trim(), name.trim(), passwordHash, role, new Date().toISOString(),
      );
      return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
    },
    userByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim()) || null;
    },
    userById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
    },
    listUsers() {
      return db.prepare('SELECT * FROM users ORDER BY created_at').all().map(publicUser);
    },
    updateUser(id, { name, role, disabled, passwordHash }) {
      const u = this.userById(id);
      if (!u) return null;
      db.prepare('UPDATE users SET name = ?, role = ?, disabled = ?, password_hash = ? WHERE id = ?').run(
        name ?? u.name, role ?? u.role, disabled == null ? u.disabled : disabled ? 1 : 0, passwordHash ?? u.password_hash, id,
      );
      if (disabled || passwordHash) this.deleteSessionsOf(id);
      return publicUser(this.userById(id));
    },
    deleteUser(id) {
      this.deleteSessionsOf(id);
      return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
    },
    countActiveAdmins() {
      return db.prepare("SELECT count(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get().n;
    },
    createSession(userId, ttlMs) {
      const token = crypto.randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, new Date(Date.now() + ttlMs).toISOString());
      return token;
    },
    userBySession(token) {
      if (!token) return null;
      const row = db
        .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0')
        .get(sha(token), new Date().toISOString());
      return publicUser(row);
    },
    deleteSession(token) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
    },
    deleteSessionsOf(userId) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },
    purgeExpiredSessions() {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
    },

    close() {
      db.close();
    },
  };
}
