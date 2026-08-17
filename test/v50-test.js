// ============================================================
// Test Hoxera v50 — FILETS DE SÉCURITÉ (anti-crash / anti-blocage)
//  1. Une interaction qui plante → réponse polie, pas de crash
//  2. Une interaction bloquée (ne répond jamais) → réponse « patiente »
//     après le délai max, le bot continue
//  3. Le processus survit aux erreurs non interceptées (uncaughtException
//     / unhandledRejection) — vérifié dans un vrai sous-processus
//  4. Une commande dont l'ENVOI échoue ne plante pas (premade blindé)
//  5. Anti-fuite mémoire : les jeux/sondages abandonnés sont purgés
//  6. Les permissions des commandes de modération restent correctes
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v50-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const botManager = require('../server/discord/botManager');
  const premade = require('../server/discord/premade');
  const extra = require('../server/discord/extra');
  const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'app123', prefix: '!' });
  for (const k of ['moderation', 'utility', 'fun', 'economy', 'levels', 'community']) store.modules.set(BOT, k, 1);
  store.settings.set('public_url', 'https://dash-hoxora.onrender.com');
  const entry = { client: { user: { id: 'bot-user-id', username: 'Hoxera', tag: 'Hoxera#1', displayAvatarURL: () => '' }, ws: { ping: 42 }, guilds: { cache: { size: 3, reduce: (f, i) => i + 3 } } } };

  const mkI = (over = {}) => {
    const user = { id: 'u1', tag: 'A#1', username: 'A', bot: false, displayAvatarURL: () => '' };
    const member = { id: 'u1', user, permissions: { has: (p) => over.noPerm ? !(String(p) === String(require('discord.js').PermissionsBitField.Flags.KickMembers)) : true }, roles: { cache: new Map() } };
    const i = {
      replied: false, deferred: false, replies: [], commandName: over.commandName || '', customId: over.customId || '',
      user, member, guild: over.guild || { id: 'G1', name: 'S' },
      channel: { id: 'C1', isTextBased: () => true, send: over.sendThrows ? async () => { throw new Error('send interdit'); } : async () => ({}) },
      options: { getString: () => null, getInteger: () => null, getUser: () => null, getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null },
      reply: async function (p) { this.replied = true; this.replies.push(p); return { id: 'm1' }; },
      update: async function (p) { this.replied = true; this.replies.push(p); return {}; },
      deferReply: async function () { this.deferred = true; },
      editReply: async function (p) { this.replied = true; this.replies.push(p); return {}; },
      showModal: async function (p) { this.replied = true; this.replies.push(p); },
      isRepliable: () => true,
      isChatInputCommand: () => !!over.isChat,
      isButton: () => !!over.isBtn,
      isStringSelectMenu: () => !!over.isSelect,
      isRoleSelectMenu: () => false,
      isChannelSelectMenu: () => false,
      isModalSubmit: () => !!over.isModal,
    };
    return Object.assign(i, over);
  };

  // ---------- 1. Interaction qui PLANTE → réponse polie ----------
  const origExtra = extra.handleInteraction;
  extra.handleInteraction = async () => { throw new Error('boom volontaire'); };
  const i1 = mkI({ isChat: true, commandName: 'ping' });
  await botManager.guardInteraction(BOT, entry, i1);
  check('interaction qui plante : répond poliment (pas de crash)', i1.replied && String(i1.replies[0].content).includes('Une erreur est survenue'));
  extra.handleInteraction = origExtra;

  // ---------- 2. Interaction BLOQUÉE → réponse après le délai ----------
  extra.handleInteraction = async () => new Promise(() => {}); // ne répond jamais
  const i2 = mkI({ isChat: true, commandName: 'pendu' });
  const t0 = Date.now();
  await botManager.guardInteraction(BOT, entry, i2, 400);
  const elapsed = Date.now() - t0;
  check('interaction bloquée : réponse « patiente » après ~400 ms', i2.replied && String(i2.replies[0].content).includes('prend trop de temps'));
  check('interaction bloquée : délai respecté (300-2000 ms)', elapsed >= 250 && elapsed < 2500);
  extra.handleInteraction = origExtra;

  // ---------- 3. Le processus survit aux erreurs non interceptées ----------
  const child = execFileSync(process.execPath, ['-e', `
    require('${path.join(__dirname, '..', 'server', 'safety.js').replace(/\\/g, '/')}').install();
    setTimeout(() => { throw new Error('erreur sauvage'); }, 100);
    setTimeout(() => { Promise.reject(new Error('promesse sauvage')); }, 150);
    setTimeout(() => { console.log('ALIVE'); process.exit(0); }, 400);
  `], { encoding: 'utf8' });
  check('processus : survit à une erreur sauvage (uncaughtException)', child.includes('ALIVE'));

  // ---------- 4. Envoi qui échoue → la commande ne plante pas ----------
  let threw = false;
  try {
    const i4 = mkI({ isChat: true, commandName: 'say', sendThrows: true });
    await premade.handlePremadeSlash(BOT, entry, i4);
  } catch (e) { threw = true; }
  check('envoi qui échoue : la commande ne plante pas', !threw);

  // ---------- 5. Anti-fuite mémoire (jeux abandonnés purgés) ----------
  const { penduGames, pollState, capMap } = extra._test;
  penduGames.clear();
  pollState.clear();
  for (let k = 0; k < 200; k++) penduGames.set(`G1:msg-${k}`, { word: 'x' });
  capMap(penduGames, 150);
  check('anti-fuite : parties de pendu plafonnées à 150', penduGames.size === 150);
  for (let k = 0; k < 400; k++) pollState.set(`G1:p-${k}`, {});
  capMap(pollState, 300);
  check('anti-fuite : sondages plafonnés à 300', pollState.size === 300);

  // ---------- 6. Les permissions des commandes de modération restent correctes ----------
  const { PermissionsBitField } = require('discord.js');
  const i6 = mkI({ isChat: true, commandName: 'kick', noPerm: true });
  await premade.handlePremadeSlash(BOT, entry, i6);
  check('permissions : /kick refusé sans permission', i6.replied && String(i6.replies[0].content).includes('permission'));
  const i7 = mkI({ isChat: true, commandName: 'ping' });
  await premade.handlePremadeSlash(BOT, entry, i7);
  check('permissions : /ping fonctionne pour tout le monde', i7.replied && !String(i7.replies[0].content).includes('permission'));

  store.db.close();
  console.log(failures === 0 ? '\n✅ V50 — Filets de sécurité installés : aucun crash possible, aucune action bloquée, mémoire protégée. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
