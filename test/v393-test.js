#!/usr/bin/env node
// v393 — lisibilité des couleurs : les valeurs corrigées ne doivent pas revenir.
//
// Contexte mesuré (sonde test/tools/sonde-couleurs.js, 145 vues par thème :
// les 35 modules et les sous-vues ouvertes après un clic) :
//   thème sombre : 76 textes sous 4,5:1 et 15 traits invisibles → 0 et 0
//   thème clair  : 2258 textes sous 4,5:1 et 1741 traits invisibles → 0 et 0
//
// Ce test ne juge pas du goût : il empêche seulement de réintroduire les
// valeurs qui échouaient, et vérifie que l'identité de la palette tient.
const fs = require('fs');
const path = require('path');

const lire = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const css = lire('public/css/dashboard.css');

let ok = 0, ko = 0;
const check = (nom, condition, detail) => {
  if (condition) { ok++; console.log(`  ✅ ${nom}`); }
  else { ko++; console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ''}`); }
};

// ── 1. Le thème clair a désormais ses propres couleurs d'état ─────────────
check('thème clair : --ui-ok défini (#1a7f37)', /html\.hx-light \.dashboard-shell-host \{[^}]*--ui-ok: #1a7f37;/.test(css));
check('thème clair : --ui-warn défini (#9a6700)', /html\.hx-light \.dashboard-shell-host \{[^}]*--ui-warn: #9a6700;/.test(css));
check('thème clair : --ui-danger défini (#cf222e)', /html\.hx-light \.dashboard-shell-host \{[^}]*--ui-danger: #cf222e;/.test(css));
check('thème sombre : --ui-ok reste le vert d’origine', css.includes('--ui-ok: #3fb950;'));

// ── 2. Les valeurs qui échouaient ne sont plus employées comme texte ──────
check('le gris #6a7080 des libellés de section est remplacé', !css.includes('color: #6a7080'));
check('le gris #6b7085 du texte tertiaire est remplacé', !css.includes('--ui-text-3: #6b7085'));
check('le gris #8d9bb0 figé a disparu', !css.includes('#8d9bb0'));
check('le gris #7f91a8 figé a disparu', !css.includes('#7f91a8'));
check('le vert #178a43 figé a disparu', !css.includes('#178a43'));
check('le trait blanc translucide du panneau anti-nuke est corrigé en clair',
  css.includes('.dash-card .desc > div[style*="rgba(255,255,255,.14)"]'));

// ── 3. L’accent terracotta reste l’accent de la palette ──────────────────
check('l’accent #e07a5f est toujours défini', /--d-accent: #e07a5f;/.test(css));
check('les fonds de la palette sont intacts (#36393F / #2B2D31)',
  css.includes('--ui-bg: #36393f;') && css.includes('--ui-surface: #2b2d31;'));

// ── 4. Le liseré « Premiers réglages » tient le contraste ────────────────
check('le liseré utilise un dégradé assombri', css.includes('linear-gradient(90deg, #c34e3a, #a8412c)'));

// ── 5. La sonde elle-même est versionnée avec le dépôt ───────────────────
check('la sonde de couleur est présente', fs.existsSync(path.join(__dirname, 'tools', 'sonde-couleurs.js')));

console.log(`\n${ok} ✅ / ${ko} ❌`);
process.exit(ko ? 1 : 0);
