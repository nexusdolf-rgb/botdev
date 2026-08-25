// ============================================================
// Test v3.24 — Les références Discord du dashboard se choisissent
// dans des listes : salons, rôles et catégories. Les anciennes
// valeurs introuvables restent visibles sans redevenir des champs libres.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
global.window = w;
global.document = w.document;
global.navigator = w.navigator;
global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });

// Même ordre que la page : les vues sont définies avant Dashboard mais
// utilisent ses helpers seulement au moment où la modale est ouverte.
w.eval(
  fs.readFileSync('public/js/app.js', 'utf8') + '\n'
  + fs.readFileSync('public/js/views.js', 'utf8') + '\n'
  + fs.readFileSync('public/js/dashboard.js', 'utf8')
  + '\nwindow.App=App;window.Dashboard=Dashboard;window.BotViews=BotViews;'
);
const { App, Dashboard, BotViews } = w;

Dashboard.state = {
  bot: { id: 1, name: 'Hoxera', prefix: '!', online: true },
  guildId: 'G1',
  module: 'tickets',
  guildData: null,
};
const data = {
  guild: { id: 'G1', name: 'Serveur test', members: 12 },
  settings: {
    prefix: '!', timezone: 'Europe/Paris', xp_enabled: 1, xp_min: 10, xp_max: 25,
    xp_cooldown: 60, xp_channel: '#niveaux', log_channel: '#logs', suggestion_channel: '#suggestions',
    ticket_log_channel: '#logs', birthday_channel: 'C1', birthday_role: 'R1',
  },
  channels: [
    { id: 'C1', name: 'annonces' },
    { id: 'C2', name: 'logs' },
    { id: 'C3', name: 'niveaux' },
    { id: 'C4', name: 'vocal', voice: true },
    { id: 'CAT1', name: 'Tickets', category: true },
  ],
  roles: [
    { id: 'R1', name: 'Staff' },
    { id: 'R2', name: 'VIP' },
  ],
  tickets: {
    name: 'Support', channel: '#annonces', message: '', button_label: '🎫 Ouvrir', button_style: '1',
    require_reason: 1, support_role: 'Staff', category: 'Tickets', menu_channel: '#annonces',
    menu_category: 'Tickets', menu_message: '', ticket_log_channel: '#logs',
    types: [{ label: 'Bug', emoji: '🐛', category: 'Tickets', description: '', questions: [], staff_roles: ['Staff'] }],
  },
  tickets_stats: { total: 0, open: 0 },
  events: {
    defs: {
      member_join: { emoji: '👋', label: 'Bienvenue', description: 'x', config: [
        { key: 'channel', label: 'Salon', type: 'channel' },
        { key: 'role', label: 'Rôle', type: 'role' },
        { key: 'message', label: 'Message', type: 'multiline', default: 'Bienvenue {user} !' },
      ] },
    },
    state: { member_join: { enabled: true, config: { channel: '#annonces', role: 'Staff', message: 'Bienvenue !' } } },
  },
  role_menus: [],
  xp_roles: [{ level: 5, role: 'VIP' }],
  blacklist: [],
  voicetemp: { creator_channel: 'C4', category: 'CAT1', name_template: '' },
  lockdown: { locked: false, channels: [] },
  log_events: {},
};
Dashboard.state.guildData = data;

App.api = async (url) => {
  if (url.includes('/advanced-tickets')) {
    return { config: {
      id: 1, name: 'Tickets avancés', mode: 'menu', channel: 'C1', message: '', image_url: '',
      require_reason: 1, types: [{ id: 'bug', label: 'Bug', emoji: '🐛', category: 'Tickets', questions: [], staff_roles: ['Staff'], color: '#5865F2', button_style: '1' }],
    } };
  }
  if (url.includes('/tickets/rating')) return { count: 0, avg: 0 };
  if (url.endsWith('/shop')) return { items: [{ id: 1, name: 'VIP', description: 'Rôle VIP', price: 100, role: 'VIP', emoji: '💎' }] };
  if (url.includes('/shop/purchases')) return { purchases: [] };
  if (url.endsWith('/sanctions')) return { sanctions: [] };
  if (url.endsWith('/suggestions')) return { suggestions: [] };
  if (url.includes('/automod/logs')) return { logs: [] };
  if (url.includes('/members')) return { members: [] };
  return { ok: true };
};

