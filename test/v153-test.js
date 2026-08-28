// Test v12 — accueil en deux colonnes : configuration, résumé et activité
const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('public/js/dashboard.js', 'utf8');
const css = fs.readFileSync('public/css/dashboard.css', 'utf8');
assert(source.includes('ov-home-columns'));
assert(source.includes('ov-config-row'));
assert(source.includes('ov-home-side'));
assert(source.includes('Bienvenue dans ton espace de gestion'));
assert(css.includes('NEXORA v12.0 — Accueil en espace de travail'));
for (const selector of ['.dashboard-shell-host .ov-home-columns', '.dashboard-shell-host .ov-config-list', '.dashboard-shell-host .ov-home-side-section', '.dashboard-shell-host .ov-module-section']) {
  assert(css.includes(selector), `style d’accueil manquant : ${selector}`);
}
assert(css.includes('.dashboard-shell-host .ov-module-grid::before { display: none; }'));
console.log('✅ v12 : accueil réellement restructuré en espace de travail Draft Panel');
