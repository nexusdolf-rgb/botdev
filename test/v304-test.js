// v304 — AUDIT DE TOUTES LES COMMANDES + FILETS DE SÉCURITÉ PERMANENTS.
// Demande du fondateur : « analyse toutes les commandes (dashboard et
// Discord), corrige tout ce qui est cassé, mets en place des systèmes de
// sécurité pour empêcher d'autres problèmes comme celui qu'on vient de
// corriger ».
//
// Partie 1 — ui.v2Audit valide n'importe quel payload Components V2 contre
//            les VRAIES limites Discord (40 composants imbriqués compris,
//            enfants des ActionRow inclus, 4000 caractères cumulés, 25
//            options par menu, 5 boutons par rangée…).
// Partie 2 — botManager.wrapInteractionAudit : TOUTES les réponses de TOUTES
//            les commandes passent par cet audit avant d'atteindre Discord ;
//            un panneau hors limites est remplacé par une réponse saine et
//            l'incident est journalisé dans /api/health/bot.
// Partie 3 — ce test exécute les 66 commandes slash via la VRAIE chaîne de
//            dispatch (contextmenus → help → extra → events → panels →
//            engine) avec des interactions simulées, et exige :
//              a) chaque commande RÉPOND (jamais de « L'application ne
//                 répond pas », jamais le garde-fou « pas encore prête ») ;
//              b) chaque payload envoyé est STRICTEMENT valide pour Discord ;
//              c) aucune exception ne fuit.
//            Toute future commande qui casse ces trois garanties fera
//            échouer la CI.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v304');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ui = require('../server/discord/ui');
const botManager = require('../server/discord/botManager');
const contextmenus = require('../server/discord/contextmenus');
const premade = require('../server/discord/premade');
const extra = require('../server/discord/extra');
const guildEvents = require('../server/discord/guildEvents');
const panels = require('../server/discord/panels');
const engine = require('../server/discord/engine');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// ============================ MOCKS DISCORD ============================
const FLAG_V2 = 1 << 15;
const USER1 = { id: 'u1', username: 'Chef', tag: 'Chef#0001', bot: false, createdTimestamp: Date.now() - 1e10, createdAt: new Date(Date.now() - 1e10), displayAvatarURL: () => 'https://cdn/x/u1.png' };
const USER2 = { id: 'u2', username: 'Membre', tag: 'Membre#0002', bot: false, createdTimestamp: Date.now() - 1e10, createdAt: new Date(Date.now() - 1e10), displayAvatarURL: () => 'https://cdn/x/u2.png' };
const USER3 = { id: 'u3', username: 'Ami', tag: 'Ami#0003', bot: false, createdTimestamp: Date.now() - 1e10, createdAt: new Date(Date.now() - 1e10), displayAvatarURL: () => 'https://cdn/x/u3.png' };

function mkMember(u, { admin = false } = {}) {
  return {
    id: u.id, user: u, nickname: null, displayName: u.username,
    joinedTimestamp: Date.now() - 1e9, joinedAt: new Date(Date.now() - 1e9),
    roles: { cache: new Map(), add: async () => {}, remove: async () => {}, highest: { position: admin ? 99 : 5 } },
    permissions: { has: () => admin, bitfield: 0n },
    kick: async () => {}, ban: async () => {}, timeout: async () => {},
    send: async () => ({}), voice: { channel: null },
    toString: () => `<@${u.id}>`,
  };
}
const ME = mkMember(USER1, { admin: true });
const T = mkMember(USER2);
const AMI = mkMember(USER3);

