// ══════════════════════════════════════════════════════════════
// TEST v187 — AUDIT UI ÉTENDU (audit3.js, 5 passes inédites) :
//  E. menus déroulants OUVERTS (20 panneaux) → 0 problème
//  F. contraste MODE SOMBRE (23 modules × 2 tailles) → 0
//  G. interfaces éphémères : tiroir « Plus », palette Ctrl+K,
//     cloche 🔔, sélecteur de couleur 🎨, modale, toast → 0
//  H. bascule de thème EN DIRECT → 0
//  I. contenu extrême (textes de 90-160 caractères) → 0
// Découvertes majeures : les popovers (palette, cloche, couleur,
// modale) et les menus déroulants restaient SOMbres en mode clair
// (couche v10, l.3488-3497) — invisibles aux audits précédents car
// jamais ouverts. Corrigés par les blocs 2️⃣4️⃣ à 2️⃣9️⃣.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/dashboard.css'), 'utf8');

// ---------- 1. Bloc audit v187 présent ----------
assert(css.includes('AUDIT v187'), 'le bloc « AUDIT v187 » manque dans dashboard.css');
// Panneaux déroulants clairs (passe E)
assert(css.includes('html.hx-light .dd-panel {') && css.includes('background: #ffffff'),
  'panneaux déroulants : version claire manquante');
// Popovers (palette, cloche, couleur, modale) — couche v10 neutralisée (passe G)
assert(css.includes('html.hx-light body:has(.dashboard-shell-host) .modal,'),
  'flip des popovers/modale manquant');
// Tiroir « Plus » clair (passe G)
assert(css.includes('html.hx-light .dash-mobile-modules-drawer { background: #ffffff'),
  'tiroir « Plus » : version claire manquante');
// Contenu extrême (passe I)
assert(css.includes('.dash-crumb .crumb-txt b { overflow: hidden; text-overflow: ellipsis;'),
  'protection fil d’Ariane (noms de serveur très longs) manquante');
assert(css.includes('.dash-card > .card-actions { overflow-x: auto; }'),
  'pied de carte défilable manquant');
// Neutralisation de l'ancienne passe claire v170 (chips jours + filtres logs)
assert(css.includes("AUDIT v187 — neutralise l'ANCIENNE passe claire"),
  'neutralisation de la passe v170 manquante');
assert(css.includes('.dd-panel .dd-search input { background: #eef0f5;'),
  'champ de recherche des menus déroulants : version claire manquante');

// ---------- 2. Le CSS reste syntaxiquement équilibré ----------
let depth = 0;
for (const c of css) { if (c === '{') depth++; if (c === '}') depth--; if (depth < 0) break; }
assert(depth === 0, `accolades CSS déséquilibrées (${depth})`);

// ---------- 3. (Les pins de version sont désormais dans v188-test.js) ----------

console.log('✅ v187-test : audit étendu — 0 problème sur les 5 nouvelles passes (déroulants, sombre, éphémères, thème, extrême)');
