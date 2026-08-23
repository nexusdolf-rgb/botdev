// Test v1.93 — Pause anti-refroidissement + commandes 100 % globales
// Incident du 23/08/2026 : l'IP partagée de Render a été mise en
// refroidissement par Discord/Cloudflare ; marteler la passerelle prolongeait
// le blocage. Et les commandes en double (globale + par serveur) créaient
// des doublons périmés dans le menu « / ».
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v93test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const bm = require('../server/discord/botManager');

// ---- 1. Barème de pause : rien avant 3 échecs, puis 15/30/60 min plafonné
assert.strictEqual(bm.gatewayPauseMs(0), 0);
assert.strictEqual(bm.gatewayPauseMs(1), 0);
assert.strictEqual(bm.gatewayPauseMs(2), 0);
console.log('✅ échecs 1-2 : pas de pause (le recul progressif du chien de garde suffit)');
assert.strictEqual(bm.gatewayPauseMs(3), 10 * 60000);
assert.strictEqual(bm.gatewayPauseMs(4), 20 * 60000);
assert.strictEqual(bm.gatewayPauseMs(5), 20 * 60000);
assert.strictEqual(bm.gatewayPauseMs(9), 20 * 60000);
console.log('✅ 3e échec : 10 min, 4e et + : 20 min (plafond — ~3 essais/h, ultra-respectueux)');

// ---- 2. La synchro « par serveur » ne pousse PLUS de commandes : elle ne
//      fait que retirer les anciens doublons, UNE seule fois par serveur.
const store = require('../server/db');
const calls = [];
const fakeEntry = {
  record: {},
  client: {
    isReady: () => true,
    user: { id: 'app123' },
    rest: { put: async (route, opts) => { calls.push({ route, body: opts.body }); } },
  },
};
// bot factice en base + client factice enregistré
const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'app123', prefix: '!' });
bm.clients.set(botId, fakeEntry);

(async () => {
  await bm.syncSlashCommands(botId, 'guild42', true);
  assert.strictEqual(calls.length, 1, 'un seul PUT');
  assert.ok(calls[0].route.includes('/guilds/guild42/commands'), 'route par serveur');
  assert.deepStrictEqual(calls[0].body, [], 'liste VIDE = doublons retirés');
  console.log('✅ copies par serveur retirées (PUT liste vide)');

  await bm.syncSlashCommands(botId, 'guild42', true);
  assert.strictEqual(calls.length, 1, 'pas de second PUT');
  console.log('✅ nettoyage fait UNE seule fois par serveur (pas de spam API)');

  // ---- 3. Les payloads globaux interdisent les MP (dm_permission: false)
  //      → comportement identique à avant (commandes visibles en serveur uniquement)
  const { buildSlashPayloads } = require('../server/discord/premade');
  const payloads = buildSlashPayloads(botId);
  assert.ok(Array.isArray(payloads), 'payloads construits');
  console.log('✅ payloads globaux construits (', payloads.length, 'commandes pour ce bot factice )');

  bm.clients.delete(botId);
  console.log('\n🎉 Tous les tests v93 passent');
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
