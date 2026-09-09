'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

// Use the built-in node:sqlite when available (Node 22.5+); otherwise fall back
// to better-sqlite3 so older Node versions (20+) still run.
let Database;
try {
  ({ DatabaseSync: Database } = require('node:sqlite'));
} catch {
  Database = require('better-sqlite3');
}

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

const db = new Database(config.dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  api_key       TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  ext           TEXT NOT NULL,
  size          INTEGER NOT NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  delete_key    TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL,
  views         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

const statements = {
  // users
  findUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  findUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  findUserByApiKey: db.prepare('SELECT * FROM users WHERE api_key = ?'),
  insertUser: db.prepare('INSERT INTO users (username, password_hash, role, api_key, created_at) VALUES (?, ?, ?, ?, ?)'),
  setUserRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  changePassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  regenerateApiKey: db.prepare('UPDATE users SET api_key = ? WHERE id = ?'),
  countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
  listUsers: db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at ASC'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),

  // sessions
  insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  findSession: db.prepare('SELECT s.*, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteSessionsForUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  pruneSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),

  // files
  insertFile: db.prepare(
    'INSERT INTO files (name, original_name, ext, size, user_id, delete_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ),
  findFileByName: db.prepare('SELECT * FROM files WHERE name = ?'),
  findFileById: db.prepare('SELECT * FROM files WHERE id = ?'),
  countFiles: db.prepare('SELECT COUNT(*) AS n FROM files'),
  totalBytes: db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM files'),
  userFiles: db.prepare('SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC'),
  userFilesPublic: db.prepare('SELECT * FROM files WHERE user_id = ? AND user_id IS NOT NULL ORDER BY created_at DESC LIMIT ?'),
  recentFiles: db.prepare('SELECT * FROM files ORDER BY created_at DESC LIMIT ?'),
  allFiles: db.prepare('SELECT * FROM files ORDER BY created_at DESC LIMIT ? OFFSET ?'),
  deleteFile: db.prepare('DELETE FROM files WHERE id = ?'),
  incrementViews: db.prepare('UPDATE files SET views = views + 1 WHERE id = ?'),
  userStorage: db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE user_id = ?'),
  userFileCount: db.prepare('SELECT COUNT(*) AS n FROM files WHERE user_id = ?'),
};

module.exports = { db, statements, config }; // config re-exported for convenience