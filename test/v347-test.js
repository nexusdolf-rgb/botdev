// v347 — Tickets : noms clairs (classique / menu / avancé) + textes des modules.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const dash = racine('public/js/dashboard.js');
const css = racine('public/css/dashboard.css');
const changelog = require('../server/discord/changelog');
const iT = dash.indexOf('Dashboard.renderers.tickets');
const chunk = dash.slice(iT, dash.indexOf('Dashboard.renderers.welcome', iT));

console.log('— 1. Pins v347 —');
check('index.html : ?v=350 ×7', (html.match(/\?v=350/g) || []).length === 7);
check('sw.js : cache botdev-v350', sw.includes("const CACHE = 'botdev-v350';"));
check('index.html : plus aucune ?v=346', !html.includes('?v=346'));
check('VERSION ≥ 347', changelog.VERSION >= 347);
check('journal v347 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);
check('v347 dans la liste', changelog.VERSIONS.some((x) => x.v === 347));

console.log('— 2. Trois noms clairs —');
check('carte Ticket classique', chunk.includes('🎫 Ticket classique'));
check('carte Ticket menu', chunk.includes('📋 Ticket menu'));
check('carte Ticket avancé', chunk.includes('🎨 Ticket avancé'));
check('exemples sur les cartes', chunk.includes('Exemple : « Ouvrir un ticket »') && chunk.includes('Support, Partenariat, Signalement'));
check('guide 3 cases + exemples', chunk.includes('data-jump="tk-classic"') && chunk.includes('data-jump="tk-menu"') && chunk.includes('data-jump="tk-adv"'));
check('avancé ≠ Ticket menu', chunk.includes('PAS le Ticket menu'));
check('plus d’« Autre système : tickets avancés »', !chunk.includes('Autre système : tickets avancés'));
check('plus de « Panneau avec menu (liste) » comme titre', !chunk.includes('Panneau avec menu (liste)'));

console.log('— 3. IDs / APIs intacts —');
for (const id of ['t-send', 'tm-send', 'adv-send', 'tp-save', 'mp-save', 't-channel', 't-role', 'adv-mode', 'ver-send']) {
  check('id #' + id + ' toujours là', dash.includes('id="' + id + '"') || dash.includes('#' + id));
}
check('envoi bouton / menu séparés', chunk.includes("mode: 'button'") && chunk.includes("mode: 'menu'"));
check('menus extra toujours là', chunk.includes('Autres panneaux menu') && chunk.includes('openTicketMenuModal'));
check('advanced-tickets toujours utilisé', chunk.includes('/advanced-tickets'));
check('Control Center sidebar', dash.includes('<span>Control Center</span>'));
check('badges v110', dash.includes('➕ Inviter le bot') && dash.includes('✅ Configurer'));

console.log('— 4. Sélecteurs + textes modules —');
check('labels salon = nom du système', chunk.includes('Salon du Ticket classique') && chunk.includes('Salon du Ticket menu') && chunk.includes('Salon du Ticket avancé'));
check('sélecteur affichage avancé plus clair', chunk.includes('Boutons — un bouton par type') && chunk.includes('Liste — le membre choisit le type'));
check('CSS 3 colonnes', css.includes('repeat(3, minmax(0, 1fr))'));
check('annonce : « heures choisis »', dash.includes('heures choisis'));
check('plus de « heures choisissez »', !dash.includes('heures choisissez'));
check('bienvenue vouvoiement', dash.includes('Accueillez les nouveaux membres'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
assert.strictEqual(ko, 0);
console.log('\n✅ v347 : ' + ok + ' vérifications passed.');
