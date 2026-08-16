// ============================================================
// BotDev - Magasin d'images (avatars/bannières des profils de bot)
// Les images sont stockées dans le dépôt GitHub de données (sous assets/)
// et servies publiquement via /assets/:key → elles survivent aux mises à jour.
// ============================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const backup = require('./backup');

const MAX_SIZE = 3 * 1024 * 1024; // 3 Mo par image
const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

function assetsDir() {
  const dir = path.join(process.env.BOTDEV_DATA_DIR || path.join(__dirname, '..'), 'assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function localPath(key) {
  if (!/^[a-zA-Z0-9._-]+$/.test(key)) throw new Error('clé invalide');
  return path.join(assetsDir(), key);
}

function enabled() {
  return backup.enabled();
}

function sanitizeExt(mime) {
  return EXT_BY_MIME[mime] || '.png';
}

// Enregistre une image (buffer) : local + GitHub. Retourne la clé publique.
async function put(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('image vide');
  if (buffer.length > MAX_SIZE) throw new Error('image trop lourde (3 Mo max)');
  const ext = sanitizeExt(mime);
  const key = crypto.randomBytes(8).toString('hex') + ext;
  const filePath = localPath(key);
  fs.writeFileSync(filePath, buffer);
  if (enabled()) {
    try {
      await uploadToGithub(key, buffer);
    } catch (e) {
      console.error('[BotDev] upload asset GitHub:', e.message);
      // L'image reste disponible localement cette session
    }
  }
  return key;
}

async function uploadToGithub(key, buffer) {
  const token = process.env.BOTDEV_GH_TOKEN;
  const repo = backup.repo();
  const file = `assets/${key}`;
  let sha = null;
  try {
    const meta = await ghJson(`/repos/${repo}/contents/${file}`, token);
    sha = meta && meta.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const body = {
    message: `🖼️ ${key}`,
    content: buffer.toString('base64'),
    ...(sha ? { sha } : {}),
  };
  await ghJson(`/repos/${repo}/contents/${file}`, token, 'PUT', body);
}

async function ghJson(route, token, method = 'GET', body = null) {
  const res = await fetch(`${process.env.BOTDEV_GITHUB_API || 'https://api.github.com'}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(json && json.message ? json.message : `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Récupère une image (local puis GitHub). Retourne { buffer, mime } ou null.
async function get(key) {
  try {
    const p = localPath(key);
    if (fs.existsSync(p)) {
      return { buffer: fs.readFileSync(p), mime: mimeFor(key) };
    }
  } catch {}
  if (!enabled()) return null;
  try {
    const token = process.env.BOTDEV_GH_TOKEN;
    const meta = await ghJson(`/repos/${backup.repo()}/contents/assets/${encodeURIComponent(key)}`, token);
    let buf = null;
    if (meta && typeof meta.content === 'string') {
      buf = Buffer.from(meta.content.replace(/\s/g, ''), 'base64');
    } else if (meta && meta.download_url) {
      const res = await fetch(meta.download_url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (buf && buf.length <= MAX_SIZE * 2) {
      try { fs.writeFileSync(localPath(key), buf); } catch {}
      return { buffer: buf, mime: mimeFor(key) };
    }
  } catch {}
  return null;
}

// Au démarrage : rapatrie toutes les images depuis GitHub
async function syncFromRemote() {
  if (!enabled()) return 0;
  try {
    const token = process.env.BOTDEV_GH_TOKEN;
    const list = await ghJson(`/repos/${backup.repo()}/contents/assets`, token);
    if (!Array.isArray(list)) return 0;
    let n = 0;
    for (const f of list) {
      if (f.type !== 'file' || !/^[a-zA-Z0-9._-]+$/.test(f.name)) continue;
      try {
        const got = await get(f.name);
        if (got) n++;
      } catch {}
    }
    return n;
  } catch (e) {
    if (e.status === 404) return 0;
    console.error('[BotDev] sync assets:', e.message);
    return 0;
  }
}

function mimeFor(key) {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.gif')) return 'image/gif';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

module.exports = { put, get, syncFromRemote, mimeFor, enabled };
