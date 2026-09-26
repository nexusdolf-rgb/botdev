// v331 — Tickets classiques : tout DANS la carte, comme le système avancé.
'use strict';
const fs = require('fs');
const path = require('path');

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
const iT = dash.indexOf('Dashboard.renderers.tickets');
const chunk = dash.slice(iT, dash.indexOf('Dashboard.renderers.welcome', iT));

console.log('— 1. Pins de version v331 —');
check('index.html : ?v=331 ×7', (html.match(/\?v=331/g) || []).length === 7);
check('sw.js : cache botdev-v331', sw.includes("const CACHE = 'botdev-v331';"));
check('index.html : plus aucune ?v=330', !html.includes('?v=330'));

console.log('— 2. Tout dans la carte (rien en dessous) —');
check('textes bouton rangés dans la carte bouton', chunk.includes('tkFold(c, ctp'));
check('types rangés dans la carte bouton', chunk.includes('tkFold(c, c2'));
check('MP + salon rangés dans la carte bouton', chunk.includes('tkFold(c, cdm') && chunk.includes('tkFold(c, croom'));
check('textes menu rangés dans la carte menu', chunk.includes('tkFold(cm, ctmenu'));
check('menus extra rangés dans la carte menu', chunk.includes('tkFold(cm, cxm'));
check('seules 3 cartes systèmes : bouton, menu, avancé', chunk.includes('[c, cm, c3]'));
check('plus de cartes sœurs repliées', !chunk.includes('ctpF') && !chunk.includes('dash-card tk-fold'));
check('blocs internes (pas une nouvelle carte)', chunk.includes('tk-inner') && css.includes('.tk-inner'));
check('cartes classiques visuellement comme l’avancé', chunk.includes("'tk-classic-card', 'adv-builder-card'"));

console.log('— 3. IDs / APIs intacts —');
for (const id of ['t-send', 'tm-send', 'adv-send', 'tp-save', 'mp-save', 't-channel', 't-role', 'adv-mode']) {
  check('id #' + id + ' toujours là', chunk.includes('id="' + id + '"') || chunk.includes('#' + id));
}
check('envoi bouton / menu toujours séparés', chunk.includes("mode: 'button'") && chunk.includes("mode: 'menu'"));
check('menus extra toujours là', chunk.includes('Autres panneaux menu') && chunk.includes('openTicketMenuModal'));
check('advanced-tickets toujours utilisé', chunk.includes('/advanced-tickets'));
check('le système avancé dit encore que ce n’est PAS le menu', chunk.includes('PAS le panneau avec menu'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v331 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
