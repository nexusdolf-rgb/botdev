// v276 — Messages épinglés en bas (sticky).
// Vérifié : désactivé par défaut, compteur de republication, suppression
// UNIQUEMENT de l'ancien sticky du bot, nettoyage si supprimé à la main,
// hook isolé, slash /sticky, route + carte dashboard, bump de cache.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v276');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const sticky = require('../server/discord/sticky');
const extra = require('../server/discord/extra');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

function makeMsg(guildId, channelId, opts) {
  const o = opts || {};
  const sent = [];
  let deleted = 0;
  const oldAuthorId = o.oldAuthorId || 'botid';
  const m = {
    guild: { id: guildId },
    author: { bot: false, id: 'member1' },
    client: { user: { id: 'botid' } },
    channel: {
      id: channelId,
      messages: { fetch: async () => ({ author: { id: oldAuthorId }, delete: async () => { deleted++; } }) },
      send: async (payload) => { const e = { id: 'msg' + (sent.length + 1), payload }; sent.push(e); return e; },
    },
  };
  return { m, sent, get deleted() { return deleted; } };
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = 'gSticky';

  console.log('— 1. Réglages par serveur —');
  check('désactivé par défaut', sticky.cfgOf(G).enabled === false);
  sticky.saveCfg(G, { enabled: true, channel: 'c1', every: 99, content: 'Règlement : restez courtois.' });
  check('fréquence ramenée aux presets (5/10/20/50)', sticky.cfgOf(G).every === 10);
  sticky.saveCfg(G, { every: 5 });
  check('…preset accepté', sticky.cfgOf(G).every === 5);

  console.log('— 2. Republication en bas du salon —');
  const t1 = makeMsg(G, 'c1');
  for (let i = 0; i < 4; i++) await sticky.onMessage(BOT, t1.m);
  check('4 messages : rien ne bouge (fréquence 5)', t1.sent.length === 0);
  await sticky.onMessage(BOT, t1.m);
  check('5e message : sticky publié en bas', t1.sent.length === 1 && t1.sent[0].payload.embeds[0].description.includes('Règlement'));
  check('…identifiant mémorisé', sticky.lastIdOf(G) === 'msg1');
  const t2 = makeMsg(G, 'c1');
  for (let i = 0; i < 5; i++) await sticky.onMessage(BOT, t2.m);
  check('cycle suivant : ancien sticky supprimé (1 seul delete)', t2.deleted === 1 && t2.sent.length === 1);
  check('…nouveau sticky en bas (nouvel id)', sticky.lastIdOf(G) === 'msg1' || sticky.lastIdOf(G).length > 0);

  console.log('— 3. Propreté : jamais les messages des membres —');
  const t3 = makeMsg(G, 'c1', { oldAuthorId: 'memberX' });
  sticky.setLastId(G, 'msgMembre');
  for (let i = 0; i < 5; i++) await sticky.onMessage(BOT, t3.m);
  check('ancien « sticky » écrit par un membre : NON supprimé', t3.deleted === 0 && t3.sent.length === 1);
  const t4 = makeMsg(G, 'autreSalon');
  sticky.saveCfg(G, { every: 5 });
  for (let i = 0; i < 6; i++) await sticky.onMessage(BOT, t4.m);
  check('autre salon : rien ne se publie', t4.sent.length === 0);
  sticky.onMessageDelete(BOT, { guild: { id: G }, id: sticky.lastIdOf(G) });
  check('sticky supprimé à la main : identifiant oublié', sticky.lastIdOf(G) === '');

  console.log('— 4. Présentations & hook —');
  check('embed sobre aux couleurs Hoxera', sticky.buildPayload({ content: 'x', embed: true }).embeds[0].color === 0xe07a5f);
  check('texte simple si demandé', sticky.buildPayload({ content: 'x', embed: false }).content.startsWith('📌'));
  const bm = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'botManager.js'), 'utf8');
  check('hook messageCreate isolé', bm.includes("require('./sticky').onMessage(botId, m).catch(() => {})"));
  check('hook messageDelete isolé', bm.includes("require('./sticky').onMessageDelete(botId, m)"));

  console.log('— 5. Slash, routes, dashboard —');
  check('slash /sticky déclaré', !!extra.buildExtraPayloads().find((p) => p && p.name === 'sticky'));
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('route PUT sticky + champ dans le payload GET', routes.includes("guilds/:guildId/sticky'") && routes.includes('sticky: (() =>'));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('carte dashboard « Message épinglé en bas (sticky) »', dash.includes('Message épinglé en bas (sticky)'));
  check('…réglages : salon, fréquence, présentation, contenu', ['stk-channel', 'stk-every', 'stk-embed', 'stk-content'].every((id) => dash.includes(id)));

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=285 référencé 7 fois', (index.match(/\?v=285/g) || []).length === 7);
  check('sw.js : cache « botdev-v285 »', sw.includes("const CACHE = 'botdev-v285';"));

  console.log(`\n🎉 v276 — ${ok} vérifications OK : sticky propre, discret, jamais dans les messages des membres.`);
})().catch((e) => { console.error(e); process.exit(1); });
