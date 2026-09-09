'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

// SQLite driver: prefer the built-in node:sqlite (Node 22.5+); fall back to
// better-sqlite3 (an OPTIONAL dependency — if its native build failed during
// npm install, the app still runs fine on Node 22.5+, which is the supported
// path). Construction happens in the same try below, because better-sqlite3
// loads lazily and only throws when the database is actually created.
let Database = null;
try {
  ({ DatabaseSync: Database } = require('node:sqlite'));
} catch {
  try {
    Database = require('better-sqlite3');
  } catch {
    // neither driver present — the friendly error below fires
  }
}

let db;
try {
  if (!Database) throw new Error('no SQLite driver available');
  db = new Database(config.dbPath);
} catch (err) {
  console.error(
    '\n[upload] Could not open the SQLite database: ' +
      String((err && err.message) || err).split('\n')[0] + '.\n' +
      '  Your Node.js is v' + process.versions.node + ' (built-in SQLite needs v22.5+).\n' +
      '  Option 1 (recommended): install Node 22.13 or newer from https://nodejs.org,\n' +
      '      then re-run: npm install\n' +
      '  Option 2: keep your Node version and make better-sqlite3 work:\n' +
      '      npm install better-sqlite3@^12 --save-optional\n' +
      '      (needs a C++ build toolchain when no prebuilt binary is available)\n'
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

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