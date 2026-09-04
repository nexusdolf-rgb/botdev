// ============================================================
// BotDev - Routes API
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const store = require('./db');
const botManager = require('./discord/botManager');
const imgproxy = require('./imgproxy');
const { oauthGuildCanConfigure, accessKind } = require('./discord/permissions');
const security = require('./security');
const { AsyncTTLCache, TTLCache } = require('./cache');
const { MODULES, CMD_DEFS, enabledModules, enabledCommandNames } = require('./discord/premade');
const { EVENT_DEFS, eventsState, sanitizeEventConfig } = require('./discord/events');

const router = express.Router();
const COOKIE = 'botdev_session';
const oauthRateLimit = security.rateLimit({ name: 'oauth', windowMs: 10 * 60000, max: 30 });
const platformMutationRateLimit = security.rateLimit({
  name: 'platform-admin', windowMs: 60000, max: 30,
  key: (req) => req.userId || req.ip,
});
// Envois réels de messages de test (bienvenue/départ) : limités pour éviter
// qu'un compte compromis ne spamme les serveurs.
const eventsTestRateLimit = security.rateLimit({ name: 'events-test', windowMs: 60000, max: 10 });
// Sauvegardes de config d'événements : limitées, config assainie côté serveur.
const eventsSaveRateLimit = security.rateLimit({ name: 'events-save', windowMs: 60000, max: 120 });

// Les listes relisibles de Discord sont mises en cache brièvement pour
// absorber les ouvertures simultanées du dashboard sans relire la même
// Collection 1 000 fois. La base reste la source de vérité.
const discordRefreshCache = new AsyncTTLCache({ ttlMs: 60000, max: 2000 });
const guildCatalogCache = new TTLCache({ ttlMs: 30000, max: 500 });
const membersCache = new AsyncTTLCache({ ttlMs: 30000, max: 2000 });
const statsCache = new AsyncTTLCache({ ttlMs: 15000, max: 500 });
const publicAvatarCache = new TTLCache({ ttlMs: 10 * 60000, max: 2 });
const imgCache = new TTLCache({ ttlMs: 60 * 60000, max: 200 });

function setSessionCookie(req, res, token) {
  res.cookie(COOKIE, token, security.secureCookieOptions(req, 30 * 86400000));
}

// ============================================================
// 🖼️ Bannière du panneau de tickets, générée PAR SERVEUR
// (publique : c'est Discord qui la charge pour l'afficher dans l'embed)
// STATIQUE uniquement : génération ~1 s, zéro charge, zéro échec.
// Les anciennes URLs en .gif restent valides (elles servent le PNG).
// ============================================================
function servePanelBannerPng(req, res) {
  const guildId = String(req.params.guildId || '').replace(/[^0-9]/g, '').slice(0, 25);
  const banner = require('./banner');
  const name = banner.storedPanelName(guildId) || 'HOXERA';
  try {
    const buf = banner.generateBanner(name);
    if (buf && buf.then) {
      // génération asynchrone (première fois)
      buf.then((png) => {
        if (png) {
          res.set('Content-Type', 'image/png');
          res.set('Cache-Control', 'public, max-age=600');
          res.send(png);
        } else {
          res.sendFile(path.join(__dirname, '..', 'public', 'icons', 'support-banner.png'));
        }
      }).catch(() => res.sendFile(path.join(__dirname, '..', 'public', 'icons', 'support-banner.png')));
      return;
    }
    if (buf) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=600');
      res.send(buf);
      return;
    }
  } catch (e) {
    console.error('[Hoxera] bannière panneau :', e.message);
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'icons', 'support-banner.png'));
}

router.get('/tickets/panel-banner/:guildId.png', (req, res) => servePanelBannerPng(req, res));
router.get('/tickets/panel-banner/:guildId.gif', (req, res) => servePanelBannerPng(req, res));

