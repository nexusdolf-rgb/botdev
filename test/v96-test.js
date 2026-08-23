// Test v1.96 — Le module « extra » reçoit bien l'interaction
// Bug historique (introduit en v1.50 le 17/08, découvert le 23/08) :
// guardInteraction appelait extra.handleInteraction(botId, i) au lieu de
// (botId, entry, i) → l'interaction arrivait dans le paramètre « entry »
// et TOUTES les interactions du module extra (jeux, mariages, boutons…)
// plantaient en silence avec « Cannot read properties of undefined ».
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v96test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const bm = require('../server/discord/botManager');
const extra = require('../server/discord/extra');

// Espion : on remplace handleInteraction pour capturer les arguments reçus
const received = [];
const original = extra.handleInteraction;
extra.handleInteraction = async (...args) => { received.push(args); return true; };

const fakeEntry = { record: {}, client: { isReady: () => true } };
const fakeInteraction = {
  isChatInputCommand: () => false,
  isButton: () => false,
  isModalSubmit: () => false,
  isRepliable: () => false,
  guild: null,
  customId: 'test-v96',
};

(async () => {
  await bm.guardInteraction(1, fakeEntry, fakeInteraction, 5000);

  assert.strictEqual(received.length, 1, 'extra.handleInteraction appelé une fois');
  const [botId, entry, interaction] = received[0];
  assert.strictEqual(received[0].length, 3, 'TROIS arguments (botId, entry, interaction)');
  assert.strictEqual(botId, 1, '1er argument = botId');
  assert.strictEqual(entry, fakeEntry, '2e argument = entry (pas l\'interaction !)');
  assert.strictEqual(interaction, fakeInteraction, '3e argument = la vraie interaction');
  assert.strictEqual(typeof interaction.isChatInputCommand, 'function', 'l\'interaction a bien ses méthodes');
  console.log('✅ extra.handleInteraction reçoit (botId, entry, interaction) — plus jamais d\'interaction dans le mauvais paramètre');

  extra.handleInteraction = original;
  console.log('\n🎉 Tous les tests v96 passent');
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
