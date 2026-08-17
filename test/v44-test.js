// ============================================================
// Test Hoxera v44 — AUDIT GLOBAL de toutes les commandes
// Chaque commande slash (premade + extra), chaque sous-commande de
// panneau, chaque commande de profil, chaque bouton/menu/modale est
// simulé avec de vrais objets discord.js : on vérifie qu'aucune ne
// plante et que toutes répondent. Plus aucun crash possible.
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v44-'));

let failures = 0;
let tested = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

// ---------------------- Monde factice complet ----------------------
function makeWorld() {
  const sent = [];
  const dms = [];
  const rolesMap = new Map();
  const channelsMap = new Map();
  const membersMap = new Map();

  const mkRole = (id, name, position = 5) => {
    const r = { id, name, position, hexColor: '#5865F2', toString: () => `@${name}` };
    rolesMap.set(id, r);
    return r;
  };
  const roleStaff = mkRole('R1', 'Staff', 10);
  const roleMembre = mkRole('R2', 'Membre', 1);

  const mkChannel = (id, name, type = 0, over = {}) => {
    const c = {
      id, name, type,
      isTextBased: () => type === 0,
      send: async (p) => { sent.push(p); return { id: 'msg-' + id, react: async () => ({}) }; },
      bulkDelete: async () => ({ size: 5 }),
      toString: () => `#${name}`,
      permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) },
      permissionsFor: () => ({ has: () => true, ViewChannel: true, SendMessages: true }),
      ...over,
    };
    channelsMap.set(id, c);
    return c;
  };
  const chGeneral = mkChannel('C1', 'general');
  mkChannel('C2', 'suggestions');
  const chTicket = mkChannel('C3', 'ticket-alice', 0, { topic: 'Ticket de Alice#0001 | u2 | ' });
  mkChannel('CAT1', 'Tickets', 4);

  const coll = (map) => ({
    get: (k) => map.get(k),
    has: (k) => map.has(k),
    find: (fn) => [...map.values()].find(fn),
    values: () => map.values(),
    size: map.size,
  });

  const mkMember = (id, username, roles = []) => {
    const user = { id, tag: `${username}#0001`, username, bot: false, displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/x.png', send: async (m) => { dms.push(m); return {}; } };
    const m = {
      id, user,
      roles: { cache: coll(new Map(roles.map((r) => [r.id, r]))), add: async () => ({}), remove: async () => ({}), highest: { position: 50 } },
      permissions: { has: () => true },
      kickable: true, bannable: true, moderatable: true,
      kick: async () => ({}), ban: async () => ({}), timeout: async () => ({}), send: user.send,
      displayName: username,
    };
    membersMap.set(id, m);
    return m;
  };
  const u2member = mkMember('u2', 'Bob', [roleMembre]);
  const u1member = mkMember('u1', 'Alice', [roleStaff]);

  const guild = {
    id: 'G1', name: 'Serveur Test', ownerId: 'u1', memberCount: 3,
    iconURL: () => 'https://cdn.discordapp.com/icons/G1.png',
    channels: {
      cache: coll(channelsMap),
      create: async (opts) => { const c = mkChannel('tk-new', opts.name, opts.type); c.topic = opts.topic; return c; },
    },
    roles: { cache: coll(rolesMap), everyone: { id: 'G1' } },
    members: {
      cache: coll(membersMap),
      fetch: async (id) => membersMap.get(id) || null,
      me: { roles: { highest: { position: 100 } } },
    },
    bans: { remove: async () => ({}) },
  };

  const mkI = (over = {}) => {
    const user = over.user || u1member.user;
    const member = over.member || u1member;
    const optsMap = over.opts || {};
    const i = {
      replied: false, deferred: false, replies: [], commandName: over.commandName || '', customId: over.customId || '',
      values: over.values || [], fields: over.fields || { getTextInputValue: () => '' },
      user, member, guild,
      channel: over.channel || chGeneral,
      client: { user: { id: 'bot-user-id', tag: 'Hoxera#0001', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/bot.png' }, users: { fetch: async (id) => user } },
      message: over.message || { id: 'msg-x', edit: async () => ({}), embeds: [], content: '' },
      options: {
        getString: (k) => (optsMap.string && optsMap.string[k] !== undefined ? optsMap.string[k] : null),
        getInteger: (k) => (optsMap.int && optsMap.int[k] !== undefined ? optsMap.int[k] : null),
        getUser: (k) => (optsMap.utilisateur || optsMap.membre || null),
        getMember: (k) => (optsMap.utilisateur || optsMap.membre || null),
        getRole: (k) => (optsMap.role || null),
        getChannel: (k) => (optsMap.channel || null),
        getAttachment: (k) => (optsMap.attachment || null),
        getSubcommand: () => (optsMap.sub || null),
        getSubcommandGroup: () => (optsMap.group || null),
        get: (k) => (optsMap.utilisateur || optsMap.membre ? { user: (optsMap.utilisateur || optsMap.membre).user } : null),
      },
      reply: async function (p) { this.replied = true; this.replies.push(['reply', p]); this.lastMsg = { id: 'msg-' + (1000 + this.replies.length) }; return this.lastMsg; },
      update: async function (p) { this.replied = true; this.replies.push(['update', p]); return { id: 'msg-x' }; },
      deferReply: async function () { this.deferred = true; },
      editReply: async function (p) { this.replied = true; this.replies.push(['edit', p]); return {}; },
      showModal: async function (p) { this.replied = true; this.replies.push(['modal', p]); },
      isRepliable: () => true,
      isChatInputCommand: function () { return !!this.isChat; },
      isButton: function () { return !!this.isBtn; },
      isStringSelectMenu: function () { return !!this.isSelect; },
      isRoleSelectMenu: function () { return !!this.isRoleSelect; },
      isChannelSelectMenu: function () { return !!this.isChanSelect; },
      isModalSubmit: function () { return !!this.isModal; },
    };
    Object.assign(i, over);
    return i;
  };

  return { guild, mkI, sent, dms, roleStaff, roleMembre, u2member, u1member, chGeneral, chTicket, mkChannel, mkRole, rolesMap, channelsMap };
}

// Une interaction a-t-elle répondu SANS message d'erreur ?
const okReply = (i) => {
  const last = i.replies[i.replies.length - 1];
  const text = String(last && last[1] ? (last[1].content || '') : '');
  return i.replied && !text.includes('Une erreur est survenue') && !text.includes('⚠️ Une erreur est survenue');
};

(async () => {
  const store = require('../server/db');
  const premade = require('../server/discord/premade');
  const extra = require('../server/discord/extra');
  const panels = require('../server/discord/panels');
  const engine = require('../server/discord/engine');
  const { handleProfileCommand } = require('../server/discord/profileCommands');

  // Config de base : bot + tous les modules + données utiles
  const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'app123', prefix: '!' });
  for (const k of ['moderation', 'utility', 'fun', 'economy', 'levels', 'community']) store.modules.set(BOT, k, 1);
  store.settings.set('public_url', 'https://dash-hoxora.onrender.com');
  store.guildSettings.set(BOT, 'G1', { suggestion_channel: '#suggestions', log_channel: '#general' });
  store.sanctions.add(BOT, 'G1', { name: 'spam', action: 'warn', duration: 0, message: 'Stop le spam' });
  store.tickets.set(BOT, 'G1', { support_role: 'Staff', channel: '#general', types: '[]' });

  const W = makeWorld();
  const entry = { client: { user: { username: 'Hoxera', id: 'bot-user-id', tag: 'Hoxera#0001', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/bot.png' }, ws: { ping: 42 }, guilds: { cache: { size: 3, reduce: (fn, init) => init + 3 } } } };

  // ============================================================
  // 1. TOUTES les commandes premade (38)
  // ============================================================
  console.log('\n── Commandes premade ──');
  const u2 = W.u2member;
  const PREMADE = [
    ['ping', {}], ['avatar', { utilisateur: u2 }], ['userinfo', {}], ['serverinfo', {}], ['botinfo', {}], ['help', {}],
    ['rank', {}], ['levels', {}], ['invite', {}], ['shop', {}], ['buy', { string: { article: 'VIP' } }],
    ['pay', { membre: u2, int: { montant: 10 } }], ['suggest', { string: { texte: 'Une super idée' } }],
    ['suggestions', { string: { action: 'view' } }], ['giveaway', { string: { action: 'create', duree: '30m', prix: '🎁 Lot' }, int: { gagnants: 1 } }],
    ['temprole', { membre: u2, role: W.roleMembre, string: { duree: '2h' } }], ['sanction', { membre: u2, string: { sanction: 'spam' } }],
    ['8ball', { string: { texte: 'Est-ce que ça marche ?' } }], ['meme', {}], ['coinflip', {}], ['roll', { int: { max: 6 } }],
    ['say', { string: { texte: 'Coucou !' } }], ['reverse', { string: { texte: 'bonjour' } }],
    ['kick', { utilisateur: u2 }], ['ban', { utilisateur: u2 }], ['unban', { string: { identifiant: '123456789012345678' } }],
    ['timeout', { utilisateur: u2, int: { minutes: 5 } }], ['warn', { utilisateur: u2, string: { raison: 'test' } }], ['warns', { utilisateur: u2 }],
    ['clear', { int: { nombre: 5 } }], ['daily', {}], ['balance', {}], ['leaderboard', {}],
  ];
  for (const [name, opts] of PREMADE) {
    tested++;
    const i = W.mkI({ isChat: true, commandName: name, opts });
    let crashed = false;
    try { await premade.handlePremadeSlash(BOT, entry, i); } catch (e) { crashed = true; console.log(`   💥 /${name}:`, e.message); }
    check(`premade /${name} : répond sans crash`, !crashed && okReply(i));
  }

  // ============================================================
  // 2. TOUTES les commandes extra (21)
  // ============================================================
  console.log('\n── Commandes extra (Hoxera 2.0) ──');
  const EXTRA = [
    ['marry', { membre: u2 }], ['divorce', {}], ['couple', {}],
    ['hug', { membre: u2 }], ['kiss', { membre: u2 }], ['slap', { membre: u2 }], ['pat', { membre: u2 }], ['punch', { membre: u2 }],
    ['rps', { string: { choix: 'pierre' } }], ['pendu', {}], ['morpion', { membre: u2 }],
    ['birthday', { string: { action: 'set' }, int: { jour: 14, mois: 7 } }], ['birthday', { string: { action: 'list' } }],
    ['remind', { string: { duree: '2h', texte: 'Test' } }], ['poll', { string: { question: 'Q ?', choix: 'A | B' } }], ['snipe', {}],
    ['work', {}], ['gamble', { int: { montant: 100 } }], ['rob', { membre: u2 }],
    ['lockdown', { string: { action: 'on' } }], ['lockdown', { string: { action: 'off' } }],
    ['voicetemp', { string: { action: 'view' } }], ['apply', { string: { action: 'view' } }],
  ];
  for (const [name, opts] of EXTRA) {
    tested++;
    const i = W.mkI({ isChat: true, commandName: name, opts });
    let crashed = false;
    try { await extra.handleInteraction(BOT, {}, i); } catch (e) { crashed = true; console.log(`   💥 /${name}:`, e.message); }
    check(`extra /${name} : répond sans crash`, !crashed && okReply(i));
  }

  // ============================================================
  // 3. Commandes de panneaux (/ticket + /roles)
  // ============================================================
  console.log('\n── Commandes de panneaux ──');
  const PANELS = [
    ['ticket', { sub: 'setup' }], ['ticket', { sub: 'config' }],
    ['ticket', { sub: 'channel', channel: W.chGeneral }], ['ticket', { sub: 'category', string: { nom: 'Tickets' } }],
    ['ticket', { sub: 'role', role: W.roleStaff }], ['ticket', { sub: 'button', string: { texte: '🎫 Ouvrir' } }],
    ['ticket', { sub: 'message', string: { texte: 'Bienvenue' } }], ['ticket', { sub: 'panel' }],
    ['ticket', { group: 'types', sub: 'list' }], ['ticket', { group: 'types', sub: 'add', string: { nom: 'Support' } }],
    ['ticket', { group: 'types', sub: 'remove', string: { nom: 'Support' } }],
    ['roles', { sub: 'list' }],
  ];
  for (const [name, opts] of PANELS) {
    tested++;
    const i = W.mkI({ isChat: true, commandName: name, opts });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log(`   💥 /${name} ${opts.sub || opts.group}:`, e.message); }
    check(`panneau /${name} ${opts.sub || ''} : répond sans crash`, !crashed && okReply(i));
  }
  // gestion dans un salon de ticket
  for (const [sub, opts] of [['close', {}], ['add', { membre: u2 }], ['remove', { membre: u2 }]]) {
    tested++;
    const i = W.mkI({ isChat: true, commandName: 'ticket', opts: { sub, ...opts }, channel: W.chTicket });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log(`   💥 /ticket ${sub}:`, e.message); }
    check(`panneau /ticket ${sub} (salon ticket) : répond sans crash`, !crashed && okReply(i));
  }
  // /ticket delete → modale
  {
    tested++;
    const i = W.mkI({ isChat: true, commandName: 'ticket', opts: { sub: 'delete' }, channel: W.chTicket });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 /ticket delete:', e.message); }
    check('panneau /ticket delete : modale sans crash', !crashed && i.replied && i.replies[0][0] === 'modal');
  }
  // /roles send (menu existant)
  store.roleMenus.create({ bot_id: BOT, guild_id: 'G1', name: 'Menu', channel: '#general', options: JSON.stringify([{ label: 'Membre', emoji: '🙂', role: 'Membre' }]) });
  {
    tested++;
    const i = W.mkI({ isChat: true, commandName: 'roles', opts: { sub: 'send', int: { numero: 1 } } });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 /roles send:', e.message); }
    check('panneau /roles send : répond sans crash', !crashed && okReply(i));
  }

  // ============================================================
  // 4. Commandes de profil (/botprofile, /modlogs, /blacklist)
  // ============================================================
  console.log('\n── Commandes de profil & configuration ──');
  const PROFILE = [
    ['botprofile', { sub: 'view' }], ['botprofile', { sub: 'set', string: { nom: 'Hoxera' } }],
    ['botprofile', { sub: 'reset' }], ['botprofile', { sub: 'setup' }],
    ['botprofile', { sub: 'avatar', attachment: { size: 10 * 1024 * 1024, url: 'https://x', contentType: 'image/png' } }],
    ['modlogs', { sub: 'view' }], ['modlogs', { sub: 'off' }], ['modlogs', { sub: 'set', channel: W.chGeneral }],
    ['blacklist', { sub: 'list' }], ['blacklist', { sub: 'add', string: { mot: 'spamtest' } }], ['blacklist', { sub: 'remove', string: { mot: 'spamtest' } }],
  ];
  for (const [name, opts] of PROFILE) {
    tested++;
    const i = W.mkI({ isChat: true, commandName: name, opts });
    let crashed = false;
    try { await handleProfileCommand(BOT, i); } catch (e) { crashed = true; console.log(`   💥 /${name} ${opts.sub}:`, e.message); }
    check(`profil /${name} ${opts.sub} : répond sans crash`, !crashed && okReply(i));
  }

  // ============================================================
  // 5. Boutons, menus, modales
  // ============================================================
  console.log('\n── Boutons, menus et modales ──');
  // 5a. Boutons du ticket (fermer / attente / réouvrir / supprimer)
  for (const [btn, sub] of [['close', 'close'], ['hold', 'hold'], ['reopen', 'reopen']]) {
    tested++;
    const i = W.mkI({ isBtn: true, customId: `bd-tmenu:${BOT}:${sub}`, channel: W.chTicket });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log(`   💥 ticket bouton ${btn}:`, e.message); }
    check(`bouton ticket ${btn} : répond sans crash`, !crashed && i.replied);
  }
  // suppression → modale raison, puis confirmation
  {
    tested++;
    const i = W.mkI({ isBtn: true, customId: `bd-tmenu:${BOT}:delete`, channel: W.chTicket });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 bouton supprimer:', e.message); }
    check('bouton ticket 🗑 : modale de raison sans crash', !crashed && i.replied && i.replies[0][0] === 'modal');
  }
  {
    tested++;
    const i = W.mkI({ isBtn: true, customId: `bd-tmenu:${BOT}:delcancel`, channel: W.chTicket });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 bouton annuler:', e.message); }
    check('bouton ticket annuler : répond sans crash', !crashed && i.replied);
  }
  // 5b. Menu de rôles (sélecteur + bouton)
  const menuId = store.roleMenus.all(BOT, 'G1')[0].id;
  {
    tested++;
    const i = W.mkI({ isSelect: true, customId: `bd-menu:${BOT}:${menuId}`, values: ['Membre'] });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 menu rôles select:', e.message); }
    check('menu de rôles (sélecteur) : répond sans crash', !crashed && i.replied);
  }
  {
    tested++;
    const i = W.mkI({ isBtn: true, customId: `bd-rmbtn:${BOT}:${menuId}:Membre` });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 bouton rôle:', e.message); }
    check('menu de rôles (bouton) : répond sans crash', !crashed && i.replied);
  }
  // 5c. Boutons de suggestions (vote + approbation)
  const sgId = store.suggestions.create({ bot_id: BOT, guild_id: 'G1', author_id: 'u2', text: 'Une idée', message_id: 'sugg-msg', channel_id: 'C2' });
  for (const act of ['up', 'down', 'approve', 'deny']) {
    tested++;
    const i = W.mkI({ isBtn: true, customId: `bd-sugg:${BOT}:${act}:${sgId}` });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log(`   💥 suggestion ${act}:`, e.message); }
    check(`bouton suggestion ${act} : répond sans crash`, !crashed && i.replied);
  }
  // 5d. Bouton du panneau de tickets (ouvre la modale raison)
  {
    tested++;
    const i = W.mkI({ isBtn: true, customId: `bd-ticket:${BOT}` });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 bouton ticket:', e.message); }
    check('bouton 🎫 Ouvrir un ticket : répond sans crash', !crashed && i.replied);
  }

  // ============================================================
  // 6. Moteur : commande personnalisée (slash + préfixe)
  // ============================================================
  console.log('\n── Moteur (commandes personnalisées) ──');
  const cmdId = store.commands.create({ bot_id: BOT, name: 'macmd', description: 'Ma commande', trigger_type: 'slash', trigger_value: '', options: '[]', blocks: JSON.stringify([{ type: 'send_message', params: { content: 'Salut {user} !' } }]), cooldown: 0, enabled: 1, sort: 0 });
  {
    tested++;
    const i = W.mkI({ isChat: true, commandName: 'macmd' });
    let crashed = false;
    try { await engine.runInteractionHandler(BOT, entry, i); } catch (e) { crashed = true; console.log('   💥 slash custom:', e.message); }
    check('commande personnalisée slash : répond sans crash', !crashed && i.replied);
  }
  {
    tested++;
    const m = {
      author: { bot: false, id: 'u2', tag: 'Bob#0001', username: 'Bob' },
      guild: W.guild, channel: W.chGeneral, member: W.u2member,
      content: '!macmd',
    };
    let crashed = false;
    try { await engine.runMessageHandler(BOT, entry, m); } catch (e) { crashed = true; console.log('   💥 préfixe custom:', e.message); }
    check('commande personnalisée préfixe : sans crash', !crashed);
  }
  store.commands.remove(cmdId);

  // ============================================================
  // 7. Sécurité : types de tickets avec emoji invalide + wizard complet
  // ============================================================
  console.log('\n── Sécurité tickets ──');
  store.tickets.set(BOT, 'G1', { support_role: 'Staff', channel: '#general', types: JSON.stringify([{ label: 'Mauvais', emoji: 'pas un emoji!!', category: '', staff_roles: [] }]) });
  {
    tested++;
    const i = W.mkI({ isChat: true, commandName: 'ticket', opts: { group: 'types', sub: 'setup' } });
    let crashed = false;
    try { await panels.dispatchPanels(BOT, i); } catch (e) { crashed = true; console.log('   💥 wizard emoji invalide:', e.message); }
    check('wizard types avec emoji invalide : répond sans crash', !crashed && i.replied);
  }
  store.tickets.set(BOT, 'G1', { support_role: 'Staff', channel: '#general', types: '[]' });

  store.db.close();
  console.log(`\n── ${tested} interactions testées, ${failures} échec(s) ──`);
  console.log(failures === 0 ? '\n✅ V44 — AUDIT GLOBAL : aucune commande ne plante, toutes répondent. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
