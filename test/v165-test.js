// Test v165 — interface publique clonée de draftbot.fr (couleurs, structure, animations)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const pubJs = read('js/public.js');
const styleCss = read('css/style.css');
const index = read('index.html');
const sw = read('sw.js');

// 1. Couleurs exactes de DraftBot : fond #202225, accent #cd6e57, sections #383c41, footer #292b2f
assert(styleCss.includes('#public-landing.dh {'), 'le conteneur .dh doit exister');
for (const c of ['#202225', '#cd6e57', '#383c41', '#292b2f', '%23a45b44', '#dc755c', '#ffffffb3']) {
  assert(styleCss.includes(c), `couleur DraftBot manquante : ${c}`);
}
assert(index.includes('Open+Sans'), 'la police Open Sans (celle de DraftBot) doit être chargée');
assert(styleCss.includes("font-family: 'Open Sans'"), 'Open Sans doit être appliquée à la landing');

// 2. Hero façon DraftBot : logo avatar, titre 20px discret, mots rotatifs 30px terracotta, bouton « Ajouter à Discord »
assert(pubJs.includes('dh-logo'), 'logo avatar du hero manquant');
assert(pubJs.includes('/api/public/bot-avatar'), 'le logo doit afficher l\'avatar du bot');
assert(pubJs.includes('Hoxera, ton bot Discord français multitâche'), 'titre façon DraftBot manquant');
assert(pubJs.includes('Un bot pour&nbsp;'), 'ligne « Un bot pour » manquante');
assert(pubJs.includes('id="dh-rot"'), 'mot rotatif manquant');
assert(pubJs.includes('dh-invite'), 'bouton inviter façon DraftBot manquant');
assert(pubJs.includes('Ajouter à Discord'), 'libellé du bouton manquant');
assert(pubJs.includes('dh-particles'), 'particules façon DraftBot manquantes');
assert(pubJs.includes('dh-wave'), 'vague animée manquante');
assert(styleCss.includes('@keyframes dh-wave'), 'animation de la vague manquante');
assert(styleCss.includes('dh-push-in'), 'animation push-in du mot rotatif manquante');
// hero épuré comme DraftBot : ni badge, ni tagline, ni stats, ni lien support dans le hero
assert(!pubJs.includes('pub-tagline'), 'le hero ne doit plus avoir de tagline (DraftBot n\'en a pas)');

// 3. Les 4 vitrines : titres 50px MAJUSCULES terracotta, texte blanc 17px, glissement latéral, images masquées sur mobile
assert((pubJs.match(/class="dh-feature reveal"/g) || []).length === 4, 'il doit y avoir 4 vitrines');
for (const t of ['Action Réaction', 'Niveaux &amp; économie', 'Modération', 'Statistiques']) {
  assert(pubJs.includes(`<h2>${t}</h2>`), `vitrine manquante : ${t}`);
}
assert(styleCss.includes('text-transform: uppercase'), 'titres des vitrines pas en majuscules');
assert(styleCss.includes('font-size: 50px'), 'titres des vitrines pas à 50px');
assert(styleCss.includes('letter-spacing: .05em'), 'interlettrage du texte manquant');
assert(styleCss.includes('translateX(-100px)'), 'glissement latéral au scroll manquant');
assert(styleCss.includes('.dh-image { display: none; }'), 'les images doivent être masquées sur mobile (comportement DraftBot)');

// 4. Footer façon DraftBot : #292b2f, titres #dc755c 26px, liens blancs 16px, copyright
assert(pubJs.includes('dh-footer-content'), 'footer en colonnes manquant');
assert(pubJs.includes('item-title'), 'titres de colonnes manquants');
assert(pubJs.includes('Navigation'), 'colonne Navigation manquante');
assert(pubJs.includes('Communauté'), 'colonne Communauté manquante');
assert(pubJs.includes('Tous droits réservés'), 'copyright manquant');
assert(styleCss.includes('.dh-footer-item .item-title'), 'styles des titres du footer manquants');

// 5. Une seule définition de la landing + rotation câblée + nos sections conservées
assert.strictEqual((pubJs.match(/App\.renderPublicLanding = /g) || []).length, 1, 'renderPublicLanding défini plusieurs fois');
assert(pubJs.includes('rotWords'), 'rotation des mots non câblée');
assert(pubJs.includes('Hoxera en direct'), 'section stats en direct manquante');
assert((pubJs.match(/pub-feature /g) || []).length === 10, '10 cartes fonctionnalités attendues');
assert(pubJs.includes('discord.gg/X9hTdr9N3'), 'lien support manquant');

// 6. Version v165 déployée (cache PWA + assets)
assert(!index.includes('?v=164'), 'index.html référence encore v164');
assert.strictEqual((index.match(/\?v=165/g) || []).length, 7, 'index.html doit référencer v165 7 fois');
assert(sw.includes("'botdev-v165'"), 'le cache du service worker n’est pas en v165');

console.log('✅ v165 : interface publique clonée de draftbot.fr — couleurs, hero, 4 vitrines, footer');
