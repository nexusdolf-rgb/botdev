// Test v164 — landing calquée sur draftbot.fr : « Un bot pour [rotatif] », 4 vitrines courtes, footer colonnes
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const pubJs = read('js/public.js');
const styleCss = read('css/style.css');
const index = read('index.html');
const sw = read('sw.js');

// 1. Hero façon DraftBot : titre multitâche + ligne « Un bot pour [mot rotatif] » + bouton Discord avec logo
assert(pubJs.includes('français multitâche'), 'titre multitâche manquant');
assert(pubJs.includes('Un bot pour <span class="pub-rot" id="pub-rot">'), 'ligne « Un bot pour » manquante');
assert(pubJs.includes('La Modération'), 'premier mot rotatif manquant');
assert(pubJs.includes("Le Contrôle'"), 'liste des mots rotatifs incomplète');
assert(pubJs.includes('pub-btn-discord'), 'bouton Discord stylisé manquant');
assert(pubJs.includes('viewBox="0 0 127.14 96.36"'), 'logo Discord SVG manquant');
assert(pubJs.includes('Ajouter à Discord'), 'libellé « Ajouter à Discord » manquant');
assert(pubJs.includes('pub-particles'), 'particules du hero manquantes');
assert(pubJs.includes('pub-wave'), 'vague de séparation manquante');
assert(styleCss.includes('@keyframes pub-float'), 'animation des particules manquante');

// 2. Les 4 vitrines DraftBot (textes courts, visuel + contenu, alternées)
assert.strictEqual((pubJs.match(/class="db-feature/g) || []).length, 4, 'il doit y avoir 4 vitrines');
assert(pubJs.includes('<h2>Action Réaction</h2>'), 'vitrine Action Réaction manquante');
assert(pubJs.includes('<h2>Niveaux &amp; économie</h2>'), 'vitrine Niveaux &amp; économie manquante');
assert(pubJs.includes('<h2>Modération</h2>'), 'vitrine Modération manquante');
assert(pubJs.includes('<h2>Statistiques</h2>'), 'vitrine Statistiques manquante');
assert((pubJs.match(/class="db-feature rev reveal"/g) || []).length === 2, 'les vitrines doivent alterner (2 inversées)');
// textes courts façon DraftBot : pas de listes à puces ni longs paragraphes marketing
assert(!pubJs.includes('pub-sc-list'), 'les vitrines ne doivent pas avoir de listes à puces');
assert(!pubJs.includes('Léo') && !pubJs.includes('Chloé'), 'pas de faux membres dans les vitrines');
// visuels
assert(pubJs.includes('dbv-discord') && pubJs.includes('Choisis tes rôles'), 'visuel menus de rôles manquant');
assert(pubJs.includes('dbv-rank') && pubJs.includes('Niveau 24'), 'visuel carte de niveau manquant');
assert(pubJs.includes('dbv-mod') && pubJs.includes('Sourdine'), 'visuel outils de modération manquant');
assert(pubJs.includes('dbv-stats') && pubJs.includes('dbv-chart'), 'visuel statistiques manquant');
assert(styleCss.includes('.db-feature {'), 'styles des vitrines manquants');
assert(styleCss.includes('@keyframes dbv-grow'), 'animation du graphique manquante');

// 3. Footer en colonnes façon DraftBot
assert(pubJs.includes('pub-footer-grid'), 'footer en colonnes manquant');
assert(pubJs.includes('Navigation'), 'colonne Navigation manquante');
assert(pubJs.includes('Communauté'), 'colonne Communauté manquante');
assert(pubJs.includes('pub-foot-home'), 'lien Accueil manquant');
assert(pubJs.includes('Statut du service'), 'lien statut manquant');
assert(pubJs.includes('pub-footer-bottom'), 'ligne copyright manquante');

// 4. Le reste de la page est conservé (stats live, mock dashboard, 10 fonctionnalités)
assert(pubJs.includes('Hoxera en direct'), 'section stats en direct manquante');
assert(pubJs.includes('pub-mock'), 'maquette du dashboard manquante');
assert((pubJs.match(/pub-feature /g) || []).length === 10, '10 cartes fonctionnalités attendues');
assert(pubJs.includes('discord.gg/X9hTdr9N3'), 'lien support manquant');

// 5. Une seule définition de la fonction de landing (pas de doublon) + rotation câblée
assert.strictEqual((pubJs.match(/App\.renderPublicLanding = /g) || []).length, 1, 'renderPublicLanding défini plusieurs fois');
assert(pubJs.includes('rotWords'), 'liste des mots rotatifs manquante');
assert(pubJs.includes('setInterval'), 'rotation du mot non câblée');

// 6. Identité Argile conservée
assert(styleCss.includes('--accent: #e07a5f;'), 'accent principal pas en Argile');

// 7. Version v164 déployée (cache PWA + assets)
assert(!index.includes('?v=163'), 'index.html référence encore v163');
assert.strictEqual((index.match(/\?v=164/g) || []).length, 7, 'index.html doit référencer v164 7 fois');
assert(sw.includes("'botdev-v164'"), 'le cache du service worker n’est pas en v164');

console.log('✅ v164 : landing calquée sur draftbot.fr — Un bot pour…, 4 vitrines, footer colonnes');
