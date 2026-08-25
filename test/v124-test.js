// Test v3.20 — Design System Discord : panneaux et MP professionnels
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ui = require('../server/discord/ui');
const panelsSource = fs.readFileSync(path.join(__dirname, '..', 'server/discord/panels.js'), 'utf8');
const extraSource = fs.readFileSync(path.join(__dirname, '..', 'server/discord/extra.js'), 'utf8');
const giveawaySource = fs.readFileSync(path.join(__dirname, '..', 'server/discord/giveaway.js'), 'utf8');
const automodSource = fs.readFileSync(path.join(__dirname, '..', 'server/discord/automod.js'), 'utf8');

const payload = ui.panel({
  variant: 'success',
  title: '✅ Opération terminée',
  description: 'Le panneau est prêt.',
  fields: [{ name: '📌 Statut', value: 'Publié', inline: true }],
  footer: 'Hoxera · Test',
});
assert.strictEqual(payload.embeds.length, 1);
assert.strictEqual(payload.embeds[0].data.color, 0x57F287);
assert.strictEqual(payload.embeds[0].data.title, '✅ Opération terminée');
assert.strictEqual(payload.embeds[0].data.fields[0].name, '📌 Statut');

const buttons = ui.row([
  { customId: 'hx-test-a', label: '✅ Accepter', style: 3 },
  { customId: 'hx-test-b', label: '❌ Refuser', style: 4 },
]);
assert.strictEqual(buttons.components.length, 2);
assert.strictEqual(buttons.components[0].data.custom_id, 'hx-test-a');
assert.strictEqual(ui.linkRow('Ouvrir', 'https://example.com').components[0].data.style, 5);

// Les panneaux importants utilisent la brique commune et gardent les anciens
// custom_id des boutons de ticket.
assert.ok(panelsSource.includes("const ui = require('./ui')"));
assert.ok(panelsSource.includes('ui.embed({') && panelsSource.includes('ui.panel({'));
assert.ok(panelsSource.includes('ui.linkRow(\'📜 Ouvrir la transcription\''));
assert.ok(panelsSource.includes('bd-tmenu:${botId}:claim'));
assert.ok(extraSource.includes("const ui = require('./ui')"));
assert.ok(extraSource.includes('ui.panel({') && giveawaySource.includes("const ui = require('./ui')"));
assert.ok(automodSource.includes('embeds: [ui.embed({'));

console.log('✅ v3.20 : Design System Discord, panneaux ticket, boutons et MP professionnels');
