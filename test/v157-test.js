// Test v157 — sélecteurs façon panel pro + identité Argile par défaut
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const js = read('public/js/dashboard.js');
const css = read('public/css/dashboard.css');
const index = read('public/index.html');
const sw = read('public/sw.js');

// 1. Le composant menu déroulant custom existe et est branché
assert(js.includes('Dashboard.dropdownMenu'), 'composant dropdownMenu manquant');
assert(js.includes('Dashboard.enhanceSelect'), 'amélioration automatique des <select> manquante');
assert(js.includes('Dashboard.enhanceSelects'), 'enhanceSelects manquant');
assert(js.includes("select.dash-select:not([data-dd])"), 'le sélecteur de ciblage des <select> a changé');
assert(js.includes('MutationObserver(() => Dashboard.enhanceSelects(zone))'), 'observation du DOM manquante (sélecteurs ajoutés en asynchrone)');

// 2. Le sélecteur de serveur et le multi-sélecteur utilisent le dropdown custom
assert(!js.includes('<select aria-label="Changer de serveur">'), "l'ancien select invisible du sélecteur de serveur est encore là");
assert(js.includes('Dashboard.openServerPicker'), 'grille de sélection des serveurs manquante');
assert(js.includes('dd-add-btn'), 'bouton ＋ Ajouter du multi-sélecteur manquant');

// 3. Le panneau : recherche, options, état sélectionné, navigation clavier, feuille mobile
assert(css.includes('.dd-panel'), 'styles du panneau manquants');
assert(css.includes('.dd-search'), 'styles de la recherche manquants');
assert(css.includes('.dd-option.is-selected'), 'état sélectionné manquant');
assert(css.includes('.dd-panel.is-sheet'), 'feuille mobile manquante');
assert(css.includes('.dd-trigger'), 'styles du déclencheur manquants');
assert(css.includes('.dd-add-btn'), 'styles du bouton ajouter manquants');

// 4. Identité Argile par défaut + accent RGB dynamique (plus aucun violet codé en dur)
assert(css.includes('--d-accent: #e07a5f'), 'accent par défaut Argile manquant dans :root');
assert(css.includes('--d-accent-rgb: 224,122,95'), 'composante RGB de l’accent manquante');
// (exception v168 : l'aperçu Discord de l'Embed Builder simule les vraies couleurs Discord)
assert(!css.slice(0, css.indexOf('🧱 Embed Builder') >= 0 ? css.indexOf('🧱 Embed Builder') : css.length).includes('rgba(88,101,242'), 'reste du blurple codé en dur dans le CSS');
assert(!css.includes('rgba(88, 101, 242'), 'reste du blurple espacé codé en dur dans le CSS');
assert(!css.includes('rgba(132,143,255'), 'reste du violet clair codé en dur dans le CSS');
assert(js.includes("--d-accent-rgb"), 'l’applicateur d’accent ne pilote pas --d-accent-rgb');

// 5. Gamme de boutons cohérente
assert(css.includes('.dash-btn-sm'), 'taille sm des boutons manquante');
assert(css.includes('.dash-btn-lg'), 'taille lg des boutons manquante');
assert(css.includes('.dash-btn:focus-visible'), 'anneau de focus des boutons manquant');

// 6. Version v157 déployée (cache PWA + assets)
// version gérée par le test de la version courante (v158)



console.log('✅ v157 : sélecteurs custom façon panel pro, identité Argile, boutons unifiés — dashboard v157');
