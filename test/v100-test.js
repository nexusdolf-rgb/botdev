// Test v2.3 — 📔 Journal des tickets (récapitulatif staff)
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v23test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const src = fs.readFileSync(__dirname + '/../server/discord/panels.js', 'utf8');

(async () => {
  // ---- 1. Réglage du salon de journal persisté ----
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  store.guildSettings.set(botId, 'g1', { ticket_log_channel: '#logs-tickets' });
  assert.strictEqual(store.guildSettings.get(botId, 'g1').ticket_log_channel, '#logs-tickets');
  console.log('✅ réglage ticket_log_channel enregistré et relu');

  // ---- 2. Raison d'ouverture stockée en base ----
  store.openTickets.add(botId, 'g1', { channel_id: 'chan1', number: 7, opener_id: 'u1', opener_tag: 'Membre#1', type_label: 'Support', open_reason: 'Mon paiement a échoué' });
  const row = store.openTickets.getByChannel('chan1');
  assert.strictEqual(row.open_reason, 'Mon paiement a échoué');
  assert.strictEqual(row.number, 7);
  console.log('✅ raison d\'ouverture stockée dans la fiche du ticket');

  // ---- 3. Référence du panneau de journal (pour la mise à jour ⭐) ----
  store.ticketLogMsgs.set(botId, 'g1', 7, 'logchan', 'msg123');
  const ref = store.ticketLogMsgs.get(botId, 'g1', 7);
  assert.strictEqual(ref.message_id, 'msg123');
  store.ticketLogMsgs.set(botId, 'g1', 7, 'logchan', 'msg456'); // remplacement
  assert.strictEqual(store.ticketLogMsgs.get(botId, 'g1', 7).message_id, 'msg456');
  store.ticketLogMsgs.remove(botId, 'g1', 7);
  assert.strictEqual(store.ticketLogMsgs.get(botId, 'g1', 7), null);
  console.log('✅ référence du panneau : création, remplacement, suppression');

  // ---- 4. Les branchements sont bien en place dans panels.js ----
  assert.ok(src.includes('async function sendTicketRecap'), 'fonction récap présente');
  assert.strictEqual((src.match(/await sendTicketRecap\(botId, interaction/g) || []).length, 2, 'récap branché sur LES DEUX chemins de suppression');
  assert.ok(src.includes('updateRecapRating(botId, interaction.client'), 'note ⭐ branchée sur la notation');
  assert.ok(src.includes("open_reason: reason || ''"), 'raison d\'ouverture enregistrée à la création');
  assert.ok(src.includes('Voir la transcription complète'), 'bouton lien transcription présent');
  console.log('✅ panels.js : récap branché (2 chemins), note ⭐, raison, bouton transcription');

  // ---- 5. Le MP du créateur n'est PAS touché ----
  assert.ok(src.includes('sendTranscriptDm(interaction, guild, channel.name, t, botId)') || src.includes('sendTranscriptDm(interaction, guild, channel.name, t)'), 'MP transcription créateur intact');
  console.log('✅ transcription en MP du créateur inchangée');

  // ---- 6. Durée lisible ----
  const m = src.match(/function formatDuration[\s\S]*?\n}/);
  assert.ok(m, 'formatDuration présent');
  const formatDuration = eval('(' + m[0].replace('function formatDuration', 'function') + ')');
  const twoHoursAgo = new Date(Date.now() - 135 * 60000).toISOString();
  const out = formatDuration(twoHoursAgo);
  assert.ok(out.includes('2 h') && out.includes('15 min'), `durée lisible (${out})`);
  assert.strictEqual(formatDuration(''), '—');
  console.log('✅ durée formatée proprement (', out, ')');

  console.log('\n🎉 Tous les tests v2.3 passent');
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
