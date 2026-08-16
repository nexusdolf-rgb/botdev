// ============================================================
// BotDev - Gestionnaire de bots Discord (un client par bot)
// ============================================================
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const store = require('../db');

const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildModeration,
];

const clients = new Map(); // botId -> { client, record }

function getClient(botId) {
  return clients.get(botId) || null;
}

function isOnline(botId) {
  const e = clients.get(botId);
  return !!(e && e.client.isReady());
}

// ---------------------- Connexion ----------------------
async function loginBot(botId) {
  const record = store.bots.get(botId);
  if (!record) throw new Error('Bot introuvable');
  const existing = clients.get(botId);
  if (existing) return { already: true };

  try {
    return await connect(botId, record, INTENTS, '');
  } catch (err) {
    // Repli : intents privilégiés refusés par Discord → connexion minimale
    if (String(err.message || err).toLowerCase().includes('intent')) {
      try {
        return await connect(botId, record, [GatewayIntentBits.Guilds],
          '⚠️ Intents à activer : dans le portail développeur Discord (onglet Bot), active « SERVER MEMBERS INTENT » et « MESSAGE CONTENT INTENT », puis redémarre ce bot. Sans eux, les commandes et événements ne fonctionnent pas.');
      } catch (err2) {
        throw err2;
      }
    }
    throw err;
  }
}

async function connect(botId, record, intents, degradedHint) {
  const client = new Client({
    intents,
    partials: [Partials.Channel],
    presence: { status: record.status_type || 'online' },
  });

  const entry = { client, record };
  entry.startedAt = Date.now();
  clients.set(botId, entry);

  attachListeners(botId, entry);

  try {
    await client.login(record.token);
    store.bots.update(botId, { enabled: 1, last_error: degradedHint });
    return { already: false, degraded: !!degradedHint };
  } catch (err) {
    clients.delete(botId);
    try { client.destroy(); } catch {}
    store.bots.update(botId, { enabled: 0, last_error: friendlyError(err) });
    throw err;
  }
}

function friendlyError(err) {
  const msg = String(err.message || err);
  if (msg.includes('Used disallowed intents')) return 'Intents non activés : activez "MESSAGE CONTENT" et "SERVER MEMBERS" dans le portail développeur Discord.';
  if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('token')) return 'Token invalide. Vérifiez le token dans le portail développeur Discord.';
  return msg.slice(0, 300);
}

async function logoutBot(botId) {
  const entry = clients.get(botId);
  if (!entry) return;
  try { entry.client.destroy(); } catch {}
  clients.delete(botId);
  store.bots.update(botId, { enabled: 0, last_error: '' });
}

// Arrêt complet au shutdown du serveur : on coupe les connexions SANS
// marquer les bots désactivés, pour qu'ils se reconnectent au prochain démarrage.
async function stopAll() {
  for (const [id, entry] of clients) {
    try { entry.client.destroy(); } catch {}
    clients.delete(id);
  }
}

// ---------------------- Écouteurs ----------------------
function attachListeners(botId, entry) {
  const { client } = entry;

  client.once('ready', async () => {
    const record = store.bots.get(botId);
    try {
      const me = client.user;
      store.bots.update(botId, {
        bot_username: me ? `${me.username}#${me.discriminator === '0' ? '' : me.discriminator}` : '',
        avatar_url: me ? me.displayAvatarURL({ size: 128 }) : '',
      });
      applyPresence(record);
      // Synchronisation par serveur, indépendante (une erreur n'empêche pas les autres)
      for (const g of client.guilds.cache.values()) {
        try { await syncSlashCommands(botId, g.id, true); }
        catch (e) { console.error(`[BotDev] sync ${g.id} (bot ${botId}):`, e.message); }
      }
      // Bio du bot : ajoute le lien vers BotDev
      applyBotAbout(botId, entry).catch(() => {});
    } catch (e) { console.error(`[BotDev] ready error (bot ${botId}):`, e.message); }
  });

  client.on('messageCreate', (m) => {
    const { runMessageHandler } = require('./engine');
    runMessageHandler(botId, entry, m).catch(e => console.error('[BotDev] message error:', e.message));
  });

  client.on('interactionCreate', async (i) => {
    try {
      const { dispatchPanels } = require('./panels');
      const handled = await dispatchPanels(botId, i);
      if (handled) return;
      const { runInteractionHandler } = require('./engine');
      await runInteractionHandler(botId, entry, i);
    } catch (e) { console.error('[BotDev] interaction error:', e.message); }
  });

  client.on('guildMemberAdd', (member) => {
    const { runJoinEvent } = require('./events');
    runJoinEvent(botId, member).catch(e => console.error('[BotDev] join event error:', e.message));
  });

  client.on('guildMemberRemove', (member) => {
    const { runLeaveEvent } = require('./events');
    runLeaveEvent(botId, member).catch(e => console.error('[BotDev] leave event error:', e.message));
  });

  // Nouveau serveur : synchronise les commandes avec retries automatiques
  // (les commandes slash apparaissent ainsi dès l'ajout du bot)
  client.on('guildCreate', (guild) => {
    let attempts = 0;
    const trySync = async () => {
      attempts += 1;
      try {
        await syncSlashCommands(botId, guild.id, true);
        console.log(`[BotDev] bot ${botId} : commandes synchronisées pour le nouveau serveur ${guild.name}`);
      } catch (e) {
        if (attempts < 3) setTimeout(trySync, 5000);
        else console.error(`[BotDev] sync échouée pour ${guild.name} :`, e.message);
      }
    };
    trySync();
  });

  client.on('error', (err) => {
    console.error(`[BotDev] client error (bot ${botId}):`, err.message);
    store.bots.update(botId, { last_error: friendlyError(err) });
  });
}

