'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');

const config = require('../config');
const { statements } = require('../db');
const auth = require('../auth');
const { rateLimiter } = require('../rateLimit');

const router = express.Router();

// ---------- multer setup ----------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, _file, cb) => cb(null, generateName('')), // replaced after extension is known
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

function generateName(ext) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(config.nameLength);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out + (ext ? '.' + ext : '');
}

function publicFile(file) {
  return {
    id: file.id,
    name: file.name,
    url: `${config.baseUrl}/i/${file.name}`,
    page: `${config.baseUrl}/f/${file.name}`,
    deleteUrl: `${config.baseUrl}/f/${file.name}?delete=${file.delete_key}`,
    size: file.size,
    originalName: file.original_name,
    ext: file.ext,
    createdAt: file.created_at,
    views: file.views,
    user: file.user_id ? file.user_id : null,
  };
}

function userFromRequest(req) {
  // Order: session cookie -> Authorization: Bearer -> Key: header (ShareX) -> ?key= -> key form field
  const fromSession = auth.sessionUser(req);
  if (fromSession) return fromSession;
  const header = req.get('Authorization') || '';
  if (/^Bearer\s+/i.test(header)) {
    const u = auth.getUserFromApiKey(header.replace(/^Bearer\s+/i, '').trim());
    if (u) return u;
  }
  const sharexKey = req.get('Key');
  if (sharexKey) {
    const u = auth.getUserFromApiKey(sharexKey.trim());
    if (u) return u;
  }
  const key = req.query.key || (req.body && req.body.key) || (req.body && req.body.api_key);
  if (key) {
    const u = auth.getUserFromApiKey(key);
    if (u) return u;
  }
  return null;
}

// ---------- ShareX / API upload ----------

const uploadLimiter = rateLimiter(config.rate.uploadPerMinute, 60 * 1000);

