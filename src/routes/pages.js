'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const config = require('../config');
const { statements } = require('../db');
const auth = require('../auth');

const router = express.Router();

// ---------- helpers ----------

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(n) {
  if (!n && n !== 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function isImage(ext) {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'].includes(ext);
}

// ---------- layout ----------

function layout({ title, user, body, active = '' }) {
  const nav = [];
  nav.push(`<a href="/" class="${active === 'home' ? 'active' : ''}">home</a>`);
  if (user) {
    nav.push(`<a href="/u/${esc(user.username)}" class="${active === 'gallery' ? 'active' : ''}">gallery</a>`);
    nav.push(`<a href="/dashboard" class="${active === 'dashboard' ? 'active' : ''}">dashboard</a>`);
    if (user.role === 'admin') nav.push(`<a href="/admin" class="${active === 'admin' ? 'active' : ''}">admin</a>`);
    nav.push(`<a href="#" data-logout>logout (${esc(user.username)})</a>`);
  } else {
    nav.push(`<a href="/login" class="${active === 'login' ? 'active' : ''}">login</a>`);
    nav.push(`<a href="/register" class="${active === 'register' ? 'active' : ''}">register</a>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · upload</title>
<link rel="stylesheet" href="/public/style.css">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#5b8cff"/><path d="M4 11l3-4 2 2 2-3 3 5z" fill="#fff"/></svg>')}">
</head>
<body>
<header class="topbar">
  <a href="/" class="logo">upload<span class="dot">.</span></a>
  <nav class="nav">${nav.join('')}</nav>
</header>
<main class="container">${body}</main>
<footer class="footer">
  <span>upload server · ${esc(config.baseUrl)}</span>
  <span>${statements.countFiles.get().n} files · ${statements.countUsers.get().n} users</span>
</footer>
<script src="/public/app.js"></script>
</body>
</html>`;
}

function flashHtml(msg, ok = true) {
  return `<div class="flash ${ok ? 'ok' : 'err'}">${esc(msg)}</div>`;
}

// ---------- home ----------

router.get('/', (req, res) => {
  const user = auth.sessionUser(req);
  const recent = statements.recentFiles.all(9);
  const totalFiles = statements.countFiles.get().n;
  const totalUsers = statements.countUsers.get().n;
  const totalBytes = statements.totalBytes.get().n;

  const grid = recent
    .map((f) => {
      if (isImage(f.ext)) {
        return `<a class="cell" href="/f/${esc(f.name)}" title="${esc(f.original_name)}"><img loading="lazy" src="/i/${esc(f.name)}" alt=""></a>`;
      }
      return `<a class="cell filecell" href="/f/${esc(f.name)}"><div class="fileicon">${esc(f.ext.toUpperCase())}</div><span>${esc(f.original_name)}</span></a>`;
    })
    .join('');

  const body = `
  <section class="hero">
    <h1>ShareX-ready image hosting</h1>
    <p class="sub">Drop a file, get a link. Uploads are anonymous unless you log in — <a href="/register">register</a> for your own gallery &amp; API key.</p>
    <div class="dropzone" id="dropzone" tabindex="0">
      <div class="dz-inner">
        <div class="dz-icon">⬆</div>
        <p><strong>drag &amp; drop</strong> or <strong>click</strong> to upload</p>
        <p class="dz-hint">or paste from clipboard (ctrl+v) · max ${config.maxUploadBytes / 1024 / 1024} MB</p>
      </div>
      <input type="file" id="file-input" hidden multiple>
    </div>
    <div id="upload-status"></div>
  </section>
  <section class="stats">
    <div class="stat"><b>${totalFiles}</b><span>files hosted</span></div>
    <div class="stat"><b>${totalUsers}</b><span>users</span></div>
    <div class="stat"><b>${formatBytes(totalBytes)}</b><span>stored</span></div>
  </section>
  ${recent.length ? `<section class="recent"><h2>recent uploads</h2><div class="grid">${grid}</div></section>` : ''}
  `;
  res.send(layout({ title: 'home', user, body, active: 'home' }));
});

// ---------- auth pages ----------

router.get('/login', (req, res) => {
  if (auth.sessionUser(req)) return res.redirect('/dashboard');
  const next = req.query.next || '/dashboard';
  const body = `
  <section class="card authcard">
    <h1>log in</h1>
    <form id="login-form" data-next="${esc(next)}">
      <label>username<input name="username" autocomplete="username" required autofocus></label>
      <label>password<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit" class="btn primary">log in</button>
      <p class="muted">no account? <a href="/register">register</a></p>
      <div class="form-msg"></div>
    </form>
  </section>`;
  res.send(layout({ title: 'login', user: null, body, active: 'login' }));
});

router.get('/register', (req, res) => {
  if (auth.sessionUser(req)) return res.redirect('/dashboard');
  if (!config.registrationOpen) {
    return res.send(
      layout({ title: 'register', user: null, body: flashHtml('Registration is closed.', false), active: 'register' })
    );
  }
  const body = `
  <section class="card authcard">
    <h1>register</h1>
    <p class="muted">The first account automatically becomes admin.</p>
    <form id="register-form">
      <label>username<input name="username" autocomplete="username" minlength="3" maxlength="32" required autofocus></label>
      <label>password<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
      <button type="submit" class="btn primary">create account</button>
      <p class="muted">have an account? <a href="/login">log in</a></p>
      <div class="form-msg"></div>
    </form>
  </section>`;
  res.send(layout({ title: 'register', user: null, body, active: 'register' }));
});

// ---------- dashboard ----------

router.get('/dashboard', auth.requireAuth, (req, res) => {
  const row = statements.findUserById.get(req.user.id);
  const files = statements.userFiles.all(req.user.id);
  const bytes = files.reduce((a, f) => a + f.size, 0);

  const uploads = files
    .map(
      (f) => `
      <div class="up" data-id="${f.id}">
        ${isImage(f.ext) ? `<a href="/f/${esc(f.name)}" class="up-thumb"><img loading="lazy" src="/i/${esc(f.name)}" alt=""></a>` : `<a href="/f/${esc(f.name)}" class="up-thumb filecell"><div class="fileicon">${esc(f.ext.toUpperCase())}</div></a>`}
        <div class="up-info">
          <a class="up-name" href="/f/${esc(f.name)}">${esc(f.original_name)}</a>
          <span class="muted">${formatBytes(f.size)} · ${formatDate(f.created_at)} · ${f.views} views</span>
          <div class="up-actions">
            <button class="btn small" data-copy="${config.baseUrl}/i/${esc(f.name)}">copy url</button>
            <button class="btn small" data-copy="${config.baseUrl}/f/${esc(f.name)}">copy page</button>
            <button class="btn small danger" data-delete="${f.id}">delete</button>
          </div>
        </div>
      </div>`
    )
    .join('');

  const body = `
  <section class="headrow">
    <div>
      <h1>dashboard</h1>
      <p class="muted">welcome back, ${esc(req.user.username)} — ${files.length} files · ${formatBytes(bytes)}</p>
    </div>
  </section>

  <section class="card">
    <h2>sharex setup</h2>
    <ol class="steps">
      <li>Open ShareX → <b>Destinations</b> → <b>Custom uploader</b> → <b>Import</b> → <b>From file</b></li>
      <li>Pick the config file below. Your API key is already inside.</li>
      <li>Set <b>Destinations</b> → <b>Image uploader</b> to <em>"My upload server"</em> and you're done.</li>
    </ol>
    <div class="row">
      <a class="btn primary" href="/api/sharex">download sharex config (.sxcu)</a>
    </div>
  </section>

  <section class="card">
    <h2>api key</h2>
    <p class="muted">Used by ShareX and any script posting to <code>/api/upload</code> (field <code>key</code>, header <code>Key</code>, or <code>Authorization: Bearer</code>).</p>
    <div class="keyrow">
      <code class="apikey" id="api-key">${esc(row.api_key)}</code>
      <button class="btn small" id="copy-key">copy</button>
      <button class="btn small" id="regen-key">regenerate</button>
    </div>
  </section>

  <section class="card">
    <h2>change password</h2>
    <form id="password-form" class="formrow">
      <input name="current" type="password" placeholder="current password" required>
      <input name="password" type="password" placeholder="new password" minlength="6" required>
      <button type="submit" class="btn primary">update</button>
      <div class="form-msg"></div>
    </form>
  </section>

  <section class="card">
    <h2>my uploads (${files.length})</h2>
    ${files.length ? `<div class="uploads">${uploads}</div>` : '<p class="muted">Nothing yet — upload something from the <a href="/">home page</a> or ShareX.</p>'}
  </section>
  `;
  res.send(layout({ title: 'dashboard', user: req.user, body, active: 'dashboard' }));
});

// ---------- user gallery ----------

router.get('/u/:username', (req, res) => {
  const user = auth.sessionUser(req);
  const username = String(req.params.username).toLowerCase();
  const target = statements.findUserByUsername.get(username);
  if (!target) {
    return res.status(404).send(layout({ title: 'not found', user, body: flashHtml('User not found.', false) }));
  }
  const files = statements.userFilesPublic.all(target.id, 200);
  const bytes = files.reduce((a, f) => a + f.size, 0);
  const grid = files
    .map((f) =>
      isImage(f.ext)
        ? `<a class="cell" href="/f/${esc(f.name)}" title="${esc(f.original_name)}"><img loading="lazy" src="/i/${esc(f.name)}" alt=""></a>`
        : `<a class="cell filecell" href="/f/${esc(f.name)}"><div class="fileicon">${esc(f.ext.toUpperCase())}</div><span>${esc(f.original_name)}</span></a>`
    )
    .join('');

  const body = `
  <section class="headrow">
    <div>
      <h1>${esc(target.username)}</h1>
      <p class="muted">${files.length} files · ${formatBytes(bytes)} · joined ${formatDate(target.created_at)}</p>
    </div>
  </section>
  ${files.length ? `<div class="grid">${grid}</div>` : '<p class="muted">This user has no uploads yet.</p>'}
  `;
  res.send(layout({ title: `${target.username}`, user, body, active: 'gallery' }));
});

// ---------- file page ----------

router.get('/f/:name', (req, res) => {
  const user = auth.sessionUser(req);
  const file = statements.findFileByName.get(String(req.params.name));
  if (!file) {
    return res.status(404).send(layout({ title: 'not found', user, body: flashHtml('File not found.', false) }));
  }

  // anonymous delete link ?delete=KEY
  if (req.query.delete) {
    if (req.query.delete === file.delete_key) {
      const p = path.join(config.uploadDir, file.name);
      statements.deleteFile.run(file.id);
      fs.unlink(p, () => {});
      return res.send(layout({ title: 'deleted', user, body: flashHtml('File deleted.') }));
    }
    return res.status(403).send(layout({ title: 'forbidden', user, body: flashHtml('Wrong delete key.', false) }));
  }

  const owner = file.user_id ? statements.findUserById.get(file.user_id) : null;
  const canDelete = user && (user.id === file.user_id || user.role === 'admin');
  const showDeleteKey = !file.user_id && !user;

  const uploader = owner
    ? `<a href="/u/${esc(owner.username)}">${esc(owner.username)}</a>`
    : '<span class="muted">anonymous</span>';

  const deleteControls = canDelete
    ? `<button class="btn danger" id="delete-file" data-id="${file.id}">delete</button>`
    : showDeleteKey
      ? `<p class="muted smallnote">This anonymous upload can be deleted with its delete link:<br><code class="wrap">${config.baseUrl}/f/${esc(file.name)}?delete=${esc(file.delete_key)}</code></p>`
      : '';

  const media = isImage(file.ext)
    ? `<img class="viewer" src="/i/${esc(file.name)}" alt="${esc(file.original_name)}">`
    : `<div class="viewer filecell big"><div class="fileicon">${esc(file.ext.toUpperCase())}</div><a class="btn primary" href="/i/${esc(file.name)}" download="${esc(file.original_name)}">download file</a></div>`;

  const body = `
  <section class="fileview">
    ${media}
    <div class="filedetails card">
      <h1>${esc(file.original_name)}</h1>
      <table class="meta">
        <tr><td>uploaded</td><td>${formatDate(file.created_at)}</td></tr>
        <tr><td>size</td><td>${formatBytes(file.size)}</td></tr>
        <tr><td>views</td><td>${file.views}</td></tr>
        <tr><td>uploader</td><td>${uploader}</td></tr>
      </table>
      <div class="btnrow">
        <button class="btn" data-copy="${config.baseUrl}/i/${esc(file.name)}">copy url</button>
        <button class="btn" data-copy="${config.baseUrl}/f/${esc(file.name)}">copy page</button>
        <a class="btn" href="/i/${esc(file.name)}" download="${esc(file.original_name)}">download</a>
        ${deleteControls}
      </div>
    </div>
  </section>
  `;
  res.send(layout({ title: file.original_name, user, body }));
});

// ---------- admin ----------

router.get('/admin', auth.requireAdmin, (req, res) => {
  const users = statements.listUsers
    .all()
    .map((u) => {
      const isSelf = u.id === req.user.id;
      return `<tr>
        <td>${esc(u.username)}${isSelf ? ' <em class="muted">(you)</em>' : ''}</td>
        <td>${u.role === 'admin' ? '<span class="badge">admin</span>' : 'user'}</td>
        <td>${statements.userFileCount.get(u.id).n}</td>
        <td>${formatBytes(statements.userStorage.get(u.id).n)}</td>
        <td>${formatDate(u.created_at)}</td>
        <td class="actions">
          ${isSelf ? '' : `<button class="btn small" data-role="${u.id}" data-new="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'demote' : 'promote'}</button>`}
          ${isSelf ? '' : `<button class="btn small danger" data-deluser="${u.id}">delete</button>`}
        </td>
      </tr>`;
    })
    .join('');

  const body = `
  <section class="headrow">
    <div><h1>admin</h1><p class="muted">manage users and files</p></div>
  </section>
  <section class="stats">
    <div class="stat"><b id="adm-users">…</b><span>users</span></div>
    <div class="stat"><b id="adm-files">…</b><span>files</span></div>
    <div class="stat"><b id="adm-bytes">…</b><span>stored</span></div>
  </section>
  <section class="card">
    <h2>users</h2>
    <table class="table">
      <thead><tr><th>username</th><th>role</th><th>files</th><th>storage</th><th>joined</th><th></th></tr></thead>
      <tbody>${users}</tbody>
    </table>
  </section>
  <section class="card">
    <h2>all files</h2>
    <div id="admin-files" class="uploads"></div>
    <div class="btnrow"><button class="btn" id="adm-more">load more</button></div>
  </section>
  `;
  res.send(layout({ title: 'admin', user: req.user, body, active: 'admin' }));
});

// ---------- 404 ----------

router.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const user = auth.sessionUser(req);
  res.status(404).send(layout({ title: 'not found', user, body: flashHtml('Page not found.', false) }));
});

module.exports = { router, esc, formatBytes, formatDate, isImage };