// ============================================================
// 🖼️ Images importées par les utilisateurs (panneaux de tickets,
// MP de fermeture…) — stockées dans le dossier de données.
// ============================================================
function uploadsDir() {
  return path.join(process.env.BOTDEV_DATA_DIR || path.join(__dirname, '..'), 'uploads');
}
router.post('/bots/:id/guilds/:guildId/uploads', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const data = String((req.body || {}).data || '');
  const m = data.match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: 'Image invalide — formats acceptés : PNG, JPEG, GIF, WebP.' });
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'Image trop lourde (maximum 2 Mo).' });
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[m[1]];
  const sig = buf.slice(0, 12).toString('hex');
  const okSig = ext === 'png' ? sig.startsWith('89504e47')
    : ext === 'jpg' ? sig.startsWith('ffd8ff')
    : ext === 'gif' ? sig.startsWith('47494638')
    : sig.includes('57454250');
  if (!okSig) return res.status(400).json({ error: 'Fichier non reconnu comme image.' });
  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = `${bot.id}-${guildId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, file), buf);
  res.json({ url: `/api/uploads/${file}` });
});
router.get('/uploads/:file', (req, res) => {
  const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
  const dir = uploadsDir();
  const p = path.join(dir, file);
  if (!file || !p.startsWith(dir)) return res.status(404).end();
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  res.set('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(p, (err) => { if (err) res.status(404).end(); });
});

// Emoji sûr (même règle que le bot) : évite de stocker des emojis invalides
// qui feraient planter la construction des menus Discord.
function safeEmojiWeb(s) {
  const str = String(s || '').trim();
  if (!str) return '';
  if (/^<a?:[a-zA-Z0-9_]+:\d{15,21}>$/.test(str)) return str;
  if (/^[\p{Extended_Pictographic}\u200D\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]+$/u.test(str)) return str;
  return '';
}

// ---------------------- Auth ----------------------
async function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Non connecté' });
  const session = store.sessions.find(token);
  if (!session || new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'Session expirée' });
  const currentUser = store.users.findById(session.user_id);
  if (!currentUser) {
    store.sessions.destroy(token);
    res.clearCookie(COOKIE);
    return res.status(401).json({ error: 'Session invalide' });
  }
  if (store.platformBans.isBanned(session.user_id)) {
    store.sessions.destroy(token);
    res.clearCookie(COOKIE);
    return res.status(403).json({ error: 'Ce compte est banni d’Optimus Prime.' });
  }
  req.userId = session.user_id;
  req.currentUser = currentUser;
  req.isPlatformAdmin = isPlatformAdmin(currentUser);
  next();
}

// ⚠️ Routes email/mot de passe (/auth/register, /auth/login) supprimées en v193 :
// mortes depuis le passage au 100 % OAuth2 Discord (aucune référence dans le
// front, aucun test fonctionnel). La connexion se fait exclusivement via
// /auth/discord/* (voir plus bas). bcrypt reste utilisé par l'OAuth2.

router.post('/auth/logout', (req, res) => {
  const token = req.cookies[COOKIE];
  if (token) store.sessions.destroy(token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

function isPlatformAdmin(user) {
  if (!user) return false;
  // Identité Discord explicite du fondateur : une seule valeur valide est
  // acceptée. Une valeur absente ou mal formée ne donne jamais un accès.
  const configuredDiscordId = process.env.NEXORA_ADMIN_DISCORD_ID;
  if (configuredDiscordId !== undefined) {
    const discordId = String(configuredDiscordId).trim();
    return /^\d{15,21}$/.test(discordId) && String(user.discord_id || '') === discordId;
  }
  // Liste email explicite conservée pour les installations historiques ;
  // elle doit contenir une seule adresse pour respecter le mode fondateur.
  const env = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (env.length) return env.length === 1 && env[0] === String(user.email || '').toLowerCase();
  // En production, l'absence de configuration est un verrouillage complet.
  // Le repli historique reste disponible uniquement hors production/tests.
  if (process.env.NEXORA_ADMIN_FAIL_CLOSED === '1' || process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') return false;
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

router.get('/auth/discord/url', oauthRateLimit, (req, res) => {
  const clientId = oauthClientId();
  if (!clientId) return res.status(400).json({ error: 'Aucune application Discord configurée.' });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('bd_oauth_state', state, security.secureCookieOptions(req, 600000));
  const url = 'https://discord.com/oauth2/authorize'
    + `?client_id=${clientId}`
    + `&redirect_uri=${encodeURIComponent(oauthRedirectUri(req))}`
    + '&response_type=code'
    + '&scope=' + encodeURIComponent('identify guilds')
    + `&state=${state}`;
  res.json({ url });
});

router.get('/auth/discord/callback', oauthRateLimit, async (req, res) => {
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
    if (store.platformBans.isBanned(user.id)) return res.redirect('/#/login?oauth=banned');
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
    setSessionCookie(req, res, session);
    res.redirect('/#/dashboard?oauth=linked');
  } catch (e) {
    res.redirect('/#/dashboard?oauth=error');
  }
});

async function refreshDiscordData(userId) {
  return discordRefreshCache.getOrLoad(String(userId), async () => {
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
  });
}

async function userCanManageGuild(req, guildId) {
  const user = store.users.findById(req.userId);
  if (!user || !user.discord_id) return false;
  const guilds = store.users.discordGuilds(req.userId);
  const g = guilds.find((x) => String(x.id) === String(guildId));
  return oauthGuildCanConfigure(g);
}

router.get('/discord/guilds', requireAuth, async (req, res) => {
  const user = store.users.findById(req.userId);
  if (!user || !user.discord_id) return res.status(400).json({ error: 'Compte Discord non lié', needLink: true });
  await refreshDiscordData(req.userId).catch(() => {});
  const guilds = store.users.discordGuilds(req.userId);
  // Données riches (bannière, membres, boosts) pour les serveurs où le bot
  // est présent : elles alimentent la grille de sélection de serveurs.
  const botGuilds = new Map();
  for (const entry of botManager.clients.values()) {
    if (!entry.client.isReady()) continue;
    for (const g of entry.client.guilds.cache.values()) {
      if (!botGuilds.has(g.id)) {
        botGuilds.set(g.id, {
          banner: (typeof g.bannerURL === 'function' ? g.bannerURL({ size: 1024 }) : '') || '',
          members: g.memberCount || 0,
          boosts: g.premiumSubscriptionCount || 0,
        });
      }
    }
  }
  const list = guilds.map((g) => {
    const info = botGuilds.get(g.id);
    return {
      id: g.id,
      name: g.name,
      owner: !!g.owner,
      canManage: oauthGuildCanConfigure(g),
      canConfigure: oauthGuildCanConfigure(g),
      access: accessKind(g),
      icon: imgproxy.imgProxy(g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : ''),
      hasBot: botGuilds.has(g.id),
      banner: info ? info.banner : '',
      members: info ? info.members : 0,
      boosts: info ? info.boosts : 0,
    };
  });
  res.json({ guilds: list, discord: { username: user.discord_username, avatar: user.discord_avatar } });
});

// ---------------------- Admin plateforme ----------------------
function requireAdmin(req, res, next) {
  const user = req.currentUser || store.users.findById(req.userId);
  if (!user || !isPlatformAdmin(user)) return res.status(403).json({ error: 'Réservé à l\'administrateur de la plateforme.' });
  req.isPlatformAdmin = true;
  next();
}

// ---------------------- Helpers bot ----------------------
function getOwnBot(req, res) {
  const bot = store.bots.get(Number(req.params.id));
  if (!bot || (bot.user_id !== req.userId && !req.isPlatformAdmin)) {
    res.status(404).json({ error: 'Bot introuvable' });
    return null;
  }
  return bot;
}

// Hoxera est un bot UNIQUE et public : l'accès n'est plus lié à la
// « propriété » du bot (legacy multi-utilisateurs), mais à l'autorisation
// de configuration de l'utilisateur sur CHAQUE serveur (propriétaire ou
// permission Discord « Administrateur »).
function getAnyBot(req, res) {
  const bot = store.bots.get(Number(req.params.id));
  if (!bot) {
    res.status(404).json({ error: 'Bot introuvable' });
    return null;
  }
  return bot;
}

function botDetail(bot) {
  // 🛡️ Le token Discord n'est JAMAIS renvoyé à l'API : il n'est utilisé que
  // côté serveur (connexion du bot). Le dashboard n'en a pas besoin.
  const { token, ...safeBot } = bot || {};
  const entry = botManager.clients.get(bot.id);
  const online = botManager.isOnline(bot.id);
  // 🖼️ Photo de profil VIVANTE du bot : lue depuis le client Discord connecté
  // (toujours à jour), jamais une URL stockée qui peut devenir invalide quand
  // l'avatar change. Si le client est hors ligne, on garde l'URL enregistrée.
  let liveAvatar = '';
  try {
    const cu = entry && entry.client && entry.client.user;
    if (cu && typeof cu.displayAvatarURL === 'function') liveAvatar = cu.displayAvatarURL({ size: 256, format: 'png' });
  } catch { liveAvatar = ''; }
  let guilds = [];
  if (entry && online) {
    guilds = [...entry.client.guilds.cache.values()].map(g => ({
      id: g.id, name: g.name, icon: imgproxy.imgProxy(g.iconURL({ size: 64 }) || '') || null, members: g.memberCount,
    }));
  }
  return {
    ...safeBot,
    online,
    avatar_url: imgproxy.imgProxy(liveAvatar || safeBot.avatar_url || ''),
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
  if (!bot || (bot.user_id !== req.userId && !req.isPlatformAdmin)) return res.status(404).json({ error: 'Commande introuvable' });
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
  if (!bot || (bot.user_id !== req.userId && !req.isPlatformAdmin)) return res.status(404).json({ error: 'Commande introuvable' });
  store.commands.remove(cmd.id);
  await resyncSlash(bot);
  res.json({ ok: true });
});

async function resyncSlash(bot) {
  if (!botManager.isOnline(bot.id)) return;
  const entry = botManager.clients.get(bot.id);
  if (!entry) return;
  // 🌍 v1.93 : les commandes sont GLOBALES — une seule synchro pour tous les
  // serveurs (la synchro « par serveur » ne fait plus que retirer les vieux doublons).
  await botManager.syncGlobalCommands(bot.id).catch(() => {});
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

// ✅ Checklist de configuration : l'état d'avancement du serveur,
// calculée à partir des mêmes données que le bot (source de vérité unique).
function guildChecklist(payload) {
  const s = payload.settings || {};
  const t = payload.tickets || {};
  const ev = payload.events ? (payload.events.state || {}) : {};
  const items = [];
  const add = (key, label, module, ok) => items.push({ key, label, module, done: !!ok });
  add('tickets', '🎫 Système de tickets', 'tickets', !!(t.channel));
  add('welcome', '👋 Message de bienvenue', 'welcome', !!(ev.member_join && ev.member_join.enabled));
  add('autorole', '🏷️ Auto-rôle', 'welcome', !!(ev.autorole && ev.autorole.enabled));
  add('levels', '📈 Niveaux (XP)', 'levels', s.xp_enabled !== 0);
  add('automod', '🛡️ Auto-modération', 'moderation', !!s.am_enabled);
  add('logs', '📜 Journaux de modération', 'logs', !!s.log_channel);
  add('suggestions', '💡 Suggestions', 'suggestions', !!s.suggestion_channel);
  add('shop', '🛒 Boutique', 'shop', (payload.shop_items || []).length > 0);
  add('announcements', '📅 Annonces programmées', 'announcements', (payload.scheduled || []).length > 0);
  add('birthdays', '🎂 Anniversaires', 'server', !!s.birthday_channel);
  add('voicetemp', '🔊 Salons vocaux temporaires', 'server', !!(payload.voicetemp && payload.voicetemp.creator_channel));
  add('profile', '🤖 Identité du bot', 'server', !!(payload.profile && (payload.profile.name || payload.profile.avatar_url)));
  return items;
}

function guildCatalog(dGuild) {
  const key = String(dGuild && dGuild.id || 'unknown');
  const cached = guildCatalogCache.get(key);
  if (cached) return cached;
  const channels = [];
  const roles = [];
  if (dGuild && dGuild.channels && dGuild.channels.cache) {
    for (const ch of dGuild.channels.cache.values()) {
      if (ch && ch.type === 0 && ch.name) channels.push({ id: ch.id, name: ch.name });
      if (ch && ch.type === 2 && ch.name) channels.push({ id: ch.id, name: ch.name, voice: true });
      if (ch && ch.type === 4 && ch.name) channels.push({ id: ch.id, name: ch.name, category: true });
    }
  }
  if (dGuild && dGuild.roles && dGuild.roles.cache) {
    for (const r of dGuild.roles.cache.values()) {
      if (r && r.name && r.name !== '@everyone') roles.push({ id: r.id, name: r.name });
    }
  }
  channels.sort((a, b) => (b.category ? 1 : 0) - (a.category ? 1 : 0) || a.name.localeCompare(b.name));
  roles.sort((a, b) => a.name.localeCompare(b.name));
  return guildCatalogCache.set(key, { channels, roles });
}

router.get('/bots/:id/guilds/:guildId', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) {
    return res.status(403).json({ error: 'Tu dois être propriétaire du serveur ou avoir la permission Discord « Administrateur ».' });
  }
  const entry = botManager.clients.get(bot.id);
  const dGuild = entry && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
  if (!dGuild) return res.status(400).json({ error: 'Le bot n\'est pas sur ce serveur (ou il est hors ligne).' });
  // Salons et rôles du serveur : catalogue Discord relisible mis en cache
  // brièvement pour absorber les ouvertures simultanées du dashboard.
  const { channels, roles } = guildCatalog(dGuild);

  const cfg = store.tickets.get(bot.id, guildId);
  const parsedTypes = (() => {
    try {
      const t = JSON.parse(cfg?.types || '[]');
      return (Array.isArray(t) ? t : []).map((x) => {
        const roles = Array.isArray(x.staff_roles) ? x.staff_roles : (x.staff_role ? [x.staff_role] : []);
        // ⚠️ TOUS les champs doivent être renvoyés au dashboard : avant,
        // description et questions étaient omis ici → le dashboard les
        // rechargeait vides et les ÉCRASAIT au prochain « Enregistrer ».
        return {
          label: x.label,
          emoji: x.emoji || '',
          category: x.category || '',
          description: x.description || '',
          questions: Array.isArray(x.questions) ? x.questions.map((q) => String(q)).filter(Boolean).slice(0, 5) : [],
          staff_roles: roles.filter(Boolean),
        };
      });
    } catch { return []; }
  })();
  const DEFAULT_GS = {
    prefix: '', warn_limit: 0, warn_action: 'none',
    xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '',
    am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5,
    am_mode: 'enforce', am_rule_actions: '{}', am_blacklist_rules: '{}', am_blacklist_thresholds: '{}', am_blacklist_duration_min: 0, am_blacklist_channel: '',
    am_blacklist_title: '🚫 Membre ajouté à la blacklist', am_blacklist_color: '#ED4245', am_blacklist_footer: 'Blacklist du serveur · Hoxera',
    am_native_enabled: 1, am_native_alert_channel: '',
    am_exempt_roles: '[]', am_exempt_channels: '[]', am_exempt_users: '[]',
    am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10,
    log_channel: '',
    birthday_channel: '', birthday_role: '', log_events: '',
  };
  let logEvents = {};
  try { logEvents = JSON.parse((store.guildSettings.get(bot.id, guildId) || {}).log_events || '{}') || {}; } catch {}
  const ticketsStats = (() => {
    try { return JSON.parse(store.settings.get(`ticket_stats_${guildId}`) || '{"total":0,"open":0}'); } catch { return { total: 0, open: 0 }; }
  })();
  const payload = {
    guild: {
      id: guildId,
      name: dGuild.name,
      icon: imgproxy.imgProxy(dGuild.iconURL({ size: 128 }) || ''),
      // 🖼️ Bannière + stats riches pour la page d'accueil du serveur
      banner: (typeof dGuild.bannerURL === 'function' ? imgproxy.imgProxy(dGuild.bannerURL({ size: 1024 }) || '') : ''),
      members: dGuild.memberCount || 0,
      boosts: dGuild.premiumSubscriptionCount || 0,
      channelsCount: dGuild.channels ? dGuild.channels.cache.size : 0,
      rolesCount: dGuild.roles ? dGuild.roles.cache.size : 0,
      createdAt: dGuild.createdTimestamp || 0,
      description: dGuild.description || '',
    },
    channels,
    roles,
    settings: { ...DEFAULT_GS, ...(store.guildSettings.get(bot.id, guildId) || {}) },
    tickets: { name: '', channel: '', message: '', button_label: '🎫 Ouvrir un ticket', button_style: '1', require_reason: 1, support_role: '', category: 'Tickets', types: [], ...(cfg || {}), types: parsedTypes },
    tickets_stats: ticketsStats,
    events: { defs: EVENT_DEFS, state: eventsState(bot.id, guildId) },
    role_menus: store.roleMenus.all(bot.id, guildId),
    xp_roles: store.xpRoles.all(bot.id, guildId),
    profile: store.botProfiles.get(bot.id, guildId) || { name: '', avatar_url: '', banner_url: '', bio: '', color: '#e07a5f' },
    profiles_extra: store.profileAliases.list(bot.id, guildId),
    profile_active: store.profileState.getActive(bot.id, guildId),
    blacklist: store.blacklist.all(bot.id, guildId),
    automod_blacklist: store.memberBlacklist.active(bot.id, guildId, 100),
    voicetemp: store.voicetemp.get(bot.id, guildId) || { creator_channel: '', category: '', name_template: '' },
    applications: store.applications.get(bot.id, guildId) || { channel: '', questions: '[]', title: '📝 Candidature', enabled: 0 },
    scheduled: store.scheduled.all(bot.id, guildId),
    shop_items: store.shop.all(bot.id, guildId),
    log_events: logEvents,
  };
  // ✅ Checklist de configuration + 🚨 état du verrouillage anti-raid
  payload.checklist = guildChecklist(payload);
  try { payload.lockdown = require('./discord/lockdown').state(bot.id, dGuild); } catch { payload.lockdown = { locked: false, channels: [] }; }
  res.json(payload);
});

// ---------------------- Communauté (façon DraftBot) ----------------------
// Boutique
router.get('/bots/:id/guilds/:guildId/shop', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ items: store.shop.all(bot.id, req.params.guildId) });
});

router.put('/bots/:id/guilds/:guildId/shop', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const items = Array.isArray(req.body.items) ? req.body.items.filter((i) => i && i.name && i.role).slice(0, 50) : [];
  store.shop.replace(bot.id, req.params.guildId, items);
  res.json({ ok: true, items: store.shop.all(bot.id, req.params.guildId) });
});

// Suggestions
router.get('/bots/:id/guilds/:guildId/suggestions', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ suggestions: store.suggestions.all(bot.id, req.params.guildId) });
});

router.put('/bots/:id/guilds/:guildId/suggestions/:sid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.suggestions.setStatus(Number(req.params.sid), req.body.status);
  res.json({ ok: true });
});

// Sanctions prédéfinies
router.get('/bots/:id/guilds/:guildId/sanctions', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ sanctions: store.sanctions.all(bot.id, req.params.guildId) });
});

router.put('/bots/:id/guilds/:guildId/sanctions', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const list = Array.isArray(req.body.sanctions) ? req.body.sanctions.filter((s) => s && s.name).slice(0, 25) : [];
  const existing = store.sanctions.all(bot.id, req.params.guildId).map((s) => s.name);
  for (const name of existing) if (!list.some((s) => s.name === name)) store.sanctions.remove(bot.id, req.params.guildId, name);
  for (const s of list) store.sanctions.add(bot.id, req.params.guildId, s);
  res.json({ ok: true, sanctions: store.sanctions.all(bot.id, req.params.guildId) });
});

// Giveaways
router.get('/bots/:id/guilds/:guildId/giveaways', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ giveaways: store.giveaways.all(bot.id, req.params.guildId) });
});

router.post('/bots/:id/guilds/:guildId/giveaways/:gid/end', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const g = store.giveaways.get(Number(req.params.gid));
  if (!g || g.bot_id !== bot.id) return res.status(404).json({ error: 'Giveaway introuvable.' });
  const entry = botManager.clients.get(bot.id);
  if (!entry || !entry.client.isReady()) return res.status(400).json({ error: 'Le bot doit être en ligne.' });
  const giveaway = require('./discord/giveaway');
  const result = await giveaway.endGiveaway(bot.id, entry.client, g, false);
  res.json({ ok: result.ok, winners: result.winners, reason: result.reason });
});

// ⚙️ Configuration des giveaways (v198)
router.put('/bots/:id/guilds/:guildId/giveaways/config', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const b = req.body || {};
  store.guildSettings.set(bot.id, req.params.guildId, {
    giveaway_channel: String(b.channel || '').slice(0, 100),
    giveaway_default_duration: Math.min(Math.max(parseInt(b.default_duration, 10) || 0, 0), 720),
    giveaway_default_winners: Math.min(Math.max(parseInt(b.default_winners, 10) || 1, 1), 50),
    giveaway_ping_role: String(b.ping_role || '').slice(0, 100),
    giveaway_color: /^#[0-9a-fA-F]{6}$/.test(String(b.color || '')) ? String(b.color) : '',
    giveaway_message: String(b.message || '').slice(0, 1500),
  });
  res.json({ ok: true });
});

// 🎁 Lancer un giveaway depuis le dashboard (v198)
router.post('/bots/:id/guilds/:guildId/giveaways', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const b = req.body || {};
  const prize = String(b.prize || '').trim().slice(0, 200);
  if (!prize) return res.status(400).json({ error: 'Indique le prix à gagner.' });
  const winners = Math.min(Math.max(parseInt(b.winners, 10) || 1, 1), 50);
  const durationMin = Math.min(Math.max(parseInt(b.duration_min, 10) || 60, 1), 43200);
  if (!botManager.isOnline(bot.id)) return res.status(400).json({ error: 'Le bot doit être en ligne pour lancer un giveaway.' });
  const entry = botManager.clients.get(bot.id);
  const guild = entry.client.guilds.cache.get(guildId);
  if (!guild) return res.status(400).json({ error: 'Le bot n\'est pas sur ce serveur.' });
  const giveaway = require('./discord/giveaway');
  const chanRef = String(b.channel || '').trim();
  const settings = store.guildSettings.get(bot.id, guildId) || {};
  const targetRef = chanRef || settings.giveaway_channel || '';
  if (!targetRef) return res.status(400).json({ error: 'Choisis un salon (ou configure le salon par défaut).' });
  const channel = panels.findChannelInGuild(guild, targetRef);
  if (!channel) return res.status(400).json({ error: 'Salon introuvable. Vérifie le salon choisi.' });
  try {
    const r = await giveaway.startGiveawayDashboard(bot.id, guild, channel, {
      prize, winners, durationMin,
      pingRole: String(b.ping_role !== undefined ? b.ping_role : settings.giveaway_ping_role || ''),
      message: String(b.message !== undefined ? b.message : settings.giveaway_message || ''),
      color: String(b.color !== undefined ? b.color : settings.giveaway_color || ''),
    });
    res.json({ ok: true, ends_at: r.ends_at, channel: r.channel });
  } catch (e) {
    res.status(400).json({ error: e.message.slice(0, 200) });
  }
});

// Rôles temporaires
router.get('/bots/:id/guilds/:guildId/temproles', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ roles: store.tempRoles.all(bot.id, req.params.guildId) });
});

router.delete('/bots/:id/guilds/:guildId/temproles/:rid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.tempRoles.remove(Number(req.params.rid));
  res.json({ ok: true });
});

// v212 — Panneau du salon privé de ticket (textes + couleur modifiables).
// Les champs vides gardent le message par défaut du bot (concis).
router.put('/bots/:id/guilds/:guildId/ticket-room', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { color, title, welcome, steps } = req.body || {};
  const cur = (() => { try { return JSON.parse(String((store.guildSettings.get(bot.id, guildId) || {}).ticket_room || '{}')); } catch { return {}; } })();
  const next = { ...cur };
  if (color !== undefined) next.color = /^#[0-9a-fA-F]{6}$/.test(String(color)) ? String(color) : '';
  if (title !== undefined) next.title = String(title || '').trim().slice(0, 100);
  if (welcome !== undefined) next.welcome = String(welcome || '').trim().slice(0, 1500);
  if (steps !== undefined) next.steps = String(steps || '').trim().slice(0, 1200);
  store.guildSettings.set(bot.id, guildId, { ticket_room: next });
  res.json({ ok: true });
});

// v211 — Profils d'envoi multiples : créer un alias (nom + avatar image)
const ALIAS_LIMIT = 10;
async function saveAvatar(avatar_b64) {
  if (typeof avatar_b64 !== 'string' || !avatar_b64.startsWith('data:')) return '';
  const m = avatar_b64.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return '';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new Error('Image trop lourde (3 Mo max).');
  const assets = require('./assets');
  return `/assets/${await assets.put(buf, m[1])}`;
}
router.put('/bots/:id/guilds/:guildId/profiles', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  if (store.profileAliases.count(bot.id, guildId) >= ALIAS_LIMIT) return res.status(400).json({ error: `Maximum ${ALIAS_LIMIT} profils d'envoi par serveur.` });
  const { name, avatar_b64 } = req.body || {};
  const trimmed = String(name || '').trim().slice(0, 80);
  if (!trimmed) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  try {
    const avatar_url = await saveAvatar(avatar_b64);
    const id = store.profileAliases.create(bot.id, guildId, { name: trimmed, avatar_url });
    return res.json({ ok: true, alias: store.profileAliases.get(id) });
  } catch (e) {
    return res.status(400).json({ error: e.message.slice(0, 150) });
  }
});
// v211 — Modifier un alias (avatar) ou le supprimer
router.delete('/bots/:id/guilds/:guildId/profiles/:aliasId', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const alias = store.profileAliases.get(Number(req.params.aliasId));
  if (!alias || String(alias.bot_id) !== String(bot.id) || alias.guild_id !== guildId) {
    return res.status(404).json({ error: 'Profil introuvable.' });
  }
  if (store.profileState.getActive(bot.id, guildId) === alias.id) store.profileState.setActive(bot.id, guildId, 0);
  store.profileAliases.remove(alias.id);
  return res.json({ ok: true, profile_active: store.profileState.getActive(bot.id, guildId) });
});
// v211 — Choisir quel profil signe les messages (alias_id, 0 = principal/bot)
router.put('/bots/:id/guilds/:guildId/profile-active', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const aliasId = parseInt((req.body || {}).alias_id, 10) || 0;
  if (aliasId !== 0) {
    const alias = store.profileAliases.get(aliasId);
    if (!alias || String(alias.bot_id) !== String(bot.id) || alias.guild_id !== guildId) {
      return res.status(404).json({ error: 'Profil introuvable.' });
    }
  }
  store.profileState.setActive(bot.id, guildId, aliasId);
  return res.json({ ok: true, profile_active: aliasId });
});

