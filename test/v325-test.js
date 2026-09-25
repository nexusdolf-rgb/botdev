// v325 — Sélecteurs mobile : le clavier ne doit plus se fermer en tapant un chiffre.
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
const js = racine('public/js/dashboard.js');
const css = racine('public/css/dashboard.css');
const iDd = js.indexOf('Dashboard.dropdownMenu =');
const chunk = js.slice(iDd, js.indexOf('Dashboard.enhanceSelect =', iDd));

console.log('— 1. Pins de version v325 —');
check('index.html : ?v=325 ×7', (html.match(/\?v=325/g) || []).length === 7);
check('sw.js : cache botdev-v325', sw.includes("const CACHE = 'botdev-v325';"));
check('index.html : plus aucune ?v=324', !html.includes('?v=324'));

console.log('— 2. Le champ de recherche n’est plus recréé —');
check('commentaire v325 dans dropdownMenu', chunk.includes('v325'));
check('plus de panel.innerHTML = \'\' dans le menu', !chunk.includes("panel.innerHTML = ''"));
check('on met à jour .dd-list seulement', chunk.includes("list.innerHTML = ''") && chunk.includes("panel.querySelector('.dd-list')"));
check('inputmode texte (pas pavé numérique)', chunk.includes('inputmode="text"') && chunk.includes('autocomplete="off"'));
check('écoute visualViewport (clavier téléphone)', chunk.includes('visualViewport') && chunk.includes("vv.addEventListener('resize'"));

console.log('— 3. CSS mobile —');
check('champ de recherche à 16 px (anti-zoom iOS)', /@media \(max-width: 700px\)[\s\S]{0,500}\.dd-search input \{ font-size: 16px/.test(css));
check('bottom du sheet n’est plus en !important', !css.includes('bottom: 10px !important'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v325 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
