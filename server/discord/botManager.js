// ============================================================
// BotDev - Gestionnaire de bots Discord (un client par bot)
// ============================================================
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');
const store = require('../db');

const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessageReactions, // ⭐ starboard
  GatewayIntentBits.GuildInvites,          // 📨 traqueur d'invitations
];

const clients = new Map(); // botId -> { client, record }

function getClient(botId) {
  return clients.get(botId) || null;
}

function isOnline(botId) {
  const e = clients.get(botId);
  return !!(e && e.client.isReady());
}

// Permissions RÉELLES du bot sur un serveur (diagnostic dashboard).
// Renvoie toujours un objet, même si le bot est hors ligne (perms vides).
function getGuildPerms(botId, guildId) {
  const e = clients.get(botId);
  if (!e || !e.client.isReady()) return { online: false, perms: null };
  const guild = e.client.guilds.cache.get(String(guildId));
  if (!guild) return { online: true, perms: null, reason: 'server_not_found' };
  const me = guild.members && guild.members.me;
  const has = (flag) => !!(me && me.permissions && me.permissions.has(flag));
  const F = PermissionsBitField.Flags;
  return {
    online: true,
    perms: {
      administrator: has(F.Administrator),
      manageMessages: has(F.ManageMessages),
      moderateMembers: has(F.ModerateMembers), // timeouts
      manageChannels: has(F.ManageChannels),
      kickMembers: has(F.KickMembers),
      banMembers: has(F.BanMembers),
      viewChannel: has(F.ViewChannel),
    },
  };
}

