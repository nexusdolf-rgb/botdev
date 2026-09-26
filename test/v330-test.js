// v330 — Page Tickets : panneaux classiques rangés comme le système avancé.
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

console.log('— 1. Pins de version v330 —');
check('index.html : ?v=330 ×7', (html.match(/\?v=330/g) || []).length === 7);
check('sw.js : cache botdev-v330', sw.includes("const CACHE = 'botdev-v330';"));
check('index.html : plus aucune ?v=329', !html.includes('?v=329'));

console.log('— 2. Page plus courte, même clarté —');
check('en-tête court', chunk.includes('Bouton, liste, ou le système avancé en bas.'));
check('plus de pavé « Deux panneaux classiques »', !chunk.includes('Deux panneaux classiques (bouton ou liste)'));
check('plus de note « Ceci est le panneau à UN bouton »', !chunk.includes('Ceci est le panneau à UN bouton'));
check('cartes classiques compactes', chunk.includes('tk-classic-card'));
check('textes optionnels repliés', chunk.includes('tkFold') && chunk.includes('class="dash-card tk-fold"') && chunk.includes('tk-fold-sum'));
check('CSS des blocs repliés', css.includes('.tk-fold-sum') && css.includes('.tk-fold-body'));
check('guide 2 systèmes toujours là', chunk.includes('Par où commencer ?') && chunk.includes('Tickets classiques') && chunk.includes('Tickets avancés'));
check('le système avancé dit encore que ce n’est PAS le menu', chunk.includes('PAS le panneau avec menu'));

console.log('— 3. Ordre + IDs / APIs intacts —');
check('ordre : bouton, menu, extras, types, textes, puis avancé',
  chunk.includes('[c, cm, cxm, c2, ctpF, ctmenuF, cdmF, croomF, c3]'));
for (const id of ['t-send', 'tm-send', 'adv-send', 'tp-save', 'mp-save', 't-channel', 't-role', 'adv-mode']) {
  check('id #' + id + ' toujours là', chunk.includes('id="' + id + '"') || chunk.includes("id=\\\"" + id + "\\\"") || chunk.includes('#' + id));
}
check('envoi bouton / menu toujours séparés', chunk.includes("mode: 'button'") && chunk.includes("mode: 'menu'"));
check('menus extra toujours là', chunk.includes('Autres panneaux menu') && chunk.includes('openTicketMenuModal'));
check('advanced-tickets toujours utilisé', chunk.includes('/advanced-tickets'));
check('scope tickets seulement (pas les autres modules)',
  !dash.includes('tk-classic-card') || (dash.indexOf('tk-classic-card') > iT && dash.indexOf('tk-classic-card') < dash.indexOf('Dashboard.renderers.welcome', iT)));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v330 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
