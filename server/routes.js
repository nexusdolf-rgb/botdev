// ============================================================
// BotDev - Routes API
// ============================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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

function isPlatformAdmin(user) {
  if (!user) return false;
  const env = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (env.length) return env.includes(String(user.email || '').toLowerCase());
  // Sans variable d'environnement : le premier utilisateur inscrit est admin
  return user.id === 1;
}

router.get('/auth/me', requireAuth, (req, res) => {
  const user = store.users.findById(req.userId);
  res.json({ user: { ...user, is_admin: isPlatformAdmin(user) } });
});

// ============================================================
// Connexion avec Discord (OAuth2)
// ============================================================
function reqOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.get('host') || '';
  const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim();
  return `${proto}://${host}`;
}

function oauthClientId() {
  if (process.env.DISCORD_CLIENT_ID) return process.env.DISCORD_CLIENT_ID;
  const bot = store.db.prepare("SELECT client_id FROM bots WHERE client_id != '' LIMIT 1").get();
  return bot ? bot.client_id : '';
}

function oauthRedirectUri(req) {
  return process.env.DISCORD_REDIRECT_URI || `${reqOrigin(req)}/api/auth/discord/callback`;
}

router.get('/auth/discord/url', (req, res) => {
  const clientId = oauthClientId();
  if (!clientId) return res.status(400).json({ error: 'Aucune application Discord configurée.' });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('bd_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600000 });
  const url = 'https://discord.com/oauth2/authorize'
    + `?client_id=${clientId}`
    + `&redirect_uri=${encodeURIComponent(oauthRedirectUri(req))}`
    + '&response_type=code'
    + '&scope=' + encodeURIComponent('identify guilds')
    + `&state=${state}`;
  res.json({ url });
});

router.get('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== req.cookies.bd_oauth_state) return res.redirect('/#/login?oauth=error');
  res.clearCookie('bd_oauth_state');
  const clientId = oauthClientId();
  const secret = process.env.DISCORD_CLIENT_SECRET || '';
  if (!secret) return res.redirect('/#/dashboard?oauth=nosecret');
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: oauthRedirectUri(req),
      }),
    });
    if (!tokenRes.ok) return res.redirect('/#/dashboard?oauth=token');
    const tokens = await tokenRes.json();
    const h = { Authorization: `Bearer ${tokens.access_token}` };
    const [meRes, guildsRes] = await Promise.all([
      fetch('https://discord.com/api/v10/users/@me', { headers: h }),
      fetch('https://discord.com/api/v10/users/@me/guilds', { headers: h }),
    ]);
    if (!meRes.ok) return res.redirect('/#/dashboard?oauth=me');
    const me = await meRes.json();
    const guilds = guildsRes.ok ? await guildsRes.json() : [];

    // 1) Compte Discord déjà connu ?
    let user = store.users.findByDiscordId(me.id);
    // 2) Sinon : l'utilisateur est-il déjà connecté avec un compte email ? → on FUSIONNE
    if (!user) {
      const sessToken = req.cookies[COOKIE];
      const sess = sessToken ? store.sessions.find(sessToken) : null;
      const current = sess ? store.users.findById(sess.user_id) : null;
      if (current && !current.discord_id) {
        user = { id: current.id };
      } else {
        const userId = store.users.create(`discord:${me.id}@discord.botdev`, bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10), {
          discord_id: me.id,
          discord_username: me.username,
          discord_avatar: me.avatar || '',
        });
        user = { id: userId };
      }
    }
    store.users.updateDiscord(user.id, {
      discord_id: me.id,
      discord_username: me.username,
      discord_avatar: me.avatar || '',
      discord_guilds: JSON.stringify(guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon || '', owner: !!g.owner, permissions: g.permissions || '0' }))),
    });
    store.discordTokens.set(user.id, {
      access: tokens.access_token,
      refresh: tokens.refresh_token || '',
      expires: new Date(Date.now() + (tokens.expires_in || 604800) * 1000).toISOString(),
    });
    const session = store.sessions.create(user.id);
    res.cookie(COOKIE, session, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400000 });
    res.redirect('/#/dashboard?oauth=linked');
  } catch (e) {
    res.redirect('/#/dashboard?oauth=error');
  }
});