const channelSent = [];
function mkTextChannel() {
  return {
    id: 'C1', name: 'général', type: 0, parentId: null, position: 0, topic: '',
    send: async (p) => { channelSent.push(p); return { id: 'MSG' + channelSent.length, edit: async () => {}, delete: async () => {}, react: async () => {}, createdTimestamp: Date.now() }; },
    permissionOverwrites: { cache: new Map(), edit: async () => {}, set: async () => {} },
    messages: {
      fetch: async () => new Map([1, 2, 3].map((n) => ['m' + n, { id: 'm' + n, delete: async () => {}, author: { bot: false }, createdTimestamp: Date.now() }])),
    },
    bulkDelete: async () => ({ size: 3 }),
  };
}
const TEXT = mkTextChannel();
const VOICE = { id: 'V1', name: 'Vocal', type: 2, parentId: null, position: 1 };
const CAT = { id: 'CAT1', name: 'Catégorie', type: 4, position: 0 };
const guild = {
  id: 'G1', name: 'Serveur Audit', ownerId: 'u1', memberCount: 42,
  createdAt: new Date(Date.now() - 1e10), createdTimestamp: Date.now() - 1e10,
  iconURL: () => 'https://cdn/x/icon.png', bannerURL: () => null, vanityURLCode: null,
  features: [], premiumTier: 0, premiumSubscriptionCount: 0,
  roles: {
    everyone: { id: 'G1' },
    cache: new Map([['G1', { id: 'G1', name: '@everyone', position: 0 }], ['RSTAFF', { id: 'RSTAFF', name: 'staff', position: 5 }]]),
  },
  channels: {
    cache: new Map([['C1', TEXT], ['V1', VOICE], ['CAT1', CAT]]),
    create: async (opts) => { const ch = { id: 'NEW1', name: opts.name, type: opts.type || 0, parentId: opts.parent || null, permissionOverwrites: { cache: new Map(), edit: async () => {} }, send: TEXT.send }; return ch; },
  },
  members: {
    cache: new Map([['u1', ME], ['u2', T], ['u3', AMI]]),
    fetch: async () => new Map([['u1', ME], ['u2', T], ['u3', AMI]]),
    me: { permissions: { has: () => true }, roles: { highest: { position: 99 } }, id: 'bot' },
  },
  bans: { fetch: async () => new Map(), create: async () => {}, remove: async () => {} },
  invites: { fetch: async () => [] },
  emojis: { cache: new Map() },
  toString: () => 'Serveur Audit',
};
const clientMock = {
  user: { id: 'BOT1', username: 'Optimus Test', tag: 'Optimus Test#0000', displayAvatarURL: () => 'https://cdn/x/bot.png' },
  guilds: { cache: new Map([['G1', guild]]) },
  ws: { ping: 42 },
  rest: { get: async () => [], put: async () => [] },
};
const entry = { client: clientMock, startedAt: Date.now() };

function mkOptions(opts) {
  const val = (n) => (opts[n] && opts[n].value !== undefined ? opts[n].value : (opts[n] !== undefined && typeof opts[n] !== 'object' ? opts[n] : null));
  return {
    getSubcommand: () => opts.__sub || null,
    getSubcommandGroup: () => opts.__group || null,
    getString: (n) => { const v = val(n); return v === null ? null : String(v); },
    getInteger: (n) => { const v = val(n); return v === null ? null : parseInt(v, 10); },
    getNumber: (n) => { const v = val(n); return v === null ? null : Number(v); },
    getBoolean: (n) => { const v = val(n); return v === null ? null : !!v; },
    getUser: (n) => (opts[n] && opts[n].user) || (opts[n] && opts[n].member && opts[n].member.user) || null,
    getMember: (n) => (opts[n] && opts[n].member) || null,
    getChannel: (n) => (opts[n] && opts[n].channel) || null,
    getRole: (n) => (opts[n] && opts[n].role) || null,
    get: (n) => (opts[n] ? { value: val(n), user: opts[n].user || null, member: opts[n].member || null } : null),
    data: [],
  };
}
function mkInteraction(commandName, opts = {}) {
  const i = {
    commandName, guild, member: ME, user: USER1, channel: TEXT,
    replied: false, deferred: false, responses: [],
    isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false,
    isModalSubmit: () => false, isUserSelectMenu: () => false, isContextMenuCommand: () => false,
    isRepliable: () => true,
    options: mkOptions(opts),
    reply: async (p) => { i.replied = true; i.responses.push(p || {}); return {}; },
    editReply: async (p) => { i.responses.push({ __edit: p || {} }); return {}; },
    followUp: async (p) => { i.responses.push(p || {}); return {}; },
    deferReply: async () => { i.deferred = true; },
    update: async (p) => { i.responses.push(p || {}); },
    toString: () => '<@u1>',
  };
  return i;
}

