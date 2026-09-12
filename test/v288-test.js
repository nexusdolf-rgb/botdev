// v288 — Pack IA+ : /traduire, /annonce, personnalités par salon,
// bulletin hebdomadaire automatique. Vérifié : commandes + portes de modules,
// personnalité injectée dans le prompt système du bon salon, bulletin
// déclenché au bon jour/heure (Paris) sans jamais de doublon, route,
// dashboard, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v288');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ai = require('../server/ai/engine');
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
  const G = 'gV288';
  ai.saveKey(BID, 'gsk_test_1234567890abcdef');
  const bodies = [];
  global.fetch = async (url, opts) => {
    if (opts && opts.body) bodies.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Hola mundo !' } }], usage: { total_tokens: 6 } }) };
  };
  ai.saveCfg(G, { enabled: true, limit_per_hour: 50, modules: { chat: true, staff: true, stats: true } });

  console.log('— 1. /traduire —');
  const payloads = extra.buildExtraPayloads();
  const pT = payloads.find((p) => p && p.name === 'traduire');
  check('slash /traduire déclaré (message requis, langue facultative)', !!pT && !!pT.options.find((o) => o.name === 'message' && o.required) && !!pT.options.find((o) => o.name === 'langue' && !o.required));
  check('/traduire documenté dans l aide', String(extra.HELP_EXTRA.traduire || '').includes('Traduit'));
  const replies = []; const edits = []; const defers = [];
  const itx = (cmd, over = {}) => ({
    commandName: cmd, guild: { id: G, name: 'Test', memberCount: 12 }, user: { id: 'u1' }, member: { id: 'u1' },
    channelId: over.channelId || 'c1',
    options: { getString: (k) => (over.strings || {})[k] !== undefined ? (over.strings || {})[k] : null, getChannel: () => over.channel || null },
    memberPermissions: { has: () => true },
    channel: over.channel,
    isChatInputCommand: () => true, isButton: () => false,
    isUserSelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true,
    reply: async (o) => replies.push(o),
    deferReply: async (o) => defers.push(o || {}),
    editReply: async (o) => edits.push(o),
  });
  await extra.handleInteraction(BID, BOT, itx('traduire', { strings: { message: 'hello world', langue: 'espagnol' } }));
  check('traduction en réponse PRIVÉE avec la langue demandée', defers.some((d) => d.ephemeral === true) && edits.length === 1 && edits[0].content.includes('Traduction (espagnol)'));
  check('la consigne de traduction part bien au fournisseur', bodies.some((b) => b.messages && JSON.stringify(b.messages).includes('Traduisez') && JSON.stringify(b.messages).includes('espagnol')));
  ai.saveCfg(G, { modules: { chat: false } });
  await extra.handleInteraction(BID, BOT, itx('traduire', { strings: { message: 'hello' } }));
  check('module conversationnel décoché → refus poli', replies.length === 1 && replies[0].content.includes('désactivé'));
  ai.saveCfg(G, { modules: { chat: true } });

  console.log('— 2. /annonce —');
  const pA = payloads.find((p) => p && p.name === 'annonce');
  check('slash /annonce déclaré (points requis)', !!pA && !!pA.options.find((o) => o.name === 'points' && o.required));
  await extra.handleInteraction(BID, BOT, itx('annonce', { strings: { points: 'nouveau salon vocal, vendredi 20h, tournoi' } }));
  check('brouillon d annonce en réponse privée', edits.length === 2 && edits[1].content.includes('Brouillon d annonce'));
  ai.saveCfg(G, { modules: { staff: false } });
  await extra.handleInteraction(BID, BOT, itx('annonce', { strings: { points: 'x' } }));
  check('module staff décoché → refus poli', replies.length === 2 && replies[1].content.includes('Assistant IA du staff'));
  ai.saveCfg(G, { modules: { staff: true } });

  console.log('— 3. Personnalités par salon —');
  ai.saveCfg(G, { personas: { cPirate: 'Tu réponds comme un pirate, avec des yarrr' } });
  check('personnalité enregistrée dans la config', ai.cfgOf(G).personas.cPirate.includes('pirate'));
  bodies.length = 0;
  await ai.ask(BID, G, 'chat', 'salut', { channelId: 'cPirate' });
  check('salon avec personnalité → injectée dans le prompt système', bodies.length === 1 && bodies[0].messages[0].content.includes('pirate'));
  bodies.length = 0;
  await ai.ask(BID, G, 'chat', 'salut', { channelId: 'cAutre' });
  check('autre salon → ton par défaut (pas de fuite)', bodies.length === 1 && !bodies[0].messages[0].content.includes('pirate'));

  console.log('— 4. Bulletin hebdomadaire automatique —');
  const p = ai.parisNow();
  check('parisNow : jour 0-6, heure 0-23, date lisible', p.day >= 0 && p.day <= 6 && p.hour >= 0 && p.hour <= 23 && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  const GB = 'gBull';
  const sends = [];
  const guildB = { id: GB, name: 'Bull', memberCount: 30, channels: { cache: new Map([['cb', { id: 'cb', send: async (o) => sends.push(o) }]]) } };
  const entry = { client: { guilds: { cache: new Map([[GB, guildB]]) } } };
  ai.saveCfg(GB, { enabled: true, limit_per_hour: 50, modules: { stats: true }, auto_bulletin: { on: true, channel: 'cb', day: p.day, hour: p.hour } });
  await ai.bulletinSweep(BID, entry);
  check('jour+heure atteints → bulletin posté dans le salon choisi', sends.length === 1 && sends[0].content.includes('Bulletin hebdomadaire'));
  await ai.bulletinSweep(BID, entry);
  await ai.bulletinSweep(BID, entry);
  check('relancé dans la même heure → AUCUN doublon', sends.length === 1);
  store.settings.set(`ai_bulletin_last:${GB}`, '');
  ai.saveCfg(GB, { modules: { stats: false } });
  await ai.bulletinSweep(BID, entry);
  check('case « Analyse de l activité » décochée → pas de bulletin', sends.length === 1);
  store.settings.set(`ai_bulletin_last:${GB}`, '');
  ai.saveCfg(GB, { modules: { stats: true }, auto_bulletin: { on: true, channel: 'cb', day: p.day, hour: (p.hour + 5) % 24 } });
  await ai.bulletinSweep(BID, entry);
  check('mauvaise heure → rien (et pas d appel IA)', sends.length === 1);

  console.log('— 5. Route, dashboard & version —');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('route IA accepte personas + auto_bulletin', routes.includes('patch.personas =') && routes.includes('patch.auto_bulletin ='));
  const tasks = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'tasks.js'), 'utf8');
  check('balayage 30 s appelle bulletinSweep', tasks.includes("require('../ai/engine').bulletinSweep(botId, entry)"));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('carte « 🎭 Personnalités par salon » + carte « 📅 Bulletin hebdomadaire »', dash.includes('🎭 Personnalités par salon') && dash.includes('📅 Bulletin hebdomadaire automatique'));
  check('sauvegarde : personas + auto_bulletin collectés', dash.includes('personas: personaMap,') && dash.includes("on: cBul.querySelector('#ai-bulletin-on').checked"));
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=288 référencé 7 fois', (index.match(/\?v=288/g) || []).length === 7);
  check('sw.js : cache « botdev-v288 »', sw.includes("const CACHE = 'botdev-v288';"));

  console.log(`\n🎉 v288 — ${ok} vérifications OK : traduction, annonce, personnalités, bulletin hebdo.`);
})().catch((e) => { console.error(e); process.exit(1); });
