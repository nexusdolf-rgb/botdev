// ============================================================
// BotDev - Routes API
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('./db');
const botManager = require('./discord/botManager');
const { MODULES, CMD_DEFS, enabledModules, enabledCommandNames } = require('./discord/premade');
const { EVENT_DEFS, eventsState } = require('./discord/events');

const router = express.Router();
const COOKIE = 'botdev_session';

// ---------------------- Auth ----------------------
async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Non connecté' });
  const session = store.sessions.find(token);
  if (!session || new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'Session expirée' });
  req.userId = session.user_id;
  next();
}

router.post('/auth/register', (req, res) => {
  if (process.env.REGISTRATION_CLOSED === '1') {
    return res.status(403).json({ error: 'Les inscriptions sont fermées. Contacte l\'administrateur.' });
  }
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum' });
  const normalized = String(email).toLowerCase().trim();
  if (store.users.findByEmail(normalized)) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  const hash = bcrypt.hashSync(String(password), 10);
  const userId = store.users.create(normalized, hash);
  const token = store.sessions.create(userId);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000 });
  res.json({ ok: true });
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = email && store.users.findByEmail(email);
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  const token = store.sessions.create(user.id);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000 });
  res.json({ ok: true });
});

router.post('/auth/logout', (req, res) => {
  const token = req.cookies[COOKIE];
  if (token) store.sessions.destroy(token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const user = store.users.findById(req.userId);
  res.json({ user });
});

// ---------------------- Helpers bot ----------------------
function getOwnBot(req, res) {
  const bot = store.bots.get(Number(req.params.id));
  if (!bot || bot.user_id !== req.userId) {
    res.status(404).json({ error: 'Bot introuvable' });
    return null;
  }
  return bot;
}

function botDetail(bot) {
  const entry = botManager.clients.get(bot.id);
  const online = botManager.isOnline(bot.id);
  let guilds = [];
  if (entry && online) {
    guilds = [...entry.client.guilds.cache.values()].map(g => ({
      id: g.id, name: g.name, icon: g.iconURL({ size: 64 }) || null, members: g.memberCount,
    }));
  }
  return {
    ...bot,
    online,
    guilds,
    commands_count: store.commands.all(bot.id).length,
    modules: store.modules.all(bot.id),
    events: eventsState(bot.id),
    invite_url: bot.client_id ? `https://discord.com/oauth2/authorize?client_id=${bot.client_id}&permissions=8&scope=bot%20applications.commands` : '',
  };
}

// ---------------------- Bots ----------------------
router.get('/bots', requireAuth, (req, res) => {
  const bots = store.bots.all(req.userId).map(botDetail);
  res.json({ bots });
});

router.post('/bots', requireAuth, (req, res) => {
  const { name, token, client_id, prefix } = req.body || {};
  if (!name || !token) return res.status(400).json({ error: 'Nom et token requis' });
  const id = store.bots.create({
    user_id: req.userId,
    name: String(name).slice(0, 32),
    token: String(token).trim(),
    client_id: String(client_id || '').trim(),
    prefix: String(prefix || '!').slice(0, 5),
  });
  // Les modules sont activés par défaut : le bot fonctionne immédiatement
  Object.keys(MODULES).forEach(key => store.modules.set(id, key, true));
  res.json({ id });
});

router.get('/bots/:id', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  res.json({ bot: botDetail(bot) });
});

router.patch('/bots/:id', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const { name, prefix, status_text, status_type, token, client_id } = req.body || {};
  const fields = {};
  if (name !== undefined) fields.name = String(name).slice(0, 32);
  if (prefix !== undefined) fields.prefix = String(prefix).slice(0, 5);
  if (status_text !== undefined) fields.status_text = String(status_text).slice(0, 128);
  if (status_type !== undefined) fields.status_type = ['online', 'idle', 'dnd', 'invisible'].includes(status_type) ? status_type : 'online';
  if (token !== undefined && String(token).trim()) fields.token = String(token).trim();
  if (client_id !== undefined) fields.client_id = String(client_id).trim();
  store.bots.update(bot.id, fields);
  botManager.applyPresence(store.bots.get(bot.id));
  res.json({ ok: true });
});

router.delete('/bots/:id', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  await botManager.logoutBot(bot.id);
  store.commands.removeAll(bot.id);
  store.bots.remove(bot.id);
  res.json({ ok: true });
});

router.post('/bots/:id/start', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  try {
    const r = await botManager.loginBot(bot.id);
    res.json({ ok: true, already: r.already });
  } catch (err) {
    res.status(400).json({ error: friendlyErr(err) });
  }
});

router.post('/bots/:id/stop', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  await botManager.logoutBot(bot.id);
  res.json({ ok: true });
});

