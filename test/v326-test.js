// v326 — Rôles : limite Discord respectée (plus de disparition silencieuse)
// + sélecteurs identiques (plus de « grand truc » différent sur mobile).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v326');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const js = racine('public/js/dashboard.js');
const views = racine('public/js/views.js');
const css = racine('public/css/dashboard.css');
const routes = racine('server/routes.js');
const rrSrc = racine('server/discord/reactionroles.js');

console.log('— 1. Pins de version v326 —');
check('index.html : ?v=326 ×7', (html.match(/\?v=326/g) || []).length === 7);
check('sw.js : cache botdev-v326', sw.includes("const CACHE = 'botdev-v326';"));
check('index.html : plus aucune ?v=325', !html.includes('?v=325'));

console.log('— 2. Sélecteurs : le même menu partout —');
check('v157 : ciblage dash-select conservé', js.includes('select.dash-select:not([data-dd])'));
check('aussi dash-input et input (modales, embed…)', js.includes("select.dash-input:not([data-dd])") && js.includes("select.input:not([data-dd])"));
check('le host reprend max-width du select', js.includes('if (select.style.maxWidth) host.style.maxWidth = select.style.maxWidth'));
check('menu de rôles : dash-select (plus de select.input natif)', views.includes('select class="dash-select" id="rm-mode"') && views.includes('select class="dash-select" id="rm-channel"') && views.includes('select class="dash-select" data-k="role"'));
check('lignes réaction : classe rr-map-row', js.includes('class="rr-map-row"') && css.includes('.rr-map-row'));

console.log('— 3. Plafonds Discord, plus de coupe silencieuse —');
check('menu de rôles : 25 max côté éditeur', views.includes('const ROLE_MENU_MAX = 25') && views.includes('Discord n’accepte que 25 rôles par panneau'));
check('routes POST : refuse > 25', routes.includes("Discord n\\'accepte que 25 rôles par panneau"));
check('réactions : 20 max (plus de slice 10)', rrSrc.includes('const MAX_MAPPINGS = 20') && !rrSrc.includes('.slice(0, 10)'));
check('dashboard réactions : compteur 20 + try/catch', js.includes('const RR_MAX = 20') && js.includes("App.toast((e && e.message) || 'Envoi impossible.', 'error')"));

console.log('— 4. Comportement réel saveAll —');
const rr = require('../server/discord/reactionroles');
const twenty = Array.from({ length: 20 }, (_, i) => ({ emoji: String.fromCodePoint(0x1F600 + i), role: 'r' + i }));
const twentyOne = twenty.concat([{ emoji: '⭐', role: 'rx' }]);
let threw = false;
try { rr.saveAll('g326', [{ id: 'a', channel: 'c', mappings: twentyOne }]); }
catch (e) { threw = /20/.test(String(e.message || e)); }
check('21 réactions : erreur (rien n’est coupé en silence)', threw);
const saved = rr.saveAll('g326', [{ id: 'b', channel: 'c', mappings: twenty }]);
check('20 réactions : enregistrées intégralement', saved.length === 1 && saved[0].mappings.length === 20);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v326 : ' + ok + ' vérifications passed.');
process.exit(0);
