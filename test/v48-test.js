// ============================================================
// Test Hoxera v48 — Nouveau panneau visuel « Nexora »
// Objectif : le panneau RESSEMBLE à la référence, mais TOUTE la
// logique reste identique (menu, custom_id, création, permissions,
// questionnaire, fermeture).
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v48-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const panels = require('../server/discord/panels');
  const BOT = 1, G = 'G1';
  store.settings.set('public_url', 'https://dash-hoxora.onrender.com');
  store.tickets.set(BOT, G, {
    require_reason: 1, support_role: 'Staff', channel: '#support',
    types: JSON.stringify([
      { label: 'Réclamation', emoji: '⚠️', category: '', questions: ['Décris ton problème ?'], staff_roles: ['Staff'] },
      { label: 'Partenariat', emoji: '🤝', category: '', questions: [], staff_roles: [] },
    ]),
  });

  // ---------- 1. Le panneau (visuel) ----------
  const sent = [];
  const fakeChannel = { id: 'C1', name: 'support', send: async (p) => { sent.push(p); return {}; } };
  await panels.sendTicketPanel(BOT, G, null, fakeChannel);
  check('panneau : 1 seul message envoyé', sent.length === 1);
  check('panneau : 1 seul embed', sent[0].embeds.length === 1);
  check('panneau : 1 seule rangée de composants (le menu)', sent[0].components.length === 1);
  const embed = sent[0].embeds[0].toJSON();
  const select = sent[0].components[0].components[0].toJSON();
  check('panneau : UN SEUL menu déroulant', sent[0].components[0].components.length === 1);
  check('panneau : titre exact', embed.title === '👑 Support | Nexora');
  check('panneau : bienvenue exacte', embed.description.startsWith('Bienvenue sur le support officiel de Nexora'));
  check('panneau : description exacte présente', embed.description.includes('sélectionnez la catégorie correspondante à votre besoin via le menu ci-dessous'));
  check('panneau : bannière après le texte (image)', embed.image && embed.image.url.includes('/icons/support-banner.png'));
  check('menu : custom_id INTACT', select.custom_id === `bd-ttype:${BOT}`);
  check('menu : placeholder conservé', select.placeholder.includes('Choisissez le type de ticket'));
  check('menu : 2 options (les types existants)', select.options.length === 2);
  check('menu : emojis des types conservés', select.options[0].emoji && select.options[1].emoji);

  // ---------- 2. Message personnalisé : toujours respecté ----------
  sent.length = 0;
  store.tickets.set(BOT, G, { ...store.tickets.get(BOT, G), message: 'Message perso du serveur' });
  await panels.sendTicketPanel(BOT, G, null, fakeChannel);
  check('message perso : toujours utilisé', sent[0].embeds[0].toJSON().description.includes('Message perso du serveur'));
  store.tickets.set(BOT, G, { ...store.tickets.get(BOT, G), message: '' });

  // ---------- 3. La logique est INTACTE : sélection → questionnaire → ticket ----------
  const channelsCreated = [];
  const makeGuild = () => {
    const chans = new Map();
    const mk = (id, name, type) => {
      const c = {
        id, name, type, topic: '', isTextBased: () => type === 0,
        send: async () => ({}), toString: () => '#' + name,
        permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) },
        permissionsFor: () => ({ has: () => true }),
      };
      chans.set(id, c);
      return c;
    };
    mk('C1', 'support', 0);
    const roles = new Map([['R1', { id: 'R1', name: 'Staff', hexColor: '#5865F2', toString: () => '@Staff', position: 10 }]]);
    const coll = (map) => ({ get: (k) => map.get(k), has: (k) => map.has(k), find: (fn) => [...map.values()].find(fn), values: () => map.values() });
    return {
      id: 'G1', name: 'Serveur', ownerId: 'u1', memberCount: 5,
      channels: {
        cache: coll(chans),
        create: async (opts) => {
          const c = { id: 'tk-1', name: opts.name, type: opts.type, topic: opts.topic, isTextBased: () => true, send: async () => ({}), toString: () => '#' + opts.name, permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) }, permissionsFor: () => ({ has: () => true }) };
          chans.set(c.id, c);
          channelsCreated.push(opts);
          return c;
        },
      },
      roles: { cache: coll(roles), everyone: { id: 'G1' } },
      members: { cache: new Map(), fetch: async () => null, me: { roles: { highest: { position: 100 } } } },
    };
  };
  const makeI = (over = {}) => {
    const user = { id: 'u2', tag: 'Bob#0001', username: 'Bob', bot: false, displayAvatarURL: () => '', send: async () => ({}) };
    const member = { id: 'u2', user, permissions: { has: () => true }, roles: { cache: new Map(), add: async () => ({}), remove: async () => ({}) } };
    const i = {
      replied: false, deferred: false, replies: [], commandName: '', customId: '', values: [],
      fields: { getTextInputValue: () => '' }, user, member, guild: makeGuild(),
      channel: { id: 'C1', isTextBased: () => true, send: async () => ({}) },
      client: { user: { id: 'bot1' }, users: { fetch: async () => user } },
      message: { id: 'msg-x', edit: async () => ({}), embeds: [], content: '' },
      options: { getString: () => null, getInteger: () => null, getUser: () => null, getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null },
      reply: async function (p) { this.replied = true; this.replies.push(['reply', p]); this.lastMsg = { id: 'msg-1' }; return this.lastMsg; },
      update: async function (p) { this.replied = true; this.replies.push(['update', p]); return {}; },
      deferReply: async function () { this.deferred = true; },
      editReply: async function (p) { this.replied = true; this.replies.push(['edit', p]); return {}; },
      showModal: async function (p) { this.replied = true; this.replies.push(['modal', p]); },
      isRepliable: () => true,
      isChatInputCommand: () => false, isButton: () => !!over.isBtn, isStringSelectMenu: () => !!over.isSelect,
      isRoleSelectMenu: () => false, isChannelSelectMenu: () => false, isModalSubmit: () => !!over.isModal,
    };
    return Object.assign(i, over);
  };

  // 3a. clic sur le menu (type « Réclamation » qui a 1 question)
  const wSel = makeI({ isSelect: true, customId: `bd-ttype:${BOT}`, values: ['Réclamation'] });
  await panels.dispatchPanels(BOT, wSel);
  check('logique : la sélection ouvre la modale comme avant', wSel.replied && wSel.replies[0][0] === 'modal');
  // 3b. réponse au questionnaire → ticket créé
  const wAns = makeI({ isModal: true, customId: `bd-tcomb:${BOT}`, fields: { getTextInputValue: (k) => (k === 'q0' ? 'Je n\'arrive pas à me connecter' : 'raison ici') } });
  await panels.dispatchPanels(BOT, wAns);
  check('logique : le ticket est créé exactement comme avant', channelsCreated.length === 1);
  check('logique : nom du salon inchangé', String(channelsCreated[0].name).startsWith('reclamation-bob'));
  check('logique : permissions appliquées (overwrites)', Array.isArray(channelsCreated[0].permissionOverwrites) && channelsCreated[0].permissionOverwrites.length === 3);
  check('logique : topic du salon inchangé', String(channelsCreated[0].topic).includes('Bob#0001'));
  const lastReply = wAns.replies[wAns.replies.length - 1];
  check('logique : confirmation privée avec le lien', lastReply && String(lastReply[1].content).includes('Ton ticket a été créé'));

  // 3c. fermeture par le staff : bouton INTACT
  const staffI = makeI({ isBtn: true, customId: `bd-tmenu:${BOT}:close` });
  staffI.member.permissions.has = () => true;
  staffI.user = { id: 'u1', tag: 'Alice#0001', username: 'Alice', bot: false };
  staffI.guild = makeGuild();
  staffI.channel = { id: 'tk-1', name: 'reclamation-bob', topic: 'Ticket de Bob#0001 | u2 | Réclamation', isTextBased: () => true, send: async () => ({}), permissionOverwrites: { edit: async () => ({}) }, permissionsFor: () => ({ has: () => true }) };
  await panels.dispatchPanels(BOT, staffI);
  check('logique : bouton 🔒 Fermer fonctionne toujours', staffI.replied);
  check('logique : ticket marqué fermé (registre)', store.closedTickets.isClosed('tk-1'));

  store.db.close();
  console.log(failures === 0 ? '\n✅ V48 — Nouveau panneau Nexora appliqué, logique 100 % intacte. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