// ============================ AUDIT DES PAYLOADS ============================
function auditPayload(p) {
  if (!p || typeof p !== 'object') return [];
  const issues = [];
  const raw = p.__edit || p;
  try {
    if (Array.isArray(raw.components) && raw.components.length && (Number(raw.flags || 0) & FLAG_V2)) issues.push(...ui.v2Audit(raw));
    if (typeof raw.content === 'string' && raw.content.length > 2000) issues.push(`content de ${raw.content.length} caractères (max 2000)`);
    for (const e of (raw.embeds || [])) {
      const j = e && e.toJSON ? e.toJSON() : e;
      if (j.title && String(j.title).length > 256) issues.push('embed title > 256');
      if (j.description && String(j.description).length > 4096) issues.push('embed description > 4096');
      if (j.fields && j.fields.length > 25) issues.push('embed fields > 25');
    }
  } catch (err) { issues.push('payload illisible: ' + err.message); }
  return issues;
}

// ============================ CHAÎNE RÉELLE ============================
async function dispatch(i) {
  botManager.wrapInteractionAudit(i);
  if (await contextmenus.handleInteraction(1, entry, i)) return;
  if (await premade.handleHelpSelect(1, entry, i)) return;
  if (await extra.handleInteraction(1, entry, i)) return;
  if (await guildEvents.handleInteraction(1, entry, i)) return;
  if (await panels.dispatchPanels(1, i)) return;
  await engine.runInteractionHandler(1, entry, i);
}
async function runOne(name, opts, { expectSilentOk = false } = {}) {
  const i = mkInteraction(name, opts);
  let err = null, timedOut = false;
  try {
    await Promise.race([
      dispatch(i),
      new Promise((res) => setTimeout(() => { timedOut = true; res(); }, 6000)),
    ]);
  } catch (e) { err = e; }
  const payloadIssues = [];
  for (const r of i.responses) payloadIssues.push(...auditPayload(r));
  const repondu = i.replied || i.deferred || i.responses.length > 0;
  const reasons = [];
  if (timedOut) reasons.push('timeout 6 s');
  if (err) reasons.push('exception: ' + (err.message || err));
  if (!repondu && !expectSilentOk) reasons.push('AUCUNE réponse (le garde-fou « pas encore prête » aurait répondu)');
  if (payloadIssues.length) reasons.push('payload invalide: ' + payloadIssues.join(' · ').slice(0, 160));
  check(`/${name}`, reasons.length === 0, reasons.join(' | '));
  return i;
}

