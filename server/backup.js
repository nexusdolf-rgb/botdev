// ============================================================
// BotDev - Sauvegarde automatique des données sur GitHub
//
// Pourquoi : Render (plan gratuit) efface le disque à chaque
// redéploiement. On sauvegarde donc la base SQLite sur un dépôt
// GitHub PRIVÉ et on la restaure au démarrage → les mises à jour
// deviennent totalement automatiques (personne ne doit se reconnecter).
//
// Configuration (variables d'environnement sur Render) :
//   BOTDEV_GH_TOKEN  = token GitHub (fine-grained, Contents: Read/Write,
//                      limité au dépôt de données PRIVÉ)
//   BOTDEV_DATA_REPO = propriétaire/dépôt  (ex : nexusdolf-rgb/botdev-data)
//   BOTDEV_DATA_BRANCH = branche (optionnel, défaut : branche par défaut)
// ============================================================
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const paths = require('./paths');
const { fetchJson, readLimitedBody } = require('./http');

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
// 🛟 Taille max de la sauvegarde : sous la limite de 1 Mo de l'API GitHub
// (les fichiers plus gros ne sont plus lisibles via l'API standard).
const MAX_BACKUP_BYTES = 900 * 1024;
const FILE = 'botdev.db';

function repo() {
  const value = String(process.env.BOTDEV_DATA_REPO || '').trim();
  const [owner, name, extra] = value.split('/');
  if (extra !== undefined || !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?$/.test(owner || '')
    || !/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,98}[A-Za-z0-9])?$/.test(name || '')
    || owner === '..' || name === '..') return '';
  return value;
}

function enabled() {
  return !!(process.env.BOTDEV_GH_TOKEN && repo());
}

function branch() {
  return String(process.env.BOTDEV_DATA_BRANCH || '').trim().slice(0, 200);
}

