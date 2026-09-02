// Test v167 — Home « Optimus Prime » (ancienne page d'accueil, MAJ v195)
// Verrouille : plus aucun clone DraftBot, identité Argile conservée,
// ET les nouvelles sections Home Ultra Pro (v195) ajoutées dessus.
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

// 2. La Home est complète : hero, stats, bots, mock, fonctionnalités
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
assert(pubJs.includes('pub-footer-links'), 'footer links manquants');
assert(pubJs.includes('pub-foot-dash'), 'lien dashboard du footer manquant');
assert(pubJs.includes('loadStats') && pubJs.includes('loadBots'), 'chargement des stats/bots manquant');
assert(pubJs.includes('const countUp'), 'compteurs animés manquants');

// 3. Home Ultra Pro (v195) : présentation, FAQ, CTA final, footer enrichi, ancres
assert(pubJs.includes('hp-about'), 'section présentation manquante');
assert(pubJs.includes('hp-pillars') && pubJs.includes('hp-pillar'), 'piliers de présentation manquants');
assert(pubJs.includes('hp-steps') && pubJs.includes('hp-step'), 'étapes « comment ça marche » manquantes');
assert(pubJs.includes('hp-faq') && pubJs.includes('hp-faq-item') && pubJs.includes('<summary>'), 'FAQ accordéon manquante');
assert(pubJs.includes('Questions fréquentes'), 'titre FAQ manquant');
assert(pubJs.includes('hp-cta') && pubJs.includes('pub-invite-cta'), 'CTA final manquant');
assert(pubJs.includes('hp-footer-cols') && pubJs.includes('hp-footer-bottom'), 'footer enrichi manquant');
assert(pubJs.includes('navbar-links') && pubJs.includes('data-anchor'), 'ancres de navigation manquantes');
assert(pubJs.includes('renderPublicNavbar(true)'), 'navbar avec ancres non appelée pour la Home');
assert(pubJs.includes('pub-invite-cta') && pubJs.includes('pub-dash-cta') && pubJs.includes('pub-connect-cta'), 'gestionnaires CTA manquants');
assert(pubJs.includes('pub-foot-dash-2'), 'second lien dashboard du footer manquant');

// 4. Styles Home Ultra Pro
assert(styleCss.includes('HOXERA ULTRA PRO v195'), 'couche CSS Home Ultra Pro manquante');
assert(styleCss.includes('.navbar-links'), 'styles ancres manquants');
assert(styleCss.includes('.hp-faq-item summary'), 'styles FAQ manquants');
assert(styleCss.includes('.hp-cta-inner'), 'styles CTA final manquants');
assert(styleCss.includes('.hp-footer-cols'), 'styles footer enrichi manquants');
assert(styleCss.includes('html.hx-light .hp-about-card'), 'mode clair Home manquant');
assert(styleCss.includes('@media (max-width: 900px)') && styleCss.includes('.hp-about-grid { grid-template-columns: 1fr; }'), 'responsive Home manquant');

// 5. Une seule définition de la landing + identité Argile conservée
assert.strictEqual((pubJs.match(/App\.renderPublicLanding = /g) || []).length, 1, 'renderPublicLanding défini plusieurs fois');
assert(styleCss.includes('--accent: #e07a5f;'), 'accent principal pas en Argile');

// 6. Version courante
assert((index.match(/\?v=203/g) || []).length === 7, 'index.html doit référencer v195 7 fois');
assert(sw.includes('botdev-v203'), 'cache du service worker pas en v195');

console.log('✅ v167 (v195) : Home Ultra Pro — ancienne identité conservée, clone DraftBot absent, nouvelles sections en place');