// Identité du bot sur un serveur (nom, bio, couleur + images en base64)
router.put('/bots/:id/guilds/:guildId/profile', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
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
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.botProfiles.remove(bot.id, guildId);
  res.json({ ok: true });
});

// Niveaux (XP) par serveur
router.put('/bots/:id/guilds/:guildId/xp', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { enabled, min, max, cooldown, message, channel, roles, card } = req.body || {};
  store.guildSettings.set(bot.id, guildId, {
    xp_enabled: (enabled === false || enabled === 0) ? 0 : 1,
    xp_min: Math.min(Math.max(parseInt(min, 10) || 10, 1), 1000),
    xp_max: Math.max(parseInt(max, 10) || 25, 1),
    xp_cooldown: Math.max(parseInt(cooldown, 10) || 60, 0),
    xp_message: String(message || '').slice(0, 500),
    xp_channel: String(channel || '').slice(0, 100),
    xp_card: (card === false || card === 0) ? 0 : 1,
  });
  if (Array.isArray(roles)) {
    // v214 — échelle de rôles : un seul rôle par niveau (le dernier écrase),
    // trié par niveau, limité à 60 paliers.
    const seen = new Map();
    for (const r of roles) {
      const level = Math.max(1, parseInt(r && r.level, 10) || 1);
      const roleName = String(r && r.role || '').trim().slice(0, 100);
      if (level >= 1 && roleName) seen.set(level, roleName);
    }
    store.xpRoles.replace(bot.id, guildId, [...seen.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 60)
      .map(([level, role]) => ({ level, role })));
  }
  res.json({ ok: true });
});

// 🔄 v214 — Synchroniser les rôles de niveau : donne (ou corrige) le rôle du
// rang à chaque membre ayant déjà l'XP nécessaire, et retire les anciens rôles
// de palier. Traitement borné par lot pour rester fluide ; relançable.
router.post('/bots/:id/guilds/:guildId/xp/sync', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const rewards = store.xpRoles.all(bot.id, guildId);
  if (!rewards.length) return res.json({ ok: true, configured: 0, message: 'Aucun rôle de niveau configuré — ajoute des récompenses puis réessaie.' });
  const entry = botManager.clients.get(bot.id);
  const guild = entry && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
  if (!guild) return res.status(400).json({ error: 'Le bot est hors ligne ou absent de ce serveur.' });
  const xp = require('./discord/xp');
  const rows = (store.xp.rows(bot.id, guildId) || []).filter((r) => Number(r.level) >= 1);
  const limit = Math.min(Math.max(parseInt((req.body || {}).limit, 10) || 250, 1), 400);
  let present = 0, added = 0, removed = 0, processed = 0, failed = 0;
  for (const row of rows) {
    if (processed >= limit) break;
    processed += 1;
    const member = await guild.members.fetch(String(row.user_id)).catch(() => null);
    if (!member || (member.user && member.user.bot)) { failed += 1; continue; }
    present += 1;
    try {
      const out = await xp.applyRankToMember(bot.id, guild, member, Number(row.level), rewards);
      added += out.added;
      removed += out.removed;
    } catch (e) { failed += 1; }
  }
  res.json({ ok: true, configured: rewards.length, rows: rows.length, present, processed, added, removed, remaining: Math.max(0, rows.length - processed) });
});

// Auto-modération par serveur
const AUTOMOD_RULES = ['links', 'caps', 'mentions', 'words', 'spam'];
const AUTOMOD_RULE_ACTIONS = ['inherit', 'log', 'delete', 'warn', 'timeout', 'kick', 'ban'];
const AUTOMOD_BLACKLIST_RULES = AUTOMOD_RULES;

function payloadList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

function normalizeAutomodList(value, max, maxLength) {
  return [...new Set(payloadList(value)
    .map((entry) => String(entry || '').trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, max);
}

function normalizeAutomodUsers(value) {
  return [...new Set(payloadList(value).map((entry) => {
    const id = String(entry || '').replace(/[<@!>]/g, '').trim();
    return /^\d{15,21}$/.test(id) ? id : '';
  }).filter(Boolean))].slice(0, 100);
}

function normalizeAutomodRuleActions(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  const out = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const rule of AUTOMOD_RULES) {
    const action = String(source[rule] || 'inherit');
    if (AUTOMOD_RULE_ACTIONS.includes(action) && action !== 'inherit') out[rule] = action;
  }
  return out;
}

function normalizeAutomodBlacklistRules(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  const out = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const rule of AUTOMOD_BLACKLIST_RULES) {
    if (source[rule] === true || source[rule] === 1 || source[rule] === '1' || source[rule] === 'true') out[rule] = true;
  }
  return out;
}

function normalizeAutomodBlacklistThresholds(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  const out = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const rule of AUTOMOD_BLACKLIST_RULES) {
    const count = Math.min(Math.max(parseInt(source[rule], 10) || 0, 0), 50);
    if (count > 0) out[rule] = count;
  }
  return out;
}

const AUTOMOD_ESC_RULES = ['links', 'caps', 'mentions', 'words', 'spam'];
const AUTOMOD_ESC_ACTIONS = ['delete', 'warn', 'timeout', 'kick', 'ban'];
const AUTOMOD_ESC_MAX_MIN = { timeout: 40320, ban: 525600 };

// v213 — Barème progressif : ne conserve que les règles réellement activées,
// avec fenêtre glissante et paliers assainis (action, durée, blacklist).
function normalizeAutomodEscalation(value) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = {}; }
  }
  const rules = (source && typeof source === 'object' && !Array.isArray(source)
    && source.rules && typeof source.rules === 'object' && !Array.isArray(source.rules)) ? source.rules : {};
  const out = { rules: {} };
  for (const rule of AUTOMOD_ESC_RULES) {
    const entry = rules[rule];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !entry.enabled) continue;
    const windowMin = Math.min(Math.max(parseInt(entry.windowMin, 10) || 1440, 1), 525600);
    const steps = (Array.isArray(entry.steps) ? entry.steps : [])
      .map((st) => ({
        after: Math.min(Math.max(parseInt(st && st.after, 10) || 0, 0), 200),
        action: AUTOMOD_ESC_ACTIONS.includes(String(st && st.action)) ? String(st.action) : 'warn',
        minutes: Math.min(Math.max(parseInt(st && st.minutes, 10) || 0, 0), AUTOMOD_ESC_MAX_MIN[String(st && st.action)] || 0),
        blacklist: !!(st && st.blacklist),
        blacklistMin: Math.min(Math.max(parseInt(st && st.blacklistMin, 10) || 0, 0), 525600),
      }))
      .filter((st) => st.after >= 1)
      .map((st) => (st.action === 'timeout' && st.minutes < 1 ? { ...st, minutes: 60 } : st))
      .sort((a, b) => a.after - b.after);
    if (steps.length) out.rules[rule] = { enabled: true, windowMin, steps };
  }
  return out;
}

router.put('/bots/:id/guilds/:guildId/automod', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const body = req.body || {};
  const { enabled, links, caps, mentions, spam, ignore_staff, warn_text, timeout_min, warn_limit, warn_action, warn_timeout_min, blacklist } = body;
  const advancedFields = {};
  if (body.mode !== undefined) advancedFields.am_mode = body.mode === 'observe' ? 'observe' : 'enforce';
  if (body.rule_actions !== undefined) advancedFields.am_rule_actions = JSON.stringify(normalizeAutomodRuleActions(body.rule_actions));
  if (body.blacklist_rules !== undefined) advancedFields.am_blacklist_rules = JSON.stringify(normalizeAutomodBlacklistRules(body.blacklist_rules));
  if (body.escalation !== undefined) advancedFields.am_escalation = JSON.stringify(normalizeAutomodEscalation(body.escalation));
  if (body.blacklist_thresholds !== undefined) advancedFields.am_blacklist_thresholds = JSON.stringify(normalizeAutomodBlacklistThresholds(body.blacklist_thresholds));
  if (body.blacklist_duration_min !== undefined) advancedFields.am_blacklist_duration_min = Math.min(Math.max(parseInt(body.blacklist_duration_min, 10) || 0, 0), 525600);
  if (body.blacklist_channel !== undefined) advancedFields.am_blacklist_channel = String(body.blacklist_channel || '').slice(0, 100);
  if (body.blacklist_title !== undefined) advancedFields.am_blacklist_title = String(body.blacklist_title || '🚫 Membre ajouté à la blacklist').slice(0, 120);
  if (body.blacklist_color !== undefined) advancedFields.am_blacklist_color = /^#[0-9a-fA-F]{6}$/.test(String(body.blacklist_color || '')) ? String(body.blacklist_color) : '#ED4245';
  if (body.blacklist_footer !== undefined) advancedFields.am_blacklist_footer = String(body.blacklist_footer || 'Blacklist du serveur · Hoxera').slice(0, 200);
  if (body.native_enabled !== undefined) advancedFields.am_native_enabled = body.native_enabled ? 1 : 0;
  if (body.native_alert_channel !== undefined) advancedFields.am_native_alert_channel = String(body.native_alert_channel || '').slice(0, 100);
  if (body.exempt_roles !== undefined) advancedFields.am_exempt_roles = JSON.stringify(normalizeAutomodList(body.exempt_roles, 50, 30));
  if (body.exempt_channels !== undefined) advancedFields.am_exempt_channels = JSON.stringify(normalizeAutomodList(body.exempt_channels, 100, 100));
  if (body.exempt_users !== undefined) advancedFields.am_exempt_users = JSON.stringify(normalizeAutomodUsers(body.exempt_users));
  store.guildSettings.set(bot.id, guildId, {
    am_enabled: enabled ? 1 : 0,
    am_links: (links === false || links === 0) ? 0 : 1,
    am_caps: (caps === false || caps === 0) ? 0 : 1,
    am_mentions: Math.max(parseInt(mentions, 10) || 0, 0),
    am_spam: Math.max(parseInt(spam, 10) || 0, 0),
    ...(ignore_staff !== undefined ? { am_ignore_staff: ignore_staff ? 1 : 0 } : {}),
    ...(warn_text !== undefined ? { am_warn_text: String(warn_text).slice(0, 1000) } : {}),
    ...(timeout_min !== undefined ? { am_timeout_min: Math.min(Math.max(parseInt(timeout_min, 10) || 5, 1), 1440) } : {}),
    ...(warn_limit !== undefined ? { am_warn_limit: Math.min(Math.max(parseInt(warn_limit, 10) || 0, 0), 50) } : {}),
    ...(warn_action !== undefined ? { am_warn_action: ['none', 'timeout', 'kick', 'ban'].includes(String(warn_action)) ? String(warn_action) : 'timeout' } : {}),
    ...(warn_timeout_min !== undefined ? { am_warn_timeout_min: Math.min(Math.max(parseInt(warn_timeout_min, 10) || 10, 1), 1440) } : {}),
    ...advancedFields,
  });
  if (Array.isArray(blacklist)) {
    const words = blacklist.map((w) => String(w).trim().toLowerCase()).filter((w) => w.length >= 2).slice(0, 100);
    const existing = store.blacklist.all(bot.id, guildId);
    for (const w of existing) if (!words.includes(w)) store.blacklist.remove(bot.id, guildId, w);
    for (const w of words) store.blacklist.add(bot.id, guildId, w);
  }
  let native = null;
  if (body.native_enabled !== undefined || body.native_alert_channel !== undefined) {
    try {
      const entry = botManager.clients.get(bot.id);
      const guild = entry && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
      native = guild
        ? await require('./discord/nativeAutomod').syncGuild(bot.id, guild, { client: entry.client })
        : { ok: false, error: 'Le bot est hors ligne ou absent de ce serveur.' };
    } catch (e) { native = { ok: false, error: String(e.message || e).slice(0, 180) }; }
  }
  res.json({ ok: true, native });
});

// 📊 Centre de contrôle Auto-Mod : statistiques agrégées pour le dashboard.
router.get('/bots/:id/guilds/:guildId/automod/summary', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json(store.automodLogs.summary(bot.id, guildId));
});

// ☁️ Auto-Mod officiel Discord : état des règles natives créées par Optimus Prime.
router.get('/bots/:id/guilds/:guildId/automod/native', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const entry = botManager.clients.get(bot.id);
  const guild = entry && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
  if (!guild) return res.status(503).json({ error: 'Le bot est hors ligne ou absent de ce serveur.' });
  const nativeAutomod = require('./discord/nativeAutomod');
  res.json(await nativeAutomod.status(bot.id, guild, entry.client));
});

router.post('/bots/:id/guilds/:guildId/automod/native/sync', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const body = req.body || {};
  store.guildSettings.set(bot.id, guildId, {
    ...(body.enabled !== undefined ? { am_native_enabled: body.enabled ? 1 : 0 } : {}),
    ...(body.alert_channel !== undefined ? { am_native_alert_channel: String(body.alert_channel || '').slice(0, 100) } : {}),
  });
  const entry = botManager.clients.get(bot.id);
  const guild = entry && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
  if (!guild) return res.status(503).json({ error: 'Le bot est hors ligne ou absent de ce serveur.' });
  const nativeAutomod = require('./discord/nativeAutomod');
  const result = await nativeAutomod.syncGuild(bot.id, guild, { client: entry.client });
  res.status(result.ok ? 200 : 400).json(result);
});

// 🧪 Simulateur sans risque : analyse un texte avec les règles réelles,
// sans envoyer, supprimer ou sanctionner aucun message Discord.
router.post('/bots/:id/guilds/:guildId/automod/simulate', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const content = String((req.body || {}).content || '').slice(0, 2000);
  if (!content.trim()) return res.status(400).json({ error: 'Écris un message à analyser.' });
  const automod = require('./discord/automod');
  const result = automod.analyzeContent(bot.id, guildId, content, {
    channelId: String((req.body || {}).channel_id || '').slice(0, 100),
    channelName: String((req.body || {}).channel_name || '').slice(0, 100),
    userId: String((req.body || {}).user_id || '').slice(0, 30),
    spamCount: Math.min(Math.max(parseInt((req.body || {}).spam_count, 10) || 0, 0), 100),
  });
  res.json({ ok: true, content, ...result });
});

// 📊 Statistiques d'utilisation des commandes (par serveur)
router.get('/bots/:id/guilds/:guildId/stats/commands', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const guildId = req.params.guildId;
  res.json({
    total: store.cmdStats.total(bot.id, guildId),
    top: store.cmdStats.top(bot.id, guildId, 12),
    byDay: store.cmdStats.perDay(bot.id, guildId, 7),
  });
});

// 📨 Top des recruteurs (traqueur d'invitations) + ⭐ compteur starboard
router.get('/bots/:id/guilds/:guildId/community', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const guildId = req.params.guildId;
  res.json({
    invitesTop: store.inviteJoins.top(bot.id, guildId, 10),
    starboardCount: store.starboard.count(bot.id, guildId),
  });
});

