// v315 — Accueil : photo d’Optimus à côté de « Optimus Prime, votre nouveau membre »
// (à la place de l’emoji 🤖 « tête de robot »).
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
const pub = racine('public/js/public.js');
const css = racine('public/css/style.css');
console.log('— 1. Pins de version v315 —');
check('index.html : ?v=324 ×7', (html.match(/\?v=324/g) || []).length === 7);
check('sw.js : cache botdev-v324', sw.includes("const CACHE = 'botdev-v324';"));
check('index.html : plus aucune ?v=314', !html.includes('?v=314'));

console.log('— 2. Photo d’Optimus à la place de l’emoji —');
check('la carte « votre nouveau membre » a une vraie photo', pub.includes('<img src=') && pub.includes('Optimus Prime, votre nouveau membre'));
check('plus d’emoji 🤖 dans .hp-robot', !/hp-robot[^>]*>[\s\S]{0,80}🤖/.test(pub));
check('le cadre .hp-robot est conservé', pub.includes('class="hp-robot"'));
check('CSS : la photo remplit le cadre (object-fit: cover)', css.includes('.hp-robot img') && css.includes('object-fit: cover'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v315 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
