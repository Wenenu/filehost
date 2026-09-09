'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Load .env if it exists (dotenv keeps process.env, doesn't override)
try {
  require('dotenv').config();
} catch {
  // dotenv missing -> fall back to manual .env parsing
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function envInt(name, fallback) {
  const n = parseInt(env(name, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function lanAddress() {
  let fallback = 'localhost';
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      fallback = iface.address;
      const oct = iface.address.split('.').map(Number);
      // prefer private LAN ranges (192.168.x, 10.x, 172.16-31.x)
      if (oct[0] === 192 && oct[1] === 168) return iface.address;
      if (oct[0] === 10) return iface.address;
      if (oct[0] === 172 && oct[1] >= 16 && oct[1] <= 31) return iface.address;
    }
  }
  return fallback;
}

const port = envInt('PORT', 3000);
const uploadDir = path.resolve(env('UPLOAD_DIR', './uploads'));
const dbPath = path.resolve(env('DB_PATH', './data/upload.db'));

const config = {
  port,
  baseUrl: (env('BASE_URL', '') || `http://${lanAddress()}:${port}`).replace(/\/+$/, ''),
  uploadDir,
  dbPath,
  maxUploadBytes: envInt('MAX_UPLOAD_MB', 20) * 1024 * 1024,
  allowedExtensions: env('ALLOWED_EXTENSIONS', 'png,jpg,jpeg,gif,webp,svg,avif,bmp,ico,mp4,webm,mp3,wav,ogg,txt,json,zip')
    .split(',')
    .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean),
  registrationOpen: envInt('REGISTRATION_OPEN', 1) === 1,
  adminUsernames: env('ADMIN_USERNAME', '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  nameLength: Math.max(4, Math.min(16, envInt('NAME_LENGTH', 8))),
  rate: {
    uploadPerMinute: envInt('UPLOAD_RATE_PER_MINUTE', 30),
    loginPer15Min: envInt('LOGIN_RATE_PER_15_MIN', 15),
    registerPerHour: envInt('REGISTER_RATE_PER_HOUR', 5),
  },
};

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  txt: 'text/plain',
  json: 'application/json',
  zip: 'application/zip',
  pdf: 'application/pdf',
};

config.mimeFor = (ext) => MIME_BY_EXT[ext] || 'application/octet-stream';

module.exports = config;