function friendlyErr(err) {
  const msg = String(err.message || err);
  if (msg.toLowerCase().includes('token') || msg.toLowerCase().includes('invalid')) return 'Token invalide. Vérifie-le dans le portail développeur Discord.';
  if (msg.includes('intents')) return 'Active les intents "MESSAGE CONTENT" et "SERVER MEMBERS" dans le portail développeur Discord.';
  return msg.slice(0, 300);
}

// ---------------------- Commandes ----------------------
router.get('/bots/:id/commands', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  res.json({ commands: store.commands.all(bot.id) });
});

router.post('/bots/:id/commands', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const { name, description, trigger_type, trigger_value, options, blocks, cooldown, enabled, sort } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const id = store.commands.create({
    bot_id: bot.id,
    name: String(name).slice(0, 32),
    description: String(description || '').slice(0, 100),
    trigger_type: ['prefix', 'slash', 'keyword', 'button'].includes(trigger_type) ? trigger_type : 'prefix',
    trigger_value: String(trigger_value || '').slice(0, 100),
    options: JSON.stringify(Array.isArray(options) ? options : []),
    blocks: JSON.stringify(Array.isArray(blocks) ? blocks : []),
    cooldown: Math.max(0, parseInt(cooldown, 10) || 0),
    enabled: enabled === undefined ? 1 : (enabled ? 1 : 0),
    sort: parseInt(sort, 10) || 0,
  });
  await resyncSlash(bot);
  res.json({ id });
});

router.patch('/commands/:id', requireAuth, async (req, res) => {
  const cmd = store.commands.get(Number(req.params.id));
  if (!cmd) return res.status(404).json({ error: 'Commande introuvable' });
  const bot = store.bots.get(cmd.bot_id);
  if (!bot || bot.user_id !== req.userId) return res.status(404).json({ error: 'Commande introuvable' });
  const fields = {};
  const { name, description, trigger_type, trigger_value, options, blocks, cooldown, enabled, sort } = req.body || {};
  if (name !== undefined) fields.name = String(name).slice(0, 32);
  if (description !== undefined) fields.description = String(description).slice(0, 100);
  if (trigger_type !== undefined) fields.trigger_type = ['prefix', 'slash', 'keyword', 'button'].includes(trigger_type) ? trigger_type : 'prefix';
  if (trigger_value !== undefined) fields.trigger_value = String(trigger_value).slice(0, 100);
  if (options !== undefined) fields.options = JSON.stringify(Array.isArray(options) ? options : []);
  if (blocks !== undefined) fields.blocks = JSON.stringify(Array.isArray(blocks) ? blocks : []);
  if (cooldown !== undefined) fields.cooldown = Math.max(0, parseInt(cooldown, 10) || 0);
  if (enabled !== undefined) fields.enabled = enabled ? 1 : 0;
  if (sort !== undefined) fields.sort = parseInt(sort, 10) || 0;
  store.commands.update(cmd.id, fields);
  await resyncSlash(bot);
  res.json({ ok: true });
});

router.delete('/commands/:id', requireAuth, async (req, res) => {
  const cmd = store.commands.get(Number(req.params.id));
  if (!cmd) return res.status(404).json({ error: 'Commande introuvable' });
  const bot = store.bots.get(cmd.bot_id);
  if (!bot || bot.user_id !== req.userId) return res.status(404).json({ error: 'Commande introuvable' });
  store.commands.remove(cmd.id);
  await resyncSlash(bot);
  res.json({ ok: true });
});

async function resyncSlash(bot) {
  if (!botManager.isOnline(bot.id)) return;
  const entry = botManager.clients.get(bot.id);
  if (!entry) return;
  await Promise.all([...entry.client.guilds.cache.values()].map(g => botManager.syncSlashCommands(bot.id, g.id).catch(() => {})));
}

// ---------------------- Modules ----------------------
router.get('/bots/:id/modules', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const state = store.modules.all(bot.id);
  res.json({
    modules: Object.keys(MODULES).map(key => ({
      key,
      ...MODULES[key],
      enabled: !!state[key],
      commands: MODULES[key].commands.map(c => {
        const { perms, ...rest } = CMD_DEFS[c];
        return { name: c, ...rest };
      }),
    })),
  });
});

router.put('/bots/:id/modules/:key', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  if (!MODULES[req.params.key]) return res.status(404).json({ error: 'Module introuvable' });
  store.modules.set(bot.id, req.params.key, !!req.body.enabled);
  await resyncSlash(bot);
  res.json({ ok: true });
});

// ---------------------- Événements ----------------------
router.get('/bots/:id/events', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  res.json({
    defs: EVENT_DEFS,
    events: eventsState(bot.id),
  });
});

router.put('/bots/:id/events/:type', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  if (!EVENT_DEFS[req.params.type]) return res.status(404).json({ error: 'Événement introuvable' });
  store.events.set(bot.id, req.params.type, !!req.body.enabled, req.body.config || {});
  res.json({ ok: true });
});

