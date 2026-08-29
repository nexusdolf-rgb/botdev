// ============================================================
// BotDev - Base de données (SQLite via better-sqlite3)
// ============================================================
const Database = require('better-sqlite3');
const crypto = require('crypto');
const paths = require('./paths');
const tzUtil = require('./tz');

const db = new Database(paths.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  discord_id TEXT DEFAULT '',
  discord_username TEXT DEFAULT '',
  discord_avatar TEXT DEFAULT '',
  discord_guilds TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contrôle d'accès à la plateforme Nexora (indépendant des permissions Discord).
-- Un bannissement conserve les données afin qu'un débannissement soit possible.
CREATE TABLE IF NOT EXISTS platform_bans (
  user_id INTEGER PRIMARY KEY,
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER DEFAULT 0
);

-- Journal minimal des actions sensibles de l'administration Nexora.
-- Aucun token, mot de passe ou contenu OAuth n'est enregistré ici.
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER NOT NULL,
  target_user_id INTEGER DEFAULT 0,
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_log (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discord_tokens (
  user_id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  client_id TEXT DEFAULT '',
  prefix TEXT DEFAULT '!',
  status_text TEXT DEFAULT 'BotDev',
  status_type TEXT DEFAULT 'online',
  avatar_url TEXT DEFAULT '',
  bot_username TEXT DEFAULT '',
  enabled INTEGER DEFAULT 0,
  last_error TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trigger_type TEXT DEFAULT 'prefix', -- prefix | slash | keyword | button
  trigger_value TEXT DEFAULT '',
  options TEXT DEFAULT '[]',          -- JSON: [{name,description,type,required}]
  blocks TEXT DEFAULT '[]',           -- JSON: [{type, params, children...}]
  cooldown INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modules (
  bot_id INTEGER NOT NULL,
  module_key TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  PRIMARY KEY (bot_id, module_key)
);

CREATE TABLE IF NOT EXISTS events (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  event_type TEXT NOT NULL,           -- member_join | member_leave | autorole
  enabled INTEGER DEFAULT 0,
  config TEXT DEFAULT '{}',
  PRIMARY KEY (bot_id, guild_id, event_type)
);

CREATE TABLE IF NOT EXISTS guild_settings (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  prefix TEXT DEFAULT '',
  warn_limit INTEGER DEFAULT 0,
  warn_action TEXT DEFAULT 'none',
  PRIMARY KEY (bot_id, guild_id)
);

CREATE TABLE IF NOT EXISTS xp (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 0,
  last_ts INTEGER DEFAULT 0,
  PRIMARY KEY (bot_id, guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS xp_roles (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (bot_id, guild_id, level)
);

CREATE TABLE IF NOT EXISTS economy (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  coins INTEGER DEFAULT 0,
  last_daily TEXT DEFAULT '',
  PRIMARY KEY (bot_id, guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  mod_id TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL DEFAULT '',
  name TEXT DEFAULT '',
  content TEXT DEFAULT '',
  placeholder TEXT DEFAULT 'Choisis tes rôles…',
  channel TEXT DEFAULT '',
  options TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS tickets (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  channel TEXT DEFAULT '',
  message TEXT DEFAULT '🎫 Besoin d''aide ? Clique sur le bouton pour ouvrir un ticket !',
  button_label TEXT DEFAULT '🎫 Ouvrir un ticket',
  button_style TEXT DEFAULT '1',
  support_role TEXT DEFAULT '',
  category TEXT DEFAULT 'Tickets',
  types TEXT DEFAULT '[]',
  require_reason INTEGER DEFAULT 1,
  PRIMARY KEY (bot_id, guild_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bot_profiles (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  color TEXT DEFAULT '#5865F2',
  PRIMARY KEY (bot_id, guild_id)
);

CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER DEFAULT 100,
  role TEXT DEFAULT '',
  emoji TEXT DEFAULT '🛒'
);

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  prize TEXT DEFAULT '',
  winners INTEGER DEFAULT 1,
  ends_at INTEGER NOT NULL,
  drawn INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  author_id TEXT DEFAULT '',
  text TEXT DEFAULT '',
  message_id TEXT DEFAULT '',
  channel_id TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  voters TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS temp_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sanctions (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  action TEXT DEFAULT 'warn',
  duration INTEGER DEFAULT 0,
  message TEXT DEFAULT '',
  PRIMARY KEY (bot_id, guild_id, name)
);

CREATE TABLE IF NOT EXISTS blacklist_words (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  word TEXT NOT NULL,
  PRIMARY KEY (bot_id, guild_id, word)
);

-- Historique des actions d'auto-modération (visible dans le dashboard)
CREATE TABLE IF NOT EXISTS automod_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT DEFAULT '',
  user_tag TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  content TEXT DEFAULT '',
  channel_id TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_automod_logs_guild ON automod_logs (bot_id, guild_id, id DESC);

-- Blacklist des membres par serveur : l'historique détaillé reste dans
-- automod_logs, cette table conserve l'état courant et le panneau Discord.
-- Un membre ne possède qu'une entrée active par serveur ; le retrait ne
-- supprime jamais l'historique du journal.
CREATE TABLE IF NOT EXISTS automod_member_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_tag TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  rule TEXT DEFAULT '',
  action TEXT DEFAULT '',
  source_channel_id TEXT DEFAULT '',
  source_message_id TEXT DEFAULT '',
  panel_channel_id TEXT DEFAULT '',
  panel_message_id TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT DEFAULT 'immediate',
  trigger_count INTEGER NOT NULL DEFAULT 1,
  threshold INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at TEXT DEFAULT '',
  removed_by TEXT DEFAULT '',
  UNIQUE (bot_id, guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_automod_member_blacklist_guild
  ON automod_member_blacklist (bot_id, guild_id, active, created_at DESC);

-- Compteurs persistants des sanctions Auto-Mod. Ils sont indexés par
-- comportement et sanction : un spam/timeout ne se mélange jamais avec un
-- lien/ban. Ils sont remis à zéro quand une blacklist est déclenchée.
CREATE TABLE IF NOT EXISTS automod_blacklist_counters (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rule TEXT NOT NULL,
  action TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (bot_id, guild_id, user_id, rule, action)
);
CREATE INDEX IF NOT EXISTS idx_automod_blacklist_counters_user
  ON automod_blacklist_counters (bot_id, guild_id, user_id, updated_at DESC);

-- Correspondance entre les règles natives Discord et les clés Nexora.
-- Seules les règles créées par Nexora sont suivies et modifiées.
CREATE TABLE IF NOT EXISTS native_automod_rules (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  discord_rule_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (bot_id, guild_id, rule_key)
);
CREATE INDEX IF NOT EXISTS idx_native_automod_rules_guild
  ON native_automod_rules (bot_id, guild_id, discord_rule_id);

-- Tickets ouverts (fiche par salon de ticket) : numéro, prise en charge,
-- horodatages, dernière activité (fermeture automatique), note du support.
CREATE TABLE IF NOT EXISTS open_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT UNIQUE NOT NULL,
  number INTEGER NOT NULL,
  opener_id TEXT DEFAULT '',
  opener_tag TEXT DEFAULT '',
  type_label TEXT DEFAULT '',
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_by TEXT DEFAULT '',
  claimed_tag TEXT DEFAULT '',
  claimed_at TEXT DEFAULT '',
  closed_at TEXT DEFAULT '',
  last_activity TEXT DEFAULT '',
  warned_inactive INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_open_tickets_guild ON open_tickets (bot_id, guild_id);

-- Numérotation des tickets par serveur (#1, #2, #3…)
CREATE TABLE IF NOT EXISTS ticket_counters (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  next INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bot_id, guild_id)
);

-- Notes du support (1 à 5 étoiles) données par les membres à la fermeture
CREATE TABLE IF NOT EXISTS ticket_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  opener_id TEXT DEFAULT '',
  rating INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS closed_tickets (
  channel_id TEXT PRIMARY KEY,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  closed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcripts (
  token TEXT PRIMARY KEY,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_name TEXT DEFAULT '',
  opener_id TEXT DEFAULT '',
  type_label TEXT DEFAULT '',
  server_name TEXT DEFAULT '',
  messages TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Hoxera 2.0 : fun & communauté
CREATE TABLE IF NOT EXISTS marriages (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (bot_id, guild_id, user_a)
);

CREATE TABLE IF NOT EXISTS birthdays (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  month INTEGER NOT NULL,
  PRIMARY KEY (bot_id, guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT DEFAULT '',
  user_id TEXT NOT NULL,
  at_ts INTEGER NOT NULL,
  text TEXT DEFAULT ''
);

-- Statistiques d'utilisation des commandes (par jour)
CREATE TABLE IF NOT EXISTS cmd_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  command TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(bot_id, guild_id, command, day)
);
CREATE INDEX IF NOT EXISTS idx_cmd_stats_day ON cmd_stats (bot_id, guild_id, day);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT DEFAULT '',
  hour INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  days TEXT DEFAULT '1,2,3,4,5,6,7',
  text TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  last_sent TEXT DEFAULT ''
);

-- v3.22 — annonce personnalisée envoyée immédiatement dans plusieurs salons.
-- Indépendante des annonces programmées historiques.
CREATE TABLE IF NOT EXISTS custom_announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT DEFAULT 'Annonce personnalisée',
  title TEXT DEFAULT '',
  message TEXT DEFAULT '',
  color TEXT DEFAULT '#5865F2',
  image_url TEXT DEFAULT '',
  footer TEXT DEFAULT '',
  channels TEXT DEFAULT '[]',
  ping_roles TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (bot_id, guild_id)
);

-- Hoxera 2.0 : statistiques
CREATE TABLE IF NOT EXISTS message_stats (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (bot_id, guild_id, user_id, day)
);

CREATE TABLE IF NOT EXISTS join_stats (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (bot_id, guild_id, day)
);

-- Hoxera 2.0 : boutique, candidatures, salons vocaux
CREATE TABLE IF NOT EXISTS shop_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  channel TEXT DEFAULT '',
  questions TEXT DEFAULT '[]',
  title TEXT DEFAULT '📝 Candidature',
  enabled INTEGER DEFAULT 0,
  PRIMARY KEY (bot_id, guild_id)
);

CREATE TABLE IF NOT EXISTS voicetemp (
  bot_id INTEGER NOT NULL,
  guild_id TEXT NOT NULL,
  creator_channel TEXT DEFAULT '',
  category TEXT DEFAULT '',
  name_template TEXT DEFAULT '',
  PRIMARY KEY (bot_id, guild_id)
);

`);

// Index de lecture : ils réduisent le temps des contrôles auth/dashboard
// sans modifier les données ni le comportement historique.
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users (discord_id)'); } catch (e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots (user_id)'); } catch (e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)'); } catch (e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON platform_audit_log (target_user_id, id DESC)'); } catch (e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_suggestions_guild_created ON suggestions (bot_id, guild_id, created_at DESC)'); } catch (e) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_scheduled_guild ON scheduled_messages (bot_id, guild_id, enabled, hour, minute)'); } catch (e) {}

// Migrations légères (les colonnes ajoutées après coup)
try { db.exec("ALTER TABLE tickets ADD COLUMN name TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN types TEXT DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN button_style TEXT DEFAULT '1'"); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN require_reason INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE role_menus ADD COLUMN guild_id TEXT DEFAULT ''"); } catch (e) {}

// Migrations : colonnes Discord (OAuth2)
try { db.exec("ALTER TABLE users ADD COLUMN discord_id TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN discord_username TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN discord_avatar TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN discord_guilds TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord ON users(discord_id) WHERE discord_id != ''"); } catch (e) {}

// Colonne log_channel
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN timezone TEXT DEFAULT 'Europe/Paris'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN suggestion_channel TEXT DEFAULT ''"); } catch (e) {}

// Colonnes XP & auto-mod sur guild_settings
try { db.exec("ALTER TABLE guild_settings ADD COLUMN xp_enabled INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN xp_min INTEGER DEFAULT 10"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN xp_max INTEGER DEFAULT 25"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN xp_cooldown INTEGER DEFAULT 60"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN xp_message TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN xp_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_enabled INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_links INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_caps INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_mentions INTEGER DEFAULT 5"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_spam INTEGER DEFAULT 5"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_ignore_staff INTEGER DEFAULT 1"); } catch (e) {}
// v3.18 — Auto-Mod Control Center : observation, actions par règle et exceptions.
// Les valeurs par défaut gardent exactement le comportement historique.
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_mode TEXT DEFAULT 'enforce'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_rule_actions TEXT DEFAULT '{}'"); } catch (e) {}
// v5.1 — blacklist des membres par serveur après une action Auto-Mod.
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_blacklist_rules TEXT DEFAULT '{}'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_blacklist_thresholds TEXT DEFAULT '{}'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_blacklist_duration_min INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_blacklist_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_blacklist_title TEXT DEFAULT '🚫 Membre ajouté à la blacklist'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_blacklist_color TEXT DEFAULT '#ED4245'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_blacklist_footer TEXT DEFAULT 'Blacklist du serveur · Nexora'"); } catch (e) {}
// v6 — miroir passif des règles Auto-Mod officielles de Discord.
// Il utilise uniquement des alertes natives pour éviter les doubles sanctions.
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_native_enabled INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_native_alert_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE automod_member_blacklist ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE automod_member_blacklist ADD COLUMN trigger_type TEXT DEFAULT 'immediate'"); } catch (e) {}
try { db.exec("ALTER TABLE automod_member_blacklist ADD COLUMN trigger_count INTEGER NOT NULL DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE automod_member_blacklist ADD COLUMN threshold INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
try { db.exec("CREATE TABLE IF NOT EXISTS automod_blacklist_counters (bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, rule TEXT NOT NULL, action TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (bot_id, guild_id, user_id, rule, action))"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_automod_blacklist_counters_user ON automod_blacklist_counters (bot_id, guild_id, user_id, updated_at DESC)"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_automod_member_blacklist_user ON automod_member_blacklist (bot_id, guild_id, user_id, active)"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_exempt_roles TEXT DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_exempt_channels TEXT DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_exempt_users TEXT DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_warn_text TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_timeout_min INTEGER DEFAULT 5"); } catch (e) {}
// v3.9 — avertissements publics progressifs de l'auto-mod :
// 1er avertissement visible dans le salon, 2e palier sanctionnable.
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_warn_limit INTEGER DEFAULT 2"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_warn_action TEXT DEFAULT 'timeout'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_warn_timeout_min INTEGER DEFAULT 10"); } catch (e) {}
// Historique unifié : les avertissements manuels et auto-mod peuvent être
// affichés ensemble dans le panneau et comptés pour l'escalade.
try { db.exec("ALTER TABLE warnings ADD COLUMN source TEXT DEFAULT 'manual'"); } catch (e) {}
try { db.exec("ALTER TABLE warnings ADD COLUMN channel_id TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE warnings ADD COLUMN message_id TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE warnings ADD COLUMN warning_no INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE warnings ADD COLUMN action TEXT DEFAULT 'warn'"); } catch (e) {}
// v3.18 — métadonnées lisibles des actions auto-mod pour le centre de contrôle.
try { db.exec("ALTER TABLE automod_logs ADD COLUMN rule TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE automod_logs ADD COLUMN action TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE automod_logs ADD COLUMN observed INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_automod_logs_rule ON automod_logs (bot_id, guild_id, rule, id DESC)"); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings (bot_id, guild_id, user_id, id DESC)"); } catch (e) {}
// Compteur ACTIF séparé de l'historique : après une sanction réussie,
// le membre repart à 0 sans effacer les avertissements visibles au dashboard.
try { db.exec(`CREATE TABLE IF NOT EXISTS warning_counters (
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bot_id, guild_id, user_id)
)`); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_warning_counters_guild ON warning_counters (bot_id, guild_id)"); } catch (e) {}
// Migration idempotente des anciens avertissements : si le dernier était
// déjà associé à une sanction, le compteur actif commence à zéro.
try {
  const usersWithWarnings = db.prepare('SELECT DISTINCT bot_id, guild_id, user_id FROM warnings').all();
  const readWarnings = db.prepare('SELECT action FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ? ORDER BY id ASC');
  const seedCounter = db.prepare(`INSERT OR IGNORE INTO warning_counters (bot_id, guild_id, user_id, active_count)
    VALUES (?, ?, ?, ?)`);
  for (const w of usersWithWarnings) {
    let active = 0;
    for (const row of readWarnings.all(w.bot_id, w.guild_id, w.user_id)) {
      active += 1;
      if (['timeout', 'kick', 'ban'].includes(row.action)) active = 0;
    }
    seedCounter.run(w.bot_id, w.guild_id, w.user_id, active);
  }
} catch (e) {}
// Compatibilité avec les avertissements créés avant le compteur actif : ces
// anciennes lignes pouvaient continuer après une sanction et produire « 3/2 ».
// On repart une seule fois de zéro pour les membres ayant déjà eu une
// sanction ; les futures sessions utilisent ensuite le compteur persistant.
try {
  const migrationKey = 'migration_auto_warning_reset_v1';
  const alreadyMigrated = db.prepare('SELECT value FROM settings WHERE key = ?').get(migrationKey);
  if (!alreadyMigrated) {
    const counters = db.prepare('SELECT bot_id, guild_id, user_id FROM warning_counters').all();
    const hadSanction = db.prepare(`SELECT 1 FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ?
      AND action IN ('timeout', 'kick', 'ban') LIMIT 1`);
    const reset = db.prepare(`UPDATE warning_counters SET active_count = 0, updated_at = datetime('now')
      WHERE bot_id = ? AND guild_id = ? AND user_id = ?`);
    for (const c of counters) if (hadSanction.get(c.bot_id, c.guild_id, c.user_id)) reset.run(c.bot_id, c.guild_id, c.user_id);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(migrationKey, 'done');
  }
} catch (e) {}
// Les anciennes lignes avaient été numérotées 3/2, 4/2… car elles ne
// connaissaient pas encore les cycles. On les renumérote une seule fois dans
// leur cycle réel ; aucune ligne d'historique n'est supprimée.
try {
  const migrationKey = 'migration_auto_warning_number_v2';
  const alreadyMigrated = db.prepare('SELECT value FROM settings WHERE key = ?').get(migrationKey);
  if (!alreadyMigrated) {
    const usersWithWarnings = db.prepare('SELECT DISTINCT bot_id, guild_id, user_id FROM warnings').all();
    const readWarnings = db.prepare('SELECT id, action FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ? ORDER BY id ASC');
    const renumber = db.prepare('UPDATE warnings SET warning_no = ? WHERE id = ?');
    for (const w of usersWithWarnings) {
      let active = 0;
      for (const row of readWarnings.all(w.bot_id, w.guild_id, w.user_id)) {
        active += 1;
        renumber.run(active, row.id);
        if (['timeout', 'kick', 'ban'].includes(row.action)) active = 0;
      }
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(migrationKey, 'done');
  }
} catch (e) {}
// Messages publics d'avertissement : suppression à 24 h, persistante même
// après un redémarrage Render.
try { db.exec(`CREATE TABLE IF NOT EXISTS automod_warning_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
  delete_at INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (bot_id, guild_id, channel_id, message_id)
)`); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_automod_warning_due ON automod_warning_messages (bot_id, delete_at)"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_enabled INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_threshold INTEGER DEFAULT 10"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_window INTEGER DEFAULT 30"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_action TEXT DEFAULT 'lockdown'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN antiraid_unlock_min INTEGER DEFAULT 0"); } catch (e) {}

// v88 : nouvelles catégories de journaux (messages, rôles, salons, serveur,
// vocal, sécurité) activées par défaut sur les configurations existantes.
function migrateLogCategories(targetDb) {
  const NEW_LOG_CATS = { messages: 1, roles: 1, channels: 1, server: 1, voice: 1, security: 1 };
  const rows = targetDb.prepare("SELECT bot_id, guild_id, log_events FROM guild_settings WHERE log_events != ''").all();
  const upd = targetDb.prepare('UPDATE guild_settings SET log_events = ? WHERE bot_id = ? AND guild_id = ?');
  let updated = 0;
  for (const r of rows) {
    try {
      const map = JSON.parse(r.log_events);
      if (!map || typeof map !== 'object' || !Object.keys(map).length) continue;
      let changed = false;
      for (const [k, v] of Object.entries(NEW_LOG_CATS)) {
        if (map[k] === undefined) { map[k] = v; changed = true; }
      }
      if (changed) { upd.run(JSON.stringify(map), r.bot_id, r.guild_id); updated++; }
    } catch { /* ligne illisible : on laisse */ }
  }
  return updated;
}
try { migrateLogCategories(db); } catch (e) {}

// Hoxera 2.0 : colonnes ajoutées
try { db.exec("ALTER TABLE tickets ADD COLUMN max_one INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE role_menus ADD COLUMN mode TEXT DEFAULT 'menu'"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN log_events TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN birthday_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN birthday_role TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN lockdown_channels TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN voicetemp_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN voicetemp_category TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN voicetemp_name TEXT DEFAULT ''"); } catch (e) {}
// Nom du serveur affiché dans le panneau de tickets (bannière + titre automatiques)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN panel_name TEXT DEFAULT ''"); } catch (e) {}
// 🌍 Langue du serveur (tous les messages publics du bot suivent) — fr par défaut
try { db.exec("ALTER TABLE guild_settings ADD COLUMN lang TEXT DEFAULT 'fr'"); } catch (e) {}

// v1.98 — Communauté PRO : paliers de sanctions, starboard, invitations
try { db.exec("ALTER TABLE guild_settings ADD COLUMN warn_timeout_limit INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN warn_timeout_min INTEGER DEFAULT 60"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN starboard_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN starboard_min INTEGER DEFAULT 3"); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS starboard_posts (
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL, message_id TEXT NOT NULL,
  star_message_id TEXT NOT NULL, stars INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bot_id, guild_id, message_id))`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS invite_uses (
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL, code TEXT NOT NULL,
  uses INTEGER DEFAULT 0, inviter_id TEXT DEFAULT '',
  PRIMARY KEY (bot_id, guild_id, code))`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS invite_joins (
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL, code TEXT DEFAULT '',
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bot_id, guild_id, user_id))`); } catch (e) {}

// v2.1 — 🔴 Annonces de live + auto-rôle multiple
try { db.exec("ALTER TABLE guild_settings ADD COLUMN live_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN live_ping TEXT DEFAULT 'everyone'"); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS live_socials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL,
  user_id TEXT DEFAULT '', platform TEXT NOT NULL, handle TEXT NOT NULL,
  last_status TEXT DEFAULT 'off', last_announce_ts INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (bot_id, guild_id, platform, handle))`); } catch (e) {}
// v3.8 — état fiable des sessions live : une clé de session (room/stream),
// confirmation de sortie et diagnostic du dernier contrôle. Les anciennes
// bases reçoivent ces colonnes sans perdre les comptes suivis.
try { db.exec("ALTER TABLE live_socials ADD COLUMN live_key TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE live_socials ADD COLUMN offline_streak INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE live_socials ADD COLUMN last_checked_at INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE live_socials ADD COLUMN last_error TEXT DEFAULT ''"); } catch (e) {}

// 🗑 Ancien cache de bannières animées : supprimé (les GIF faisaient
// grossir la sauvegarde au-delà de la limite de 1 Mo de l'API GitHub).
try { db.exec('DROP TABLE IF EXISTS banner_cache'); } catch (e) {}
// 📦 Compactage : libère réellement la place (fichier de sauvegarde
// plus léger → plus jamais au-dessus de la limite de 1 Mo de GitHub).
try { db.exec('VACUUM'); } catch (e) {}

// L'ancienne table events (globale) n'a pas de colonne guild_id : on la reconstruit
const eventsCols = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
if (!eventsCols.includes('guild_id')) {
  db.exec('DROP TABLE events');
  db.exec(`CREATE TABLE events (
    bot_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    config TEXT DEFAULT '{}',
    PRIMARY KEY (bot_id, guild_id, event_type)
  )`);
}

// ---------------------- Utilisateurs & sessions ----------------------
const users = {
  findByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim()),
  findById: (id) => db.prepare('SELECT id, email, discord_id, discord_username, discord_avatar, created_at FROM users WHERE id = ?').get(id),
  findByDiscordId: (discordId) => db.prepare('SELECT * FROM users WHERE discord_id = ?').get(String(discordId)),
  create: (email, hash, extra = {}) => {
    const r = db.prepare('INSERT INTO users (email, password_hash, discord_id, discord_username, discord_avatar) VALUES (?, ?, ?, ?, ?)')
      .run(email, hash, extra.discord_id || '', extra.discord_username || '', extra.discord_avatar || '');
    return r.lastInsertRowid;
  },
  updateDiscord: (id, fields) => {
    const allowed = ['discord_id', 'discord_username', 'discord_avatar', 'discord_guilds'];
    const sets = [], vals = [];
    for (const k of allowed) if (k in fields) { sets.push(`${k} = ?`); vals.push(fields[k]); }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  discordGuilds: (id) => {
    const r = db.prepare('SELECT discord_guilds FROM users WHERE id = ?').get(id);
    try { return JSON.parse(r ? (r.discord_guilds || '[]') : '[]'); } catch { return []; }
  },
};

const platformBans = {
  get: (userId) => db.prepare('SELECT * FROM platform_bans WHERE user_id = ?').get(userId) || null,
  isBanned: (userId) => !!db.prepare('SELECT 1 FROM platform_bans WHERE user_id = ?').get(userId),
  all: () => db.prepare('SELECT * FROM platform_bans ORDER BY created_at DESC').all(),
  set: (userId, reason = '', createdBy = 0) => db.prepare(`INSERT INTO platform_bans (user_id, reason, created_by)
    VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET reason = excluded.reason, created_at = datetime('now'), created_by = excluded.created_by`)
    .run(userId, String(reason || '').slice(0, 500), createdBy || 0),
  remove: (userId) => db.prepare('DELETE FROM platform_bans WHERE user_id = ?').run(userId),
};

const platformAudit = {
  add: (actorUserId, targetUserId, action, details = '') => db.prepare(`INSERT INTO platform_audit_log
    (actor_user_id, target_user_id, action, details) VALUES (?, ?, ?, ?)`).run(
      actorUserId || 0, targetUserId || 0, String(action || 'unknown').slice(0, 80), String(details || '').slice(0, 1000)),
  recent: (limit = 100) => db.prepare('SELECT * FROM platform_audit_log ORDER BY id DESC LIMIT ?')
    .all(Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200)),
};

const sessions = {
  create: (userId, days = 30) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
    return token;
  },
  find: (token) => db.prepare('SELECT * FROM sessions WHERE token = ?').get(token),
  destroy: (token) => db.prepare('DELETE FROM sessions WHERE token = ?').run(token),
  cleanup: () => db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run(),
};

// ---------------------- Bots ----------------------
const bots = {
  all: (userId) => db.prepare('SELECT * FROM bots WHERE user_id = ? ORDER BY created_at DESC').all(userId),
  get: (id) => db.prepare('SELECT * FROM bots WHERE id = ?').get(id),
  create: (data) => db.prepare(`INSERT INTO bots (user_id, name, token, client_id, prefix) VALUES (@user_id, @name, @token, @client_id, @prefix)`).run(data).lastInsertRowid,
  update: (id, fields) => {
    const allowed = ['name', 'prefix', 'status_text', 'status_type', 'enabled', 'last_error', 'avatar_url', 'bot_username', 'client_id', 'token'];
    const sets = [], vals = [];
    for (const k of allowed) if (k in fields) { sets.push(`${k} = ?`); vals.push(fields[k]); }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE bots SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  remove: (id) => db.prepare('DELETE FROM bots WHERE id = ?').run(id),
};

// ---------------------- Commandes ----------------------
const commands = {
  all: (botId) => db.prepare('SELECT * FROM commands WHERE bot_id = ? ORDER BY sort ASC, id ASC').all(botId),
  get: (id) => db.prepare('SELECT * FROM commands WHERE id = ?').get(id),
  create: (data) => db.prepare(`INSERT INTO commands (bot_id, name, description, trigger_type, trigger_value, options, blocks, cooldown, enabled, sort)
    VALUES (@bot_id, @name, @description, @trigger_type, @trigger_value, @options, @blocks, @cooldown, @enabled, @sort)`).run(data).lastInsertRowid,
  update: (id, fields) => {
    const allowed = ['name', 'description', 'trigger_type', 'trigger_value', 'options', 'blocks', 'cooldown', 'enabled', 'sort'];
    const sets = [], vals = [];
    for (const k of allowed) if (k in fields) { sets.push(`${k} = ?`); vals.push(fields[k]); }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE commands SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  remove: (id) => db.prepare('DELETE FROM commands WHERE id = ?').run(id),
  removeAll: (botId) => db.prepare('DELETE FROM commands WHERE bot_id = ?').run(botId),
};

// ---------------------- Modules ----------------------
const modules = {
  all: (botId) => {
    const rows = db.prepare('SELECT * FROM modules WHERE bot_id = ?').all(botId);
    const out = {};
    rows.forEach(r => out[r.module_key] = !!r.enabled);
    return out;
  },
  set: (botId, key, enabled) => db.prepare('INSERT INTO modules (bot_id, module_key, enabled) VALUES (?, ?, ?) ON CONFLICT(bot_id, module_key) DO UPDATE SET enabled = excluded.enabled').run(botId, key, enabled ? 1 : 0),
};

// ---------------------- Jetons Discord (OAuth2) ----------------------
const discordTokens = {
  get: (userId) => db.prepare('SELECT * FROM discord_tokens WHERE user_id = ?').get(userId) || null,
  set: (userId, { access, refresh, expires }) => db.prepare('INSERT INTO discord_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at')
    .run(userId, access, refresh, expires),
  remove: (userId) => db.prepare('DELETE FROM discord_tokens WHERE user_id = ?').run(userId),
};

// ---------------------- Événements (par serveur) ----------------------
const events = {
  all: (botId, guildId) => {
    const rows = db.prepare('SELECT * FROM events WHERE bot_id = ? AND guild_id = ?').all(botId, guildId);
    const out = {};
    rows.forEach(r => out[r.event_type] = { enabled: !!r.enabled, config: JSON.parse(r.config || '{}') });
    return out;
  },
  set: (botId, guildId, type, enabled, config) => db.prepare('INSERT INTO events (bot_id, guild_id, event_type, enabled, config) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bot_id, guild_id, event_type) DO UPDATE SET enabled = excluded.enabled, config = excluded.config')
    .run(botId, guildId, type, enabled ? 1 : 0, JSON.stringify(config || {})),
  countEnabled: (botId) => db.prepare('SELECT COUNT(*) AS n FROM events WHERE bot_id = ? AND enabled = 1').get(botId).n,
};

// ---------------------- Réglages par serveur (façon DraftBot) ----------------------
const guildSettings = {
  get: (botId, guildId) => db.prepare('SELECT * FROM guild_settings WHERE bot_id = ? AND guild_id = ?').get(botId, guildId) || null,
  set: (botId, guildId, fields) => {
    const cur = guildSettings.get(botId, guildId) || { prefix: '', warn_limit: 0, warn_action: 'none' };
    const next = { ...cur, ...fields };
    const cols = ['prefix', 'warn_limit', 'warn_action', 'warn_timeout_limit', 'warn_timeout_min', 'starboard_channel', 'starboard_min', 'live_channel', 'live_ping', 'ticket_log_channel', 'xp_enabled', 'xp_min', 'xp_max', 'xp_cooldown', 'xp_message', 'xp_channel', 'am_enabled', 'am_links', 'am_caps', 'am_mentions', 'am_spam', 'am_ignore_staff', 'am_mode', 'am_rule_actions', 'am_blacklist_rules', 'am_blacklist_thresholds', 'am_blacklist_duration_min', 'am_blacklist_channel', 'am_blacklist_title', 'am_blacklist_color', 'am_blacklist_footer', 'am_native_enabled', 'am_native_alert_channel', 'am_exempt_roles', 'am_exempt_channels', 'am_exempt_users', 'am_warn_text', 'am_timeout_min', 'am_warn_limit', 'am_warn_action', 'am_warn_timeout_min', 'antiraid_enabled', 'antiraid_threshold', 'antiraid_window', 'antiraid_action', 'antiraid_unlock_min', 'log_channel', 'suggestion_channel', 'log_events', 'birthday_channel', 'birthday_role', 'lockdown_channels', 'voicetemp_channel', 'voicetemp_category', 'voicetemp_name', 'panel_name', 'lang', 'timezone'];
    const vals = {
      bot_id: botId, guild_id: guildId,
      prefix: String(next.prefix || '').slice(0, 5),
      warn_limit: next.warn_limit || 0,
      warn_action: ['none', 'timeout', 'kick', 'ban'].includes(next.warn_action) ? next.warn_action : 'none',
      warn_timeout_limit: Math.max(parseInt(next.warn_timeout_limit, 10) || 0, 0),
      warn_timeout_min: Math.min(Math.max(parseInt(next.warn_timeout_min, 10) || 60, 1), 10080),
      starboard_channel: String(next.starboard_channel || '').slice(0, 100),
      starboard_min: Math.min(Math.max(parseInt(next.starboard_min, 10) || 3, 1), 50),
      live_channel: String(next.live_channel || '').slice(0, 100),
      live_ping: ['everyone', 'here', 'none'].includes(String(next.live_ping || '')) ? String(next.live_ping) : 'everyone',
      ticket_log_channel: String(next.ticket_log_channel || '').slice(0, 100),
      xp_enabled: (next.xp_enabled === undefined || next.xp_enabled === null) ? 1 : (next.xp_enabled ? 1 : 0),
      xp_min: Math.min(Math.max(parseInt(next.xp_min, 10) || 10, 1), 1000),
      xp_max: Math.max(parseInt(next.xp_max, 10) || 25, 1),
      xp_cooldown: Math.max(parseInt(next.xp_cooldown, 10) || 60, 0),
      xp_message: String(next.xp_message || '').slice(0, 500),
      xp_channel: String(next.xp_channel || '').slice(0, 100),
      am_enabled: next.am_enabled ? 1 : 0,
      am_links: (next.am_links === 0 || next.am_links === false) ? 0 : 1,
      am_caps: (next.am_caps === 0 || next.am_caps === false) ? 0 : 1,
      am_mentions: Math.max(parseInt(next.am_mentions, 10) || 0, 0),
      am_spam: Math.max(parseInt(next.am_spam, 10) || 0, 0),
      am_ignore_staff: (next.am_ignore_staff === 0 || next.am_ignore_staff === false) ? 0 : 1,
      am_mode: String(next.am_mode || 'enforce') === 'observe' ? 'observe' : 'enforce',
      am_rule_actions: typeof next.am_rule_actions === 'string'
        ? next.am_rule_actions.slice(0, 2000)
        : JSON.stringify(next.am_rule_actions && typeof next.am_rule_actions === 'object' ? next.am_rule_actions : {}),
      am_blacklist_rules: typeof next.am_blacklist_rules === 'string'
        ? next.am_blacklist_rules.slice(0, 1000)
        : JSON.stringify(next.am_blacklist_rules && typeof next.am_blacklist_rules === 'object' ? next.am_blacklist_rules : {}),
      am_blacklist_thresholds: typeof next.am_blacklist_thresholds === 'string'
        ? next.am_blacklist_thresholds.slice(0, 1000)
        : JSON.stringify(next.am_blacklist_thresholds && typeof next.am_blacklist_thresholds === 'object' ? next.am_blacklist_thresholds : {}),
      am_blacklist_duration_min: Math.min(Math.max(parseInt(next.am_blacklist_duration_min, 10) || 0, 0), 525600),
      am_blacklist_channel: String(next.am_blacklist_channel || '').slice(0, 100),
      am_blacklist_title: String(next.am_blacklist_title || '🚫 Membre ajouté à la blacklist').slice(0, 120),
      am_blacklist_color: /^#[0-9a-fA-F]{6}$/.test(String(next.am_blacklist_color || '')) ? String(next.am_blacklist_color) : '#ED4245',
      am_blacklist_footer: String(next.am_blacklist_footer || 'Blacklist du serveur · Nexora').slice(0, 200),
      am_native_enabled: next.am_native_enabled === 0 || next.am_native_enabled === false ? 0 : 1,
      am_native_alert_channel: String(next.am_native_alert_channel || '').slice(0, 100),
      am_exempt_roles: typeof next.am_exempt_roles === 'string'
        ? next.am_exempt_roles.slice(0, 4000)
        : JSON.stringify(Array.isArray(next.am_exempt_roles) ? next.am_exempt_roles : []),
      am_exempt_channels: typeof next.am_exempt_channels === 'string'
        ? next.am_exempt_channels.slice(0, 4000)
        : JSON.stringify(Array.isArray(next.am_exempt_channels) ? next.am_exempt_channels : []),
      am_exempt_users: typeof next.am_exempt_users === 'string'
        ? next.am_exempt_users.slice(0, 4000)
        : JSON.stringify(Array.isArray(next.am_exempt_users) ? next.am_exempt_users : []),
      am_warn_text: String(next.am_warn_text || '').slice(0, 1000),
      am_timeout_min: Math.min(Math.max(parseInt(next.am_timeout_min, 10) || 5, 1), 1440),
      am_warn_limit: Number.isFinite(parseInt(next.am_warn_limit, 10)) ? Math.min(Math.max(parseInt(next.am_warn_limit, 10), 0), 50) : 2,
      am_warn_action: ['none', 'timeout', 'kick', 'ban'].includes(String(next.am_warn_action || '')) ? String(next.am_warn_action) : 'timeout',
      am_warn_timeout_min: Math.min(Math.max(parseInt(next.am_warn_timeout_min, 10) || 10, 1), 1440),
      antiraid_enabled: next.antiraid_enabled ? 1 : 0,
      antiraid_threshold: Math.min(Math.max(parseInt(next.antiraid_threshold, 10) || 10, 2), 100),
      antiraid_window: Math.min(Math.max(parseInt(next.antiraid_window, 10) || 30, 5), 600),
      antiraid_action: ['lockdown', 'alert'].includes(String(next.antiraid_action)) ? String(next.antiraid_action) : 'lockdown',
      antiraid_unlock_min: Math.min(Math.max(parseInt(next.antiraid_unlock_min, 10) || 0, 0), 1440),
      log_channel: String(next.log_channel || '').slice(0, 100),
      suggestion_channel: String(next.suggestion_channel || '').slice(0, 100),
      log_events: String(next.log_events || '').slice(0, 1000),
      birthday_channel: String(next.birthday_channel || '').slice(0, 100),
      birthday_role: String(next.birthday_role || '').slice(0, 100),
      lockdown_channels: String(next.lockdown_channels || '').slice(0, 4000),
      voicetemp_channel: String(next.voicetemp_channel || '').slice(0, 100),
      voicetemp_category: String(next.voicetemp_category || '').slice(0, 100),
      voicetemp_name: String(next.voicetemp_name || '').slice(0, 50),
      panel_name: String(next.panel_name || '').slice(0, 100),
      lang: ['fr', 'en'].includes(String(next.lang || '')) ? String(next.lang) : 'fr',
      timezone: tzUtil.safeTz(next.timezone),
    };
    const sets = cols.map(c => `${c} = excluded.${c}`).join(', ');
    const placeholders = ['bot_id', 'guild_id', ...cols].map(c => `@${c}`).join(', ');
    db.prepare(`INSERT INTO guild_settings (${['bot_id', 'guild_id', ...cols].join(', ')}) VALUES (${placeholders}) ON CONFLICT(bot_id, guild_id) DO UPDATE SET ${sets}`).run(vals);
  },
};

// ---------------------- XP (niveaux) ----------------------
const xp = {
  get: (botId, guildId, userId) => db.prepare('SELECT * FROM xp WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, userId) || null,
  add: (botId, guildId, userId, amount, ts) => db.prepare(`INSERT INTO xp (bot_id, guild_id, user_id, xp, level, last_ts) VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(bot_id, guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp, last_ts = excluded.last_ts`).run(botId, guildId, userId, amount, ts),
  setLevel: (botId, guildId, userId, level) => db.prepare('UPDATE xp SET level = ? WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(level, botId, guildId, userId),
  top: (botId, guildId, limit = 10) => db.prepare('SELECT * FROM xp WHERE bot_id = ? AND guild_id = ? ORDER BY xp DESC LIMIT ?').all(botId, guildId, limit),
  rankOf: (botId, guildId, userId) => db.prepare('SELECT COUNT(*) AS n FROM xp WHERE bot_id = ? AND guild_id = ? AND xp > (SELECT COALESCE((SELECT xp FROM xp WHERE bot_id = ? AND guild_id = ? AND user_id = ?), 0))').get(botId, guildId, botId, guildId, userId).n + 1,
};

// ---------------------- Rôles de récompense XP ----------------------
const xpRoles = {
  all: (botId, guildId) => db.prepare('SELECT * FROM xp_roles WHERE bot_id = ? AND guild_id = ? ORDER BY level ASC').all(botId, guildId),
  replace: (botId, guildId, roles) => {
    db.prepare('DELETE FROM xp_roles WHERE bot_id = ? AND guild_id = ?').run(botId, guildId);
    const ins = db.prepare('INSERT INTO xp_roles (bot_id, guild_id, level, role) VALUES (?, ?, ?, ?)');
    for (const r of roles) ins.run(botId, guildId, r.level, r.role);
  },
};

// ---------------------- Économie ----------------------
const economy = {
  get: (botId, guildId, userId) => db.prepare('SELECT * FROM economy WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, userId),
  ensure: (botId, guildId, userId) => {
    economy.get(botId, guildId, userId) || db.prepare('INSERT INTO economy (bot_id, guild_id, user_id) VALUES (?, ?, ?)').run(botId, guildId, userId);
  },
  add: (botId, guildId, userId, amount) => {
    economy.ensure(botId, guildId, userId);
    db.prepare('UPDATE economy SET coins = coins + ? WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(amount, botId, guildId, userId);
  },
  setDaily: (botId, guildId, userId, date) => db.prepare('UPDATE economy SET last_daily = ? WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(date, botId, guildId, userId),
  top: (botId, guildId, limit = 10) => db.prepare('SELECT * FROM economy WHERE bot_id = ? AND guild_id = ? ORDER BY coins DESC LIMIT ?').all(botId, guildId, limit),
  guildsWithData: (botId) => db.prepare('SELECT DISTINCT guild_id FROM economy WHERE bot_id = ?').all(botId).map(r => r.guild_id),
};

// ---------------------- Avertissements ----------------------
const warnings = {
  add: (botId, guildId, userId, reason, modId, meta = {}) => {
    const uid = String(userId || '');
    const source = ['automod', 'manual', 'system'].includes(meta.source) ? meta.source : 'manual';
    const action = ['warn', 'timeout', 'kick', 'ban'].includes(meta.action) ? meta.action : 'warn';
    const tx = db.transaction(() => {
      const current = db.prepare('SELECT active_count FROM warning_counters WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, uid);
      const warningNo = (current ? Number(current.active_count) : 0) + 1;
      const inserted = db.prepare(`INSERT INTO warnings
        (bot_id, guild_id, user_id, reason, mod_id, source, channel_id, message_id, warning_no, action)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          botId, guildId, uid, String(reason || '').slice(0, 500), String(modId || '').slice(0, 40), source,
          String(meta.channel_id || '').slice(0, 40), String(meta.message_id || '').slice(0, 40), warningNo, action);
      db.prepare(`INSERT INTO warning_counters (bot_id, guild_id, user_id, active_count, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(bot_id, guild_id, user_id) DO UPDATE SET active_count = excluded.active_count, updated_at = excluded.updated_at`)
        .run(botId, guildId, uid, warningNo);
      return { lastInsertRowid: inserted.lastInsertRowid, changes: inserted.changes, warningNo };
    });
    return tx();
  },
  setAction: (id, action) => db.prepare("UPDATE warnings SET action = ? WHERE id = ?").run(['warn', 'timeout', 'kick', 'ban'].includes(action) ? action : 'warn', id),
  resetActive: (botId, guildId, userId) => db.prepare(`INSERT INTO warning_counters (bot_id, guild_id, user_id, active_count, updated_at)
    VALUES (?, ?, ?, 0, datetime('now'))
    ON CONFLICT(bot_id, guild_id, user_id) DO UPDATE SET active_count = 0, updated_at = excluded.updated_at`).run(botId, guildId, String(userId || '')),
  list: (botId, guildId, userId) => db.prepare('SELECT * FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 10').all(botId, guildId, userId),
  count: (botId, guildId, userId) => {
    const uid = String(userId || '');
    const row = db.prepare('SELECT active_count FROM warning_counters WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, uid);
    return row ? Number(row.active_count) || 0 : db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, uid).n;
  },
  recent: (botId, guildId, limit = 50) => db.prepare('SELECT * FROM warnings WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT ?').all(botId, guildId, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)),
  summary: (botId, guildId, limit = 50) => db.prepare(`SELECT w.user_id, COALESCE(c.active_count, 0) AS count, COUNT(w.id) AS history_count, MAX(w.id) AS last_id, MAX(w.created_at) AS last_at
    FROM warnings w LEFT JOIN warning_counters c ON c.bot_id = w.bot_id AND c.guild_id = w.guild_id AND c.user_id = w.user_id
    WHERE w.bot_id = ? AND w.guild_id = ? GROUP BY w.user_id ORDER BY last_id DESC LIMIT ?`).all(botId, guildId, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)),
  clear: (botId, guildId, userId) => {
    const uid = String(userId || '');
    const tx = db.transaction(() => {
      const result = db.prepare('DELETE FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(botId, guildId, uid);
      db.prepare('DELETE FROM warning_counters WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(botId, guildId, uid);
      return result;
    });
    return tx();
  },
};

// ---------------------- Messages publics d'avertissement ----------------------
const automodWarningMessages = {
  add: (botId, guildId, channelId, messageId, deleteAt) => db.prepare(`INSERT OR IGNORE INTO automod_warning_messages
    (bot_id, guild_id, channel_id, message_id, delete_at) VALUES (?, ?, ?, ?, ?)`).run(
      botId, String(guildId), String(channelId), String(messageId), Math.max(parseInt(deleteAt, 10) || 0, 0)),
  due: (now = Date.now(), limit = 200) => db.prepare('SELECT * FROM automod_warning_messages WHERE delete_at <= ? ORDER BY delete_at ASC LIMIT ?').all(parseInt(now, 10) || Date.now(), Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500)),
  remove: (id) => db.prepare('DELETE FROM automod_warning_messages WHERE id = ?').run(id),
  removeByMessage: (botId, guildId, channelId, messageId) => db.prepare('DELETE FROM automod_warning_messages WHERE bot_id = ? AND guild_id = ? AND channel_id = ? AND message_id = ?').run(botId, String(guildId), String(channelId), String(messageId)),
};