// ---------------------- Connexion ----------------------
async function loginBot(botId) {
  const record = store.bots.get(botId);
  if (!record) throw new Error('Bot introuvable');
  const existing = clients.get(botId);
  if (existing) {
    // Connexion morte (pas prête depuis plus de 6 min, soit plus que le
    // timeout patient de 5 min du login) → on nettoie et on reconnecte,
    // au lieu de croire le bot « déjà connecté ». Une tentative plus
    // récente est laissée tranquille (elle est peut-être en train d'aboutir).
    if (!existing.client.isReady() && Date.now() - (existing.startedAt || 0) > 360000) {
      try { existing.client.destroy(); } catch {}
      clients.delete(botId);
    } else {
      return { already: true };
    }
  }

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

// 🧊 Pause anti-refroidissement (fonction PURE, testable) : après plusieurs
// échecs consécutifs de la passerelle, marteler Discord PROLONGE le blocage
// de l'IP. Pause : 10 min au 3e échec, puis 20 min maximum — un essai toutes
// les 20 min est déjà ultra-respectueux (~3/heure) et permet de revenir en
// ligne au plus vite dès que le blocage se lève. Remise à zéro dès la
// première connexion réussie. L'état est PERSISTANT (base de données) : un
// redéploiement ne remet pas le compteur à zéro.
function gatewayPauseMs(failCount) {
  if (failCount < 3) return 0;
  return Math.min(10 * 60000 * Math.pow(2, failCount - 3), 20 * 60000);
}
const GW_KEY = 'gw_fail_state';
function readGwState() {
  try { return JSON.parse(store.settings.get(GW_KEY) || '{}') || {}; } catch { return {}; }
}

async function connect(botId, record, intents, degradedHint) {
  // 🧊 Pause en cours ? On refuse poliment (le chien de garde réessaiera).
  // Une pause héritée d'un ancien barème plus sévère est raccourcie au
  // plafond actuel (20 min) pour ne jamais attendre plus que nécessaire.
  const gw = readGwState();
  if (gw.until) {
    const maxUntil = Date.now() + 20 * 60000;
    if (gw.until > maxUntil) {
      gw.until = maxUntil;
      try { store.settings.set(GW_KEY, JSON.stringify(gw)); } catch {}
    }
    if (Date.now() < gw.until) {
      throw new Error(`pause anti-refroidissement — reprise dans ~${Math.ceil((gw.until - Date.now()) / 60000)} min (${gw.count} échecs passerelle consécutifs)`);
    }
  }

  const client = new Client({
    intents,
    // Partials : Message/Reaction pour le starboard sur d'anciens messages,
    // GuildMember/User pour que guildMemberRemove arrive MÊME si le membre
    // n'était pas en cache (sans ça : événements de DÉPART silencieusement
    // jetés par discord.js → messages d'au revoir jamais envoyés).
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember, Partials.User],
    presence: { status: record.status_type || 'online' },
  });

  const entry = { client, record };
  entry.startedAt = Date.now();
  clients.set(botId, entry);

  attachListeners(botId, entry);

  try {
    // ⏱️ Timeout de connexion PATIENT (5 min) : pendant un refroidissement,
    // Discord accepte parfois la connexion très lentement (>90 s). Abandonner
    // trop tôt créait des « clients zombies » : la connexion aboutissait
    // APRÈS notre abandon, recevait les commandes des membres mais n'était
    // plus enregistrée → « L'application ne répond pas » partout.
    console.log(`[BotDev] 🔌 bot ${botId} : connexion à Discord…`);
    await Promise.race([
      client.login(record.token),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('Connexion Discord trop longue (>5 min) — passerelle injoignable ou refroidissement en cours')),
        300000
      ).unref()),
    ]);
    console.log(`[BotDev] 🔌 bot ${botId} : connecté ✅`);
    try { store.settings.set(GW_KEY, '{}'); } catch {} // compteur d'échecs remis à zéro
    store.bots.update(botId, { enabled: 1, last_error: degradedHint });
    return { already: false, degraded: !!degradedHint };
  } catch (err) {
    console.log(`[BotDev] 🔌 bot ${botId} : échec de connexion — ${String(err.message || err).slice(0, 140)}`);
    // 🧊 Échec de type « passerelle injoignable » → on compte et on impose
    // une pause croissante pour laisser le refroidissement se lever.
    if (String(err.message || '').includes('trop longue')) {
      try {
        const st = readGwState();
        const count = (st.count || 0) + 1;
        const pause = gatewayPauseMs(count);
        store.settings.set(GW_KEY, JSON.stringify({ count, until: pause ? Date.now() + pause : 0 }));
        if (pause) console.log(`[BotDev] 🧊 bot ${botId} : ${count} échecs passerelle consécutifs — pause de ${Math.round(pause / 60000)} min pour laisser le refroidissement se lever`);
      } catch {}
    }
    clients.delete(botId);
    // 🧟 Anti-zombie : démontage COMPLET — on retire tous les écouteurs
    // (un zombie qui se connecterait quand même après coup ne ferait plus
    // rien) et on programme sa destruction s'il finit par aboutir.
    try { client.removeAllListeners(); } catch {}
    try {
      client.once('clientReady', () => { try { client.destroy(); } catch {} });
      client.once('ready', () => { try { client.destroy(); } catch {} });
    } catch {}
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

// ---------------------- Garde d'interaction (anti-crash / anti-blocage) ----------------------
// TOUTE interaction passe par cette garde :
//  - erreur dans un gestionnaire → réponse polie, le bot ne plante JAMAIS
//  - trop lent (15 s) → réponse « patiente un instant » + le traitement
//    continue en arrière-plan (plus jamais d'action « calée » sans réponse)
//  - aucun gestionnaire (commande pas encore synchronisée…) → réponse d'attente
async function guardInteraction(botId, entry, i, timeoutMs = 15000) {
  // 🌍 Messages dans la langue du serveur
  const lang = (() => {
    try {
      const i18n = require('../i18n');
      return i18n.langForGuild(i.guild ? i.guild.id : null);
    } catch { return 'fr'; }
  })();
  const t = (key) => {
    try { return require('../i18n').t(lang, key); } catch { return key; }
  };
  // 📉 Mode dégradé CRITIQUE : Discord est saturé → on répond immédiatement
  // « très occupé » au lieu de laisser l'interaction expirer en silence.
  try {
    const resilience = require('../resilience');
    if (resilience.shouldDeferReplies() && i.isChatInputCommand && i.isChatInputCommand()) {
      await i.reply({ content: t('guard_busy'), ephemeral: true }).catch(() => {});
      return;
    }
  } catch {}

  const work = (async () => {
    try {
      // 📊 Statistique d'utilisation : 1 compteur par commande et par jour
      try {
        if (i.isChatInputCommand && i.isChatInputCommand() && i.commandName) {
          store.cmdStats.bump(botId, i.guild ? i.guild.id : 'dm', i.commandName, new Date().toISOString().slice(0, 10));
        }
      } catch { /* jamais bloquant */ }
      const extra = require('./extra');
      // ⚠️ Bug historique corrigé (introduit en v1.50 le 17/08) : l'appel
      // passait (botId, i) alors que la fonction attend (botId, entry, i) —
      // l'interaction arrivait dans le paramètre « entry » et TOUTES les
      // interactions du module extra plantaient en silence.
      const extraHandled = await extra.handleInteraction(botId, entry, i);
      if (extraHandled) return;
      const { dispatchPanels } = require('./panels');
      const handled = await dispatchPanels(botId, i);
      if (handled) return;
      const { runInteractionHandler } = require('./engine');
      await runInteractionHandler(botId, entry, i);
      // Filet de sécurité : si AUCUN gestionnaire n'a répondu (commande pas encore
      // synchronisée, nom inconnu…), on répond quand même pour éviter le
      // « L'application ne répond pas » de Discord.
      if (i.isChatInputCommand() && !i.replied && !i.deferred) {
        await i.reply({
          content: t('guard_not_ready'),
          ephemeral: true,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[BotDev] interaction error:', (e && e.message) || e);
      try { require('../health').recordError('interaction', (e && e.message) || e); } catch {}
      // 📉 Seules les erreurs de débit/réseau alimentent le circuit breaker
      try {
        const resilience = require('../resilience');
        if (resilience.isRateOrNetwork(e)) resilience.recordFailure('interaction');
      } catch {}
      try {
        if (typeof i.isRepliable === 'function' && i.isRepliable() && !i.replied && !i.deferred) {
          await i.reply({ content: t('guard_error'), ephemeral: true });
        }
      } catch {}
    }
  })();

  const timeout = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), timeoutMs));
  const result = await Promise.race([work, timeout]);
  if (result === 'TIMEOUT') {
    const id = String(i.customId || i.commandName || '?').slice(0, 80);
    console.error(`[BotDev] ⏱️ Interaction trop lente (bot ${botId}, id=${id})`);
    try {
      if (typeof i.isRepliable === 'function' && i.isRepliable() && !i.replied && !i.deferred) {
        await i.reply({ content: t('guard_slow'), ephemeral: true }).catch(() => {});
      }
    } catch {}
  }
}

async function logoutBot(botId) {
  const entry = clients.get(botId);
  if (!entry) return;
  try { entry.client.destroy(); } catch {}
  clients.delete(botId);
  store.bots.update(botId, { enabled: 0, last_error: '' });
}

// 🔄 Reconnexion FORCÉE : détruit toute connexion morte et repart de zéro.
// (Sans ça, une session Discord morte restait dans la mémoire et loginBot
// croyait le bot « déjà connecté » → le bot restait hors ligne pour toujours.)
async function reconnectBot(botId) {
  const existing = clients.get(botId);
  if (existing) {
    try { existing.client.destroy(); } catch {}
    clients.delete(botId);
  }
  store.bots.update(botId, { enabled: 1 });
  return loginBot(botId);
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
      // 🖼️ Bannière de profil du bot : on garde l'URL à jour automatiquement
      // (utilisée dans le MP de transcription — si la bannière change au
      // portail développeur, le MP suivra tout seul au prochain démarrage).
      try {
        const meInfo = await entry.client.rest.get('/users/@me');
        if (meInfo && meInfo.banner) {
          store.settings.set('profile_banner_url', `https://cdn.discordapp.com/banners/${meInfo.id}/${meInfo.banner}.png?size=1024`);
        }
      } catch {}
      applyPresence(record);
      // Synchronisation par serveur, indépendante (une erreur n'empêche pas les autres)
      for (const g of client.guilds.cache.values()) {
        try { await syncSlashCommands(botId, g.id, true); }
        catch (e) { console.error(`[BotDev] sync ${g.id} (bot ${botId}):`, e.message); }
      }
      // 🌍 Commandes GLOBALES : un petit lot de commandes universelles.
      // C'est ce qui déclenche le badge « Supports Commands (/) » sur le profil
      // du bot (les commandes par serveur ne suffisent pas pour le badge).
      try { await syncGlobalCommands(botId); }
      catch (e) { console.error(`[BotDev] sync globale (bot ${botId}):`, e.message); }
      // Bio du bot : ajoute le lien vers BotDev
      applyBotAbout(botId, entry).catch(() => {});
      // 📨 Relevé initial des invitations de chaque serveur (traqueur)
      try {
        const community = require('./community');
        for (const g of client.guilds.cache.values()) community.cacheInvites(botId, g).catch(() => {});
      } catch {}
    } catch (e) { console.error(`[BotDev] ready error (bot ${botId}):`, e.message); }
  });

  client.on('messageCreate', (m) => {
    const extra = require('./extra');
    extra.trackMessage(botId, m);
    const { runMessageHandler } = require('./engine');
    runMessageHandler(botId, entry, m).catch(e => console.error('[BotDev] message error:', e.message));
  });

  client.on('messageDelete', (m) => {
    const { trackDeleted } = require('./extra');
    trackDeleted(botId, m);
    // 📋 Journal d'audit : messages supprimés (sauf ceux de l'auto-mod, déjà tracés)
    try { require('./auditLog').onMessageDelete(botId, m); } catch (e) { console.error('[BotDev] audit msgDelete:', e.message); }
  });

  client.on('messageDeleteBulk', (msgs) => {
    try { require('./auditLog').onMessageDeleteBulk(botId, msgs); } catch (e) { console.error('[BotDev] audit bulk:', e.message); }
  });

  client.on('messageUpdate', (oldMsg, newMsg) => {
    try { require('./auditLog').onMessageUpdate(botId, oldMsg, newMsg); } catch (e) { console.error('[BotDev] audit msgUpdate:', e.message); }
  });

  client.on('guildMemberUpdate', (oldMember, newMember) => {
    try { require('./auditLog').onGuildMemberUpdate(botId, oldMember, newMember); } catch (e) { console.error('[BotDev] audit memberUpdate:', e.message); }
  });

  client.on('channelCreate', (c) => {
    try { require('./auditLog').onChannelCreate(botId, c); } catch (e) { console.error('[BotDev] audit chCreate:', e.message); }
  });

  client.on('channelDelete', (c) => {
    try { require('./auditLog').onChannelDelete(botId, c); } catch (e) { console.error('[BotDev] audit chDelete:', e.message); }
  });

  client.on('channelUpdate', (oldC, newC) => {
    try { require('./auditLog').onChannelUpdate(botId, oldC, newC); } catch (e) { console.error('[BotDev] audit chUpdate:', e.message); }
  });

  client.on('threadCreate', (t) => {
    try { require('./auditLog').onThreadCreate(botId, t); } catch (e) { console.error('[BotDev] audit thCreate:', e.message); }
  });

  client.on('threadDelete', (t) => {
    try { require('./auditLog').onThreadDelete(botId, t); } catch (e) { console.error('[BotDev] audit thDelete:', e.message); }
  });

  client.on('roleCreate', (r) => {
    try { require('./auditLog').onRoleCreate(botId, r); } catch (e) { console.error('[BotDev] audit roleCreate:', e.message); }
  });

  client.on('roleDelete', (r) => {
    try { require('./auditLog').onRoleDelete(botId, r); } catch (e) { console.error('[BotDev] audit roleDelete:', e.message); }
  });

  client.on('roleUpdate', (oldR, newR) => {
    try { require('./auditLog').onRoleUpdate(botId, oldR, newR); } catch (e) { console.error('[BotDev] audit roleUpdate:', e.message); }
  });

  client.on('guildUpdate', (oldG, newG) => {
    try { require('./auditLog').onGuildUpdate(botId, oldG, newG); } catch (e) { console.error('[BotDev] audit guildUpdate:', e.message); }
  });

  client.on('webhooksUpdate', (c) => {
    try { require('./auditLog').onWebhooksUpdate(botId, c); } catch (e) { console.error('[BotDev] audit webhooks:', e.message); }
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const { onVoiceState } = require('./extra');
    onVoiceState(botId, entry, oldState, newState);
    // 📋 Journal d'audit : connexions / déconnexions / déplacements vocaux
    try { require('./auditLog').onVoiceState(botId, oldState, newState); } catch (e) { console.error('[BotDev] audit voice:', e.message); }
  });

  client.on('interactionCreate', (i) => {
    guardInteraction(botId, entry, i).catch((e) => console.error('[BotDev] interaction guard:', (e && e.message) || e));
  });

  client.on('guildMemberAdd', (member) => {
    // 📨 Attribution de l'invitation AVANT tout (le relevé doit être frais)
    const community = require('./community');
    community.onMemberJoinInvites(botId, member).catch(() => {});
    const { runJoinEvent } = require('./events');
    runJoinEvent(botId, member).catch(e => console.error('[BotDev] join event error:', e.message));
  });

  client.on('guildMemberRemove', (member) => {
    const { runLeaveEvent } = require('./events');
    runLeaveEvent(botId, member).catch(e => console.error('[BotDev] leave event error:', e.message));
  });

  // Nouveau serveur : synchronise les commandes avec retries automatiques
  // (les commandes slash apparaissent ainsi dès l'ajout du bot)
  // ⭐ Starboard : réactions étoile ajoutées/retirées
  client.on('messageReactionAdd', (reaction) => {
    const community = require('./community');
    community.onReaction(botId, reaction).catch(() => {});
  });
  client.on('messageReactionRemove', (reaction) => {
    const community = require('./community');
    community.onReaction(botId, reaction).catch(() => {});
  });

  // 📨 Traqueur d'invitations : cache tenu à jour en continu
  client.on('inviteCreate', (invite) => {
    const community = require('./community');
    if (invite.guild) community.cacheInvites(botId, invite.guild).catch(() => {});
  });
  client.on('inviteDelete', (invite) => {
    const community = require('./community');
    if (invite.guild) community.cacheInvites(botId, invite.guild).catch(() => {});
  });

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
// 🌍 v1.93 : TOUTES les commandes sont GLOBALES — une mise à jour = tous les
// serveurs d'un coup (y compris les serveurs futurs), zéro doublon dans le
// menu « / ». Cette fonction ne fait plus qu'une chose : retirer UNE FOIS
// les anciennes copies « par serveur » (sinon chaque commande apparaissait
// en double : version globale + version serveur, parfois périmée).
async function syncSlashCommands(botId, guildId, quiet = false) {
  const entry = clients.get(botId);
  if (!entry || !entry.client.isReady()) return;
  const record = store.bots.get(botId);
  if (!record) return;
  const key = `guild_cmds_cleared_${guildId}`;
  if (store.settings.get(key) === 'oui') return;
  const appId = record.client_id || entry.client.user.id;
  await entry.client.rest.put(
    `/applications/${appId}/guilds/${guildId}/commands`,
    { body: [] }
  );
  store.settings.set(key, 'oui');
  if (!quiet) console.log(`[BotDev] bot ${botId} : anciennes copies par serveur retirées (${guildId}) — tout est global désormais`);
}