router.post('/upload', (req, res, next) => {
  const user = userFromRequest(req);
  const usingKey = user && !auth.sessionUser(req); // key auth vs session auth
  if (usingKey && !uploadLimiter(req)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  if (!usingKey && !user && !uploadLimiter(req)) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large (max ${config.maxUploadBytes / 1024 / 1024} MB)` });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file field "file" in multipart body' });
    }

    const originalName = req.file.originalname || 'upload';
    const ext = (path.extname(originalName) || '').toLowerCase().replace(/^\./, '');
    if (!config.allowedExtensions.includes(ext)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: `Extension ".${ext || '(none)'}" not allowed. Allowed: ${config.allowedExtensions.join(', ')}` });
    }

    // rename to random name keeping the extension
    const finalName = generateName(ext);
    const finalPath = path.join(config.uploadDir, finalName);
    try {
      fs.renameSync(req.file.path, finalPath);
    } catch {
      fs.copyFileSync(req.file.path, finalPath);
      fs.unlink(req.file.path, () => {});
    }

    const stats = fs.statSync(finalPath);
    const record = {
      name: finalName,
      original_name: originalName,
      ext,
      size: stats.size,
      user_id: user ? user.id : null,
      delete_key: crypto.randomBytes(12).toString('base64url'),
      created_at: Date.now(),
    };
    const insertInfo = statements.insertFile.run(
      record.name,
      record.original_name,
      record.ext,
      record.size,
      record.user_id,
      record.delete_key,
      record.created_at
    );
    record.id = Number(insertInfo.lastInsertRowid);

    const out = publicFile(record);
    // ShareX: when the "json" argument is present it expects a JSON response.
    // The common ShareX config passes "json=url" as an argument.
    const wantJson = req.query.json !== undefined || req.body.json !== undefined || req.get('Accept')?.includes('application/json');
    if (wantJson) {
      res.json(out);
    } else {
      res.type('text/plain').send(out.url);
    }
  });
});

// ---------- auth ----------

const loginLimiter = rateLimiter(config.rate.loginPer15Min, 15 * 60 * 1000);
const registerLimiter = rateLimiter(config.rate.registerPerHour, 60 * 60 * 1000);

router.post('/register', (req, res) => {
  if (!config.registrationOpen) return res.status(403).json({ error: 'Registration is closed' });
  if (!registerLimiter(req)) return res.status(429).json({ error: 'Too many registrations, try later' });

  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-32 chars: letters, numbers, underscore' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (statements.findUserByUsername.get(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const userCount = statements.countUsers.get().n;
  const role = userCount === 0 ? 'admin' : 'user'; // first user becomes admin
  const apiKey = crypto.randomBytes(24).toString('base64url');
  const info = statements.insertUser.run(username, auth.hashPassword(password), role, apiKey, Date.now());
  const id = Number(info.lastInsertRowid);

  // env-configured admins
  if (config.adminUsernames.includes(username)) {
    statements.setUserRole.run('admin', id);
  }

  const token = auth.createSession(id);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: auth.SESSION_TTL_MS });
  res.status(201).json({ ok: true, username, role: config.adminUsernames.includes(username) ? 'admin' : role });
});

router.post('/login', (req, res) => {
  if (!loginLimiter(req)) return res.status(429).json({ error: 'Too many attempts, try later' });

  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = statements.findUserByUsername.get(username);
  if (!user || !auth.verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = auth.createSession(user.id);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: auth.SESSION_TTL_MS });
  res.json({ ok: true, username: user.username, role: user.role });
});

router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.sid;
  auth.destroySession(token);
  res.clearCookie('sid');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = auth.sessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  const row = statements.findUserById.get(user.id);
  const files = statements.userFiles.all(user.id);
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    api_key: row.api_key,
    created_at: row.created_at,
    stats: {
      files: files.length,
      bytes: files.reduce((a, f) => a + f.size, 0),
    },
  });
});

router.post('/password', auth.requireAuth, (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.password || '');
  const user = statements.findUserById.get(req.user.id);
  if (!auth.verifyPassword(current, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is wrong' });
  }
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  statements.changePassword.run(auth.hashPassword(next), user.id);
  statements.deleteSessionsForUser.run(user.id); // log out other sessions
  const token = auth.createSession(user.id);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: auth.SESSION_TTL_MS });
  res.json({ ok: true });
});

router.post('/keys/regenerate', auth.requireAuth, (req, res) => {
  const key = crypto.randomBytes(24).toString('base64url');
  statements.regenerateApiKey.run(key, req.user.id);
  res.json({ ok: true, api_key: key });
});

// ---------- files ----------

router.get('/files', auth.requireAuth, (req, res) => {
  const files = statements.userFiles.all(req.user.id);
  res.json(files.map(publicFile));
});

router.delete('/files/:id', auth.requireAuth, (req, res) => {
  const file = statements.findFileById.get(Number(req.params.id));
  if (!file) return res.status(404).json({ error: 'Not found' });
  if (file.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your file' });
  }
  removeFileRecord(file);
  res.json({ ok: true });
});

function removeFileRecord(file) {
  statements.deleteFile.run(file.id);
  const p = path.join(config.uploadDir, file.name);
  fs.unlink(p, () => {}); // ignore errors if already gone
}

// ---------- admin ----------

router.get('/admin/stats', auth.requireAdmin, (_req, res) => {
  res.json({
    users: statements.countUsers.get().n,
    files: statements.countFiles.get().n,
    bytes: statements.totalBytes.get().n,
  });
});

router.get('/admin/users', auth.requireAdmin, (_req, res) => {
  const users = statements.listUsers.all();
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      created_at: u.created_at,
      files: statements.userFileCount.get(u.id).n,
      bytes: statements.userStorage.get(u.id).n,
    }))
  );
});

router.post('/admin/users/:id/role', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  const user = statements.findUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot change your own role' });
  statements.setUserRole.run(role, id);
  res.json({ ok: true });
});

router.delete('/admin/users/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const user = statements.findUserById.get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  // remove their files
  for (const f of statements.userFiles.all(id)) removeFileRecord(f);
  statements.deleteUser.run(id);
  res.json({ ok: true });
});

router.get('/admin/files', auth.requireAdmin, (req, res) => {
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const files = statements.allFiles.all(30, offset);
  res.json({ files: files.map(publicFile), nextOffset: offset + files.length });
});

// ---------- ShareX config generator ----------

router.get('/sharex', auth.requireAuth, (req, res) => {
  const user = statements.findUserById.get(req.user.id);
  const configFile = {
    Version: '13.0.1',
    Name: config.baseUrl.replace(/^https?:\/\//, ''),
    DestinationType: 'ImageUploader, FileUploader, TextUploader',
    RequestMethod: 'POST',
    RequestURL: `${config.baseUrl}/api/upload`,
    Headers: { Key: user.api_key },
    Body: 'MultipartFormData',
    FileFormName: 'file',
    Arguments: { json: 'url' },
    ResponseType: 'Text',
    URL: '$json:url$',
  };
  res
    .attachment('sharex.sxcu')
    .type('application/json')
    .send(JSON.stringify(configFile, null, 2));
});

module.exports = { router, publicFile, userFromRequest, removeFileRecord };