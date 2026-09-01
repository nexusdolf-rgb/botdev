// Test v194 — Phase 2 « Dashboard Ultra Pro » : finitions UX
// Couche additive sur dashboard.css + améliorations ciblées JS.
// Vérifie que la refonte est en place SANS supprimer les classes existantes.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const css = read('public/css/dashboard.css');
const js = read('public/js/dashboard.js');
const index = read('public/index.html');
const sw = read('public/sw.js');
let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};

// ---------- 1. Couche v194 présente dans le CSS ----------
console.log('\n1️⃣  Couche Ultra Pro v194 (dashboard.css)');
check('marqueur « HOXERA ULTRA PRO v194 »', css.includes('HOXERA ULTRA PRO v194'));
check('tokens de design --dp-*', css.includes('--dp-radius-card: 16px') && css.includes('--dp-shadow-card'));
check('focus visible restauré (outline !important)', css.includes('.dash-btn:focus-visible') && css.includes('outline: 3px solid var(--dp-ring) !important'));
check('états vides affinés (.dash-empty)', css.includes('.dashboard-shell-host .dash-empty {') && css.includes('border: 1.5px dashed'));
check('micro-interaction cartes (hover lift)', css.includes('.dash-card:hover') && css.includes('translateY(-2px)'));
check('tableaux : survol de ligne', css.includes('.dash-table tbody tr:hover'));
check('scrollbar fine', css.includes('::-webkit-scrollbar { width: 8px; }'));
check('réduction de mouvement globale', css.includes('prefers-reduced-motion: reduce') && css.includes('animation-iteration-count: 1 !important'));
check('mode clair v194', css.includes('html.hx-light .dashboard-shell-host .dash-card {'));

// ---------- 2. Aucune classe existante retirée ----------
console.log('\n2️⃣  Compatibilité : classes historiques toujours présentes');
const cssClasses = [
  'dash-side-brand', 'dash-side-item', 'dash-module-header', 'dash-state-card',
  'ov-intro', 'ov-quick-actions', 'ov-progress-track', 'ov-module-card',
  'ov-home-columns', 'ov-config-row', 'ov-home-side', 'dash-mobile-bar',
  'dash-mobile-modules-drawer', 'dash-skeleton', 'dash-savebar', 'dash-crumb',
  'dash-bell-pop', 'dash-accent-pop',
];
for (const cls of cssClasses) check(`CSS « .${cls} » conservé`, css.includes(cls));
const jsClasses = ['dash-retry', 'dash-mobile-site-drawer'];
for (const cls of jsClasses) check(`JS « ${cls} » conservé`, js.includes(cls));

// ---------- 3. Améliorations JS ----------
console.log('\n3️⃣  Améliorations JS (dashboard.js)');
check('cartes modules enrichies (data-module-card)', js.includes('data-module-card'));
check('badge d\'état Activé/Désactivé', js.includes("'● Activé'") && js.includes("'○ Désactivé'"));
check('compteur de commandes', js.includes('commande${count > 1'));
check('scrollToTop respecte prefers-reduced-motion', js.includes("prefers-reduced-motion: reduce").length || js.includes('behavior: reduce ?'));
check('aria-label sur les interrupteurs de modules', js.includes('aria-label="Module '));

// ---------- 4. Version + accessibilité ----------
console.log('\n4️⃣  Version et accessibilité');
check('index.html : ?v=198 référencé 7 fois', (index.match(/\?v=198/g) || []).length === 7);
check('index.html : plus aucune ?v=193', !index.includes('?v=193'));
check('sw.js : cache v194', sw.includes("const CACHE = 'botdev-v198';"));
check('conteneur de notifications annoncé (aria-live)', index.includes('<div id="toasts" aria-live="polite">'));

console.log(failures === 0
  ? '\n🎉 Tous les tests v1.94 passent — Dashboard Ultra Pro en place !'
  : `\n❌ ${failures} vérification(s) en échec`);
process.exit(failures === 0 ? 0 : 1);