async function refreshDiscordData(userId) {
  const row = store.discordTokens.get(userId);
  if (!row) return false;
  let access = row.access_token;
  if (new Date(row.expires_at) < new Date(Date.now() + 60000)) {
    const secret = process.env.DISCORD_CLIENT_SECRET || '';
    if (!secret || !row.refresh_token) return false;
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: oauthClientId(), client_secret: secret, grant_type: 'refresh_token', refresh_token: row.refresh_token }),
    });
    if (!res.ok) return false;
    const d = await res.json();
    access = d.access_token;
    store.discordTokens.set(userId, { access, refresh: d.refresh_token || row.refresh_token, expires: new Date(Date.now() + d.expires_in * 1000).toISOString() });
  }
  const h = { Authorization: `Bearer ${access}` };
  const [meRes, guildsRes] = await Promise.all([
    fetch('https://discord.com/api/v10/users/@me', { headers: h }),
    fetch('https://discord.com/api/v10/users/@me/guilds', { headers: h }),
  ]);
  if (!meRes.ok) return false;
  const me = await meRes.json();
  const guilds = guildsRes.ok ? await guildsRes.json() : [];
  store.users.updateDiscord(userId, {
    discord_username: me.username,
    discord_avatar: me.avatar || '',
    discord_guilds: JSON.stringify(guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon || '', owner: !!g.owner, permissions: g.permissions || '0' }))),
  });
  return true;
}

async function userCanManageGuild(req, guildId) {
  const user = store.users.findById(req.userId);
  if (!user || !user.discord_id) return false;
  const guilds = store.users.discordGuilds(req.userId);
  const g = guilds.find((x) => x.id === guildId);
  if (!g) return false;
  if (g.owner) return true;
  const perms = Number(g.permissions) || 0;
  return (perms & 0x20) !== 0 || (perms & 0x8) !== 0;
}

router.get('/discord/guilds', requireAuth, async (req, res) => {
  const user = store.users.findById(req.userId);
  if (!user || !user.discord_id) return res.status(400).json({ error: 'Compte Discord non lié', needLink: true });
  await refreshDiscordData(req.userId).catch(() => {});
  const guilds = store.users.discordGuilds(req.userId);
  const botGuilds = new Set();
  for (const entry of botManager.clients.values()) {
    if (!entry.client.isReady()) continue;
    for (const g of entry.client.guilds.cache.values()) botGuilds.add(g.id);
  }
  const list = guilds.map((g) => {
    const perms = Number(g.permissions) || 0;
    return {
      id: g.id,
      name: g.name,
      owner: !!g.owner,
      canManage: !!g.owner || (perms & 0x20) !== 0 || (perms & 0x8) !== 0,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : '',
      hasBot: botGuilds.has(g.id),
    };
  });
  res.json({ guilds: list, discord: { username: user.discord_username, avatar: user.discord_avatar } });
});

// ---------------------- Admin plateforme ----------------------
function requireAdmin(req, res, next) {
  const user = store.users.findById(req.userId);
  if (!user || !isPlatformAdmin(user)) return res.status(403).json({ error: 'Réservé à l\'administrateur de la plateforme.' });
  next();
}

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
    events_count: store.events.countEnabled(bot.id),
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

// ============================================================
// Configuration par serveur (façon DraftBot)
// ============================================================
router.get('/bots/:id/guilds/:guildId', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) {
    return res.status(403).json({ error: 'Tu dois être propriétaire ou avoir la permission « Gérer le serveur » sur ce serveur Discord.' });
  }
  const entry = botManager.clients.get(bot.id);
  const dGuild = entry && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
  if (!dGuild) return res.status(400).json({ error: 'Le bot n\'est pas sur ce serveur (ou il est hors ligne).' });
  const cfg = store.tickets.get(bot.id, guildId);
  const parsedTypes = (() => {
    try {
      const t = JSON.parse(cfg?.types || '[]');
      return (Array.isArray(t) ? t : []).map((x) => {
        const roles = Array.isArray(x.staff_roles) ? x.staff_roles : (x.staff_role ? [x.staff_role] : []);
        return { label: x.label, emoji: x.emoji || '', category: x.category || '', staff_roles: roles.filter(Boolean) };
      });
    } catch { return []; }
  })();
  const DEFAULT_GS = {
    prefix: '', warn_limit: 0, warn_action: 'none',
    xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '',
    am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5,
    log_channel: '',
  };
  res.json({
    guild: { id: guildId, name: dGuild.name, icon: dGuild.iconURL({ size: 128 }) || '', members: dGuild.memberCount || 0 },
    settings: { ...DEFAULT_GS, ...(store.guildSettings.get(bot.id, guildId) || {}) },
    tickets: { name: '', channel: '', message: '', button_label: '🎫 Ouvrir un ticket', support_role: '', category: 'Tickets', types: [], ...(cfg || {}), types: parsedTypes },
    events: { defs: EVENT_DEFS, state: eventsState(bot.id, guildId) },
    role_menus: store.roleMenus.all(bot.id, guildId),
    xp_roles: store.xpRoles.all(bot.id, guildId),
    profile: store.botProfiles.get(bot.id, guildId) || { name: '', avatar_url: '', banner_url: '', bio: '', color: '#5865F2' },
    blacklist: store.blacklist.all(bot.id, guildId),
  });
});

