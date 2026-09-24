// v319 — Page « Connectez-vous avec Discord » : photo de profil Optimus
// à la place de la tête 🤖 orange qui flotte. Pas la bannière.
'use strict';
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const app = racine('public/js/app.js');
const css = racine('public/css/style.css');

console.log('— 1. Pins de version v319 —');
check('index.html : ?v=319 ×7', (html.match(/\?v=319/g) || []).length === 7);
check('sw.js : cache botdev-v319', sw.includes("const CACHE = 'botdev-v319';"));
check('index.html : plus aucune ?v=318', !html.includes('?v=318'));

console.log('— 2. Page de connexion : profil Optimus, pas 🤖 orange —');
check('le titre « Connectez-vous avec Discord » est toujours là', app.includes('Connectez-vous avec Discord'));
check('auth-bot-ava utilise /api/public/bot-avatar', app.includes('class="auth-bot-ava"') && app.includes('src="/api/public/bot-avatar"'));
check('plus d’emoji 🤖 dans .auth-bot-ava', !/auth-bot-ava[^>]*>[\s\S]{0,40}🤖/.test(app));
check('ce n’est PAS la bannière', !app.includes('nexora-profile-banner') && !app.includes('optimus-photo.png') && !css.includes('nexora-profile-banner'));
check('CSS : photo en cercle (cover) + animation conservée', css.includes('.auth-bot-ava img') && css.includes('object-fit: cover') && css.includes('avaFloat'));
check('commentaire v319 : profil, pas bannière', css.includes('v319 : photo de PROFIL Optimus'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v319 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
