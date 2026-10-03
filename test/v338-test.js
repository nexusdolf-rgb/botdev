// v338 — accueil public « produit » (niveau pro), sans cloner DraftBot.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const css = racine('public/css/style.css');
const pub = racine('public/js/public.js');

console.log('— 1. Pins v338 —');
check('index.html : ?v=350 ×7', (html.match(/\?v=350/g) || []).length === 7);
check('sw.js : cache botdev-v350', sw.includes("const CACHE = 'botdev-v350';"));
check('index.html : plus aucune ?v=337', !html.includes('?v=337'));

console.log('— 2. Pas un clone DraftBot —');
check('pas le slogan d’un autre bot', !pub.includes('Un bot pour') && !pub.includes('Ajouter à Discord'));
check('pas de classes dh- / particules', !css.includes('.dh-hero') && !css.includes('dh-wave') && !css.includes('particles-js'));
check('police Inter, pas la police d’un autre site', html.includes('Inter') && !html.includes('Open+Sans'));
check('identité Argile conservée', css.includes('--accent: #e07a5f;'));

console.log('— 3. HTML landing intact —');
check('titre original', pub.includes('Le bot qui anime') && pub.includes('grad grad-anim'));
const compte = {
  classes: (pub.match(/class=/g) || []).length,
  ids: (pub.match(/id=/g) || []).length,
  divs: (pub.match(/<div/g) || []).length,
  boutons: (pub.match(/<button/g) || []).length,
};
check('structure HTML intacte', compte.classes === 188 && compte.ids === 22 && compte.divs === 151 && compte.boutons === 14, JSON.stringify(compte));

console.log('— 4. Couche CSS v338 —');
check('commentaire v338', css.includes('HOXERA v338'));
check('photo Optimus en marque (profil, pas bannière)', css.includes('url("/api/public/bot-avatar")'));
check('hero centré colonne', css.includes('#public-landing .pub-hero') && css.includes('flex-direction: column'));
check('titre argile fixe (plus d’arc-en-ciel)', css.includes('#public-landing .grad-anim') && css.includes('-webkit-text-fill-color: #e07a5f'));
check('v337 et v195 conservés dessous', css.includes('HOXERA v337') && css.includes('HOXERA ULTRA PRO v195'));

const changelog = require('../server/discord/changelog');
check('VERSION numérique ≥ 338', changelog.VERSION >= 338);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
assert.strictEqual(ko, 0);
console.log('\n✅ v338 : ' + ok + ' vérifications passed.');
