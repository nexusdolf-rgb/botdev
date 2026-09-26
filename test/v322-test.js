// v322 — Page Tickets : noms clairs, guide, ordre lisible. APIs inchangées.
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

console.log('— 1. Pins de version v322 —');
check('index.html : ?v=331 ×7', (html.match(/\?v=331/g) || []).length === 7);
check('sw.js : cache botdev-v331', sw.includes("const CACHE = 'botdev-v331';"));
check('index.html : plus aucune ?v=321', !html.includes('?v=321'));

console.log('— 2. Noms compréhensibles —');
check('carte « Panneau à un bouton »', chunk.includes('🔘 Panneau à un bouton'));
check('carte « Panneau avec menu (liste) »', chunk.includes('📋 Panneau avec menu (liste)'));
check('plus de titre vague « Configuration » dans tickets', !chunk.includes("Dashboard.card(root, 'Configuration'"));
check('plus de « Panneau MENU déroulant » comme titre', !chunk.includes("'🗂️ Panneau MENU déroulant'"));
check('types : pour bouton et menu seulement', chunk.includes('Types de tickets (bouton et menu)'));
check('l’autre système s’appelle tickets avancés', chunk.includes('Autre système : tickets avancés'));
check('le système avancé dit clairement que ce n’est PAS le menu',
  chunk.includes('PAS le panneau avec menu') || chunk.includes('Ce n’est PAS le système avancé'));

console.log('— 3. Guide + ordre —');
check('guide « Par où commencer ? »', chunk.includes('Par où commencer ?') && chunk.includes('ticket-guide'));
check('le guide oppose classiques et avancés', chunk.includes('Tickets classiques') && chunk.includes('Tickets avancés'));
check('ordre DOM : bouton, menu, puis avancé (le reste est dans les cartes)',
  chunk.includes('[c, cm, c3]'));
check('CSS du guide', css.includes('.ticket-guide .tg-sys') && css.includes('.tg-box-alt'));

console.log('— 4. Rien de cassé (IDs / APIs) —');
for (const id of ['t-send', 'tm-send', 'adv-send', 't-channel', 't-role', 'tp-save', 'mp-save', 'adv-mode']) {
  check('id #' + id + ' toujours là', chunk.includes('id="' + id + '"') || chunk.includes("id=\\'" + id + "\\'") || chunk.includes("'" + id + "'") || chunk.includes('#' + id));
}
check('envoi bouton / menu toujours séparés', chunk.includes("mode: 'button'") && chunk.includes("mode: 'menu'"));
check('advanced-tickets toujours utilisé', chunk.includes('/advanced-tickets'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v322 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
