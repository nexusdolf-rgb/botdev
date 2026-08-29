// ============================================================
// Test v3.34 — Le dashboard affiche l'avatar réel d’Optimus Prime
// dans la barre de navigation, avec fallback éclair si l'image échoue.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\nwindow.App=App;');

w.App.state = {
  user: { id: 2, email: 'user@example.test', discord_id: 'D2', discord_username: 'zedzed_karacho', is_admin: false },
  bot: { name: 'Hoxera', avatar_url: 'https://cdn.discordapp.com/avatars/1/avatar.png' },
};
const nav = w.App.renderNavbar();
assert(nav.querySelector('#nav-brand-avatar'), 'avatar réel présent dans la barre');
assert.strictEqual(nav.querySelector('#nav-brand-avatar').getAttribute('src'), 'https://cdn.discordapp.com/avatars/1/avatar.png');
console.log('1️⃣  Dashboard : avatar réel d’Optimus Prime utilisé dans la barre ✅');

const image = nav.querySelector('#nav-brand-avatar');
image.dispatchEvent(new w.Event('error'));
assert(nav.querySelector('.logo') && !nav.querySelector('#nav-brand-avatar'), 'fallback éclair disponible si l image échoue');
console.log('2️⃣  Dashboard : fallback éclair conservé si Discord ne fournit pas la photo ✅');

const source = fs.readFileSync('public/js/app.js', 'utf8');
assert(source.includes('currentNav.replaceWith(App.renderNavbar())'));
console.log('3️⃣  Dashboard : barre reconstruite après chargement de l avatar Optimus Prime ✅');

console.log('\n🎉 Tous les tests v3.34 passent !');
