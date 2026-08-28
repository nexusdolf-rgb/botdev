// Test v167 — retour à l'ancienne page d'accueil de Nexora (celle d'avant le clone DraftBot)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const pubJs = read('js/public.js');
const styleCss = read('css/style.css');
const index = read('index.html');
const sw = read('sw.js');

// 1. L'interface DraftBot est totalement retirée
for (const removed of ['dh-hero', 'dh-feature', 'dh-footer', 'dh-invite', 'dh-rot', 'dh-particles', 'dh-wave', 'Un bot pour', 'Ajouter à Discord', 'français multitâche']) {
  assert(!pubJs.includes(removed), `élément du clone DraftBot encore présent : ${removed}`);
}
for (const removedCss of ['.dh-hero', '.dh-feature', '.dh-footer', '#public-landing.dh', 'dh-push-in', 'dh-wave']) {
  assert(!styleCss.includes(removedCss), `style du clone DraftBot encore présent : ${removedCss}`);
}
assert(!index.includes('Open+Sans'), 'la police Open Sans (DraftBot) doit être retirée');

// 2. L'ancienne page d'accueil de Nexora est complète
assert(pubJs.includes('pub-hero'), 'hero manquant');
assert(pubJs.includes('Le bot qui anime'), 'titre original manquant');
assert(pubJs.includes('grad grad-anim'), 'dégradé animé du titre manquant');
assert(pubJs.includes('pub-hero-badge'), 'badge du hero manquant');
assert(pubJs.includes('pub-tagline'), 'tagline manquante');
assert(pubJs.includes('pub-invite-hero'), 'bouton inviter manquant');
assert(pubJs.includes('pub-support-link'), 'lien support du hero manquant');
assert(pubJs.includes('discord.gg/X9hTdr9N3'), 'lien support manquant');
assert(pubJs.includes('Hoxera en direct'), 'section stats en direct manquante');
assert(pubJs.includes('id="pub-stats"'), 'stats du hero manquantes');
assert(pubJs.includes('id="pub-bots"'), 'grille des bots manquante');
assert(pubJs.includes('pub-mock'), 'maquette du dashboard manquante');
assert((pubJs.match(/pub-feature /g) || []).length === 10, '10 cartes fonctionnalités attendues');
assert(pubJs.includes('pub-footer-links'), 'footer simple manquant');
assert(pubJs.includes('pub-foot-dash'), 'lien dashboard du footer manquant');
assert(pubJs.includes('loadStats') && pubJs.includes('loadBots'), 'chargement des stats/bots manquant');
assert(pubJs.includes('const countUp'), 'compteurs animés manquants');

// 3. Une seule définition de la landing + identité Argile conservée
assert.strictEqual((pubJs.match(/App\.renderPublicLanding = /g) || []).length, 1, 'renderPublicLanding défini plusieurs fois');
assert(styleCss.includes('--accent: #e07a5f;'), 'accent principal pas en Argile');

// 4. Version v167 déployée (cache PWA + assets)
assert(!index.includes('?v=166'), 'index.html référence encore v166');
assert.strictEqual((index.match(/\?v=167/g) || []).length, 7, 'index.html doit référencer v167 7 fois');
assert(sw.includes("'botdev-v167'"), 'le cache du service worker n’est pas en v167');

console.log('✅ v167 : ancienne page d’accueil de Nexora restaurée — clone DraftBot retiré');
