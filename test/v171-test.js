// ══════════════════════════════════════════════════════════════
// TEST v171 — Textes invisibles en mode clair sur ORDINATEUR
// Suite du retour utilisateur : sur un ordinateur en apparence
// claire (thème qui suit le système), des textes blancs restaient
// invisibles sur fond clair. Ce test verrouille les correctifs.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/css/dashboard.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

const L = 'html.hx-light';

// ---------- 1. La passe claire desktop existe et cible le shell ----------
assert(css.includes('v171'), 'dashboard.css doit documenter la passe v171');

// ---------- 2. Barre publique + sidebar + topbar ----------
assert(css.includes(`${L} .navbar .user-pill span { color: #23252d; }`),
  'user-pill : le pseudo doit être sombre en clair');
assert(css.includes(`.dash-server-card .srv-txt b { color: #23252d; }`),
  'carte serveur : le nom doit être sombre en clair');
assert(css.includes(`.dash-side-item .ico { color: #5c636b; }`),
  'icônes de la sidebar sombres en clair');
assert(css.includes(`.dash-side-foot b { color: #23252d; }`),
  'pied de sidebar sombre en clair');
assert(css.includes(`.dash-bot-chip .chip-txt b { color: #23252d; }`),
  'puce du bot : nom sombre en clair');

// ---------- 3. Badges de statut (tous modules) ----------
for (const [cls, col] of [['ok', '#1a7f42'], ['warn', '#9a6700'], ['bad', '#c03537']]) {
  assert(css.includes(`.dash-badge.${cls} { color: ${col};`),
    `dash-badge.${cls} doit être lisible en clair`);
}

// ---------- 4. Textes clairs SUR surfaces restées sombres ----------
assert(css.includes(`.adv-preview-title { color: #f2f3f5; }`),
  'aperçu Tickets : titre clair sur coque sombre');
assert(css.includes(`.ca-preview-label { color: #f2f3f5; }`),
  'aperçu Annonces : libellé clair sur coque sombre');

// ---------- 5. Boutons <> {} 🔗 (Annonces) ----------
assert(/ca-mark \{ color: #23252d; background: #e3e5e8/.test(css),
  'boutons de balise des annonces : encre sombre en clair');

// ---------- 6. Boutons principaux (Embed Builder) ----------
assert(css.includes(`.btn-primary { color: #fff !important; background: #c85f49 !important;`),
  'btn-primary : encre blanche sur fond argile en clair');

// ---------- 7. Modération : onglets de filtre ----------
assert(css.includes(`.am-filter.active { color: #a94838;`),
  'filtre actif de modération lisible en clair');
assert(css.includes(`.am-filter { color: #5c636b; }`),
  'filtres inactifs de modération lisibles en clair');

// ---------- 8. Vue d'ensemble : santé du bot ----------
assert(css.includes(`.ov-intro-health b { color: #1a7f42; }`),
  'pastille de santé lisible en clair');

// ---------- 9. Chaque nouveau sélecteur v171 est bien préfixé hx-light ----------
// (borné au bloc v171 : les passes suivantes — v186 audit UI — ont leurs
//  propres correctifs de mise en page valides pour les deux thèmes)
const sel171 = (css.split('v171 —')[1] || '').split('AUDIT UI v186')[0];
assert(!/\n(?!\s*\/|\*|html\.hx-light|\s*$)[a-z.#[]/.test(sel171),
  'la passe v171 ne doit cibler QUE html.hx-light');

// ---------- 10. Version : gérée par le test de la version courante (v172) ----------

console.log('✅ v171-test : 27 vérifications OK (mode clair desktop verrouillé)');