async function ghJson(route, { method = 'GET', body, token } = {}) {
  const base = githubApiBase();
  const result = await fetchJson(`${base}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  }, { timeoutMs: 15000, maxBytes: 2 * 1024 * 1024 });
  if (!result.response.ok) {
    const msg = result.json && result.json.message ? result.json.message : `HTTP ${result.response.status}`;
    const err = new Error(`GitHub : ${String(msg).slice(0, 160)}`);
    err.status = result.response.status;
    throw err;
  }
  if (!result.json || typeof result.json !== 'object') throw new Error('Réponse GitHub invalide.');
  return result.json;
}

function isValidSqlite(buf) {
  return buf && buf.length >= 16 && buf.subarray(0, 16).toString('utf8') === 'SQLite format 3\u0000';
}

// 🛟 v302 — Validation d'une sauvegarde téléchargée : SQLite lisible ET au
// moins un bot dedans (une base sans bot est le symptôme exact de la base
// fraîche qu'il ne faut JAMAIS restaurer ni ré-écrire par-dessus la bonne).
function countBotsIn(buf) {
  const tmp = path.join(os.tmpdir(), `hoxera-backup-check-${process.pid}-${crypto.randomBytes(8).toString('hex')}.db`);
  let check = null;
  try {
    fs.writeFileSync(tmp, buf, { mode: 0o600, flag: 'wx' });
    const Database = require('better-sqlite3');
    check = new Database(tmp, { readonly: true, fileMustExist: true });
    return Number(check.prepare('SELECT COUNT(*) AS n FROM bots').get().n) || 0;
  } catch { return 0; }
  finally {
    try { if (check) check.close(); } catch {}
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

async function readRaw(url, headers, maxBytes, allowedHosts) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname) || parsed.port || parsed.username || parsed.password) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(parsed.toString(), { headers, signal: controller.signal, redirect: 'error' });
    if (!response.ok) return null;
    return await readLimitedBody(response, maxBytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Télécharge la sauvegarde distante. Retourne un Buffer ou null.
async function download() {
  if (!enabled()) return null;
  const token = process.env.BOTDEV_GH_TOKEN;
  const r = repo();
  const b = branch();
  const apiUrl = `/repos/${r.split('/').map(encodeURIComponent).join('/')}/contents/${FILE}${b ? `?ref=${encodeURIComponent(b)}` : ''}`;
  let meta = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      meta = await module.exports.ghJson(apiUrl, { token });
      break;
    } catch (error) {
      if (error.status === 404 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (error.status === 404) return null;
      throw error;
    }
  }
  let buffer = null;
  if (meta && typeof meta.content === 'string' && meta.content.length > 0) {
    const encoded = meta.content.replace(/\s/g, '');
    const maxEncoded = Math.ceil(MAX_BACKUP_BYTES * 4 / 3) + 8;
    if (encoded.length <= maxEncoded && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      const decoded = Buffer.from(encoded, 'base64');
      if (decoded.toString('base64') === encoded && decoded.length <= MAX_BACKUP_BYTES) buffer = decoded;
    }
  }
  if ((!buffer || !buffer.length) && meta && meta.download_url) {
    buffer = await readRaw(meta.download_url, { Authorization: `Bearer ${token}` }, MAX_BACKUP_BYTES,
      new Set(['raw.githubusercontent.com']));
  }
  if ((!buffer || !buffer.length) && meta && meta.sha) {
    const rawUrl = `${githubApiBase()}${apiUrl}`;
    buffer = await readRaw(rawUrl, { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' }, MAX_BACKUP_BYTES,
      new Set([new URL(githubApiBase()).hostname]));
  }
  if (!buffer || buffer.length === 0) return null;
  if (!isValidSqlite(buffer)) {
    console.log('[Hoxera] sauvegarde distante invalide, ignorée');
    return null;
  }
  return buffer;
}

// Restaure la base au démarrage (à appeler AVANT d'ouvrir la base locale).
let lastRestoreInfo = 'inconnu';
async function restore() {
  if (!enabled()) {
    lastRestoreInfo = 'sauvegarde desactivee';
    console.log('[BotDev] 💾 Sauvegarde désactivée (BOTDEV_GH_TOKEN / BOTDEV_DATA_REPO absents) — données locales uniquement');
    return false;
  }
  console.log(`[BotDev] 💾 Sauvegarde activée : ${repo()}${branch() ? ` (branche ${branch()})` : ''}`);
  try {
    const buf = await module.exports.download();
    if (!buf) {
      lastRestoreInfo = 'aucune sauvegarde distante (download null)';
      console.log('[BotDev] ℹ️ Aucune sauvegarde distante (premier démarrage)');
      return false;
    }
    // 🛟 VALIDATION ANTI-CATASTROPHE : on ne restaure JAMAIS une sauvegarde
    // sans bot (base vide). C'est ce qui a détruit les données : une base
    // vide avait écrasé la bonne, puis tout le monde la restaurait.
    const n = countBotsIn(buf);
    if (!(n > 0)) {
      if (!lastRestoreInfo.startsWith('validation')) lastRestoreInfo = 'sauvegarde distante SANS bot — ignoree (taille ' + buf.length + ')';
      console.log('🛟 Sauvegarde distante SANS bot — ignorée. (taille reçue : ' + buf.length + ' octets)');
      return false;
    }
    const restoreTmp = `${paths.dbPath}.restore-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    try {
      fs.writeFileSync(restoreTmp, buf, { mode: 0o600, flag: 'wx' });
      fs.renameSync(restoreTmp, paths.dbPath);
    } finally {
      try { fs.rmSync(restoreTmp, { force: true }); } catch {}
    }
    for (const suffix of ['-wal', '-shm']) {
      try { fs.rmSync(paths.dbPath + suffix, { force: true }); } catch {}
    }
    lastRestoreInfo = 'ok (' + buf.length + ' octets, ' + n + ' bot(s))';
    console.log(`[BotDev] ✅ Données restaurées depuis GitHub (${buf.length} octets)`);
    return true;
  } catch (e) {
    lastRestoreInfo = 'erreur: ' + String(e.message || e).slice(0, 120);
    console.log(`[BotDev] ⚠️ Restauration impossible (${e.message}) — démarrage avec les données locales`);
    return false;
  }
}

// Capture un instantané cohérent de la base.
async function snapshot(db) {
  try {
    const buf = await db.backup();
    if (buf) return buf;
    throw new Error('backup vide');
  } catch {
    return db.serialize();
  }
}

// Envoie les sauvegardes en série : auto-save + demande manuelle ne se
// disputent pas le SHA GitHub, et un échec précédent ne bloque pas la file.
let uploadQueue = Promise.resolve();
function upload(db) {
  const task = uploadQueue.catch(() => false).then(() => performUpload(db));
  uploadQueue = task;
  return task;
}

