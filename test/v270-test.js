// v270 — Correctif : le sélecteur « salon textuel du panneau » était VIDE.
//
// Le catalogue Discord (GET /bots/:id/guilds/:guildId) renvoie les salons
// textuels SANS drapeau : { id, name } — seuls les vocaux portent voice:true
// et les catégories category:true. Le filtre v267 testait `ch.text`, toujours
// absent → liste vide → « — Aucun panneau — » partout.
// Nouveau filtre : un salon textuel = ni vocal, ni catégorie.
//
// Vérifié ici : le filtre du module Vocal est correct, aucun filtre vt ne
// teste plus ch.text, le comportement sur un catalogue réaliste, version 270.

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

console.log('— 1. Le filtre des salons textuels —');
const rend = dash.match(/Dashboard\.renderers\.voicetemp = async[\s\S]*?\n\};/);
check('rendeur voicetemp présent', !!rend);
const body = rend ? rend[0] : '';
check('filtre « ni vocal ni catégorie »', body.includes("filter((ch) => !ch.voice && !ch.category)"));
check('…plus aucun test sur ch.text dans le module', !body.includes('ch.text'));

console.log('— 2. Comportement sur un catalogue Discord réaliste —');
// Forme exacte renvoyée par guildCatalog() côté serveur.
const catalogue = [
  { id: 'C0', name: 'général' },
  { id: 'C1', name: 'annonces' },
  { id: 'V0', name: '🔊 Salon principal', voice: true },
  { id: 'V1', name: '➕ Créer un vocal', voice: true },
  { id: 'K0', name: 'SERVEUR', category: true },
];
const filt = new Function('channels', 'return channels.filter((ch) => !ch.voice && !ch.category);');
const textes = filt(catalogue);
check('les 2 salons textuels sont proposés', textes.length === 2 && textes[0].id === 'C0' && textes[1].id === 'C1');
check('…vocaux et catégories exclus', !textes.some((c) => c.voice || c.category));
const vocaux = catalogue.filter((ch) => ch.voice);
check('le sélecteur vocal garde les 2 vocaux', vocaux.length === 2);

console.log('— 3. Le reste du module est intact —');
check('sélecteurs et boutons toujours présents', body.includes('id="vt-channel"') && body.includes('id="vt-cat"') && body.includes('id="vt-panel"') && body.includes('id="vt-emotes"'));
check('les options # proviennent bien de vtTextChannels', body.includes('vtTextChannels.map'));

console.log('— 4. Version —');
const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
check('index.html : ?v=293 référencé 7 fois', (index.match(/\?v=293/g) || []).length === 7);
check('sw.js : cache « botdev-v293 »', sw.includes("const CACHE = 'botdev-v293';"));

console.log('');
if (ko === 0) console.log(`🎉 v270 — ${ok} vérifications OK : le sélecteur de salon textuel revit.`);
else { console.log(`❌ v270 — ${ko} échec(s)`); process.exitCode = 1; }