// ---------------------- Commandes slash GLOBALES ----------------------
// TOUTES les commandes sont enregistrées globalement : elles fonctionnent
// partout (et déclenchent le badge « Supports Commands (/) »). Dans les
// serveurs, la version par serveur (synchro instantanée) prend le dessus.
// Précautions :
//  - Limite Discord : 100 commandes globales → on plafonne à 90.
//  - Limite de débit : on ne re-synchronise que si la liste a CHANGÉ (hash).
//  - Erreurs (429 / dépassement) gérées sans faire tomber le bot.
const crypto = require('crypto');

// 🧭 Décision de synchronisation globale (fonction PURE, testable) :
//  - 'sync'  : la liste voulue a changé → il faut pousser
//  - 'drift' : le hash dit « à jour » MAIS l'état réel chez Discord ne
//              correspond pas (ex: un démarrage sur base vide a écrasé la
//              liste) → il faut re-pousser. Sans cette vérification, le
//              bot fait confiance à sa mémoire pour toujours et les
//              commandes « disparues » ne reviennent JAMAIS.
//  - 'skip'  : tout est cohérent → on ne touche à rien (limite de débit)
function globalSyncDecision(storedHash, wantedHash, discordCount, wantedCount) {
  if (storedHash !== wantedHash) return 'sync';
  if (discordCount !== wantedCount) return 'drift';
  return 'skip';
}

