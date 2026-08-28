// Test v158 — correctifs sélecteurs + accueil refondu en Argile
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const js = read('public/js/dashboard.js');
const css = read('public/css/dashboard.css');
const index = read('public/index.html');
const sw = read('public/sw.js');

// 1. 🐛 Correctif : le panneau se FERME visuellement (display:flex écrasait hidden)
assert(css.includes('.dd-panel[hidden] { display: none; }'), 'la règle dd-panel[hidden] manque — le panneau resterait ouvert');

// 2. 🐛 Correctif : fermeture au clic extérieur fiable (souris ET tactile)
assert(js.includes("'pointerdown', onDocDown"), 'écoute pointerdown manquante (tactile)');
assert(js.includes("'mousedown', onDocDown"), 'écoute mousedown manquante (souris)');
assert(js.includes("document.removeEventListener('pointerdown', onDocDown"), 'nettoyage pointerdown manquant');

// 3. Plus AUCUNE couleur violette/bleue legacy codée en dur dans le CSS
for (const legacy of ['112,130,255', '154,123,255', '96,164,255', '#6376ff', '#916dff', '#7e8efc', '#7487ff', '#a07eff', '#a08ae9', '5865F2', '8B5CF6']) {
  assert(!css.includes(legacy), `couleur legacy encore présente : ${legacy}`);
}

// 4. Accueil refondu : hero signature + actions rapides en cartes à tuiles
assert(css.includes('🏠 Accueil — Refonte Argile (v158)'), 'couche CSS de l’accueil manquante');
assert(css.includes('.dashboard-shell-host .ov-welcome-panel::before'), 'barre d’accent du hero manquante');
assert(css.includes('.dashboard-shell-host .ov-quick-action > span'), 'tuiles d’icônes des actions rapides manquantes');
assert(css.includes('.ov-qa-txt'), 'empilement titre/sous-titre des actions rapides manquant');
assert(js.includes('ov-qa-txt'), 'le HTML des actions rapides n’utilise pas le wrapper ov-qa-txt');

// 5. Version v158 déployée (cache PWA + assets)
assert(!index.includes('?v=157'), 'index.html référence encore v157');
assert.strictEqual((index.match(/\?v=158/g) || []).length, 7, 'index.html doit référencer v158 7 fois');
assert(sw.includes("'botdev-v158'"), 'le cache du service worker n’est pas en v158');

console.log('✅ v158 : panneau qui se ferme (souris + tactile), accueil Argile, zéro couleur legacy — dashboard v158');