// 🔴 Annonces de live : liste / ajout / suppression des liens sociaux
router.get('/bots/:id/guilds/:guildId/livesocials', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ socials: store.liveSocials.all(bot.id, req.params.guildId) });
});
router.post('/bots/:id/guilds/:guildId/livesocials', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { link, platform, user_id } = req.body || {};
  const { parseSocial } = require('./discord/liveWatch');
  const parsed = parseSocial(link, platform);
  if (!parsed) return res.status(400).json({ error: 'Lien ou pseudo invalide. Colle un lien complet (tiktok.com/@pseudo, twitch.tv/pseudo…) ou un @pseudo + la plateforme.' });
  if (store.liveSocials.count(bot.id, req.params.guildId) >= 20) return res.status(400).json({ error: 'Limite atteinte : 20 comptes suivis par serveur.' });
  store.liveSocials.add(bot.id, req.params.guildId, String(user_id || '').slice(0, 30), parsed.platform, parsed.handle);
  res.json({ ok: true, platform: parsed.platform, handle: parsed.handle });
});
// 🧪 Test RÉEL de la bienvenue / du départ : le bot envoie le vrai message
// dans le vrai salon, avec TOI comme membre — sans quitter le serveur.
router.post('/bots/:id/guilds/:guildId/events/:type/test', requireAuth, eventsTestRateLimit, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const type = req.params.type;
  if (!['member_join', 'member_leave'].includes(type)) return res.status(400).json({ error: 'Type inconnu.' });
  const entry = botManager.clients.get(bot.id);
  if (!entry || !entry.client.isReady()) return res.status(503).json({ error: 'Bot hors ligne.' });
  const guild = entry.client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ error: 'Serveur introuvable.' });
  const me = store.users.get(req.userId);
  if (!me || !me.discord_id) return res.status(400).json({ error: 'Compte Discord non lié.' });
  const member = await guild.members.fetch(me.discord_id).catch(() => null);
  if (!member) return res.status(404).json({ error: 'Tu n\'es pas membre de ce serveur.' });
  try {
    const events = require('./discord/events');
    if (type === 'member_join') await events.runJoinEvent(bot.id, member, { test: true });
    else await events.runLeaveEvent(bot.id, member, { test: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
});

// 🔔 Centre de notifications : le dashboard détecte lui-même les problèmes
// (salon configuré introuvable, permissions manquantes) + infos utiles.
router.get('/bots/:id/guilds/:guildId/notifications', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const warnings = [];
  const infos = [];
  try {
    const entry = botManager.clients.get(bot.id);
    if (!entry || !entry.client.isReady()) {
      warnings.push({ icon: '🔴', text: 'Le bot est hors ligne — aucune fonctionnalité ne tourne.' });
      return res.json({ warnings, infos });
    }
    const guild = entry.client.guilds.cache.get(guildId);
    if (!guild) return res.json({ warnings: [{ icon: '❓', text: 'Serveur introuvable côté bot.' }], infos });
    const me = guild.members.me;
    const { PermissionFlagsBits } = require('discord.js');

    const gs = store.guildSettings.get(bot.id, guildId) || {};
    const ev = store.events.all(bot.id, guildId) || {};
    const tcfg = store.tickets.get(bot.id, guildId) || {};
    const { findLiveChannel } = require('./discord/liveWatch');
    const findChan = (q) => {
      if (!String(q || '').trim().replace(/^#/, '')) return undefined; // non configuré
      return findLiveChannel(guild, q);
    };
    // Chaque salon configuré doit exister ET être écrivable par le bot
    const checks = [
      ['Bienvenue', ev.member_join && ev.member_join.enabled ? (ev.member_join.config || {}).channel : ''],
      ['Départs', ev.member_leave && ev.member_leave.enabled ? (ev.member_leave.config || {}).channel : ''],
      ['Panneau de tickets', tcfg.channel],
      ['Journal des tickets', gs.ticket_log_channel],
      ['Journaux du serveur', gs.log_channel],
      ['Starboard', gs.starboard_channel],
      ['Annonces de live', gs.live_channel],
      ['Suggestions', gs.suggestion_channel],
    ];
    for (const [label, q] of checks) {
      const c = findChan(q);
      if (c === undefined) continue; // module non configuré : rien à dire
      if (c === null) { warnings.push({ icon: '🔎', text: `${label} : le salon « ${q} » est introuvable (renommé ou supprimé ?)` }); continue; }
      const perms = me ? c.permissionsFor(me) : null;
      if (perms && !perms.has(PermissionFlagsBits.SendMessages)) warnings.push({ icon: '🔒', text: `${label} : le bot ne peut pas ÉCRIRE dans #${c.name}` });
      else if (perms && !perms.has(PermissionFlagsBits.EmbedLinks)) warnings.push({ icon: '🖼️', text: `${label} : il manque « Intégrer des liens » dans #${c.name} (panneaux invisibles)` });
    }
    // Permissions globales selon les modules actifs
    const has = (f) => !!(me && me.permissions && me.permissions.has(f));
    if ((ev.autorole && ev.autorole.enabled) && !has(PermissionFlagsBits.ManageRoles)) warnings.push({ icon: '🏷️', text: 'Auto-rôle actif mais permission « Gérer les rôles » manquante.' });
    if (tcfg.channel && !has(PermissionFlagsBits.ManageChannels)) warnings.push({ icon: '🎫', text: 'Tickets actifs mais permission « Gérer les salons » manquante.' });
    if (((gs.warn_timeout_limit > 0 || gs.warn_limit > 0 || (gs.am_warn_limit > 0 && gs.am_warn_action === 'timeout')) && !has(PermissionFlagsBits.ModerateMembers))) warnings.push({ icon: '⚖️', text: 'Timeouts automatiques actifs mais permission « Exclure temporairement » manquante.' });
    if (gs.am_warn_limit > 0 && gs.am_warn_action === 'kick' && !has(PermissionFlagsBits.KickMembers)) warnings.push({ icon: '👢', text: 'Sanction auto-mod réglée sur expulsion mais permission « Expulser des membres » manquante.' });
    if (gs.am_warn_limit > 0 && gs.am_warn_action === 'ban' && !has(PermissionFlagsBits.BanMembers)) warnings.push({ icon: '🔨', text: 'Sanction auto-mod réglée sur bannissement mais permission « Bannir des membres » manquante.' });
    if (store.liveSocials.count(bot.id, guildId) > 0 && !gs.live_channel) warnings.push({ icon: '🔴', text: 'Comptes live suivis mais AUCUN salon d\'annonces configuré !' });
    if (store.inviteJoins.top(bot.id, guildId, 1).length === 0 && !has(PermissionFlagsBits.ManageGuild)) infos.push({ icon: '📨', text: 'Traqueur d\'invitations : donne « Gérer le serveur » au bot pour l\'activer.' });

    // Infos du jour
    const today = new Date().toISOString().slice(0, 10);
    try {
      const j = store.db.prepare('SELECT count FROM join_stats WHERE bot_id = ? AND guild_id = ? AND day = ?').get(bot.id, guildId, today);
      if (j && j.count) infos.push({ icon: '🆕', text: `${j.count} nouveau(x) membre(s) aujourd'hui — bienvenue à eux !` });
    } catch {}
    try {
      const open = store.openTickets.allForGuild(bot.id, guildId).filter((t) => !t.closed_at).length;
      if (open) infos.push({ icon: '🎫', text: `${open} ticket(s) ouvert(s) en ce moment.` });
    } catch {}
  } catch (e) {
    warnings.push({ icon: '⚠️', text: 'Vérification impossible : ' + String(e.message || e).slice(0, 80) });
  }
  res.json({ warnings, infos });
});

// 📰 Flux d'activité du serveur (Vue d'ensemble)
router.get('/bots/:id/guilds/:guildId/activity', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ items: store.activity.recent(bot.id, req.params.guildId, 30) });
});

// 🔎 Recherche de transcriptions (Phase 3, v196) : par salon, serveur,
// ouvreur, type ou contenu. Sans mot-clé : les 100 plus récentes.
router.get('/bots/:id/guilds/:guildId/transcripts', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const q = String(req.query.q || '').trim().slice(0, 60);
  res.json({ items: store.transcripts.list(bot.id, req.params.guildId, q) });
});

// 💬 Modmail : configuration + conversations ouvertes (Phase 3, v196)
router.get('/bots/:id/guilds/:guildId/modmail', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const cfg = store.guildSettings.get(bot.id, req.params.guildId) || {};
  res.json({
    enabled: !!cfg.modmail_enabled,
    channel: cfg.modmail_channel || '',
    open: store.modmail.listOpen(bot.id, req.params.guildId),
    history: store.modmail.listAll(bot.id, req.params.guildId, 20),
  });
});

router.put('/bots/:id/guilds/:guildId/modmail', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { enabled, channel } = req.body || {};
  const cfg = store.guildSettings.get(bot.id, req.params.guildId) || {};
  store.guildSettings.set(bot.id, req.params.guildId, {
    modmail_enabled: enabled === undefined ? !!cfg.modmail_enabled : !!enabled,
    modmail_channel: String(channel || cfg.modmail_channel || '').slice(0, 100),
  });
  store.activity.add(bot.id, req.params.guildId, '💬', 'Modmail : configuration mise à jour');
  res.json({ ok: true });
});

router.post('/bots/:id/guilds/:guildId/modmail/close', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { threadId } = req.body || {};
  const list = store.modmail.listOpen(bot.id, req.params.guildId);
  const target = list.find((t) => String(t.thread_id) === String(threadId || ''));
  if (!target) return res.status(404).json({ error: 'Conversation introuvable ou déjà fermée.' });
  store.modmail.close(target.id);
  store.activity.add(bot.id, req.params.guildId, '🔒', 'Modmail : conversation fermée');
  res.json({ ok: true });
});

// 🧪 Test en direct d'un compte suivi : le serveur (IP de production) exécute
// le détecteur ET vérifie le vrai salon/les permissions d'annonce.
router.post('/bots/:id/guilds/:guildId/livesocials/:sid/test', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const s = store.liveSocials.all(bot.id, guildId).find((x) => x.id === Number(req.params.sid));
  if (!s) return res.status(404).json({ error: 'Compte introuvable.' });
  const gs = store.guildSettings.get(bot.id, guildId) || {};
  try {
    const { CHECKERS, findLiveChannel, channelPermissionIssue } = require('./discord/liveWatch');
    const entry = botManager.clients.get(bot.id);
    const guild = entry && entry.client && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
    const channel = guild ? findLiveChannel(guild, gs.live_channel) : null;
    const channelIssue = channel ? channelPermissionIssue(guild, channel) : (gs.live_channel ? 'salon d\'annonces introuvable côté bot' : 'aucun salon d\'annonces configuré');
    const r = CHECKERS[s.platform] ? await CHECKERS[s.platform](s.handle) : null;
    if (!r) return res.json({ ok: false, channelSet: !!channel, channelName: channel ? channel.name : '', channelIssue, error: 'Plateforme injoignable depuis le serveur (réessaie dans quelques minutes).' });
    res.json({ ok: true, channelSet: !!channel, channelName: channel ? channel.name : '', channelIssue, live: r.live, liveKey: r.liveKey || '', name: r.name });
  } catch (e) {
    res.json({ ok: false, channelSet: false, error: String(e.message || e).slice(0, 200) });
  }
});

router.delete('/bots/:id/guilds/:guildId/livesocials/:sid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.liveSocials.remove(bot.id, req.params.guildId, Number(req.params.sid));
  res.json({ ok: true });
});

// 🎮 Événements & tournois (v189)
router.get('/bots/:id/guilds/:guildId/events', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const tz = (store.guildSettings.get(bot.id, req.params.guildId) || {}).timezone || 'Europe/Paris';
  res.json({ events: store.guildEvents.all(bot.id, req.params.guildId), tz });
});

router.post('/bots/:id/guilds/:guildId/events', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { title, description, starts_at, channel_id, ping_role } = req.body || {};
  const tz = (store.guildSettings.get(bot.id, req.params.guildId) || {}).timezone || 'Europe/Paris';
  const { parseWhen } = require('./discord/guildEvents');
  let startsAt = parseInt(starts_at, 10) || 0;
  if (!startsAt && typeof starts_at === 'string') startsAt = parseWhen(starts_at, tz) || 0;
  if (!startsAt || startsAt <= Date.now()) return res.status(400).json({ error: 'Date invalide ou passée.' });
  if (store.guildEvents.all(bot.id, req.params.guildId).length >= 50) return res.status(400).json({ error: 'Limite : 50 événements par serveur.' });
  const id = store.guildEvents.add(bot.id, req.params.guildId, {
    title: String(title || '').slice(0, 100),
    description: String(description || '').slice(0, 1000),
    starts_at: startsAt,
    channel_id: String(channel_id || '').slice(0, 40),
    ping_role: String(ping_role || 'none').slice(0, 100),
    created_by: String(req.userId || ''),
  });
  // Envoi du message d'annonce si le bot est en ligne sur ce serveur
  try {
    const entry = botManager.clients.get(bot.id);
    const guild = entry && entry.client.isReady() ? entry.client.guilds.cache.get(req.params.guildId) : null;
    const channel = guild && channel_id ? guild.channels.cache.get(String(channel_id)) : null;
    if (channel && typeof channel.send === 'function') {
      const guildEvents = require('./discord/guildEvents');
      const ev = store.guildEvents.get(id);
      await channel.send({ embeds: guildEvents.eventPanel(entry, req.params.guildId, ev).embeds, components: guildEvents.eventButtons(ev) }).catch(() => {});
    }
  } catch (e) { console.error('[Hoxera] event announce:', e.message); }
  res.json({ ok: true, id });
});

router.delete('/bots/:id/guilds/:guildId/events/:eid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.guildEvents.remove(Number(req.params.eid));
  res.json({ ok: true });
});

// Note moyenne du support (étoiles données par les membres après la clôture)
router.get('/bots/:id/guilds/:guildId/tickets/rating', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json(store.ticketRatings.stats(bot.id, req.params.guildId));
});

// 🛡️ Bouclier anti-raid : configuration
router.put('/bots/:id/guilds/:guildId/antiraid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { enabled, threshold, window, action, unlock_min } = req.body || {};
  store.guildSettings.set(bot.id, req.params.guildId, {
    antiraid_enabled: enabled ? 1 : 0,
    antiraid_threshold: Math.min(Math.max(parseInt(threshold, 10) || 10, 2), 100),
    antiraid_window: Math.min(Math.max(parseInt(window, 10) || 30, 5), 600),
    antiraid_action: ['lockdown', 'alert'].includes(action) ? action : 'lockdown',
    antiraid_unlock_min: Math.min(Math.max(parseInt(unlock_min, 10) || 0, 0), 1440),
  });
  res.json({ ok: true });
});

// 🛡️ État actuel du bouclier (armé ? serveur verrouillé ? quand ?)
router.get('/bots/:id/guilds/:guildId/antiraid/state', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const antiraid = require('./discord/antiraid');
  const entry = botManager.clients.get(bot.id);
  const guild = entry && entry.client.guilds.cache.get(req.params.guildId);
  res.json({
    config: antiraid.config(bot.id, req.params.guildId),
    raid: antiraid.raidState(req.params.guildId),
    lockdown: guild ? require('./discord/lockdown').state(bot.id, guild) : { locked: false, channels: [] },
  });
});

// 🛡️ Test RÉEL : verrouille le serveur comme un vrai raid (réouverture auto
// forcée à 1 minute pour ne pas laisser le serveur fermé).
router.post('/bots/:id/guilds/:guildId/antiraid/test', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const entry = botManager.clients.get(bot.id);
  if (!entry || !entry.client.isReady()) return res.status(503).json({ error: 'Le bot est hors ligne — impossible de tester.' });
  const guild = entry.client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ error: 'Serveur introuvable pour le bot.' });
  const antiraid = require('./discord/antiraid');
  const cfg = antiraid.config(bot.id, guildId);
  const r = await antiraid.trigger(bot.id, guild, {
    count: cfg.threshold,
    window: cfg.window,
    action: cfg.action,
    unlockMin: 1, // test : réouverture automatique après 1 minute
    byTag: `Test du dashboard par ${req.userId}`,
  });
  res.json({ ok: true, ...r });
});

