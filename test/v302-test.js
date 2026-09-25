// v302 — Incident du 14/09 : token GitHub de sauvegarde révoqué → la
// restauration au boot échoue (« Bad credentials ») → le service tourne sur
// une base VIDE (réglages, tickets, vérification perdus en mémoire).
// Correctifs livrés et vérifiés ici :
//  1) backup.upload : une base FRAÎCHE (aucun réglage de serveur) n'écrase
//     JAMAIS la bonne sauvegarde distante (garde-fou ajouté au garde bot=0) ;
//  2) backup.startRestoreRetries / _retryRestoreOnce : tant que la base locale
//     est fraîche, nouvelle tentative toutes les 5 min ; dès que la sauvegarde
//     distante redevient accessible ET valide, redémarrage propre ; si la base
//     locale contient des réglages, les tentatives s'arrêtent définitivement ;
//  3) verification.repairPrivateChannels : repli « sujet du salon » — un salon
//     de ticket reste réparable même si sa fiche en base a été perdue ;
//  4) premade execute/send : un échec d'envoi n'est PLUS silencieux — erreur
//     dans /api/health/bot + réponse texte de secours (plus jamais le message
//     trompeur « pas encore prête » pour un panneau refusé par Discord) ;
//  5) le garde-fou « commande sans réponse » est journalisé dans health ;
//  6) bump cache v302.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v302');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

// backup.enabled() a besoin des deux variables (valeurs fictives : tous les
// appels réseau de ce test sont neutralisés).
process.env.BOTDEV_GH_TOKEN = 'test-token';
process.env.BOTDEV_DATA_REPO = 'test/data';

const Database = require('better-sqlite3');
const store = require('../server/db');
const backup = require('../server/backup');
const ver = require('../server/discord/verification');
const health = require('../server/health');
const logging = require('../server/discord/logging');
logging.log = async () => {}; // journalisation désactivée pour le test

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function mkDb(file, { bots = 0, guildCfg = 0 } = {}) {
  const db = new Database(file);
  db.exec('CREATE TABLE IF NOT EXISTS bots (id INTEGER PRIMARY KEY, name TEXT)');
  db.exec('CREATE TABLE IF NOT EXISTS guild_settings (bot_id INTEGER, guild_id TEXT)');
  for (let i = 0; i < bots; i++) db.prepare('INSERT INTO bots (name) VALUES (?)').run('bot' + i);
  for (let i = 0; i < guildCfg; i++) db.prepare('INSERT INTO guild_settings (bot_id, guild_id) VALUES (1, ?)').run('g' + i);
  return db;
}

