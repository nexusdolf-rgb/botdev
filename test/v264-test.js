// v264 — Compteurs en salons vocaux (pack classique choisi par le maître) :
//   👥 Membres · 🟢 En ligne · 🚀 Boosts
// Une catégorie verrouillée « 📊 Statistiques du serveur » contient trois
// salons vocaux impossibles à rejoindre dont le NOM est la statistique.
// Mise à jour automatique : renommage UNIQUEMENT si le chiffre change et
// jamais plus de ~2 fois par 10 min (limite Discord).
//
// Vérifié ici : format des noms, lecture des stats, décision de renommage,
// création verrouillée (setup), balayage qui ne renomme pas pour rien,
// commande /statchannels enregistrée, câblage du balayage périodique.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v264test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const { PermissionFlagsBits } = require('discord.js');
const store = require('../server/db');
const sc = require('../server/discord/statChannels');
const premade = require('../server/discord/premade');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

// Faux salon vocal : espionne setName.
const mkVoice = (id, name) => {
  const ch = { id, name, type: 2, isTextBased: () => false, renames: [] };
  ch.setName = async (n) => { ch.renames.push(n); ch.name = n; return ch; };
  ch.delete = async () => { ch.deleted = true; };
  return ch;
};

const mkGuild = (id, stats, channels) => ({
  id,
  name: 'Serveur test',
  memberCount: stats.members,
  premiumSubscriptionCount: stats.boosts,
  presences: { cache: new Map([
    ['a', { status: 'online' }], ['b', { status: 'idle' }], ['c', { status: 'offline' }],
  ]) },
  roles: { everyone: { id: 'everyone' } },
  channels: {
    cache: new Map(channels.map((c) => [c.id, c])),
    create: async (opts) => {
      const ch = mkVoice('new-' + opts.name, opts.name);
      ch.createdWith = opts;
      channels.push(ch);
      return ch;
    },
  },
});

(async () => {
  console.log('— 1. Noms des salons (format français) —');
  check('membres : « 👥 Membres : 1 234 »', sc.statName('members', 1234) === '👥 Membres : 1 234', sc.statName('members', 1234));
  check('en ligne : « 🟢 En ligne : 456 »', sc.statName('online', 456) === '🟢 En ligne : 456');
  check('boosts : « 🚀 Boosts : 14 »', sc.statName('boosts', 14) === '🚀 Boosts : 14');

  console.log('— 2. Lecture des statistiques —');
  const guild0 = mkGuild('g0', { members: 1234, boosts: 14 }, []);
  const stats = sc.computeStats(guild0);
  check('membres = memberCount, boosts = premiumSubscriptionCount', stats.members === 1234 && stats.boosts === 14);
  check('en ligne = présences non offline (2 sur 3)', stats.online === 2, String(stats.online));

  console.log('— 3. Décision de renommage (limite Discord respectée) —');
  check('même chiffre : jamais de renommage', sc.shouldRename(100, 100, 0, Date.now()) === false);
  check('chiffre changé, jamais renommé : on renomme', sc.shouldRename(100, 101, 0, Date.now()) === true);
  check('chiffre changé mais renommé il y a 1 min : on attend', sc.shouldRename(100, 101, Date.now() - 60000, Date.now()) === false);
  check('chiffre changé et 11 min passées : on renomme', sc.shouldRename(100, 101, Date.now() - 11 * 60000, Date.now()) === true);

  console.log('— 4. Activation : catégorie + 3 salons verrouillés —');
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const channels = [];
  const guild = mkGuild('g1', { members: 100, boosts: 2 }, channels);
  const done = await sc.setupGuild(botId, guild);
  check('catégorie + 3 salons créés', channels.length === 4 && !!done.category);
  const cat = channels[0];
  check('catégorie : connexion interdite à @everyone, vue autorisée',
    String(cat.createdWith.permissionOverwrites[0].deny[0]) === String(PermissionFlagsBits.Connect)
    && String(cat.createdWith.permissionOverwrites[0].allow[0]) === String(PermissionFlagsBits.ViewChannel));
  const voix = channels[1];
  check('salons vocaux : connexion ET parole interdites',
    voix.createdWith.type === 2 && voix.createdWith.permissionOverwrites[0].deny.length === 2);
  check('noms initiaux = statistiques du jour',
    channels.slice(1).map((c) => c.name).join('|') === '👥 Membres : 100|🟢 En ligne : 2|🚀 Boosts : 2');
  guild.channels.cache = new Map(channels.map((c) => [c.id, c]));
  const gs = store.guildSettings.get(botId, 'g1') || {};
  check('IDs enregistrés en base (stat_ids)', !!gs.stat_ids && Object.keys(JSON.parse(gs.stat_ids)).length === 3);

  console.log('— 5. Balayage : ne renomme pas pour rien —');
  const botManager = { clients: new Map([[botId, { client: { isReady: () => true, guilds: { cache: new Map([['g1', guild]]) } } }]]) };
  await sc.sweep(botManager);
  check('rien ne change : aucun renommage', channels.slice(1).every((c) => c.renames.length === 0));

  console.log('— 6. Balayage : renomme quand le chiffre a changé —');
  const ch2 = [mkVoice('s-m', '👥 Membres : 500'), mkVoice('s-o', '🟢 En ligne : 50'), mkVoice('s-b', '🚀 Boosts : 50')];
  store.guildSettings.set(botId, 'g2', {
    stat_category: 'cat2',
    stat_ids: JSON.stringify({ members: 's-m', online: 's-o', boosts: 's-b' }),
  });
  const guild2 = mkGuild('g2', { members: 501, boosts: 50 }, ch2);
  const bm2 = { clients: new Map([[botId, { client: { isReady: () => true, guilds: { cache: new Map([['g2', guild2]]) } } }]]) };
  await sc.sweep(bm2);
  check('membres 500 → 501 : renommé une fois', ch2[0].renames.length === 1 && ch2[0].name === '👥 Membres : 501');
  check('boosts inchangés : pas touché', ch2[2].renames.length === 0);
  const avant = ch2.map((c) => c.renames.length).join(',');
  await sc.sweep(bm2);
  check('deuxième balayage : plus aucun renommage (noms déjà corrects)',
    ch2.map((c) => c.renames.length).join(',') === avant, `${avant} → ${ch2.map((c) => c.renames.length).join(',')}`);

  console.log('— 7. Commande et câblage —');
  store.modules.set(botId, 'stats', true);
  const payloads = premade.buildSlashPayloads(botId);
  const cmd = payloads.find((p) => p.name === 'statchannels');
  check('/statchannels enregistré avec le choix setup/off/view',
    !!cmd && JSON.stringify(cmd.options).includes('setup') && JSON.stringify(cmd.options).includes('off'));
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server/discord/premade.js'), 'utf8');
  check('exécution de la commande câblée', src.includes("case 'statchannels'"));
  check('commande réservée aux administrateurs', premade.ADMIN_COMMAND_NAMES.has('statchannels'));
  const idx = fs.readFileSync(require('path').join(__dirname, '..', 'server/index.js'), 'utf8');
  check('balayage périodique toutes les 2 minutes', idx.includes('runStatSweep') && idx.includes('120000'));

  console.log('— 8. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=289 référencé 7 fois', (index.match(/\?v=289/g) || []).length === 7,
    String((index.match(/\?v=289/g) || []).length));
  check('sw.js : cache « botdev-v289 »', sw.includes("const CACHE = 'botdev-v289';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v264 — ${ok} vérifications OK : les compteurs vivent dans tes salons vocaux.`);
  else { console.log(`❌ v264 — ${ko} échec(s)`); process.exitCode = 1; }
})();
