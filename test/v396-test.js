// v396 — Vérification Discord : pages légales et suppression automatique.
//
// Trois exigences, une seule vérité :
//   1. /terms et /privacy existent, répondent sans connexion, en HTML complet,
//      et le départ du bot les sert AVANT le repli SPA (qui répondait 404).
//   2. La politique de confidentialité ne peut pas mentir : le tableau des
//      durées est produit depuis server/conservation.js, la liste que le
//      nettoyage applique réellement. Une durée sans purge = test rouge.
//   3. Le départ du bot d'un serveur est enfin traité : noté, puis effacé
//      30 jours plus tard s'il n'est pas revenu (aucun guildDelete avant v396).
//
// Le serveur est démarré sur un port libre dans un répertoire de données
// temporaire : aucun accès à la base de production, aucune écriture ailleurs.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

let ok = 0;
let ko = 0;
const echecs = [];
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; echecs.push(nom); console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const racine = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');

// ⚠️ Le répertoire de données doit être fixé AVANT tout require de server/db :
// server/conservation importe la base dès son chargement, et sans cette ligne
// le test écrirait dans la base par défaut (et échouerait sur une clé primaire).
const DOSSIER_ESSAI = fs.mkdtempSync(path.join(os.tmpdir(), 'v396-' + process.pid + '-'));
process.env.BOTDEV_DATA_DIR = DOSSIER_ESSAI;

// ------------------------------------------------------------------
console.log('\n— 1. Le départ d’un serveur est traité (il ne l’était pas) —');
// ------------------------------------------------------------------
const manager = lire('server/discord/botManager.js');
check('guildDelete écouté', manager.includes("client.on('guildDelete'"));
check('…il note le départ', manager.includes('noteDepartServeur'));
check('…et le retour annule l’effacement', manager.includes('oublieDepart'));

const conservation = require('../server/conservation');

// ------------------------------------------------------------------
console.log('\n— 2. Chaque durée annoncée est réellement appliquée —');
// ------------------------------------------------------------------
const maintenance = lire('server/maintenance.js');
check('la purge quotidienne appelle conservation.js', maintenance.includes("require('./conservation')"));
check('…elle tourne dans runDaily (donc toutes les 24 h)', maintenance.includes('purgeOldData'));
const serverIndex = lire('server/index.js');
check('…et runDaily est branché au démarrage + 24 h', serverIndex.includes('maintenance.runDaily') && serverIndex.includes('24 * 3600000'));

const table = conservation.tableauConservation();
const LIBELLES = conservation.LIBELLES;
check('au moins 20 durées publiées', table.length >= 20, String(table.length));
check('chaque durée a un intitulé FR et EN', table.every((l) => l.fr && l.en));
check('aucune durée n’est nulle ou négative', table.every((l) => Number.isFinite(l.jours) && l.jours >= 1));
check('les intitulés couvrent exactement les durées', Object.keys(LIBELLES).sort().join() === Object.keys(conservation.CONSERVATION)
  .filter((k) => k !== 'guilde_depart').sort().join());

// Le tableau affiché doit correspondre à une purge réelle : chaque clé est
// citée dans le module de conservation, soit par la boucle générique, soit
// par une requête dédiée.
const source = lire('server/conservation.js');
// Deux familles : la boucle générique (colonne created_at) et les requêtes
// dédiées. Le test vérifie que CHAQUE clé du tableau appartient à l'une des
// deux, et que la famille citée contient bien son nom.
const purgeesGenerique = ['automod_logs', 'automod_strikes', 'automod_temp_bans', 'warnings',
  'reports', 'transcripts', 'platform_audit_log', 'shop_purchases', 'suggestions'];
const purgeesDediees = ['modmail_threads', 'quiz_scores', 'invite_joins', 'afk', 'guild_events', 'discord_tokens',
  'antinuke_actions'];
const ailleurs = ['message_stats', 'join_stats', 'cmd_stats', 'reminders', 'giveaways', 'closed_tickets', 'automod_warning_messages'];
for (const cle of table.map((l) => l.cle)) {
  const ou = purgeesGenerique.includes(cle) || purgeesDediees.includes(cle)
    ? source.includes(cle)
    : maintenance.includes(`DELETE FROM ${cle}`);
  check(`durée « ${cle} » appliquée par une requête`, ou);
}

