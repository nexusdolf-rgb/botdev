// ============================================================
// Test Hoxera v42 — TOUTES les commandes en GLOBAL + gardes MP
//  1. Toutes les familles de commandes sont enregistrées globalement
//  2. Hash : pas de re-synchro inutile (limite de débit Discord)
//  3. Plafond à 90 commandes (limite Discord : 100)
//  4. Erreur de débit (429) gérée sans faire tomber le bot
//  5. Gardes MP : les commandes tapées en privé répondent poliment
//     (extra, premade, panels, profil) au lieu d'une erreur
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v42-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const botManager = require('../server/discord/botManager');

  // ---------- 1. Enregistrement global de TOUTES les commandes ----------
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'app123', prefix: '!' });
  for (const k of ['moderation', 'utility', 'fun', 'economy', 'levels', 'community']) store.modules.set(botId, k, 1);

  const captured = [];
  const makeEntry = (restBehavior) => ({
    client: {
      isReady: () => true,
      user: { id: 'bot-user-id' },
      rest: { put: async (route, opts) => { captured.push({ route, opts }); return restBehavior ? restBehavior() : {}; } },
    },
  });

  botManager.clients.set(botId, makeEntry());
  await botManager.syncGlobalCommands(botId);

  check('une requête globale envoyée', captured.length === 1);
  check('route globale (pas par serveur)', captured[0].route === '/applications/app123/commands');
  const names = (captured[0].opts.body || []).map((p) => p.name);
  check('toutes les familles présentes', [
    'help', 'invite', 'ping', 'botinfo',          // utilitaires
    'kick', 'ban', 'warn', 'timeout', 'clear',    // modération
    '8ball', 'meme', 'roll', 'say',               // fun
    'daily', 'balance', 'leaderboard',            // économie
    'rank', 'levels',                             // niveaux
    'giveaway', 'suggest', 'shop', 'buy', 'temprole', 'sanction', // communauté
    'ticket', 'roles', 'botprofile', 'modlogs', 'blacklist',      // configuration
    'marry', 'divorce', 'couple', 'hug', 'rps', 'pendu', 'morpion', 'poll', 'snipe', 'work', 'gamble', 'rob', 'lockdown', 'voicetemp', 'apply', 'birthday', 'remind', // Hoxera 2.0
  ].every((n) => names.includes(n)));
  check('total ~59 commandes globales', names.length >= 50 && names.length <= 90);

  // ---------- 2. Hash : pas de re-synchro inutile ----------
  captured.length = 0;
  await botManager.syncGlobalCommands(botId);
  check('aucune requête si rien n\'a changé (anti-limite)', captured.length === 0);

  // ---------- 3. Le hash re-synchronise si la liste change ----------
  store.commands.create({ bot_id: botId, name: 'ma-commande', description: 'x', trigger_type: 'slash', trigger_value: '', options: '[]', blocks: '[]', cooldown: 0, enabled: 1, sort: 0 });
  await botManager.syncGlobalCommands(botId);
  check('re-synchro après une commande personnalisée ajoutée', captured.length === 1 && captured[0].opts.body.some((p) => p.name === 'ma-commande'));

  // ---------- 4. Erreur 429 gérée sans crash ----------
  store.commands.create({ bot_id: botId, name: 'cmd-429', description: 'x', trigger_type: 'slash', trigger_value: '', options: '[]', blocks: '[]', cooldown: 0, enabled: 1, sort: 0 });
  captured.length = 0;
  botManager.clients.set(botId, makeEntry(async () => { const e = new Error('429: rate limited'); throw e; }));
  let threw = false;
  try { await botManager.syncGlobalCommands(botId); } catch (e) { threw = true; }
  check('429 : pas de crash, nouvelle tentative plus tard', !threw);

  // ---------- 4bis. Plafond à 90 (limite Discord : 100) ----------
  for (let i = 0; i < 50; i++) {
    store.commands.create({ bot_id: botId, name: `spam-${i}`, description: 'x', trigger_type: 'slash', trigger_value: '', options: '[]', blocks: '[]', cooldown: 0, enabled: 1, sort: 0 });
  }
  captured.length = 0;
  botManager.clients.set(botId, makeEntry());
  await botManager.syncGlobalCommands(botId);
  check('plafond : max 90 commandes globales envoyées', captured.length === 1 && captured[0].opts.body.length === 90);
  // on retire les commandes spam pour la suite
  store.db.prepare("DELETE FROM commands WHERE name LIKE 'spam-%' OR name IN ('cmd-429','ma-commande')").run();

  // ---------- 5. Gardes MP ----------
  const makeDMI = (over = {}) => {
    const user = { id: 'u1', tag: 'A#1', username: 'A', bot: false, displayAvatarURL: () => '' };
    const i = {
      replied: false, deferred: false, replies: [], commandName: '', guild: null, member: null,
      user, channel: { id: 'dm', isTextBased: () => true, send: async () => ({}) },
      options: { getString: () => null, getInteger: () => null, getUser: () => null, getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null },
      reply: async function (p) { this.replied = true; this.replies.push(p); return {}; },
      update: async function (p) { this.replied = true; return {}; },
      deferReply: async function () { this.deferred = true; },
      editReply: async function (p) { this.replied = true; return {}; },
      showModal: async function (p) { this.replied = true; this.replies.push(p); },
      isRepliable: () => true,
      isChatInputCommand: function () { return !!this.isChat; },
      isButton: () => false, isStringSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    };
    return Object.assign(i, over);
  };

  const polite = (i) => i.replied && JSON.stringify(i.replies).includes('Ajoute-moi à ton serveur');

  // extra (marry en MP)
  const extra = require('../server/discord/extra');
  const dmMarry = makeDMI({ isChat: true, commandName: 'marry' });
  await extra.handleInteraction(botId, {}, dmMarry);
  check('MP : /marry répond poliment', polite(dmMarry));

  // premade (daily en MP = interdite, ping en MP = ok)
  const premade = require('../server/discord/premade');
  const entry = { client: { user: { username: 'Hoxera', id: 'bot-user-id' }, ws: { ping: 42 } } };
  const dmDaily = makeDMI({ isChat: true, commandName: 'daily' });
  await premade.handlePremadeSlash(botId, entry, dmDaily);
  check('MP : /daily répond poliment (serveur requis)', dmDaily.replied && JSON.stringify(dmDaily.replies).includes('serveur Discord'));
  const dmPing = makeDMI({ isChat: true, commandName: 'ping' });
  await premade.handlePremadeSlash(botId, entry, dmPing);
  check('MP : /ping fonctionne (universelle)', dmPing.replied && !JSON.stringify(dmPing.replies).includes('serveur Discord'));

  // panels (/ticket en MP)
  const panels = require('../server/discord/panels');
  const dmTicket = makeDMI({ isChat: true, commandName: 'ticket' });
  dmTicket.options.getSubcommand = () => 'setup';
  await panels.dispatchPanels(botId, dmTicket);
  check('MP : /ticket répond poliment', polite(dmTicket));

  // profil (/botprofile en MP)
  const { handleProfileCommand } = require('../server/discord/profileCommands');
  const dmProfile = makeDMI({ isChat: true, commandName: 'botprofile' });
  dmProfile.options.getSubcommand = () => 'setup';
  await handleProfileCommand(botId, dmProfile);
  check('MP : /botprofile répond poliment', polite(dmProfile));

  store.db.close();
  console.log(failures === 0 ? '\n✅ V42 — TOUTES les commandes globales, protections anti-limite et gardes MP : 100 % vérifiés. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
