// v348 — Modération : moins de texte, options repliées, sélecteurs.
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
const iM = dash.indexOf('Dashboard.renderers.moderation');
const chunk = dash.slice(iM, dash.indexOf('Dashboard.renderers.antinuke', iM));

console.log('— 1. Pins v348 —');
check('index.html : ?v=358 ×7', (html.match(/\?v=358/g) || []).length === 7);
check('sw.js : cache botdev-v358', sw.includes("const CACHE = 'botdev-v358';"));
check('index.html : plus aucune ?v=347', !html.includes('?v=347'));
check('v348 conservée dans le journal des versions récentes', changelog.VERSION >= 348 && changelog.VERSIONS.some((version) => version.v === 348));
check('journal v348 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);

console.log('— 2. Page plus courte —');
check('options de filtre repliées', chunk.includes('am-rule-more') && css.includes('.am-rule-more'));
check('avertissements / blacklist repliés', chunk.includes('class="am-fold"') && css.includes('.am-fold'));
check('plus de pavé « Protection intelligente »', !chunk.includes('Protection intelligente'));
check('certitude phishing toujours expliquée', /Deux niveaux de certitude/.test(chunk) && /jamais de ban, kick ou muet/.test(chunk));

console.log('— 3. Sélecteurs —');
check('barème : après N = menu', chunk.includes('data-esc-after') && chunk.includes('fois →'));
check('simulateur rafale = menu', chunk.includes('id="am-sim-spam"') && chunk.includes('Pas de rafale'));
check('anti-raid seuil = menu', chunk.includes('id="raid-th"') && chunk.includes('presetOptions([[5, \'5\']'));
check('sanctions en français', chunk.includes('⚠️ Avertir') && chunk.includes('👢 Expulser'));

console.log('— 4. Rien de cassé —');
for (const id of ['am-on', 'am-mode', 'am-phishing', 'am-links', 'am-caps', 'am-men', 'am-spam', 'am-save', 'am-draft', 'am-sim-go', 'am-native-on', 'am-native-sync', 'am-warn-limit', 'am-blacklist-channel']) {
  check('id #' + id, chunk.includes('id="' + id + '"') || chunk.includes("id=\\'" + id + "\\'") || chunk.includes('#' + id));
}
check('hideCards liste noire + anti-raid', dash.includes("hideCards(content, ['Liste noire', 'Bouclier anti-raid'])"));
check('cartes titres conservés', chunk.includes('🛡️ Auto-modération') && chunk.includes('📈 Barème progressif des sanctions') && chunk.includes('Centre des avertissements'));
check('tickets IDs intacts', dash.includes('t-send') && dash.includes('tm-send') && dash.includes('adv-send'));
check('captcha ver-send', dash.includes('ver-send'));
check('Control Center', dash.includes('<span>Control Center</span>'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
assert.strictEqual(ko, 0);
console.log('\n✅ v348 : ' + ok + ' vérifications passed.');
