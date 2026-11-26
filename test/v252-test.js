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
  // v366 : deux blocs de plus portent la requete maison (les selecteurs .dd-*
  // et le bloc « Discord 48px ») — c'est exactement ce que ces controles visaient.
  // v406f : un bloc de plus, la barre laterale elle-meme. Elle basculait sur la
  // seule largeur (<= 700 px) alors que la mise en page bascule sur la requete
  // complete : sur une tablette, la barre restait en colonne dans une coquille
  // empilee et prenait 260 px de HAUT. Le compte suit, de 23 a 24.
check(`les 24 requêtes du shell portent le plancher 700 px (${nb})`, nb === 24, String(nb));
check('la constante JS est alignée', js.includes(`Dashboard.MQ_ECRAN_ETROIT = '${MQ}';`));
check('le repli sans matchMedia suit le plancher', js.includes('window.innerWidth <= 700;'));
check('plus aucune clause « tout mobile » à 800 px', !/\(max-width: 800px\)/.test(css));

console.log('— 2. Le rail d\'icônes du PC étroit —');
check('le bloc rail existe, borné 701-900 px et réservé au pointeur fin',
  css.includes(RAIL + ' {'));
const bloc = css.slice(css.indexOf(RAIL));
check('…la barre latérale y fait 64 px', /\.dash-side \{ width: 64px; flex: 0 0 64px; \}/.test(bloc));
// v406f : le libellé n'est plus masqué par font-size: 0 sur tout le bouton —
// cette astuce rapetissait aussi l'icône. Il est dans un <span class="lbl"> que
// le rail éteint explicitement, et l'icône garde sa taille.
check('…les libellés des modules y sont masqués (span .lbl éteint, pas font-size 0)',
  bloc.includes('.dash-side-item .lbl { display: none; }')
  && !/\.dash-side-item \{ font-size: 0;/.test(bloc));
// v406f — Depuis la refonte de la barre, la règle de masquage vit dans la
// section finale « rail d'icônes » (sélecteur complet `html body …`), plus
// dans l'ancien bloc. On vérifie donc le CSS entier ; la mesure au navigateur
// (800 px, pointeur fin) confirme : marque, serveur, sections, pied et
// libellés sont bien absents, la barre fait 64 px.
const railBloc = css.slice(css.lastIndexOf('/* ---------- 10.'));
check('…les titres de sections, le texte du serveur et le pied y sont masqués',
  /\.dash-side-brand-copy,\s*\n?\s*html body \.dashboard-shell-host \.dash-side-section/.test(railBloc)
  && /\.dash-side-foot \{ display: none; \}/.test(railBloc)
  && /\.dash-server-card \.srv-txt \{ display: none; \}/.test(railBloc));
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
check('index.html : ?v=406f référencé 10 fois', (index.match(/\?v=406f/g) || []).length === 10,
  String((index.match(/\?v=406f/g) || []).length));
check('sw.js : cache « hoxera-v406 »', sw.includes("const CACHE = 'hoxera-v406f';"));

console.log('');
if (ko === 0) console.log(`🎉 v252 — ${ok} vérifications OK : plus aucun PC en mobile, rail d'icônes entre 701 et 900 px.`);
else { console.log(`❌ v252 — ${ko} échec(s)`); process.exitCode = 1; }
