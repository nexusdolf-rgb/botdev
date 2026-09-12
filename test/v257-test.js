// v257 — Sur PC, le rail d'icônes disparaît : la barre latérale pleine,
// textes compris, à TOUTES les largeurs ≥ 481 px, comme la v241.
//
// Demande utilisateur : « va voir l'aperçu toi-même actuellement ». En
// ouvrant le site en ligne avec le profil de sa machine, tout le visage
// v241 était bien là… sauf entre 481 et 900 px, où subsistait le rail
// d'icônes de 64 px créé en v252 (icônes seules, sans les noms de
// modules) — un élément que la v241 ne connaissait pas.
//
// La v257 retire ce rail sur OS de bureau :
//   • le palier B préfixé hx-os-pc (rail 481-900 px) est supprimé ;
//   • le palier A rend aussi les textes de la marque et du carton serveur,
//     que le vieux bloc « pointeur fin 701-900 » (v252, non préfixé) cache ;
//   • la sidebar PC reprend `flex: 0 0 auto` : ce vieux bloc imposait
//     `flex: 0 0 64px`, et en disposition flex le basis gagne sur width —
//     sans ce correctif la barre restait à 64 px entre 701 et 900 px.
// Le banc n'accepte plus le rail comme disposition PC : à ≥ 481 px, un OS
// de bureau doit montrer une barre de plus de 200 px. Mobile inchangé.

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

console.log('— 1. Le rail PC a disparu —');
check('plus aucun palier hx-os-pc ne fixe la barre à 64 px',
  !css.includes('html.hx-os-pc .dashboard-shell-host .dash-side { width: 64px'));
check('…et plus de palier B « rail 481-900 px » du tout',
  !css.includes("/* --- Palier B : 481-900 px, rail d'icônes de 64 px --- */"));

console.log('— 2. La barre pleine tient face au vieux bloc v252 —');
check('la sidebar PC reprend flex: 0 0 auto (le basis 64 px ne gagne plus)',
  css.includes('html.hx-os-pc .dashboard-shell-host .dash-side { width: 278px; flex: 0 0 auto; padding: 20px 0 12px; }'));
check('…textes de la marque rendus (le bloc v252 les cache entre 701 et 900)',
  css.includes('html.hx-os-pc .dashboard-shell-host .dash-side-brand-copy { display: flex; }'));
check('…texte du carton serveur rendu lui aussi',
  css.includes('html.hx-os-pc .dashboard-shell-host .dash-server-card .srv-txt { display: flex; }'));

console.log('— 3. Le banc et le produit exigent la barre pleine sur PC —');
check('le banc ne connaît plus le mot railEtroit',
  !banc.includes('railEtroit'));
check('…un OS de bureau doit montrer une barre > 200 px dès 481 px',
  banc.includes("const sideOk = attenduMobile ? (dispo.side === 'none')\n      : (dispo.side === 'flex' && dispo.sideW > 200);"));
check('…le repli mobile reste jugé sur la classe système (v253)',
  banc.includes("const osPc = document.documentElement.classList.contains('hx-os-pc');"));

console.log('— 4. Le mobile et les garde-fous ne bougent pas —');
check('le bloc v252 « pointeur fin » reste pour les machines sans classe PC',
  css.includes('@media (pointer: fine) and (min-width: 701px) and (max-width: 900px) {'));
check('les 21 requêtes médias mobiles sont intactes',
  (css.match(/@media \(max-width: 700px\), \(max-width: 900px\) and \(hover: none\)/g) || []).length === 21);
check('le visage v241 (v255/v256) est toujours là',
  css.includes("/* --- v255 : sur OS de bureau, le VISAGE v241")
  && css.includes("/* --- v256 : sur OS de bureau, l'INTÉRIEUR des panneaux"));

console.log('— 5. Version —');
check('index.html : ?v=284 référencé 7 fois', (racine('public/index.html').match(/\?v=284/g) || []).length === 7,
  String((racine('public/index.html').match(/\?v=284/g) || []).length));
check('sw.js : cache « botdev-v284 »', racine('public/sw.js').includes("const CACHE = 'botdev-v284';"));

console.log('');
if (ko === 0) console.log(`🎉 v257 — ${ok} vérifications OK : la barre latérale pleine, comme en v241, à toutes les largeurs PC.`);
else { console.log(`❌ v257 — ${ko} échec(s)`); process.exitCode = 1; }
