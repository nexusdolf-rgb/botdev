// v269 — Le module Vocal a SON onglet dans le dashboard.
//
// Le maître ne trouvait pas la carte des vocaux temporaires : elle était
// rangée DANS « ⚙️ Réglages serveur ». Elle devient un module à part entière,
// visible comme tous les autres dans la navigation, la grille, la recherche
// et la liste mobile : « 🎙️ Vocal ».
//
// Vérifié ici : le module est déclaré, son rendeur existe et porte toute la
// carte (sélecteurs + boutons panneau/émojis), Réglages serveur ne la contient
// plus, le banc d'audit mobile connaît le module, version 269.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');

console.log('— 1. Le module apparaît dans la liste —');
const mods = dash.match(/Dashboard\.MODULES = \[([\s\S]*?)\];/);
check('module « voicetemp » déclaré dans MODULES', !!mods && mods[1].includes("['voicetemp'"));
check('…avec icône 🎙️ et libellé Vocal', !!mods && /\['voicetemp', '🎙️', 'Vocal'\]/.test(mods[1]));
check('…placé parmi les modules serveur (pas bot)', !!mods && mods[1].includes("['voicetemp'") && !((dash.match(/Dashboard\.BOT_MODULES = \[([\s\S]*?)\];/) || [0, ''])[1].includes('voicetemp')));

console.log('— 2. Son rendeur porte toute la carte —');
const rend = dash.match(/Dashboard\.renderers\.voicetemp = async[\s\S]*?\n\};/);
check('rendeur Dashboard.renderers.voicetemp présent', !!rend);
const body = rend ? rend[0] : '';
check('…sélecteur du salon de création', body.includes('id="vt-channel"'));
check('…sélecteur de catégorie', body.includes('id="vt-cat"'));
check('…sélecteur du salon textuel du panneau', body.includes('id="vt-panel"'));
check('…boutons enregistrer / panneau / émojis', body.includes('id="vt-save"') && body.includes('id="vt-panel-send"') && body.includes('id="vt-emotes"'));
check('…en-tête de page dédié « Vocal »', body.includes("'🎙️', 'Vocal'"));

console.log('— 3. Réglages serveur ne la contient plus —');
const srv = dash.match(/Dashboard\.renderers\.server = async[\s\S]*?\n\};/);
check('rendeur server présent', !!srv);
check('…sans aucun champ vt-*', srv && !srv[0].includes('vt-channel') && !srv[0].includes('vt-panel'));
check('…sous-titre mis à jour (plus de promesse vocale)', srv && !dash.includes('anniversaires, salons vocaux temporaires et plus'));

console.log('— 4. Banc d\'audit mobile —');
const banc = fs.readFileSync(path.join(__dirname, 'tools', 'audit-mobile.js'), 'utf8');
check('audit-mobile audite le module voicetemp par défaut', banc.includes("'voicetemp'"));

console.log('— 5. Version —');
const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
check('index.html : ?v=271 référencé 7 fois', (index.match(/\?v=271/g) || []).length === 7);
check('sw.js : cache « botdev-v271 »', sw.includes("const CACHE = 'botdev-v271';"));

console.log('');
if (ko === 0) console.log(`🎉 v269 — ${ok} vérifications OK : le module Vocal a son onglet.`);
else { console.log(`❌ v269 — ${ko} échec(s)`); process.exitCode = 1; }
