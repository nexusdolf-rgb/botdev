// v271 — Selecteurs du dashboard DANS L'ORDRE DU SERVEUR DISCORD.
//
// Avant : salons et rôles arrivaient triés « alphabétique / catégories
// d'abord » — pour le maître, tout paraissait mélangé, parce que ça ne
// ressemblait pas à son serveur. Le catalogue Discord (guildCatalog) trie
// maintenant comme à l'écran :
//   • catégories par position ;
//   • salons groupés par catégorie parente (sans catégorie d'abord), puis
//     par position ;
//   • rôles du plus haut au plus bas de la hiérarchie.
//
// Vérifié ici : le tri sur un catalogue mélangé, l'usage par guildCatalog
// (position + parente remontées), et la version 271.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const routes = require('../server/routes');
const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');

console.log('— 1. Salons : ordre du serveur, catégories comprises —');
const channels = [
  { id: 'V2', name: '🔊 Jeux', voice: true, position: 1, parent: 'K1' },
  { id: 'C2', name: 'annonces', position: 5, parent: '' },
  { id: 'K1', name: 'COMMUNAUTÉ', category: true, position: 1 },
  { id: 'C1', name: 'général', position: 0, parent: '' },
  { id: 'K0', name: 'INFO', category: true, position: 0 },
  { id: 'C3', name: 'règles', position: 2, parent: 'K0' },
  { id: 'V1', name: '➕ Créer un vocal', voice: true, position: 0, parent: 'K1' },
];
routes.sortGuildCatalog(channels, []);
check('catégories d\'abord, par position', channels[0].name === 'INFO' && channels[1].name === 'COMMUNAUTÉ');
check('…salons sans catégorie, par position', channels[2].name === 'général' && channels[3].name === 'annonces');
check('…puis chaque catégorie, salons par position', channels[4].name === 'règles' && channels[5].name === '➕ Créer un vocal' && channels[6].name === '🔊 Jeux');
const textes = channels.filter((c) => !c.voice && !c.category).map((c) => c.name);
check('le sélecteur textuel hérite du bon ordre', textes.join(',') === 'général,annonces,règles');

console.log('— 2. Rôles : hiérarchie Discord (haut → bas) —');
const roles = [
  { id: 'R1', name: 'Admin', position: 3 },
  { id: 'R2', name: 'Zebre', position: 9 },
  { id: 'R3', name: 'Membre', position: 1 },
];
routes.sortGuildCatalog([], roles);
check('rôle le plus haut d\'abord, PAS alphabétique', roles.map((r) => r.name).join(',') === 'Zebre,Admin,Membre');

console.log('— 3. Le catalogue remonte bien position et catégorie parente —');
const block = src.slice(src.indexOf('async function guildCatalog'), src.indexOf("router.get('/bots/:id/guilds/:guildId'"));
check('salons textuels : position + parent', block.includes("channels.push({ id: ch.id, name: ch.name, position: ch.position || 0, parent: ch.parentId || '' })"));
check('vocaux : position + parent', block.includes("voice: true, position: ch.position || 0, parent: ch.parentId || ''"));
check('catégories : position', block.includes('category: true, position: ch.position || 0'));
check('rôles : position', block.includes("roles.push({ id: r.id, name: r.name, position: r.position || 0 })"));
check('guildCatalog applique le tri', block.includes('sortGuildCatalog(channels, roles)'));

console.log('— 4. Version —');
const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
check('index.html : ?v=275 référencé 7 fois', (index.match(/\?v=275/g) || []).length === 7);
check('sw.js : cache « botdev-v275 »', sw.includes("const CACHE = 'botdev-v275';"));

console.log('');
if (ko === 0) console.log(`🎉 v271 — ${ok} vérifications OK : les selecteurs suivent l'ordre du serveur.`);
else { console.log(`❌ v271 — ${ko} échec(s)`); process.exitCode = 1; }
