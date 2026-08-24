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
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_warn_text TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE guild_settings ADD COLUMN am_timeout_min INTEGER DEFAULT 5"); } catch (e) {}
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
    const cols = ['prefix', 'warn_limit', 'warn_action', 'warn_timeout_limit', 'warn_timeout_min', 'starboard_channel', 'starboard_min', 'live_channel', 'live_ping', 'ticket_log_channel', 'xp_enabled', 'xp_min', 'xp_max', 'xp_cooldown', 'xp_message', 'xp_channel', 'am_enabled', 'am_links', 'am_caps', 'am_mentions', 'am_spam', 'am_ignore_staff', 'am_warn_text', 'am_timeout_min', 'antiraid_enabled', 'antiraid_threshold', 'antiraid_window', 'antiraid_action', 'antiraid_unlock_min', 'log_channel', 'suggestion_channel', 'log_events', 'birthday_channel', 'birthday_role', 'lockdown_channels', 'voicetemp_channel', 'voicetemp_category', 'voicetemp_name', 'panel_name', 'lang', 'timezone'];
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
      am_warn_text: String(next.am_warn_text || '').slice(0, 1000),
      am_timeout_min: Math.min(Math.max(parseInt(next.am_timeout_min, 10) || 5, 1), 1440),
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
  add: (botId, guildId, userId, reason, modId) => db.prepare('INSERT INTO warnings (bot_id, guild_id, user_id, reason, mod_id) VALUES (?, ?, ?, ?, ?)').run(botId, guildId, userId, reason, modId),
  list: (botId, guildId, userId) => db.prepare('SELECT * FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 10').all(botId, guildId, userId),
  count: (botId, guildId, userId) => db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE bot_id = ? AND guild_id = ? AND user_id = ?').get(botId, guildId, userId).n,
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

// ---------------------- Journal d'auto-modération ----------------------
const automodLogs = {
  add: (botId, guildId, entry) => db.prepare('INSERT INTO automod_logs (bot_id, guild_id, user_id, user_tag, reason, content, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(botId, guildId,
      String(entry.user_id || '').slice(0, 30),
      String(entry.user_tag || '').slice(0, 100),
      String(entry.reason || '').slice(0, 200),
      String(entry.content || '').slice(0, 500),
      String(entry.channel_id || '').slice(0, 30)),
  recent: (botId, guildId, limit = 50) => db.prepare('SELECT * FROM automod_logs WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC LIMIT ?').all(botId, guildId, Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)),
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

// v2.7 — 📰 Flux d'activité du serveur (dashboard)
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
  setStatus: (botId, guildId, id, status, announceTs) => db.prepare('UPDATE live_socials SET last_status = ?, last_announce_ts = ? WHERE bot_id = ? AND guild_id = ? AND id = ?').run(String(status), parseInt(announceTs, 10) || 0, botId, guildId, id),
  count: (botId, guildId) => db.prepare('SELECT COUNT(*) AS n FROM live_socials WHERE bot_id = ? AND guild_id = ?').get(botId, guildId).n,
};

module.exports = { db, users, sessions, bots, commands, modules, events, economy, warnings, roleMenus, tickets, settings, discordTokens, guildSettings, xp, xpRoles, transcripts, closedTickets, botProfiles, blacklist, automodLogs, openTickets, ticketCounters, ticketRatings, cmdStats, shop, giveaways, suggestions, tempRoles, sanctions, marriages, birthdays, reminders, scheduled, msgStats, joinStats, shopPurchases, applications, voicetemp, starboard, inviteUses, inviteJoins, liveSocials, ticketLogMsgs, activity, migrateLogCategories };
