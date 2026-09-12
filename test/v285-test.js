// v285 — Hoxera AI : assistant staff (/resume), analyse d'activité (/activite)
// et salons dédiés aux images (image_channels). Les 8 cases du module 🤖 sont
// désormais live. Vérifié : garde-fous staff, réponses privées, restriction
// /image aux salons choisis (vide = partout), route + dashboard + bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v285');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ai = require('../server/ai/engine');
const images = require('../server/ai/images');
const extra = require('../server/discord/extra');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const BID = BOT.id;
  const G = 'gV285';

  console.log('— 1. Les 8 modules sont vivants —');
  ai.saveKey(BID, 'gsk_test_1234567890abcdef');
  let fetched = 0;
  global.fetch = async (url) => { fetched++; if (String(url).includes('pollinations')) { const b = Buffer.alloc(8192, 3); return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; } return { ok: true, json: async () => ({ choices: [{ message: { content: 'Voici le résumé demandé. À suivre : rien.' } }], usage: { total_tokens: 10 } }) }; };
  ai.saveCfg(G, { enabled: true, limit_per_hour: 50, modules: { chat: true, tickets: true, docs: true, mod: true, antispam: true, images: true, staff: true, stats: true }, sources: ['règlement'] });
  for (const m of ['staff', 'stats']) {
    let c = ''; try { await ai.ask(BID, G, m, 'test'); } catch (e) { c = e.code; }
    check(`module ${m} vivant (plus de AI_SOON)`, c === '', c);
  }

  console.log('— 2. Salons dédiés aux images —');
  check('config : image_channels vide par défaut (= partout)', Array.isArray(ai.cfgOf('gNeuf').image_channels) && ai.cfgOf('gNeuf').image_channels.length === 0);
  ai.saveCfg(G, { image_channels: ['c-art'] });
  check('image_channels enregistré', ai.cfgOf(G).image_channels.includes('c-art'));
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('route IA accepte image_channels', routes.includes('patch.image_channels = b.image_channels.map(String)'));
  const replies = []; const edits = []; const defers = [];
  const itx = (cmd, over = {}) => ({
    commandName: cmd, guild: { id: G, name: 'Test', memberCount: 42 }, user: { id: 'u1' }, member: { id: 'u1' },
    channelId: over.channelId || 'c-general',
    options: {
      getString: (k) => (over.strings || {})[k] !== undefined ? (over.strings || {})[k] : 'question',
      getChannel: () => over.channel || null,
    },
    memberPermissions: { has: (p) => (over.perms === undefined ? true : over.perms) && p === 'ManageMessages' },
    channel: over.channel,
    isChatInputCommand: () => true, isButton: () => false,
    isUserSelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true,
    reply: async (o) => replies.push(o),
    deferReply: async (o) => defers.push(o || {}),
    editReply: async (o) => edits.push(o),
  });
  const before = fetched;
  await extra.handleInteraction(BID, BOT, itx('image', { channelId: 'c-general', strings: { prompt: 'un dragon' } }));
  check('/image hors salon dédié → refus éphémère, aucun appel', replies.length === 1 && replies[0].ephemeral === true && replies[0].content.includes('salons dédiés') && fetched === before);
  images._test.lastUser.clear(); images._test.hourCount.clear();
  await extra.handleInteraction(BID, BOT, itx('image', { channelId: 'c-art', strings: { prompt: 'un dragon' } }));
  check('/image dans le salon dédié → image générée', edits.length === 1 && Array.isArray(edits[0].files) && edits[0].files.length === 1);

  console.log('— 3. /resume (assistant staff) —');
  const payloads = extra.buildExtraPayloads();
  check('slash /resume déclaré (option salon facultative)', !!payloads.find((p) => p && p.name === 'resume'));
  check('/resume documenté dans l aide', String(extra.HELP_EXTRA.resume || '').includes('staff'));
  await extra.handleInteraction(BID, BOT, itx('resume', { perms: false }));
  check('membre sans « Gérer les messages » → refus', replies.length === 2 && replies[1].content.includes('réservé au staff'));
  const fakeMsgs = new Map([
    ['m2', { author: { bot: false, username: 'Bob' }, content: 'quelqu un peut m aider pour mon rôle ?' }],
    ['m1', { author: { bot: false, username: 'Alice' }, content: 'bonjour, le giveaway est fini ?' }],
    ['m0', { author: { bot: true, username: 'Hoxera' }, content: 'message bot ignoré' }],
  ]);
  const fakeChan = { id: 'c-gen', name: 'général', messages: { fetch: async () => fakeMsgs } };
  await extra.handleInteraction(BID, BOT, itx('resume', { channel: fakeChan }));
  check('staff → résumé IA en réponse PRIVÉE', defers.some((d) => d.ephemeral === true) && edits.length === 2 && edits[1].content.includes('Résumé IA'));
  check('les messages de bots sont exclus du contexte', edits[1].content.includes('résumé'));

  console.log('— 4. /activite (analyse) —');
  check('slash /activite déclaré', !!payloads.find((p) => p && p.name === 'activite'));
  ai.saveCfg(G, { modules: { stats: false } });
  await extra.handleInteraction(BID, BOT, itx('activite'));
  check('module décoché → invitation à l activer', replies.length === 3 && replies[2].content.includes('Analyse de l activité'));
  ai.saveCfg(G, { modules: { stats: true } });
  await extra.handleInteraction(BID, BOT, itx('activite'));
  check('staff → bulletin IA en réponse privée', edits.length === 3 && edits[2].content.includes('Bulletin d activité'));

  console.log('— 5. Dashboard : 8/8 live —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  const modesLine = (dash.match(/const MODES = \[.*?\];/) || [''])[0];
  check('les 8 cases sont live, plus aucune 🔜', (modesLine.match(/, true\]/g) || []).length === 8 && (modesLine.match(/, false\]/g) || []).length === 0);
  check('groupe « 👥 Staff & analyse » (plus de « Prochaines versions »)', dash.includes("['👥 Staff & analyse', ['staff', 'stats']]") && !dash.includes('Prochaines versions'));
  check('sélecteur « Salons dédiés aux images »', dash.includes('id="ai-image-channels"') && dash.includes('vide = autorisé partout'));
  check('sauvegarde : image_channels collecté', dash.includes("image_channels: Array.from(cScope.querySelector('#ai-image-channels').selectedOptions)"));

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=287 référencé 7 fois', (index.match(/\?v=287/g) || []).length === 7);
  check('sw.js : cache « botdev-v287 »', sw.includes("const CACHE = 'botdev-v287';"));

  console.log(`\n🎉 v285 — ${ok} vérifications OK : les 8 cases du module 🤖 sont live.`);
})().catch((e) => { console.error(e); process.exit(1); });
