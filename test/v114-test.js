// Test v3.8 — sessions live fiables : reprise, anti-doublon et diagnostic
const assert = require('assert');
// v236 — lecteur de payload Components V2
const v2 = require('./helpers/v2');
const fs = require('fs');
const dir = '/tmp/v38test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const live = require('../server/discord/liveWatch');

(async () => {
  // 1. TikTok : le statut 2 est actif ; le statut 4 seul peut être une
  // ancienne liveRoom conservée par l'endpoint et doit rester hors ligne.
  const active = live.parseTikTokResponse({ data: {
    user: { status: 2, nickname: 'Streamer', roomId: 'room-a', avatarThumb: 'avatar' },
    liveRoom: { status: 2, startTime: 12345 },
  } }, 'streamer');
  assert.strictEqual(active.live, true);
  assert.ok(active.liveKey.includes('room:room-a') && active.liveKey.includes('start:12345'));
  const stale = live.parseTikTokResponse({ data: {
    user: { status: 4, nickname: 'Streamer', roomId: 'old-room' },
    liveRoom: { status: 4, startTime: 12345 },
  } }, 'streamer');
  assert.strictEqual(stale.live, false);
  assert.strictEqual(stale.liveKey, '');
  console.log('✅ TikTok : statut actif reconnu, ancienne liveRoom hors ligne ignorée');

  // 2. La date ne bloque plus un vrai redémarrage ; la clé de session
  // distingue deux rooms différentes même sans attendre 30 minutes.
  const first = live.liveTransition(
    { last_status: 'off', last_announce_ts: Date.now() - 10 * 60000 },
    { live: true, liveKey: 'room:a' },
    1000,
  );
  assert.strictEqual(first.action, 'announce');
  const steady = live.liveTransition(
    { last_status: 'live', live_key: 'room:a', last_announce_ts: 1000, offline_streak: 0 },
    { live: true, liveKey: 'room:a' },
    2000,
  );
  assert.strictEqual(steady.action, 'none');
  const restarted = live.liveTransition(
    { last_status: 'live', live_key: 'room:a', last_announce_ts: 1000, offline_streak: 1 },
    { live: true, liveKey: 'room:b' },
    3000,
  );
  assert.strictEqual(restarted.action, 'announce');
  assert.strictEqual(restarted.liveKey, 'room:b');
  console.log('✅ une annonce par session : même room sans doublon, nouvelle room annoncée immédiatement');

  // 3. Une seule réponse hors ligne ne coupe pas la session ; deux réponses
  // confirment la fin, sans effacer la date d'audit.
  const oneOff = live.liveTransition(
    { last_status: 'live', live_key: 'room:a', last_announce_ts: 1000, offline_streak: 0 },
    { live: false },
    4000,
  );
  assert.strictEqual(oneOff.status, 'live');
  assert.strictEqual(oneOff.offlineStreak, 1);
  const confirmedOff = live.liveTransition(
    { last_status: 'live', live_key: 'room:a', last_announce_ts: 1000, offline_streak: 1 },
    { live: false },
    5000,
  );
  assert.strictEqual(confirmedOff.status, 'off');
  assert.strictEqual(confirmedOff.announceTs, 1000);
  console.log('✅ faux hors ligne absorbé : sortie confirmée après deux contrôles');

  // 4. Migration + balayage réel simulé : le message part dans le salon
  // dédié une fois par room, puis repart après une vraie sortie.
  const cols = store.db.prepare('PRAGMA table_info(live_socials)').all().map((c) => c.name);
  for (const col of ['live_key', 'offline_streak', 'last_checked_at', 'last_error']) assert.ok(cols.includes(col), `colonne ${col}`);
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const guildId = 'g-live';
  store.guildSettings.set(botId, guildId, { live_channel: '#『🎥』annonces-live', live_ping: 'none' });
  store.liveSocials.add(botId, guildId, '', 'tiktok', 'streamer');
  const sent = [];
  const channel = {
    id: 'channel-live',
    name: '『🎥』annonces-live',
    type: 0,
    isTextBased: () => true,
    send: async (payload) => { sent.push(payload); return { id: String(sent.length) }; },
  };
  const guild = {
    id: guildId,
    name: 'Serveur test',
    channels: { cache: new Map([[channel.id, channel]]) },
  };
  const botManager = {
    clients: new Map([[botId, {
      client: {
        isReady: () => true,
        guilds: { cache: new Map([[guildId, guild]]) },
      },
    }]]),
  };
  const originalChecker = live.CHECKERS.tiktok;
  const observations = [
    { live: true, name: 'Streamer', avatar: '', liveKey: 'room:a' },
    { live: true, name: 'Streamer', avatar: '', liveKey: 'room:a' },
    { live: false, name: 'Streamer', avatar: '', liveKey: '' },
    { live: true, name: 'Streamer', avatar: '', liveKey: 'room:b' },
  ];
  live.CHECKERS.tiktok = async () => observations.shift();
  try {
    await live.sweep(botManager);
    await live.sweep(botManager);
    await live.sweep(botManager);
    await live.sweep(botManager);
  } finally {
    live.CHECKERS.tiktok = originalChecker;
  }
  assert.strictEqual(sent.length, 2, 'room:a puis room:b doivent produire deux annonces');
  // v236 — l'annonce de live est en Components V2 : plus d'embed, le conteneur
  // reste le seul composant racine (et la ligne de boutons est DEDANS).
  assert.ok(v2.isV2(sent[0]), 'l\'annonce de live doit être en Components V2');
  assert.strictEqual(sent[0].components.length, 1);
  // v241 — le titre portait « 🔴 LIVE sur TikTok » et le corps répétait
  // « vient de lancer un live sur **TikTok** ». Tout est regroupé dans le
  // titre, qui nomme aussi le streamer : le corps ne fait plus qu'inviter.
  assert.ok(v2.title(sent[0]).includes('en live sur'), 'titre de l\'annonce : ' + JSON.stringify(v2.title(sent[0])));
  assert.ok(v2.dividers(sent[0]) >= 2, 'séparateurs natifs entre les paragraphes');
  assert.strictEqual(v2.rows(sent[0]).length, 1, 'la ligne de boutons est DANS le conteneur');
  const row = store.liveSocials.all(botId, guildId)[0];
  assert.strictEqual(row.last_status, 'live');
  assert.strictEqual(row.live_key, 'room:b');
  assert.strictEqual(row.offline_streak, 0);
  assert.ok(row.last_checked_at > 0);
  assert.strictEqual(row.last_error, '');
  console.log('✅ balayage : salon dédié utilisé, deux sessions distinctes annoncées, aucun doublon');

  console.log('\n🎉 Tous les tests v3.8 passent');
})().catch((e) => { console.error('❌', e.stack || e.message); process.exit(1); });
