// v256 — Sur OS de bureau, l'INTÉRIEUR des panneaux revient au visage v241.
//
// La v255 avait restauré la COQUE v241 (sidebar 278 px, marque centrée, fil
// d'ariane, cartes ouvertes). Mais de la v244 à la v248, l'intérieur des
// panneaux PC était devenu un « espace de configuration » : cartes aplaties
// en sections séparées d'un trait, titres géants soulignés, saisies et
// boutons façon Discord sombre. C'est ce que l'utilisateur voyait encore
// comme « rien à voir avec l'ancien ».
//
// La v256 restaure donc, uniquement sous hx-os-pc, les valeurs v241 de
// chaque composant : cartes arrondies à bordure, titre de module 22 px à
// icône 46 px en carré dégradé, saisies arrondies 10 px, boutons v241,
// stats et tableaux d'origine. Toutes les valeurs viennent de variables de
// thème : le visage est juste en clair comme en sombre. Le mobile garde le
// visage actuel.

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
const index = racine('public/index.html');

const deb = css.indexOf("/* --- v256 : sur OS de bureau, l'INTÉRIEUR des panneaux");
// Le bloc v256 s'arrête avant le bloc suivant (palier B retiré en v257,
// bloc v258 ajouté en fin de fichier) : on coupe au premier des deux.
const finB = css.indexOf("/* --- Palier B : 481-900 px, rail d'icônes de 64 px --- */");
const finV258 = css.indexOf('/* --- v258');
const fin = Math.min(finB > 0 ? finB : Infinity, finV258 > 0 ? finV258 : Infinity, css.length);
check('le bloc v256 existe', deb > 0 && deb < fin);
const zone = css.slice(deb, fin);

console.log('— 1. Les cartes redeviennent des cartes —');
check('fond et bordure de carte restaurés (fini les sections aplaties)',
  zone.includes('background: var(--d-card) !important;') && zone.includes('border-radius: 14px !important;'));
check('…y compris les petites cartes de l\'accueil',
  zone.includes('.ov-module-card') && zone.includes('.ov-intro'));

console.log('— 2. Titres et en-têtes v241 —');
check('titre de module 22 px (pas le titre géant de la v244)',
  zone.includes('font-size: 22px; letter-spacing: -.3px;'));
check('icône de module 46 px en carré dégradé',
  zone.includes('width: 46px; height: 46px; border-radius: 13px;'));
check('en-tête de carte souligné d\'un trait fin, comme v241',
  zone.includes('.dash-card[data-dash-card] .card-head') && zone.includes('border-bottom: 1px solid rgba(49,65,88,.62);'));

console.log('— 3. Formulaires et boutons v241 —');
check('saisies arrondies 10 px sur fond de thème (pas les boîtes Discord)',
  zone.includes('border-radius: 10px !important;') && zone.includes('background: var(--d-card2) !important;'));
check('boutons v241 : rayon 9 px, fond card2, léger relief au survol',
  zone.includes('border-radius: 9px;') && zone.includes('transform: translateY(-1px) !important;'));
check('stats et tableaux d\'origine',
  zone.includes('.dash-stat') && zone.includes('.dash-table th'));

console.log('— 4. Rien ne fuite vers le mobile —');
const regles = zone.match(/^html\.hx-os-pc|,\nhtml\.hx-os-pc/g) || [];
const selBruts = zone.split('{').slice(0, -1).filter((m) => m.includes('.dash-') || m.includes('.ov-') || m.includes('.am-') || m.includes('.adv-'));
check('chaque sélecteur du bloc est préfixé hx-os-pc',
  selBruts.every((m) => (m.match(/\.\w/g) || []).length === 0 || m.includes('hx-os-pc')),
  String(selBruts.length));
check('les gardes v255 (pas de pliage sur PC) sont toujours là',
  (racine('public/js/dashboard.js').match(/classList\.contains\('hx-os-pc'\)\) return 0;/g) || []).length === 2);
check('la classe hx-os-pc vient toujours du système (v253)',
  index.includes("classList.add('hx-os-pc')"));

console.log('— 5. Version —');
check('index.html : ?v=265 référencé 7 fois', (index.match(/\?v=265/g) || []).length === 7,
  String((index.match(/\?v=265/g) || []).length));
check('sw.js : cache « botdev-v265 »', racine('public/sw.js').includes("const CACHE = 'botdev-v265';"));

console.log('');
if (ko === 0) console.log(`🎉 v256 — ${ok} vérifications OK : l'intérieur des panneaux PC est redevenu celui de la v241.`);
else { console.log(`❌ v256 — ${ko} échec(s)`); process.exitCode = 1; }
