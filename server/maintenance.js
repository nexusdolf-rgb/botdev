// ============================================================
// Hoxera — Maintenance automatique (brique n°1 : nettoyage)
// Garde la base LÉGÈRE pour toujours : purge les anciennes
// données selon des politiques de rétention claires, surveille
// la taille du fichier et compacte quand nécessaire.
// Le tout protégé par la sauvegarde GitHub (jamais au-dessus
// de la limite de 1 Mo — la cause de la grande panne).
// ============================================================
const fs = require('fs');
const paths = require('./paths');

// ---------- Politiques de rétention (en jours) ----------
const RETENTION = {
  message_stats: 30,    // compteurs de messages par jour (agrégats)
  join_stats: 90,       // compteurs d'arrivées par jour
  transcripts: 30,      // le membre reçoit le .txt en MP → 30 j suffisent
  suggestions: 90,      // suggestions traitées anciennes
  shop_purchases: 90,   // historique d'achats
  warnings: 90,         // avertissements de modération
  automod_warning_messages: 7, // références de suppression 24 h (filet de secours)
  closed_tickets: 7,    // registre des salons fermés (purge de secours)
  cmd_stats: 30,        // compteurs de commandes par jour
};

function purgeOldData(db) {
  const report = {};
  try {
    // Tables avec colonne « day » (format YYYY-MM-DD)
    report.message_stats = db.prepare(`DELETE FROM message_stats WHERE day < date('now', '-${RETENTION.message_stats} days')`).run().changes;
    report.join_stats = db.prepare(`DELETE FROM join_stats WHERE day < date('now', '-${RETENTION.join_stats} days')`).run().changes;
    // Tables avec colonne « created_at »
    report.transcripts = db.prepare(`DELETE FROM transcripts WHERE created_at < datetime('now', '-${RETENTION.transcripts} days')`).run().changes;
    report.suggestions = db.prepare(`DELETE FROM suggestions WHERE created_at < datetime('now', '-${RETENTION.suggestions} days')`).run().changes;
    report.warnings = db.prepare(`DELETE FROM warnings WHERE created_at < datetime('now', '-${RETENTION.warnings} days')`).run().changes;
    report.automod_warning_messages = db.prepare(`DELETE FROM automod_warning_messages WHERE delete_at < (strftime('%s','now') * 1000) - ${RETENTION.automod_warning_messages} * 86400000`).run().changes;
    report.closed_tickets = db.prepare(`DELETE FROM closed_tickets WHERE closed_at < datetime('now', '-${RETENTION.closed_tickets} days')`).run().changes;
    // Tables avec colonne « ts »
    report.shop_purchases = db.prepare(`DELETE FROM shop_purchases WHERE ts < datetime('now', '-${RETENTION.shop_purchases} days')`).run().changes;
    // Giveaways terminés depuis longtemps (ends_at en millisecondes)
    report.giveaways = db.prepare(`DELETE FROM giveaways WHERE drawn = 1 AND ends_at < (strftime('%s','now') - 30*86400) * 1000`).run().changes;
    // Rappels expirés oubliés (sécurité : normalement retirés à l'envoi)
    report.reminders = db.prepare(`DELETE FROM reminders WHERE at_ts < (strftime('%s','now') * 1000) - 86400000`).run().changes;
    // Historique d'auto-modération (30 jours)
    report.automod_logs = db.prepare(`DELETE FROM automod_logs WHERE created_at < datetime('now', '-30 days')`).run().changes;
    // Statistiques de commandes (30 jours)
    report.cmd_stats = db.prepare(`DELETE FROM cmd_stats WHERE day < date('now', '-${RETENTION.cmd_stats} days')`).run().changes;
  } catch (e) {
    console.error('[Hoxera] Purge :', e.message);
  }
  return report;
}

// ---------- Taille et état de la base ----------
function dbStats(db) {
  const out = { fileSizeBytes: 0, fileSizeKo: 0, tables: {} };
  try {
    out.fileSizeBytes = fs.statSync(paths.dbPath).size;
    out.fileSizeKo = Math.round(out.fileSizeBytes / 1024);
  } catch {}
  const tables = ['users', 'sessions', 'bots', 'commands', 'role_menus', 'tickets', 'advanced_ticket_panels', 'advanced_ticket_channels', 'xp', 'economy', 'warnings', 'automod_member_blacklist', 'automod_warning_messages', 'suggestions', 'giveaways', 'transcripts', 'message_stats', 'join_stats', 'shop_purchases', 'reminders', 'marriages', 'birthdays', 'temp_roles', 'scheduled_messages', 'cmd_stats', 'open_tickets', 'ticket_ratings'];
  try {
    for (const t of tables) {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      if (n > 0) out.tables[t] = n;
    }
  } catch {}
  return out;
}

// ---------- Compactage (VACUUM) si nécessaire ----------
const VACUUM_THRESHOLD = 700 * 1024; // 700 Ko : on compacte AVANT d'approcher la limite

function vacuumIfNeeded(db) {
  try {
    const size = fs.statSync(paths.dbPath).size;
    if (size < VACUUM_THRESHOLD) return { vacuumed: false, sizeBefore: size };
    db.exec('VACUUM');
    const after = fs.statSync(paths.dbPath).size;
    console.log(`[Hoxera] 🧹 Compactage : ${Math.round(size / 1024)} Ko → ${Math.round(after / 1024)} Ko`);
    return { vacuumed: true, sizeBefore: size, sizeAfter: after };
  } catch (e) {
    console.error('[Hoxera] Compactage :', e.message);
    return { vacuumed: false, error: e.message };
  }
}

// ---------- Cycle complet ----------
function runDaily(db) {
  const purged = purgeOldData(db);
  const vacuum = vacuumIfNeeded(db);
  const total = Object.values(purged).reduce((a, b) => a + b, 0);
  if (total > 0) console.log(`[Hoxera] 🧹 Nettoyage : ${total} ancienne(s) donnée(s) purgée(s)`, JSON.stringify(purged));
  return { purged, vacuum };
}

module.exports = { purgeOldData, dbStats, vacuumIfNeeded, runDaily, RETENTION };
