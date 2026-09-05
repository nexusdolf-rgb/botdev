// Test v203 — Audit UI zéro problème (desktop + mobile, dark + light).
// Correctifs de la passe d'audit automatisée (ui-audit-deep.js) :
// 1. Polices minuscules (< 10px) → lisibles : badges « en direct » des
//    aperçus (tickets / annonces) + libellés du tiroir mobile.
// 2. Cartes d'accès rapide de l'overview : hauteur ≤ 64px (flex au lieu
//    d'un grid 1fr/1fr qui poussait la hauteur à ~70px).
// 3. Sélecteur de serveurs (picker) : cartes compactes (bannière 56px).
// 4. Grille initiale « Choisis un serveur » : cartes compactes (icône 48px).
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v203-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  const index = read('public/index.html');
  const sw = read('public/sw.js');
  const css = read('public/css/dashboard.css');

  // ================= 1. Cache-buster v203 =================
  console.log('\n1️⃣  Version v203');
  check('index.html : ?v=227 référencé 7 fois', (index.match(/\?v=227/g) || []).length === 7);
  check('index.html : plus aucune ?v=202', !index.includes('?v=202'));
  check('sw.js : cache botdev-v227', sw.includes("const CACHE = 'botdev-v227';"));
  check('sw.js : plus de botdev-v202', !sw.includes('botdev-v202'));

  // ================= 2. Polices minuscules → lisibles =================
  console.log('\n2️⃣  Texte minuscule (< 10px) corrigé');
  check('badge « Mis à jour en direct » (tickets) ≥ 10.5px', css.includes('.adv-preview-title span { color: #6ee7a0; font-size: 10.5px;'));
  check('badge « Actualisé en direct » (annonces) ≥ 10.5px', css.includes('.ca-preview-label span { color: #6ee7a0; font-size: 10.5px;'));
  check('« Serveur sélectionné » (tiroir mobile) ≥ 10px', css.includes('.dash-mobile-current-server small { color: #b5bac1; font-size: 10px;'));
  check('groupes du tiroir mobile ≥ 10px', css.includes('.dash-mobile-module-group { padding: 14px 13px 6px; color: #949ba4; font-size: 10px;'));

  // ================= 3. Cartes d'accès rapide (overview) ≤ 64px =================
  console.log('\n3️⃣  Accès rapides overview : hauteur compacte');
  check('ov-quick-action (access-bar) en flex', css.includes('.dashboard-shell-host .ov-access-bar .ov-quick-action {\n  display: inline-flex;'));
  check('min-height 38px (au lieu de 52px)', css.includes('min-height: 38px;\n  padding: 5px 9px;'));
  check('emoji 14px (au lieu de 18px)', css.includes('.ov-access-bar .ov-quick-action > span { flex: 0 0 auto; font-size: 14px;'));
  check('plus de grille 1fr/1fr sur le bouton', !css.includes('.ov-access-bar .ov-quick-action {\n  display: grid;'));

  // ================= 4. Sélecteur de serveurs compact =================
  console.log('\n4️⃣  Sélecteur de serveurs (picker) : cartes compactes');
  check('bannière 56px (au lieu de 86px)', css.includes('.sp-banner {\n  display: block; position: relative; height: 56px;'));
  check('icône 38px', css.includes('width: 38px; height: 38px; flex-shrink: 0; margin-top: -22px;'));

  // ================= 5. Grille initiale « Choisis un serveur » =================
  console.log('\n5️⃣  Grille de serveurs : cartes compactes');
  check('icône 48px (au lieu de 64px)', css.includes('.srv-card img, .srv-card-fallback { width: 48px; height: 48px; border-radius: 15px; }'));
  check('padding compact', css.includes('padding: 18px 14px 14px; color: var(--d-text);'));

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n✅ v203 OK — 0 échec');
  process.exit(failures ? 1 : 0);
})();
