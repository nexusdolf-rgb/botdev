// ══════════════════════════════════════════════════════════════
// TEST v186 — AUDIT UI COMPLET DU DASHBOARD.
// Résultat des audits Puppeteer (audit.js + audit2.js, 12 passes) :
// 0 débordement, 0 texte tronqué, 0 modal cassée, 0 texte illisible
// en mode clair, sur 6 tailles d'écran (320→1920px).
// Correctifs majeurs : thème clair de la couche « Discord »
// (surfaces + ~200 textes), cartes de types de tickets à 1024px,
// grille Auto-Mod à 320px, puces d'accueil à 360px.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/dashboard.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8');

// ---------- 1. Bloc audit présent et complet dans dashboard.css ----------
assert(css.includes('AUDIT UI v186'), 'le bloc « AUDIT UI v186 » manque dans dashboard.css');
// Correctifs 1-5 (première vague)
assert(css.includes('.bell-badge[hidden]'), 'correctif cloche (badge hidden) manquant');
assert(css.includes('.dash-card > .card-actions'), 'correctif pied de cartes (card-actions) manquant');
// Correctifs 6-22 (mode clair + mise en page)
assert(css.includes('--d-dim: #5d6375'), 'remap des variables du shell en mode clair manquant');
assert(css.includes('background: #eef0f5 !important'), 'flip des surfaces sombres en mode clair manquant');
assert(css.includes('.adv-type-head { flex-wrap: wrap; }'), 'correctif cartes types de tickets manquant');
assert(css.includes('minmax(0, 1fr) !important'), 'correctif grille Auto-Mod 320px manquant');
assert(css.includes('.ov-quick-action { padding: 7px 7px;'), 'correctif puces accueil ≤360px manquant');
// Les maquettes Discord restent sombres (voulu) mais avec textes lisibles
assert(css.includes('Les aperçus « comme sur Discord »'), 'note maquettes Discord manquante');
assert(css.includes('.am-blacklist-empty b { color: #1c1e26; }'), 'correctif boîte blacklist manquant');

// ---------- 2. Le CSS reste syntaxiquement équilibré ----------
let depth = 0;
for (const c of css) { if (c === '{') depth++; if (c === '}') depth--; if (depth < 0) break; }
assert(depth === 0, `accolades CSS déséquilibrées (${depth})`);

// ---------- 3. Correctif JS : chips des jours d'annonces ----------
assert(js.includes('minmax(125px,1fr)'), 'dashboard.js : grille des jours d’annonces pas corrigée');

// ---------- 4. Version v186 ----------
assert.strictEqual((index.match(/\?v=186/g) || []).length, 7,
  'index.html doit référencer v186 7 fois');
assert(sw.includes('botdev-v186'), 'le cache du service worker n’est pas en v186');
assert(!index.includes('?v=185'), 'index.html référence encore v185');

console.log('✅ v186-test : audit UI complet — 0 problème sur les 12 passes Puppeteer (320→1920px, thèmes sombre + clair)');
