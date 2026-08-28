// Test v2.8 — Page d'accueil vivante (animations, maquette, support)
const assert = require('assert');
const fs = require('fs');
const pub = fs.readFileSync(__dirname + '/../public/js/public.js', 'utf8');
const css = fs.readFileSync(__dirname + '/../public/css/style.css', 'utf8');

// 1. Héros animé (v165 : particules + vague + mot rotatif, façon draftbot.fr)
assert.ok(pub.includes('dh-particles') && pub.includes('dh-wave'), 'particules et vague animée');
assert.ok(pub.includes('dh-rot') && css.includes('@keyframes dh-push-in'), 'mot du titre en rotation');
assert.ok(css.includes('@keyframes dh-wave') && css.includes('@keyframes dbv-grow'), 'animations d\'entrée');
console.log('✅ héros : particules reliées + vague défilante + mot rotatif');

// 2. Révélation au défilement, robuste hors navigateur
assert.ok(pub.includes('IntersectionObserver') && pub.includes("typeof IntersectionObserver !== 'undefined'"), 'reveal protégé (jsdom/vieux navigateurs)');
assert.ok(css.includes('.reveal.in'), 'style de révélation');
console.log('✅ révélation au défilement avec dégradation propre');

// 3. Animations vivantes (v166 : particules animées en canvas)
assert.ok(pub.includes('requestAnimationFrame'), 'animation requestAnimationFrame');
console.log('✅ particules animées en continu (canvas)');

// 4. Les 4 vitrines façon DraftBot
assert.ok((pub.match(/class="dh-feature reveal"/g) || []).length === 4, '4 vitrines');
console.log('✅ 4 vitrines façon DraftBot (Action Réaction, Niveaux, Modération, Stats)');

// 5. Liens support + accessibilité mouvement
assert.ok((pub.match(/discord\.gg\/X9hTdr9N3/g) || []).length >= 2, 'lien support (héros + footer)');
assert.ok(css.includes('prefers-reduced-motion'), 'respect des préférences de mouvement réduit');
console.log('✅ serveur support (héros + pied de page) + accessibilité');

// 6. La page se rend toujours (smoke jsdom la couvre) — éléments clés intacts
for (const k of ['dh-rot', 'dh-invite', 'pub-invite-hero', 'dh-footer-content', 'public-landing']) assert.ok(pub.includes(k), k + ' intact');
console.log('✅ éléments essentiels intacts (hero, bouton, footer)');

console.log('\n🎉 Tous les tests v2.8 passent');
