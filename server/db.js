// ============================================================
// BotDev - Base de données (SQLite via better-sqlite3)
// ============================================================
const Database = require('better-sqlite3');
const crypto = require('crypto');
const paths = require('./paths');

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
  support_role TEXT DEFAULT '',
  category TEXT DEFAULT 'Tickets',
  types TEXT DEFAULT '[]',
  PRIMARY KEY (bot_id, guild_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
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
`);

// Migrations légères (les colonnes ajoutées après coup)
try { db.exec("ALTER TABLE tickets ADD COLUMN name TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN types TEXT DEFAULT '[]'"); } catch (e) {}
try { db.exec("ALTER TABLE role_menus ADD COLUMN guild_id TEXT DEFAULT ''"); } catch (e) {}

// Migrations : colonnes Discord (OAuth2)
try { db.exec("ALTER TABLE users ADD COLUMN discord_id TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN discord_username TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN discord_avatar TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN discord_guilds TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord ON users(discord_id) WHERE discord_id != ''"); } catch (e) {}

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
    db.prepare(`INSERT INTO guild_settings (bot_id, guild_id, prefix, warn_limit, warn_action, xp_enabled, xp_min, xp_max, xp_cooldown, xp_message, xp_channel, am_enabled, am_links, am_caps, am_mentions, am_spam)
      VALUES (@bot_id, @guild_id, @prefix, @warn_limit, @warn_action, @xp_enabled, @xp_min, @xp_max, @xp_cooldown, @xp_message, @xp_channel, @am_enabled, @am_links, @am_caps, @am_mentions, @am_spam)
      ON CONFLICT(bot_id, guild_id) DO UPDATE SET prefix = excluded.prefix, warn_limit = excluded.warn_limit, warn_action = excluded.warn_action,
        xp_enabled = excluded.xp_enabled, xp_min = excluded.xp_min, xp_max = excluded.xp_max, xp_cooldown = excluded.xp_cooldown,
        xp_message = excluded.xp_message, xp_channel = excluded.xp_channel, am_enabled = excluded.am_enabled,
        am_links = excluded.am_links, am_caps = excluded.am_caps, am_mentions = excluded.am_mentions, am_spam = excluded.am_spam`)
      .run({
        bot_id: botId, guild_id: guildId,
        prefix: String(next.prefix || '').slice(0, 5),
        warn_limit: next.warn_limit || 0,
        warn_action: ['none', 'kick', 'ban'].includes(next.warn_action) ? next.warn_action : 'none',
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
      });
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
const roleMenus = {
  all: (botId, guildId) => db.prepare('SELECT * FROM role_menus WHERE bot_id = ? AND guild_id = ? ORDER BY id DESC').all(botId, guildId)
    .map(m => ({ ...m, options: JSON.parse(m.options || '[]') })),
  get: (id) => {
    const r = db.prepare('SELECT * FROM role_menus WHERE id = ?').get(id);
    return r ? { ...r, options: JSON.parse(r.options || '[]') } : null;
  },
  create: (data) => db.prepare('INSERT INTO role_menus (bot_id, guild_id, name, content, placeholder, channel, options) VALUES (@bot_id, @guild_id, @name, @content, @placeholder, @channel, @options)').run(data).lastInsertRowid,
  update: (id, fields) => {
    const allowed = ['name', 'content', 'placeholder', 'channel', 'options'];
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
    return db.prepare(`INSERT INTO tickets (bot_id, guild_id, name, channel, message, button_label, support_role, category, types)
      VALUES (@bot_id, @guild_id, @name, @channel, @message, @button_label, @support_role, @category, @types)
      ON CONFLICT(bot_id, guild_id) DO UPDATE SET
        name = excluded.name,
        channel = excluded.channel,
        message = excluded.message,
        button_label = excluded.button_label,
        support_role = excluded.support_role,
        category = excluded.category,
        types = excluded.types`).run({ bot_id: botId, guild_id: guildId, name: '', ...cfg, types });
  },
};

// ---------------------- Réglages généraux (clé/valeur) ----------------------
const settings = {
  get: (key) => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : '';
  },
  set: (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value)),
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
};

module.exports = { db, users, sessions, bots, commands, modules, events, economy, warnings, roleMenus, tickets, settings, discordTokens, guildSettings, xp, xpRoles, transcripts, closedTickets };
