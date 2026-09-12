// v277 — Rôles par réaction emoji, modifiables comme chez les grands bots.
// Vérifié : toggle par défaut (réagir = recevoir, retirer = perdre), mode
// don seulement, emojis personnalisés, coexistence starboard, envoi du
// message + pose des réactions, routes + carte dashboard, bump de cache.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v277');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const rr = require('../server/discord/reactionroles');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

function makeGuild() {
  const adds = []; const rems = [];
  const member = { roles: { add: async (r) => adds.push(r.id), remove: async (r) => rems.push(r.id) } };
  const guild = {
    id: 'gRR',
    roles: { cache: { get: (id) => (id === 'r1' ? { id: 'r1' } : null) } },
    members: { fetch: async () => member },
    channels: { cache: { get: (id) => (id === 'c1' ? channel : null) } },
  };
  const reacted = [];
  const channel = { send: async () => ({ id: 'm9', react: async (e) => reacted.push(e) }) };
  return { guild, adds, rems, reacted };
}
const reactionOf = (msgId, emoji, guild) => ({ message: { id: msgId, guild: guild || null, partial: false }, emoji });

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = 'gRR';

  console.log('— 1. Config modifiable par serveur —');
  check('aucun message de rôles par défaut', rr.allOf(G).length === 0);
  const saved = rr.saveAll(G, [
    { id: 'rr1', channel: 'c1', message_id: 'm1', mode: 'toggle', content: 'Choisissez !', mappings: [{ emoji: '🎮', role: 'r1' }, { emoji: '', role: 'r2' }] },
  ]);
  check('enregistré + lignes incomplètes nettoyées', saved.length === 1 && saved[0].mappings.length === 1);
  check('…rechargé identique', rr.allOf(G)[0].message_id === 'm1');

  console.log('— 2. Comportement « comme les autres bots » —');
  const t = makeGuild();
  await rr.onReaction(BOT, reactionOf('m1', { name: '🎮', id: null }, t.guild), { id: 'u1', bot: false }, 'add');
  check('réagir donne le rôle', t.adds.length === 1 && t.adds[0] === 'r1');
  await rr.onReaction(BOT, reactionOf('m1', { name: '🎮', id: null }, t.guild), { id: 'u1', bot: false }, 'remove');
  check('…retirer la réaction retire le rôle (toggle)', t.rems.length === 1);
  rr.saveAll(G, [{ id: 'rr1', channel: 'c1', message_id: 'm1', mode: 'add-only', mappings: [{ emoji: '🎮', role: 'r1' }] }]);
  const t2 = makeGuild();
  await rr.onReaction(BOT, reactionOf('m1', { name: '🎮', id: null }, t2.guild), { id: 'u2', bot: false }, 'add');
  await rr.onReaction(BOT, reactionOf('m1', { name: '🎮', id: null }, t2.guild), { id: 'u2', bot: false }, 'remove');
  check('mode « don seulement » : jamais retiré', t2.adds.length === 1 && t2.rems.length === 0);

  console.log('— 3. Propreté & coexistence —');
  const t3 = makeGuild();
  await rr.onReaction(BOT, reactionOf('messageStarboard', { name: '⭐', id: null }, t3.guild), { id: 'u3', bot: false }, 'add');
  check('message non déclaré (starboard…) : ignoré', t3.adds.length === 0);
  await rr.onReaction(BOT, reactionOf('m1', { name: '🎮', id: null }, t3.guild), { id: 'botX', bot: true }, 'add');
  check('réaction d un bot : ignorée', t3.adds.length === 0);
  rr.saveAll(G, [{ id: 'rr2', channel: 'c1', message_id: 'm2', mode: 'toggle', mappings: [{ emoji: 'hox:998877', role: 'r1' }] }]);
  const t4 = makeGuild();
  await rr.onReaction(BOT, reactionOf('m2', { name: 'hox', id: '998877' }, t4.guild), { id: 'u4', bot: false }, 'add');
  check('émoji personnalisé (id) reconnu', t4.adds.length === 1);

  console.log('— 4. Envoi du message + réactions posées —');
  const t5 = makeGuild();
  const setup = rr.allOf(G)[0];
  const msgId = await rr.sendSetup(BOT, t5.guild, { ...setup, channel: 'c1', mappings: [{ emoji: '🎮', role: 'r1' }] });
  check('message créé dans le salon', msgId === 'm9');
  check('…réactions posées dessus', t5.reacted.length === 1 && t5.reacted[0] === '🎮');
  check('hook réactions branché (add + remove) sans casser le starboard', (() => {
    const bm = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'botManager.js'), 'utf8');
    return bm.includes("require('./reactionroles').onReaction(botId, reaction, user, 'add')") && bm.includes("require('./reactionroles').onReaction(botId, reaction, user, 'remove')") && bm.includes('community.onReaction(botId, reaction)');
  })());

  console.log('— 5. Routes & dashboard —');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('routes PUT / POST send / DELETE', routes.includes("guilds/:guildId/reaction_roles'") && routes.includes('reaction_roles/send') && routes.includes('reaction_roles/:rid'));
  check('config envoyée au dashboard', routes.includes('reaction_roles: require(\'./discord/reactionroles\').allOf(guildId)'));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('carte dashboard « Rôles par réaction emoji »', dash.includes('Rôles par réaction emoji'));
  check('…réglages : salon, mode, réactions, envoi', ['rr-channel', 'rr-mode', 'rr-maps', 'rr-send'].every((id) => dash.includes(id)));

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=293 référencé 7 fois', (index.match(/\?v=293/g) || []).length === 7);
  check('sw.js : cache « botdev-v293 »', sw.includes("const CACHE = 'botdev-v293';"));

  console.log(`\n🎉 v277 — ${ok} vérifications OK : rôles par réaction modifiables, façon grands bots.`);
})().catch((e) => { console.error(e); process.exit(1); });
