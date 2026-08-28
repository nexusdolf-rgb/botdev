// Test v2.8 — Page d'accueil vivante (animations, maquette, support)
const assert = require('assert');
const fs = require('fs');
const pub = fs.readFileSync(__dirname + '/../public/js/public.js', 'utf8');
const css = fs.readFileSync(__dirname + '/../public/css/style.css', 'utf8');

// 1. Héros animé
assert.ok(pub.includes('pub-blob b1') && pub.includes('pub-blob b3'), 'halos flottants');
assert.ok(pub.includes('grad-anim') && css.includes('@keyframes gradSlide'), 'titre en dégradé animé');
assert.ok(css.includes('@keyframes blobFloat') && css.includes('@keyframes heroIn'), 'animations d\'entrée');
console.log('✅ héros : halos flottants + titre dégradé animé + entrées en fondu');

// 2. Révélation au défilement, robuste hors navigateur
assert.ok(pub.includes('IntersectionObserver') && pub.includes("typeof IntersectionObserver !== 'undefined'"), 'reveal protégé (jsdom/vieux navigateurs)');
assert.ok(css.includes('.reveal.in'), 'style de révélation');
console.log('✅ révélation au défilement avec dégradation propre');

// 3. Compteurs animés
assert.ok(pub.includes('const countUp') && pub.includes('requestAnimationFrame'), 'compteurs animés');
console.log('✅ statistiques : chiffres qui montent');

// 4. Maquette dashboard + section
assert.ok(pub.includes('Un dashboard digne des plus grands') && pub.includes('pub-mock'), 'section maquette');
assert.ok(css.includes('.mock-side') && css.includes('@keyframes mockFloat'), 'maquette CSS flottante');
console.log('✅ maquette du dashboard dessinée en CSS (flottante)');

// 5. Liens support + accessibilité mouvement
assert.ok((pub.match(/discord\.gg\/X9hTdr9N3/g) || []).length >= 2, 'lien support (héros + footer)');
assert.ok(css.includes('prefers-reduced-motion'), 'respect des préférences de mouvement réduit');
console.log('✅ serveur support (héros + pied de page) + accessibilité');

// 6. La page se rend toujours (smoke jsdom la couvre) — éléments clés intacts
for (const k of ['pub-stats', 'pub-bots', 'pub-invite-hero', 'public-landing']) assert.ok(pub.includes(k), k + ' intact');
console.log('✅ éléments essentiels intacts (stats, bots, boutons)');

console.log('\n🎉 Tous les tests v2.8 passent');
