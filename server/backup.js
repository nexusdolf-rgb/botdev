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
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);
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
// 🛟 Taille max d'UN fichier de sauvegarde : sous la limite de 1 Mo de l'API
// GitHub (les fichiers plus gros ne sont plus lisibles via l'API standard).
// Ce n'est plus un plafond pour la BASE : depuis la v379, la sauvegarde est
// compressée puis découpée en morceaux de PART_BYTES, chacun sous la limite.
const MAX_BACKUP_BYTES = 900 * 1024;
const FILE = 'botdev.db';

// ============================================================
// v379 — Sauvegarde versionnée (format 2)
// ------------------------------------------------------------
// Problème réglé : la sauvegarde brute était refusée au-delà de 900 Ko, et
// l'échec était silencieux. Au redéploiement suivant, le bot restaurait donc
// une sauvegarde plus ANCIENNE (impression que tout « repart de zéro »).
//
// Nouveau fonctionnement, sans changer de moteur (SQLite reste la base) :
//   1. la base est compressée (gzip) — environ 5× plus petite ;
//   2. si elle dépasse encore PART_BYTES, elle est découpée en morceaux ;
//   3. un manifeste JSON décrit les morceaux (taille + empreinte SHA-256) ;
//   4. le manifeste est écrit en DERNIER : une sauvegarde incomplète ne peut
//      donc jamais être prise pour une sauvegarde valide.
// La restauration vérifie chaque empreinte, puis la base elle-même.
// Un ancien déploiement (qui ne connaît pas le format 2) continue de lire
// `botdev.db` : on continue donc de l'écrire tant que la base brute tient.
// ============================================================
const BACKUP_FORMAT = 2;
const MANIFEST_FILE = 'botdev-backup.json';
const PART_PREFIX = 'botdev-backup-';
const PART_SUFFIX = '.gz';
const PART_BYTES = 700 * 1024;              // < 900 Ko, marge confortable
const MAX_PARTS = 64;                       // 45 Mo de sauvegarde compressée
const MAX_RESTORE_BYTES = 256 * 1024 * 1024; // garde-fou mémoire à la lecture

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

// ---------- Helpers du format 2 ----------
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function partName(index) {
  return `${PART_PREFIX}${String(index).padStart(3, '0')}${PART_SUFFIX}`;
}

function splitBuffer(buf, size) {
  const out = [];
  for (let offset = 0; offset < buf.length; offset += size) {
    out.push(buf.subarray(offset, Math.min(offset + size, buf.length)));
  }
  return out;
}

function contentsApiPath(name) {
  const r = repo();
  const b = branch();
  const base = `/repos/${r.split('/').map(encodeURIComponent).join('/')}/contents/${encodeURIComponent(name)}`;
  return b ? `${base}?ref=${encodeURIComponent(b)}` : base;
}

// Supprime les morceaux d'une sauvegarde précédente qui n'ont plus lieu
// d'être : si la base rétrécit (5 morceaux → 3), les morceaux 4 et 5
// resteraient sinon indéfiniment dans le dépôt. Une erreur ici n'est jamais
// bloquante : le manifeste, lui, ne désigne que les morceaux valides.
async function removeStaleParts(fromIndex, maxIndex) {
  const token = process.env.BOTDEV_GH_TOKEN;
  for (let i = fromIndex; i < maxIndex; i++) {
    const name = partName(i);
    try {
      const meta = await module.exports.ghJson(contentsApiPath(name), { token });
      if (!meta || typeof meta.sha !== 'string') continue;
      const b = branch();
      const body = JSON.stringify({
        message: `Hoxera backup — suppression du morceau inutilisé ${name}`,
        sha: meta.sha,
        ...(b ? { branch: b } : {}),
      });
      await module.exports.ghJson(contentsApiPath(name), { method: 'DELETE', body, token });
      console.log(`[Hoxera] morceau inutilisé supprimé : ${name}`);
    } catch (error) {
      if (error && error.status === 404) continue;
      break;
    }
  }
}