// ---------------------- Menus de rôles ----------------------
// ---------------------- Menus de rôles (menu déroulant OU boutons) ----------------------
const roleMenus = {
  all: (botId, guildId) => db.prepare('SELECT * FROM role_menus WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC').all(botId, guildId)
    .map(m => ({ ...m, options: JSON.parse(m.options || '[]'), mode: m.mode || 'menu' })),
  get: (id) => {
    const r = db.prepare('SELECT * FROM role_menus WHERE id = ?').get(id);
    return r ? { ...r, options: JSON.parse(r.options || '[]'), mode: r.mode || 'menu' } : null;
  },
  create: (data) => db.prepare('INSERT INTO role_menus (bot_id, guild_id, name, content, placeholder, channel, options, mode) VALUES (@bot_id, @guild_id, @name, @content, @placeholder, @channel, @options, @mode)').run({ mode: 'menu', name: '', content: '', placeholder: 'Choisis tes rôles…', channel: '', options: '[]', ...data }).lastInsertRowid,
  update: (id, fields) => {
    const allowed = ['name', 'content', 'placeholder', 'channel', 'options', 'mode'];
    const sets = [], vals = [];
    for (const k of allowed) if (k in fields) { sets.push(`${k} = ?`); vals.push(fields[k]); }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE role_menus SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  remove: (id) => db.prepare('DELETE FROM role_menus WHERE id = ?').run(id),
};

// ---------------------- Configuration des tickets (par serveur) ----------------------
const tickets = {
  get: (botId, guildId) => db.prepare('SELECT * FROM tickets WHERE bot_id = ? AND guild_id = ?').get(botId, guildId) || null,
  set: (botId, guildId, cfg) => {
    const types = typeof cfg.types === 'string' ? cfg.types : JSON.stringify(Array.isArray(cfg.types) ? cfg.types : []);
    return db.prepare(`INSERT INTO tickets (bot_id, guild_id, name, channel, message, button_label, button_style, support_role, category, types, require_reason, max_one, menu_channel, menu_message, menu_category)
      VALUES (@bot_id, @guild_id, @name, @channel, @message, @button_label, @button_style, @support_role, @category, @types, @require_reason, @max_one, @menu_channel, @menu_message, @menu_category)
      ON CONFLICT(bot_id, guild_id) DO UPDATE SET
        name = excluded.name,
        channel = excluded.channel,
        message = excluded.message,
        button_label = excluded.button_label,
        button_style = excluded.button_style,
        support_role = excluded.support_role,
        category = excluded.category,
        types = excluded.types,
        require_reason = excluded.require_reason,
        max_one = excluded.max_one,
        menu_channel = excluded.menu_channel,
        menu_message = excluded.menu_message,
        menu_category = excluded.menu_category`).run({
          bot_id: botId, guild_id: guildId, name: '', channel: '', message: '', button_label: '', button_style: '1', support_role: '', category: '', require_reason: 1, max_one: 0, menu_channel: '', menu_message: '', menu_category: '', ...cfg,
          button_style: String(['1','2','3','4'].includes(String(cfg.button_style)) ? cfg.button_style : '1'),
          require_reason: (cfg.require_reason === 0 || cfg.require_reason === false) ? 0 : 1,
          max_one: cfg.max_one ? 1 : 0,
          types,
        });
  },
};

// ---------------------- 🎨 Tickets personnalisés (nouveau système) ----------------------
const advancedTickets = {
  get: (botId, guildId) => {
    const row = db.prepare('SELECT * FROM advanced_ticket_panels WHERE bot_id = ? AND guild_id = ?').get(botId, guildId);
    if (!row) return null;
    let types = [];
    try { types = JSON.parse(row.types || '[]'); } catch {}
    return { ...row, types: Array.isArray(types) ? types : [] };
  },
  set: (botId, guildId, cfg) => db.prepare(`INSERT INTO advanced_ticket_panels
    (bot_id, guild_id, name, mode, channel, message, image_url, require_reason, types, updated_at)
    VALUES (@bot_id, @guild_id, @name, @mode, @channel, @message, @image_url, @require_reason, @types, datetime('now'))
    ON CONFLICT(bot_id, guild_id) DO UPDATE SET
      name = excluded.name, mode = excluded.mode, channel = excluded.channel,
      message = excluded.message, image_url = excluded.image_url, require_reason = excluded.require_reason,
      types = excluded.types, updated_at = datetime('now')`).run({
        bot_id: botId, guild_id: guildId,
        name: String(cfg.name || 'Créer un ticket').slice(0, 80),
        mode: cfg.mode === 'menu' ? 'menu' : 'buttons',
        channel: String(cfg.channel || '').slice(0, 100),
        message: String(cfg.message || '').slice(0, 1900),
        image_url: String(cfg.image_url || '').slice(0, 500),
        require_reason: (cfg.require_reason === 0 || cfg.require_reason === false) ? 0 : 1,
        types: typeof cfg.types === 'string' ? cfg.types : JSON.stringify(Array.isArray(cfg.types) ? cfg.types : []),
      }),
  setPanelMessage: (botId, guildId, messageId, channelId) => db.prepare(`UPDATE advanced_ticket_panels
    SET panel_message_id = ?, panel_channel = ?, updated_at = datetime('now') WHERE bot_id = ? AND guild_id = ?`).run(String(messageId || ''), String(channelId || ''), botId, guildId),
  clearPanelMessage: (botId, guildId) => db.prepare(`UPDATE advanced_ticket_panels
    SET panel_message_id = '', panel_channel = '', updated_at = datetime('now') WHERE bot_id = ? AND guild_id = ?`).run(botId, guildId),
  bindChannel: (channelId, botId, guildId, panelId, typeId, typeLabel, staffRoles, color) => db.prepare(`INSERT INTO advanced_ticket_channels
    (channel_id, bot_id, guild_id, panel_id, type_id, type_label, staff_roles, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET bot_id = excluded.bot_id, guild_id = excluded.guild_id,
      panel_id = excluded.panel_id, type_id = excluded.type_id, type_label = excluded.type_label,
      staff_roles = excluded.staff_roles, color = excluded.color`).run(
      String(channelId), botId, String(guildId), panelId, String(typeId || ''), String(typeLabel || '').slice(0, 100),
      JSON.stringify(Array.isArray(staffRoles) ? staffRoles.slice(0, 10) : []), /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : '#5865F2'),
  byChannel: (channelId) => {
    const row = db.prepare('SELECT * FROM advanced_ticket_channels WHERE channel_id = ?').get(String(channelId));
    if (!row) return null;
    let staffRoles = [];
    try { staffRoles = JSON.parse(row.staff_roles || '[]'); } catch {}
    return { ...row, staff_roles: Array.isArray(staffRoles) ? staffRoles : [] };
  },
  unbindChannel: (channelId) => db.prepare('DELETE FROM advanced_ticket_channels WHERE channel_id = ?').run(String(channelId)),
};

// ---------------------- Réglages généraux (clé/valeur) ----------------------
const settings = {
  get: (key) => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : '';
  },
  set: (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value)),
  keysLike: (pattern) => db.prepare('SELECT key FROM settings WHERE key LIKE ?').all(String(pattern)).map((r) => r.key),
};

