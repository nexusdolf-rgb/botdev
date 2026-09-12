// v253 — Correctif final : « PC ou mobile » décidé par le SYSTÈME, pas par des mesures.
//
// Après trois correctifs fondés sur des mesures (largeur v250, tactile v251,
// plancher + rail v252), un PC refusait toujours la disposition PC : certains
// ordinateurs fauxent TOUTES les mesures — échelle d'affichage Windows qui
// réduit la largeur CSS, écran tactile déclaré pointeur principal, hauteur
// utile sous 800 px…
//
// Donc on ne mesure plus : index.html pose la classe `hx-os-pc` d'après le
// USER-AGENT du système (Windows / Mac / Linux / ChromeOS = PC ; Android,
// iPhone, iPad — y compris déguisé en Mac — = mobile). Entre 481 et 900 px,
// un OS de bureau voit la coquille mobile (hamburger, tiroirs, barre basse,
// onglets horizontaux) neutralisée et la barre latérale revenir en rail
// d'icônes vertical. Au-delà de 900 px le bloc ne fait rien ; sous 481 px
// même un PC passe en mobile.
//
// Les appareils mobiles n'ont pas la classe : leur rendu est inchangé.

const fs = require('node:fs');
const path = require('node:path');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const index = racine('public/index.html');
const css = racine('public/css/dashboard.css');
const js = racine('public/js/dashboard.js');

console.log('— 1. La classe hx-os-pc est posée avant le premier rendu —');
check('index.html décide du système avant tout rendu (tout début du <body>, avant le thème et le tableau de bord)',
  index.indexOf("classList.add('hx-os-pc')") < index.indexOf('hx-theme')
  && index.indexOf("classList.add('hx-os-pc')") < index.indexOf('/js/dashboard.js'));
check('…les OS de bureau sont reconnus (Windows, Mac, Linux, ChromeOS)',
  /Windows NT\|Macintosh\|X11\|Linux\|CrOS/.test(index));
check('…les OS mobiles excluent la classe (Android, iPhone, iPad, iPod…)',
  /Android\|iPhone\|iPad\|iPod/.test(index));
check('…un iPad déguisé en Mac est démasqué par ses points tactiles',
  /Macintosh\/.test\(ua\) && navigator\.maxTouchPoints > 1|ipadEnMac = \/Macintosh\/\.test\(ua\) && navigator\.maxTouchPoints > 1/.test(index));
check('…une exception ne laisse jamais un navigateur sans décision (try/catch)',
  /try \{[\s\S]{0,400}hx-os-pc[\s\S]{0,80}\} catch \{\}/.test(index));

console.log('— 2. Le bloc CSS neutralise la coquille mobile sur OS de bureau —');
// v254 : le correctif a été restructuré en trois paliers (socle ≥ 481 px,
// rail 481-900, barre complète ≥ 901). Les vérifications v253 portent sur le
// socle commun, qui commence au premier palier.
// v257 : le rail d'icônes 481-900 px a été retiré sur PC — l'utilisateur
// veut la barre latérale pleine avec textes, comme la v241, à toutes largeurs.
check('le rail PC a été retiré (v257) : plus de barre de 64 px préfixée hx-os-pc',
  !css.includes("html.hx-os-pc .dashboard-shell-host .dash-side { width: 64px"));
const zone = css.slice(css.indexOf('@media (min-width: 481px) {'));
check('…il remet la coquille EN LIGNE et le rail EN COLONNE (le bug du bandeau horizontal)',
  zone.includes('html.hx-os-pc .dashboard-shell-host .dash-shell { flex-direction: row; }')
  && zone.includes('flex-direction: column;'));
check('…hamburger, barre basse, tiroirs et fond noir y sont masqués',
  zone.includes('.dash-mobile-bar,') && zone.includes('.dash-bnav,')
  && zone.includes('.dash-mobile-drawer,') && zone.includes('.dash-mobile-backdrop,'));
check('…le fil d\'ariane du haut revient (sinon topbar vide)',
  zone.includes('html.hx-os-pc .dashboard-shell-host .dash-crumb { display: flex; }'));
// Chaque règle du bloc doit être préfixée hx-os-pc : sans ça, un téléphone
// hériterait du rail de bureau. On compte les sélecteurs de coquille non
// préfixés : il doit y en avoir zéro.
const selecteurs = zone.slice(0, zone.indexOf('\n}')).match(/^\s*[^@/][^{]*\{/gm) || [];
const nonPrefixes = selecteurs.filter((l) => l.includes('.dash-') && !l.includes('hx-os-pc'));
check('…chaque règle du bloc est préfixée hx-os-pc (sinon un téléphone le prendrait)',
  nonPrefixes.length === 0 && selecteurs.length >= 8,
  nonPrefixes.join(' | ').slice(0, 120));

console.log('— 3. Le JS suit la même règle —');
check('ecranEtroit rend faux sur OS de bureau au-delà de 480 px (pas de repli mobile)',
  /classList\.contains\('hx-os-pc'\)/.test(js) && /window\.innerWidth > 480\) return false;/.test(js));

console.log('— 4. Les anciens filets restent en place —');
check('les 21 requêtes médias à mesures existent toujours (double sécurité)',
  (css.match(/@media \(max-width: 700px\), \(max-width: 900px\) and \(hover: none\)/g) || []).length === 21,
  String((css.match(/@media \(max-width: 700px\), \(max-width: 900px\) and \(hover: none\)/g) || []).length));
check('le rail « pointeur fin » 701-900 px existe toujours',
  css.includes('@media (pointer: fine) and (min-width: 701px) and (max-width: 900px)'));

console.log('— 5. Version —');
check('index.html : ?v=276 référencé 7 fois', (index.match(/\?v=276/g) || []).length === 7,
  String((index.match(/\?v=276/g) || []).length));
check('sw.js : cache « botdev-v276 »', racine('public/sw.js').includes("const CACHE = 'botdev-v276';"));

console.log('');
if (ko === 0) console.log(`🎉 v253 — ${ok} vérifications OK : un PC est un PC, un mobile est un mobile, sans mesure.`);
else { console.log(`❌ v253 — ${ko} échec(s)`); process.exitCode = 1; }