(async () => {
  console.log('— 1. Pins de version v304 —');
  const html = racine('public/index.html');
  check('index.html : ?v=321 ×7', (html.match(/\?v=321/g) || []).length === 7);
  check('sw.js : cache botdev-v321', racine('public/sw.js').includes("const CACHE = 'botdev-v321';"));

  console.log('— 2. ui.v2Audit détecte chaque classe de violation —');
  // Les builders discord.js refusent eux-mêmes les objets hors limites :
  // un vrai danger vient des payloads construits autrement → JSON brut ici.
  const Tdisp = (n) => ({ type: 10, content: n });
  const ROW = (...kids) => ({ type: 1, components: kids });
  const mkV2 = (...tops) => ({ flags: FLAG_V2, components: tops });
  const over = mkV2({ type: 17, components: Array.from({ length: 41 }, (_, k) => Tdisp('t' + k)) });
  check('41 TextDisplay → violation détectée', ui.v2Audit(over).length > 0);
  const bigText = mkV2({ type: 17, components: [Tdisp('x'.repeat(4001))] });
  check('TextDisplay > 4000 → violation détectée', ui.v2Audit(bigText).some((v) => v.includes('TextDisplay')));
  const sel26 = { type: 3, custom_id: 's', options: Array.from({ length: 26 }, (_, k) => ({ label: 'o' + k, value: 'v' + k })) };
  const overSel = mkV2({ type: 17, components: [ROW(sel26)] });
  check('menu à 26 options → violation détectée', ui.v2Audit(overSel).some((v) => v.includes('options')));
  const good = ui.v2panel({ title: 'T', description: 'Correct.' });
  check('panneau valide → aucune violation', ui.v2Audit(good).length === 0);

  console.log('— 3. wrapInteractionAudit : le filet global —');
  {
    const captured = [];
    const fake = {
      commandName: 'test', customId: '',
      reply: async (p) => { captured.push(p); },
      update: async (p) => { captured.push(p); },
    };
    botManager.wrapInteractionAudit(fake);
    await fake.reply(mkV2(over)); // 41 composants → doit être remplacé
    check('réponse hors limites remplacée par un message sain', captured.length === 1 && typeof captured[0].content === 'string' && captured[0].content.includes('limites'), JSON.stringify(captured[0] || {}).slice(0, 120));
    captured.length = 0;
    await fake.update(mkV2(over)); // update d'un V2 → repli V2 obligatoire
    const rep = captured[0];
    check('update hors limites : repli RESTE en Components V2', !!rep && Array.isArray(rep.components) && (Number(rep.flags || 0) & FLAG_V2));
    check('…et ce repli est lui-même valide', ui.v2Audit(rep).length === 0);
    const health = require('../server/health').snapshot();
    check('l’incident est journalisé dans /api/health/bot', (health.errors24h.last || []).some((e) => e.source === 'panneau-invalide'));
    captured.length = 0;
    await fake.reply(ui.v2panel({ title: 'OK', description: 'valide' }));
    check('réponse valide : transmise sans modification', captured.length === 1 && Array.isArray(captured[0].components));
  }

  // ============================ PRÉPARATION DES DONNÉES ============================
  const botId = store.bots.create({ user_id: 1, name: 'AuditBot', token: 'x', client_id: 'BOT1', prefix: '!' });
  for (const key of Object.keys(premade.MODULES)) store.modules.set(botId, key, true);
  store.guildSettings.set(botId, 'G1', { suggestion_channel: 'C1', xp_card: 0, log_channel: 'C1' });
  try { store.economy.ensure(botId, 'G1', 'u1'); } catch {}
  try { store.economy.ensure(botId, 'G1', 'u2'); } catch {}
  try { store.db.prepare('UPDATE economy SET coins = 500 WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(botId, 'G1', 'u1'); } catch {}
  try { store.db.prepare('UPDATE economy SET coins = 50 WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(botId, 'G1', 'u2'); } catch {}

  console.log('— 4. Audit des 38 commandes premade —');
  await runOne('ping', {});
  await runOne('avatar', { utilisateur: { user: USER2, member: T } });
  await runOne('userinfo', { utilisateur: { user: USER2, member: T } });
  await runOne('serverinfo', {});
  await runOne('botinfo', {});
  await runOne('help', {});
  await runOne('help', { commande: 'ticket' });
  await runOne('invite', {});
  await runOne('lang', { langue: 'fr' });
  await runOne('8ball', { texte: 'Le bot est-il fiable ?' });
  { const origFetch = global.fetch; global.fetch = async () => ({ ok: true, json: async () => ({ title: 'Mème de test', url: 'https://cdn/x/m.png', nsfw: false, spoiler: false }) });
    await runOne('meme', {}); global.fetch = origFetch; }
  await runOne('coinflip', {});
  await runOne('roll', { max: 12 });
  await runOne('say', { texte: 'Bonjour le serveur' });
  await runOne('reverse', { texte: 'abc' });
  await runOne('profile', {});
  await runOne('kick', { utilisateur: { user: USER2, member: T }, raison: 'test' });
  await runOne('ban', { utilisateur: { user: USER2, member: T }, raison: 'test' });
  await runOne('unban', { identifiant: '999888777666' });
  await runOne('timeout', { utilisateur: { user: USER2, member: T }, minutes: 5, raison: 'test' });
  await runOne('warn', { utilisateur: { user: USER2, member: T }, raison: 'test' });
  await runOne('warns', { utilisateur: { user: USER2, member: T } });
  await runOne('clear', { nombre: 3 });
  await runOne('daily', {});
  await runOne('balance', { utilisateur: { user: USER2, member: T } });
  await runOne('leaderboard', {});
  await runOne('rank', { utilisateur: { user: USER2, member: T } });
  await runOne('levels', {});
  await runOne('modexport', { format: 'csv' });
  await runOne('shop', {});
  await runOne('buy', { article: '999' });
  await runOne('pay', { membre: { user: USER2, member: T }, montant: 5 });
  await runOne('temprole', { membre: { user: USER2, member: T }, role: { role: { id: 'RSTAFF', name: 'staff' } }, duree: 10 });
  await runOne('sanction', { membre: { user: USER2, member: T }, sanction: 'warn' });
  await runOne('suggest', { texte: 'Une idée de test' });
  await runOne('suggestions', { action: 'view' });
  await runOne('statchannels', { action: 'view' });
  await runOne('boostrewards', { action: 'view' });
  await runOne('giveaway', { action: 'start', duree: '1m', prix: 'Un lot de test', gagnants: 1 });

  console.log('— 5. Audit des commandes panneaux (ticket / roles / botprofile / modlogs / blacklist) —');
  await runOne('ticket', { __sub: 'config' });
  await runOne('roles', { __sub: 'list' });
  await runOne('botprofile', { __sub: 'view' });
  await runOne('modlogs', { __sub: 'view' });
  await runOne('blacklist', { __sub: 'list' });

  console.log('— 6. Audit des 27 commandes extra + /event —');
  await runOne('marry', { membre: { user: USER3, member: AMI } });
  await runOne('divorce', {});
  await runOne('couple', {});
  for (const cmd of ['hug', 'kiss', 'slap', 'pat', 'punch']) await runOne(cmd, { membre: { user: USER2, member: T } });
  await runOne('rps', { choix: 'pierre' });
  await runOne('pendu', {});
  await runOne('morpion', { adversaire: { user: USER2, member: T } });
  await runOne('quiz', { action: 'top' });
  await runOne('birthday', { action: 'list' });
  await runOne('remind', { duree: '5m', texte: 'Rappel de test' });
  await runOne('afk', { raison: 'absent' });
  await runOne('top', {});
  await runOne('poll', { question: 'Question de test ?', choix: 'Oui;Non' });
  await runOne('snipe', {});
  await runOne('invites', { membre: { user: USER2, member: T } });
  await runOne('work', {});
  await runOne('gamble', { montant: 10 });
  await runOne('rob', { membre: { user: USER2, member: T } });
  await runOne('lockdown', { action: 'off' });
  await runOne('sticky', {});
  await runOne('emotes', { action: 'view' });
  await runOne('voicetemp', { action: 'view' });
  await runOne('apply', { action: 'view' });
  await runOne('event', { action: 'list' });

  console.log(`\nRésultat de l'audit : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  check('AUCUNE commande cassée', ko === 0);
  console.log(`\n✅ v304 : ${ok} vérifications passed.`);
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
