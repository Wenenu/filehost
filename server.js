'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./src/config');
const { db, statements } = require('./src/db');
const api = require('./src/routes/api');
const pages = require('./src/routes/pages');

const app = express();

app.disable('x-powered-by');
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// public assets
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// ---------- raw file serving ----------

app.get('/i/:name', (req, res) => {
  const name = String(req.params.name);
  // names are random base62 + ext; forbid traversal and dotfiles
  if (!/^[A-Za-z0-9]+\.[A-Za-z0-9]{1,10}$/.test(name)) {
    return res.status(400).send('Bad request');
  }
  const file = statements.findFileByName.get(name);
  if (!file) return res.status(404).send('Not found');
  const filePath = path.join(config.uploadDir, file.name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  statements.incrementViews.run(file.id);
  res.setHeader('Content-Type', config.mimeFor(file.ext));
  res.setHeader('Content-Length', file.size);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

// robots
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

// ---------- routes ----------

app.use('/api', api.router);
app.use('/', pages.router);

// ---------- startup ----------

statements.pruneSessions.run(Date.now());

// apply env-configured admins
for (const username of config.adminUsernames) {
  const u = statements.findUserByUsername.get(username);
  if (u) statements.setUserRole.run('admin', u.id);
}

app.listen(config.port, '0.0.0.0', () => {
  console.log('');
  console.log('  ⬆  upload server is running');
  console.log(`  web:    ${config.baseUrl}`);
  console.log(`  upload: ${config.baseUrl}/api/upload (ShareX POST)`);
  console.log(`  files:  ${config.uploadDir}`);
  console.log(`  db:     ${config.dbPath}`);
  console.log('');
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});