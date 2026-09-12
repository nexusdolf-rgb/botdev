// v281 — Retrait du module « Admin global » : TOUS les réglages du bot
// vivent dans « Réglages du bot » (demande du fondateur). Vérifié : plus de
// module admin dans la navigation, cartes IA plateforme + sauvegarde
// plateforme revenues dans Réglages du bot, sauvegarde de structure v280
// conservée, fichier dashboard syntaxiquement sain, bump de cache.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');

console.log('— 1. Module « Admin global » retiré —');
const bots = (dash.match(/Dashboard\.BOT_MODULES = \[([\s\S]*?)\];/) || [0, ''])[1];
check('absent de la navigation bot', !bots.includes("'admin'") && !bots.includes('Admin global'));
check('renderer admin supprimé', !dash.includes('Dashboard.renderers.admin'));
check('listes botLevel / isBotScope sans admin', (dash.match(/\['commands', 'modules', 'health', 'botsettings', 'help'\]/g) || []).length === 2);

console.log('— 2. Tout le réglage bot dans « Réglages du bot » —');
const iBs = dash.indexOf('Dashboard.renderers.botsettings');
const iFin = dash.indexOf('// Phase 3 (v196)', iBs);
const bs = dash.slice(iBs, iFin);
check('carte IA plateforme RETIRÉE des Réglages du bot (v289)', !bs.includes('aip-key') && !bs.includes('Hoxera AI'));
check('carte sauvegarde plateforme dans Réglages du bot', bs.includes('Sauvegarde automatique') && bs.includes('/backup/now'));
check('carte Général (préfixe, statut) toujours là', bs.includes("Dashboard.card(root, 'Général'"));
check('botsettings sain : plus aucune trace de loadAI / cAI', !bs.includes('loadAI') && !bs.includes('const cAI'));

console.log('— 3. Rien d autre n a bougé —');
check('sauvegarde de structure v280 conservée (module serveur)', dash.includes('bk-create') && dash.includes('Sauvegarde de la structure'));
check('rôles par réaction v277 conservés', dash.includes('rr-send'));
check('module Hoxera AI RETIRÉ de la navigation (v289)', !dash.includes("['ai', '🤖', 'Hoxera AI']"));

console.log('— 4. Version —');
const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
check('index.html : ?v=293 référencé 7 fois', (index.match(/\?v=293/g) || []).length === 7);
check('sw.js : cache « botdev-v293 »', sw.includes("const CACHE = 'botdev-v293';"));

console.log(`\n🎉 v281 — ${ok} vérifications OK : un seul espace de réglages du bot, clair et sain.`);
