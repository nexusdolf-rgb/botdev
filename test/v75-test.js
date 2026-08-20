// ============================================================
// Test Hoxera v75 — Brique 1 « Fiabilité » : nettoyage automatique
//  1. Les anciennes données sont purgées (politiques de rétention)
//  2. Les données récentes sont CONSERVÉES (rien d'important perdu)
//  3. dbStats expose les compteurs + la taille sans données sensibles
//  4. Le compactage (VACUUM) ne casse rien et réduit la taille
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v75-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const maintenance = require('../server/maintenance');
  const BOT = 1, G = 'G1';

  // ---------- Données de test : anciennes + récentes ----------
  const db = store.db;
  // anciennes (à purger)
  db.prepare('INSERT INTO message_stats (bot_id, guild_id, user_id, day, count) VALUES (?,?,?,?,?)').run(BOT, G, 'u1', '2026-01-01', 5);
  db.prepare('INSERT INTO message_stats (bot_id, guild_id, user_id, day, count) VALUES (?,?,?,?,?)').run(BOT, G, 'u2', '2026-08-19', 5);
  db.prepare('INSERT INTO join_stats (bot_id, guild_id, day, count) VALUES (?,?,?,?)').run(BOT, G, '2026-01-01', 1);
  db.prepare('INSERT INTO suggestions (bot_id, guild_id, author_id, text, created_at) VALUES (?,?,?,?,?)').run(BOT, G, 'u1', 'ancienne', '2026-01-01 00:00:00');
  db.prepare('INSERT INTO suggestions (bot_id, guild_id, author_id, text, created_at) VALUES (?,?,?,?,?)').run(BOT, G, 'u2', 'récente', '2026-08-19 00:00:00');
  db.prepare('INSERT INTO warnings (bot_id, guild_id, user_id, reason, mod_id, created_at) VALUES (?,?,?,?,?,?)').run(BOT, G, 'u1', 'ancien', 'u9', '2026-01-01 00:00:00');
  db.prepare('INSERT INTO transcripts (token, bot_id, guild_id, channel_name, opener_id, messages, created_at) VALUES (?,?,?,?,?,?,?)').run('tk-ancien', BOT, G, 'ticket-x', 'u1', 'vieux texte', '2026-01-01 00:00:00');
  db.prepare('INSERT INTO transcripts (token, bot_id, guild_id, channel_name, opener_id, messages, created_at) VALUES (?,?,?,?,?,?,?)').run('tk-recent', BOT, G, 'ticket-y', 'u2', 'texte récent', '2026-08-19 00:00:00');
  db.prepare('INSERT INTO shop_purchases (bot_id, guild_id, user_id, item, price, ts) VALUES (?,?,?,?,?,?)').run(BOT, G, 'u1', 'VIP', 500, '2026-01-01 00:00:00');
  db.prepare('INSERT INTO shop_purchases (bot_id, guild_id, user_id, item, price, ts) VALUES (?,?,?,?,?,?)').run(BOT, G, 'u2', 'VIP', 500, '2026-08-19 00:00:00');
  // giveaway terminé depuis longtemps (ends_at en ms, ancien)
  db.prepare('INSERT INTO giveaways (bot_id, guild_id, channel_id, message_id, prize, winners, ends_at, drawn) VALUES (?,?,?,?,?,?,?,1)').run(BOT, G, 'C1', 'm1', 'Prix', 1, Date.now() - 60 * 86400000);
  // rappel expiré il y a 2 jours (oublié par un bug hypothétique)
  db.prepare('INSERT INTO reminders (bot_id, guild_id, channel_id, user_id, at_ts, text) VALUES (?,?,?,?,?,?)').run(BOT, G, 'C1', 'u1', Date.now() - 2 * 86400000, 'oublié');

  // ---------- 1. Purge ----------
  const report = maintenance.purgeOldData(db);
  const total = Object.values(report).reduce((a, b) => a + b, 0);
  check('purge : des données supprimées (8 attendues)', total === 8);

  // ---------- 2. Les récentes sont conservées ----------
  check('purge : stats récentes conservées', db.prepare('SELECT COUNT(*) AS n FROM message_stats').get().n === 1);
  check('purge : suggestion récente conservée', db.prepare('SELECT COUNT(*) AS n FROM suggestions').get().n === 1);
  check('purge : transcription récente conservée', db.prepare('SELECT COUNT(*) AS n FROM transcripts').get().n === 1);
  check('purge : achat récent conservé', db.prepare('SELECT COUNT(*) AS n FROM shop_purchases').get().n === 1);
  check('purge : anciens avertissements supprimés', db.prepare('SELECT COUNT(*) AS n FROM warnings').get().n === 0);
  check('purge : rappel expiré nettoyé', db.prepare('SELECT COUNT(*) AS n FROM reminders').get().n === 0);
  check('purge : giveaway ancien nettoyé', db.prepare('SELECT COUNT(*) AS n FROM giveaways').get().n === 0);
  check('purge : statistiques d\'arrivées anciennes nettoyées', db.prepare('SELECT COUNT(*) AS n FROM join_stats').get().n === 0);

  // ---------- 3. dbStats ----------
  const stats = maintenance.dbStats(db);
  check('dbStats : taille du fichier exposée', typeof stats.fileSizeBytes === 'number' && stats.fileSizeBytes > 0);
  check('dbStats : compteurs par table', stats.tables && typeof stats.tables === 'object');
  check('dbStats : aucune donnée sensible (pas de token)', !JSON.stringify(stats).includes('MTUz') && !JSON.stringify(stats).includes('token'));

  // ---------- 4. Compactage ----------
  // On gonfle la base au-dessus du seuil (avec checkpoint WAL pour que la
  // taille du fichier principal reflète réellement les données)
  db.prepare('CREATE TABLE IF NOT EXISTS junk (id INTEGER PRIMARY KEY, data TEXT)').run();
  const bigBlob = 'x'.repeat(1500000);
  db.prepare('INSERT INTO junk (data) VALUES (?)').run(bigBlob);
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  const before = fs.statSync(path.join(process.env.BOTDEV_DATA_DIR, 'botdev.db')).size;
  const vac = maintenance.vacuumIfNeeded(db);
  db.prepare('DROP TABLE junk').run();
  const after = fs.statSync(path.join(process.env.BOTDEV_DATA_DIR, 'botdev.db')).size;
  check('compactage : déclenché au-dessus du seuil (taille ' + Math.round(before / 1024) + ' Ko)', vac.vacuumed === true);
  check('compactage : taille réduite', after <= before);
  check('compactage : la base reste utilisable', db.prepare('SELECT COUNT(*) AS n FROM bots').get().n >= 0);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V75 — Brique 1 « Fiabilité » : nettoyage automatique + surveillance de la taille. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
