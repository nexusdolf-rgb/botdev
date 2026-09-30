// v346 — Centre serveurs : bannières, recherche, filtres (page « Choisissez un serveur »).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const dash = racine('public/js/dashboard.js');
const css = racine('public/css/dashboard.css');
const routes = racine('server/routes.js');
const changelog = require('../server/discord/changelog');

console.log('— 1. Pins v346 —');
check('index.html : ?v=348 ×7', (html.match(/\?v=348/g) || []).length === 7);
check('sw.js : cache botdev-v348', sw.includes("const CACHE = 'botdev-v348';"));
check('index.html : plus aucune ?v=345', !html.includes('?v=345'));
check('VERSION ≥ 346', changelog.VERSION >= 346);
check('journal v346 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);
check('v346 dans la liste', changelog.VERSIONS.some((x) => x.v === 346));

console.log('— 2. Grille centre serveurs —');
check('renderServerGrid existe', dash.includes('Dashboard.renderServerGrid'));
check('titre Choisissez un serveur', dash.includes('Choisissez un serveur'));
check('kicker Control Center', dash.includes('Control Center · Centre serveurs'));
check('recherche srv-search', dash.includes('class="srv-search"') && dash.includes('Rechercher un serveur'));
check('filtres Tous / À configurer / À inviter', dash.includes('data-f="all"') && dash.includes('data-f="ready"') && dash.includes('data-f="invite"'));
check('bannière srv-card-banner', dash.includes('srv-card-banner'));
check('badges v110 conservés', dash.includes('➕ Inviter le bot') && dash.includes('✅ Configurer'));
check('sidebar Control Center conservé', dash.includes('<span>Control Center</span>'));
check('tickets IDs intacts', dash.includes('t-send') && dash.includes('tm-send') && dash.includes('adv-send'));
check('captcha ver-send intact', dash.includes('ver-send'));
check('pas de loginBot', !dash.includes('loginBot'));

console.log('— 3. CSS —');
check('carte bannière', css.includes('.srv-card-banner'));
check('recherche + filtres', css.includes('.srv-search') && css.includes('.srv-filter'));
check('survol conservé', css.includes('.srv-card:hover'));
check('icône 48px (v203)', css.includes('.srv-card img, .srv-card-fallback { width: 48px; height: 48px; border-radius: 15px; }'));
check('padding compact (v203)', css.includes('padding: 18px 14px 14px; color: var(--d-text);'));

console.log('— 4. API bannières —');
check('bannerURL size 1024 toujours là', routes.includes('bannerURL({ size: 1024 })'));
check('bannière passée par imgProxy', /imgProxy\(\s*g\.bannerURL\(\{\s*size:\s*1024\s*\}\)/.test(routes) || routes.includes('imgproxy.imgProxy(g.bannerURL({ size: 1024 })'));

console.log('— 5. Rendu JSDOM —');
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(racine('public/js/app.js') + '\n' + dash + '\nwindow.App=App;window.Dashboard=Dashboard;');
w.App.state = { user: { id: 2, is_admin: true } };
w.Dashboard.state = {
  bot: { id: 1, name: 'Optimus Prime', online: true, invite_url: 'https://discord.com/oauth2/example', avatar_url: '' },
  guildId: null, guildData: null, module: 'overview',
  discordGuilds: [
    { id: '10', name: 'Serveur Alpha', hasBot: true, canManage: true, members: 42, boosts: 3, icon: '', banner: '' },
    { id: '20', name: 'Serveur Beta', hasBot: false, canManage: true, members: 0, boosts: 0, icon: '', banner: '' },
  ],
};
const content = w.document.createElement('div');
w.Dashboard.renderServerGrid(content);
check('2 cartes rendues', content.querySelectorAll('.srv-card').length === 2);
check('bannière dans la carte', !!content.querySelector('.srv-card-banner'));
check('badge Configurer visible', content.textContent.includes('✅ Configurer'));
check('badge Inviter visible', content.textContent.includes('➕ Inviter le bot'));
check('champ recherche présent', !!content.querySelector('.srv-search'));
check('filtre Tous présent', !!content.querySelector('.srv-filter[data-f="all"]'));
const search = content.querySelector('.srv-search');
search.value = 'zzzz-inconnu';
search.dispatchEvent(new w.Event('input'));
check('recherche vide masque les cartes', content.querySelectorAll('.srv-card').length === 0);
search.value = 'alpha';
search.dispatchEvent(new w.Event('input'));
check('recherche alpha : 1 carte', content.querySelectorAll('.srv-card').length === 1);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
assert.strictEqual(ko, 0);
console.log('\n✅ v346 : ' + ok + ' vérifications passed.');
