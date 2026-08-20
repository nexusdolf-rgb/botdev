// ============================================================
// Test Hoxera v80 — Dashboard ↔ bot enfin synchronisés (fuseaux)
//  1. tz.parts : heure locale exacte (été UTC+2, hiver UTC+1, jour)
//  2. zonedInstant : conversion « heure locale → instant UTC » exacte
//  3. guild_settings.timezone : valide conservé, invalide → Europe/Paris
//  4. sweepScheduled : envoi à l'HEURE LOCALE du serveur Discord
//  5. sweepScheduled : pas de doublon, pas d'envoi en avance
//  6. sweepScheduled : rattrapage si le balayage est retardé (≤ 10 min)
//  7. sweepScheduled : fenêtre ratée > 10 min → sautée (pas de spam tardif)
//  8. sweepScheduled : jour de la semaine calculé en heure locale
//  9. sweepScheduled : fuseau par serveur (New York) respecté
// 10. sweepScheduled : @everyone interdit → renvoi sans mentions
// 11. sweepScheduled : échec persistant → PAS marquée « envoyée » (réessai)
// 12. sweepBirthdays : anniversaire fêté le bon jour en heure locale
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v80-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const store = require('../server/db');
  const tz = require('../server/tz');
  const extra = require('../server/discord/extra');
  const BOT = 1, G = 'G1';

  // ---------- 1 & 2. Utilitaires de fuseau ----------
  const summer = tz.parts(new Date('2026-08-20T05:00:00Z'), 'Europe/Paris');
  check('tz : été UTC+2 (05:00Z → 07:00 Paris)', summer.hour === 7 && summer.minute === 0 && summer.ymd === '2026-08-20');
  check('tz : jour de semaine local (jeudi = 4)', summer.dow === 4);
  const winter = tz.parts(new Date('2026-01-15T23:30:00Z'), 'Europe/Paris');
  check('tz : hiver UTC+1 (23:30Z → 00:30 le 16)', winter.hour === 0 && winter.minute === 30 && winter.ymd === '2026-01-16');
  check('tz : vendredi = 5', winter.dow === 5);
  check('tz : fuseau invalide → Europe/Paris', tz.safeTz('Nimporte/Quoi') === 'Europe/Paris');
  check('tz : fuseau valide conservé', tz.safeTz('America/New_York') === 'America/New_York');
  check('zonedInstant : 7h Paris été = 05:00Z', tz.zonedInstant('2026-08-20', 7, 0, 'Europe/Paris') === Date.parse('2026-08-20T05:00:00Z'));
  check('zonedInstant : 0h30 Paris hiver = 23:30Z veille', tz.zonedInstant('2026-01-16', 0, 30, 'Europe/Paris') === Date.parse('2026-01-15T23:30:00Z'));

  // ---------- 3. guild_settings.timezone ----------
  store.guildSettings.set(BOT, G, { timezone: 'America/New_York' });
  check('settings : fuseau valide conservé', store.guildSettings.get(BOT, G).timezone === 'America/New_York');
  store.guildSettings.set(BOT, G, { timezone: 'Nimporte/Quoi' });
  check('settings : fuseau invalide → Europe/Paris', store.guildSettings.get(BOT, G).timezone === 'Europe/Paris');
  store.guildSettings.set(BOT, G, { timezone: 'Europe/Paris' });

  // ---------- 4 → 9. sweepScheduled ----------
  let sent = [];
  const channel = { send: async (payload) => { sent.push(payload); return { id: 'm1' }; } };
  const guild = { channels: { cache: { get: (id) => (id === 'C1' ? channel : null) } } };
  const entry = { client: { guilds: { cache: { get: (id) => (id === G ? guild : null) } } } };

  const aid = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 7, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: 'Bonjour !' });
  extra.sweepScheduled(BOT, entry, new Date('2026-08-20T05:00:00Z')); // 7h Paris
  await sleep(60);
  check('annonce : envoyée à 7h PARIS (05:00 UTC)', sent.length === 1 && sent[0].content === 'Bonjour !');
  check('annonce : last_sent = date locale', store.scheduled.get(aid).last_sent === '2026-08-20');
  check('annonce : mentions activées par défaut', Array.isArray(sent[0].allowedMentions.parse) && sent[0].allowedMentions.parse.includes('everyone'));

  extra.sweepScheduled(BOT, entry, new Date('2026-08-20T05:00:30Z'));
  await sleep(60);
  check('annonce : pas de doublon le même jour', sent.length === 1);

  const aid2 = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 8, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: 'Huit heures' });
  extra.sweepScheduled(BOT, entry, new Date('2026-08-20T05:30:00Z')); // 7h30 Paris → trop tôt
  await sleep(60);
  check('annonce : pas envoyée avant l\'heure', sent.length === 1 && !store.scheduled.get(aid2).last_sent);

  extra.sweepScheduled(BOT, entry, new Date('2026-08-20T06:03:00Z')); // 8h03 Paris → balayage retardé
  await sleep(60);
  check('annonce : fenêtre ratée de 3 min → rattrapée', sent.length === 2 && store.scheduled.get(aid2).last_sent === '2026-08-20');

  const aid3 = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 9, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: 'Neuf heures' });
  extra.sweepScheduled(BOT, entry, new Date('2026-08-20T07:20:00Z')); // 9h20 Paris → trop tard
  await sleep(60);
  check('annonce : fenêtre ratée de 20 min → sautée', sent.length === 2 && !store.scheduled.get(aid3).last_sent);

  const aid4 = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 0, minute: 30, days: [1], text: 'Lundi matin' });
  extra.sweepScheduled(BOT, entry, new Date('2026-08-23T22:30:00Z')); // lundi 24 août, 0h30 Paris
  await sleep(60);
  check('annonce : jour calculé en heure locale (lundi 0h30 Paris)', store.scheduled.get(aid4).last_sent === '2026-08-24');
  check('annonce : le lundi à 0h30 Paris est bien envoyé', sent.length === 3);

  store.guildSettings.set(BOT, G, { timezone: 'America/New_York' });
  const aid5 = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 7, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: 'NY' });
  extra.sweepScheduled(BOT, entry, new Date('2026-08-20T11:00:00Z')); // 7h à New York (UTC-4)
  await sleep(60);
  check('annonce : fuseau New York respecté (11:00Z = 7h NY)', store.scheduled.get(aid5).last_sent === '2026-08-20' && sent.length === 4);
  store.guildSettings.set(BOT, G, { timezone: 'Europe/Paris' });

  // ---------- 10. @everyone interdit → renvoi sans mentions ----------
  const channelErr = {
    send: async (payload) => {
      if (payload.allowedMentions && payload.allowedMentions.parse && payload.allowedMentions.parse.includes('everyone')) {
        const e = new Error('Missing Permissions'); e.code = 50013; throw e;
      }
      sent.push(payload); return { id: 'm2' };
    },
  };
  const entryErr = { client: { guilds: { cache: { get: () => ({ channels: { cache: { get: () => channelErr } } }) } } } };
  const aid6 = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 10, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: '@everyone bonjour' });
  extra.sweepScheduled(BOT, entryErr, new Date('2026-08-20T08:00:00Z')); // 10h Paris
  await sleep(100);
  check('annonce : @everyone interdit → renvoyée sans mentions', store.scheduled.get(aid6).last_sent === '2026-08-20' && sent.length === 5);
  check('annonce : le renvoi désactive bien les mentions', sent[4].allowedMentions.parse.length === 0);

  // ---------- 11. Échec persistant → PAS marquée envoyée ----------
  const channelFail = { send: async () => { const e = new Error('Missing Access'); e.code = 50001; throw e; } };
  const entryFail = { client: { guilds: { cache: { get: () => ({ channels: { cache: { get: () => channelFail } } }) } } } };
  const aid7 = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 11, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: 'Échec' });
  extra.sweepScheduled(BOT, entryFail, new Date('2026-08-20T09:00:00Z')); // 11h Paris
  await sleep(100);
  check('annonce : échec persistant → pas marquée « envoyée » (réessai possible)', !store.scheduled.get(aid7).last_sent);

  // ---------- 12. Anniversaires en heure locale ----------
  const bdayMsgs = [];
  const rolesCache = new Map();
  const makeMember = (uid) => ({
    id: uid,
    toString: () => `<@${uid}>`,
    roles: { cache: { has: () => false }, add: async () => {}, remove: async () => {} },
  });
  const bdayGuild = {
    id: 'G1',
    roles: { cache: { get: (id) => rolesCache.get(id), find: (fn) => [...rolesCache.values()].find(fn) || null } },
    members: {
      me: { roles: { highest: { position: 10 } } },
      fetch: async (uid) => (uid === 'u1' || uid === 'u2' ? makeMember(uid) : null),
    },
    channels: { cache: { get: (id) => (id === 'BC1' ? { send: async (p) => { bdayMsgs.push(p); return {}; } } : null), find: () => null } },
  };
  const bdayEntry = { client: { guilds: { cache: { get: (id) => (id === G ? bdayGuild : null), values: () => [bdayGuild] } } } };
  store.guildSettings.set(BOT, G, { birthday_channel: 'BC1', birthday_role: 'R1', timezone: 'Europe/Paris' });
  rolesCache.set('R1', { id: 'R1', name: 'Anniv', position: 5 });
  store.birthdays.set(BOT, G, 'u1', 20, 8);
  store.birthdays.set(BOT, G, 'u2', 21, 8);

  await extra.sweepBirthdays(BOT, bdayEntry, new Date('2026-08-20T05:00:00Z')); // 7h Paris le 20 août
  check('anniversaire : u1 fêté le 20 août (heure Paris)', bdayMsgs.length === 1 && bdayMsgs[0].content.includes('<@u1>'));

  store.settings.set('bday_done_1', ''); // simule un nouveau jour
  await extra.sweepBirthdays(BOT, bdayEntry, new Date('2026-08-20T22:30:00Z')); // 0h30 Paris le 21 août
  check('anniversaire : à 0h30 Paris le 21, seul u2 est fêté', bdayMsgs.length === 2 && bdayMsgs[1].content.includes('<@u2>') && !bdayMsgs[1].content.includes('<@u1>'));

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v80 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Erreur fatale du test :', e); process.exit(1); });
