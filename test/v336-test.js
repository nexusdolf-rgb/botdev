// v336 — /update vraiment enregistrée (global + serveur support, en tête).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v336');
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
const extra = racine('server/discord/extra.js');
const bm = racine('server/discord/botManager.js');
const cl = racine('server/discord/changelog.js');

console.log('— 1. Pins v336 —');
check('index.html : ?v=355 ×7', (html.match(/\?v=355/g) || []).length === 7);
check('sw.js : cache botdev-v355', sw.includes("const CACHE = 'botdev-v355';"));
check('index.html : plus aucune ?v=335', !html.includes('?v=335'));

console.log('— 2. Enregistrement —');
check('/update en tête des commandes extra', extra.indexOf("name: 'update'") < extra.indexOf("name: 'marry'"));
check('botManager place update avant le slice 90', bm.includes("p.name === 'update'") && bm.includes('updatePayloads'));
check('sync sur le serveur support', cl.includes('syncOnSupportGuild') && bm.includes('syncOnSupportGuild'));
check('guild support par défaut', cl.includes('1539668540787925052'));
check('slashPayload name update', cl.includes("name: 'update'"));

process.env.NEXORA_ADMIN_DISCORD_ID = '1497375017980137534';
const changelog = require('../server/discord/changelog');
check('VERSION numérique ≥ 336', changelog.VERSION >= 336);
check('slashPayload()', changelog.slashPayload().name === 'update');
check('fondateur', changelog.isFounder('1497375017980137534') === true);

(async () => {
  const puts = [];
  const okGuild = await changelog.syncOnSupportGuild({
    client: {
      rest: { put: async (route, opts) => { puts.push({ route, opts }); } },
      user: { id: 'app123' },
    },
  }, { client_id: 'app123' });
  check('syncOnSupportGuild envoie 1 PUT', okGuild === true && puts.length === 1);
  check('route = guild support', !!(puts[0] && String(puts[0].route).includes('/guilds/1539668540787925052/commands')));
  check('body = /update seule', !!(puts[0] && puts[0].opts.body.length === 1 && puts[0].opts.body[0].name === 'update'));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v336 : ' + ok + ' vérifications passed.');
})().catch((e) => { console.error(e); process.exit(1); });
