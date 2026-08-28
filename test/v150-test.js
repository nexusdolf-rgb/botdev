// Test v9 — refonte visuelle Slate & Clay, inspirée des panels Discord modernes
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dashboard = fs.readFileSync('public/js/dashboard.js', 'utf8');
const css = fs.readFileSync('public/css/dashboard.css', 'utf8');

assert(dashboard.includes("shell.classList.add('dashboard-shell-host')"), 'le shell dashboard doit avoir son hôte visuel');
assert(dashboard.includes("['Argile', '#E07A5F', '#C95B49']"), 'la nouvelle palette argile doit être la palette par défaut');
assert(dashboard.includes("localStorage.getItem('hx-accent-v2')") && dashboard.includes("legacyAccent !== 'Blurple'"), 'la palette précédente ne doit pas réactiver Blurple');
assert(css.includes('NEXORA v9.0 — Slate & Clay'));
for (const color of ['#36393f', '#2b2d31', '#40444b', '#e07a5f', '#4f545c']) {
  assert(css.includes(color), `couleur du nouveau design manquante : ${color}`);
}
for (const selector of ['.dashboard-shell-host .dash-side', '.dashboard-shell-host .dash-main', '.dashboard-shell-host .dash-btn-primary', '.dashboard-shell-host .dash-select', '.dashboard-shell-host .dash-module-header']) {
  assert(css.includes(selector), `règle du nouveau layout manquante : ${selector}`);
}
assert(css.includes('.dashboard-shell-host .dash-btn::before { display: none !important; }'), 'l’ancien reflet artificiel doit disparaître');
assert(css.includes('.dashboard-shell-host .dash-card[data-dash-card]::after'), 'les anciennes lignes décoratives doivent être neutralisées');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w;
global.document = w.document;
global.navigator = w.navigator;
global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + dashboard + '\nwindow.App=App;window.Dashboard=Dashboard;');
w.App.state = { user: { is_admin: true } };
w.Dashboard.state = { bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: 'overview', discordGuilds: [] };
const shell = w.document.createElement('div');
w.Dashboard.mount(shell, w.Dashboard.state.bot).catch(() => {});
assert(shell.classList.contains('dashboard-shell-host'), 'le shell reçoit bien la classe de la refonte');
console.log('✅ v9 : palette, surfaces, boutons, layout et migration de thème vérifiés');
