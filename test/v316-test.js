// v316 — photo de PROFIL Optimus Prime (pas la bannière)
// à côté de « Optimus Prime, votre nouveau membre ».
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

console.log('— 1. Pins de version v316 —');
check('index.html : ?v=316 ×7', (html.match(/\?v=316/g) || []).length === 7);
check('sw.js : cache botdev-v316', sw.includes("const CACHE = 'botdev-v316';"));
check('index.html : plus aucune ?v=315', !html.includes('?v=315'));

console.log('— 2. Profil Discord, pas la bannière —');
check('le titre « Optimus Prime, votre nouveau membre » est toujours là', pub.includes('<h3>Optimus Prime, votre nouveau membre</h3>'));
check('la source est /api/public/bot-avatar (profil Discord)', pub.includes('src="/api/public/bot-avatar"') && pub.includes('class="hp-robot"'));
check('ce n’est PAS le crop de bannière optimus-photo.png', !pub.includes('optimus-photo.png') && !css.includes('optimus-photo.png'));
check('ce n’est PAS nexora-profile-banner', !pub.includes('nexora-profile-banner') && !css.includes('nexora-profile-banner'));
check('plus d’emoji 🤖 dans .hp-robot', !/hp-robot[^>]*>[\s\S]{0,80}🤖/.test(pub));
check('CSS : la photo remplit le cadre carré (object-fit: cover)', css.includes('.hp-robot img') && css.includes('object-fit: cover'));
check('commentaire v316 : profil, pas bannière', css.includes('v316 : photo de PROFIL Discord'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v316 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
