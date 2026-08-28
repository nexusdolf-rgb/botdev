// Test v10 — layout Draft Panel : fond ardoise, sidebar et sections ouvertes
const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('public/js/dashboard.js', 'utf8');
const css = fs.readFileSync('public/css/dashboard.css', 'utf8');

assert(css.includes('NEXORA v10.0 — Draft Panel layout'));
for (const color of ['#36393f', '#2b2d31', '#40444b', '#e07a5f', '#72767d']) {
  assert(css.includes(color), `palette Draft Panel manquante : ${color}`);
}
for (const selector of [
  '.dashboard-shell-host .dash-side',
  '.dashboard-shell-host .dash-main',
  '.dashboard-shell-host .dash-module-header',
  '.dashboard-shell-host #dash-content > .dash-card[data-dash-card]',
  '.dashboard-shell-host .dash-btn-primary',
  '.dashboard-shell-host .dash-select',
]) {
  assert(css.includes(selector), `structure Draft Panel manquante : ${selector}`);
}
assert(css.includes('.dashboard-shell-host .dash-crumb { display: none; }'));
assert(css.includes('.dashboard-shell-host .dash-btn::before'));
assert(css.includes('background: #e07a5f !important'));
assert(source.includes("shell.classList.add('dashboard-shell-host')"));
console.log('✅ v10 : layout Draft Panel, palette argile, sidebar, sections et boutons vérifiés');