async function syncGlobalCommands(botId) {
  const entry = clients.get(botId);
  if (!entry || !entry.client.isReady()) return;
  const record = store.bots.get(botId);
  if (!record) return;

  const { buildSlashPayloads } = require('./premade');
  const { buildExtraPayloads } = require('./extra');
  const all = [...buildSlashPayloads(botId), ...buildExtraPayloads()];
  if (!all.length) return;

  const global = all.slice(0, 90).map(p => ({ ...p, dm_permission: false })); // plafond de sécurité (limite Discord : 100) + commandes réservées aux serveurs
  const hash = crypto.createHash('sha1').update(JSON.stringify(global)).digest('hex');
  const key = `global_cmds_${botId}`;
  const appId = record.client_id || entry.client.user.id;

  if (store.settings.get(key) === hash) {
    // 🧭 Anti-dérive : on vérifie l'état RÉEL chez Discord (1 lecture toutes
    // les 10 min, sans risque de limite de débit).
    let discordCount = -1;
    try {
      const current = await entry.client.rest.get(`/applications/${appId}/commands`);
      if (Array.isArray(current)) discordCount = current.length;
    } catch { return; } // lecture impossible → on réessaiera au prochain cycle
    const decision = globalSyncDecision(store.settings.get(key), hash, discordCount, global.length);
    if (decision === 'skip') return;
    console.log(`[BotDev] bot ${botId} : dérive des commandes globales détectée (${discordCount} chez Discord ≠ ${global.length} attendues) — re-synchronisation…`);
  }

  try {
    await entry.client.rest.put(`/applications/${appId}/commands`, { body: global });
    store.settings.set(key, hash);
    console.log(`[BotDev] bot ${botId} : ${global.length} commandes GLOBALES enregistrées (badge /)${all.length > 90 ? ` — ${all.length - 90} ignorées (limite Discord)` : ''}`);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('429') || msg.includes('rate')) {
      console.log(`[BotDev] bot ${botId} : commandes globales en attente (limite de débit Discord), nouvelle tentative au prochain cycle.`);
      return;
    }
    if (msg.includes('cannot exceed 100')) {
      console.error(`[BotDev] bot ${botId} : trop de commandes globales (${global.length}) — limite Discord de 100 dépassée.`);
      return;
    }
    throw e;
  }
}

