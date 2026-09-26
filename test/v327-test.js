// v327 — Recherche rôles/salons : on tape le nom simple, même si le vrai
// nom a des crochets japonais, des emojis ou des lettres décoratives.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

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

console.log('— 1. Pins de version v327 —');
check('index.html : ?v=329 ×7', (html.match(/\?v=329/g) || []).length === 7);
check('sw.js : cache botdev-v329', sw.includes("const CACHE = 'botdev-v329';"));
check('index.html : plus aucune ?v=326', !html.includes('?v=326'));

console.log('— 2. Le menu utilise la recherche « lettres simples » —');
check('Dashboard.foldSearch présent', js.includes('Dashboard.foldSearch = (s) =>'));
check('Dashboard.searchMatch présent', js.includes('Dashboard.searchMatch = (query, ...fields)'));
check('filtre du menu : searchMatch (plus de includes brut seul)', js.includes('opts.filter((o) => Dashboard.searchMatch(q, o.label, o.hint))'));
check('NFKC (lettres pleine chasse / mathématiques → lettres simples)', js.includes("normalize('NFKC')"));
check('accents retirés (NFD + marques)', js.includes('\\p{M}+'));

console.log('— 3. Exemples concrets —');
const iFold = js.indexOf('Dashboard.foldSearch = (s) => {');
const iMatch = js.indexOf('Dashboard.searchMatch = (query, ...fields) => {');
const iEnd = js.indexOf('\n};\n\n// dropdownMenu', iMatch);
check('bloc fold+match localisé', iFold > 0 && iMatch > iFold && iEnd > iMatch);
const ctx = { Dashboard: {} };
vm.runInNewContext(js.slice(iFold, iEnd + 3), ctx);
const { foldSearch, searchMatch } = ctx.Dashboard;

check('【🌸】général → general', foldSearch('【🌸】général') === 'general');
check('『STAFF』 → staff', foldSearch('『STAFF』') === 'staff');
check('Ｓｕｐｐｏｒｔ (pleine chasse) → support', foldSearch('Ｓｕｐｐｏｒｔ') === 'support');
check('⋆｡˚ Membre ✿ → membre', foldSearch('⋆｡˚ Membre ✿') === 'membre');

check('taper « general » trouve 【🌸】général', searchMatch('general', '【🌸】général') === true);
check('taper « staff » trouve 『STAFF』', searchMatch('staff', '『STAFF』') === true);
check('taper « membre » trouve le rôle décoré', searchMatch('membre', '⋆｡˚ Membre ✿') === true);
check('taper « support » trouve Ｓｕｐｐｏｒｔ', searchMatch('support', 'Ｓｕｐｐｏｒｔ') === true);
check('taper « log » trouve 【ログ】log-modération', searchMatch('log', '【ログ】log-modération') === true);
check('un nom sans rapport ne match pas', searchMatch('xyzzy', '【🌸】général') === true ? false : true);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
assert.strictEqual(ko, 0);
console.log('\n✅ v327 : ' + ok + ' vérifications passed.');
process.exit(0);
