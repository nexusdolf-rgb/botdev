// ============================================================
// Test Hoxera v36 — Tickets professionnels + nouveau lien partout
//  1. Bio : uniquement le NOUVEAU lien
//  2. Types de tickets : descriptions sous chaque type (menu déroulant)
//  3. Panneau : placeholder « Choisissez le type de ticket… », texte court pro
//  4. Salon privé : embed de bienvenue professionnel (type + description)
//  5. Assistant : action « 📝 Description du type »
//  6. Dashboard : champ description par type
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v36-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const panels = require('../server/discord/panels');
  const botManager = require('../server/discord/botManager');
  const BOT = 1, G = 'G1';

  // ---------- 1. Bio : nouveau lien ----------
  const bio = botManager.aboutText();
  check('bio : NOUVEAU lien présent', bio.includes('https://hoxera.is-a.dev'));
  check('bio : aucun ancien lien', !bio.includes('botdev-kqbd') && !bio.includes('BotDev'));

  // ---------- 2 & 3. Panneau avec descriptions ----------
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  store.tickets.set(BOT, G, {
    message: '', button_label: '🎫 Ouvrir un ticket', button_style: '1',
    types: JSON.stringify([
      { label: 'Ticket contre admin', emoji: '🤝', description: 'Signale un abus du staff, en toute confidentialité.', category: '', staff_roles: [] },
      { label: 'Ticket contre joueur', emoji: '⚔️', description: '', category: '', staff_roles: ['Staff'] },
    ]),
  });
  const n = panels.normalizeTypes(store.tickets.get(BOT, G));
  check('normalizeTypes : descriptions conservées', n[0].description.includes('abus') && n[1].description === '');
  check('typeOptionDescription : personnalisée', panels.typeOptionDescription(n[0]) === n[0].description);
  check('typeOptionDescription : défaut professionnel', panels.typeOptionDescription(n[1]).startsWith('Ouvrir un ticket « Ticket contre joueur »'));

  const sent = [];
  const fakeChannel = { id: 'C1', name: 'support', send: async (p) => { sent.push(p); return {}; } };
  await panels.sendTicketPanel(BOT, G, null, fakeChannel);
  check('panneau : envoyé', sent.length === 1);
  const payloadJson = JSON.stringify(sent[0]);
  check('panneau : placeholder « Choisissez le type de ticket… » conservé', payloadJson.includes('Choisissez le type de ticket'));
  check('panneau : emojis des types dans le menu', payloadJson.includes('🤝') && payloadJson.includes('⚔️'));
  check('panneau : texte court et professionnel', payloadJson.includes('type de ticket') && !payloadJson.includes('Tu as une question, un problème'));
  // 🎨 Nouveau panneau visuel « Optimus Prime » (référence)
  const panelEmbed = sent[0].embeds[0].toJSON();
  const fields = panelEmbed.fields || [];
  check('panneau : titre « 👑 Support | Optimus Prime »', String(panelEmbed.title).includes('Support | Hoxera'));
  check('panneau : « Bienvenue sur le support officiel de Optimus Prime »', String(panelEmbed.description).includes('Bienvenue sur le support officiel de Hoxera'));
  check('panneau : description « sélectionnez la catégorie… »', String(panelEmbed.description).includes('sélectionnez la catégorie correspondante'));
  check('panneau : « ⓘ Informations importantes : » souligné', fields.some((f) => String(f.name).includes('Informations importantes') && String(f.name).includes('__')));
  const rulesVal = String((fields.find((f) => String(f.name).includes('Informations')) || {}).value || '');
  check('panneau : règle 1 (clair et précis)', rulesVal.includes('Soyez clair et précis'));
  check('panneau : règle 2 (respect du staff)', rulesVal.includes('manque de respect'));
  check('panneau : règle 3 (mentions)', rulesVal.includes('mentions inutiles'));
  check('panneau : règle 4 (tickets inactifs 2 h)', rulesVal.includes('inactifs pendant 2 heures'));
  check('panneau : flèches rouges 🔴➡️ sur les règles', (rulesVal.match(/🔴➡️/g) || []).length === 4);
  const patienceVal = String((fields.find((f) => String(f.value).includes('patience')) || {}).value || '');
  check('panneau : message de patience en italique', patienceVal.startsWith('*⏳ Merci de votre patience'));
  check('panneau : bannière en image (route dynamique)', String(panelEmbed.image && panelEmbed.image.url).includes('/api/tickets/panel-banner/G1.'));
  // 🧹 Menu déroulant épuré : emoji + nom uniquement, AUCUNE description dessous
  const select = sent[0].components[0].components[0].toJSON();
  check('menu : un seul menu, options sans description', select.options.length === 2 && select.options.every((o) => !o.description));
  check('menu : custom_id intact', String(select.custom_id) === `bd-ttype:${BOT}`);
  check('menu : emojis conservés', select.options[0].emoji && select.options[1].emoji);

  // ---------- 4. Embed de bienvenue du salon privé ----------
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => '' }, toString: () => '<@u1>' };
  const chosen = { label: 'Ticket contre admin', emoji: '🤝', description: 'Signale un abus du staff, en toute confidentialité.', staff_roles: [] };
  const embed = panels.ticketWelcomeEmbed(member, chosen, '<@&R1>', 'Un modo me harcèle', '');
  const embJson = JSON.stringify(embed.toJSON());
  check('salon : titre professionnel', embJson.includes('🎫 Ticket ouvert'));
  check('salon : type avec emoji', embJson.includes('🤝 **Ticket contre admin**'));
  check('salon : description du type rappelée', embJson.includes('À propos de ce type') && embJson.includes('Signale un abus'));
  check('salon : équipe en charge', embJson.includes('Équipe en charge'));
  check('salon : transcription annoncée (note discrète)', embJson.includes('transcription'));
  check('salon : vouvoyé (« votre demande »)', embJson.includes('Votre demande'));
  // 🧹 v220 : l'embed du salon privé a été allégé — plus de détail inutile.
  check('salon : allégé — pas de date brute, tickets précédents, étapes ni mode d emploi staff',
    !embJson.includes('Ouvert le') && !embJson.includes('Tickets précédents')
    && !embJson.includes('Déroulement de la prise en charge') && !embJson.includes('Actions réservées au staff'));

  // ---------- 5. Assistant : action Description ----------
  const extra = require('../server/discord/extra');
  // fakes minimalistes (mêmes que v34)
  const fakeGuild = () => {
    const chans = new Map();
    const mk = (id, name, type) => { const c = { id, name, type, isTextBased: () => type === 0, send: async () => ({}), toString: () => '#' + name, permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) }, permissionsFor: () => ({ has: () => true }) }; chans.set(id, c); return c; };
    mk('C1', 'general', 0); mk('CAT1', 'Tickets', 4);
    const roles = new Map([['R1', { id: 'R1', name: 'Staff', hexColor: '#5865F2', toString: () => '@Staff' }]]);
    const coll = (map) => ({ get: (k) => map.get(k), has: (k) => map.has(k), find: (fn) => [...map.values()].find(fn), values: () => map.values() });
    return { id: 'G1', name: 'S', ownerId: 'u1', memberCount: 2, channels: { cache: coll(chans) }, roles: { cache: coll(roles), everyone: { id: 'G1' } }, members: { cache: new Map(), fetch: async () => null, me: null } };
  };
  const fakeI = (over = {}) => {
    const user = over.user || { id: 'u1', tag: 'U#1', username: 'U', bot: false, displayAvatarURL: () => '' };
    const member = { id: user.id, user, permissions: { has: () => true }, roles: { cache: new Map() } };
    const i = {
      replied: false, deferred: false, replies: [], commandName: '', customId: '', values: [],
      fields: { getTextInputValue: () => '' }, user, member, guild: fakeGuild(),
      channel: { id: 'C1', isTextBased: () => true, send: async () => ({}) },
      message: { id: 'msg-x', edit: async () => ({}), embeds: [], content: '' },
      options: { getString: () => null, getInteger: () => null, getUser: () => null, getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null },
      reply: async function (p) { this.replied = true; this.replies.push(['reply', p]); this.lastMsg = { id: 'msg-1001' }; return this.lastMsg; },
      update: async function (p) { this.replied = true; this.replies.push(['update', p]); return {}; },
      showModal: async function (p) { this.replied = true; this.replies.push(['modal', p]); },
      isRepliable: () => true,
      isChatInputCommand: function () { return !!this.isChat; },
      isButton: function () { return !!this.isBtn; },
      isStringSelectMenu: function () { return !!this.isSelect; },
      isRoleSelectMenu: function () { return !!this.isRoleSelect; },
      isModalSubmit: function () { return !!this.isModal; },
    };
    return Object.assign(i, over);
  };

  // Créer le type via la modale de nom
  const w0 = fakeI({ isChat: true, commandName: 'ticket' });
  w0.options.getSubcommandGroup = () => 'types';
  w0.options.getSubcommand = () => 'setup';
  await panels.dispatchPanels(BOT, w0);
  const wNew = fakeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['__new__'] });
  await panels.dispatchPanels(BOT, wNew);
  const wName = fakeI({ isModal: true, customId: `bdw-tm:${BOT}:u1`, fields: { getTextInputValue: () => 'Recrutement' } });
  await panels.dispatchPanels(BOT, wName);
  // Action « 📝 Description du type »
  const wDescAct = fakeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['desc'] });
  await panels.dispatchPanels(BOT, wDescAct);
  check('wizard : action Description → modale', wDescAct.replied && wDescAct.replies[0][0] === 'modal');
  const wDescVal = fakeI({ isModal: true, customId: `bdw-tm:${BOT}:u1`, fields: { getTextInputValue: () => 'Candidature pour rejoindre le staff.' } });
  await panels.dispatchPanels(BOT, wDescVal);
  const typesNow = JSON.parse(store.tickets.get(BOT, G).types);
  const recrut = typesNow.find((t) => t.label === 'Recrutement');
  check('wizard : description stockée', wDescVal.replied && !!recrut && recrut.description === 'Candidature pour rejoindre le staff.');

  // ---------- 6. Dashboard : champ description ----------
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', { url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
  w.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body) => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith('/guilds/G1')) return resp({
      guild: { id: 'G1', name: 'S', members: 3 },
      channels: [{ id: 'C1', name: 'support' }, { id: 'CAT1', name: 'Tickets', category: true }],
      roles: [{ id: 'R1', name: 'Staff' }],
      settings: {}, tickets: { message: '', button_label: '🎫 Ouvrir un ticket', button_style: '1', require_reason: 1, support_role: 'Staff', category: 'Tickets', types: [{ label: 'Ticket contre admin', emoji: '🤝', description: 'Signale un abus.', category: '', staff_roles: ['Staff'] }] },
      tickets_stats: { total: 0, open: 0 }, events: { defs: {}, state: {} }, role_menus: [], xp_roles: [], profile: {}, blacklist: [], voicetemp: {}, applications: {}, scheduled: [], log_events: {},
    });
    return resp({ ok: true });
  };
  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');
  w.eval(code + '\n;\n' + String.raw`
  window.__r = (async () => {
    Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!' }, guildId: 'G1', module: 'tickets' };
    const gdata = await App.api('/bots/1/guilds/G1');
    const c = document.createElement('div');
    await Dashboard.renderers.tickets(c, gdata);
    const desc = c.querySelector('[data-k="description"]');
    return {
      descField: !!desc,
      descValue: desc ? desc.value : '',
      preview: c.querySelector('#t-preview') ? c.querySelector('#t-preview').textContent : '',
    };
  })();
  `);
  await new Promise((r) => setTimeout(r, 2500));
  const dash = await w.__r;
  check('dashboard : champ description du type', dash.descField);
  check('dashboard : description pré-remplie', dash.descValue === 'Signale un abus.');
  check('dashboard : aperçu montre la description', dash.preview.includes('Signale un abus.'));

  store.db.close();
  console.log(failures === 0 ? '\n✅ V36 — Tickets professionnels (descriptions, textes soignés) + nouveau lien partout. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
