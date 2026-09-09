'use strict';

const crypto = require('node:crypto');
const { statements } = require('./db');
const config = require('./config');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------- password hashing (scrypt, built-in crypto) ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return test.length === expected.length && crypto.timingSafeEqual(test, expected);
}

// ---------- sessions ----------

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  statements.insertSession.run(token, userId, now, now + SESSION_TTL_MS);
  return token;
}

function getUserFromSessionToken(token) {
  if (!token) return null;
  const row = statements.findSession.get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    statements.deleteSession.run(token);
    return null;
  }
  return { id: row.user_id, username: row.username, role: row.role };
}

function destroySession(token) {
  if (token) statements.deleteSession.run(token);
}

// ---------- api keys ----------

function getUserFromApiKey(key) {
  if (!key || typeof key !== 'string') return null;
  const row = statements.findUserByApiKey.get(key);
  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role, api_key: row.api_key };
}

// ---------- express middleware ----------

function sessionUser(req) {
  if (req.user) return req.user;
  const token = req.cookies && req.cookies.sid;
  if (!token) return null;
  return getUserFromSessionToken(token);
}

function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = sessionUser(req);
  if (!user) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  if (user.role !== 'admin') {
    return res.status(403).send('Forbidden');
  }
  req.user = user;
  next();
}

// ---------- misc ----------

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getUserFromSessionToken,
  getUserFromApiKey,
  sessionUser,
  requireAuth,
  requireAdmin,
  randomToken,
  SESSION_TTL_MS,
};