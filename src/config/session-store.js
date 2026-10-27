const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const session = require('express-session');
const sessionDuration = require('./session-duration');

function expiresAt(value) {
  const cookieExpiry = value?.cookie?.expires;
  const parsed = cookieExpiry ? new Date(cookieExpiry).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now() + sessionDuration;
}

class DiskSessionStore extends session.Store {
  constructor(filePath) {
    super();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS web_sessions (
        sid TEXT PRIMARY KEY,
        session_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_web_sessions_expiry
        ON web_sessions(expires_at);
    `);
    this.select = this.database.prepare(`
      SELECT session_json, expires_at FROM web_sessions WHERE sid = ?
    `);
    this.upsert = this.database.prepare(`
      INSERT INTO web_sessions (sid, session_json, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET
        session_json = excluded.session_json,
        expires_at = excluded.expires_at
    `);
    this.remove = this.database.prepare('DELETE FROM web_sessions WHERE sid = ?');
    this.updateExpiry = this.database.prepare(`
      UPDATE web_sessions SET expires_at = ? WHERE sid = ?
    `);
    this.removeExpired = this.database.prepare(`
      DELETE FROM web_sessions WHERE expires_at <= ?
    `);
  }

  get(sid, callback) {
    try {
      const row = this.select.get(sid);
      if (!row || row.expires_at <= Date.now()) {
        if (row) this.remove.run(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.session_json));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      this.upsert.run(sid, JSON.stringify(value), expiresAt(value));
      this.removeExpired.run(Date.now());
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.remove.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, value, callback = () => {}) {
    try {
      this.updateExpiry.run(expiresAt(value), sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = () => {
  if (process.env.RENDER !== 'true') return null;
  const filePath = path.resolve(
    process.env.SESSION_DB_PATH || './storage/private/sessions.sqlite'
  );
  return new DiskSessionStore(filePath);
};
