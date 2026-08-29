// Test v14 — identité Optimus Prime : logo robot original et cache PWA
const assert = require('assert');
const fs = require('fs');
const path = require('path');

for (const file of ['public/icons/nexora-robot-mark.svg', 'public/icons/nexora-robot-mark.png', 'public/icons/nexora-robot-mark-192.png']) {
  assert(fs.existsSync(path.join(__dirname, '..', file)), `logo manquant : ${file}`);
}
const svg = fs.readFileSync(path.join(__dirname, '..', 'public/icons/nexora-robot-mark.svg'), 'utf8');
const manifest = fs.readFileSync(path.join(__dirname, '..', 'public/manifest.webmanifest'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
assert(svg.includes('emblème robot') && svg.includes('#e07a5f') && svg.includes('#f2f3f5'));
assert(manifest.includes('/icons/nexora-robot-mark.png') && manifest.includes('#e07a5f'));
assert(sw.includes('/icons/nexora-robot-mark.svg'));
assert(dashboard.includes('/icons/nexora-robot-mark.svg'));
assert(index.includes('/icons/nexora-robot-mark.png'));
console.log('✅ v14 : logo robot Optimus Prime original intégré au dashboard, favicon et PWA');
