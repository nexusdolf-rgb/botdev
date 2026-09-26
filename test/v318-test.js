// v318 — Nettoyage auto : dès l’activation, du plus ancien au plus récent.
// Pas besoin d’attendre qu’un nouveau message soit envoyé.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v318-'));
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
const ac = racine('server/discord/autoclean.js');

console.log('— 1. Pins de version v318 —');
check('index.html : ?v=328 ×7', (html.match(/\?v=328/g) || []).length === 7);
check('sw.js : cache botdev-v328', sw.includes("const CACHE = 'botdev-v328';"));
check('index.html : plus aucune ?v=317', !html.includes('?v=317'));

console.log('— 2. Textes : plus « parmi les récents », on part des anciens —');
check('le dashboard ne dit plus « parmi les récents »', !dash.includes('parmi les récents'));
check('le dashboard dit « du plus ancien au plus récent »', dash.includes('du plus ancien au plus récent'));
check('pas besoin d’attendre un nouveau message', dash.includes('Pas besoin d’attendre un nouveau message') || dash.includes('Rien à envoyer pour lancer'));
check('le moteur remonte l’historique (before)', ac.includes('opts.before') && ac.includes('fetchOldestWindow'));

console.log('— 3. Comportement : les VRAIS plus anciens, même s’il y a 100 messages récents —');
(async () => {
  const botId = Number(store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'G318';
  store.guildSettings.set(botId, G, {
    autoclean_enabled: 1,
    autoclean_channels: JSON.stringify(['C318']),
    autoclean_interval: 2,
  });

  const deleted = [];
  const oldest = { id: 'old-1', createdTimestamp: 1, pinned: false, delete: async () => { deleted.push('old-1'); } };
  const old2 = { id: 'old-2', createdTimestamp: 2, pinned: false, delete: async () => { deleted.push('old-2'); } };
  const recents = Array.from({ length: 100 }, (_, i) => ({
    id: 'r' + i,
    createdTimestamp: 10000 + i,
    pinned: false,
    delete: async () => { deleted.push('r' + i); },
  }));

  const channel = {
    id: 'C318',
    name: 'general',
    isTextBased: () => true,
    messages: {
      fetch: async (opts = {}) => {
        if (opts.before) return [oldest, old2];
        return recents;
      },
    },
  };
  const guild = {
    id: G,
    channels: { cache: { get: (id) => (id === 'C318' ? channel : null), find: () => channel } },
  };
  const entry = { client: { isReady: () => true, guilds: { cache: { values: () => [guild] } } } };

  autoclean.resetTicks();
  const t0 = 2_000_000;
  const r1 = await autoclean.sweep(botId, entry, t0);
  check('1er tick : on supprime le plus ANCIEN du salon (pas un récent)', r1.ran === 1 && deleted[0] === 'old-1', JSON.stringify({ r1, deleted }));

  const r1b = await autoclean.sweep(botId, entry, t0 + 500);
  check('sans nouveau message, on n’accélère pas (toujours 1 / rythme)', r1b.ran === 0 && deleted.join() === 'old-1');

  const r2 = await autoclean.sweep(botId, entry, t0 + 2000);
  check('2e tick : le suivant, toujours du plus ancien vers le plus récent', r2.ran === 1 && deleted.join() === 'old-1,old-2', JSON.stringify({ r2, deleted }));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  console.log('\n✅ v318 : ' + ok + ' vérifications passed.');
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
