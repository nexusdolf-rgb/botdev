// Test v166 — landing épurée : uniquement l'interface DraftBot (hero + 4 vitrines + footer)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const pubJs = read('js/public.js');
const index = read('index.html');
const sw = read('sw.js');

// 1. Les vieilles sections sont totalement retirées
for (const removed of ['Hoxera en direct', 'pub-mock', 'pub-features', 'id="pub-stats"', 'id="pub-bots"', 'loadBots', 'loadStats', 'countUp', 'Un dashboard digne des plus grands', 'Tout ce que Hoxera sait faire']) {
  assert(!pubJs.includes(removed), `ancienne section encore présente : ${removed}`);
}

// 2. La landing = exactement la structure DraftBot : hero + 4 vitrines + footer
assert(pubJs.includes('dh-hero'), 'hero DraftBot manquant');
assert((pubJs.match(/class="dh-feature reveal"/g) || []).length === 4, 'il doit y avoir 4 vitrines');
for (const t of ['Action Réaction', 'Niveaux &amp; économie', 'Modération', 'Statistiques']) {
  assert(pubJs.includes(`<h2>${t}</h2>`), `vitrine manquante : ${t}`);
}
assert(pubJs.includes('dh-footer-content'), 'footer DraftBot manquant');
assert(pubJs.includes('Tous droits réservés'), 'copyright manquant');
assert(pubJs.includes('Un bot pour&nbsp;'), 'ligne « Un bot pour » manquante');
assert(pubJs.includes('Ajouter à Discord'), 'bouton Discord manquant');

// 3. Lien support toujours accessible (footer)
assert((pubJs.match(/discord\.gg\/X9hTdr9N3/g) || []).length >= 2, 'liens support du footer manquants');

// 4. Une seule définition de la landing
assert.strictEqual((pubJs.match(/App\.renderPublicLanding = /g) || []).length, 1, 'renderPublicLanding défini plusieurs fois');

// 5. Version v166 déployée (cache PWA + assets)
assert(!index.includes('?v=165'), 'index.html référence encore v165');
assert.strictEqual((index.match(/\?v=166/g) || []).length, 7, 'index.html doit référencer v166 7 fois');
assert(sw.includes("'botdev-v166'"), 'le cache du service worker n’est pas en v166');

console.log('✅ v166 : landing épurée — uniquement l’interface DraftBot (hero + 4 vitrines + footer)');
