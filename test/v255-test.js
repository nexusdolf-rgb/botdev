// v255 — Sur OS de bureau, le tableau de bord reprend son VISAGE v241.
//
// L'utilisateur, enfin en disposition PC après les v250→v254, ne retrouve
// pas « son » tableau de bord : entre la v241 et aujourd'hui, le visage PC
// a évolué (sidebar élargie à 300 px, avatar 88 px, fil d'ariane masqué,
// barre d'outils minimale, cartes pliables avec flèches et « En savoir
// plus » apparus en v245). Sa demande : « remet-moi l'ancien aperçu PC
// v241 », le mobile restant intact.
//
// La v255 restaure donc, UNIQUEMENT sous la classe hx-os-pc :
//   • la GÉOMÉTRIE v241 — sidebar 278 px (258 sous 1200 px), marque centrée
//     à avatar 82 px, entrées 13,5 px paddées 24 px, barre d'outils 48 px
//     soulignée d'un trait, fil d'ariane visible, zone de travail 24/42 px ;
//   • l'ABSENCE de pliage sur PC : cartes toutes ouvertes, sans flèches ni
//     « En savoir plus » (gardes JS dans plierTextesLongs /
//     rendreCartesPliables) — le pliage reste actif sur mobile, où il a été
//     demandé en v245.
// Les COULEURS ne sont PAS restaurées : elles restent celles du thème
// clair/sombre actuel (la première tentative recopiait la palette sombre
// v241 et donnait un texte sombre sur fond sombre en thème clair).

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
const index = racine('public/index.html');

const deb = css.indexOf('/* --- v255 : sur OS de bureau, le VISAGE v241');
const finBrut = css.indexOf("/* --- Palier B : 481-900 px, rail d'icônes de 64 px --- */");
const fin = finBrut > 0 ? finBrut : css.length;   // palier B retiré en v257
check('le bloc de restauration v241 existe', deb > 0 && deb < fin);
const restaure = css.slice(deb, fin);

console.log('— 1. La géométrie v241 est restaurée sur PC —');
check('sidebar 278 px, et 258 px sous 1200 px (comme v241)',
  restaure.includes('.dash-side { width: 278px; flex: 0 0 auto; padding: 20px 0 12px; }')
  && restaure.includes('.dash-side { width: 258px; }'));
check('marque centrée en colonne, avatar rond de 82 px',
  restaure.includes('flex-direction: column; align-items: center;')
  && restaure.includes('width: 82px; height: 82px; flex-basis: 82px; border-radius: 50%;'));
check('entrées de menu v241 : 13,5 px, paddées 24 px, hauteur 43 px, angle droit',
  restaure.includes('min-height: 43px; margin: 0; padding: 9px 24px;')
  && restaure.includes('font-size: 13.5px; font-weight: 600;')
  && restaure.includes('border-radius: 0;'));
check('barre d\'outils 48 px soulignée d\'un trait, fil d\'ariane détaillé',
  restaure.includes('min-height: 48px; margin: 0 auto 24px; padding: 0 0 12px;')
  && restaure.includes('.dash-crumb .crumb-ico {'));
check('zone de travail v241 : 24/42 px, contenu centré sur sa largeur max',
  restaure.includes('.dash-main { min-width: 0; padding: 24px 42px 72px; }')
  && restaure.includes('#dash-content { max-width: var(--d-content-max); margin: 0 auto; }'));

console.log('— 2. Les couleurs restent au thème (leçon de la première tentative) —');
check('aucun fond sombre codé en dur dans la restauration',
  !restaure.includes('background: #36393f') && !restaure.includes('background: #2b2d31')
  && !restaure.includes('background: #202225'));
check('les bordures passent par les variables de thème',
  restaure.includes('var(--d-border)') && restaure.includes('var(--d-side, #2b2d31)'));

console.log('— 3. Sur PC, plus de pliage : le visage v241 était tout ouvert —');
const garde = /classList\.contains\('hx-os-pc'\)\) return 0;/g;
check('plierTextesLongs et rendreCartesPliables s\'effacent sur OS de bureau',
  (js.match(garde) || []).length === 2, String((js.match(garde) || []).length));
check('…le pliage reste disponible sur mobile (les fonctions existent toujours)',
  js.includes('Dashboard.plierTextesLongs = (root, seuil) =>')
  && js.includes('Dashboard.rendreCartesPliables = (root) =>'));

console.log('— 4. Le mobile et le rail ne bougent pas —');
check('v257 : plus de rail — la barre pleine couvre toutes les largeurs ≥ 481 px',
  !css.includes("html.hx-os-pc .dashboard-shell-host .dash-side { width: 64px"));
check('les 21 requêtes médias mobiles sont intactes',
  (css.match(/@media \(max-width: 700px\), \(max-width: 900px\) and \(hover: none\)/g) || []).length === 21);
check('la classe hx-os-pc vient toujours du système (v253)',
  index.includes("classList.add('hx-os-pc')"));

console.log('— 5. Version —');
check('index.html : ?v=262 référencé 7 fois', (index.match(/\?v=262/g) || []).length === 7,
  String((index.match(/\?v=262/g) || []).length));
check('sw.js : cache « botdev-v262 »', racine('public/sw.js').includes("const CACHE = 'botdev-v262';"));

console.log('');
if (ko === 0) console.log(`🎉 v255 — ${ok} vérifications OK : le PC retrouve son visage v241, le mobile garde le sien.`);
else { console.log(`❌ v255 — ${ko} échec(s)`); process.exitCode = 1; }
