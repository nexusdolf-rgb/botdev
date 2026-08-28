// Test v159 — réglages en lignes façon Discord/DraftBot + pieds de carte
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const js = read('public/js/dashboard.js');
const css = read('public/css/dashboard.css');
const index = read('public/index.html');
const sw = read('public/sw.js');

// 1. Le post-processeur de mise en lignes existe et est branché sur le rendu
assert(js.includes('Dashboard.layoutSettingRows'), 'post-processeur layoutSettingRows manquant');
assert(js.includes('Dashboard.SETTING_ROW_CONTROLS'), 'liste des contrôles reconnus manquante');
assert(/\await fn\(content, data\);\s*\n\s*\/\/ 🧷 Mise en page/.test(js), 'le post-traitement n’est pas appelé après le rendu du module');

// 2. Les lignes : libellé à gauche, contrôle à droite, repli mobile
assert(css.includes('🧷 Lignes de réglage façon Discord/DraftBot (v159)'), 'couche CSS des lignes manquante');
assert(css.includes('.setting-row {'), 'styles .setting-row manquants');
assert(css.includes('.setting-row > .dash-label'), 'placement du libellé manquant');
assert(css.includes('@media (max-width: 700px)'), 'repli mobile manquant');

// 3. Pieds de carte : actions regroupées à droite
assert(js.includes("foot.className = 'card-actions'"), 'regroupement des boutons manquant');
assert(css.includes('.card-actions {'), 'styles .card-actions manquants');

// 4. Version v159 déployée (cache PWA + assets)
assert(!index.includes('?v=158'), 'index.html référence encore v158');
assert.strictEqual((index.match(/\?v=159/g) || []).length, 7, 'index.html doit référencer v159 7 fois');
assert(sw.includes("'botdev-v159'"), 'le cache du service worker n’est pas en v159');

console.log('✅ v159 : réglages en lignes façon Discord/DraftBot, pieds de carte, cache v159');
