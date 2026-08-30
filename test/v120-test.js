// Test v3.17 — refonte visuelle du dashboard et du constructeur de tickets
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public/css/dashboard.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');

// Le constructeur visuel reste dans la carte du nouveau système et expose
// les mêmes actions : aucune route ni aucun identifiant historique n'est changé.
assert.ok(dashboard.includes("c3.classList.add('adv-builder-card')"));
assert.ok(dashboard.includes('adv-builder-grid'));
assert.ok(dashboard.includes('adv-types-panel'));
assert.ok(dashboard.includes('adv-preview-shell'));
assert.ok(dashboard.includes('adv-builder-actions'));
assert.ok(dashboard.includes('adv-type-card') && dashboard.includes('adv-question-row'));
assert.ok(dashboard.includes('id="adv-save"') && dashboard.includes('id="adv-send"'));
assert.ok(dashboard.includes('advTypeCountEl'));

// Chaque nouvelle classe visuelle utilisée par le constructeur possède bien
// une règle CSS, y compris le mode mobile et le mode clair.
for (const selector of [
  '.adv-builder-card', '.adv-builder-grid', '.adv-types-panel', '.adv-type-card',
  '.adv-question-row', '.adv-preview-shell', '.adv-discord-preview',
  '.adv-builder-actions', '.adv-check-row', '.adv-add-type',
]) assert.ok(styles.includes(selector), `CSS manquant : ${selector}`);
assert.ok(styles.includes('@media (max-width: 900px)'));
assert.ok(styles.includes('prefers-reduced-motion'));

// Le cache frontend est invalidé avec une nouvelle version sur toutes les
// ressources versionnées.
assert.strictEqual((index.match(/\?v=190/g) || []).length, 7);
assert.ok(sw.includes("const CACHE = 'botdev-v190';"));

console.log('✅ v3.17 : dashboard premium, aperçu en deux colonnes, cartes types et mobile');
