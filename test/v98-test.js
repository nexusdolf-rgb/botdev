// Test v1.98 — Communauté PRO : paliers de sanctions, starboard,
// traqueur d'invitations, carte de bienvenue.
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v98test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const community = require('../server/discord/community');
const store = require('../server/db');

(async () => {
  // ---- 1. ⚖️ Paliers de sanctions (pure) ----
  const gs = { warn_timeout_limit: 3, warn_timeout_min: 45, warn_limit: 5, warn_action: 'kick' };
  assert.strictEqual(community.sanctionForWarns(1, gs), null);
  assert.strictEqual(community.sanctionForWarns(2, gs), null);
  console.log('✅ 1-2 avertissements : aucune sanction');
  assert.deepStrictEqual(community.sanctionForWarns(3, gs), { action: 'timeout', minutes: 45 });
  assert.deepStrictEqual(community.sanctionForWarns(4, gs), { action: 'timeout', minutes: 45 });
  console.log('✅ 3-4 avertissements : timeout 45 min (palier 1)');
  assert.deepStrictEqual(community.sanctionForWarns(5, gs), { action: 'kick', minutes: 0 });
  assert.deepStrictEqual(community.sanctionForWarns(9, gs), { action: 'kick', minutes: 0 });
  console.log('✅ 5+ avertissements : expulsion (palier 2 prime)');
  assert.strictEqual(community.sanctionForWarns(10, { warn_limit: 0, warn_timeout_limit: 0 }), null);
  console.log('✅ paliers désactivés : jamais de sanction');
  assert.deepStrictEqual(community.sanctionForWarns(5, { warn_limit: 5, warn_action: 'timeout', warn_timeout_min: 30 }), { action: 'timeout', minutes: 30 });
  console.log('✅ palier 2 en mode timeout : supporté');

  // ---- 2. ⭐ Starboard (pure) ----
  assert.strictEqual(community.starboardDecision(2, 3, false), 'none');
  assert.strictEqual(community.starboardDecision(3, 3, false), 'post');
  assert.strictEqual(community.starboardDecision(7, 3, true), 'update');
  assert.strictEqual(community.starboardDecision(1, 3, true), 'update'); // maj du compteur même sous le seuil
  console.log('✅ starboard : sous le seuil → rien, au seuil → publication, déjà publié → mise à jour');

  // ---- 3. 📨 Détection d'invitation utilisée (pure) ----
  const before = [{ code: 'abc', uses: 3, inviter_id: 'u1' }, { code: 'xyz', uses: 0, inviter_id: 'u2' }];
  const after1 = [{ code: 'abc', uses: 4, inviter_id: 'u1' }, { code: 'xyz', uses: 0, inviter_id: 'u2' }];
  assert.strictEqual(community.detectInviteUsed(before, after1).inviter_id, 'u1');
  console.log('✅ invitation existante utilisée → bon recruteur détecté');
  const after2 = [...before, { code: 'new1', uses: 1, inviter_id: 'u3' }];
  assert.strictEqual(community.detectInviteUsed(before, after2).inviter_id, 'u3');
  console.log('✅ invitation créée + utilisée entre 2 relevés → détectée');
  assert.strictEqual(community.detectInviteUsed(before, before), null);
  console.log('✅ aucune utilisation → null');

  // ---- 4. 📨 Stockage des invitations ----
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  store.inviteUses.replaceAll(botId, 'g1', [{ code: 'abc', uses: 2, inviter_id: 'u1' }]);
  assert.strictEqual(store.inviteUses.all(botId, 'g1').length, 1);
  store.inviteJoins.add(botId, 'g1', 'membre1', 'u1', 'abc');
  store.inviteJoins.add(botId, 'g1', 'membre2', 'u1', 'abc');
  store.inviteJoins.add(botId, 'g1', 'membre3', 'u9', 'zzz');
  assert.strictEqual(store.inviteJoins.countBy(botId, 'g1', 'u1'), 2);
  const top = store.inviteJoins.top(botId, 'g1');
  assert.strictEqual(top[0].inviter_id, 'u1');
  assert.strictEqual(top[0].n, 2);
  assert.strictEqual(store.inviteJoins.whoInvited(botId, 'g1', 'membre3').inviter_id, 'u9');
  console.log('✅ base invitations : compteur, top, « invité par » corrects');

  // ---- 5. ⭐ Stockage starboard ----
  store.starboard.set(botId, 'g1', 'msg1', 'star1', 4);
  assert.strictEqual(store.starboard.get(botId, 'g1', 'msg1').stars, 4);
  store.starboard.set(botId, 'g1', 'msg1', 'star1', 7); // maj
  assert.strictEqual(store.starboard.get(botId, 'g1', 'msg1').stars, 7);
  assert.strictEqual(store.starboard.count(botId, 'g1'), 1);
  store.starboard.remove(botId, 'g1', 'msg1');
  assert.strictEqual(store.starboard.get(botId, 'g1', 'msg1'), null);
  console.log('✅ base starboard : création, mise à jour, suppression');

  // ---- 6. 🖼️ Carte de bienvenue (SVG + rendu sharp réel) ----
  const svg = community.welcomeCardSvg('Dolf<script>', 'Support & Co', 145);
  assert.ok(svg.includes('Dolf&lt;script&gt;'), 'pseudo échappé (anti-injection)');
  assert.ok(svg.includes('Support &amp; Co'), 'nom du serveur échappé');
  assert.ok(svg.includes('membre n°145'), 'compteur de membres affiché');
  console.log('✅ carte SVG : contenu correct + caractères spéciaux neutralisés');
  const sharp = require('sharp');
  const png = await sharp(Buffer.from(community.welcomeCardSvg('Testeur', 'Serveur', 1))).png().toBuffer();
  assert.ok(png.length > 5000, 'PNG généré non vide');
  assert.strictEqual(png[0], 0x89, 'signature PNG');
  console.log('✅ carte rendue en vrai PNG par sharp (', Math.round(png.length / 1024), 'Ko )');

  // ---- 7. Réglages serveur : nouvelles colonnes persistées ----
  store.guildSettings.set(botId, 'g1', { warn_timeout_limit: 3, warn_timeout_min: 45, warn_limit: 5, warn_action: 'kick', starboard_channel: '#hall-of-fame', starboard_min: 4 });
  const s = store.guildSettings.get(botId, 'g1');
  assert.strictEqual(s.warn_timeout_limit, 3);
  assert.strictEqual(s.warn_timeout_min, 45);
  assert.strictEqual(s.starboard_channel, '#hall-of-fame');
  assert.strictEqual(s.starboard_min, 4);
  assert.strictEqual(s.warn_action, 'kick');
  console.log('✅ réglages : nouveaux champs enregistrés et relus');

  console.log('\n🎉 Tous les tests v98 passent');
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
