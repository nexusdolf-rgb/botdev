// Test v160 — grille de sélection de serveurs + hero à bannière (façon DraftBot)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const js = read('public/js/dashboard.js');
const css = read('public/css/dashboard.css');
const routes = read('server/routes.js');
const index = read('public/index.html');
const sw = read('public/sw.js');

// 1. Backend : bannière, membres et boosts exposés aux deux endpoints
assert(routes.includes('bannerURL({ size: 1024 })'), 'bannière Discord non exposée côté backend');
assert(routes.includes('premiumSubscriptionCount'), 'boosts non exposés');
assert(routes.includes('channelsCount'), 'nombre de salons non exposé');
assert(routes.includes('rolesCount'), 'nombre de rôles non exposé');
assert(routes.includes('createdTimestamp'), 'date de création non exposée');

// 2. Grille de sélection de serveurs (modale)
assert(js.includes('Dashboard.openServerPicker'), 'grille de sélection manquante');
assert(js.includes('Choisis un serveur'), 'titre de la grille manquant');
assert(js.includes('Rechercher un serveur'), 'recherche de la grille manquante');
assert(js.includes("data-name="), 'filtrage des cartes par nom manquant');
assert(css.includes('.sp-card {') || css.includes('.sp-card,'), 'styles des cartes serveurs manquants');
assert(css.includes('.sp-grid {'), 'grille CSS manquante');
assert(css.includes('.sp-ico {'), 'icône en recouvrement manquante');
// La carte serveur de la sidebar ouvre la grille
assert(!js.includes("Dashboard.dropdownMenu({\n    trigger: pick,"), 'l’ancien dropdown de la carte serveur devrait être remplacé par la grille');

// 3. Hero de l’accueil avec bannière + stats riches
assert(js.includes('ov-hero-bg'), 'couche bannière du hero manquante');
assert(js.includes('ov-hero-stats'), 'rangée de stats du hero manquante');
assert(js.includes('ov-hero-chip'), 'puces de stats manquantes');
assert(js.includes('has-banner'), 'classe has-banner manquante');
assert(css.includes('.ov-hero-bg {'), 'styles de la bannière du hero manquants');
assert(css.includes('.ov-hero-chip {'), 'styles des puces de stats manquants');

// 4. Version v160 déployée (cache PWA + assets)
assert(!index.includes('?v=159'), 'index.html référence encore v159');
assert.strictEqual((index.match(/\?v=160/g) || []).length, 7, 'index.html doit référencer v160 7 fois');
assert(sw.includes("'botdev-v160'"), 'le cache du service worker n’est pas en v160');

console.log('✅ v160 : grille de sélection de serveurs + hero à bannière et stats riches — dashboard v160');
