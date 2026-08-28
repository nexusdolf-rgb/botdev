// Test v163 — retour à la page d'accueil simple (vitamines retirées), identité Argile conservée
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const pubJs = read('js/public.js');
const styleCss = read('css/style.css');
const index = read('index.html');
const sw = read('sw.js');

// 1. Les sections vitrine, le CTA final, le footer en colonnes et le mot rotatif sont bien retirés
for (const removed of ['pub-showcase', 'pub-cta', 'pub-footer-grid', 'pub-rot', 'rotWords', 'dc-mock', 'xp-mock', 'st-mock', 'pub-sc-kicker', 'Léo', 'Choisis tes rôles', 'Activité du serveur', 'Prêt à faire vibrer']) {
  assert(!pubJs.includes(removed), `élément retiré encore présent : ${removed}`);
}
for (const removedCss of ['.rot-word', '.pub-showcase', '.dc-mock', '.st-chart', '.pub-cta {', '.pub-footer-grid']) {
  assert(!styleCss.includes(removedCss), `style retiré encore présent : ${removedCss}`);
}

// 2. La page simple d'avant est complète : hero + stats + bots en direct + mock dashboard + 10 fonctionnalités + footer
assert(pubJs.includes('hero-title'), 'titre du hero manquant');
assert(pubJs.includes('grad grad-anim'), 'dégradé du titre manquant');
assert(pubJs.includes('pub-hero-actions'), 'boutons du hero manquants');
assert(pubJs.includes('discord.gg/X9hTdr9N3'), 'lien support manquant');
assert(pubJs.includes('Hoxera en direct'), 'section stats en direct manquante');
assert(pubJs.includes('pub-mock'), 'maquette du dashboard manquante');
assert(pubJs.includes('pub-features'), 'grille des fonctionnalités manquante');
assert(pubJs.includes('pub-footer-links'), 'footer simple manquant');
assert(pubJs.includes('pub-foot-dash'), 'lien dashboard du footer manquant');
assert.strictEqual((pubJs.match(/pub-feature /g) || []).length, 10, 'il doit y avoir 10 cartes fonctionnalités');

// 3. Une seule définition de la fonction de landing (pas de doublon)
assert.strictEqual((pubJs.match(/App\.renderPublicLanding = /g) || []).length, 1, 'renderPublicLanding défini plusieurs fois');

// 4. Identité Argile conservée sur le site public
assert(styleCss.includes('--accent: #e07a5f;'), 'accent principal pas en Argile');
for (const legacy of ['#5865F2', '#8B5CF6', '#EB459E', '#7082ff', '#9a7bff', '#a9b1ff', '#7588ff', '#a07fff', '#b5beff', '88, 101, 242', '88,101,242', '139, 92, 246', '139,92,246', '112,130,255', '235, 69, 158']) {
  assert(!styleCss.includes(legacy), `couleur legacy encore présente : ${legacy}`);
}

// 5. Version v163 déployée (cache PWA + assets)
assert(!index.includes('?v=162'), 'index.html référence encore v162');
assert.strictEqual((index.match(/\?v=163/g) || []).length, 7, 'index.html doit référencer v163 7 fois');
assert(sw.includes("'botdev-v163'"), 'le cache du service worker n’est pas en v163');

console.log('✅ v163 : page d’accueil simple restaurée — hero + stats + bots + dashboard mock + 10 fonctionnalités, identité Argile');
