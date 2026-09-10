// v252 — Correctif (suite des v250/v251) : plus AUCUN PC en mobile.
//
// Dernier cas restant, après photos et analyses : un PC dont la largeur CSS
// tombe sous 800 px à cause de l'ÉCHELLE D'AFFICHAGE Windows (150 %, 175 %,
// 200 %…) — différente du zoom navigateur — basculait en mobile par la clause
// « sous 800 px, tout le monde en mobile ». L'utilisateur voyait le hamburger
// et le tiroir « Serveurs et modules » sur un ordinateur sans tactile.
//
// Deux changements :
//   1. le plancher « tout le monde en mobile » descend de 800 à 700 px ;
//   2. entre 701 et 900 px avec un pointeur fin, la barre latérale se replie
//      en RAIL D'ICÔNES de 64 px (comme Discord ou Dyno) : la disposition reste
//      PC, et le contenu garde assez de largeur pour ne rien déborder.
//
// Le mobile ne bouge toujours pas : tactile ≤ 900 px et paysages tactiles peu
// hauts gardent exactement les mêmes clauses qu'en v251.

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
const js = racine('public/js/dashboard.js');

const MQ = '(max-width: 700px), '
  + '(max-width: 900px) and (hover: none) and (pointer: coarse) and (any-pointer: coarse), '
  + '(hover: none) and (pointer: coarse) and (max-height: 800px) and (any-pointer: coarse)';
const RAIL = '@media (pointer: fine) and (min-width: 701px) and (max-width: 900px)';

console.log('— 1. Le plancher « tout mobile » est à 700 px —');
const nb = (css.match(new RegExp(MQ.replace(/[().,]/g, (c) => '\\' + c), 'g')) || []).length;
check(`les 21 requêtes du shell portent le plancher 700 px (${nb})`, nb === 21, String(nb));
check('la constante JS est alignée', js.includes(`Dashboard.MQ_ECRAN_ETROIT = '${MQ}';`));
check('le repli sans matchMedia suit le plancher', js.includes('window.innerWidth <= 700;'));
check('plus aucune clause « tout mobile » à 800 px', !/\(max-width: 800px\)/.test(css));

console.log('— 2. Le rail d\'icônes du PC étroit —');
check('le bloc rail existe, borné 701-900 px et réservé au pointeur fin',
  css.includes(RAIL + ' {'));
const bloc = css.slice(css.indexOf(RAIL));
check('…la barre latérale y fait 64 px', /\.dash-side \{ width: 64px; flex: 0 0 64px; \}/.test(bloc));
check('…les libellés des modules y sont masqués (nœud de texte nu → font-size 0)',
  /\.dash-side-item \{ font-size: 0;/.test(bloc) && /\.dash-side-item \.ico \{ font-size: 16px; \}/.test(bloc));
check('…les titres de sections, le texte du serveur et le pied y sont masqués',
  bloc.includes('.dash-side-brand-copy,') && bloc.includes('.srv-txt,') && bloc.includes('.dash-side-foot { display: none; }'));
check('…le rail ne s\'applique JAMAIS au tactile (sinon une tablette le prendrait)',
  RAIL.includes('(pointer: fine)'));
check('…ni au PC large (au-delà de 900 px, sidebar normale)',
  RAIL.includes('(max-width: 900px)'));

console.log('— 3. Le mobile ne bouge pas —');
check('la clause tactile 700-900 px est intacte',
  MQ.includes('(max-width: 900px) and (hover: none) and (pointer: coarse) and (any-pointer: coarse)'));
check('la clause « paysage tactile peu haut » est intacte',
  MQ.includes('(hover: none) and (pointer: coarse) and (max-height: 800px) and (any-pointer: coarse)'));
check('sous 700 px, tout le monde reste en mobile (fenêtre minuscule comprise)',
  MQ.startsWith('(max-width: 700px)'));

console.log('— 4. Version —');
const index = racine('public/index.html');
const sw = racine('public/sw.js');
check('index.html : ?v=269 référencé 7 fois', (index.match(/\?v=269/g) || []).length === 7,
  String((index.match(/\?v=269/g) || []).length));
check('sw.js : cache « botdev-v269 »', sw.includes("const CACHE = 'botdev-v269';"));

console.log('');
if (ko === 0) console.log(`🎉 v252 — ${ok} vérifications OK : plus aucun PC en mobile, rail d'icônes entre 701 et 900 px.`);
else { console.log(`❌ v252 — ${ko} échec(s)`); process.exitCode = 1; }
