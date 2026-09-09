'use strict';

/* ---------- helpers ---------- */

function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

async function postJSON(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const out = await res.json().catch(() => ({}));
  return { res, out };
}

function formMessage(form, text, ok) {
  const box = form.querySelector('.form-msg');
  if (box) {
    box.textContent = text || '';
    box.className = 'form-msg ' + (ok ? 'ok' : 'err');
  }
}

/* ---------- uploads (dropzone + paste) ---------- */

function uploadFile(file) {
  const status = document.getElementById('upload-status');
  const line = document.createElement('div');
  line.className = 'upload-line';
  line.innerHTML = '<span class="muted">uploading…</span>';
  status.prepend(line);

  const fd = new FormData();
  fd.append('file', file);

  fetch('/api/upload?json=url', { method: 'POST', body: fd })
    .then(async (res) => {
      const isJson = (res.headers.get('content-type') || '').includes('json');
      const data = isJson ? await res.json() : await res.text();
      if (!res.ok) throw new Error(data.error || data || `HTTP ${res.status}`);
      return data;
    })
    .then((data) => {
      line.innerHTML = '';
      const link = document.createElement('a');
      link.className = 'u-url';
      link.href = data.url || data;
      link.textContent = (data.url || data).replace(/^https?:\/\//, '');
      link.target = '_blank';
      const copy = document.createElement('button');
      copy.className = 'btn small';
      copy.textContent = 'copy';
      copy.onclick = () => copyText(data.url || data);
      line.append(link, copy);
      toast('uploaded!');
    })
    .catch((err) => {
      line.innerHTML = `<span class="u-err">✕ ${escapeHtml(err.message)}</span>`;
    });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function initDropzone() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  if (!dz) return;

  dz.addEventListener('click', () => input && input.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') input && input.click();
  });
  input && input.addEventListener('change', () => {
    for (const f of input.files) uploadFile(f);
    input.value = '';
  });

  for (const ev of ['dragenter', 'dragover']) {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    });
  }
  for (const ev of ['dragleave', 'drop']) {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
    });
  }
  dz.addEventListener('drop', (e) => {
    for (const f of e.dataTransfer.files) uploadFile(f);
  });

  // paste from clipboard (when the dropzone area is focused, or anywhere on home)
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) uploadFile(f);
      }
    }
  });
}

/* ---------- copy / delete ---------- */

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast('copied!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('copied!');
  }
}

function initCopyButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (btn) copyText(btn.dataset.copy);
  });
}

function initDeleteButtons() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    if (!confirm('Delete this file?')) return;
    const res = await fetch(`/api/files/${btn.dataset.delete}`, { method: 'DELETE' });
    if (res.ok) {
      const row = btn.closest('.up');
      if (row) {
        row.style.opacity = '0.3';
        setTimeout(() => row.remove(), 200);
      } else {
        location.reload();
      }
      toast('deleted');
    } else {
      toast('delete failed');
    }
  });

  const single = document.getElementById('delete-file');
  if (single) {
    single.addEventListener('click', async () => {
      if (!confirm('Delete this file?')) return;
      const res = await fetch(`/api/files/${single.dataset.id}`, { method: 'DELETE' });
      if (res.ok) location.href = '/';
      else toast('delete failed');
    });
  }
}

/* ---------- forms ---------- */

function initAuthForms() {
  const login = document.getElementById('login-form');
  if (login) {
    login.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { res, out } = await postJSON('/api/login', {
        username: login.username.value,
        password: login.password.value,
      });
      if (res.ok) location.href = login.dataset.next || '/dashboard';
      else formMessage(login, out.error || 'login failed', false);
    });
  }

  const reg = document.getElementById('register-form');
  if (reg) {
    reg.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { res, out } = await postJSON('/api/register', {
        username: reg.username.value,
        password: reg.password.value,
      });
      if (res.ok) location.href = '/dashboard';
      else formMessage(reg, out.error || 'registration failed', false);
    });
  }

  const pw = document.getElementById('password-form');
  if (pw) {
    pw.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { res, out } = await postJSON('/api/password', {
        current: pw.current.value,
        password: pw.password.value,
      });
      if (res.ok) {
        pw.reset();
        formMessage(pw, 'password updated', true);
      } else {
        formMessage(pw, out.error || 'failed', false);
      }
    });
  }
}