(async () => {
  console.log('— 1. Pins de version v302 —');
  const html = racine('public/index.html');
  check('index.html : ?v=324 ×7', (html.match(/\?v=324/g) || []).length === 7, String((html.match(/\?v=324/g) || []).length));
  check('index.html : aucun ?v=301 restant', !(html.includes('?v=301')));
  const sw = racine('public/sw.js');
  check('sw.js : cache botdev-v324', sw.includes("const CACHE = 'botdev-v324';"));

  console.log('— 2. countBotsIn : validation d\'une sauvegarde téléchargée —');
  const goodFile = path.join(TMP, 'good.db');
  mkDb(goodFile, { bots: 1 }).close();
  const goodBuf = fs.readFileSync(goodFile);
  check('sauvegarde avec 1 bot → 1', backup.countBotsIn(goodBuf) === 1);
  const emptyFile = path.join(TMP, 'empty.db');
  mkDb(emptyFile, { bots: 0 }).close();
  check('sauvegarde sans bot → 0', backup.countBotsIn(fs.readFileSync(emptyFile)) === 0);
  check('tampon invalide → 0 (jamais d\'exception)', backup.countBotsIn(Buffer.from('pas une base sqlite')) === 0);

  console.log('— 3. upload : la base fraîche n\'écrase JAMAIS la bonne sauvegarde —');
  const origGhJson = backup.ghJson;
  let putCalls = 0;
  backup.ghJson = async (route, opts = {}) => {
    if (opts.method === 'PUT') { putCalls++; return {}; }
    return { sha: 'sha-factice' }; // la sauvegarde distante existe déjà
  };
  try {
    const freshFile = path.join(TMP, 'fresh.db');
    const freshDb = mkDb(freshFile, { bots: 1, guildCfg: 0 }); // provisionnée, aucun réglage
    const res1 = await backup.upload(freshDb);
    check('base fraîche (1 bot, 0 réglages) → sauvegarde REFUSÉE', res1 === false && putCalls === 0, 'putCalls=' + putCalls);
    freshDb.prepare('INSERT INTO guild_settings (bot_id, guild_id) VALUES (1, ?)').run('vrai-serveur');
    const res2 = await backup.upload(freshDb);
    check('dès qu\'un réglage existe → la sauvegarde repart', res2 === true && putCalls === 1);
    freshDb.close();
    const noBotFile = path.join(TMP, 'nobots.db');
    const noBotDb = mkDb(noBotFile, { bots: 0, guildCfg: 3 });
    const res3 = await backup.upload(noBotDb);
    check('garde historique conservé : 0 bot → refusée aussi', res3 === false && putCalls === 1);
    noBotDb.close();
  } finally { backup.ghJson = origGhJson; }

  console.log('— 4. Restauration différée (_retryRestoreOnce) —');
  const cfgDbFile = path.join(TMP, 'cfg.db');
  const cfgDb = mkDb(cfgDbFile, { bots: 1, guildCfg: 1 });
  const r1 = await backup._retryRestoreOnce(() => cfgDb);
  check('base locale non fraîche → tentatives arrêtées, aucun redémarrage', r1 === 'stopped');
  cfgDb.close();

  const freshDbFile = path.join(TMP, 'fresh2.db');
  const freshDb2 = mkDb(freshDbFile, { bots: 1, guildCfg: 0 });
  const origDownload = backup.download;
  backup.download = async () => null; // sauvegarde encore inaccessible
  const r2 = await backup._retryRestoreOnce(() => freshDb2);
  check('base fraîche + sauvegarde inaccessible → on attend', r2 === 'wait');

  const origExit = process.exit;
  let exitCode = null;
  process.exit = (c) => { exitCode = c; };
  try {
    backup.download = async () => goodBuf; // la bonne sauvegarde est de retour
    const r3 = await backup._retryRestoreOnce(() => freshDb2);
    check('base fraîche + sauvegarde valide → redémarrage propre demandé', r3 === 'restart' && exitCode === 0);
    const freshDbFile3 = path.join(TMP, 'fresh3.db');
    const freshDb3 = mkDb(freshDbFile3, { bots: 1, guildCfg: 0 });
    backup.download = async () => fs.readFileSync(emptyFile); // sauvegarde SANS bot
    const r4 = await backup._retryRestoreOnce(() => freshDb3);
    check('sauvegarde suspecte (sans bot) → jamais de redémarrage dessus', r4 === 'wait');
    freshDb3.close();
  } finally { process.exit = origExit; backup.download = origDownload; }
  backup.stopRestoreRetries();

  console.log('— 5. Réparation des tickets : repli « sujet du salon » (base perdue) —');
  const B = 302, G = 'guilde302', ROLE = 'roleVerifie302';
  // Base volontairement SANS aucun ticket ouvert : les fiches ont été perdues
  // dans l'incident, seule la signature Discord (sujet « Ticket #… ») reste.
  check('précondition : aucun ticket ouvert en base', store.openTickets.allForGuild(B, G).length === 0);
  store.settings.set(`verification_cfg:${G}`, JSON.stringify({
    enabled: true, channel: 'salon-verif', role: ROLE, isolate: true, isolated_channels: [],
  }));
  const mkChan = (id, { topic = '', leak = false } = {}) => {
    const edits = [];
    const ch = {
      id, type: 0, name: 'c-' + id, topic, _edits: edits,
      permissionOverwrites: {
        cache: new Map(),
        edit: async (target, perms) => {
          edits.push({ target: String(target), perms });
          if (perms && perms.ViewChannel === null && ch.permissionOverwrites.cache.has(String(target))) {
            ch.permissionOverwrites.cache.set(String(target), { id: String(target), deny: { has: () => false }, allow: { has: () => false } });
          }
        },
      },
    };
    if (leak) ch.permissionOverwrites.cache.set(ROLE, { id: ROLE, deny: { has: () => false }, allow: { has: () => true } });
    return ch;
  };
  const ticketFuite = mkChan('chan-ticket', { topic: 'Ticket #7 de Quelqu\'un | 123456 | Aide', leak: true });
  const salonFuite = mkChan('chan-normal', { topic: 'Règlement du serveur', leak: true });
  const guild = {
    id: G,
    channels: { cache: new Map([[ticketFuite.id, ticketFuite], [salonFuite.id, salonFuite]]) },
  };
  const entry = { client: { guilds: { cache: new Map([[G, guild]]) } } };
  await ver.repairPrivateChannels(B, entry);
  const fixedTicket = ticketFuite._edits.some((e) => e.target === ROLE && e.perms && e.perms.ViewChannel === null);
  check('salon « Ticket #… » fuité et SANS fiche en base → re-privatisé', fixedTicket, JSON.stringify(ticketFuite._edits));
  check('salon ordinaire fuité (même signature) → JAMAIS touché', salonFuite._edits.length === 0, JSON.stringify(salonFuite._edits));

  console.log('— 6. Échec d\'envoi d\'une commande : visible + réponse de secours —');
  const premade = require('../server/discord/premade');
  const botId = store.bots.create({ user_id: 1, name: 'T302', token: 'x', client_id: 'c', prefix: '!' });
  store.modules.set(botId, 'utility', true);
  const entryPremade = { client: { user: { username: 'Testeur', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' } } };
  const mkInteraction = (replyImpl) => ({
    commandName: 'help',
    guild: null, member: null,
    user: { id: 'u1' },
    replied: false, deferred: false,
    options: { getString: () => null },
    reply: replyImpl,
  });
  let appels = [];
  const iFail = mkInteraction(async (payload) => {
    appels.push(payload);
    if (appels.length === 1) throw new Error('Invalid Form Body (simulé)');
    return {};
  });
  await premade.handlePremadeSlash(botId, entryPremade, iFail);
  check('panneau refusé → une 2e réponse texte de secours est envoyée', appels.length === 2, 'appels=' + appels.length);
  check('…la réponse de secours explique honnêtement l\'échec', appels[1] && typeof appels[1].content === 'string' && appels[1].content.includes('Impossible d\'afficher le panneau'), JSON.stringify(appels[1] || {}));
  const snap = health.snapshot();
  const visibles = (snap.errors24h && snap.errors24h.last) || [];
  const visible = visibles.some((e) => String(e.source || '').includes('envoi-commande'));
  check('l\'échec remonte dans /api/health/bot (source « envoi-commande »)', visible, JSON.stringify(snap).slice(0, 200));
  let appelsOk = 0;
  const iOk = mkInteraction(async () => { appelsOk++; return {}; });
  await premade.handlePremadeSlash(botId, entryPremade, iOk);
  check('envoi normal → une seule réponse, pas de secours parasite', appelsOk === 1);

  console.log('— 7. Garde-fou « commande sans réponse » journalisé (source) —');
  const bmSrc = racine('server/discord/botManager.js');
  const guardBlock = bmSrc.split("t('guard_not_ready')")[0].slice(-900);
  check('le garde-fou appelle health.recordError avant de répondre', guardBlock.includes("recordError('commande-sans-reponse'"));
  const premadeSrc = racine('server/discord/premade.js');
  check('send() journalise l\'échec d\'envoi', premadeSrc.includes("recordError('envoi-commande'"));
  const verSrc = racine('server/discord/verification.js');
  check('repairPrivateChannels utilise le repli « sujet »', verSrc.includes("startsWith('Ticket #')"));
  const backupSrc = racine('server/backup.js');
  check('upload refuse une base sans réglages', backupSrc.includes('SELECT COUNT(*) AS n FROM guild_settings'));
  check('la boucle différée existe et redémarre proprement', backupSrc.includes('startRestoreRetries') && backupSrc.includes('process.exit(0)'));
  const indexSrc = racine('server/index.js');
  check('index.js arme la restauration différée quand le boot a échoué', indexSrc.includes('startRestoreRetries'));

  console.log(`\n✅ v302 : ${ok} vérifications passed.`);
})().catch((e) => { console.error(e); process.exit(1); });