// Identité du bot sur un serveur (nom, bio, couleur + images en base64)
router.put('/bots/:id/guilds/:guildId/profile', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const assets = require('./assets');
  const cur = store.botProfiles.get(bot.id, guildId) || {};
  const fields = { ...cur };
  const { name, bio, color, avatar_b64, banner_b64 } = req.body || {};
  if (name !== undefined) fields.name = String(name).slice(0, 80);
  if (bio !== undefined) fields.bio = String(bio).slice(0, 1900);
  if (color !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(color))) fields.color = String(color);
  try {
    if (typeof avatar_b64 === 'string' && avatar_b64.startsWith('data:')) {
      const m = avatar_b64.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Image trop lourde (3 Mo max).' });
        fields.avatar_url = `/assets/${await assets.put(buf, m[1])}`;
      }
    }
    if (typeof banner_b64 === 'string' && banner_b64.startsWith('data:')) {
      const m = banner_b64.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Image trop lourde (3 Mo max).' });
        fields.banner_url = `/assets/${await assets.put(buf, m[1])}`;
      }
    }
  } catch (e) {
    return res.status(400).json({ error: e.message.slice(0, 150) });
  }
  store.botProfiles.set(bot.id, guildId, fields);
  res.json({ ok: true, profile: store.botProfiles.get(bot.id, guildId) });
});

router.delete('/bots/:id/guilds/:guildId/profile', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.botProfiles.remove(bot.id, guildId);
  res.json({ ok: true });
});

// Niveaux (XP) par serveur
router.put('/bots/:id/guilds/:guildId/xp', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { enabled, min, max, cooldown, message, channel, roles } = req.body || {};
  store.guildSettings.set(bot.id, guildId, {
    xp_enabled: (enabled === false || enabled === 0) ? 0 : 1,
    xp_min: Math.min(Math.max(parseInt(min, 10) || 10, 1), 1000),
    xp_max: Math.max(parseInt(max, 10) || 25, 1),
    xp_cooldown: Math.max(parseInt(cooldown, 10) || 60, 0),
    xp_message: String(message || '').slice(0, 500),
    xp_channel: String(channel || '').slice(0, 100),
  });
  if (Array.isArray(roles)) {
    store.xpRoles.replace(bot.id, guildId, roles
      .slice(0, 25)
      .map((r) => ({ level: Math.max(1, parseInt(r.level, 10) || 1), role: String(r.role || '').slice(0, 100) }))
      .filter((r) => r.role));
  }
  res.json({ ok: true });
});

// Auto-modération par serveur
router.put('/bots/:id/guilds/:guildId/automod', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { enabled, links, caps, mentions, spam, blacklist } = req.body || {};
  store.guildSettings.set(bot.id, guildId, {
    am_enabled: enabled ? 1 : 0,
    am_links: (links === false || links === 0) ? 0 : 1,
    am_caps: (caps === false || caps === 0) ? 0 : 1,
    am_mentions: Math.max(parseInt(mentions, 10) || 0, 0),
    am_spam: Math.max(parseInt(spam, 10) || 0, 0),
  });
  if (Array.isArray(blacklist)) {
    const words = blacklist.map((w) => String(w).trim().toLowerCase()).filter((w) => w.length >= 2).slice(0, 100);
    const existing = store.blacklist.all(bot.id, guildId);
    for (const w of existing) if (!words.includes(w)) store.blacklist.remove(bot.id, guildId, w);
    for (const w of words) store.blacklist.add(bot.id, guildId, w);
  }
  res.json({ ok: true });
});