// ---------------------- Bio du bot (« À propos de moi ») ----------------------
// Belle bio avec le dashboard, le serveur support officiel et /help.
// Limite Discord : 190 caractères — longueur vérifiée par test automatique.
const OFFICIAL_URL = 'https://hoxera.onrender.com';
const SUPPORT_URL = 'https://discord.gg/X9hTdr9N3'; // Serveur support officiel de Nexora

function aboutText() {
  return [
    '✨ Hoxera — le bot qui anime ton serveur !',
    '🎫 Tickets · 📈 XP · 💰 Coins · 🕹️ Jeux · ❓ /help',
    `🌐 Dashboard : ${OFFICIAL_URL}`,
    `🆘 Support : ${SUPPORT_URL}`,
  ].join('\n').slice(0, 190);
}

async function applyBotAbout(botId, entry) {
  const text = aboutText();
  if (store.settings.get(`about3_${botId}`) === text) return; // déjà à jour
  try {
    await entry.client.rest.patch('/applications/@me', { body: { description: text } });
    store.settings.set(`about3_${botId}`, text);
    console.log(`[BotDev] bot ${botId} : bio « À propos » mise à jour (${text.length} caractères)`);
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

module.exports = { clients, getClient, isOnline, getGuildPerms, loginBot, reconnectBot, logoutBot, stopAll, syncSlashCommands, syncGlobalCommands, globalSyncDecision, gatewayPauseMs, applyPresence, applyBotAbout, aboutText, publicBotInfo, platformStats, guardInteraction };
