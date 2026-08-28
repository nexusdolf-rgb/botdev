// Test v11 — accueil restructuré en véritable espace de gestion
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + fs.readFileSync('public/js/dashboard.js', 'utf8') + '\nwindow.App=App;window.Dashboard=Dashboard;');
w.App.state = { user: { is_admin: true } };
w.Dashboard.state = { bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: 'overview' };
w.App.api = async (url) => {
  if (url.includes('/activity')) return { items: [] };
  if (url.includes('/stats')) return { activity: [{ messages: 3 }], joins: [{ members: 1 }], top_active: [] };
  return { ok: true };
};

(async () => {
  const content = w.document.createElement('div');
  await w.Dashboard.renderers.overview(content, {
    guild: { id: 'G1', name: 'Communauté Nexora', members: 482, icon: '' },
    tickets: { types: [] }, tickets_stats: { total: 12, open: 2 },
    checklist: [{ module: 'tickets', label: 'Tickets', done: true }, { module: 'moderation', label: 'Auto-Mod', done: false }],
    xp_roles: [], role_menus: [], scheduled: [],
  });
  assert(content.querySelector('.ov-workspace'));
  assert(content.querySelector('.ov-welcome-panel'));
  assert(content.querySelector('.ov-access-bar'));
  assert.strictEqual(content.querySelectorAll('.ov-access-bar .ov-quick-action').length, 4);
  assert(content.querySelector('.ov-section-heading'));
  assert(content.querySelector('.ov-module-grid'));
  assert(content.textContent.includes('Tableau de bord'));
  if (w.Dashboard.state.feedTimer) w.clearInterval(w.Dashboard.state.feedTimer);
  console.log('✅ v11 : accueil restructuré, accès rapides, progression et modules vérifiés');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
