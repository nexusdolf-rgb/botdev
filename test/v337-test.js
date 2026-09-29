// v337 — page d'accueil publique au niveau du centre serveurs.
// HTML v167/v240 inchangé ; le nouveau style est une couche CSS.
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

console.log('— 1. Pins v337 —');
check('index.html : ?v=340 ×7', (html.match(/\?v=340/g) || []).length === 7);
check('sw.js : cache botdev-v340', sw.includes("const CACHE = 'botdev-v340';"));
check('index.html : plus aucune ?v=336', !html.includes('?v=336'));

console.log('— 2. HTML public inchangé (verrous v167/v240) —');
check('titre « Le bot qui anime »', pub.includes('Le bot qui anime'));
check('dégradé animé', pub.includes('grad grad-anim'));
check('badge + stats + 10 features', pub.includes('pub-hero-badge') && pub.includes('id="pub-stats"') && (pub.match(/pub-feature /g) || []).length === 10);
check('présentation + FAQ + CTA', pub.includes('hp-about') && pub.includes('hp-faq-item') && pub.includes('pub-invite-cta'));
const compte = {
  classes: (pub.match(/class=/g) || []).length,
  ids: (pub.match(/id=/g) || []).length,
  divs: (pub.match(/<div/g) || []).length,
  boutons: (pub.match(/<button/g) || []).length,
};
check('structure HTML landing intacte', compte.classes === 188 && compte.ids === 22 && compte.divs === 151 && compte.boutons === 14, JSON.stringify(compte));

console.log('— 3. Couche CSS v337 —');
check('commentaire v337', css.includes('HOXERA v337'));
check('hero en deux colonnes', css.includes('#public-landing .pub-hero') && css.includes('"badge stage"'));
check('stats = carte à droite', css.includes('grid-area: stage') && css.includes('content: "En direct"'));
check('couleurs dashboard (plus de violet sur les cartes)', css.includes('#public-landing .hp-about-card') && !/#public-landing .hp-about-card[\s\S]{0,400}139,92,246/.test(css));
check('tuiles 2 colonnes puis 1 sur mobile', css.includes('#public-landing .pub-features { grid-template-columns: repeat(2, minmax(0, 1fr)); }'));
check('v195 conservée', css.includes('HOXERA ULTRA PRO v195'));

const changelog = require('../server/discord/changelog');
check('VERSION numérique ≥ 337', changelog.VERSION >= 337);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
assert.strictEqual(ko, 0);
console.log('\n✅ v337 : ' + ok + ' vérifications passed.');
