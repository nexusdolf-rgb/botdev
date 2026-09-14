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
// 🛟 Taille max de la sauvegarde : sous la limite de 1 Mo de l'API GitHub
// (les fichiers plus gros ne sont plus lisibles via l'API standard).
const MAX_BACKUP_BYTES = 900 * 1024;
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

// 🛟 v302 — Validation d'une sauvegarde téléchargée : SQLite lisible ET au
// moins un bot dedans (une base sans bot est le symptôme exact de la base
// fraîche qu'il ne faut JAMAIS restaurer ni ré-écrire par-dessus la bonne).
function countBotsIn(buf) {
  const tmp = paths.dbPath + '.incoming';
  try {
    fs.writeFileSync(tmp, buf);
    const Database = require('better-sqlite3');
    const check = new Database(tmp, { readonly: true });
    const n = check.prepare('SELECT COUNT(*) AS n FROM bots').get().n || 0;
    check.close();
    return n;
  } catch { return 0; }
  finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
}

// Télécharge la sauvegarde distante. Retourne un Buffer ou null.
// (L'API GitHub peut mettre 1-2 s à propager un fichier fraîchement écrit :
// on retente donc quelques fois en cas de 404.)
async function download() {
  if (!enabled()) return null;
  const token = process.env.BOTDEV_GH_TOKEN;
  const r = repo();
  const b = branch();
  const apiUrl = `/repos/${r}/contents/${FILE}${b ? `?ref=${encodeURIComponent(b)}` : ''}`;
  let meta = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      meta = await module.exports.ghJson(apiUrl, { token });
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
  // 1) Contenu base64 (fichiers ≤ 1 Mo). ⚠️ Pour les fichiers > 1 Mo, l'API
  //    renvoie content = "" (chaîne vide !) → on ne décode QUE si non vide.
  if (meta && typeof meta.content === 'string' && meta.content.length > 0) {
    buf = Buffer.from(meta.content.replace(/\s/g, ''), 'base64');
  }
  // 2) Téléchargement brut via download_url (fichiers > 1 Mo)
  if ((!buf || buf.length === 0) && meta && meta.download_url) {
    try {
      const res = await fetch(meta.download_url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } catch {}
  }
  // 3) Dernier recours : brut via l'API avec Accept: raw
  if ((!buf || buf.length === 0) && meta && meta.sha) {
    try {
      const raw = await fetch(`${GITHUB_API}${apiUrl}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw' },
      });
      if (raw.ok) buf = Buffer.from(await raw.arrayBuffer());
    } catch {}
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
    const n = countBotsIn(buf);
    if (!(n > 0)) {
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

  // 🛟 GARDE-FOU TAILLE : la base ne doit JAMAIS repasser au-dessus de la
  // limite de 1 Mo de l'API GitHub (c'est exactement ce qui a déclenché la
  // panne). Au-delà, on refuse de sauvegarder et on journalise.
  const bufSize = buf.length;
  if (bufSize > MAX_BACKUP_BYTES) {
    console.error(`🛟 Sauvegarde ANNULÉE : la base fait ${bufSize} octets (max ${MAX_BACKUP_BYTES}). Vérifie ce qui la fait grossir !`);
    return false;
  }

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
  // 🛟 v302 — GARDE-FOU « BASE FRAÎCHE » : une instance qui vient de démarrer
  // sans réussir sa restauration (token GitHub mort, panne réseau…) se
  // retrouve avec 1 bot provisionné mais AUCUN réglage de serveur. Si elle
  // poussait sa base, la sauvegarde distante (qui contient tout le travail :
  // réglages, tickets, transcriptions…) serait écrasée par 4 Ko vides.
  // Une vraie base en service a toujours au moins un réglage de serveur.
  let guildCfgCount = 0;
  try { guildCfgCount = db.prepare('SELECT COUNT(*) AS n FROM guild_settings').get().n || 0; } catch {}
  if (guildCfgCount === 0 && sha) {
    console.log('🛟 Sauvegarde ANNULÉE : la base locale n\'a aucun réglage de serveur (instance fraîche / restauration ratée ?) — la bonne sauvegarde distante est préservée.');
    return false;
  }
  const body = {
    message: `💾 botdev.db (${new Date().toISOString()})`,
    content: buf.toString('base64'),
    ...(sha ? { sha } : {}),
    ...(b ? { branch: b } : {}),
  };
  // 🔁 3 tentatives en cas d'erreur réseau passagère
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await module.exports.ghJson(`/repos/${r}/contents/${FILE}`, { method: 'PUT', body: JSON.stringify(body), token });
      console.log(`[BotDev] 💾 Sauvegarde envoyée (${bufSize} octets${attempt > 1 ? `, tentative ${attempt}` : ''})`);
      return true;
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`[BotDev] ⚠️ Sauvegarde échouée (${e.message}) — nouvelle tentative…`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
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
}

function stopRestoreRetries() {
  if (restoreRetryTimer) { clearInterval(restoreRetryTimer); restoreRetryTimer = null; }
}

module.exports = { enabled, repo, branch, download, restore, upload, ghJson, snapshot, getLastRestoreInfo: () => lastRestoreInfo, startRestoreRetries, stopRestoreRetries, _retryRestoreOnce: retryRestoreOnce, countBotsIn, MAX_BACKUP_BYTES, RESTORE_RETRY_INTERVAL_MS };