function applyPresence(record) {
  const entry = clients.get(record.id);
  if (!entry) return;
  const { client } = entry;
  try {
    client.user.setPresence({
      status: record.status_type || 'online',
      activities: record.status_text ? [{ name: record.status_text, type: 3 }] : [],
    });
  } catch (e) {
    console.error('[BotDev] presence error:', e.message);
  }
}

// ---------------------- Commandes slash ----------------------
// Enregistre les commandes slash au niveau du serveur (instantané)
async function syncSlashCommands(botId, guildId, quiet = false) {
  const entry = clients.get(botId);
  if (!entry || !entry.client.isReady()) return;
  const record = store.bots.get(botId);
  if (!record) return;

  const { buildSlashPayloads } = require('./premade');
  const payloads = buildSlashPayloads(botId);
  const appId = record.client_id || entry.client.user.id;
  await entry.client.rest.put(
    `/applications/${appId}/guilds/${guildId}/commands`,
    { body: payloads }
  );
  if (!quiet) console.log(`[BotDev] bot ${botId} : ${payloads.length} commandes slash enregistrées pour le serveur ${guildId}`);
}

// ---------------------- Bio du bot (lien vers BotDev) ----------------------
async function applyBotAbout(botId, entry) {
  const url = store.settings.get('public_url');
  if (!url) return;
  const text = `🤖 Créé avec BotDev — ${url}\nTickets, rôles, modération, économie et plus, sans coder.`;
  if (store.settings.get(`about_${botId}`) === text) return; // déjà à jour
  try {
    await entry.client.rest.patch('/applications/@me', { body: { description: text.slice(0, 400) } });
    store.settings.set(`about_${botId}`, text);
    console.log(`[BotDev] bot ${botId} : bio « À propos » mise à jour avec ${url}`);
  } catch (e) {
    console.log(`[BotDev] bot ${botId} : bio non mise à jour (${e.message})`);
  }
}

// ---------------------- Stats publiques (dashboard public, synchro live) ----------------------
// Lues en direct depuis le processus du bot : ce sont les vraies données Discord.
function publicBotInfo(botId) {
  const record = store.bots.get(botId);
  if (!record) return null;
  const entry = clients.get(botId);
  const online = !!(entry && entry.client.isReady());
  let servers = 0, members = 0, ping = 0, uptime = 0;
  if (online) {
    for (const g of entry.client.guilds.cache.values()) { servers++; members += g.memberCount || 0; }
    ping = entry.client.ws.ping;
    uptime = entry.startedAt ? Math.floor((Date.now() - entry.startedAt) / 1000) : 0;
  }
  return {
    id: record.id,
    name: record.name,
    username: record.bot_username || '',
    avatar_url: record.avatar_url || '',
    client_id: record.client_id || '',
    online,
    servers,
    members,
    ping,
    uptime,
    invite_url: record.client_id
      ? `https://discord.com/oauth2/authorize?client_id=${record.client_id}&permissions=8&scope=bot%20applications.commands`
      : '',
  };
}

function platformStats() {
  let onlineBots = 0, servers = 0, members = 0;
  for (const entry of clients.values()) {
    if (!entry.client.isReady()) continue;
    onlineBots++;
    for (const g of entry.client.guilds.cache.values()) { servers++; members += g.memberCount || 0; }
  }
  return { onlineBots, servers, members };
}

module.exports = { clients, getClient, isOnline, loginBot, logoutBot, stopAll, syncSlashCommands, applyPresence, applyBotAbout, publicBotInfo, platformStats };
