# upload

A self-hosted image host built for [ShareX](https://getsharex.com) — like upload.systems / pays.host, but on your own PC.

- **ShareX ready**: upload with your API key, get a short URL, one-click `.sxcu` config download
- **Full auth**: register, login, sessions, API keys, admin panel
- **Website**: drag & drop / clipboard-paste upload, per-user galleries, file pages, dashboard
- **Zero external services**: SQLite database (built into Node), files saved to a folder on disk
- **Runs anywhere**: Windows / Linux / macOS, no Docker needed

## Requirements

- **Node.js 22.5 or newer** (uses the built-in SQLite module). Grab it from https://nodejs.org

## Setup

```bash
npm install
copy .env.example .env    # Windows (or: cp .env.example .env)
# edit .env — at minimum set PORT and optionally BASE_URL
npm start
```

Or on Windows, just double-click **start.bat** — it installs dependencies and starts the server.

Open `http://localhost:3000` (or your PC's LAN IP) and **register the first account — it becomes admin automatically**.

> If the server runs on a second PC, open port `3000` in Windows Firewall, then use `http://<that-pc-ip>:3000` from your main PC. For a domain or reverse proxy, set `BASE_URL` in `.env`.

## Setting up ShareX

1. Open ShareX → **Destinations** → **Custom uploader** → **Import** → **From file**
2. Pick the config you downloaded from your **dashboard** (the "download sharex config" button) — your API key is already baked in
3. Set **Destinations** → **Image uploader** → your uploader name
4. Take a screenshot — the link is copied to your clipboard

You can also generate the config yourself at any time: `GET /api/sharex` (logged in).

### How the API works

`POST /api/upload` — multipart form with a `file` field.

| Auth method | Example |
|---|---|
| `Key` header (ShareX default) | `Key: your-api-key` |
| Bearer | `Authorization: Bearer your-api-key` |
| Query / form field | `?key=your-api-key` or `key=...` |
| Session cookie | any logged-in browser request |

- With the argument/field `json=url` → responds with JSON: `{"url": "...", "deleteUrl": "...", ...}` (this is what the generated ShareX config uses)
- Without it → responds with the plain URL as text

Files can be deleted with the `deleteUrl` (`/f/<name>?delete=<key>`) or from the dashboard/admin panel.

## Configuration (.env)

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `BASE_URL` | auto (LAN IP) | Base URL used in generated links |
| `UPLOAD_DIR` | `./uploads` | Where image files are saved |
| `DB_PATH` | `./data/upload.db` | SQLite database file |
| `MAX_UPLOAD_MB` | `20` | Max upload size |
| `ALLOWED_EXTENSIONS` | images + common formats | Comma-separated allowlist |
| `REGISTRATION_OPEN` | `1` | Allow new signups |
| `ADMIN_USERNAME` | empty | Force these usernames to be admins |
| `NAME_LENGTH` | `8` | Random filename length |

## Pages

| Route | What it is |
|---|---|
| `/` | Landing + upload dropzone + recent uploads + stats |
| `/login` `/register` | Auth |
| `/dashboard` | API key, ShareX config, password change, your uploads |
| `/u/<username>` | Public gallery of a user's uploads |
| `/f/<name>` | File page with copy/delete links |
| `/admin` | User & file management (admins only) |
| `/i/<name>` | Raw file (what image URLs point at) |

## Project layout

```
server.js            entry point, raw file serving
src/config.js        configuration from .env
src/db.js            SQLite schema + queries
src/auth.js          password hashing, sessions, API keys
src/routes/api.js    /api/* endpoints (upload, auth, files, admin, sharex)
src/routes/pages.js  website pages (server-rendered)
public/              stylesheet + frontend JS
```

## Notes

- Passwords are hashed with scrypt; sessions are random tokens stored in SQLite, 30-day expiry
- Uploads are rate-limited per IP; filenames are random, so links are unguessable
- Images are served with long cache headers — deleting a file removes it from disk