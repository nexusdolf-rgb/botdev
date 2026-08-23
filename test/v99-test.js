// Test v2.1 — 🔴 Annonces de live + 🏷️ auto-rôle multiple
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v21test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const live = require('../server/discord/liveWatch');
const { parseRoleList } = require('../server/discord/events');
const store = require('../server/db');

(async () => {
  // ---- 1. 🧭 Extraction du pseudo depuis un lien ----
  assert.deepStrictEqual(live.parseSocial('https://www.tiktok.com/@mon.pseudo_officiel'), { platform: 'tiktok', handle: 'mon.pseudo_officiel' });
  assert.deepStrictEqual(live.parseSocial('https://www.tiktok.com/@dolf/live?lang=fr'), { platform: 'tiktok', handle: 'dolf' });
  assert.deepStrictEqual(live.parseSocial('https://twitch.tv/GrandStreamer'), { platform: 'twitch', handle: 'grandstreamer' });
  assert.deepStrictEqual(live.parseSocial('https://www.youtube.com/@MaChaine'), { platform: 'youtube', handle: 'machaine' });
  assert.deepStrictEqual(live.parseSocial('https://kick.com/joueur'), { platform: 'kick', handle: 'joueur' });
  console.log('✅ liens complets reconnus (TikTok, Twitch, YouTube, Kick)');
  assert.deepStrictEqual(live.parseSocial('@pseudo', 'tiktok'), { platform: 'tiktok', handle: 'pseudo' });
  assert.deepStrictEqual(live.parseSocial('pseudo', 'twitch'), { platform: 'twitch', handle: 'pseudo' });
  assert.strictEqual(live.parseSocial('pseudo', 'inconnu'), null);
  assert.strictEqual(live.parseSocial(''), null);
  console.log('✅ @pseudo + plateforme reconnus, entrées invalides refusées');

  // ---- 2. 📣 Décision d'annonce ----
  const now = Date.now();
  assert.strictEqual(live.liveDecision('off', true, 0, now), 'announce');
  console.log('✅ hors ligne → EN LIGNE : annonce');
  assert.strictEqual(live.liveDecision('live', true, now - 3600000, now), 'none');
  console.log('✅ toujours en live : pas de doublon');
  assert.strictEqual(live.liveDecision('off', false, 0, now), 'none');
  console.log('✅ hors ligne : aucune annonce');
  assert.strictEqual(live.liveDecision('off', true, now - 10 * 60000, now), 'none');
  console.log('✅ anti-doublon 30 min (redémarrage/faux positif) respecté');
  assert.strictEqual(live.liveDecision('off', true, now - 45 * 60000, now), 'announce');
  console.log('✅ nouveau live après 45 min : annoncé');

  // ---- 3. 💾 Base : comptes suivis ----
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  store.liveSocials.add(botId, 'g1', 'membre1', 'tiktok', 'dolf');
  store.liveSocials.add(botId, 'g1', '', 'twitch', 'streamer2');
  store.liveSocials.add(botId, 'g1', 'membre1', 'tiktok', 'dolf'); // doublon → mise à jour, pas d'ajout
  const all = store.liveSocials.all(botId, 'g1');
  assert.strictEqual(all.length, 2, 'pas de doublon');
  store.liveSocials.setStatus(botId, 'g1', all[0].id, 'live', now);
  assert.strictEqual(store.liveSocials.all(botId, 'g1')[0].last_status, 'live');
  store.liveSocials.remove(botId, 'g1', all[1].id);
  assert.strictEqual(store.liveSocials.count(botId, 'g1'), 1);
  console.log('✅ base : ajout sans doublon, statut, suppression');

  // ---- 4. ⚙️ Réglages live persistés ----
  store.guildSettings.set(botId, 'g1', { live_channel: '#annonces-live', live_ping: 'here' });
  const gs = store.guildSettings.get(botId, 'g1');
  assert.strictEqual(gs.live_channel, '#annonces-live');
  assert.strictEqual(gs.live_ping, 'here');
  store.guildSettings.set(botId, 'g1', { live_ping: 'nimporte' });
  assert.strictEqual(store.guildSettings.get(botId, 'g1').live_ping, 'everyone', 'valeur invalide → défaut');
  console.log('✅ réglages : salon + mention persistés, valeurs invalides neutralisées');

  // ---- 5. 🏷️ Auto-rôle multiple ----
  assert.deepStrictEqual(parseRoleList({ roles: 'Membre, Nouveau, VIP' }), ['Membre', 'Nouveau', 'VIP']);
  assert.deepStrictEqual(parseRoleList({ roles: 'Membre,, ,Membre' }), ['Membre'], 'doublons et vides ignorés');
  assert.deepStrictEqual(parseRoleList({ role: 'Ancien' }), ['Ancien'], 'ancien réglage toujours accepté');
  assert.deepStrictEqual(parseRoleList({ roles: 'A, B', role: 'C' }), ['A', 'B', 'C'], 'liste + ancien réglage combinés');
  assert.deepStrictEqual(parseRoleList({ roles: 'A', role: 'a' }), ['A'], 'doublon insensible à la casse');
  assert.deepStrictEqual(parseRoleList({}), []);
  console.log('✅ auto-rôle multiple : liste, doublons, compatibilité ancien réglage');

  console.log('\n🎉 Tous les tests v2.1 passent');
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