router.put('/bots/:id/guilds/:guildId/settings', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { prefix, warn_limit, warn_action, log_channel } = req.body || {};
  store.guildSettings.set(bot.id, guildId, {
    prefix: String(prefix || '').slice(0, 5),
    warn_limit: Math.max(0, parseInt(warn_limit, 10) || 0),
    warn_action: ['none', 'kick', 'ban'].includes(warn_action) ? warn_action : 'none',
    ...(log_channel !== undefined ? { log_channel: String(log_channel).slice(0, 100) } : {}),
  });
  res.json({ ok: true });
});

router.put('/bots/:id/guilds/:guildId/events/:type', requireAuth, async (req, res) => {
  const bot = getOwnBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  if (!EVENT_DEFS[req.params.type]) return res.status(404).json({ error: 'Événement introuvable' });
  store.events.set(bot.id, guildId, req.params.type, !!req.body.enabled, req.body.config || {});
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
  const { guild_id, name, channel, message, button_label, support_role, category, types } = req.body || {};
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  const current = store.tickets.get(bot.id, guild_id) || {};
  const payload = {
    name: String(name !== undefined ? name : (current.name || '')).slice(0, 50),
    channel: String(channel !== undefined ? channel : (current.channel || '')).slice(0, 100),
    message: String(message !== undefined ? message : (current.message || '')).slice(0, 1900),
    button_label: String(button_label !== undefined ? button_label : (current.button_label || '🎫 Ouvrir un ticket')).slice(0, 80),
    support_role: String(support_role !== undefined ? support_role : (current.support_role || '')).slice(0, 100),
    category: String(category !== undefined ? category : (current.category || 'Tickets')).slice(0, 100),
  };
  if (types !== undefined) {
    payload.types = JSON.stringify((Array.isArray(types) ? types : [])
      .map((t) => {
        const roles = Array.isArray(t.staff_roles)
          ? t.staff_roles.map((r) => String(r).trim()).filter(Boolean).slice(0, 10)
          : (t.staff_role ? [String(t.staff_role).trim()] : []);
        return {
          label: String(t.label || '').slice(0, 100),
          emoji: String(t.emoji || '').slice(0, 10),
          category: String(t.category || '').slice(0, 100),
          staff_roles: roles,
        };
      })
      .filter((t) => t.label)
      .slice(0, 25));
  } else {
    payload.types = current.types || '[]';
  }
  store.tickets.set(bot.id, guild_id, payload);
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

// Indicateur public (aucune donnée sensible : juste actif/inactif)
// Sert à vérifier depuis l'extérieur que les variables d'environnement sont bien en place.
router.get('/health/backup', (req, res) => {
  const backup = require('./backup');
  res.json({ enabled: backup.enabled() });
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

// ============================================================
// Panneau admin plateforme (le fondateur de BotDev)
// ============================================================
router.get('/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const users = store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const bots = store.db.prepare('SELECT COUNT(*) AS n FROM bots').get().n;
  const online = store.db.prepare('SELECT COUNT(*) AS n FROM bots WHERE enabled = 1').get().n;
  const live = botManager.platformStats();
  res.json({ users, bots, online, ...live });
});

router.get('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const rows = store.db.prepare(`
    SELECT u.id, u.email, u.discord_username, u.created_at,
      (SELECT COUNT(*) FROM bots b WHERE b.user_id = u.id) AS bots_count
    FROM users u ORDER BY u.created_at DESC LIMIT 200`).all();
  res.json({ users: rows });
});

router.get('/admin/bots', requireAuth, requireAdmin, (req, res) => {
  const rows = store.db.prepare(`
    SELECT b.id, b.name, b.bot_username, b.enabled, u.email AS owner_email
    FROM bots b LEFT JOIN users u ON u.id = b.user_id
    ORDER BY b.created_at DESC LIMIT 200`).all();
  const out = rows.map((b) => ({
    ...b,
    online: botManager.isOnline(b.id),
    servers: (() => { const e = botManager.clients.get(b.id); return e && e.client.isReady() ? e.client.guilds.cache.size : 0; })(),
  }));
  res.json({ bots: out });
});

router.delete('/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) return res.status(400).json({ error: 'Tu ne peux pas supprimer ton propre compte.' });
  const target = store.users.findById(targetId);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const bots = store.bots.all(targetId);
  for (const b of bots) {
    await botManager.logoutBot(b.id);
    store.commands.removeAll(b.id);
    store.bots.remove(b.id);
  }
  store.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
  store.db.prepare('DELETE FROM discord_tokens WHERE user_id = ?').run(targetId);
  store.db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  res.json({ ok: true });
});

module.exports = router;
