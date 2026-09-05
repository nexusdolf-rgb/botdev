// ══════════════════════════════════════════════════════════════
// TEST v192 — CORRECTIF aperçu des annonces de live :
//  Le pseudo d'exemple « 93_vlz » était codé en dur dans le dashboard
//  et s'affichait sur TOUS les serveurs (confondu avec un compte suivi).
//  Désormais l'aperçu est DYNAMIQUE : premier compte suivi du serveur,
//  ou exemple neutre « @ton_streamer » si aucun.
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const dashSrc = fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8');

// ---------- 1. Pins de version ----------
assert.strictEqual((index.match(/\?v=219/g) || []).length, 7,
  'index.html doit référencer v192 7 fois');
assert(sw.includes('botdev-v219'), 'le cache du service worker n’est pas en v192');
assert(!index.includes('?v=191'), 'index.html référence encore v191');

// ---------- 2. Le pseudo d'exemple codé en dur a disparu ----------
assert(!dashSrc.includes('93_vlz'), 'le pseudo « 93_vlz » ne doit plus être codé en dur');
assert(!dashSrc.includes('est en live !</b></div>\n        <div style="font-weight:700;font-size:14px;color:#fff">🎵'),
  'l’ancien aperçu TikTok statique ne doit plus exister');

// ---------- 3. L'aperçu est dynamique + exemple neutre ----------
assert(dashSrc.includes('const renderPreview = (socials) => {'),
  'renderPreview dynamique manquant dans le module Communauté & Lives');
assert(dashSrc.includes('@ton_streamer'), 'l’exemple neutre « @ton_streamer » manque');
assert(dashSrc.includes("renderPreview(socials);"),
  'l’aperçu doit se mettre à jour avec la liste réelle des comptes');
assert(dashSrc.includes('renderPreview([]);'),
  'l’aperçu initial doit être l’exemple neutre');
assert(dashSrc.includes('id="lv-preview"'), 'le conteneur #lv-preview manque');
// L'aperçu du premier compte suivi utilise le vrai pseudo + la vraie plateforme
assert(dashSrc.includes("const handle = s ? `@${s.handle}` : '@ton_streamer';"),
  'le pseudo affiché doit être celui du premier compte suivi');

// ---------- 4. Le reste du module est intact ----------
assert(dashSrc.includes('lv-list'), 'la liste des comptes suivis doit rester');
assert(dashSrc.includes('/livesocials'), 'les routes livesocials doivent rester');
assert(dashSrc.includes("'🟢', 'Kick'"), 'les plateformes doivent rester');

console.log('✅ v192-test : aperçu des annonces dynamique (plus de pseudo codé en dur affiché sur tous les serveurs) — 0 problème');
