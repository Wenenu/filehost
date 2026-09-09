# upload

A self-hosted image host built for [ShareX](https://getsharex.com) — like upload.systems / pays.host, but on your own PC.

- **ShareX ready**: upload with your API key, get a short URL, one-click `.sxcu` config download
- **Full auth**: register, login, sessions, API keys, admin panel
- **Website**: drag & drop / clipboard-paste upload, per-user galleries, file pages, dashboard
- **Zero external services**: SQLite database (built into Node), files saved to a folder on disk
- **Runs anywhere**: Windows / Linux / macOS, no Docker needed

## Requirements

- **Node.js 20 or newer**. The app uses the built-in SQLite module on Node 22.5+, and automatically falls back to `better-sqlite3` on older versions (20 – 22.4), so any recent Node works. **Node 22.13+ or newer LTS is recommended**: https://nodejs.org

If you get `Error: No such built-in module: node:sqlite`, your Node is too old — install Node 22.13+ and re-run `npm install`.

> `better-sqlite3` is an *optional* dependency used only on Node versions without the built-in SQLite (20 – 22.4). On Node 22.5+ it isn't loaded at all, so if `npm install` prints a scary build error about `better-sqlite3` you can safely ignore it — or upgrade Node to make it go away.

## Setup

```bash
npm install
copy .env.example .env    # Windows (or: cp .env.example .env)
# edit .env — PORT and BASE_URL are already set for upload.wested.lol
npm start
```

Or on Windows, just double-click **start.bat** — it installs dependencies and starts the server.

Open `http://localhost:3000` and **register the first account — it becomes admin automatically**. Your API key appears on the dashboard.

## Publishing it at upload.wested.lol (Cloudflare Tunnel)

No port forwarding or public IP needed — the tunnel makes an outbound connection from your PC to Cloudflare.

1. Install **cloudflared** and add it to PATH: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Double-click **cloudflared\setup-tunnel.bat** — it logs you in (opens a browser), creates the tunnel, routes `upload.wested.lol` to it, and writes `cloudflared\config.yml`
3. Double-click **cloudflared\run-tunnel.bat** to start the tunnel (keep it running)
4. Start the server with **start.bat**
5. Visit **https://upload.wested.lol** — that's your image host

Run the two `start.bat` / `run-tunnel.bat` windows on boot (or use Task Scheduler) and it stays up.

> Requires `wested.lol` to be on Cloudflare (nameservers pointing at Cloudflare) — `cloudflared tunnel route dns` needs it.

## Setting up ShareX

**Option A — import the ready-made file:**
1. Copy `sharex-upload.sxcu` to your main PC
2. Open ShareX → **Destinations** → **Custom uploader** → **Import** → **From file** → pick `sharex-upload.sxcu`
3. Open **Destinations** → **Custom uploader** → select *upload.wested.lol* → replace `REPLACE_WITH_YOUR_API_KEY` in the **Headers** tab with your API key (from the dashboard)
4. Set **Destinations** → **Image uploader** → *upload.wested.lol*
5. Take a screenshot — the link is copied to your clipboard

**Option B — auto-generated (key already baked in):**
1. Log in to your dashboard at https://upload.wested.lol
2. Click **download sharex config (.sxcu)**
3. ShareX → **Destinations** → **Custom uploader** → **Import** → **From file** → pick it
4. Set **Destinations** → **Image uploader** → the new uploader

### How the API works

`POST https://upload.wested.lol/api/upload` — multipart form with a `file` field.

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
| `BASE_URL` | `https://upload.wested.lol` | Base URL used in generated links |
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