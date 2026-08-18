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
const fs = require('fs');
const paths = require('./paths');

const GITHUB_API = process.env.BOTDEV_GITHUB_API || 'https://api.github.com';
const FILE = 'botdev.db';

function enabled() {
  return !!(process.env.BOTDEV_GH_TOKEN && process.env.BOTDEV_DATA_REPO);
}

function repo() {
  return process.env.BOTDEV_DATA_REPO || '';
}

function branch() {
  return process.env.BOTDEV_DATA_BRANCH || '';
}

async function ghJson(route, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${GITHUB_API}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const msg = json && json.message ? json.message : `HTTP ${res.status}`;
    const err = new Error(`GitHub ${route} : ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function isValidSqlite(buf) {
  return buf && buf.length >= 16 && buf.subarray(0, 16).toString('utf8') === 'SQLite format 3\u0000';
}

// Télécharge la sauvegarde distante. Retourne un Buffer ou null.
// (L'API GitHub peut mettre 1-2 s à propager un fichier fraîchement écrit :
// on retente donc quelques fois en cas de 404.)
async function download() {
  if (!enabled()) return null;
  const token = process.env.BOTDEV_GH_TOKEN;
  const r = repo();
  const b = branch();
  let meta = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      meta = await module.exports.ghJson(`/repos/${r}/contents/${FILE}${b ? `?ref=${encodeURIComponent(b)}` : ''}`, { token });
      break;
    } catch (e) {
      if (e.status === 404 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (e.status === 404) return null; // pas encore de sauvegarde
      throw e;
    }
  }
  let buf = null;
  if (meta && typeof meta.content === 'string') {
    buf = Buffer.from(meta.content.replace(/\s/g, ''), 'base64');
  } else if (meta && meta.download_url) {
    const res = await fetch(meta.download_url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`download ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  if (!buf || buf.length === 0) return null;
  if (!isValidSqlite(buf)) {
    console.log('[BotDev] ⚠️ Sauvegarde distante invalide, ignorée');
    return null;
  }
  return buf;
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
    let valid = false;
    let n = 0;
    try {
      const Database = require('better-sqlite3');
      const tmp = paths.dbPath + '.incoming';
      fs.writeFileSync(tmp, buf);
      const check = new Database(tmp, { readonly: true });
      n = check.prepare('SELECT COUNT(*) AS n FROM bots').get().n || 0;
      check.close();
      fs.rmSync(tmp, { force: true });
      valid = n > 0;
    } catch (e) {
      lastRestoreInfo = 'validation impossible: ' + String(e.message || e).slice(0, 80);
      valid = false;
    }
    if (!valid) {
      if (!lastRestoreInfo.startsWith('validation')) lastRestoreInfo = 'sauvegarde distante SANS bot — ignoree (taille ' + buf.length + ')';
      console.log('🛟 Sauvegarde distante SANS bot — ignorée. (taille reçue : ' + buf.length + ' octets)');
      return false;
    }
    fs.writeFileSync(paths.dbPath, buf);
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

// Envoie la sauvegarde sur GitHub.
async function upload(db) {
  if (!enabled()) return false;
  const token = process.env.BOTDEV_GH_TOKEN;
  const r = repo();
  const b = branch();
  const buf = await snapshot(db);
  let sha = null;
  try {
    const meta = await module.exports.ghJson(`/repos/${r}/contents/${FILE}${b ? `?ref=${encodeURIComponent(b)}` : ''}`, { token });
    sha = meta && meta.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  // 🛟 GARDE-FOU ANTI-CATASTROPHE : ne JAMAIS écraser la bonne sauvegarde
  // distante par une base vide/fraîche (bot absent). C'est exactement ce qui
  // a détruit les données : une instance sans données a sauvegardé sa base
  // vide par-dessus la bonne.
  let botCount = 0;
  try { botCount = db.prepare('SELECT COUNT(*) AS n FROM bots').get().n || 0; } catch {}
  if (botCount === 0 && sha) {
    console.log('🛟 Sauvegarde ANNULÉE : la base locale n\'a aucun bot (base vide ?) — la bonne sauvegarde distante est préservée.');
    return false;
  }
  const body = {
    message: `💾 botdev.db (${new Date().toISOString()})`,
    content: buf.toString('base64'),
    ...(sha ? { sha } : {}),
    ...(b ? { branch: b } : {}),
  };
  await module.exports.ghJson(`/repos/${r}/contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body), token });
  console.log(`[BotDev] 💾 Sauvegarde envoyée (${buf.length} octets)`);
  return true;
}

module.exports = { enabled, repo, branch, download, restore, upload, ghJson, getLastRestoreInfo: () => lastRestoreInfo };
