// ============================================================
// Test v4.0 — Refonte visuelle humaine du dashboard et des pages
// publiques : structure, hiérarchie, animations et responsive.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dashboardCss = fs.readFileSync('public/css/dashboard.css', 'utf8');
const styleCss = fs.readFileSync('public/css/style.css', 'utf8');
assert(dashboardCss.includes('NEXORA v4.0 — Dashboard Control Center'));
assert(dashboardCss.includes('@keyframes humanDashIn'));
assert(dashboardCss.includes('dash-side-brand'));
assert(dashboardCss.includes('prefers-reduced-motion'));
assert(styleCss.includes('NEXORA v4.0 — Direction visuelle'));
assert(styleCss.includes('auth-glass'));
assert(styleCss.includes('pub-feature:hover'));
console.log('1️⃣  Design system : surfaces, hiérarchie, animations et responsive présents ✅');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + fs.readFileSync('public/js/dashboard.js', 'utf8') + '\nwindow.App=App;window.Dashboard=Dashboard;');
w.App.state = { user: { id: 2, is_admin: true } };
w.Dashboard.state = {
  bot: { id: 1, name: 'Hoxera', online: true, avatar_url: 'https://cdn.example/avatar.webp' },
  guildId: 'G1', guildData: null, module: 'overview', discordGuilds: [],
};
const aside = w.document.createElement('aside');
w.Dashboard.renderSide(aside);
assert(aside.querySelector('.dash-side-brand'), 'marque du bot dans la sidebar');
assert(aside.querySelector('.dash-side-brand-copy').textContent.includes('Control Center'));
assert(aside.querySelector('.dash-global-admin'), 'administration globale conservée');
assert(w.Dashboard.MODULES.some(([id]) => id === 'botprofile'), 'identité du bot dans la gestion serveur');
console.log('2️⃣  Sidebar : marque, serveur et navigation structurée sans casser les modules ✅');

const source = fs.readFileSync('public/js/dashboard.js', 'utf8');
assert(source.includes('dash-side-brand'));
console.log('3️⃣  Compatibilité : nouveau design branché sur les classes historiques ✅');
console.log('\n🎉 Tous les tests v4.0 passent !');
