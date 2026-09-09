// v251 — Correctif (suite de la v250) : un PC TACTILE reste en disposition PC.
//
// Photos reçues de l'utilisateur : un PC portable HP à écran tactile affichait
// le tableau de bord en mode mobile malgré le correctif v250. Explication :
// une règle ancienne, écrite pour les TÉLÉPHONES tournés en paysage, dit
// « appareil tactile + écran peu haut (≤ 800 px) = mobile ». Un portable
// tactile de 768 px de haut entre pile dans cette case.
//
// La distinction qui manque : un PC tactile possède AUSSI un pavé tactile ou
// une souris — donc un « pointeur fin ». Un téléphone n'a que le doigt. La
// fonction média `any-pointer: coarse` n'est vraie que si AUCUN pointeur fin
// n'existe : elle sépare exactement les deux cas.
//
// Les deux clauses tactiles (700-900 px, et « paysage peu haut ») exigent
// désormais `any-pointer: coarse`. Un téléphone ou une tablette sans souris
// gardent exactement le même comportement qu'avant ; un PC tactile repasse
// en disposition PC.

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

console.log('— 1. Les deux clauses tactiles exigent l\'absence de pointeur fin —');
const nbComplet = (css.match(new RegExp(MQ.replace(/[().,]/g, (c) => '\\' + c), 'g')) || []).length;
check(`les 21 requêtes du shell portent la règle complète (${nbComplet})`, nbComplet === 21, String(nbComplet));
// Aucune clause tactile « nue » ne doit survivre : ce sont elles qui envoyaient
// le PC tactile de l'utilisateur en mobile.
const nue2 = (css.match(/\(max-width: 900px\) and \(hover: none\) and \(pointer: coarse\)(?! and \(any-pointer: coarse\))/g) || []).length;
const nue3 = (css.match(/\(max-height: 800px\)(?! and \(any-pointer: coarse\))/g) || []).length;
check('plus aucune clause « 700-900 px tactile » sans any-pointer', nue2 === 0, String(nue2));
check('plus aucune clause « paysage peu haut » sans any-pointer', nue3 === 0, String(nue3));
check('le plancher « tout le monde en mobile » sous 700 px est inchangé',
  MQ.startsWith('(max-width: 700px)'));

console.log('— 2. Cohérence CSS / JS —');
check('la constante JS est exactement la chaîne du CSS',
  css.includes('@media ' + MQ) && js.includes(`Dashboard.MQ_ECRAN_ETROIT = '${MQ}';`));
check('le repli sans matchMedia garde le plancher 700 px',
  js.includes('window.innerWidth <= 700;'));

console.log('— 3. Le téléphone ne bouge pas —');
// Un téléphone n'a aucun pointeur fin : any-pointer: coarse y est vrai, les
// deux clauses tactiles s'appliquent donc exactement comme avant la v251.
check('les clauses tactiles restent entières pour un appareil sans souris',
  MQ.includes('(hover: none) and (pointer: coarse) and (max-height: 800px) and (any-pointer: coarse)'));
check('…et la clause tactile 700-900 px aussi',
  MQ.includes('(max-width: 900px) and (hover: none) and (pointer: coarse) and (any-pointer: coarse)'));

console.log('— 4. Version —');
const index = racine('public/index.html');
const sw = racine('public/sw.js');
check('index.html : ?v=259 référencé 7 fois', (index.match(/\?v=259/g) || []).length === 7,
  String((index.match(/\?v=259/g) || []).length));
check('sw.js : cache « botdev-v259 »', sw.includes("const CACHE = 'botdev-v259';"));

console.log('');
if (ko === 0) console.log(`🎉 v251 — ${ok} vérifications OK : un PC tactile avec souris reste un PC.`);
else { console.log(`❌ v251 — ${ko} échec(s)`); process.exitCode = 1; }