// ---------------------- Identité du bot par serveur ----------------------
const botProfiles = {
  get: (botId, guildId) => db.prepare('SELECT * FROM bot_profiles WHERE bot_id = ? AND guild_id = ?').get(botId, guildId) || null,
  set: (botId, guildId, fields) => db.prepare(`INSERT INTO bot_profiles (bot_id, guild_id, name, avatar_url, banner_url, bio, color)
    VALUES (@bot_id, @guild_id, @name, @avatar_url, @banner_url, @bio, @color)
    ON CONFLICT(bot_id, guild_id) DO UPDATE SET
      name = excluded.name, avatar_url = excluded.avatar_url, banner_url = excluded.banner_url,
      bio = excluded.bio, color = excluded.color`).run({
        bot_id: botId, guild_id: guildId,
        name: String(fields.name || '').slice(0, 80),
        avatar_url: String(fields.avatar_url || '').slice(0, 500),
        banner_url: String(fields.banner_url || '').slice(0, 500),
        bio: String(fields.bio || '').slice(0, 1900),
        color: /^#[0-9a-fA-F]{6}$/.test(String(fields.color || '')) ? fields.color : '#5865F2',
      }),
  remove: (botId, guildId) => db.prepare('DELETE FROM bot_profiles WHERE bot_id = ? AND guild_id = ?').run(botId, guildId),
};