// 🔓 Réouverture manuelle immédiate
router.post('/bots/:id/guilds/:guildId/antiraid/unlock', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const entry = botManager.clients.get(bot.id);
  if (!entry || !entry.client.isReady()) return res.status(503).json({ error: 'Le bot est hors ligne.' });
  const guild = entry.client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ error: 'Serveur introuvable pour le bot.' });
  const antiraid = require('./discord/antiraid');
  await antiraid.unlockNow(bot.id, guild);
  res.json({ ok: true });
});

// Historique des actions d'auto-modération (visible dans le dashboard)
router.get('/bots/:id/guilds/:guildId/automod/logs', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ logs: store.automodLogs.recent(bot.id, req.params.guildId, 50) });
});

// 🚫 Retrait d'un membre de la blacklist du serveur. On conserve la ligne
// pour l'historique et on ne supprime jamais le journal Auto-Mod.
router.delete('/bots/:id/guilds/:guildId/automod/blacklist/:userId', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const userId = String(req.params.userId || '').replace(/[<@!>]/g, '');
  if (!/^\d{15,21}$/.test(userId)) return res.status(400).json({ error: 'Membre invalide.' });
  const result = store.memberBlacklist.remove(bot.id, guildId, userId, req.userId || '');
  if (!result.changes) return res.status(404).json({ error: 'Ce membre n’est pas dans la blacklist active.' });
  store.memberBlacklistCounters.resetUser(bot.id, guildId, userId);
  res.json({ ok: true });
});

// ⚠️ Historique unifié des avertissements (manuel + auto-mod), visible dans
// le panneau de modération. Les noms sont enrichis depuis le cache Discord.
router.get('/bots/:id/guilds/:guildId/warnings', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const entry = botManager.clients.get(bot.id);
  const guild = entry && entry.client && entry.client.isReady() ? entry.client.guilds.cache.get(guildId) : null;
  const memberName = (userId) => {
    const member = guild && guild.members && guild.members.cache ? guild.members.cache.get(String(userId)) : null;
    return member ? (member.user && (member.user.tag || member.user.username)) || member.displayName || String(userId) : String(userId);
  };
  const channelName = (channelId) => {
    const channel = guild && guild.channels && guild.channels.cache ? guild.channels.cache.get(String(channelId)) : null;
    return channel ? channel.name : '';
  };
  const settings = store.guildSettings.get(bot.id, guildId) || {};
  res.json({
    warnings: store.warnings.recent(bot.id, guildId, 100).map((w) => ({
      ...w,
      user_tag: memberName(w.user_id),
      channel_name: channelName(w.channel_id),
    })),
    summary: store.warnings.summary(bot.id, guildId, 100).map((w) => ({ ...w, user_tag: memberName(w.user_id) })),
    config: {
      limit: parseInt(settings.am_warn_limit, 10) || 0,
      action: settings.am_warn_action || 'none',
      timeout_min: parseInt(settings.am_warn_timeout_min, 10) || 10,
    },
  });
});

// Réinitialisation réservée au gestionnaire du serveur : le membre repart
// avec zéro avertissement, sans supprimer les journaux auto-mod détaillés.
router.delete('/bots/:id/guilds/:guildId/warnings/:userId', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.warnings.clear(bot.id, guildId, req.params.userId);
  res.json({ ok: true });
});

// Permissions RÉELLES du bot sur un serveur (diagnostic)
router.get('/bots/:id/guilds/:guildId/permissions', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json(botManager.getGuildPerms(bot.id, req.params.guildId));
});

// 🧪 Test réel de l'auto-mod : envoie un message piégé dans un salon,
// l'auto-mod le traite, et le dashboard reçoit le résultat exact.
router.post('/bots/:id/guilds/:guildId/automod/test', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { channel_id, type } = req.body || {};
  if (!channel_id) return res.status(400).json({ error: 'Choisis un salon pour le test.' });
  const types = ['link', 'caps', 'mentions', 'word', 'spam'];
  if (!types.includes(type)) return res.status(400).json({ error: 'Type de test inconnu.' });
  const entry = botManager.clients.get(bot.id);
  if (!entry || !entry.client.isReady()) return res.status(503).json({ error: 'Le bot est hors ligne — impossible de tester.' });
  const guild = entry.client.guilds.cache.get(guildId);
  if (!guild) return res.status(404).json({ error: 'Serveur introuvable pour le bot.' });
  const channel = guild.channels.cache.get(String(channel_id));
  if (!channel || typeof channel.send !== 'function') return res.status(404).json({ error: 'Salon introuvable.' });
  const gs = store.guildSettings.get(bot.id, guildId) || {};
  if (gs.am_enabled !== 1) return res.status(400).json({ error: 'Active d\'abord l\'auto-modération, puis relance le test.' });
  const { runAutomod } = require('./discord/automod');
  const results = [];

  try {
    if (type === 'spam') {
      const limit = Math.min(Math.max(parseInt(gs.am_spam, 10) || 3, 1), 20);
      let last = null;
      for (let i = 0; i < limit; i++) {
        const sent = await channel.send({ content: `test auto-mod ${i + 1}` }).catch(() => null);
        if (!sent) break;
        last = await runAutomod(bot.id, sent, { force: true, noDm: true }).catch(() => ({ acted: false }));
      }
      return res.json({ ok: true, type, acted: !!(last && last.acted), reason: last && last.reason, hint: 'spam' });
    }
    let content = '';
    if (type === 'link') content = 'test https://discord.gg/hoxera-test';
    if (type === 'caps') content = 'TEST AUTOMOD HOXERA';
    if (type === 'mentions') {
      const limit = Math.min(Math.max(parseInt(gs.am_mentions, 10) || 0, 0), 20);
      if (limit <= 0) return res.json({ ok: true, type, acted: false, reason: '', hint: 'mentions_off' });
      content = Array.from({ length: limit + 1 }, (_, i) => `<@${990000000000000000 + i}>`).join(' ');
    }
    if (type === 'word') {
      const words = store.blacklist.all(bot.id, guildId);
      if (!words.length) return res.json({ ok: true, type, acted: false, reason: '', hint: 'no_words' });
      content = `voici un test ${words[0]}`;
    }
    const sent = await channel.send({ content }).catch((e) => ({ sendError: e.message }));
    if (sent && sent.sendError) return res.status(500).json({ error: `Envoi impossible : ${sent.sendError}` });
    const r = await runAutomod(bot.id, sent, { force: true, noDm: true }).catch(() => ({ acted: false }));
    return res.json({ ok: true, type, acted: !!r.acted, reason: r.reason || '', deleted: !!r.deleted });
  } catch (e) {
    return res.status(500).json({ error: `Test échoué : ${(e && e.message) || e}` });
  }
});

router.put('/bots/:id/guilds/:guildId/settings', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { prefix, lang, warn_limit, warn_action, warn_timeout_limit, warn_timeout_min, starboard_channel, starboard_min, live_channel, live_ping, ticket_log_channel, log_channel, birthday_channel, birthday_role, log_events, timezone } = req.body || {};
  store.guildSettings.set(bot.id, guildId, {
    prefix: String(prefix || '').slice(0, 5),
    ...(lang !== undefined ? { lang: ['fr', 'en', 'es', 'de', 'pt', 'it'].includes(String(lang)) ? String(lang) : 'fr' } : {}),
    warn_limit: Math.max(0, parseInt(warn_limit, 10) || 0),
    warn_action: ['none', 'timeout', 'kick', 'ban'].includes(warn_action) ? warn_action : 'none',
    ...(warn_timeout_limit !== undefined ? { warn_timeout_limit: Math.max(0, parseInt(warn_timeout_limit, 10) || 0) } : {}),
    ...(warn_timeout_min !== undefined ? { warn_timeout_min: Math.min(Math.max(parseInt(warn_timeout_min, 10) || 60, 1), 10080) } : {}),
    ...(starboard_channel !== undefined ? { starboard_channel: String(starboard_channel).slice(0, 100) } : {}),
    ...(starboard_min !== undefined ? { starboard_min: Math.min(Math.max(parseInt(starboard_min, 10) || 3, 1), 50) } : {}),
    ...(live_channel !== undefined ? { live_channel: String(live_channel).slice(0, 100) } : {}),
    ...(live_ping !== undefined ? { live_ping: ['everyone', 'here', 'none'].includes(live_ping) ? live_ping : 'everyone' } : {}),
    ...(ticket_log_channel !== undefined ? { ticket_log_channel: String(ticket_log_channel).slice(0, 100) } : {}),
    ...(log_channel !== undefined ? { log_channel: String(log_channel).slice(0, 100) } : {}),
    ...(birthday_channel !== undefined ? { birthday_channel: String(birthday_channel).slice(0, 100) } : {}),
    ...(birthday_role !== undefined ? { birthday_role: String(birthday_role).slice(0, 100) } : {}),
    ...(log_events !== undefined ? { log_events: JSON.stringify(log_events || {}) } : {}),
    ...(timezone !== undefined ? { timezone: String(timezone).slice(0, 64) } : {}),
  });
  res.json({ ok: true });
});

router.put('/bots/:id/guilds/:guildId/events/:type', requireAuth, eventsSaveRateLimit, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  if (!EVENT_DEFS[req.params.type]) return res.status(404).json({ error: 'Événement introuvable' });
  // 🧹 La config est assainie côté serveur (types, longueurs, forme
  // channelsmulti) : une config invalide ou abusive ne peut ni entrer en
  // base, ni casser l'envoi du bot.
  const config = sanitizeEventConfig(req.params.type, req.body.config);
  store.events.set(bot.id, guildId, req.params.type, !!req.body.enabled, config);
  res.json({ ok: true });
});

// ---------------------- Économie ----------------------
router.get('/bots/:id/guilds/:guildId/quiz/top', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const { guildId } = req.params;
  if (!guildId) return res.status(400).json({ error: 'guild_id requis' });
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const top = store.quizScores.top(bot.id, guildId, 25);
  res.json({ top });
});

// 🧠 Quiz personnalisés (v198) : banques de questions par serveur
router.get('/bots/:id/guilds/:guildId/quiz/sets', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ sets: store.quizSets.all(bot.id, req.params.guildId) });
});
router.post('/bots/:id/guilds/:guildId/quiz/sets', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const id = store.quizSets.create(bot.id, req.params.guildId, req.body || {});
  res.json({ ok: true, id });
});
router.put('/bots/:id/guilds/:guildId/quiz/sets/:sid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const set = store.quizSets.get(Number(req.params.sid));
  if (!set || set.bot_id !== bot.id || set.guild_id !== req.params.guildId) return res.status(404).json({ error: 'Quiz introuvable.' });
  store.quizSets.update(Number(req.params.sid), req.body || {});
  res.json({ ok: true });
});
router.delete('/bots/:id/guilds/:guildId/quiz/sets/:sid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const set = store.quizSets.get(Number(req.params.sid));
  if (!set || set.bot_id !== bot.id || set.guild_id !== req.params.guildId) return res.status(404).json({ error: 'Quiz introuvable.' });
  store.quizSets.remove(Number(req.params.sid));
  res.json({ ok: true });
});

// ⚙️ Configuration du quiz (v198) : salon, points, bonus
router.put('/bots/:id/guilds/:guildId/quiz/config', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const b = req.body || {};
  store.guildSettings.set(bot.id, req.params.guildId, {
    quiz_channel: String(b.channel || '').slice(0, 100),
    quiz_points: Math.min(Math.max(parseInt(b.points, 10) || 10, 1), 1000),
    quiz_bonus: Math.min(Math.max(parseInt(b.bonus, 10) || 5, 0), 500),
    quiz_bonus_window: Math.min(Math.max(parseInt(b.bonus_window, 10) || 8, 1), 120),
  });
  res.json({ ok: true });
});