// ---------------------- Économie ----------------------
router.get('/bots/:id/economy/leaderboard', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const { guild_id } = req.query;
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  const top = store.economy.top(bot.id, guild_id, 25);
  res.json({ top });
});

// ---------------------- Panneaux (tickets + menus de rôles) ----------------------
const panels = require('./discord/panels');

router.get('/bots/:id/panels', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const { guild_id } = req.query;
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  const cfg = store.tickets.get(bot.id, guild_id);
  res.json({
    tickets: cfg || {
      name: '', channel: '', message: '🎫 Besoin d\'aide ? Clique sur le bouton pour ouvrir un ticket !',
      button_label: '🎫 Ouvrir un ticket', support_role: '', category: 'Tickets',
    },
    role_menus: store.roleMenus.all(bot.id, guild_id),
  });
});

router.put('/bots/:id/tickets', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const { guild_id, name, channel, message, button_label, support_role, category } = req.body || {};
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  const current = store.tickets.get(bot.id, guild_id) || {};
  store.tickets.set(bot.id, guild_id, {
    name: String(name !== undefined ? name : (current.name || '')).slice(0, 50),
    channel: String(channel !== undefined ? channel : (current.channel || '')).slice(0, 100),
    message: String(message !== undefined ? message : (current.message || '')).slice(0, 1900),
    button_label: String(button_label !== undefined ? button_label : (current.button_label || '🎫 Ouvrir un ticket')).slice(0, 80),
    support_role: String(support_role !== undefined ? support_role : (current.support_role || '')).slice(0, 100),
    category: String(category !== undefined ? category : (current.category || 'Tickets')).slice(0, 100),
  });
  res.json({ ok: true });
});

router.post('/bots/:id/tickets/send', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const { guild_id } = req.body || {};
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  if (!botManager.isOnline(bot.id)) return res.status(400).json({ error: 'Démarre le bot avant d\'envoyer un panneau.' });
  const cfg = store.tickets.get(bot.id, guild_id);
  if (!cfg || !cfg.channel) return res.status(400).json({ error: 'Configure d\'abord le salon du panneau.' });
  const entry = botManager.clients.get(bot.id);
  const guild = entry.client.guilds.cache.get(guild_id);
  if (!guild) return res.status(400).json({ error: 'Le bot n\'est pas sur ce serveur.' });
  try {
    const channel = panels.findChannelInGuild(guild, cfg.channel);
    if (!channel) return res.status(400).json({ error: 'Salon introuvable. Vérifie le salon (mention #salon ou nom).' });
    await panels.sendTicketPanel(bot.id, guild_id, entry.client, channel);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message.slice(0, 200) });
  }
});

router.post('/bots/:id/role-menus', requireAuth, (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const { guild_id, name, content, placeholder, channel, options } = req.body || {};
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  if (!Array.isArray(options) || !options.length) return res.status(400).json({ error: 'Ajoute au moins un rôle au menu.' });
  const id = store.roleMenus.create({
    bot_id: bot.id,
    guild_id,
    name: String(name || 'Menu de rôles').slice(0, 50),
    content: String(content || '').slice(0, 1900),
    placeholder: String(placeholder || 'Choisis tes rôles…').slice(0, 150),
    channel: String(channel || '').slice(0, 100),
    options: JSON.stringify(options.map(o => ({
      label: String(o.label || 'Rôle').slice(0, 100),
      emoji: String(o.emoji || '').slice(0, 10),
      role: String(o.role || '').slice(0, 100),
    })).slice(0, 25)),
  });
  res.json({ id });
});

router.put('/role-menus/:id', requireAuth, (req, res) => {
  const menu = store.roleMenus.get(Number(req.params.id));
  if (!menu) return res.status(404).json({ error: 'Menu introuvable' });
  const bot = store.bots.get(menu.bot_id);
  if (!bot || bot.user_id !== req.userId) return res.status(404).json({ error: 'Menu introuvable' });
  const fields = {};
  const { name, content, placeholder, channel, options } = req.body || {};
  if (name !== undefined) fields.name = String(name).slice(0, 50);
  if (content !== undefined) fields.content = String(content).slice(0, 1900);
  if (placeholder !== undefined) fields.placeholder = String(placeholder).slice(0, 150);
  if (channel !== undefined) fields.channel = String(channel).slice(0, 100);
  if (options !== undefined) {
    if (!Array.isArray(options) || !options.length) return res.status(400).json({ error: 'Ajoute au moins un rôle au menu.' });
    fields.options = JSON.stringify(options.map(o => ({
      label: String(o.label || 'Rôle').slice(0, 100),
      emoji: String(o.emoji || '').slice(0, 10),
      role: String(o.role || '').slice(0, 100),
    })).slice(0, 25));
  }
  store.roleMenus.update(menu.id, fields);
  res.json({ ok: true });
});

