// v265 — Récompenses boosters Nitro (demande du maître, « oui » pour la v265).
//
// Avant : le nombre de boosts était seulement affiché. Maintenant :
//   • nouveau boost (premiumSince apparaît) → rôle de récompense donné
//     automatiquement + message de remerciement dans le salon choisi ;
//   • fin de boost (premiumSince disparaît) → rôle retiré automatiquement ;
//   • balayage de rattrapage : une fin de boost survenue bot éteint est
//     corrigée au retour ;
//   • /boostrewards action:setup|sync|view|off (admin) pour tout régler.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v265test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const br = require('../server/discord/boostRewards');
const premade = require('../server/discord/premade');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const mkMember = (id, premiumSince, hasRole) => ({
  id,
  premiumSince,
  user: { username: 'Boosteur' },
  roles: {
    cache: { has: (rid) => rid === 'R1' && hasRole },
    added: [],
    removed: [],
    add: async function (role) { this.added.push(role.id || role); },
    remove: async function (role) { this.removed.push(role.id || role); },
  },
});

const mkGuild = (members, sent) => ({
  id: 'g1',
  name: 'Serveur test',
  roles: { cache: { get: (id) => (id === 'R1' ? { id: 'R1', name: '💜 Booster' } : null) } },
  channels: { cache: { get: (id) => (id === 'C1' ? { id: 'C1', name: 'boosts', send: async (p) => { sent.push(p); } } : null) } },
  members: { cache: new Map(members.map((m) => [m.id, m])) },
});

(async () => {
  console.log('— 1. Décision de boost (fonction pure) —');
  check('rien → date : nouveau boost', br.boostDecision(null, new Date()) === 'started');
  check('date → rien : boost terminé', br.boostDecision(new Date(), null) === 'ended');
  check('date → date : rien à faire', br.boostDecision(new Date(1), new Date(1)) === 'none');
  check('rien → rien : rien à faire', br.boostDecision(null, null) === 'none');

  console.log('— 2. Nouveau boost : rôle + remerciement —');
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  store.modules.set(botId, 'community', true);
  store.guildSettings.set(botId, 'g1', { boost_role: 'R1', boost_channel: 'C1', boost_message: '' });
  const sent = [];
  const member = mkMember('U1', new Date(), false);
  const guild = mkGuild([member], sent);
  const gs = store.guildSettings.get(botId, 'g1');
  const res = await br.applyStart(botId, guild, member, gs);
  check('rôle de récompense donné', res.given === true && member.roles.added.includes('R1'));
  check('remerciement envoyé dans le salon choisi', res.sent === true && sent.length === 1);
  check('…message par défaut avec mention du membre', sent[0].content.includes('<@U1>') && sent[0].content.includes('Merci'));
  check('…mention autorisée uniquement pour ce membre', JSON.stringify(sent[0].allowedMentions) === JSON.stringify({ users: ['U1'] }));
  const sent2 = [];
  const guild2 = mkGuild([mkMember('U2', new Date(), false)], sent2);
  await br.applyStart(botId, guild2, guild2.members.cache.get('U2'), { boost_role: 'R1', boost_channel: 'C1', boost_message: 'Bravo {membre} , le serveur est plus fort !' });
  check('message personnalisé : {membre} remplacé', sent2[0].content.startsWith('Bravo <@U2>'));

  console.log('— 3. Fin de boost : rôle retiré —');
  const ex = mkMember('U3', null, true);
  const guild3 = mkGuild([ex], []);
  const resEnd = await br.applyEnd(botId, guild3, ex, gs);
  check('rôle retiré automatiquement', resEnd.removed === true && ex.roles.removed.includes('R1'));
  const pasBooster = mkMember('U4', null, false);
  const resEnd2 = await br.applyEnd(botId, mkGuild([pasBooster], []), pasBooster, gs);
  check('membre sans le rôle : rien à retirer', resEnd2.removed === false && pasBooster.removed === undefined || pasBooster.roles.removed.length === 0);

  console.log('— 4. Événement guildMemberUpdate —');
  const sent4 = [];
  const m5 = mkMember('U5', new Date(), false);
  const guild4 = mkGuild([m5], sent4);
  m5.guild = guild4;
  const handled = await br.onMemberUpdate(botId, { premiumSince: null }, m5);
  check('premiumSince qui apparaît → récompense distribuée', handled === true && sent4.length === 1);
  const m6 = mkMember('U6', null, true);
  const guild5 = mkGuild([m6], []);
  m6.guild = guild5;
  const handledEnd = await br.onMemberUpdate(botId, { premiumSince: new Date() }, m6);
  check('premiumSince qui disparaît → rôle retiré', handledEnd === true && m6.roles.removed.includes('R1'));
  store.guildSettings.set(botId, 'goff', { boost_role: '', boost_channel: '' });
  const guild6 = mkGuild([mkMember('U7', new Date(), false)], []);
  const ignored = await br.onMemberUpdate(botId, { premiumSince: null, guild: { ...guild6, id: 'goff' } }, { ...guild6.members.cache.get('U7'), guild: { ...guild6, id: 'goff' } });
  check('serveur sans récompenses configurées : ignoré', ignored === false);

  console.log('— 5. Rattrapage bot éteint + sync —');
  const late = mkMember('U8', null, true);
  const still = mkMember('U9', new Date(), true);
  const guild7 = mkGuild([late, still], []);
  const bm = { clients: new Map([[botId, { client: { isReady: () => true, guilds: { cache: new Map([['g1', guild7]]) } } }]]) };
  await br.sweep(bm);
  check('boost fini bot éteint : rôle retiré au rattrapage', late.roles.removed.includes('R1'));
  check('boosteur toujours actif : pas touché', still.roles.removed.length === 0);
  const cur = mkMember('U10', new Date(), false);
  const n = await br.syncCurrentBoosters(botId, mkGuild([cur], []), gs);
  check('sync : rôle offert au boosteur actuel', n === 1 && cur.roles.added.includes('R1'));

  console.log('— 6. Commande et base —');
  const payloads = premade.buildSlashPayloads(botId);
  const cmd = payloads.find((p) => p.name === 'boostrewards');
  check('/boostrewards enregistré (setup/sync/off/view + rôle/salon/message)',
    !!cmd && JSON.stringify(cmd.options).includes('sync') && JSON.stringify(cmd.options).includes('role'));
  check('réservé aux administrateurs', premade.ADMIN_COMMAND_NAMES.has('boostrewards'));
  const round = store.guildSettings.get(botId, 'g1');
  check('réglages conservés en base (rôle, salon, message)', round.boost_role === 'R1' && round.boost_channel === 'C1');
  const bmSrc = fs.readFileSync(require('path').join(__dirname, '..', 'server/discord/botManager.js'), 'utf8');
  check('événement membre branché sur boostRewards', bmSrc.includes("require('./boostRewards').onMemberUpdate"));
  const idx = fs.readFileSync(require('path').join(__dirname, '..', 'server/index.js'), 'utf8');
  check('balayage de rattrapage toutes les 10 minutes', idx.includes('runBoostSweep') && idx.includes('600000'));

  console.log('— 7. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=280 référencé 7 fois', (index.match(/\?v=280/g) || []).length === 7,
    String((index.match(/\?v=280/g) || []).length));
  check('sw.js : cache « botdev-v280 »', sw.includes("const CACHE = 'botdev-v280';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v265 — ${ok} vérifications OK : tes boosters sont récompensés automatiquement.`);
  else { console.log(`❌ v265 — ${ko} échec(s)`); process.exitCode = 1; }
})();
