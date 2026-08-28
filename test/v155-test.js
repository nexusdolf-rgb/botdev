// Test v13 — navigation mobile type DraftBot : menu général et tiroir modules
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('public/js/dashboard.js', 'utf8');
const css = fs.readFileSync('public/css/dashboard.css', 'utf8');
assert(source.includes('dash-mobile-bar'));
assert(source.includes('dash-mobile-site-drawer'));
assert(source.includes('dash-mobile-modules-drawer'));
assert(css.includes('NEXORA v13.0 — Navigation mobile en deux niveaux'));
assert(css.includes('.dash-mobile-server-rail') && css.includes('.dash-mobile-module-item'));
assert(css.includes('.dash-mobile-layer { display: block; position: fixed;'));

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + source + '\nwindow.App=App;window.Dashboard=Dashboard;');
w.App.state = { user: { id: 1, is_admin: false, discord_username: 'testeur' } };
w.App.api = async () => ({ warnings: [], infos: [] });
w.Dashboard.state = {
  bot: { id: 1, name: 'Nexora', online: true, avatar_url: '' },
  guildId: 'G1', module: 'overview', discordGuilds: [
    { id: 'G1', name: 'Serveur principal', hasBot: true, canManage: true },
    { id: 'G2', name: 'Autre serveur', hasBot: true, canManage: true },
  ],
};
w.Dashboard.refresh = () => {};
const topbar = w.document.createElement('div');
topbar.className = 'dash-topbar';
w.document.body.appendChild(topbar);
w.Dashboard.renderTopbar(topbar, w.Dashboard.state.discordGuilds);

assert(topbar.querySelector('#d-mobile-menu'));
assert(topbar.querySelector('#d-mobile-modules'));
const site = w.document.querySelector('#dash-mobile-site-drawer');
const modules = w.document.querySelector('#dash-mobile-modules-drawer');
assert(site && modules);
assert(site.hidden && modules.hidden);
topbar.querySelector('#d-mobile-menu').click();
assert.strictEqual(site.hidden, false);
assert.strictEqual(modules.hidden, true);
site.querySelector('#d-mobile-site-close').click();
assert(site.hidden);
topbar.querySelector('#d-mobile-modules').click();
assert.strictEqual(modules.hidden, false);
assert.strictEqual(modules.querySelectorAll('[data-mobile-guild]').length, 2);
assert(modules.querySelector('[data-mobile-module="tickets"]'));
modules.querySelector('#d-mobile-modules-close').click();
assert(modules.hidden);
console.log('✅ v13 : barre mobile, menu général, serveurs et modules fonctionnels');