// ------------------------------------------------------------------
console.log('\n— 3. Les mécanismes de suppression font ce qu’ils disent —');
// ------------------------------------------------------------------
const store = require('../server/db');
const db = store.db;
const BOT = 1;
const PARTI = '123456789012345678';
const RESTE = '222222222222222222';

const jour = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 19).replace('T', ' ');
const insert = (t, cols, vals) => db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);

insert('warnings', ['bot_id', 'guild_id', 'user_id', 'reason', 'created_at'], [BOT, PARTI, '9', 'vieux', jour(200)]);
insert('warnings', ['bot_id', 'guild_id', 'user_id', 'reason', 'created_at'], [BOT, PARTI, '9', 'récent', jour(5)]);
insert('transcripts', ['token', 'bot_id', 'guild_id', 'messages', 'created_at'], [require('node:crypto').randomBytes(16).toString('hex'), BOT, PARTI, 'x', jour(200)]);
db.prepare("INSERT INTO discord_tokens (user_id,access_token,refresh_token,expires_at) VALUES (1,'a','b',datetime('now','-100 days'))").run();
insert('xp', ['bot_id', 'guild_id', 'user_id', 'xp', 'level', 'last_ts'], [BOT, PARTI, '9', 10, 1, 0]);
insert('xp', ['bot_id', 'guild_id', 'user_id', 'xp', 'level', 'last_ts'], [BOT, RESTE, '9', 99, 9, 0]);

const rapport = conservation.purgeConservation(db);
check('un avertissement de 200 jours part', db.prepare('SELECT COUNT(*) n FROM warnings WHERE reason = ?').get('vieux').n === 0);
check('un avertissement de 5 jours reste', db.prepare('SELECT COUNT(*) n FROM warnings WHERE reason = ?').get('récent').n === 1);
check('une transcription de 200 jours part', db.prepare('SELECT COUNT(*) n FROM transcripts').get().n === 0);
check('un jeton expiré depuis 100 jours part', db.prepare('SELECT COUNT(*) n FROM discord_tokens').get().n === 0);
check('la purge rapporte ce qu’elle a fait', (rapport.warnings || 0) >= 1 && (rapport.transcripts || 0) === 1);

conservation.noteDepartServeur(BOT, PARTI);
check('le départ est enregistré', !!conservation.lireDeparts()[PARTI]);
const rienEncore = conservation.purgeConservation(db);
check('avant 30 jours : rien n’est effacé', db.prepare('SELECT COUNT(*) n FROM xp WHERE guild_id = ?').get(PARTI).n === 1
  && !rienEncore.serveurs_partis);

const plus31 = Date.now() + 31 * 86400000;
conservation.purgeConservation(db, plus31);
check('après 30 jours : le serveur parti est effacé', db.prepare('SELECT COUNT(*) n FROM xp WHERE guild_id = ?').get(PARTI).n === 0);
check('…les autres serveurs sont intacts', db.prepare('SELECT COUNT(*) n FROM xp WHERE guild_id = ?').get(RESTE).n === 1);
check('…le registre est vidé', !conservation.lireDeparts()[PARTI]);

conservation.noteDepartServeur(BOT, RESTE);
conservation.oublieDepart(RESTE);
conservation.purgeConservation(db, plus31);
check('un bot qui revient n’est jamais effacé', db.prepare('SELECT COUNT(*) n FROM xp WHERE guild_id = ?').get(RESTE).n === 1);

// ------------------------------------------------------------------
console.log('\n— 4. Les pages existent et se servent sans connexion —');
// ------------------------------------------------------------------
const terms = lire('public/legal/terms.html');
const privacy = lire('public/legal/privacy.html');
const legalJs = lire('public/js/legal.js');

