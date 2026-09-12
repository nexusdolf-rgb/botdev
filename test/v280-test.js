// v280 — Sauvegarde de la structure du serveur.
// Vérifié : instantané rôles+catégories+salons, 5 max, restauration SÛRE
// (recrée uniquement ce qui manque, ne supprime rien), export, routes,
// carte dashboard, bump de cache.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v280');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const bk = require('../server/discord/backup');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

function makeGuild() {
  const roles = [
    { name: 'Admin', color: 0xe07a5f, hoist: true, mentionable: false, permissions: { bitfield: '8' }, position: 10 },
    { name: 'Membre', color: 0, hoist: false, mentionable: true, permissions: { bitfield: '0' }, position: 1 },
  ];
  const cat = { name: 'Communauté', type: 4, position: 0 };
  const channels = [
    cat,
    { name: 'general', type: 0, topic: 'Bonjour !', position: 1, parent: cat, bitrate: 0, userLimit: 0, rateLimitPerUser: 0, nsfw: false },
    { name: 'Vocal Jeux', type: 2, position: 2, parent: cat, bitrate: 64000, userLimit: 5, rateLimitPerUser: 0, nsfw: false },
  ];
  return {
    name: 'Mon Serveur',
    roles: { cache: { values: () => roles } },
    channels: { cache: { values: () => channels } },
  };
}

(async () => {
  store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = 'gBk';

  console.log('— 1. Instantané de structure —');
  const snap = bk.snapshot(makeGuild());
  check('rôles photographiés (sans @everyone), position gardée', snap.roles.length === 2 && snap.roles[0].name === 'Admin');
  check('catégories + salons photographiés avec parent par nom', snap.channels.length === 3 && snap.channels.find((c) => c.name === 'general').parent === 'Communauté');
  check('compteurs lisibles', snap.counts.roles === 2 && snap.counts.channels === 3);

  console.log('— 2. Liste & limites —');
  check('aucune sauvegarde au départ', bk.listOf(G).length === 0);
  let first = null;
  for (let i = 0; i < 6; i++) first = bk.create(G, makeGuild());
  check('6 créations → 5 conservées (plus récentes d abord)', bk.listOf(G).length === 5 && bk.listOf(G)[0].id === first.id);
  check('…récupération par id', !!bk.get(G, first.id));

  console.log('— 3. Restauration SÛRE (rien de supprimé) —');
  const createdRoles = []; const createdChannels = [];
  const existingCat = { name: 'Communauté', type: 4 };
  const target = {
    roles: {
      cache: { values: () => [{ name: 'Membre' }] },
      create: async (o) => { createdRoles.push(o.name); return { name: o.name }; },
    },
    channels: {
      cache: { values: () => [existingCat, { name: 'general', type: 0 }] },
      create: async (o) => { createdChannels.push({ name: o.name, type: o.type, parent: o.parent && o.parent.name }); return { name: o.name }; },
    },
  };
  const made = await bk.restore(target, bk.get(G, first.id));
  check('rôle existant NON recréé, rôle manquant recréé', made.roles === 1 && createdRoles[0] === 'Admin');
  check('catégorie existante NON recréée', !createdChannels.some((c) => c.name === 'Communauté'));
  check('salon manquant recréé sous sa catégorie', createdChannels.some((c) => c.name === 'Vocal Jeux' && c.parent === 'Communauté'));
  check('salon existant NON recréé', !createdChannels.some((c) => c.name === 'general'));
  bk.remove(G, first.id);
  check('suppression d une sauvegarde', !bk.get(G, first.id));

  console.log('— 4. Routes & dashboard —');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('routes liste / création / restauration / export / suppression', routes.includes("guilds/:guildId/backups'") && routes.includes('backups/:bid/restore') && routes.includes('backups/:bid/export') && routes.includes("backups/:bid', requireAuth"));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('carte dashboard « Sauvegarde de la structure »', dash.includes('Sauvegarde de la structure'));
  check('…boutons créer / restaurer / exporter / supprimer', ['bk-create', 'bk-restore', 'bk-export', 'bk-del'].every((id) => dash.includes(id)));

  console.log('— 5. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=291 référencé 7 fois', (index.match(/\?v=291/g) || []).length === 7);
  check('sw.js : cache « botdev-v291 »', sw.includes("const CACHE = 'botdev-v291';"));

  console.log(`\n🎉 v280 — ${ok} vérifications OK : sauvegarde de structure, restauration sans risque.`);
})().catch((e) => { console.error(e); process.exit(1); });
