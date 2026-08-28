// Test v161 — page d'accueil publique niveau DraftBot : mot rotatif + vitrines + identité Argile
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const pubJs = read('js/public.js');
const styleCss = read('css/style.css');
const index = read('index.html');
const sw = read('sw.js');

// 1. Le mot du titre tourne (façon DraftBot)
assert(pubJs.includes('id="pub-rot"'), 'l’élément rotatif du titre manquant');
assert(pubJs.includes('rotWords'), 'liste des mots rotatifs manquante');
assert(pubJs.includes('ton serveur Discord'), 'premier mot rotatif manquant');
assert(styleCss.includes('.rot-word'), 'styles du mot rotatif manquants');
assert(styleCss.includes('.rot-word.out'), 'animation de sortie du mot manquante');

// 2. Les sections vitrine avec maquettes Discord
assert(pubJs.includes('pub-showcase'), 'sections vitrine manquantes');
assert(pubJs.includes('dc-mock'), 'maquette de message Discord manquante');
assert(pubJs.includes('dcm-embed'), 'embed Discord de la maquette manquant');
assert(pubJs.includes('Ouvrir un ticket'), 'bouton de la maquette tickets manquant');
assert(pubJs.includes('xp-mock'), 'maquette du classement XP manquante');
assert(pubJs.includes('Niveau 24'), 'carte de niveau de la maquette manquante');
assert(pubJs.includes('pub-sc-kicker'), 'kickers des vitrines manquants');
assert(pubJs.includes('pub-sc-list'), 'listes d’atouts des vitrines manquantes');
assert(styleCss.includes('.pub-showcase {'), 'styles des vitrines manquants');
assert(styleCss.includes('.dc-mock {'), 'styles de la maquette Discord manquants');
assert(styleCss.includes('.xp-card {'), 'styles des cartes XP manquants');
assert(styleCss.includes('@media (max-width: 760px)'), 'repli mobile des vitrines manquant');

// 3. Identité Argile : plus aucun violet/blurple codé en dur dans le style public
for (const legacy of ['#5865F2', '#8B5CF6', '#EB459E', '#7082ff', '#9a7bff', '#a9b1ff', '#7588ff', '#a07fff', '#b5beff', '88, 101, 242', '88,101,242', '139, 92, 246', '139,92,246', '112,130,255', '235, 69, 158']) {
  assert(!styleCss.includes(legacy), `couleur legacy encore présente : ${legacy}`);
}
assert(styleCss.includes('--accent: #e07a5f;'), 'accent principal du site public pas en Argile');

// 4. Version v161 déployée (cache PWA + assets)
assert(!index.includes('?v=160'), 'index.html référence encore v160');
assert.strictEqual((index.match(/\?v=161/g) || []).length, 7, 'index.html doit référencer v161 7 fois');
assert(sw.includes("'botdev-v161'"), 'le cache du service worker n’est pas en v161');

console.log('✅ v161 : accueil public façon DraftBot — mot rotatif, vitrines Discord, identité Argile');