router.get('/bots/:id/economy/leaderboard', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const { guild_id } = req.query;
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  if (!(await userCanManageGuild(req, guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
  const top = store.economy.top(bot.id, guild_id, 25);
  res.json({ top });
});

// ---------------------- Panneaux (tickets + menus de rôles) ----------------------
const panels = require('./discord/panels');

router.get('/bots/:id/panels', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const { guild_id } = req.query;
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  if (!(await userCanManageGuild(req, guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
  const cfg = store.tickets.get(bot.id, guild_id);
  res.json({
    tickets: cfg || {
      name: '', channel: '', message: '🎫 Besoin d\'aide ? Clique sur le bouton pour ouvrir un ticket !',
      button_label: '🎫 Ouvrir un ticket', support_role: '', category: 'Tickets',
    },
    role_menus: store.roleMenus.all(bot.id, guild_id),
  });
});

router.put('/bots/:id/tickets', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const { guild_id, name, channel, message, button_label, button_style, require_reason, support_role, category, types, menu_channel, menu_message, menu_category, image_url } = req.body || {};
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  if (!(await userCanManageGuild(req, guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
  const current = store.tickets.get(bot.id, guild_id) || {};
  const payload = {
    name: String(name !== undefined ? name : (current.name || '')).slice(0, 50),
    channel: String(channel !== undefined ? channel : (current.channel || '')).slice(0, 100),
    message: String(message !== undefined ? message : (current.message || '')).slice(0, 1900),
    button_label: String(button_label !== undefined ? button_label : (current.button_label || '🎫 Ouvrir un ticket')).slice(0, 80),
    button_style: String(['1','2','3','4'].includes(String(button_style)) ? button_style : (current.button_style || '1')),
    require_reason: (require_reason === 0 || require_reason === false) ? 0 : (require_reason === undefined ? (current.require_reason === 0 ? 0 : 1) : 1),
    support_role: String(support_role !== undefined ? support_role : (current.support_role || '')).slice(0, 100),
    category: String(category !== undefined ? category : (current.category || 'Tickets')).slice(0, 100),
    menu_channel: String(menu_channel !== undefined ? menu_channel : (current.menu_channel || '')).slice(0, 100),
    menu_message: String(menu_message !== undefined ? menu_message : (current.menu_message || '')).slice(0, 1900),
    menu_category: String(menu_category !== undefined ? menu_category : (current.menu_category || '')).slice(0, 100),
    image_url: String(image_url !== undefined ? image_url : (current.image_url || '')).slice(0, 500),
  };
  if (types !== undefined) {
    payload.types = JSON.stringify((Array.isArray(types) ? types : [])
      .map((t) => {
        const roles = Array.isArray(t.staff_roles)
          ? t.staff_roles.map((r) => String(r).trim()).filter(Boolean).slice(0, 10)
          : (t.staff_role ? [String(t.staff_role).trim()] : []);
        return {
          label: String(t.label || '').slice(0, 100),
          emoji: safeEmojiWeb(t.emoji).slice(0, 100),
          description: String(t.description || '').slice(0, 100),
          category: String(t.category || '').slice(0, 100),
          questions: (Array.isArray(t.questions) ? t.questions : [])
            .map((q) => String(q).slice(0, 45))
            .filter(Boolean)
            .slice(0, 5),
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
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const { guild_id, mode } = req.body || {};
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  if (!(await userCanManageGuild(req, guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
  if (!botManager.isOnline(bot.id)) return res.status(400).json({ error: 'Démarre le bot avant d\'envoyer un panneau.' });
  const cfg = store.tickets.get(bot.id, guild_id);
  const panelMode = ['button', 'menu'].includes(mode) ? mode : 'auto';
  const chanCfg = panelMode === 'menu' ? (cfg && (cfg.menu_channel || cfg.channel)) : (cfg && cfg.channel);
  if (!cfg || !chanCfg) return res.status(400).json({ error: 'Configure d\'abord le salon du panneau.' });
  const entry = botManager.clients.get(bot.id);
  const guild = entry.client.guilds.cache.get(guild_id);
  if (!guild) return res.status(400).json({ error: 'Le bot n\'est pas sur ce serveur.' });
  try {
    const channel = panels.findChannelInGuild(guild, chanCfg);
    if (!channel) return res.status(400).json({ error: 'Salon introuvable. Vérifie le salon (mention #salon ou nom).' });
    await panels.sendTicketPanel(bot.id, guild_id, entry.client, channel, panelMode);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message.slice(0, 200) });
  }
});

// 💬 Message privé envoyé après la fermeture d'un ticket (v198) —
// vide = message par défaut du bot (avec transcription). Image = par défaut sans image.
router.put('/bots/:id/guilds/:guildId/tickets/dm', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const b = req.body || {};
  store.guildSettings.set(bot.id, req.params.guildId, {
    close_dm_message: String(b.message || '').slice(0, 1500),
    close_dm_image: String(b.image || '').slice(0, 500),
  });
  res.json({ ok: true });
});

// ============================================================
// 🎨 Nouveau système de tickets personnalisés — totalement séparé de
// /bots/:id/tickets et de la table historique `tickets`.
// ============================================================
router.get('/bots/:id/guilds/:guildId/advanced-tickets', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const cfg = store.advancedTickets.get(bot.id, guildId);
  res.json({ config: cfg || {
    id: null, bot_id: bot.id, guild_id: guildId, name: 'Créer un ticket', mode: 'buttons',
    channel: '', message: '', image_url: 'https://hoxera.is-a.dev/icons/support-banner.png', require_reason: 1,
    types: [], panel_message_id: '', panel_channel: '',
  } });
});

router.put('/bots/:id/guilds/:guildId/advanced-tickets', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const body = req.body || {};
  const current = store.advancedTickets.get(bot.id, guildId) || {};
  const rawTypes = Array.isArray(body.types) ? body.types : (current.types || []);
  const usedIds = new Set();
  const types = rawTypes.slice(0, 25).map((t, i) => {
    let id = String(t.id || `t${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || `t${i + 1}`;
    if (usedIds.has(id)) id = `t${i + 1}`;
    while (usedIds.has(id)) id = `${id}-x`;
    usedIds.add(id);
    const roles = Array.isArray(t.staff_roles)
      ? t.staff_roles.map((r) => String(r).trim()).filter(Boolean).slice(0, 10)
      : (t.staff_role ? [String(t.staff_role).trim()] : []);
    return {
      id,
      label: String(t.label || '').trim().slice(0, 80),
      button_label: String(t.button_label || '').trim().slice(0, 80),
      emoji: safeEmojiWeb(t.emoji).slice(0, 100),
      description: String(t.description || '').trim().slice(0, 100),
      questions: (Array.isArray(t.questions) ? t.questions : [])
        .map((q) => String(q).trim().slice(0, 45))
        .filter(Boolean)
        .slice(0, 5),
      category: String(t.category || '').trim().slice(0, 100),
      color: /^#[0-9a-fA-F]{6}$/.test(String(t.color || '')) ? String(t.color) : '#e07a5f',
      button_style: ['1', '2', '3', '4'].includes(String(t.button_style)) ? String(t.button_style) : '1',
      staff_roles: roles,
    };
  }).filter((t) => t.label);
  store.advancedTickets.set(bot.id, guildId, {
    name: body.name !== undefined ? String(body.name).trim().slice(0, 80) : (current.name || 'Créer un ticket'),
    mode: body.mode === 'menu' ? 'menu' : 'buttons',
    channel: body.channel !== undefined ? String(body.channel).trim().slice(0, 100) : (current.channel || ''),
    message: body.message !== undefined ? String(body.message).slice(0, 1900) : (current.message || ''),
    image_url: body.image_url !== undefined
      ? (/^https:\/\//i.test(String(body.image_url).trim()) ? String(body.image_url).trim().slice(0, 500) : '')
      : (current.image_url || ''),
    require_reason: body.require_reason !== undefined
      ? ((body.require_reason === 0 || body.require_reason === false) ? 0 : 1)
      : (current.require_reason === 0 ? 0 : 1),
    types,
  });
  res.json({ ok: true, config: store.advancedTickets.get(bot.id, guildId) });
});

router.post('/bots/:id/guilds/:guildId/advanced-tickets/send', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  if (!botManager.isOnline(bot.id)) return res.status(400).json({ error: 'Démarre le bot avant d\'envoyer le nouveau panneau.' });
  const entry = botManager.clients.get(bot.id);
  try {
    const advanced = require('./discord/advancedTickets');
    const sent = await advanced.sendPanel(bot.id, guildId, entry.client);
    res.json({ ok: true, message_id: sent.id });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 240) });
  }
});

router.post('/bots/:id/role-menus', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const { guild_id, name, content, placeholder, channel, options, mode } = req.body || {};
  if (!guild_id) return res.status(400).json({ error: 'guild_id requis' });
  if (!(await userCanManageGuild(req, guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
  if (!Array.isArray(options) || !options.length) return res.status(400).json({ error: 'Ajoute au moins un rôle au menu.' });
  const id = store.roleMenus.create({
    bot_id: bot.id,
    guild_id,
    name: String(name || 'Menu de rôles').slice(0, 50),
    content: String(content || '').slice(0, 1900),
    placeholder: String(placeholder || 'Choisis tes rôles…').slice(0, 150),
    channel: String(channel || '').slice(0, 100),
    mode: mode === 'buttons' ? 'buttons' : 'menu',
    options: JSON.stringify(options.map(o => ({
      label: String(o.label || 'Rôle').slice(0, 100),
      emoji: safeEmojiWeb(o.emoji).slice(0, 100),
      role: String(o.role || '').slice(0, 100),
    })).slice(0, 25)),
  });
  res.json({ id });
});

router.put('/role-menus/:id', requireAuth, async (req, res) => {
  const menu = store.roleMenus.get(Number(req.params.id));
  if (!menu) return res.status(404).json({ error: 'Menu introuvable' });
  const bot = store.bots.get(menu.bot_id);
  if (!bot) return res.status(404).json({ error: 'Menu introuvable' });
  if (!(await userCanManageGuild(req, menu.guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
  const fields = {};
  const { name, content, placeholder, channel, options, mode } = req.body || {};
  if (name !== undefined) fields.name = String(name).slice(0, 50);
  if (content !== undefined) fields.content = String(content).slice(0, 1900);
  if (placeholder !== undefined) fields.placeholder = String(placeholder).slice(0, 150);
  if (channel !== undefined) fields.channel = String(channel).slice(0, 100);
  if (mode !== undefined) fields.mode = mode === 'buttons' ? 'buttons' : 'menu';
  if (options !== undefined) {
    if (!Array.isArray(options) || !options.length) return res.status(400).json({ error: 'Ajoute au moins un rôle au menu.' });
    fields.options = JSON.stringify(options.map(o => ({
      label: String(o.label || 'Rôle').slice(0, 100),
      emoji: safeEmojiWeb(o.emoji).slice(0, 100),
      role: String(o.role || '').slice(0, 100),
    })).slice(0, 25));
  }
  store.roleMenus.update(menu.id, fields);
  res.json({ ok: true });
});

router.delete('/role-menus/:id', requireAuth, async (req, res) => {
  const menu = store.roleMenus.get(Number(req.params.id));
  if (!menu) return res.status(404).json({ error: 'Menu introuvable' });
  const bot = store.bots.get(menu.bot_id);
  if (!bot) return res.status(404).json({ error: 'Menu introuvable' });
  if (!(await userCanManageGuild(req, menu.guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
  store.roleMenus.remove(menu.id);
  res.json({ ok: true });
});

router.post('/role-menus/:id/send', requireAuth, async (req, res) => {
  const menu = store.roleMenus.get(Number(req.params.id));
  if (!menu) return res.status(404).json({ error: 'Menu introuvable' });
  const bot = store.bots.get(menu.bot_id);
  if (!bot) return res.status(404).json({ error: 'Menu introuvable' });
  if (!(await userCanManageGuild(req, menu.guild_id))) return res.status(403).json({ error: 'Permission refusée.' });
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

// ============================================================
// Hoxera 2.0 — Membres (liste + actions directes depuis le dashboard)
// ============================================================
function guildEntryFor(bot, guildId) {
  if (!botManager.isOnline(bot.id)) return null;
  const entry = botManager.clients.get(bot.id);
  return entry && entry.client.guilds.cache.get(guildId) ? entry : null;
}

router.get('/bots/:id/guilds/:guildId/members', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const entry = guildEntryFor(bot, guildId);
  if (!entry) return res.status(400).json({ error: 'Le bot est hors ligne ou absent de ce serveur.' });
  const guild = entry.client.guilds.cache.get(guildId);
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
  const cacheKey = `${bot.id}:${guildId}:${q}`;
  const payload = await membersCache.getOrLoad(cacheKey, async () => {
    const out = [];
    const cache = [...guild.members.cache.values()].filter((m) => !m.user.bot);
    const sorted = cache.sort((a, b) => (b.roles.highest.position) - (a.roles.highest.position));
    for (const m of sorted.slice(0, 300)) {
      const tag = m.user.tag || m.user.username;
      if (q && !tag.toLowerCase().includes(q) && !m.user.username.toLowerCase().includes(q)) continue;
      const eco = store.economy.get(bot.id, guildId, m.id);
      const xpRow = store.xp.get(bot.id, guildId, m.id);
      out.push({
        id: m.id,
        tag,
        username: m.user.username,
        avatar: imgproxy.imgProxy(m.user.displayAvatarURL({ size: 64 }) || ''),
        roles: m.roles.cache.filter((r) => r.name !== '@everyone').map((r) => ({ id: r.id, name: r.name, color: r.hexColor })).slice(0, 8),
        coins: eco ? eco.coins : 0,
        xp: xpRow ? xpRow.xp : 0,
        level: xpRow ? xpRow.level : 0,
        joined: m.joinedAt ? m.joinedAt.toISOString() : '',
        is_owner: m.id === guild.ownerId,
      });
      if (out.length >= 150) break;
    }
    return { members: out };
  });
  res.json(payload);
});

router.post('/bots/:id/guilds/:guildId/members/coins', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { user_id, amount } = req.body || {};
  const amt = parseInt(amount, 10);
  if (!user_id || !amt || amt < -1000000 || amt > 1000000) return res.status(400).json({ error: 'Membre ou montant invalide.' });
  store.economy.ensure(bot.id, guildId, user_id);
  store.economy.add(bot.id, guildId, user_id, amt);
  const row = store.economy.get(bot.id, guildId, user_id);
  membersCache.clear();
  res.json({ ok: true, coins: row.coins });
});

router.post('/bots/:id/guilds/:guildId/members/role', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { user_id, role_id, action } = req.body || {};
  if (!user_id || !role_id || !['add', 'remove'].includes(action)) return res.status(400).json({ error: 'Paramètres invalides.' });
  const entry = guildEntryFor(bot, guildId);
  if (!entry) return res.status(400).json({ error: 'Le bot est hors ligne.' });
  const guild = entry.client.guilds.cache.get(guildId);
  const member = await guild.members.fetch(user_id).catch(() => null);
  const role = guild.roles.cache.get(role_id);
  if (!member || !role) return res.status(404).json({ error: 'Membre ou rôle introuvable.' });
  try {
    if (action === 'add') await member.roles.add(role);
    else await member.roles.remove(role);
    membersCache.clear();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: `Impossible (${e.message.slice(0, 120)})` });
  }
});

router.post('/bots/:id/guilds/:guildId/members/kick', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { user_id, reason } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'Membre invalide.' });
  const entry = guildEntryFor(bot, guildId);
  if (!entry) return res.status(400).json({ error: 'Le bot est hors ligne.' });
  const guild = entry.client.guilds.cache.get(guildId);
  const member = await guild.members.fetch(user_id).catch(() => null);
  if (!member) return res.status(404).json({ error: 'Membre introuvable.' });
  try {
    await member.kick(String(reason || '').slice(0, 400));
    membersCache.clear();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: `Impossible (${e.message.slice(0, 120)})` });
  }
});

// ============================================================
// Hoxera 2.0 — Statistiques (graphiques du dashboard)
// ============================================================
router.get('/bots/:id/guilds/:guildId/stats', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const payload = await statsCache.getOrLoad(`${bot.id}:${guildId}`, async () => {
    const activity = store.msgStats.perDay(bot.id, guildId, 7);
    const joins = store.joinStats.perDay(bot.id, guildId, 7);
    const topRaw = store.msgStats.topUsers(bot.id, guildId, 7);
    const entry = guildEntryFor(bot, guildId);
    let topActive = [];
    if (entry) {
      const guild = entry.client.guilds.cache.get(guildId);
      topActive = topRaw.map((t) => {
        const m = guild.members.cache.get(t.user_id);
        return { user_id: t.user_id, messages: t.n, tag: m ? m.user.tag : t.user_id, avatar: m ? imgproxy.imgProxy(m.user.displayAvatarURL({ size: 64 }) || '') : '' };
      }).filter((t) => !t.tag.includes('Bot'));
    } else {
      topActive = topRaw.map((t) => ({ user_id: t.user_id, messages: t.n, tag: t.user_id, avatar: '' }));
    }
    return { activity, joins, top_active: topActive };
  });
  res.json(payload);
});

// ============================================================
// Hoxera 2.0 — Boutique : historique d'achats
// ============================================================
router.get('/bots/:id/guilds/:guildId/shop/purchases', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ purchases: store.shopPurchases.last(bot.id, req.params.guildId, 15) });
});

// ============================================================
// Hoxera 2.0 — Suggestions : statut + suppression depuis le dashboard
// ============================================================
router.delete('/bots/:id/guilds/:guildId/suggestions/:sid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.suggestions.remove(Number(req.params.sid));
  res.json({ ok: true });
});

// ⚙️ Configuration des suggestions (v198) : salon, couleur, ping, 👎, salon des approuvées
router.put('/bots/:id/guilds/:guildId/suggestions/config', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const b = req.body || {};
  store.guildSettings.set(bot.id, req.params.guildId, {
    suggestion_channel: String(b.channel || '').slice(0, 100),
    suggestion_color: /^#[0-9a-fA-F]{6}$/.test(String(b.color || '')) ? String(b.color) : '',
    suggestion_ping_role: String(b.ping_role || '').slice(0, 100),
    suggestion_downvotes: (b.downvotes === 0 || b.downvotes === false) ? 0 : 1,
    suggestion_approve_channel: String(b.approve_channel || '').slice(0, 100),
  });
  res.json({ ok: true });
});

// ============================================================
// Hoxera 2.0 — Annonces programmées (messages automatiques)
// ============================================================
router.get('/bots/:id/guilds/:guildId/scheduled', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ scheduled: store.scheduled.all(bot.id, req.params.guildId) });
});

router.post('/bots/:id/guilds/:guildId/scheduled', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { channel_id, hour, minute, days, text } = req.body || {};
  if (!channel_id || !text || hour === undefined || minute === undefined) return res.status(400).json({ error: 'Salon, heure, minute et texte requis.' });
  if (store.scheduled.all(bot.id, guildId).length >= 20) return res.status(400).json({ error: 'Maximum 20 annonces par serveur.' });
  const id = store.scheduled.add(bot.id, guildId, {
    channel_id: String(channel_id).slice(0, 100),
    hour: Math.min(Math.max(parseInt(hour, 10) || 0, 0), 23),
    minute: Math.min(Math.max(parseInt(minute, 10) || 0, 0), 59),
    days: Array.isArray(days) ? days.join(',') : String(days || '1,2,3,4,5,6,7'),
    text: String(text || '').slice(0, 1900),
  });
  res.json({ id });
});

router.put('/bots/:id/guilds/:guildId/scheduled/:sid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const s = store.scheduled.get(Number(req.params.sid));
  if (!s || s.bot_id !== bot.id || s.guild_id !== req.params.guildId) return res.status(404).json({ error: 'Annonce introuvable' });
  const fields = {};
  const { channel_id, hour, minute, days, text, enabled } = req.body || {};
  if (channel_id !== undefined) fields.channel_id = String(channel_id).slice(0, 100);
  if (hour !== undefined) fields.hour = Math.min(Math.max(parseInt(hour, 10) || 0, 0), 23);
  if (minute !== undefined) fields.minute = Math.min(Math.max(parseInt(minute, 10) || 0, 0), 59);
  if (days !== undefined) fields.days = Array.isArray(days) ? days.join(',') : String(days);
  if (text !== undefined) fields.text = String(text).slice(0, 1900);
  if (enabled !== undefined) fields.enabled = enabled ? 1 : 0;
  store.scheduled.update(s.id, fields);
  res.json({ ok: true });
});

router.delete('/bots/:id/guilds/:guildId/scheduled/:sid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const s = store.scheduled.get(Number(req.params.sid));
  if (!s || s.bot_id !== bot.id || s.guild_id !== req.params.guildId) return res.status(404).json({ error: 'Annonce introuvable' });
  store.scheduled.remove(s.id);
  res.json({ ok: true });
});

// ============================================================
// 📣 Annonces personnalisées immédiates — indépendantes des programmées
// ============================================================
router.get('/bots/:id/guilds/:guildId/announcements/custom', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  res.json({ config: store.customAnnouncements.get(bot.id, guildId) || {
    id: null, bot_id: bot.id, guild_id: guildId, name: 'Annonce personnalisée', title: '', message: '',
    color: '#e07a5f', image_url: '', footer: '', channels: [], ping_roles: [],
  } });
});

router.put('/bots/:id/guilds/:guildId/announcements/custom', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const current = store.customAnnouncements.get(bot.id, guildId) || {};
  const body = req.body || {};
  const announcements = require('./discord/announcements');
  const config = announcements.normalizeConfig({
    ...current,
    ...body,
    channels: body.channels !== undefined ? body.channels : current.channels,
    ping_roles: body.ping_roles !== undefined ? body.ping_roles : current.ping_roles,
  });
  if (!config.message.trim()) return res.status(400).json({ error: 'Écris le contenu de ton annonce.' });
  if (!config.channels.length) return res.status(400).json({ error: 'Choisis au moins un salon de publication.' });
  store.customAnnouncements.set(bot.id, guildId, config);
  res.json({ ok: true, config: store.customAnnouncements.get(bot.id, guildId) });
});

router.post('/bots/:id/guilds/:guildId/announcements/custom/send', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  if (!botManager.isOnline(bot.id)) return res.status(400).json({ error: 'Démarre le bot avant de publier une annonce.' });
  const entry = botManager.clients.get(bot.id);
  if (!entry || !entry.client) return res.status(400).json({ error: 'Le bot est momentanément indisponible.' });
  try {
    const announcements = require('./discord/announcements');
    const result = await announcements.sendAnnouncement(bot.id, guildId, entry.client);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 240) });
  }
});

// ============================================================
// 🧱 Embed Builder — construire, envoyer, sauvegarder des messages
// ============================================================
const EMBED_BUTTON_STYLES = { 1: 'Primary', 2: 'Secondary', 3: 'Success', 4: 'Danger', 5: 'Link' };

function sanitizeEmbedPayload(body) {
  const b = body || {};
  const str = (v, max) => String(v == null ? '' : v).slice(0, max);
  const embed = {
    content: str(b.content, 2000),
    author: str(b.author, 256),
    title: str(b.title, 256),
    description: str(b.description, 4096),
    color: /^#[0-9a-fA-F]{6}$/.test(String(b.color || '')) ? b.color : '',
    image: str(b.image, 500),
    thumbnail: str(b.thumbnail, 500),
    footer: str(b.footer, 2048),
    buttons: Array.isArray(b.buttons) ? b.buttons.slice(0, 5).map((x) => ({
      emoji: str(x && x.emoji, 32),
      label: str(x && x.label, 80) || 'Bouton',
      style: [1, 2, 3, 4, 5].includes(Number(x && x.style)) ? Number(x.style) : 1,
      url: /^https?:\/\/.+/.test(String(x && x.url || '')) ? String(x.url).slice(0, 500) : '',
    })) : [],
  };
  if (embed.image && !/^https?:\/\//.test(embed.image)) embed.image = '';
  if (embed.thumbnail && !/^https?:\/\//.test(embed.thumbnail)) embed.thumbnail = '';
  return embed;
}

// Envoyer le message construit dans un salon
router.post('/bots/:id/guilds/:guildId/embed/send', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  if (!botManager.isOnline(bot.id)) return res.status(400).json({ error: 'Démarre le bot avant d\'envoyer un message.' });
  const entry = botManager.clients.get(bot.id);
  if (!entry || !entry.client) return res.status(400).json({ error: 'Le bot est momentanément indisponible.' });
  try {
    const payload = sanitizeEmbedPayload(req.body || {});
    const channelId = String((req.body || {}).channel || '');
    const guild = entry.client.guilds.cache.get(String(guildId));
    const channel = guild && guild.channels && guild.channels.cache ? guild.channels.cache.get(channelId) : null;
    if (!channel || typeof channel.send !== 'function') return res.status(400).json({ error: 'Salon introuvable (ou le bot n\'y a pas accès).' });
    const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
    const e = new EmbedBuilder();
    let hasEmbed = false;
    if (payload.author) { e.setAuthor({ name: payload.author }); hasEmbed = true; }
    if (payload.title) { e.setTitle(payload.title); hasEmbed = true; }
    if (payload.description) { e.setDescription(payload.description); hasEmbed = true; }
    if (payload.color) { e.setColor(payload.color); hasEmbed = true; }
    if (payload.image) { e.setImage(payload.image); hasEmbed = true; }
    if (payload.thumbnail) { e.setThumbnail(payload.thumbnail); hasEmbed = true; }
    if (payload.footer) { e.setFooter({ text: payload.footer }); hasEmbed = true; }
    const msg = { content: payload.content || undefined, embeds: hasEmbed ? [e] : [], components: [] };
    if (payload.buttons.length) {
      const row = new ActionRowBuilder();
      payload.buttons.forEach((b, idx) => {
        const btn = new ButtonBuilder().setLabel(payload.buttons[idx].label).setStyle(ButtonStyle[EMBED_BUTTON_STYLES[b.style]]);
        if (b.emoji) { try { btn.setEmoji(b.emoji); } catch {} }
        if (b.style === 5 && b.url) btn.setURL(b.url);
        else btn.setCustomId(`eb:${Date.now()}:${idx}`);
        row.addComponents(btn);
      });
      msg.components = [row];
    }
    const sent = await channel.send(msg);
    res.json({ ok: true, messageId: sent && sent.id, channel: channel.name || channelId });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e).slice(0, 240) });
  }
});

// Lister / sauvegarder / supprimer les modèles
router.get('/bots/:id/guilds/:guildId/embed-templates', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  try {
    const list = store.embedTemplates.list(bot.id, req.params.guildId).map((t) => ({ id: t.id, name: t.name, payload: JSON.parse(t.payload || '{}'), createdAt: t.created_at }));
    res.json({ templates: list });
  } catch { res.json({ templates: [] }); }
});

router.post('/bots/:id/guilds/:guildId/embed-templates', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const payload = sanitizeEmbedPayload(req.body || {});
  store.embedTemplates.add(bot.id, req.params.guildId, (req.body || {}).name, payload);
  res.json({ ok: true });
});

router.delete('/bots/:id/guilds/:guildId/embed-templates/:tid', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.embedTemplates.remove(Number(req.params.tid) || 0, bot.id, req.params.guildId);
  res.json({ ok: true });
});

// ============================================================
// Hoxera 2.0 — Salons vocaux temporaires (dashboard)
// ============================================================
router.put('/bots/:id/guilds/:guildId/voicetemp', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { creator_channel, category, name_template } = req.body || {};
  store.voicetemp.set(bot.id, req.params.guildId, {
    creator_channel: String(creator_channel || '').slice(0, 100),
    category: String(category || '').slice(0, 100),
    name_template: String(name_template || '').slice(0, 50),
  });
  res.json({ ok: true });
});

router.delete('/bots/:id/guilds/:guildId/voicetemp', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  if (!(await userCanManageGuild(req, req.params.guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  store.voicetemp.remove(bot.id, req.params.guildId);
  res.json({ ok: true });
});

// ============================================================
// Hoxera 2.0 — Candidatures (dashboard)
// ============================================================
router.put('/bots/:id/guilds/:guildId/applications', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const cur = store.applications.get(bot.id, guildId) || { channel: '', questions: '[]', title: '📝 Candidature', enabled: 0 };
  const { channel, title, enabled } = req.body || {};
  store.applications.set(bot.id, guildId, {
    channel: channel !== undefined ? String(channel).slice(0, 100) : cur.channel,
    questions: cur.questions,
    title: title !== undefined ? String(title).slice(0, 100) : cur.title,
    enabled: enabled !== undefined ? (enabled ? 1 : 0) : cur.enabled,
  });
  res.json({ ok: true });
});

// ============================================================
// Hoxera 2.0 — Sauvegarde : lancer maintenant + dernière sauvegarde
// ============================================================
router.post('/backup/now', requireAuth, platformMutationRateLimit, async (req, res) => {
  const user = store.users.findById(req.userId);
  if (!isPlatformAdmin(user)) return res.status(403).json({ error: 'Réservé au fondateur.' });
  const backup = require('./backup');
  if (!backup.enabled()) return res.status(400).json({ error: 'Sauvegarde non configurée (variables GitHub manquantes).' });
  try {
    const saved = await backup.upload(store.db);
    if (!saved) return res.status(503).json({ error: 'Sauvegarde non effectuée : la dernière sauvegarde valide est conservée.' });
    store.settings.set('last_backup', new Date().toISOString());
    res.json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message.slice(0, 200) });
  }
});

router.get('/backup/status', requireAuth, (req, res) => {
  const backup = require('./backup');
  res.json({ enabled: backup.enabled(), repo: backup.repo(), branch: backup.branch(), last_backup: store.settings.get('last_backup') });
});

// ============================================================
// Hoxera 2.5 — Anti-raid depuis le dashboard (verrouillage du serveur)
// ============================================================
router.get('/bots/:id/guilds/:guildId/lockdown', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const entry = guildEntryFor(bot, guildId);
  if (!entry) return res.status(400).json({ error: 'Le bot est hors ligne ou absent de ce serveur.' });
  const guild = entry.client.guilds.cache.get(guildId);
  res.json(require('./discord/lockdown').state(bot.id, guild));
});

router.post('/bots/:id/guilds/:guildId/lockdown', requireAuth, async (req, res) => {
  const bot = getAnyBot(req, res);
  if (!bot) return;
  const guildId = req.params.guildId;
  if (!(await userCanManageGuild(req, guildId))) return res.status(403).json({ error: 'Permission refusée.' });
  const { action } = req.body || {};
  if (!['on', 'off'].includes(action)) return res.status(400).json({ error: 'Action invalide (on/off).' });
  const entry = guildEntryFor(bot, guildId);
  if (!entry) return res.status(400).json({ error: 'Le bot est hors ligne ou absent de ce serveur.' });
  const guild = entry.client.guilds.cache.get(guildId);
  const lockdown = require('./discord/lockdown');
  const byTag = req.userId ? `dashboard (utilisateur #${req.userId})` : 'dashboard';
  if (action === 'on') {
    const r = await lockdown.on(bot.id, guild, byTag);
    res.json({ ok: true, already: r.already, channels: r.channels, state: lockdown.state(bot.id, guild) });
  } else {
    const r = await lockdown.off(bot.id, guild, byTag);
    res.json({ ok: true, reopened: r.reopened, state: lockdown.state(bot.id, guild) });
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

// 🩺 Diagnostic public du bot (aucune donnée sensible) : état de connexion,
// ancienneté des connexions, dernière erreur enregistrée — sert à débugger
// à distance sans accès aux journaux Render.
router.get('/health/bot', (req, res) => {
  const rows = store.db.prepare('SELECT id, name, enabled, last_error, bot_username FROM bots').all();
  const clientsState = [];
  for (const [id, entry] of botManager.clients) {
    clientsState.push({
      id,
      ready: !!(entry.client && entry.client.isReady()),
      startedAt: entry.startedAt || null,
      ageMs: entry.startedAt ? Date.now() - entry.startedAt : null,
    });
  }
  // 🩺 Taille de la base + compteurs (sans données sensibles) : permet de
  // surveiller à distance que la sauvegarde reste sous la limite de 1 Mo.
  let dbInfo = { sizeKo: 0 };
  try { dbInfo = require('./maintenance').dbStats(store.db); } catch {}
  // 🩺 Santé complète : mémoire, erreurs 24 h, plateforme
  let healthInfo = {};
  try { healthInfo = require('./health').snapshot(); } catch {}
  res.json({
    processUptimeMs: Math.round(process.uptime() * 1000),
    tokenConfigured: !!(process.env.HOXERA_TOKEN),
    oauthConfigured: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
    botCount: rows.length,
    bootRestore: store.settings.get('boot_restore') || 'inconnu',
    backupEnabled: !!process.env.BOTDEV_GH_TOKEN && !!process.env.BOTDEV_DATA_REPO,
    lastBackup: store.settings.get('last_backup') || '',
    db: dbInfo,
    memory: (healthInfo && healthInfo.memory) || {},
    resources: (healthInfo && healthInfo.resources) || {},
    cache: (healthInfo && healthInfo.cache) || {},
    errors24h: (healthInfo && healthInfo.errors24h) || { count: 0, last: [] },
    platform: (healthInfo && healthInfo.platform) || {},
    queue: (healthInfo && healthInfo.queue) || { waiting: 0, active: 0, processed: 0, failed: 0, refused: 0 },
    resilience: (healthInfo && healthInfo.resilience) || { state: 'ok', failuresInWindow: 0 },
    bots: rows.map((r) => ({ id: r.id, name: r.name, enabled: !!r.enabled, last_error: String(r.last_error || '').slice(0, 200), username: r.bot_username || '' })),
    clients: clientsState,
  });
});

// ============================================================
// Pages publiques (sans connexion) : le dashboard public de Hoxera
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

// ⚡ Hoxera (bot unique) : informations pour le dashboard connecté
router.get('/hoxera', requireAuth, (req, res) => {
  const bot = store.db.prepare('SELECT * FROM bots ORDER BY id LIMIT 1').get();
  if (!bot) return res.json({ bot: null, configured: false });
  res.json({ bot: botDetail(bot), configured: true });
});

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

// Avatar public d’Optimus Prime : proxy local court pour éviter qu'un blocage
// navigateur/CDN ne remplace la photo par le logo de secours.
router.get('/public/bot-avatar', async (req, res) => {
  const fallback = path.join(__dirname, '..', 'public', 'icons', 'icon-512.png');
  const cached = publicAvatarCache.get('hoxera');
  if (cached) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=600');
    return res.send(cached.buffer);
  }
  try {
    const bot = store.db.prepare('SELECT avatar_url FROM bots ORDER BY id LIMIT 1').get();
    const url = bot && /^https:\/\//i.test(String(bot.avatar_url || '')) ? String(bot.avatar_url) : '';
    if (url) {
      const image = await fetch(url);
      const contentType = String(image.headers.get('content-type') || '').toLowerCase();
      const buffer = Buffer.from(await image.arrayBuffer());
      if (image.ok && contentType.startsWith('image/') && buffer.length > 0 && buffer.length <= 5 * 1024 * 1024) {
        publicAvatarCache.set('hoxera', { buffer, contentType });
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=600');
        return res.send(buffer);
      }
    }
  } catch {}
  return res.sendFile(fallback);
});

router.get('/img', async (req, res) => {
  const url = typeof req.query.u === 'string' ? req.query.u.slice(0, 500) : '';
  if (!imgproxy.isDiscordImageUrl(url)) return res.status(400).json({ error: "URL d'image non autorisée." });
  const key = 'img:' + url;
  const cached = imgCache.get(key);
  if (cached) {
    res.set('Content-Type', cached.type);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buffer);
  }
  const img = await imgproxy.fetchDiscordImage(url);
  if (!img) return res.status(404).json({ error: 'Image introuvable.' });
  imgCache.set(key, img);
  res.set('Content-Type', img.type);
  res.set('Cache-Control', 'public, max-age=86400');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(img.buffer);
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
// Panneau admin plateforme (réservé au fondateur Optimus Prime)
// ============================================================
function parseAdminGuilds(raw) {
  try {
    const list = JSON.parse(raw || '[]');
    if (!Array.isArray(list)) return [];
    return list.slice(0, 100).map((g) => ({
      id: String(g.id || ''),
      name: String(g.name || 'Serveur sans nom').slice(0, 100),
      owner: !!g.owner,
    })).filter((g) => g.id);
  } catch { return []; }
}

// Toutes les tables possédant des données attachées à un bot utilisateur.
// La liste est volontairement explicite : elle évite une suppression globale
// accidentelle et garantit qu'un compte supprimé ne laisse pas ses données.
const BOT_DATA_TABLES = [
  'commands', 'modules', 'events', 'guild_settings', 'xp', 'xp_roles', 'economy',
  'warnings', 'warning_counters', 'role_menus', 'tickets', 'bot_profiles',
  'shop_items', 'giveaways', 'suggestions', 'temp_roles', 'sanctions',
  'blacklist_words', 'automod_logs', 'automod_member_blacklist', 'automod_blacklist_counters', 'native_automod_rules', 'automod_warning_messages', 'open_tickets',
  'ticket_counters', 'ticket_ratings', 'closed_tickets', 'transcripts',
  'marriages', 'birthdays', 'reminders', 'cmd_stats', 'scheduled_messages',
  'custom_announcements', 'message_stats', 'join_stats', 'shop_purchases',
  'applications', 'voicetemp', 'starboard_posts', 'invite_uses', 'invite_joins',
  'live_socials', 'ticket_log_msgs', 'advanced_ticket_panels',
  'advanced_ticket_channels', 'activity',
];

function deleteUserData(targetId, botIds) {
  const transaction = store.db.transaction(() => {
    if (botIds.length) {
      const placeholders = botIds.map(() => '?').join(',');
      for (const table of BOT_DATA_TABLES) {
        store.db.prepare(`DELETE FROM ${table} WHERE bot_id IN (${placeholders})`).run(...botIds);
      }
      store.db.prepare(`DELETE FROM bots WHERE id IN (${placeholders})`).run(...botIds);
    }
    store.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    store.db.prepare('DELETE FROM discord_tokens WHERE user_id = ?').run(targetId);
    store.db.prepare('DELETE FROM platform_bans WHERE user_id = ?').run(targetId);
    store.db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  });
  transaction();
}

function adminTarget(req, res) {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId < 1) {
    res.status(400).json({ error: 'Identifiant utilisateur invalide.' });
    return null;
  }
  if (targetId === req.userId) {
    res.status(400).json({ error: 'Tu ne peux pas modifier ton propre compte administrateur.' });
    return null;
  }
  const target = store.users.findById(targetId);
  if (!target) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return null;
  }
  if (isPlatformAdmin(target)) {
    res.status(400).json({ error: 'Un compte administrateur de la plateforme est protégé.' });
    return null;
  }
  return { targetId, target };
}

router.get('/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const users = store.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const linked = store.db.prepare("SELECT COUNT(*) AS n FROM users WHERE discord_id IS NOT NULL AND discord_id != ''").get().n;
  const banned = store.db.prepare('SELECT COUNT(*) AS n FROM platform_bans').get().n;
  const bots = store.db.prepare('SELECT COUNT(*) AS n FROM bots').get().n;
  const online = store.db.prepare('SELECT COUNT(*) AS n FROM bots WHERE enabled = 1').get().n;
  const live = botManager.platformStats();
  // Stats globales complémentaires (v199 — Hub fondateur)
  let tickets = 0, messages24h = 0, openTickets = 0, suggestions = 0;
  try { tickets = store.db.prepare('SELECT COUNT(*) AS n FROM closed_tickets').get().n; } catch {}
  try { openTickets = store.db.prepare('SELECT COUNT(*) AS n FROM open_tickets').get().n; } catch {}
  try { suggestions = store.db.prepare('SELECT COUNT(*) AS n FROM suggestions').get().n; } catch {}
  try {
    const since = new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 10);
    messages24h = store.db.prepare('SELECT COUNT(*) AS n FROM message_stats WHERE day = ?').get(since).n;
  } catch {}
  const lastBackup = store.settings.get('last_backup') || '';
  res.json({ users, linked, banned, bots, online, ...live, tickets, openTickets, suggestions, messages24h, lastBackup });
});

router.get('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = store.db.prepare(`
      SELECT u.id, u.email, u.discord_id, u.discord_username, u.discord_avatar,
        u.discord_guilds, u.created_at,
        (SELECT COUNT(*) FROM bots b WHERE b.user_id = u.id) AS bots_count,
        (pb.user_id IS NOT NULL) AS banned,
        pb.reason AS ban_reason, pb.created_at AS banned_at
      FROM users u LEFT JOIN platform_bans pb ON pb.user_id = u.id
      WHERE u.email LIKE ? OR u.discord_username LIKE ? OR u.discord_id LIKE ?
      ORDER BY u.created_at DESC LIMIT 200`).all(like, like, like);
  } else {
    rows = store.db.prepare(`
      SELECT u.id, u.email, u.discord_id, u.discord_username, u.discord_avatar,
        u.discord_guilds, u.created_at,
        (SELECT COUNT(*) FROM bots b WHERE b.user_id = u.id) AS bots_count,
        (pb.user_id IS NOT NULL) AS banned,
        pb.reason AS ban_reason, pb.created_at AS banned_at
      FROM users u LEFT JOIN platform_bans pb ON pb.user_id = u.id
      ORDER BY u.created_at DESC LIMIT 200`).all();
  }
  const users = rows.map((u) => {
    const guilds = parseAdminGuilds(u.discord_guilds);
    return {
      id: u.id,
      email: u.email,
      discord_id: u.discord_id || '',
      discord_username: u.discord_username || '',
      discord_avatar: u.discord_avatar || '',
      discord_linked: !!u.discord_id,
      guild_count: guilds.length,
      guilds,
      created_at: u.created_at,
      bots_count: u.bots_count || 0,
      banned: !!u.banned,
      ban_reason: u.ban_reason || '',
      banned_at: u.banned_at || '',
    };
  });
  res.json({ users });
});

router.get('/admin/audit', requireAuth, requireAdmin, (req, res) => {
  const actionFilter = String(req.query.action || '').trim();
  const rows = actionFilter
    ? store.db.prepare(`
      SELECT a.id, a.actor_user_id, a.target_user_id, a.action, a.details, a.created_at,
        au.discord_username AS actor_discord_username,
        tu.discord_username AS target_discord_username
      FROM platform_audit_log a
      LEFT JOIN users au ON au.id = a.actor_user_id
      LEFT JOIN users tu ON tu.id = a.target_user_id
      WHERE a.action = ?
      ORDER BY a.id DESC LIMIT 100`).all(actionFilter)
    : store.db.prepare(`
      SELECT a.id, a.actor_user_id, a.target_user_id, a.action, a.details, a.created_at,
        au.discord_username AS actor_discord_username,
        tu.discord_username AS target_discord_username
      FROM platform_audit_log a
      LEFT JOIN users au ON au.id = a.actor_user_id
      LEFT JOIN users tu ON tu.id = a.target_user_id
      ORDER BY a.id DESC LIMIT 100`).all();
  res.json({ audit: rows.map((row) => ({
    id: row.id,
    actor_user_id: row.actor_user_id,
    actor: row.actor_discord_username || `Compte #${row.actor_user_id}`,
    target_user_id: row.target_user_id,
    target: row.target_discord_username || (row.target_user_id ? `Compte #${row.target_user_id}` : '—'),
    action: row.action,
    details: row.details || '',
    created_at: row.created_at,
  })) });
});

// 🌍 Activité globale récente (tous serveurs, tous bots) — Hub fondateur v199
router.get('/admin/activity', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const rows = store.db.prepare('SELECT emoji, text, bot_id, guild_id, created_at FROM activity ORDER BY id DESC LIMIT ?').all(limit);
  // Noms des serveurs : map guildId -> nom (depuis les clients connectés)
  const guildNames = new Map();
  for (const entry of botManager.clients.values()) {
    if (!entry.client.isReady()) continue;
    for (const g of entry.client.guilds.cache.values()) guildNames.set(String(g.id), g.name);
  }
  const botNames = new Map();
  for (const b of store.db.prepare('SELECT id, name FROM bots').all()) botNames.set(b.id, b.name || `Bot #${b.id}`);
  res.json({ items: rows.map((r) => ({
    emoji: r.emoji || '',
    text: r.text || '',
    guild_id: r.guild_id,
    guild_name: guildNames.get(String(r.guild_id)) || '',
    bot_name: botNames.get(r.bot_id) || '',
    created_at: r.created_at,
  })) });
});

// ⚙️ Réglages plateforme (fondateur) — v199
router.get('/admin/settings', requireAuth, requireAdmin, (req, res) => {
  res.json({
    public_url: store.settings.get('public_url') || '',
    profile_banner_url: store.settings.get('profile_banner_url') || '',
    last_backup: store.settings.get('last_backup') || '',
    backup_enabled: (() => { try { return require('./backup').enabled(); } catch { return false; } })(),
    backup_repo: (() => { try { return require('./backup').repo(); } catch { return ''; } })(),
  });
});
router.put('/admin/settings', requireAuth, requireAdmin, platformMutationRateLimit, (req, res) => {
  const b = req.body || {};
  if (b.public_url !== undefined) {
    const v = String(b.public_url || '').trim().slice(0, 200);
    if (v && !/^https?:\/\//.test(v)) return res.status(400).json({ error: 'URL publique invalide (doit commencer par http:// ou https://).' });
    store.settings.set('public_url', v);
  }
  if (b.profile_banner_url !== undefined) {
    const v = String(b.profile_banner_url || '').trim().slice(0, 500);
    if (v && !/^https?:\/\//.test(v)) return res.status(400).json({ error: 'URL d\'image invalide (doit commencer par http:// ou https://).' });
    store.settings.set('profile_banner_url', v);
  }
  res.json({ ok: true });
});

// 🩺 Santé système (fondateur) — v199
router.get('/admin/system', requireAuth, requireAdmin, (req, res) => {
  let health = {};
  try { health = require('./health').snapshot(); } catch {}
  res.json({
    uptimeMs: process.uptime() * 1000,
    memory: (health && health.memory) || {},
    lastBackup: store.settings.get('last_backup') || '',
    backupEnabled: (() => { try { return require('./backup').enabled(); } catch { return false; } })(),
  });
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

router.post('/admin/users/:id/unlink-discord', requireAuth, requireAdmin, platformMutationRateLimit, (req, res) => {
  const target = adminTarget(req, res);
  if (!target) return;
  store.users.updateDiscord(target.targetId, {
    discord_id: '', discord_username: '', discord_avatar: '', discord_guilds: '[]',
  });
  store.discordTokens.remove(target.targetId);
  store.platformAudit.add(req.userId, target.targetId, 'unlink_discord', 'Liaison Discord supprimée, compte conservé.');
  res.json({ ok: true, message: 'Compte Discord délié. Le compte Optimus Prime est conservé.' });
});

router.post('/admin/users/:id/ban', requireAuth, requireAdmin, platformMutationRateLimit, (req, res) => {
  const target = adminTarget(req, res);
  if (!target) return;
  const reason = String((req.body || {}).reason || '').trim().slice(0, 500);
  store.platformBans.set(target.targetId, reason, req.userId);
  // Les sessions et le jeton OAuth ne servent plus à un compte banni.
  store.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.targetId);
  store.discordTokens.remove(target.targetId);
  store.platformAudit.add(req.userId, target.targetId, 'ban_user', reason ? `Raison : ${reason}` : 'Aucune raison fournie.');
  res.json({ ok: true, message: 'Compte banni d’Optimus Prime.' });
});

router.delete('/admin/users/:id/ban', requireAuth, requireAdmin, platformMutationRateLimit, (req, res) => {
  const target = adminTarget(req, res);
  if (!target) return;
  store.platformBans.remove(target.targetId);
  store.platformAudit.add(req.userId, target.targetId, 'unban_user', 'Bannissement Optimus Prime retiré.');
  res.json({ ok: true, message: 'Compte débanni d’Optimus Prime. Il devra se reconnecter.' });
});

router.delete('/admin/users/:id', requireAuth, requireAdmin, platformMutationRateLimit, async (req, res) => {
  const target = adminTarget(req, res);
  if (!target) return;
  const bots = store.bots.all(target.targetId);
  for (const bot of bots) await botManager.logoutBot(bot.id);
  store.platformAudit.add(req.userId, target.targetId, 'delete_user', 'Compte et données associées supprimés.');
  deleteUserData(target.targetId, bots.map((bot) => Number(bot.id)));
  res.json({ ok: true, message: 'Compte Optimus Prime et données associées supprimés.' });
});

// 🛟 Filet de sécurité final : AUCUNE route ne doit faire tomber le serveur.
// Toute erreur non gérée devient une réponse JSON propre (500).
router.use((err, req, res, next) => {
  console.error('[BotDev] Erreur route API :', (err && err.message) || err);
  try { require('./health').recordError('api', (err && err.message) || err); } catch {}
  try {
    if (!res.headersSent) res.status(500).json({ error: 'Erreur interne du serveur — elle a été journalisée.' });
  } catch {}
});

module.exports = router;
module.exports.guildChecklist = guildChecklist;
