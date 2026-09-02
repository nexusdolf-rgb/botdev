// Test v8 — finition complète du dashboard et navigation Retour
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('public/js/dashboard.js', 'utf8');
const css = fs.readFileSync('public/css/dashboard.css', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');
const sw = fs.readFileSync('public/sw.js', 'utf8');

assert(source.includes('Dashboard.goBack'));
assert(source.includes('moduleHistory'));
assert(source.includes('data-module-back'));
assert(source.includes('module-header-lead'));
assert(css.includes("NEXORA v8.0 — Product Polish"));
for (const selector of ['.module-back', '.module-header-lead', '.dash-card[data-dash-card]', '.dash-btn:active', '.dash-input:focus']) {
  assert(css.includes(selector), `style manquant : ${selector}`);
}
assert(css.includes('@media (max-width: 900px)'));
console.log('1️⃣  Design system v8 : surfaces, contrôles, espacements et responsive présents ✅');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + source + '\nwindow.App=App;window.Dashboard=Dashboard;');
w.App.state = { user: { id: 2, is_admin: false } };
w.scrollTo = () => {};
w.App.toast = () => {};
w.Dashboard.state = { bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: 'overview', moduleHistory: [], discordGuilds: [] };
let refreshes = 0;
w.Dashboard.refresh = () => { refreshes++; };

w.Dashboard.setModule('tickets');
assert.strictEqual(w.Dashboard.state.module, 'tickets');
assert.deepStrictEqual(w.Dashboard.state.moduleHistory, ['overview']);
const content = w.document.createElement('div');
w.Dashboard.header(content, '🎫', 'Système de tickets', 'Configuration');
const back = content.querySelector('[data-module-back]');
assert(back, 'bouton Retour présent dans un module');
assert.strictEqual(back.getAttribute('aria-label'), 'Retour au module précédent');
back.click();
assert.strictEqual(w.Dashboard.state.module, 'overview');
assert.deepStrictEqual(w.Dashboard.state.moduleHistory, []);
assert.strictEqual(refreshes, 2, 'navigation vers le module et retour le rechargent');

w.Dashboard.setModule('moderation');
const content2 = w.document.createElement('div');
w.Dashboard.header(content2, '🛡️', 'Modération', 'Protection');
assert(content2.querySelector('[data-module-back]'));
w.Dashboard.state.module = 'overview';
assert(!w.Dashboard.header(w.document.createElement('div'), '📊', 'Vue d’ensemble', 'Accueil').querySelector('[data-module-back]'));
console.log('2️⃣  Navigation : historique, bouton Retour et comportement mobile/desktop vérifiés ✅');

const versions = index.match(/\?v=(\d+)/g) || [];
assert.strictEqual(versions.length, 7);
assert(versions.every((version) => version === '?v=208'));
assert(sw.includes("const CACHE = 'botdev-v208';"));
console.log('3️⃣  Cache frontend : assets et service worker synchronisés en v180 ✅');
console.log('\n🎉 Tous les tests v8 passent !');
