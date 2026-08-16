// ============================================================
// BotDev - Base de données (SQLite via better-sqlite3)
// ============================================================
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const db = new Database(process.env.BOTDEV_DATA_DIR ? path.join(process.env.BOTDEV_DATA_DIR, 'botdev.db') : path.join(__dirname, '..', 'botdev.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  event_type TEXT NOT NULL,           -- member_join | member_leave | autorole
  enabled INTEGER DEFAULT 0,
  config TEXT DEFAULT '{}',
  PRIMARY KEY (bot_id, event_type)
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
`);

// ---------------------- Utilisateurs & sessions ----------------------
const users = {
  findByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim()),
  findById: (id) => db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(id),
  create: (email, hash) => {
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
    return r.lastInsertRowid;
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

// ---------------------- Événements ----------------------
const events = {
  all: (botId) => {
    const rows = db.prepare('SELECT * FROM events WHERE bot_id = ?').all(botId);
    const out = {};
    rows.forEach(r => out[r.event_type] = { enabled: !!r.enabled, config: JSON.parse(r.config || '{}') });
    return out;
  },
  set: (botId, type, enabled, config) => db.prepare('INSERT INTO events (bot_id, event_type, enabled, config) VALUES (?, ?, ?, ?) ON CONFLICT(bot_id, event_type) DO UPDATE SET enabled = excluded.enabled, config = excluded.config')
    .run(botId, type, enabled ? 1 : 0, JSON.stringify(config || {})),
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

module.exports = { db, users, sessions, bots, commands, modules, events, economy, warnings };