(async () => {
  const tickets = w.document.createElement('div');
  await Dashboard.renderers.tickets(tickets, data);
  assert(tickets.querySelector('#t-channel')?.tagName === 'SELECT');
  assert(tickets.querySelector('#t-role')?.tagName === 'SELECT');
  assert(tickets.querySelector('#t-cat')?.tagName === 'SELECT');
  assert(!tickets.querySelector('#t-channel-custom'));
  assert(!tickets.querySelector('#t-role-custom'));
  assert(!tickets.querySelector('#t-cat-custom'));
  assert.strictEqual(tickets.querySelectorAll('input[data-k="category"]').length, 0);
  assert(tickets.querySelector('#t-channel option[value="#annonces"]'));
  assert(tickets.querySelector('#t-role option[value="Staff"]'));
  assert(tickets.querySelector('#tm-cat option[value="Tickets"]'));
  console.log('1️⃣  Tickets : salons, rôles et catégories uniquement par sélection ✅');

  const welcome = w.document.createElement('div');
  await Dashboard.renderers.welcome(welcome, data);
  assert(welcome.querySelector('select[data-k="channel"]'));
  assert(welcome.querySelector('select[data-k="role"]'));
  assert.strictEqual(welcome.querySelectorAll('input[data-k="channel"]').length, 0);
  assert.strictEqual(welcome.querySelectorAll('input[data-k="role"]').length, 0);
  console.log('2️⃣  Bienvenue : salons et rôles uniquement par sélection ✅');

  const moderation = w.document.createElement('div');
  await Dashboard.renderers.moderation(moderation, data);
  assert(moderation.querySelector('#am-exempt-users')?.classList.contains('am-choice-list'));
  assert.strictEqual(moderation.querySelectorAll('#am-exempt-users input[type="text"]').length, 0);
  console.log('3️⃣  Auto-Mod : membres, rôles et salons uniquement par sélection ✅');

  const levels = w.document.createElement('div');
  await Dashboard.renderers.levels(levels, data);
  assert.strictEqual(levels.querySelector('#xp-channel')?.tagName, 'SELECT');
  assert.strictEqual(levels.querySelectorAll('#xp-roles input[data-k="role"]').length, 0);
  console.log('4️⃣  Niveaux : salon d’annonce et rôles de récompense sélectionnables ✅');

  const shop = w.document.createElement('div');
  await Dashboard.renderers.shop(shop, data);
  assert.strictEqual(shop.querySelectorAll('#shop-items input[data-k="role"]').length, 0);
  assert(shop.querySelector('#shop-items select[data-k="role"]'));
  console.log('5️⃣  Boutique : rôle de chaque article sélectionnable ✅');

  const suggestions = w.document.createElement('div');
  await Dashboard.renderers.suggestions(suggestions, data);
  assert.strictEqual(suggestions.querySelector('#s-channel')?.tagName, 'SELECT');
  assert(!suggestions.querySelector('#s-channel + input'));
  console.log('6️⃣  Suggestions : salon sélectionnable ✅');

  const logs = w.document.createElement('div');
  await Dashboard.renderers.logs(logs, data);
  assert.strictEqual(logs.querySelector('#l-channel')?.tagName, 'SELECT');
  assert(!logs.querySelector('#l-channel + input'));
  console.log('7️⃣  Journaux : salon sélectionnable ✅');

  BotViews.openRoleMenuModal(Dashboard.state.bot, 'G1', null);
  assert.strictEqual(w.document.querySelector('#rm-channel')?.tagName, 'SELECT');
  assert(!w.document.querySelector('#rm-roles-list'));
  assert.strictEqual(w.document.querySelectorAll('#rm-options input[data-k="role"]').length, 0);
  assert(w.document.querySelector('#rm-options select[data-k="role"]'));
  console.log('8️⃣  Menus de rôles : salon et rôles uniquement par sélection ✅');

  const source = fs.readFileSync('public/js/dashboard.js', 'utf8') + fs.readFileSync('public/js/views.js', 'utf8');
  for (const oldId of ['t-channel-custom', 't-role-custom', 't-cat-custom']) assert(!source.includes(oldId));
  assert(source.includes('Dashboard.currentDiscordOption'));
  console.log('9️⃣  Aucun ancien champ libre salon/rôle/catégorie restant dans le dashboard ✅');

  console.log('\n🎉 Tous les tests v3.24 passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
