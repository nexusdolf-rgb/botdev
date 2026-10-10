// Images de profil du bot : stockage local persistant + dépôt GitHub privé.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const backup = require('./backup');
const { fetchJson, readLimitedBody } = require('./http');

const MAX_SIZE = 3 * 1024 * 1024;
const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
const FORMAT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp' };
const ASSET_KEY = /^[a-f0-9]{16}\.(?:png|jpg|gif|webp)$/i;

function assetsDir() {
  const dir = path.join(process.env.BOTDEV_DATA_DIR || path.join(__dirname, '..'), 'assets');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch {}
  return dir;
}

function localPath(key) {
  if (typeof key !== 'string' || !ASSET_KEY.test(key)) throw new Error('clé image invalide');
  const root = path.resolve(assetsDir());
  const file = path.resolve(root, key);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('clé image invalide');
  return file;
}

function enabled() {
  return backup.enabled();
}

function normalizeMime(mime) {
  const normalized = String(mime || '').split(';')[0].trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

async function validateImage(buffer, mime) {
  const type = normalizeMime(mime);
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_SIZE) throw new Error('image vide ou trop lourde (3 Mo max)');
  const expectedFormat = FORMAT_BY_MIME[type];
  if (!expectedFormat) throw new Error('format d’image non autorisé');
  let metadata;
  try { metadata = await sharp(buffer, { limitInputPixels: 20_000_000, failOn: 'error' }).metadata(); }
  catch { throw new Error('fichier image invalide'); }
  if (metadata.format !== expectedFormat || !metadata.width || !metadata.height
    || metadata.width > 10000 || metadata.height > 10000) throw new Error('type ou dimensions d’image invalides');
  return type;
}

function githubApiBase() {
  const raw = String(process.env.BOTDEV_GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase();
  const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  const production = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  if (parsed.username || parsed.password || parsed.search || parsed.hash
    || (isLocal && (production || parsed.protocol !== 'http:'))
    || (!isLocal && (host !== 'api.github.com' || parsed.protocol !== 'https:' || parsed.port || parsed.pathname !== '/'))) {
    throw new Error('URL de l’API GitHub invalide.');
  }
  return parsed.origin + parsed.pathname.replace(/\/$/, '');
}

async function ghJson(route, token, method = 'GET', body = null) {
  const base = githubApiBase();
  const result = await fetchJson(`${base}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }, { timeoutMs: 12000, maxBytes: 2 * 1024 * 1024 });
  if (!result.response.ok) {
    const message = result.json && result.json.message ? result.json.message : `HTTP ${result.response.status}`;
    const err = new Error(`GitHub : ${String(message).slice(0, 160)}`);
    err.status = result.response.status;
    throw err;
  }
  if (!result.json || typeof result.json !== 'object') throw new Error('Réponse GitHub invalide.');
  return result.json;
}

async function fetchRawAsset(url, token) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  // Ne transmet jamais un PAT à une URL fournie par les métadonnées sans
  // vérifier son hôte. GitHub renvoie les fichiers privés depuis raw.github.com.
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'raw.githubusercontent.com'
    || parsed.port || parsed.username || parsed.password) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(parsed.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' },
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) return null;
    const buffer = await readLimitedBody(response, MAX_SIZE);
    return buffer.length ? buffer : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Enregistre une image validée et la synchronise si le dépôt est configuré.
async function put(buffer, mime) {
  const type = await validateImage(buffer, mime);
  const ext = EXT_BY_MIME[type];
  const key = crypto.randomBytes(8).toString('hex') + ext;
  const filePath = localPath(key);
  fs.writeFileSync(filePath, buffer, { mode: 0o600, flag: 'wx' });
  if (enabled()) {
    try { await uploadToGithub(key, buffer); }
    catch (error) { console.error('[Hoxera] upload asset GitHub échoué (copie locale conservée) :', error.message); }
  }
  return key;
}

async function uploadToGithub(key, buffer) {
  const token = process.env.BOTDEV_GH_TOKEN;
  const repo = backup.repo();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('dépôt GitHub invalide');
  const file = `assets/${key}`;
  let sha = null;
  try {
    const meta = await ghJson(`/repos/${repo}/contents/${file}`, token);
    sha = meta && meta.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const body = { message: `Hoxera image ${key}`, content: buffer.toString('base64'), ...(sha ? { sha } : {}) };
  await ghJson(`/repos/${repo}/contents/${file}`, token, 'PUT', body);
}

function mimeFor(key) {
  const ext = path.extname(String(key || '')).toLowerCase();
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' })[ext] || '';
}

async function get(key) {
  const mime = mimeFor(key);
  if (!mime) return null;
  try {
    const file = localPath(key);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SIZE) return null;
    const buffer = fs.readFileSync(file);
    await validateImage(buffer, mime);
    return { buffer, mime };
  } catch {}

  if (!enabled()) return null;
  try {
    const token = process.env.BOTDEV_GH_TOKEN;
    const repo = backup.repo();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !ASSET_KEY.test(key)) return null;
    const meta = await ghJson(`/repos/${repo}/contents/assets/${encodeURIComponent(key)}`, token);
    let buffer = null;
    if (meta && typeof meta.content === 'string' && meta.content.length > 0) {
      const encoded = meta.content.replace(/\s/g, '');
      if (encoded.length <= Math.ceil(MAX_SIZE / 3) * 4 + 8) buffer = Buffer.from(encoded, 'base64');
    } else if (meta && meta.download_url) {
      buffer = await fetchRawAsset(meta.download_url, token);
    }
    if (!buffer || buffer.length > MAX_SIZE) return null;
    await validateImage(buffer, mime);
    try { fs.writeFileSync(localPath(key), buffer, { mode: 0o600 }); } catch {}
    return { buffer, mime };
  } catch {
    return null;
  }
}

async function syncFromRemote() {
  if (!enabled()) return 0;
  try {
    const token = process.env.BOTDEV_GH_TOKEN;
    const repo = backup.repo();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return 0;
    const list = await ghJson(`/repos/${repo}/contents/assets`, token);
    if (!Array.isArray(list)) return 0;
    let restored = 0;
    for (const file of list.slice(0, 500)) {
      if (file.type !== 'file' || !ASSET_KEY.test(String(file.name || ''))) continue;
      if (await get(file.name)) restored++;
    }
    return restored;
  } catch (error) {
    if (error.status !== 404) console.error('[Hoxera] synchronisation assets :', error.message);
    return 0;
  }
}

module.exports = { put, get, syncFromRemote, mimeFor, enabled, validateImage, MAX_SIZE };
