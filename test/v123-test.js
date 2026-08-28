// Test v3.19 — Design System global du dashboard
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'public/css/dashboard.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');

for (const selector of [
  '.dash-side-item', '.dash-topbar', '.dash-card', '.dash-iconbtn',
  '.dash-input', '.dash-select', '.dash-btn', '.dash-btn-primary',
  '.dash-module-header', '.dash-stat',
]) assert.ok(styles.includes(selector), `style manquant : ${selector}`);
assert.ok(styles.includes('appearance: none'));
assert.ok(styles.includes('background-image: url("data:image/svg+xml'));
assert.ok(styles.includes('prefers-reduced-motion'));
assert.ok(styles.includes('@media (max-width: 900px)'));
assert.strictEqual((index.match(/\?v=163/g) || []).length, 7);
assert.ok(sw.includes("const CACHE = 'botdev-v163';"));

console.log('✅ v3.19 : design system du dashboard, sélecteurs premium, boutons et responsive');
