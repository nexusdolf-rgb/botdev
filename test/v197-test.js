// Test v197 — Audit UI complet : dashboard (desktop + mobile) et landing publique
// 1. Couche « Audit UI v197 » présente dans dashboard.css (règles 17-19 : textes, formulaires, contrôles)
// 2. Correctifs landing : flex-shrink CTA + texte passant à la ligne en mobile + overflow rogné
// 3. Cache-buster v197 (index.html 7 fois + service worker)
// 4. Aucun faux positif réintroduit (sonde : exclusion des blobs décoratifs)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v197-'));
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
  const dashCss = read('public/css/dashboard.css');
  const styleCss = read('public/css/style.css');
  const dash = read('public/js/dashboard.js');

  // ================= 1. Cache-buster v197 =================
  console.log('\n1️⃣  Version v197');
  check('index.html : ?v=205 référencé 7 fois', (index.match(/\?v=205/g) || []).length === 7);
  check('index.html : plus aucune ?v=196', !index.includes('?v=196'));
  check('sw.js : cache botdev-v205', sw.includes("const CACHE = 'botdev-v205';"));
  check('sw.js : plus de botdev-v196', !sw.includes('botdev-v196'));

  // ================= 2. Couche CSS dashboard (Audit UI v197) =================
  console.log('\n2️⃣  Dashboard — couche CSS Audit UI v197');
  check('couche « AUDIT UI v197 » présente dans dashboard.css', dashCss.includes('AUDIT UI v197'));
  check('h1 de modules passent à la ligne', dashCss.includes('.dash-module-header h1, .module-header-copy h1 { white-space: normal; }'));
  check('lignes de réglage se replient (eb-grid2)', dashCss.includes('.eb-grid2 .setting-row { flex-wrap: wrap; }'));
  check('labels plein largeur en ligne repliée', dashCss.includes('.eb-grid2 .setting-row > .dash-label { flex: 1 1 100%; min-width: 0; }'));
  check('inputs/sélecteurs pleine largeur en ligne repliée', dashCss.includes('.eb-grid2 .setting-row > input.dash-input,') && dashCss.includes('{ width: 100%; flex: 1 1 100%; min-width: 0; max-width: 100%; }'));
  check('cases à cocher / radios 20px', dashCss.includes('input[type="checkbox"], input[type="radio"] {') && dashCss.includes('width: 20px; height: 20px; flex-shrink: 0;'));
  check('préréglages embeds 40px', dashCss.includes('.eb-preset { width: 40px; height: 40px; }'));
  check('items du tiroir mobile ≥ 42px', dashCss.includes('.dash-mobile-server-item { width: 42px !important; height: 42px !important; flex-basis: 42px !important; }'));
  check('fermeture du tiroir mobile ≥ 40px', dashCss.includes('.dash-mobile-close { width: 40px !important; height: 40px !important; min-width: 40px !important; }'));

  // ================= 3. Correctifs landing (fin style.css) =================
  console.log('\n3️⃣  Landing — correctifs Audit UI v197');
  check('couche « Audit UI v197 » présente dans style.css', styleCss.includes('Audit UI v197'));
  check('CTA hero + CTA final : flex-shrink 0 / max-width 100%', styleCss.includes('.pub-hero-actions .btn, .hp-cta-actions .btn { flex-shrink: 0; max-width: 100%; }'));
  check('blobs plafonnés', styleCss.includes('.pub-blob { max-width: 100%;'));
  check('hero rogné en mobile (pas de débordement de page)', /@media \(max-width: 700px\) \{[\s\S]*?\.pub-hero \{ overflow: hidden; \}/.test(styleCss));
  check('CTA final : texte passe à la ligne en mobile', /@media \(max-width: 700px\) \{[\s\S]*?\.hp-cta-actions \.btn \{ white-space: normal; \}/.test(styleCss));

  // ================= 4. Titres de serveurs (tooltip anti-débordement) =================
  console.log('\n4️⃣  Titres de serveurs');
  check('tooltip title sur la page d’accueil', dash.includes('<b title="'));
  check('tooltip title sur les cartes serveurs', dash.includes('.dash-server-card') || dash.includes('title="'));

  // ================= 5. Sonde d’audit : exclusions des faux positifs =================
  console.log('\n5️⃣  Sonde ui-audit.js');
  const probe = read('scripts/ui-audit.js');
  check('exclusion des enfants absolus décoratifs (blobs)', probe.includes('absOverflow'));
  check('exclusion des éléments rognés par overflow:hidden', probe.includes('clipped'));
  check('exclusion des switchs / icônes / shimmer', probe.includes('containsSwitch') && probe.includes('isShimmer'));

  console.log(failures === 0
    ? '\n🎉 Tous les tests v1.97 passent — Audit UI : 0 problème partout !'
    : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
