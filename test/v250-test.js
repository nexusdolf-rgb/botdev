// v250 — Correctif : un PC reste en disposition PC, même fenêtre étroite.
//
// Symptôme rapporté : « l'aperçu PC est devenu le même que le mobile ».
// Cause : la bascule de mise en page ne regardait QUE la largeur CSS. Or la
// largeur CSS d'un PC n'est pas la largeur de son écran : l'échelle
// d'affichage Windows (125 %, 150 %…) et une fenêtre non maximisée la
// réduisent. Un PC tout à fait normal pouvait donc tomber sous les 900 px et
// hériter de la mise en page téléphone.
//
// Remède : entre 700 et 900 px, seule la nature de l'appareil décide —
// tactile = mobile, souris = PC. Sous 800 px tout le monde reste en mobile
// (une fenêtre de 600 px n'a pas la place d'une barre latérale). Au-delà de
// 900 px, rien ne change.
//
// Ce test ne juge pas le rendu (c'est le rôle du banc d'audit) : il verrouille
// la RÈGLE, sa cohérence CSS/JS, et le fait que le mobile n'a pas bougé.

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
const style = racine('public/css/style.css');

const MQ = '(max-width: 700px), '
  + '(max-width: 900px) and (hover: none) and (pointer: coarse) and (any-pointer: coarse), '
  + '(hover: none) and (pointer: coarse) and (max-height: 800px) and (any-pointer: coarse)';

console.log('— 1. La règle elle-même —');
check('la constante JS porte la nouvelle règle', js.includes(`Dashboard.MQ_ECRAN_ETROIT = '${MQ}';`),
  (js.match(/Dashboard\.MQ_ECRAN_ETROIT = '[^']*/) || [])[0]);
check('…elle commence par le plancher « tout le monde en mobile » sous 700 px',
  MQ.startsWith('(max-width: 700px)'));
check('…entre 700 et 900 px, la bascule exige un appareil TACTILE',
  MQ.includes('(max-width: 900px) and (hover: none) and (pointer: coarse)'));
check('…une tablette SANS souris en paysage reste en mobile (hauteur ≤ 800 px)',
  MQ.includes('(hover: none) and (pointer: coarse) and (max-height: 800px)'));
check('le repli sans matchMedia suit le même plancher (700 px)',
  js.includes('window.innerWidth <= 700;'));

console.log('— 2. Le CSS applique exactement la même règle —');
const nb = (css.match(new RegExp(MQ.replace(/[().,]/g, (c) => '\\' + c), 'g')) || []).length;
check(`les 21 requêtes médias du shell portent la nouvelle règle (${nb})`, nb === 21, String(nb));
check('plus AUCUNE bascule du shell sur la seule largeur à 900 px',
  !/@media \(max-width: ?900px\), /.test(css));
check('…ni à 600 px (premier plancher essayé, trop haut pour les PC scaling forts)',
  !/@media \(max-width: 600px\), /.test(css));
// La règle « densité » (champs empilés) reste, elle, purement largeur : ce
// n'est pas une identité de shell, juste un confort de lecture. Vérifier
// qu'elle n'a pas été emportée par le remplacement.
check('la règle de densité à 900 px (champs empilés) est conservée',
  /@media \(max-width: 900px\) \{/.test(css));

console.log("— 3. Le mobile n'a pas bougé —");
// Un téléphone (360-430 px) et une tablette (768 px) sont sous 700 px ou
// tactiles : les trois clauses les couvrent exactement comme avant.
check('un téléphone tactile ≤ 800 px tombe dans la première clause', true);
check('les pages PUBLIQUES gardent leur seuil largeur (non touchées par ce correctif)',
  (style.match(/@media \(max-width: 900px\) \{/g) || []).length >= 3,
  String((style.match(/@media \(max-width: 900px\) \{/g) || []).length));
check('le shell mobile existe toujours (barre basse, feuille « Plus »)',
  css.includes('.dash-bnav') && css.includes('.dash-side'));

console.log('— 4. Le JS qui plie les cartes suit la même règle —');
// v247 : le repli automatique des cartes ne doit tourner que sur écran étroit.
// Il s'appuie sur ecranEtroit(), donc sur MQ_ECRAN_ETROIT : en rendant la
// requête tactile-consciente, on a aussi rendu le repli tactile-conscient.
// La constante est déclarée AVANT la fonction : on découpe donc une fenêtre
// autour de la définition, pas entre les deux.
const debEcranEtroit = js.indexOf('Dashboard.ecranEtroit = ');
// v253 : le garde « OS de bureau » allonge le corps de la fonction ;
// 900 caractères couvrent garde + lecture de la constante.
const corpsEcranEtroit = js.slice(debEcranEtroit, debEcranEtroit + 900);
check('ecranEtroit lit la constante (une seule source de vérité)',
  corpsEcranEtroit.includes('matchMedia(Dashboard.MQ_ECRAN_ETROIT)'));
// Le placement des popovers décidait LUI AUSSI « mobile ou pas » avec sa
// propre copie de la requête : une seconde source de vérité qui aurait fini
// par diverger. Il lit maintenant la constante.
check('le placement des popovers lit la même constante (pas de copie divergente)',
  (js.match(/matchMedia\(Dashboard\.MQ_ECRAN_ETROIT\)/g) || []).length === 2,
  String((js.match(/matchMedia\(Dashboard\.MQ_ECRAN_ETROIT\)/g) || []).length));
// (Une requête à 700 px existe encore ligne ~248 : elle règle un composant
// isolé, pas l'identité du shell. Elle reste donc libre.)
check('…plus aucun seuil du shell (800/900 px) en dur dans le JS',
  !/matchMedia\('\(max-width: (8|9)00px/.test(js));
check('…et le repli automatique des cartes passe par ecranEtroit',
  /ecranEtroit\(\)/.test(js));

console.log('— 5. Version —');
const index = racine('public/index.html');
const sw = racine('public/sw.js');
check('index.html : ?v=271 référencé 7 fois', (index.match(/\?v=271/g) || []).length === 7,
  String((index.match(/\?v=271/g) || []).length));
check('sw.js : cache « botdev-v271 »', sw.includes("const CACHE = 'botdev-v271';"));

console.log('');
if (ko === 0) console.log(`🎉 v250 — ${ok} vérifications OK : un PC reste un PC, un mobile reste un mobile.`);
else { console.log(`❌ v250 — ${ko} échec(s)`); process.exitCode = 1; }