// Lit un fichier du dépôt de données et renvoie son contenu brut.
async function fetchRepositoryFile(name, maxBytes) {
  const token = process.env.BOTDEV_GH_TOKEN;
  const apiPath = contentsApiPath(name);
  let meta;
  try {
    meta = await module.exports.ghJson(apiPath, { token });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
  if (!meta || typeof meta !== 'object') return null;
  if (typeof meta.content === 'string' && meta.content.length > 0) {
    const encoded = meta.content.replace(/\s/g, '');
    if (encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      const decoded = Buffer.from(encoded, 'base64');
      if (decoded.toString('base64') === encoded && decoded.length <= maxBytes) return decoded;
    }
    return null;
  }
  if (meta.download_url) {
    return readRaw(meta.download_url, { Authorization: `Bearer ${token}` }, maxBytes,
      new Set(['raw.githubusercontent.com']));
  }
  return null;
}

// Écrit un fichier dans le dépôt de données (création ou mise à jour).
async function putRepositoryFile(name, buffer, sha, message) {
  const token = process.env.BOTDEV_GH_TOKEN;
  const b = branch();
  const body = {
    message: message || `Hoxera backup (${new Date().toISOString()})`,
    content: buffer.toString('base64'),
    ...(sha ? { sha } : {}),
    ...(b ? { branch: b } : {}),
  };
  await module.exports.ghJson(contentsApiPath(name), { method: 'PUT', body: JSON.stringify(body), token });
}

// Dernier format : manifeste + morceaux compressés. Retourne un Buffer SQLite
// ou null (aucune sauvegarde de ce format, ou sauvegarde inexploitable).
async function downloadV2() {
  let manifest = null;
  try {
    const raw = await fetchRepositoryFile(MANIFEST_FILE, 64 * 1024);
    if (!raw) return null;
    manifest = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    console.log(`[Hoxera] manifeste de sauvegarde illisible (${String(e.message || e).slice(0, 80)}), repli sur l’ancien format`);
    return null;
  }
  if (!manifest || manifest.v !== BACKUP_FORMAT || !Array.isArray(manifest.parts) || manifest.parts.length === 0) return null;
  if (manifest.parts.length > MAX_PARTS) return null;
  const totalSize = Number(manifest.total);
  if (!Number.isFinite(totalSize) || totalSize <= 0 || totalSize > MAX_RESTORE_BYTES) return null;

  const pieces = [];
  for (let i = 0; i < manifest.parts.length; i++) {
    const part = manifest.parts[i] || {};
    const name = typeof part.name === 'string' && part.name ? part.name : partName(i);
    if (!name.startsWith(PART_PREFIX) || !name.endsWith(PART_SUFFIX)) return null;
    const buf = await fetchRepositoryFile(name, PART_BYTES + 4096);
    if (!buf || !buf.length) {
      console.log(`[Hoxera] morceau de sauvegarde manquant (${name}), repli sur l’ancien format`);
      return null;
    }
    if (part.sha256 && sha256(buf) !== part.sha256) {
      console.log(`[Hoxera] morceau de sauvegarde corrompu (${name}), repli sur l’ancien format`);
      return null;
    }
    pieces.push(buf);
  }
  const compressed = Buffer.concat(pieces);
  if (compressed.length !== totalSize) {
    console.log('[Hoxera] sauvegarde incomplète (taille inattendue), repli sur l’ancien format');
    return null;
  }
  if (manifest.sha256 && sha256(compressed) !== manifest.sha256) {
    console.log('[Hoxera] sauvegarde corrompue (empreinte différente), repli sur l’ancien format');
    return null;
  }
  let buf;
  try {
    buf = await gunzipAsync(compressed, { maxOutputLength: MAX_RESTORE_BYTES });
  } catch (e) {
    console.log(`[Hoxera] sauvegarde non décompressable (${String(e.message || e).slice(0, 80)}), repli sur l’ancien format`);
    return null;
  }
  if (!buf || !buf.length) return null;
  if (manifest.dbSha256 && sha256(buf) !== manifest.dbSha256) {
    console.log('[Hoxera] base restaurée non conforme à l’empreinte, repli sur l’ancien format');
    return null;
  }
  if (!isValidSqlite(buf)) {
    console.log('[Hoxera] sauvegarde décompressée invalide, repli sur l’ancien format');
    return null;
  }
  return buf;
}

// Télécharge la sauvegarde distante. Retourne un Buffer ou null.
// v379 — format 2 (compressé + morceaux) d'abord, ancien format en repli.
async function download() {
  if (!enabled()) return null;
  const recent = await downloadV2();
  if (recent && recent.length) return recent;
  return downloadLegacy();
}

// Ancien format : un seul fichier `botdev.db` brut.
async function downloadLegacy() {
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

async function getFileSha(name) {
  try {
    const meta = await module.exports.ghJson(contentsApiPath(name), { token: process.env.BOTDEV_GH_TOKEN });
    return meta && typeof meta.sha === 'string' ? meta.sha : null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

// Écrit un fichier avec 3 tentatives : le SHA peut changer entre la lecture
// et l'écriture si deux sauvegardes se croisent.
async function putFileWithRetry(name, buffer, message) {
  let sha = await getFileSha(name);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await putRepositoryFile(name, buffer, sha, message);
      return true;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      sha = await getFileSha(name);
    }
  }
  return false;
}

async function performUpload(db) {
  if (!enabled()) return false;

  // Un seul instantané pour toute la sauvegarde : les morceaux doivent venir
  // exactement de la même image de la base.
  const buf = await snapshot(db);
  const bufSize = buf.length;

  // Ne jamais remplacer une sauvegarde valide par une base vide/fraîche.
  let botCount = 0;
  let guildCfgCount = 0;
  try { botCount = Number(db.prepare('SELECT COUNT(*) AS n FROM bots').get().n) || 0; } catch {}
  try { guildCfgCount = Number(db.prepare('SELECT COUNT(*) AS n FROM guild_settings').get().n) || 0; } catch {}
  if (botCount === 0 || guildCfgCount === 0) {
    const existing = await getFileSha(MANIFEST_FILE).catch(() => null);
    const legacyExisting = existing ? null : await getFileSha(FILE).catch(() => null);
    if (existing || legacyExisting) {
      console.warn('[Hoxera] sauvegarde annulée : base fraîche/vide, la copie distante existante est préservée.');
      return false;
    }
  }

  // Nombre de morceaux de la sauvegarde précédente : sert à supprimer
  // exactement ceux qui ne servent plus, sans balayer les 64 possibles.
  let previousParts = 0;
  try {
    const precedent = await fetchRepositoryFile(MANIFEST_FILE, 64 * 1024);
    if (precedent) {
      const m = JSON.parse(precedent.toString('utf8'));
      if (m && Array.isArray(m.parts)) previousParts = Math.min(m.parts.length, MAX_PARTS);
    }
  } catch { previousParts = 0; }

  // ---------- 1. Format 2 : compression puis découpage ----------
  let v2Ok = false;
  try {
    const compressed = await gzipAsync(buf, { level: 9 });
    const parts = splitBuffer(compressed, PART_BYTES);
    const stamp = new Date().toISOString();
    // Les morceaux d'abord…
    for (let i = 0; i < parts.length; i++) {
      await putFileWithRetry(partName(i), parts[i], `Hoxera backup — morceau ${i + 1}/${parts.length} (${stamp})`);
    }
    // …le manifeste en DERNIER : il ne peut donc jamais désigner un morceau
    // qui n'existe pas encore.
    const manifest = {
      v: BACKUP_FORMAT,
      format: 'gzip',
      ts: stamp,
      parts: parts.map((piece, i) => ({ name: partName(i), size: piece.length, sha256: sha256(piece) })),
      total: compressed.length,
      sha256: sha256(compressed),
      dbSize: bufSize,
      dbSha256: sha256(buf),
      bots: botCount,
      guilds: guildCfgCount,
    };
    await putFileWithRetry(MANIFEST_FILE, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), 'Hoxera backup — manifeste');
    v2Ok = true;
    console.log(`[Hoxera] sauvegarde envoyée : ${bufSize} octets → ${compressed.length} octets compressés en ${parts.length} morceau(x)`);
    // Le manifeste est écrit : les morceaux au-delà ne servent plus à rien.
    // On ne balaie que l'intervalle de la sauvegarde précédente (économie
    // d'appels à l'API GitHub, qui est limitée à 5000 par heure).
    await removeStaleParts(parts.length, Math.max(parts.length, previousParts));
  } catch (error) {
    console.warn(`[Hoxera] sauvegarde compressée impossible (${String(error.message || error).slice(0, 120)})`);
  }

  // ---------- 2. Ancien format, tant qu'il reste possible ----------
  // Il sert de filet : un déploiement antérieur (qui ignore le format 2) sait
  // encore restaurer les données si on doit revenir en arrière.
  let legacyOk = false;
  if (bufSize <= MAX_BACKUP_BYTES) {
    try {
      const legacySha = await getFileSha(FILE);
      await putRepositoryFile(FILE, buf, legacySha, `Hoxera backup (${new Date().toISOString()})`);
      legacyOk = true;
    } catch (error) {
      if (!v2Ok) console.warn(`[Hoxera] sauvegarde échouée (${String(error.message || error).slice(0, 120)})`);
    }
  } else if (v2Ok) {
    console.log(`[Hoxera] base de ${bufSize} octets : au-delà de la limite d’un fichier, seul le format 2 est écrit.`);
  }

  if (!v2Ok && !legacyOk && bufSize > MAX_BACKUP_BYTES) {
    console.error(`[Hoxera] sauvegarde impossible : base ${bufSize} octets, aucun format n’a abouti.`);
    return false;
  }
  return v2Ok || legacyOk;
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

module.exports = {
  enabled, repo, branch, download, restore, upload, ghJson, snapshot,
  getLastRestoreInfo: () => lastRestoreInfo,
  startRestoreRetries, stopRestoreRetries, _retryRestoreOnce: retryRestoreOnce,
  countBotsIn, MAX_BACKUP_BYTES, RESTORE_RETRY_INTERVAL_MS,
  // v379 — format 2 : exposé pour les tests et pour /api/health/bot.
  BACKUP_FORMAT, PART_BYTES, MAX_PARTS, MANIFEST_FILE, PART_PREFIX, PART_SUFFIX,
  downloadV2, downloadLegacy, sha256, partName, splitBuffer,
};