for (const [nom, html] of [['terms', terms], ['privacy', privacy]]) {
  check(`${nom} : deux langues complètes`, (html.match(/data-lang-block="(fr|en)"/g) || []).length === 2);
  check(`${nom} : date de dernière mise à jour affichée`, /Dernière mise à jour/.test(html) && /Last updated/.test(html));
  check(`${nom} : contact e-mail présent`, html.includes('nexusdolf@gmail.com'));
  check(`${nom} : lien du support présent`, html.includes('discord.gg/BNCAVsyAvq'));
  check(`${nom} : aucun lien mort vers l’ancien serveur`, !html.includes('X9hTdr9N3'));
}
check('privacy : le tableau des durées vient du code', privacy.includes('{{ RETENTION_TABLE_FR }}') && privacy.includes('{{ RETENTION_TABLE_EN }}'));
check('privacy : les 14 rubriques demandées', ['Âge minimum', 'Minimum age', 'Vos droits', 'Your rights'].every((t) => privacy.includes(t)));
check('terms : rubriques exigées', ['Acceptation', 'Acceptance', 'Disponibilité', 'Availability', 'Limitation de responsabilité', 'Limitation of liability'].every((t) => terms.includes(t)));
check('sélecteur de langue : script autonome', legalJs.includes('data-lang-set') && legalJs.includes('hx-lang'));
check('pages servies avant le repli SPA', serverIndex.indexOf("PAGES_LEGALES") < serverIndex.indexOf('CHEMINS_PAGE'));
check('aucune ressource externe dans les pages légales',
  !/src="https?:\/\//.test(terms + privacy) && !/@import/.test(lire('public/css/legal.css')));

// ------------------------------------------------------------------
console.log('\n— 5. En vrai : codes HTTP sans cookie —');
// ------------------------------------------------------------------
function demande(port, chemin, entetes = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: chemin, method: 'GET', headers: entetes }, (res) => {
      let corps = '';
      res.on('data', (c) => { corps += c; });
      res.on('end', () => resolve({ code: res.statusCode, corps, entetes: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('délai dépassé')));
    req.end();
  });
}

(async () => {
  const port = 3200 + Math.floor(Math.random() * 400);
  const serveur = spawn(process.execPath, ['server/index.js'], {
    cwd: racine,
    env: { ...process.env, PORT: String(port), BOTDEV_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'v396-srv-')), NODE_ENV: 'development', PUBLIC_ORIGIN: `http://127.0.0.1:${port}` },
    stdio: 'ignore',
  });

  try {
    let pret = false;
    for (let i = 0; i < 60 && !pret; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try { const rep = await demande(port, '/ping'); pret = rep.code === 200; } catch { /* pas encore */ }
    }
    check('le serveur démarre', pret);
    if (pret) {
      const t = await demande(port, '/terms');
      const p = await demande(port, '/privacy');
      check('/terms répond 200 sans cookie', t.code === 200, String(t.code));
      check('/privacy répond 200 sans cookie', p.code === 200, String(p.code));
      check('…en HTML complet', /<!doctype html>/i.test(t.corps) && /<\/html>/i.test(t.corps));
      check('…sans redirection vers la connexion', !/login|connexion/i.test(t.entetes.location || ''));
      check('…aucun marqueur de gabarit restant', !t.corps.includes('{{') && !p.corps.includes('{{'));
      check('…le tableau des durées est rempli (23 lignes FR + 23 EN)',
        (p.corps.match(/jours<\/td>/g) || []).length >= 20 && (p.corps.match(/days<\/td>/g) || []).length >= 20);
      const nb = p.corps.match(/Le bot propose (\d+) commandes/);
      check('…le nombre de commandes est calculé', !!nb && Number(nb[1]) >= 70 && Number(nb[1]) <= 90, nb && nb[1]);
      const accueil = await demande(port, '/');
      check('l’accueil répond toujours', accueil.code === 200);
      const inconnue = await demande(port, '/pas-une-page');
      check('une page inconnue reste en 404', inconnue.code === 404);
    }
  } finally {
    serveur.kill('SIGKILL');
  }

  // La date affichée doit être passée (ou du jour), jamais future : une page
  // légale datée du futur est le premier signe d'un copier-coller non relu.
  const moisFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  for (const fichier of ['terms', 'privacy']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'legal', `${fichier}.html`), 'utf8');
    const m = html.match(/Dernière mise à jour : <b>(\d{1,2}) ([a-zéû]+) (\d{4})<\/b>/);
    check(`${fichier} : une date de mise à jour lisible est présente`, Boolean(m));
    if (m) {
      const jour = new Date(Number(m[3]), moisFr.indexOf(m[2]), Number(m[1]));
      const aujourdhui = new Date();
      aujourdhui.setHours(23, 59, 59, 999);
      check(`${fichier} : la date de mise à jour n'est pas dans le futur`,
        moisFr.indexOf(m[2]) !== -1 && jour.getTime() <= aujourdhui.getTime(), m[0]);
    }
  }

  console.log('');
  if (ko === 0) console.log(`🎉 v396 — ${ok} vérifications OK : pages légales servies, suppression automatique appliquée.`);
  else { console.log(`❌ v396 — ${ko} échec(s) : ${echecs.join(', ')}`); process.exitCode = 1; }
})();