async function performUpload(db) {
  if (!enabled()) return false;
  const token = process.env.BOTDEV_GH_TOKEN;
  const r = repo();
  const b = branch();
  const apiPath = `/repos/${r.split('/').map(encodeURIComponent).join('/')}/contents/${FILE}`;
  const metaPath = `${apiPath}${b ? `?ref=${encodeURIComponent(b)}` : ''}`;
  const buf = await snapshot(db);
  const bufSize = buf.length;
  if (bufSize > MAX_BACKUP_BYTES) {
    console.error(`[Hoxera] sauvegarde annulée : base ${bufSize} octets (maximum ${MAX_BACKUP_BYTES}).`);
    return false;
  }

  const fetchSha = async () => {
    try {
      const meta = await module.exports.ghJson(metaPath, { token });
      return meta && typeof meta.sha === 'string' ? meta.sha : null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  let sha = await fetchSha();

  // Ne jamais remplacer une sauvegarde valide par une base vide/fraîche.
  let botCount = 0;
  let guildCfgCount = 0;
  try { botCount = Number(db.prepare('SELECT COUNT(*) AS n FROM bots').get().n) || 0; } catch {}
  try { guildCfgCount = Number(db.prepare('SELECT COUNT(*) AS n FROM guild_settings').get().n) || 0; } catch {}
  if (sha && (botCount === 0 || guildCfgCount === 0)) {
    console.warn('[Hoxera] sauvegarde annulée : base fraîche/vide, la copie GitHub existante est préservée.');
    return false;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const body = {
      message: `Hoxera backup (${new Date().toISOString()})`,
      content: buf.toString('base64'),
      ...(sha ? { sha } : {}),
      ...(b ? { branch: b } : {}),
    };
    try {
      await module.exports.ghJson(apiPath, { method: 'PUT', body: JSON.stringify(body), token });
      console.log(`[Hoxera] sauvegarde envoyée (${bufSize} octets${attempt > 1 ? `, tentative ${attempt}` : ''})`);
      return true;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`[Hoxera] sauvegarde échouée (${String(error.message || error).slice(0, 120)}), nouvelle tentative…`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      sha = await fetchSha();
    }
  }
  return false;
}

// ============================================================
// 🚑 v302 — Restauration différée auto-réparante.
// Incident réel du 14/09 : token GitHub révoqué → la restauration au boot
// échoue (« Bad credentials ») → le service démarre sur une base VIDE
// (plus aucun réglage, tickets, vérification…) et il n'existe alors plus
// aucun moyen de récupérer les données sans intervention humaine.
// Ce boucle réessaie toutes les 5 min TANT QUE la base locale est fraîche
// (aucun réglage de serveur : rien à perdre). Dès que la sauvegarde
// distante redevient téléchargeable ET valide, on redémarre proprement :
// Render relance le service et le restore au boot charge les vraies données.
// On ne redémarre JAMAIS si la base locale contient déjà des réglages :
// des données réelles auraient été accumulées depuis le boot.
// ============================================================
let restoreRetryTimer = null;
const RESTORE_RETRY_INTERVAL_MS = 5 * 60000;

// Un cycle de tentative (exposé pour les tests automatiques). Retourne :
//  'stopped'  — la base locale n'est plus fraîche, les tentatives s'arrêtent
//  'wait'     — la sauvegarde distante est encore inaccessible
//  'restart'  — la sauvegarde est accessible : redémarrage demandé
async function retryRestoreOnce(getDb) {
  const db = typeof getDb === 'function' ? getDb() : null;
  if (!db) return 'wait';
  // La base locale n'est plus fraîche → des données réelles existent,
  // un redémarrage les perdrait : on arrête définitivement les tentatives.
  let settingsCount = 0;
  try { settingsCount = db.prepare('SELECT COUNT(*) AS n FROM guild_settings').get().n || 0; } catch {}
  if (settingsCount > 0) {
    if (restoreRetryTimer) { clearInterval(restoreRetryTimer); restoreRetryTimer = null; }
    console.log('[BotDev] 💾 Base locale non fraîche — arrêt des tentatives de restauration différée.');
    return 'stopped';
  }
  const buf = await module.exports.download();
  if (!buf) return 'wait'; // encore inaccessible — on retentera dans 5 min
  if (!(countBotsIn(buf) > 0)) return 'wait'; // sauvegarde suspecte, on n'y touche pas
  console.log('[BotDev] 💾 La sauvegarde distante est de nouveau accessible — redémarrage pour restaurer les données…');
  try { db.close(); } catch {}
  lastRestoreInfo = 'redémarrage différé : sauvegarde de nouveau accessible';
  process.exit(0); // Render relance le service → restore() réussit au boot
  return 'restart';
}

function startRestoreRetries(getDb) {
  if (restoreRetryTimer) return;
  if (!enabled()) return;
  restoreRetryTimer = setInterval(() => {
    module.exports._retryRestoreOnce(getDb).catch(() => { /* prochain cycle dans 5 min */ });
  }, RESTORE_RETRY_INTERVAL_MS);
  restoreRetryTimer.unref();
}

function stopRestoreRetries() {
  if (restoreRetryTimer) { clearInterval(restoreRetryTimer); restoreRetryTimer = null; }
}

module.exports = { enabled, repo, branch, download, restore, upload, ghJson, snapshot, getLastRestoreInfo: () => lastRestoreInfo, startRestoreRetries, stopRestoreRetries, _retryRestoreOnce: retryRestoreOnce, countBotsIn, MAX_BACKUP_BYTES, RESTORE_RETRY_INTERVAL_MS };
