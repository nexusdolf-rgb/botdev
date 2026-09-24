// v317 — Module « Nettoyage auto » : salons choisis, 1 message / X secondes.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v317-'));
process.env.BOTDEV_DATA_DIR = TMP;

const store = require('../server/db');
const autoclean = require('../server/discord/autoclean');

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
const routes = racine('server/routes.js');
const db = racine('server/db.js');
const idx = racine('server/index.js');
const ac = racine('server/discord/autoclean.js');

console.log('— 1. Pins de version v317 —');
check('index.html : ?v=321 ×7', (html.match(/\?v=321/g) || []).length === 7);
check('sw.js : cache botdev-v321', sw.includes("const CACHE = 'botdev-v321';"));
check('index.html : plus aucune ?v=316', !html.includes('?v=316'));

console.log('— 2. Dashboard : le module est là —');
check('entrée menu Nettoyage auto', dash.includes("['autoclean', '🧹', 'Nettoyage auto']"));
check('renderer Dashboard.renderers.autoclean', dash.includes('Dashboard.renderers.autoclean'));
check('sélecteur multi-salons', dash.includes("id=\"ac-channels\"") && dash.includes('Ajouter un salon'));
check('rythme en secondes', dash.includes('id="ac-interval"') && dash.includes('10 s · conseillé'));
check('enregistre via PUT /autoclean', dash.includes('/autoclean') && dash.includes('id="ac-save"'));
check('pas de bulkDelete dans le module', !ac.includes('bulkDelete'));

console.log('— 3. API + base + horloge —');
check('colonnes guild_settings autoclean_*', db.includes('autoclean_enabled') && db.includes('autoclean_channels') && db.includes('autoclean_interval'));
check('route PUT /autoclean', routes.includes("router.put('/bots/:id/guilds/:guildId/autoclean'"));
check('balayage toutes les 1 s', idx.includes('autocleanBusy') && idx.includes("require('./discord/autoclean')"));

console.log('— 4. Règles : intervalle, salons, plus ancien, pas tout d’un coup —');
check('intervalle 1 s → plancher 2 s', autoclean.clampInterval(1) === 2);
check('intervalle 99999 → plafond 3600 s', autoclean.clampInterval(99999) === 3600);
check('intervalle vide → 10 s', autoclean.clampInterval('') === 10);
check('salons : max 20, sans doublon', autoclean.sanitizeChannels(['1', '1', '2', '<script>', ...Array.from({ length: 30 }, (_, i) => String(1000 + i))]).length === 20);
const pinned = { id: 'P', createdTimestamp: 1, pinned: true, delete: async () => { throw new Error('pinned'); } };
const newest = { id: 'N', createdTimestamp: 300, pinned: false, delete: async () => {} };
const oldest = { id: 'O', createdTimestamp: 100, pinned: false, delete: async () => {} };
const mid = { id: 'M', createdTimestamp: 200, pinned: false, delete: async () => {} };
check('on prend le plus ancien non épinglé', autoclean.pickOldestDeletable([newest, pinned, oldest, mid]).id === 'O');

console.log('— 5. Comportement réel (1 message par tick) —');
(async () => {
  const botId = Number(store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'G317';
  store.guildSettings.set(botId, G, {
    autoclean_enabled: 1,
    autoclean_channels: JSON.stringify(['C317']),
    autoclean_interval: 2,
  });
  const saved = store.guildSettings.get(botId, G);
  check('la config est persistée', Number(saved.autoclean_enabled) === 1 && String(saved.autoclean_channels).includes('C317'));

  const deleted = [];
  const msgs = [
    { id: 'm1', createdTimestamp: 10, pinned: false, delete: async () => { deleted.push('m1'); } },
    { id: 'm2', createdTimestamp: 20, pinned: false, delete: async () => { deleted.push('m2'); } },
    { id: 'pin', createdTimestamp: 1, pinned: true, delete: async () => { deleted.push('pin'); } },
  ];
  const channel = {
    id: 'C317',
    name: 'general',
    isTextBased: () => true,
    messages: {
      fetch: async () => ({ values: () => msgs.filter((m) => !deleted.includes(m.id)).values() }),
    },
  };
  const guild = {
    id: G,
    channels: {
      cache: {
        get: (id) => (id === 'C317' ? channel : null),
        find: () => channel,
      },
    },
  };
  const entry = {
    client: {
      isReady: () => true,
      guilds: { cache: { values: () => [guild] } },
    },
  };

  autoclean.resetTicks();
  const t0 = 1_000_000;
  const r1 = await autoclean.sweep(botId, entry, t0);
  check('1er tick : 1 seul message supprimé (le plus ancien)', r1.ran === 1 && deleted.join() === 'm1', JSON.stringify({ r1, deleted }));

  const r1b = await autoclean.sweep(botId, entry, t0 + 500);
  check('trop tôt : on n’enchaîne pas (pas tout d’un coup)', r1b.ran === 0 && deleted.join() === 'm1', JSON.stringify({ r1b, deleted }));

  const r2 = await autoclean.sweep(botId, entry, t0 + 2000);
  check('2e tick : le message suivant, toujours pas l’épinglé', r2.ran === 1 && deleted.join() === 'm1,m2', JSON.stringify({ r2, deleted }));

  store.guildSettings.set(botId, G, { autoclean_enabled: 0 });
  autoclean.resetTicks();
  const rOff = await autoclean.sweep(botId, entry, t0 + 8000);
  check('module désactivé → plus aucune suppression', rOff.ran === 0 && deleted.join() === 'm1,m2');

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  console.log('\n✅ v317 : ' + ok + ' vérifications passed.');
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
