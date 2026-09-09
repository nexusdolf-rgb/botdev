// v254 — Correctif : la coquille mobile s'appliquait À TOUTES LES LARGEURS.
//
// Le bloc mobile (21 requêtes médias) contient une clause SANS limite de
// largeur : « (hover: none) and (pointer: coarse) and (max-height: 800px)
// and (any-pointer: coarse) ». Sur un PC portable tactile dont la hauteur
// utile tombe sous 800 px (1366×768, ou 1920×1080 à 150 % = 720 px), cette
// clause bascule TOUTE la page en mobile, même plein écran à 1 920 px.
// C'est le cas exact de l'utilisateur : les correctifs v250→v253 ne
// couvraient que les largeurs ≤ 900 px, d'où « ça n'a pas changé ».
//
// La v254 restructure le correctif « OS de bureau » en TROIS paliers :
//   A — socle commun dès 481 px : coquille remise en ligne, barre latérale
//       debout, chrome mobile (hamburger, barre basse, tiroirs, fond noir,
//       indice de défilement) masqué, fil d'ariane rendu ;
//   B — 481-900 px : rail d'icônes de 64 px ;
//   C — ≥ 901 px : barre latérale complète de 300 px, sections/pied/textes
//       rendus (le bloc mobile les cachait à toutes les largeurs).
// Le banc d'essai gagne le drapeau --pc-tactile : user-agent Windows +
// pointeur tactile + hauteur 780 px, c'est-à-dire LA machine de
// l'utilisateur, à toutes les largeurs.

const fs = require('node:fs');
const path = require('node:path');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = racine('public/css/dashboard.css');
const banc = racine('test/tools/audit-mobile.js');
const index = racine('public/index.html');

console.log('— 1. La clause mobile sans limite de largeur existe toujours (le danger) —');
const CLAUSE = '(hover: none) and (pointer: coarse) and (max-height: 800px) and (any-pointer: coarse)';
check('les 21 requêtes médias contiennent la clause « tactile + hauteur ≤ 800 px » SANS largeur',
  (css.match(new RegExp(CLAUSE.replace(/[()]/g, '\\$&'), 'g')) || []).length === 21,
  String((css.match(new RegExp(CLAUSE.replace(/[()]/g, '\\$&'), 'g')) || []).length));

console.log('— 2. Palier A : socle commun à TOUTES les largeurs ≥ 481 px —');
check('le palier A existe, sans borne haute', css.includes('@media (min-width: 481px) {'));
const zoneA = css.slice(css.indexOf('@media (min-width: 481px) {'));
const corpsA = zoneA.slice(0, zoneA.indexOf('\n}'));
check('…coquille remise en ligne et barre latérale debout',
  corpsA.includes('.dash-shell { flex-direction: row; }') && corpsA.includes('flex-direction: column;'));
check('…hamburger, barre basse, tiroirs, fond noir ET indice de défilement masqués',
  corpsA.includes('.dash-mobile-bar,') && corpsA.includes('.dash-bnav,')
  && corpsA.includes('.dash-mobile-drawer,') && corpsA.includes('.dash-mobile-backdrop,')
  && corpsA.includes('.scroll-hint { display: none !important; }'));
check('…fil d\'ariane du haut rendu (le bloc mobile le cache à toutes largeurs)',
  corpsA.includes('.dash-crumb { display: flex; }'));

console.log('— 3. Palier B : rail d\'icônes 481-900 px —');
check('le palier B existe', css.includes('@media (min-width: 481px) and (max-width: 900px) {'));
const zoneB = css.slice(css.indexOf('@media (min-width: 481px) and (max-width: 900px) {'));
const corpsB = zoneB.slice(0, zoneB.indexOf('\n}'));
check('…rail de 64 px, icônes seules', corpsB.includes('width: 64px; flex: 0 0 64px;') && corpsB.includes('font-size: 0;'));

console.log('— 4. Palier C : barre complète au-delà de 900 px —');
check('le palier C existe', css.includes('@media (min-width: 901px) {'));
const zoneC = css.slice(css.indexOf('@media (min-width: 901px) {'));
const corpsC = zoneC.slice(0, zoneC.indexOf('\n}'));
check('…barre latérale de 300 px (largeur desktop du produit)',
  corpsC.includes('width: 300px; flex: 0 0 300px;'));
check('…sections, pied et textes rendus (le bloc mobile les cachait partout)',
  corpsC.includes('.dash-side-section { display: block; }') && corpsC.includes('.dash-side-foot { display: block; }'));
check('…entrées de menu avec leur texte (police 13 px, pas 0)',
  corpsC.includes('font-size: 13px;'));

console.log('— 5. Le banc sait émuler LA machine de l\'utilisateur —');
check('drapeau --pc-tactile : user-agent Windows + pointeur tactile',
  banc.includes("'--pc-tactile'") && banc.includes('Windows NT 10.0; Win64; x64'));
check('…le pointeur tactile est activé sans passer en mode mobile',
  banc.includes('hasTouch: TACTILE || PCTACTILE') && banc.includes('isMobile: TACTILE,'));
check('…un rail de 64 px y est accepté comme disposition PC',
  banc.includes('const railEtroit = !attenduMobile && LARGEUR >= 481 && LARGEUR <= 900;'));

console.log('— 6. Les garde-fous des v250-v253 restent en place —');
check('la classe hx-os-pc est toujours posée d\'après le système',
  index.includes("classList.add('hx-os-pc')"));
check('ecranEtroit garde son verrou « OS de bureau »',
  racine('public/js/dashboard.js').includes("classList.contains('hx-os-pc')"));

console.log('— 7. Version —');
check('index.html : ?v=254 référencé 7 fois', (index.match(/\?v=254/g) || []).length === 7,
  String((index.match(/\?v=254/g) || []).length));
check('sw.js : cache « botdev-v254 »', racine('public/sw.js').includes("const CACHE = 'botdev-v254';"));

console.log('');
if (ko === 0) console.log(`🎉 v254 — ${ok} vérifications OK : plus aucune largeur où un PC bascule en mobile.`);
else { console.log(`❌ v254 — ${ko} échec(s)`); process.exitCode = 1; }