function initLogout() {
  document.querySelectorAll('[data-logout]').forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/logout', { method: 'POST' });
      location.href = '/';
    });
  });
}

function initApiKey() {
  const copyBtn = document.getElementById('copy-key');
  const keyEl = document.getElementById('api-key');
  if (copyBtn && keyEl) {
    copyBtn.addEventListener('click', () => copyText(keyEl.textContent.trim()));
  }
  const regen = document.getElementById('regen-key');
  if (regen && keyEl) {
    regen.addEventListener('click', async () => {
      if (!confirm('Regenerate API key? Old key stops working immediately.')) return;
      const { res, out } = await postJSON('/api/keys/regenerate', {});
      if (res.ok) {
        keyEl.textContent = out.api_key;
        toast('new key generated');
      } else toast('failed');
    });
  }
}

/* ---------- admin ---------- */

function initAdmin() {
  const statsEls = ['adm-users', 'adm-files', 'adm-bytes'];
  if (!statsEls.every((id) => document.getElementById(id))) return;

  fetch('/api/admin/stats')
    .then((r) => r.json())
    .then((s) => {
      const fmt = (n) => {
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return n.toFixed(n >= 100 ? 0 : 1) + ' ' + u[i];
      };
      document.getElementById('adm-users').textContent = s.users;
      document.getElementById('adm-files').textContent = s.files;
      document.getElementById('adm-bytes').textContent = fmt(s.bytes);
    });

  document.addEventListener('click', async (e) => {
    const roleBtn = e.target.closest('[data-role]');
    if (roleBtn) {
      await fetch(`/api/admin/users/${roleBtn.dataset.role}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: roleBtn.dataset.new }),
      });
      location.reload();
      return;
    }
    const delBtn = e.target.closest('[data-deluser]');
    if (delBtn) {
      if (!confirm('Delete this user and ALL their files?')) return;
      await fetch(`/api/admin/users/${delBtn.dataset.deluser}`, { method: 'DELETE' });
      location.reload();
    }
  });

  loadAdminFiles(0);
}

function loadAdminFiles(offset) {
  const container = document.getElementById('admin-files');
  const more = document.getElementById('adm-more');
  fetch(`/api/admin/files?offset=${offset}`)
    .then((r) => r.json())
    .then((data) => {
      data.files.forEach((f) => {
        const div = document.createElement('div');
        div.className = 'up';
        div.innerHTML = `
          <div class="up-info">
            <a class="up-name" href="/f/${f.name}" target="_blank">${f.originalName}</a>
            <span class="muted">${f.name} · ${fmtBytes(f.size)} · ${f.user}</span>
          </div>
          <div class="up-actions">
            <button class="btn small" data-copy="${f.url}">copy url</button>
            <button class="btn small danger" data-deladmin="${f.id}">delete</button>
          </div>`;
        container.appendChild(div);
      });
      if (data.nextOffset > offset) {
        more.onclick = () => {
          more.disabled = true;
          loadAdminFiles(data.nextOffset);
        };
      } else {
        more.remove();
      }
    });
}

function fmtBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return n.toFixed(n >= 100 ? 0 : 1) + ' ' + u[i];
}

document.addEventListener('click', async (e) => {
  const delAdmin = e.target.closest('[data-deladmin]');
  if (!delAdmin) return;
  if (!confirm('Delete this file?')) return;
  const res = await fetch(`/api/files/${delAdmin.dataset.deladmin}`, { method: 'DELETE' });
  if (res.ok) {
    delAdmin.closest('.up').remove();
    toast('deleted');
  } else toast('delete failed');
});

/* ---------- init ---------- */

initDropzone();
initCopyButtons();
initDeleteButtons();
initAuthForms();
initLogout();
initApiKey();
initAdmin();