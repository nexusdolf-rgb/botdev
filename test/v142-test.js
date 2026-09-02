// Test v5.0 — Control Center, topbar mobile et interface tactile
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dashboardSource = fs.readFileSync('public/js/dashboard.js', 'utf8');
const dashboardCss = fs.readFileSync('public/css/dashboard.css', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');

// La topbar mobile est structurée en deux lignes et ses panneaux ne peuvent
// plus être coupés par le défilement horizontal des actions.
assert(dashboardSource.includes('Dashboard.removeTopbarPortals'));
assert(dashboardSource.includes('data-dash-topbar-popover="true"'));
assert(dashboardSource.includes('aria-expanded'));
assert(dashboardSource.includes('module-header-meta'));
assert(dashboardSource.includes('ov-intro') && dashboardSource.includes('ov-quick-actions'));
assert(dashboardSource.includes('ov-progress-track') && dashboardSource.includes('ov-module-card'));
assert(dashboardSource.includes('dash-state-card') && dashboardSource.includes('dash-retry'));
assert(dashboardCss.includes('NEXORA v4.1 — Mobile topbar fiable'));
assert(dashboardCss.includes('NEXORA v5.0 — Control Center humain'));
assert(dashboardCss.includes('grid-template-columns: minmax(0, 1fr)'));
assert(dashboardCss.includes('overflow-x: auto'));
assert(dashboardCss.includes('.dash-bell-pop.dash-topbar-popover'));
assert(dashboardCss.includes('bottom: calc(78px + env(safe-area-inset-bottom))'));
assert(dashboardCss.includes('mobileTopbarSheet'));
console.log('1️⃣  Mobile : topbar en deux lignes, actions tactiles et feuille visible ✅');

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
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + dashboardSource + '\nwindow.App=App;window.Dashboard=Dashboard;');
w.App.state = { user: { id: 2, is_admin: false } };
w.matchMedia = () => ({ matches: true });
w.App.api = async (path) => {
  if (String(path).includes('/notifications')) {
    return { warnings: [{ icon: '⚠️', text: 'Salon de logs à vérifier' }], infos: [] };
  }
  if (String(path).includes('/activity')) return { items: [] };
  if (String(path).includes('/stats')) return { activity: [], joins: [], top_active: [] };
  return {};
};
w.App.toast = () => {};
w.Dashboard.state = {
  bot: { id: 1, name: 'Hoxera', bot_username: 'Hoxera', online: true, avatar_url: 'https://cdn.example/avatar.webp' },
  guildId: 'G1', guildData: null, module: 'overview', discordGuilds: [],
};

const topbar = w.document.createElement('div');
topbar.className = 'dash-topbar';
w.document.body.appendChild(topbar);
const guilds = [{ id: 'G1', name: 'Serveur test', canManage: true, hasBot: true, icon: '' }];
w.Dashboard.renderTopbar(topbar, guilds);

assert(topbar.querySelector('#d-bell'), 'cloche présente');
assert(topbar.querySelector('#d-theme'), 'bouton thème présent');
assert(topbar.querySelector('#d-palette'), 'recherche présente');
assert(topbar.querySelector('#d-refresh'), 'actualisation présente');
assert(topbar.querySelector('#d-accent'), 'couleur présente');
assert(topbar.querySelector('.dash-bot-chip'), 'profil Optimus Prime présent');
assert(!topbar.querySelector('.dash-bell-pop'), 'notifications sorties de la ligne scrollable');
assert(!topbar.querySelector('.dash-accent-pop'), 'couleurs sorties de la ligne scrollable');
assert.strictEqual(w.document.querySelectorAll('[data-dash-topbar-popover="true"]').length, 2);

const bell = topbar.querySelector('#d-bell');
const bellPop = w.document.querySelector('#dash-bell-pop');
bell.click();
assert.strictEqual(bellPop.hidden, false, 'le panneau de notifications s’ouvre');
assert.strictEqual(bellPop.parentElement, w.document.body, 'le panneau est dans le body');
assert.strictEqual(bell.getAttribute('aria-expanded'), 'true');
assert(bellPop.textContent.includes('Notifications'));

bellPop.querySelector('.bp-close').click();
assert.strictEqual(bellPop.hidden, true, 'le bouton fermer fonctionne');
assert.strictEqual(bell.getAttribute('aria-expanded'), 'false');

topbar.querySelector('#d-accent').click();
const accentPop = w.document.querySelector('#dash-accent-pop');
assert.strictEqual(accentPop.hidden, false, 'le choix de couleur s’ouvre');
assert.strictEqual(accentPop.querySelectorAll('[data-acc]').length, 6);
w.Dashboard.closePopovers();
assert.strictEqual(accentPop.hidden, true, 'un clic extérieur ferme les panneaux');

// Un re-rendu ne laisse pas d’anciens panneaux invisibles dans le document.
w.Dashboard.renderTopbar(topbar, guilds);
assert.strictEqual(w.document.querySelectorAll('[data-dash-topbar-popover="true"]').length, 2);
console.log('2️⃣  Notifications et couleur : portails, fermeture et re-rendu sans doublon ✅');

const versions = index.match(/\?v=(\d+)/g) || [];
assert.strictEqual(versions.length, 7);
assert(versions.every((v) => v === '?v=207'));
assert(sw.includes("const CACHE = 'botdev-v207';"));
console.log('3️⃣  Cache frontend : index.html et service worker synchronisés en v180 ✅');

setTimeout(async () => {
  const pop = w.document.querySelector('#dash-bell-pop');
  assert(pop.textContent.includes('Salon de logs à vérifier'));
  console.log('4️⃣  Données asynchrones : contenu de notification chargé dans le panneau ✅');

  const overview = w.document.createElement('div');
  w.Dashboard.state.module = 'overview';
  await w.Dashboard.renderers.overview(overview, {
    guild: { id: 'G1', name: 'Serveur de test', members: 42, icon: '' },
    tickets: { types: [] },
    tickets_stats: { total: 8, open: 2 },
    checklist: [{ module: 'tickets', label: 'Tickets', done: true }, { module: 'welcome', label: 'Bienvenue', done: false }],
    xp_roles: [], role_menus: [], scheduled: [],
  });
  assert(overview.querySelector('.ov-intro'), 'résumé du serveur');
  assert(overview.querySelector('.ov-quick-actions'), 'actions rapides');
  assert.strictEqual(overview.querySelectorAll('.ov-stat').length, 6, 'six statistiques');
  assert(overview.querySelector('.ov-progress-track'), 'progression de configuration');
  assert(overview.querySelector('.ov-module-card'), 'cartes modules');
  assert(overview.querySelector('.module-header-meta'), 'contexte du module');
  if (w.Dashboard.state.feedTimer) w.clearInterval(w.Dashboard.state.feedTimer);
  console.log('5️⃣  Vue d’ensemble : résumé, progression, statistiques et actions rapides ✅');
  console.log('\n🎉 Tous les tests v5.0 passent !');
}, 0);