router.delete('/role-menus/:id', requireAuth, (req, res) => {
  const menu = store.roleMenus.get(Number(req.params.id));
  if (!menu) return res.status(404).json({ error: 'Menu introuvable' });
  const bot = store.bots.get(menu.bot_id);
  if (!bot || bot.user_id !== req.userId) return res.status(404).json({ error: 'Menu introuvable' });
  store.roleMenus.remove(menu.id);
  res.json({ ok: true });
});

router.post('/role-menus/:id/send', requireAuth, async (req, res) => {
  const menu = store.roleMenus.get(Number(req.params.id));
  if (!menu) return res.status(404).json({ error: 'Menu introuvable' });
  const bot = store.bots.get(menu.bot_id);
  if (!bot || bot.user_id !== req.userId) return res.status(404).json({ error: 'Menu introuvable' });
  if (!botManager.isOnline(bot.id)) return res.status(400).json({ error: 'Démarre le bot avant d\'envoyer un menu.' });
  if (!menu.channel) return res.status(400).json({ error: 'Renseigne d\'abord le salon du menu.' });
  const entry = botManager.clients.get(bot.id);
  const guild = entry.client.guilds.cache.get(menu.guild_id);
  if (!guild) return res.status(400).json({ error: 'Le bot n\'est pas sur ce serveur.' });
  try {
    const channel = panels.findChannelInGuild(guild, menu.channel);
    if (!channel) return res.status(400).json({ error: 'Salon introuvable. Vérifie le salon (mention #salon ou nom).' });
    await panels.sendRoleMenu(bot.id, entry.client, menu, channel);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message.slice(0, 200) });
  }
});

// ---------------------- Statut de la sauvegarde automatique ----------------------
router.get('/status/backup', requireAuth, (req, res) => {
  const backup = require('./backup');
  res.json({ enabled: backup.enabled(), repo: backup.repo(), branch: backup.branch() });
});

// ============================================================
// Pages publiques (sans connexion) : le dashboard public de Nexora
// Les stats sont lues EN DIRECT depuis le processus du bot :
// c'est la synchronisation live entre le dashboard et Discord.
// ============================================================

// Catégorie d'une commande pré-faite (pour l'affichage groupé)
function commandCategory(name) {
  for (const [key, m] of Object.entries(MODULES)) {
    if (m.commands.includes(name)) return { key, label: m.label, emoji: m.emoji };
  }
  return null;
}

router.get('/public/stats', (req, res) => {
  const totalBots = store.db.prepare('SELECT COUNT(*) AS n FROM bots').get().n;
  const live = botManager.platformStats();
  res.json({ totalBots, ...live });
});

router.get('/public/bots', (req, res) => {
  const rows = store.db.prepare('SELECT id, name, avatar_url, bot_username, client_id FROM bots ORDER BY created_at DESC').all();
  const bots = rows.map((b) => {
    const info = botManager.publicBotInfo(b.id);
    return info || {
      id: b.id, name: b.name, username: b.bot_username || '', avatar_url: b.avatar_url || '',
      client_id: b.client_id || '', online: false, servers: 0, members: 0, ping: 0, uptime: 0,
      invite_url: b.client_id ? `https://discord.com/oauth2/authorize?client_id=${b.client_id}&permissions=8&scope=bot%20applications.commands` : '',
    };
  });
  res.json({ bots });
});

router.get('/public/bots/:id', (req, res) => {
  const botId = Number(req.params.id);
  const info = botManager.publicBotInfo(botId);
  if (!info) return res.status(404).json({ error: 'Bot introuvable' });

  // Commandes disponibles (modules activés + commandes personnalisées)
  const categories = [];
  const enabledNames = enabledCommandNames(botId);
  for (const [key, m] of Object.entries(MODULES)) {
    const cmds = m.commands.filter((n) => enabledNames.includes(n)).map((n) => ({ name: n, desc: CMD_DEFS[n] ? CMD_DEFS[n].desc : '' }));
    if (cmds.length) categories.push({ key, label: m.label, emoji: m.emoji, commands: cmds });
  }
  const custom = store.commands.all(botId).filter((c) => c.enabled).map((c) => ({
    name: c.name,
    desc: c.description || '',
    trigger: c.trigger_type === 'slash' ? `/${c.name}` : c.trigger_type === 'keyword' ? `mot-clé « ${c.trigger_value} »` : `${store.bots.get(botId).prefix}${c.trigger_value || c.name}`,
  }));

  res.json({
    bot: {
      ...info,
      categories,
      custom,
      public_url: store.settings.get('public_url') || '',
    },
  });
});

module.exports = router;
