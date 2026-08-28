// Test v162 — landing « tout DraftBot » : vitrines Action Réaction + Statistiques, CTA final, footer colonnes
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const pubJs = read('js/public.js');
const styleCss = read('css/style.css');
const index = read('index.html');
const sw = read('sw.js');

// 1. Vitrine Action Réaction (menus de rôles — façon DraftBot)
assert(pubJs.includes('Action Réaction'), 'vitrine Action Réaction manquante');
assert(pubJs.includes('Choisis tes rôles'), 'maquette du menu de rôles manquante');
assert(pubJs.includes('dcm-actions-wrap'), 'boutons de rôles de la maquette manquants');
assert(pubJs.includes('Graphiste'), 'rôles de la maquette manquants');

// 2. Vitrine Statistiques (graphique d'activité)
assert(pubJs.includes('st-mock'), 'maquette graphique statistiques manquante');
assert(pubJs.includes('st-chart'), 'graphique en barres manquant');
assert(pubJs.includes('Activité du serveur'), 'titre de la maquette stats manquant');
assert(pubJs.includes('nouveaux membres'), 'chiffres de la maquette stats manquants');
assert(styleCss.includes('.st-chart {'), 'styles du graphique manquants');
assert(styleCss.includes('@keyframes st-grow'), 'animation de croissance des barres manquante');

// 3. CTA final
assert(pubJs.includes('pub-cta'), 'section CTA finale manquante');
assert(pubJs.includes('pub-invite-cta'), 'bouton inviter du CTA manquant');
assert(pubJs.includes('pub-dash-cta'), 'bouton dashboard du CTA manquant');
assert(pubJs.includes('Prêt à faire vibrer ton serveur ?'), 'titre du CTA manquant');
assert(styleCss.includes('.pub-cta {'), 'styles du CTA final manquants');

// 4. Footer en colonnes façon DraftBot
assert(pubJs.includes('pub-footer-grid'), 'footer en colonnes manquant');
assert(pubJs.includes('pub-footer-col'), 'colonnes du footer manquantes');
assert(pubJs.includes('Navigation'), 'colonne Navigation manquante');
assert(pubJs.includes('Communauté'), 'colonne Communauté manquante');
assert(pubJs.includes('pub-foot-home'), 'lien Accueil du footer manquant');
assert(pubJs.includes('Statut du service'), 'lien statut manquant');
assert(pubJs.includes('pub-footer-bottom'), 'ligne copyright manquante');
assert(styleCss.includes('.pub-footer-grid {'), 'styles du footer en colonnes manquants');

// 5. Cinq sections vitrine au total + mots rotatifs étendus
assert.strictEqual((pubJs.match(/pub-showcase/g) || []).length, 5, 'il doit y avoir 5 vitrines (tickets, XP, modération, rôles, stats)');
assert((pubJs.match(/pub-sc-kicker/g) || []).length >= 5, 'les 5 vitrines doivent avoir leur kicker');
assert(pubJs.includes('tes menus de rôles'), 'mot rotatif rôles manquant');
assert(pubJs.includes('tes statistiques'), 'mot rotatif stats manquant');

// 6. Version v162 déployée (cache PWA + assets)
assert(!index.includes('?v=161'), 'index.html référence encore v161');
assert.strictEqual((index.match(/\?v=162/g) || []).length, 7, 'index.html doit référencer v162 7 fois');
assert(sw.includes("'botdev-v162'"), 'le cache du service worker n’est pas en v162');

console.log('✅ v162 : landing « tout DraftBot » — Action Réaction, Statistiques, CTA final, footer colonnes');
