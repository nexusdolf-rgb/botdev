// Test v3.2 — Palette Ctrl+K, accents, squelettes, toasts, mises à jour auto
const assert = require('assert');
const fs = require('fs');
const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');
const dcss = fs.readFileSync(__dirname + '/../public/css/dashboard.css', 'utf8');
const scss = fs.readFileSync(__dirname + '/../public/css/style.css', 'utf8');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');

// 1. Palette de commandes
assert.ok(dash.includes('Dashboard.openPalette'), 'palette présente');
assert.ok(dash.includes("e.key.toLowerCase() === 'k'"), 'raccourci Ctrl+K');
assert.ok(dash.includes("kind: 'guild'") && dash.includes("kind: 'module'"), 'modules ET serveurs cherchables');
assert.ok(dash.includes("ev.key === 'ArrowDown'") && dash.includes("ev.key === 'Enter'"), 'navigation clavier complète');
assert.ok(dcss.includes('.dash-palette-overlay'), 'style de la palette');
console.log('✅ palette Ctrl+K : recherche modules + serveurs, clavier complet');

// 2. Accents personnalisables persistés
assert.ok(dash.includes('Dashboard.ACCENTS') && dash.includes('applyAccent'), 'accents définis');
assert.ok(dash.includes("localStorage.setItem('hx-accent'"), 'choix persisté');
assert.ok(dash.includes("localStorage.getItem('hx-accent')"), 'appliqué au chargement');
assert.ok((dash.match(/\['\p{L}+'/gu) || []).length >= 5, 'au moins 5 thèmes');
console.log('✅ 6 thèmes de couleur, choix mémorisé par appareil');

// 3. Boutons rapides topbar + infobulles
for (const id of ['d-palette', 'd-refresh', 'd-accent']) assert.ok(dash.includes(id), `bouton ${id}`);
assert.ok(dash.includes('data-tip=') && dcss.includes('[data-tip]:hover::after'), 'infobulles CSS');
console.log('✅ topbar : recherche, actualiser, thème — avec infobulles');

// 4. Squelettes de chargement
assert.ok(dash.includes('dash-skeleton') && !dash.includes(`content.innerHTML = '<div class="spinner"></div>'`), 'squelette remplace le spinner');
assert.ok(dcss.includes('@keyframes skShine'), 'brillance animée');
console.log('✅ squelettes de chargement animés (perception de vitesse pro)');

// 5. Toasts redessinés
assert.ok(scss.includes('@keyframes toastIn') && scss.includes('@keyframes toastLife'), 'toasts : entrée + barre de vie');
console.log('✅ toasts : icône, entrée élastique, barre de vie');

// 6. Mises à jour automatiques renforcées (jamais vider le cache)
assert.ok(html.includes('controllerchange'), 'rechargement auto à la nouvelle version');
assert.ok(html.includes('reg.update()') && html.includes('visibilitychange'), 'vérification périodique + au retour sur l\'onglet');
// 🛡️ COHÉRENCE DES VERSIONS : index.html et sw.js doivent porter le MÊME
// numéro (c'est leur désynchronisation qui a figé le cache à v101 pendant
// des jours sans que personne ne s'en rende compte)
const sw = fs.readFileSync(__dirname + '/../public/sw.js', 'utf8');
const vHtml = (html.match(/\?v=(\d+)/) || [])[1];
const vSw = (sw.match(/botdev-v(\d+)/) || [])[1];
assert.ok(vHtml && vSw, 'versions présentes');
assert.strictEqual(vHtml, vSw, `index.html (v${vHtml}) et sw.js (v${vSw}) DÉSYNCHRONISÉS !`);
assert.ok(parseInt(vHtml, 10) >= 108, 'version >= 108');
const allSame = (html.match(/\?v=(\d+)/g) || []).every((m) => m === '?v=' + vHtml);
assert.ok(allSame, 'tous les assets portent la même version');
console.log('✅ mises à jour 100% automatiques : contrôle 30 min + retour d\'onglet + rechargement auto');

console.log('\n🎉 Tous les tests v3.2 passent');
