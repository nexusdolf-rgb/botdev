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
  clients.set(botId, entry);

  attachListeners(botId, entry);

  try {
    await client.login(record.token);
    store.bots.update(botId, { enabled: 1, last_error: degradedHint });
    return { already: false, degraded: !!degradedHint };
  } catch (err) {
    clients.delete(botId);
    client.destroy().catch(() => {});
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

async function stopAll() {
  for (const id of [...clients.keys()]) await logoutBot(id);
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
      await Promise.all([...client.guilds.cache.values()].map(g => syncSlashCommands(botId, g.id)));
    } catch (e) { console.error(`[BotDev] ready error (bot ${botId}):`, e.message); }
  });

  client.on('messageCreate', (m) => {
    const { runMessageHandler } = require('./engine');
    runMessageHandler(botId, entry, m).catch(e => console.error('[BotDev] message error:', e.message));
  });

  client.on('interactionCreate', (i) => {
    const { runInteractionHandler } = require('./engine');
    runInteractionHandler(botId, entry, i).catch(e => console.error('[BotDev] interaction error:', e.message));
  });

  client.on('guildMemberAdd', (member) => {
    const { runJoinEvent } = require('./events');
    runJoinEvent(botId, member).catch(e => console.error('[BotDev] join event error:', e.message));
  });

  client.on('guildMemberRemove', (member) => {
    const { runLeaveEvent } = require('./events');
    runLeaveEvent(botId, member).catch(e => console.error('[BotDev] leave event error:', e.message));
  });

  client.on('guildCreate', async (guild) => {
    await syncSlashCommands(botId, guild.id).catch(() => {});
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
  client.user.setPresence({
    status: record.status_type || 'online',
    activities: record.status_text ? [{ name: record.status_text, type: 3 }] : [],
  }).catch(() => {});
}

// ---------------------- Commandes slash ----------------------
// Enregistre les commandes slash au niveau du serveur (instantané)
async function syncSlashCommands(botId, guildId) {
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
  console.log(`[BotDev] bot ${botId} : ${payloads.length} commandes slash enregistrées pour le serveur ${guildId}`);
}

module.exports = { clients, getClient, isOnline, loginBot, logoutBot, stopAll, syncSlashCommands, applyPresence };