// ---------------------- Liste noire de mots ----------------------
const blacklist = {
  all: (botId, guildId) => db.prepare('SELECT word FROM blacklist_words WHERE bot_id = ? AND guild_id = ? ORDER BY word').all(botId, guildId).map((r) => r.word),
  add: (botId, guildId, word) => db.prepare('INSERT OR IGNORE INTO blacklist_words (bot_id, guild_id, word) VALUES (?, ?, ?)').run(botId, guildId, String(word).toLowerCase().slice(0, 50)),
  remove: (botId, guildId, word) => db.prepare('DELETE FROM blacklist_words WHERE bot_id = ? AND guild_id = ? AND word = ?').run(botId, guildId, String(word).toLowerCase()),
};

// ---------------------- Blacklist des membres (par serveur) ----------------------
const memberBlacklist = {
  expire: (botId, guildId) => db.prepare(`UPDATE automod_member_blacklist
    SET active = 0, removed_at = datetime('now'), removed_by = 'system:expiration'
    WHERE bot_id = ? AND guild_id = ? AND active = 1 AND expires_at > 0 AND expires_at <= ?`)
    .run(botId, String(guildId), Date.now()),
  active: (botId, guildId, limit = 100) => {
    memberBlacklist.expire(botId, guildId);
    return db.prepare(`SELECT * FROM automod_member_blacklist
      WHERE bot_id = ? AND guild_id = ? AND active = 1 ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(botId, String(guildId), Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200));
  },
  all: (botId, guildId, limit = 100) => {
    memberBlacklist.expire(botId, guildId);
    return db.prepare(`SELECT * FROM automod_member_blacklist
      WHERE bot_id = ? AND guild_id = ? ORDER BY active DESC, created_at DESC, id DESC LIMIT ?`)
      .all(botId, String(guildId), Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200));
  },
  get: (botId, guildId, userId) => {
    memberBlacklist.expire(botId, guildId);
    return db.prepare(`SELECT * FROM automod_member_blacklist
      WHERE bot_id = ? AND guild_id = ? AND user_id = ?`).get(botId, String(guildId), String(userId)) || null;
  },
  add: (botId, guildId, entry = {}) => db.prepare(`INSERT INTO automod_member_blacklist
    (bot_id, guild_id, user_id, user_tag, reason, rule, action, source_channel_id, source_message_id, panel_channel_id, panel_message_id, active, expires_at, trigger_type, trigger_count, threshold, created_at, removed_at, removed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, datetime('now'), '', '')
    ON CONFLICT(bot_id, guild_id, user_id) DO UPDATE SET
      user_tag = excluded.user_tag,
      reason = excluded.reason,
      rule = excluded.rule,
      action = excluded.action,
      source_channel_id = excluded.source_channel_id,
      source_message_id = excluded.source_message_id,
      panel_channel_id = excluded.panel_channel_id,
      panel_message_id = excluded.panel_message_id,
      active = 1,
      expires_at = excluded.expires_at,
      trigger_type = excluded.trigger_type,
      trigger_count = excluded.trigger_count,
      threshold = excluded.threshold,
      created_at = datetime('now'),
      removed_at = '',
      removed_by = ''`)
    .run(
      botId, String(guildId), String(entry.user_id || '').slice(0, 30),
      String(entry.user_tag || '').slice(0, 100), String(entry.reason || '').slice(0, 500),
      String(entry.rule || '').slice(0, 32), String(entry.action || '').slice(0, 32),
      String(entry.source_channel_id || '').slice(0, 30), String(entry.source_message_id || '').slice(0, 40),
      String(entry.panel_channel_id || '').slice(0, 30), String(entry.panel_message_id || '').slice(0, 40),
      Math.max(parseInt(entry.expires_at, 10) || 0, 0),
      ['immediate', 'threshold'].includes(String(entry.trigger_type)) ? String(entry.trigger_type) : 'immediate',
      Math.max(parseInt(entry.trigger_count, 10) || 1, 1), Math.max(parseInt(entry.threshold, 10) || 0, 0)),
  setPanel: (botId, guildId, userId, channelId, messageId) => db.prepare(`UPDATE automod_member_blacklist
    SET panel_channel_id = ?, panel_message_id = ? WHERE bot_id = ? AND guild_id = ? AND user_id = ?`)
    .run(String(channelId || '').slice(0, 30), String(messageId || '').slice(0, 40), botId, String(guildId), String(userId)),
  remove: (botId, guildId, userId, removedBy = '') => db.prepare(`UPDATE automod_member_blacklist
    SET active = 0, removed_at = datetime('now'), removed_by = ?
    WHERE bot_id = ? AND guild_id = ? AND user_id = ? AND active = 1`)
    .run(String(removedBy || '').slice(0, 30), botId, String(guildId), String(userId)),
};

const memberBlacklistCounters = {
  get: (botId, guildId, userId, rule, action) => db.prepare(`SELECT * FROM automod_blacklist_counters
    WHERE bot_id = ? AND guild_id = ? AND user_id = ? AND rule = ? AND action = ?`)
    .get(botId, String(guildId), String(userId), String(rule), String(action)) || null,
  increment: (botId, guildId, userId, rule, action) => {
    db.prepare(`INSERT INTO automod_blacklist_counters (bot_id, guild_id, user_id, rule, action, count, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(bot_id, guild_id, user_id, rule, action) DO UPDATE SET count = count + 1, updated_at = datetime('now')`)
      .run(botId, String(guildId), String(userId), String(rule), String(action));
    return memberBlacklistCounters.get(botId, guildId, userId, rule, action);
  },
  reset: (botId, guildId, userId, rule, action) => db.prepare(`DELETE FROM automod_blacklist_counters
    WHERE bot_id = ? AND guild_id = ? AND user_id = ? AND rule = ? AND action = ?`)
    .run(botId, String(guildId), String(userId), String(rule), String(action)),
  resetUser: (botId, guildId, userId) => db.prepare(`DELETE FROM automod_blacklist_counters
    WHERE bot_id = ? AND guild_id = ? AND user_id = ?`)
    .run(botId, String(guildId), String(userId)),
};

// ---------------------- Règles Auto-Mod officielles Discord ----------------------
const nativeAutomodRules = {
  all: (botId, guildId) => db.prepare(`SELECT * FROM native_automod_rules
    WHERE bot_id = ? AND guild_id = ? ORDER BY rule_key`).all(botId, String(guildId)),
  get: (botId, guildId, ruleKey) => db.prepare(`SELECT * FROM native_automod_rules
    WHERE bot_id = ? AND guild_id = ? AND rule_key = ?`).get(botId, String(guildId), String(ruleKey)) || null,
  set: (botId, guildId, ruleKey, discordRuleId, enabled = true) => db.prepare(`INSERT INTO native_automod_rules
    (bot_id, guild_id, rule_key, discord_rule_id, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(bot_id, guild_id, rule_key) DO UPDATE SET discord_rule_id = excluded.discord_rule_id, enabled = excluded.enabled, updated_at = datetime('now')`)
    .run(botId, String(guildId), String(ruleKey), String(discordRuleId), enabled ? 1 : 0),
  setEnabled: (botId, guildId, ruleKey, enabled) => db.prepare(`UPDATE native_automod_rules
    SET enabled = ?, updated_at = datetime('now') WHERE bot_id = ? AND guild_id = ? AND rule_key = ?`)
    .run(enabled ? 1 : 0, botId, String(guildId), String(ruleKey)),
  remove: (botId, guildId, ruleKey) => db.prepare('DELETE FROM native_automod_rules WHERE bot_id = ? AND guild_id = ? AND rule_key = ?').run(botId, String(guildId), String(ruleKey)),
};

// ---------------------- Journal d'auto-modération ----------------------
const automodLogs = {
  add: (botId, guildId, entry) => db.prepare(`INSERT INTO automod_logs
    (bot_id, guild_id, user_id, user_tag, reason, content, channel_id, rule, action, observed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      botId, guildId,
      String(entry.user_id || '').slice(0, 30),
      String(entry.user_tag || '').slice(0, 100),
      String(entry.reason || '').slice(0, 200),
      String(entry.content || '').slice(0, 500),
      String(entry.channel_id || '').slice(0, 30),
      String(entry.rule || '').slice(0, 32),
      String(entry.action || '').slice(0, 32),
      entry.observed ? 1 : 0),
  recent: (botId, guildId, limit = 50) => db.prepare('SELECT * FROM automod_logs WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT ?').all(botId, guildId, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)),
  summary: (botId, guildId) => {
    const totals = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN observed = 1 THEN 1 ELSE 0 END) AS observed,
      SUM(CASE WHEN observed = 0 AND action != 'log' THEN 1 ELSE 0 END) AS enforced
      FROM automod_logs WHERE bot_id = ? AND guild_id = ?`).get(botId, guildId);
    const byRule = db.prepare(`SELECT COALESCE(NULLIF(rule, ''), 'unknown') AS rule, COUNT(*) AS count
      FROM automod_logs WHERE bot_id = ? AND guild_id = ? GROUP BY rule ORDER BY count DESC, rule ASC LIMIT 10`).all(botId, guildId);
    const byAction = db.prepare(`SELECT COALESCE(NULLIF(action, ''), 'legacy') AS action, COUNT(*) AS count
      FROM automod_logs WHERE bot_id = ? AND guild_id = ? GROUP BY action ORDER BY count DESC, action ASC LIMIT 10`).all(botId, guildId);
    return { total: Number(totals.total) || 0, today: Number(totals.today) || 0, observed: Number(totals.observed) || 0, enforced: Number(totals.enforced) || 0, byRule, byAction };
  },
};

// ---------------------- Tickets ouverts (fiche par salon) ----------------------
const openTickets = {
  add: (botId, guildId, t) => db.prepare(`INSERT INTO open_tickets (bot_id, guild_id, channel_id, number, opener_id, opener_tag, type_label, open_reason, opened_at, last_activity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
    .run(botId, guildId, String(t.channel_id), t.number, String(t.opener_id || '').slice(0, 30), String(t.opener_tag || '').slice(0, 100), String(t.type_label || '').slice(0, 100), String(t.open_reason || '').slice(0, 500)),
  getByChannel: (channelId) => db.prepare('SELECT * FROM open_tickets WHERE channel_id = ?').get(String(channelId)) || null,
  allForGuild: (botId, guildId) => db.prepare('SELECT * FROM open_tickets WHERE bot_id = ? AND guild_id = ? ORDER BY id ASC').all(botId, guildId),
  // Nouvelle activité dans le salon → repousse l'échéance d'inactivité
  touch: (channelId, iso) => db.prepare("UPDATE open_tickets SET last_activity = ?, warned_inactive = 0 WHERE channel_id = ?").run(iso, String(channelId)),
  update: (channelId, fields) => {
    const cols = ['claimed_by', 'claimed_tag', 'claimed_at', 'closed_at', 'warned_inactive'];
    const sets = []; const vals = [];
    for (const c of cols) if (fields[c] !== undefined) { sets.push(`${c} = ?`); vals.push(fields[c]); }
    if (!sets.length) return;
    vals.push(String(channelId));
    db.prepare(`UPDATE open_tickets SET ${sets.join(', ')} WHERE channel_id = ?`).run(...vals);
  },
  remove: (channelId) => db.prepare('DELETE FROM open_tickets WHERE channel_id = ?').run(String(channelId)),
};

// ---------------------- Numérotation des tickets ----------------------
const ticketCounters = {
  next: (botId, guildId) => {
    const row = db.prepare('SELECT next FROM ticket_counters WHERE bot_id = ? AND guild_id = ?').get(botId, guildId);
    if (row) {
      db.prepare('UPDATE ticket_counters SET next = next + 1 WHERE bot_id = ? AND guild_id = ?').run(botId, guildId);
      return row.next;
    }
    db.prepare('INSERT INTO ticket_counters (bot_id, guild_id, next) VALUES (?, ?, 2)').run(botId, guildId);
    return 1;
  },
};

// ---------------------- Notes du support (étoiles) ----------------------
const ticketRatings = {
  add: (botId, guildId, entry) => db.prepare('INSERT INTO ticket_ratings (bot_id, guild_id, number, opener_id, rating) VALUES (?, ?, ?, ?, ?)')
    .run(botId, guildId, entry.number, String(entry.opener_id || '').slice(0, 30), Math.min(Math.max(parseInt(entry.rating, 10) || 1, 1), 5)),
  has: (botId, guildId, number) => !!db.prepare('SELECT 1 FROM ticket_ratings WHERE bot_id = ? AND guild_id = ? AND number = ?').get(botId, guildId, number),
  stats: (botId, guildId) => {
    const r = db.prepare('SELECT COUNT(*) AS count, ROUND(AVG(rating), 1) AS avg FROM ticket_ratings WHERE bot_id = ? AND guild_id = ?').get(botId, guildId);
    return { count: r.count || 0, avg: r.avg || 0 };
  },
};

// ---------------------- Boutique ----------------------
const shop = {
  all: (botId, guildId) => db.prepare('SELECT * FROM shop_items WHERE bot_id = ? AND guild_id = ? ORDER BY price ASC').all(botId, guildId),
  get: (id) => db.prepare('SELECT * FROM shop_items WHERE id = ?').get(id) || null,
  add: (botId, guildId, item) => db.prepare('INSERT INTO shop_items (bot_id, guild_id, name, description, price, role, emoji) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(botId, guildId, String(item.name || '').slice(0, 80), String(item.description || '').slice(0, 200), Math.max(1, parseInt(item.price, 10) || 1), String(item.role || '').slice(0, 100), String(item.emoji || '🛒').slice(0, 10)).lastInsertRowid,
  remove: (id) => db.prepare('DELETE FROM shop_items WHERE id = ?').run(id),
  replace: (botId, guildId, items) => {
    db.prepare('DELETE FROM shop_items WHERE bot_id = ? AND guild_id = ?').run(botId, guildId);
    for (const it of items) if (it && it.name && it.role) shop.add(botId, guildId, it);
  },
};

// ---------------------- Giveaways ----------------------
const giveaways = {
  active: (botId, guildId) => db.prepare('SELECT * FROM giveaways WHERE bot_id = ? AND guild_id = ? AND drawn = 0 ORDER BY ends_at ASC').all(botId, guildId),
  all: (botId, guildId) => db.prepare('SELECT * FROM giveaways WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT 30').all(botId, guildId),
  get: (id) => db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id) || null,
  create: (g) => db.prepare('INSERT INTO giveaways (bot_id, guild_id, channel_id, message_id, prize, winners, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(g.bot_id, g.guild_id, g.channel_id, g.message_id, String(g.prize || '').slice(0, 200), Math.max(1, parseInt(g.winners, 10) || 1), g.ends_at).lastInsertRowid,
  markDrawn: (id) => db.prepare('UPDATE giveaways SET drawn = 1 WHERE id = ?').run(id),
  remove: (id) => db.prepare('DELETE FROM giveaways WHERE id = ?').run(id),
  due: () => db.prepare('SELECT * FROM giveaways WHERE drawn = 0 AND ends_at <= ?').all(Date.now()),
};

// ---------------------- Suggestions ----------------------
const suggestions = {
  all: (botId, guildId) => db.prepare('SELECT * FROM suggestions WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT 100').all(botId, guildId),
  get: (id) => db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id) || null,
  create: (s) => db.prepare('INSERT INTO suggestions (bot_id, guild_id, author_id, text, message_id, channel_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(s.bot_id, s.guild_id, s.author_id, String(s.text || '').slice(0, 1500), s.message_id || '', s.channel_id || '').lastInsertRowid,
  setStatus: (id, status) => db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(['pending', 'approved', 'denied'].includes(status) ? status : 'pending', id),
  remove: (id) => db.prepare('DELETE FROM suggestions WHERE id = ?').run(id),
  vote: (id, authorId, direction) => {
    const row = suggestions.get(id);
    if (!row) return { ok: false };
    let voters = {};
    try { voters = JSON.parse(row.voters || '{}'); } catch {}
    const prev = voters[authorId] || null;
    let up = row.upvotes, down = row.downvotes;
    if (prev === direction) return { ok: true, changed: false, up, down };
    if (prev === 'up') up--;
    if (prev === 'down') down--;
    if (direction === 'up') up++;
    if (direction === 'down') down++;
    voters[authorId] = direction;
    db.prepare('UPDATE suggestions SET upvotes = ?, downvotes = ?, voters = ? WHERE id = ?').run(up, down, JSON.stringify(voters), id);
    return { ok: true, changed: true, up, down };
  },
};

// ---------------------- Rôles temporaires ----------------------
const tempRoles = {
  all: (botId, guildId) => db.prepare('SELECT * FROM temp_roles WHERE bot_id = ? AND guild_id = ? ORDER BY expires_at ASC').all(botId, guildId),
  add: (botId, guildId, userId, role, expiresAt) => db.prepare('INSERT INTO temp_roles (bot_id, guild_id, user_id, role, expires_at) VALUES (?, ?, ?, ?, ?)').run(botId, guildId, userId, String(role).slice(0, 100), expiresAt),
  remove: (id) => db.prepare('DELETE FROM temp_roles WHERE id = ?').run(id),
  due: () => db.prepare('SELECT * FROM temp_roles WHERE expires_at <= ?').all(Date.now()),
};

// ---------------------- Sanctions prédéfinies ----------------------
const sanctions = {
  all: (botId, guildId) => db.prepare('SELECT * FROM sanctions WHERE bot_id = ? AND guild_id = ? ORDER BY name').all(botId, guildId),
  get: (botId, guildId, name) => db.prepare('SELECT * FROM sanctions WHERE bot_id = ? AND guild_id = ? AND name = ?').get(botId, guildId, name) || null,
  add: (botId, guildId, s) => db.prepare('INSERT INTO sanctions (bot_id, guild_id, name, action, duration, message) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(bot_id, guild_id, name) DO UPDATE SET action = excluded.action, duration = excluded.duration, message = excluded.message')
    .run(botId, guildId, String(s.name || '').slice(0, 50), ['warn', 'timeout', 'kick', 'ban'].includes(s.action) ? s.action : 'warn', Math.max(0, parseInt(s.duration, 10) || 0), String(s.message || '').slice(0, 1000)),
  remove: (botId, guildId, name) => db.prepare('DELETE FROM sanctions WHERE bot_id = ? AND guild_id = ? AND name = ?').run(botId, guildId, name),
};

// ---------------------- Stats d'utilisation des commandes ----------------------
const cmdStats = {
  bump: (botId, guildId, command, day) => db.prepare('INSERT INTO cmd_stats (bot_id, guild_id, command, day, count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(bot_id, guild_id, command, day) DO UPDATE SET count = count + 1').run(botId, guildId, String(command).slice(0, 32), day),
  total: (botId, guildId) => db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM cmd_stats WHERE bot_id = ? AND guild_id = ?').get(botId, guildId).n,
  top: (botId, guildId, limit = 12) => db.prepare('SELECT command, SUM(count) AS n FROM cmd_stats WHERE bot_id = ? AND guild_id = ? GROUP BY command ORDER BY n DESC, command ASC LIMIT ?').all(botId, guildId, Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50)),
  perDay: (botId, guildId, days = 7) => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const r = db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM cmd_stats WHERE bot_id = ? AND guild_id = ? AND day = ?').get(botId, guildId, d);
      out.push({ day: d, commands: r.n });
    }
    return out;
  },
};

// ---------------------- Registre des tickets fermés ----------------------
// Source de vérité : un salon listé ici est fermé, même si le cache Discord
// n'est pas encore à jour → la vérification « déjà ouvert » ne se trompe plus.
const closedTickets = {
  add: (channelId, botId, guildId) => db.prepare("INSERT OR REPLACE INTO closed_tickets (channel_id, bot_id, guild_id, closed_at) VALUES (?, ?, ?, datetime('now'))").run(String(channelId), botId, guildId),
  isClosed: (channelId) => !!db.prepare('SELECT 1 FROM closed_tickets WHERE channel_id = ?').get(String(channelId)),
  remove: (channelId) => db.prepare('DELETE FROM closed_tickets WHERE channel_id = ?').run(String(channelId)),
  // Nettoie les entrées dont le salon n'existe plus sur le serveur
  pruneGuild: (guildId, existingIds) => {
    const rows = db.prepare('SELECT channel_id FROM closed_tickets WHERE guild_id = ?').all(guildId);
    const keep = new Set((existingIds || []).map(String));
    const del = db.prepare('DELETE FROM closed_tickets WHERE channel_id = ?');
    for (const r of rows) if (!keep.has(String(r.channel_id))) del.run(r.channel_id);
  },
};

// ---------------------- Transcriptions de tickets ----------------------
const transcripts = {
  add: (t) => db.prepare('INSERT INTO transcripts (token, bot_id, guild_id, channel_name, opener_id, type_label, server_name, messages) VALUES (@token, @bot_id, @guild_id, @channel_name, @opener_id, @type_label, @server_name, @messages)')
    .run({
      token: String(t.token).slice(0, 64),
      bot_id: t.bot_id,
      guild_id: t.guild_id,
      channel_name: String(t.channel_name || '').slice(0, 50),
      opener_id: String(t.opener_id || '').slice(0, 30),
      type_label: String(t.type_label || '').slice(0, 100),
      server_name: String(t.server_name || '').slice(0, 100),
      messages: String(t.messages || '').slice(0, 300000),
    }),
  get: (token) => db.prepare('SELECT * FROM transcripts WHERE token = ?').get(String(token)) || null,
  // Nombre de tickets déjà ouverts par un membre (affiché au staff à l'ouverture)
  countByOpener: (botId, guildId, openerId) => db.prepare('SELECT COUNT(*) AS n FROM transcripts WHERE bot_id = ? AND guild_id = ? AND opener_id = ?').get(botId, guildId, String(openerId)).n,
};

// ---------------------- Mariages (fun & communauté) ----------------------
const marriages = {
  get: (botId, guildId, userId) => db.prepare('SELECT * FROM marriages WHERE bot_id = ? AND guild_id = ? AND (user_a = ? OR user_b = ?)').get(botId, guildId, userId, userId) || null,
  count: (botId, guildId) => db.prepare('SELECT COUNT(*) AS n FROM marriages WHERE bot_id = ? AND guild_id = ?').get(botId, guildId).n,
  set: (botId, guildId, userA, userB) => db.prepare('INSERT INTO marriages (bot_id, guild_id, user_a, user_b, date) VALUES (?, ?, ?, ?, datetime(\'now\'))').run(botId, guildId, userA, userB),
  remove: (botId, guildId, userA, userB) => db.prepare('DELETE FROM marriages WHERE bot_id = ? AND guild_id = ? AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))').run(botId, guildId, userA, userB, userB, userA),
};

// ---------------------- Anniversaires ----------------------
const birthdays = {
  all: (botId, guildId) => db.prepare('SELECT * FROM birthdays WHERE bot_id = ? AND guild_id = ? ORDER BY month, day').all(botId, guildId),
  get: (botId, guildId, userId) => db.prepare('SELECT * FROM birthdays WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, userId) || null,
  set: (botId, guildId, userId, day, month) => db.prepare('INSERT INTO birthdays (bot_id, guild_id, user_id, day, month) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bot_id, guild_id, user_id) DO UPDATE SET day = excluded.day, month = excluded.month').run(botId, guildId, userId, day, month),
  remove: (botId, guildId, userId) => db.prepare('DELETE FROM birthdays WHERE bot_id = ? AND guild_id = ? AND user_id = ?').run(botId, guildId, userId),
  today: (day, month) => db.prepare('SELECT * FROM birthdays WHERE day = ? AND month = ?').all(day, month),
  // Qui a déjà été fêté aujourd'hui (pour éviter les doublons en cas de redémarrage)
  celebrated: {
    get: (key) => settings.get(`bday_done_${key}`),
    set: (key) => settings.set(`bday_done_${key}`, new Date().toISOString().slice(0, 10)),
    isNewDay: (key) => (settings.get(`bday_done_${key}`) || '') !== new Date().toISOString().slice(0, 10),
  },
};

// ---------------------- Rappels ----------------------
const reminders = {
  all: () => db.prepare('SELECT * FROM reminders ORDER BY at_ts ASC').all(),
  add: (botId, guildId, channelId, userId, atTs, text) => db.prepare('INSERT INTO reminders (bot_id, guild_id, channel_id, user_id, at_ts, text) VALUES (?, ?, ?, ?, ?, ?)').run(botId, guildId, channelId, userId, atTs, text),
  due: (nowTs) => db.prepare('SELECT * FROM reminders WHERE at_ts <= ? ORDER BY at_ts ASC LIMIT 50').all(nowTs),
  remove: (id) => db.prepare('DELETE FROM reminders WHERE id = ?').run(id),
  userList: (userId) => db.prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY at_ts ASC LIMIT 10').all(userId),
  userCount: (userId) => db.prepare('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?').get(userId).n,
};

// ---------------------- Messages programmés ----------------------
const scheduled = {
  all: (botId, guildId) => db.prepare('SELECT * FROM scheduled_messages WHERE bot_id = ? AND guild_id = ? ORDER BY hour, minute').all(botId, guildId),
  get: (id) => db.prepare('SELECT * FROM scheduled_messages WHERE id = ?').get(id) || null,
  add: (botId, guildId, s) => db.prepare('INSERT INTO scheduled_messages (bot_id, guild_id, channel_id, hour, minute, days, text, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)').run(botId, guildId, String(s.channel_id || ''), parseInt(s.hour, 10) || 0, parseInt(s.minute, 10) || 0, String(s.days || '1,2,3,4,5,6,7'), String(s.text || '').slice(0, 1900)).lastInsertRowid,
  update: (id, fields) => {
    const allowed = { channel_id: 'channel_id', hour: 'hour', minute: 'minute', days: 'days', text: 'text', enabled: 'enabled', last_sent: 'last_sent' };
    const sets = [], vals = [];
    for (const [k, col] of Object.entries(allowed)) if (k in fields) { sets.push(`${col} = ?`); vals.push(fields[k]); }
    if (!sets.length) return;
    vals.push(id);
    db.prepare(`UPDATE scheduled_messages SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  },
  remove: (id) => db.prepare('DELETE FROM scheduled_messages WHERE id = ?').run(id),
  allEnabled: () => db.prepare('SELECT * FROM scheduled_messages WHERE enabled = 1').all(),
};

// ---------------------- 📣 Annonce personnalisée immédiate ----------------------
function jsonArray(value, max, maxLength) {
  let list = value;
  if (typeof list === 'string') {
    try { list = JSON.parse(list || '[]'); } catch { list = list.split(/[,\n]/); }
  }
  if (!Array.isArray(list)) list = [];
  return [...new Set(list.map((x) => String(x || '').trim().slice(0, maxLength)).filter(Boolean))].slice(0, max);
}

const customAnnouncements = {
  get: (botId, guildId) => {
    const row = db.prepare('SELECT * FROM custom_announcements WHERE bot_id = ? AND guild_id = ?').get(botId, guildId);
    if (!row) return null;
    let channels = []; let pingRoles = [];
    try { channels = JSON.parse(row.channels || '[]'); } catch {}
    try { pingRoles = JSON.parse(row.ping_roles || '[]'); } catch {}
    return { ...row, channels: Array.isArray(channels) ? channels : [], ping_roles: Array.isArray(pingRoles) ? pingRoles : [] };
  },
  set: (botId, guildId, cfg = {}) => db.prepare(`INSERT INTO custom_announcements
    (bot_id, guild_id, name, title, message, color, image_url, footer, channels, ping_roles, updated_at)
    VALUES (@bot_id, @guild_id, @name, @title, @message, @color, @image_url, @footer, @channels, @ping_roles, datetime('now'))
    ON CONFLICT(bot_id, guild_id) DO UPDATE SET
      name = excluded.name, title = excluded.title, message = excluded.message,
      color = excluded.color, image_url = excluded.image_url, footer = excluded.footer,
      channels = excluded.channels, ping_roles = excluded.ping_roles, updated_at = datetime('now')`).run({
        bot_id: botId, guild_id: guildId,
        name: String(cfg.name || 'Annonce personnalisée').trim().slice(0, 80),
        title: String(cfg.title || '').trim().slice(0, 256),
        message: String(cfg.message || '').slice(0, 4000),
        color: /^#[0-9a-fA-F]{6}$/.test(String(cfg.color || '')) ? String(cfg.color) : '#5865F2',
        image_url: /^https:\/\//i.test(String(cfg.image_url || '').trim()) ? String(cfg.image_url).trim().slice(0, 500) : '',
        footer: String(cfg.footer || '').trim().slice(0, 200),
        channels: JSON.stringify(jsonArray(cfg.channels, 20, 100)),
        ping_roles: JSON.stringify(jsonArray(cfg.ping_roles, 10, 100)),
      }),
};

// ---------------------- Statistiques d'activité ----------------------
const msgStats = {
  bump: (botId, guildId, userId, day) => db.prepare('INSERT INTO message_stats (bot_id, guild_id, user_id, day, count) VALUES (?, ?, ?, ?, 1) ON CONFLICT(bot_id, guild_id, user_id, day) DO UPDATE SET count = count + 1').run(botId, guildId, userId, day),
  perDay: (botId, guildId, days) => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const r = db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM message_stats WHERE bot_id = ? AND guild_id = ? AND day = ?').get(botId, guildId, d);
      out.push({ day: d, messages: r.n });
    }
    return out;
  },
  topUsers: (botId, guildId, days) => {
    const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    return db.prepare('SELECT user_id, SUM(count) AS n FROM message_stats WHERE bot_id = ? AND guild_id = ? AND day >= ? GROUP BY user_id ORDER BY n DESC LIMIT 10').all(botId, guildId, since);
  },
};

const joinStats = {
  bump: (botId, guildId, day) => db.prepare('INSERT INTO join_stats (bot_id, guild_id, day, count) VALUES (?, ?, ?, 1) ON CONFLICT(bot_id, guild_id, day) DO UPDATE SET count = count + 1').run(botId, guildId, day),
  perDay: (botId, guildId, days) => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const r = db.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM join_stats WHERE bot_id = ? AND guild_id = ? AND day = ?').get(botId, guildId, d);
      out.push({ day: d, members: r.n });
    }
    return out;
  },
};

// ---------------------- Historique d'achats boutique ----------------------
const shopPurchases = {
  add: (botId, guildId, userId, item, price) => db.prepare('INSERT INTO shop_purchases (bot_id, guild_id, user_id, item, price) VALUES (?, ?, ?, ?, ?)').run(botId, guildId, userId, item, price),
  last: (botId, guildId, limit = 10) => db.prepare('SELECT * FROM shop_purchases WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT ?').all(botId, guildId, limit),
};

// ---------------------- Embed Builder (modèles sauvegardés) ----------------------
const embedTemplates = {
  list: (botId, guildId) => db.prepare('SELECT id, name, payload, created_at FROM embed_templates WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC').all(botId, guildId),
  add: (botId, guildId, name, payload) => db.prepare('INSERT INTO embed_templates (bot_id, guild_id, name, payload) VALUES (?, ?, ?, ?)').run(botId, guildId, String(name || 'Modèle').slice(0, 80), JSON.stringify(payload || {})),
  remove: (id, botId, guildId) => db.prepare('DELETE FROM embed_templates WHERE id = ? AND bot_id = ? AND guild_id = ?').run(id, botId, guildId),
};

// ---------------------- Candidatures (applications) ----------------------
const applications = {
  get: (botId, guildId) => db.prepare('SELECT * FROM applications WHERE bot_id = ? AND guild_id = ?').get(botId, guildId) || null,
  set: (botId, guildId, cfg) => db.prepare('INSERT INTO applications (bot_id, guild_id, channel, questions, title, enabled) VALUES (@bot_id, @guild_id, @channel, @questions, @title, @enabled) ON CONFLICT(bot_id, guild_id) DO UPDATE SET channel = excluded.channel, questions = excluded.questions, title = excluded.title, enabled = excluded.enabled').run({
    bot_id: botId, guild_id: guildId, channel: '', title: '📝 Candidature', enabled: 0, ...cfg,
    questions: typeof cfg.questions === 'string' ? cfg.questions : JSON.stringify(Array.isArray(cfg.questions) ? cfg.questions : []),
  }),
};

// ---------------------- Salons vocaux temporaires ----------------------
const voicetemp = {
  get: (botId, guildId) => db.prepare('SELECT * FROM voicetemp WHERE bot_id = ? AND guild_id = ?').get(botId, guildId) || null,
  set: (botId, guildId, cfg) => db.prepare('INSERT INTO voicetemp (bot_id, guild_id, creator_channel, category, name_template) VALUES (@bot_id, @guild_id, @creator_channel, @category, @name_template) ON CONFLICT(bot_id, guild_id) DO UPDATE SET creator_channel = excluded.creator_channel, category = excluded.category, name_template = excluded.name_template').run({ bot_id: botId, guild_id: guildId, creator_channel: '', category: '', name_template: '', ...cfg }),
  remove: (botId, guildId) => db.prepare('DELETE FROM voicetemp WHERE bot_id = ? AND guild_id = ?').run(botId, guildId),
};

// ---------------------- ⭐ Starboard ----------------------
const starboard = {
  get: (botId, guildId, messageId) => db.prepare('SELECT * FROM starboard_posts WHERE bot_id = ? AND guild_id = ? AND message_id = ?').get(botId, guildId, String(messageId)) || null,
  set: (botId, guildId, messageId, starMessageId, stars) => db.prepare('INSERT INTO starboard_posts (bot_id, guild_id, message_id, star_message_id, stars) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bot_id, guild_id, message_id) DO UPDATE SET star_message_id = excluded.star_message_id, stars = excluded.stars').run(botId, guildId, String(messageId), String(starMessageId), parseInt(stars, 10) || 0),
  remove: (botId, guildId, messageId) => db.prepare('DELETE FROM starboard_posts WHERE bot_id = ? AND guild_id = ? AND message_id = ?').run(botId, guildId, String(messageId)),
  count: (botId, guildId) => db.prepare('SELECT COUNT(*) AS n FROM starboard_posts WHERE bot_id = ? AND guild_id = ?').get(botId, guildId).n,
};

// ---------------------- 📨 Invitations ----------------------
const inviteUses = {
  all: (botId, guildId) => db.prepare('SELECT * FROM invite_uses WHERE bot_id = ? AND guild_id = ?').all(botId, guildId),
  replaceAll: (botId, guildId, rows) => {
    const del = db.prepare('DELETE FROM invite_uses WHERE bot_id = ? AND guild_id = ?');
    const ins = db.prepare('INSERT INTO invite_uses (bot_id, guild_id, code, uses, inviter_id) VALUES (?, ?, ?, ?, ?)');
    const tx = db.transaction(() => {
      del.run(botId, guildId);
      for (const r of (rows || [])) ins.run(botId, guildId, String(r.code), parseInt(r.uses, 10) || 0, String(r.inviter_id || ''));
    });
    tx();
  },
};
const inviteJoins = {
  add: (botId, guildId, userId, inviterId, code) => db.prepare('INSERT INTO invite_joins (bot_id, guild_id, user_id, inviter_id, code) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bot_id, guild_id, user_id) DO UPDATE SET inviter_id = excluded.inviter_id, code = excluded.code').run(botId, guildId, String(userId), String(inviterId), String(code || '')),
  countBy: (botId, guildId, inviterId) => db.prepare('SELECT COUNT(*) AS n FROM invite_joins WHERE bot_id = ? AND guild_id = ? AND inviter_id = ?').get(botId, guildId, String(inviterId)).n,
  top: (botId, guildId, limit = 10) => db.prepare('SELECT inviter_id, COUNT(*) AS n FROM invite_joins WHERE bot_id = ? AND guild_id = ? GROUP BY inviter_id ORDER BY n DESC LIMIT ?').all(botId, guildId, Math.min(Math.max(parseInt(limit, 10) || 10, 1), 30)),
  whoInvited: (botId, guildId, userId) => db.prepare('SELECT * FROM invite_joins WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, String(userId)) || null,
};

// v2.3 — 📔 Journal des tickets (récap staff à la fermeture)
try { db.exec("ALTER TABLE guild_settings ADD COLUMN ticket_log_channel TEXT DEFAULT ''"); } catch (e) {}
// v3.5 — panneau MENU déroulant indépendant du panneau BOUTON
try { db.exec("ALTER TABLE tickets ADD COLUMN menu_channel TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN menu_message TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN menu_category TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE open_tickets ADD COLUMN open_reason TEXT DEFAULT ''"); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS ticket_log_msgs (
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL, number INTEGER NOT NULL,
  channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (bot_id, guild_id, number))`); } catch (e) {}

// v3.14 — 🎨 Système de tickets personnalisés indépendant de l'ancien.
try { db.exec(`CREATE TABLE IF NOT EXISTS advanced_ticket_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL,
  name TEXT DEFAULT 'Créer un ticket',
  mode TEXT DEFAULT 'buttons',
  channel TEXT DEFAULT '', message TEXT DEFAULT '', image_url TEXT DEFAULT '',
  require_reason INTEGER DEFAULT 1,
  types TEXT DEFAULT '[]',
  panel_message_id TEXT DEFAULT '', panel_channel TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (bot_id, guild_id)
)`); } catch (e) {}
try { db.exec(`CREATE TABLE IF NOT EXISTS advanced_ticket_channels (
  channel_id TEXT PRIMARY KEY,
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL,
  panel_id INTEGER NOT NULL, type_id TEXT DEFAULT '', type_label TEXT DEFAULT '',
  staff_roles TEXT DEFAULT '[]', color TEXT DEFAULT '#5865F2',
  created_at TEXT DEFAULT (datetime('now'))
)`); } catch (e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_advanced_ticket_channels_guild ON advanced_ticket_channels (bot_id, guild_id)"); } catch (e) {}
try { db.exec("ALTER TABLE advanced_ticket_panels ADD COLUMN image_url TEXT DEFAULT ''"); } catch (e) {}

// v2.7 — 📰 Flux d'activité du serveur (dashboard)
try { db.exec(`CREATE TABLE IF NOT EXISTS embed_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Modèle',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`); } catch (e) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL, guild_id TEXT NOT NULL,
  emoji TEXT DEFAULT '', text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_activity_guild ON activity (bot_id, guild_id, id)`); } catch (e) {}

// ---------------------- 📰 Flux d'activité ----------------------
// Chaque action marquante du bot laisse une trace lisible pour le dashboard.
// Rétention : 200 entrées par serveur (purge automatique à l'insertion).
const activity = {
  add: (botId, guildId, emoji, text) => {
    try {
      db.prepare('INSERT INTO activity (bot_id, guild_id, emoji, text) VALUES (?, ?, ?, ?)')
        .run(botId, String(guildId), String(emoji || '').slice(0, 8), String(text || '').slice(0, 300));
      db.prepare(`DELETE FROM activity WHERE bot_id = ? AND guild_id = ? AND id NOT IN (
        SELECT id FROM activity WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT 200)`)
        .run(botId, String(guildId), botId, String(guildId));
    } catch { /* le flux ne doit JAMAIS casser une action réelle */ }
  },
  recent: (botId, guildId, limit = 30) => db.prepare('SELECT emoji, text, created_at FROM activity WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT ?').all(botId, String(guildId), Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100)),
};

// ---------------------- 📔 Journal des tickets ----------------------
const ticketLogMsgs = {
  set: (botId, guildId, number, channelId, messageId) => db.prepare('INSERT INTO ticket_log_msgs (bot_id, guild_id, number, channel_id, message_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bot_id, guild_id, number) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id').run(botId, guildId, number, String(channelId), String(messageId)),
  get: (botId, guildId, number) => db.prepare('SELECT * FROM ticket_log_msgs WHERE bot_id = ? AND guild_id = ? AND number = ?').get(botId, guildId, number) || null,
  remove: (botId, guildId, number) => db.prepare('DELETE FROM ticket_log_msgs WHERE bot_id = ? AND guild_id = ? AND number = ?').run(botId, guildId, number),
};

// ---------------------- 🔴 Annonces de live ----------------------
const liveSocials = {
  all: (botId, guildId) => db.prepare('SELECT * FROM live_socials WHERE bot_id = ? AND guild_id = ? ORDER BY id').all(botId, guildId),
  add: (botId, guildId, userId, platform, handle) => db.prepare('INSERT INTO live_socials (bot_id, guild_id, user_id, platform, handle) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bot_id, guild_id, platform, handle) DO UPDATE SET user_id = excluded.user_id').run(botId, guildId, String(userId || ''), String(platform), String(handle).slice(0, 60)),
  remove: (botId, guildId, id) => db.prepare('DELETE FROM live_socials WHERE bot_id = ? AND guild_id = ? AND id = ?').run(botId, guildId, id),
  // Compatibilité avec l'ancien code/tests : les nouveaux champs ont des
  // valeurs sûres lorsqu'un appel ne fournit que le statut et la date.
  setStatus: (botId, guildId, id, status, announceTs, liveKey = '', offlineStreak = 0, checkedAt = Date.now(), error = '') => db.prepare(`UPDATE live_socials
    SET last_status = ?, last_announce_ts = ?, live_key = ?, offline_streak = ?, last_checked_at = ?, last_error = ?
    WHERE bot_id = ? AND guild_id = ? AND id = ?`).run(
      String(status || 'off'), parseInt(announceTs, 10) || 0,
      String(liveKey || '').slice(0, 200), Math.max(parseInt(offlineStreak, 10) || 0, 0),
      parseInt(checkedAt, 10) || Date.now(), String(error || '').slice(0, 300), botId, guildId, id),
  saveState: (botId, guildId, id, state = {}) => db.prepare(`UPDATE live_socials
    SET last_status = ?, last_announce_ts = ?, live_key = ?, offline_streak = ?, last_checked_at = ?, last_error = ?
    WHERE bot_id = ? AND guild_id = ? AND id = ?`).run(
      String(state.status || 'off'), parseInt(state.announceTs, 10) || 0,
      String(state.liveKey || '').slice(0, 200), Math.max(parseInt(state.offlineStreak, 10) || 0, 0),
      parseInt(state.lastCheckedAt, 10) || Date.now(), String(state.lastError || '').slice(0, 300), botId, guildId, id),
  count: (botId, guildId) => db.prepare('SELECT COUNT(*) AS n FROM live_socials WHERE bot_id = ? AND guild_id = ?').get(botId, guildId).n,
};

module.exports = { db, embedTemplates, users, platformBans, platformAudit, sessions, bots, commands, modules, events, economy, warnings, automodWarningMessages, roleMenus, tickets, advancedTickets, settings, discordTokens, guildSettings, xp, xpRoles, transcripts, closedTickets, botProfiles, blacklist, memberBlacklist, memberBlacklistCounters, nativeAutomodRules, automodLogs, openTickets, ticketCounters, ticketRatings, cmdStats, shop, giveaways, suggestions, tempRoles, sanctions, marriages, birthdays, reminders, scheduled, customAnnouncements, msgStats, joinStats, shopPurchases, applications, voicetemp, starboard, inviteUses, inviteJoins, liveSocials, ticketLogMsgs, activity, migrateLogCategories };
