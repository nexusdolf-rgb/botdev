// Test v204 — Correctif « Salons à détailler » (bienvenue/départ).
// Bugs constatés en prod (module Bienvenue) :
//   1. Débordement : le champ héritait de display:flex (règle
//      « .setting-row > div ») → lignes de salons empilées à l'horizontale
//      dans un carré de ~246px → débordement massif à l'aperçu.
//   2. Impossible de sélectionner un salon : l'option « — Ajouter un
//      salon — » (placeholder) était cliquable dans le menu déroulant
//      custom → clic = rien ne se passe.
//   3. Les phrases tapées disparaissaient dès qu'on ajoutait/retirait un
//      autre salon (refresh() recréait la ligne sans mémoriser la frappe).
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v204-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  const dash = read('public/js/dashboard.js');
  const css = read('public/css/dashboard.css');

  // ================= 1. Cache-buster v204 =================
  console.log('\n1️⃣  Version v204');
  const index = read('public/index.html');
  const sw = read('public/sw.js');
  check('index.html : ?v=219 référencé 7 fois', (index.match(/\?v=219/g) || []).length === 7);
  check('index.html : plus aucune ?v=203', !index.includes('?v=203'));
  check('sw.js : cache botdev-v219', sw.includes("const CACHE = 'botdev-v219';"));
  check('sw.js : plus de botdev-v203', !sw.includes('botdev-v203'));

  // ================= 2. Layout plein largeur (bug 1) =================
  console.log('\n2️⃣  Débordement du champ corrigé');
  check('layoutSettingRows ignore le champ channelsmulti', dash.includes("if (next.classList && next.classList.contains('dash-channelsmulti')) return;"));
  check('CSS : .dash-channelsmulti en bloc pleine largeur', css.includes('.dash-channelsmulti {\n  display: block; width: 100%; min-width: 0; margin-top: 4px;'));
  check('CSS : lignes de salons empilées (flex-wrap)', css.includes('.cm-row {\n  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;'));
  check('CSS : phrase plein largeur sur mobile', css.includes('@media (max-width: 640px) {\n  .cm-row > .cm-label { flex-basis: 100%; }'));
  check('CSS : rangée d ajout repliable', css.includes('.cm-add-row {\n  display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px;'));

  // ================= 3. Sélection des salons (bug 2) =================
  console.log('\n3️⃣  Sélection des salons corrigée');
  check('placeholder « Ajouter un salon » désactivé (non cliquable)', dash.includes('<option value="" disabled>— Ajouter un salon —</option>'));
  check('salons réels proposés dans la liste', dash.includes('.concat(textChannels.filter((ch) => !taken.has(\'#\' + ch.name))'));

  // ================= 4. Phrases conservées (bug 3) =================
  console.log('\n4️⃣  Phrases des salons conservées');
  check('mémorisation à la frappe (input → labels.set)', dash.includes("row.querySelector('[data-cm-label]').addEventListener('input', (e) => {"));
  check('mémorisation avant refresh', dash.includes('labels.set(ref, e.target.value);'));

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n✅ v204 OK — 0 échec');
  process.exit(failures ? 1 : 0);
})();
