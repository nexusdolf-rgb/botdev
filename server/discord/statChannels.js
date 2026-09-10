// ============================================================
// Hoxera — 📊 v264 — Compteurs en salons vocaux (pack classique)
// Une catégorie verrouillée « 📊 Statistiques du serveur » contient trois
// salons vocaux impossibles à rejoindre dont le NOM est une statistique :
//   👥 Membres : 1 234 · 🟢 En ligne : 456 · 🚀 Boosts : 14
//
// Pourquoi des salons vocaux : tout le monde les voit dans la liste des
// salons, sans commande, sans permission — c'est l'affichage le plus visible
// de Discord (c'est ainsi que font les gros bots de statistiques).
//
// Fiabilité : Discord limite les renommages (~2 par 10 min et par salon).
// On ne renomme donc QUE si le chiffre a changé, et jamais avant 10 min 30
// après le renommage précédent. Un redémarrage ne provoque pas de renommage
// inutile (on compare aussi au nom actuel du salon).
// ============================================================
const store = require('../db');

const RENAME_MIN_MS = 10 * 60 * 1000 + 30 * 1000;
const KINDS = ['members', 'online', 'boosts'];

// Mémoire vive des derniers renommages : `${botId}:${channelId}` → { value, ts }
const memory = new Map();

// ------------------------------------------------------------
// 🏷️ Nom du salon (fonction PURE) — chiffres au format français
// ------------------------------------------------------------
function statName(kind, value) {
  // toLocaleString('fr-FR') met une ESPACE FINE insécable (U+202F) entre les
  // milliers : on la remplace par une espace normale, plus sûre dans un nom
  // de salon Discord.
  const n = Math.max(0, Number(value || 0)).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');
  if (kind === 'members') return `👥 Membres : ${n}`;
  if (kind === 'online') return `🟢 En ligne : ${n}`;
  return `🚀 Boosts : ${n}`;
}

// ------------------------------------------------------------
// 🔢 Lecture des statistiques du serveur (fonction PURE)
// ------------------------------------------------------------
function computeStats(guild) {
  const members = Math.max(0, Number(guild.memberCount || 0));
  let online = 0;
  try {
    const pres = guild.presences && guild.presences.cache;
    if (pres) {
      if (typeof pres.filter === 'function') {
        online = pres.filter((p) => p && p.status && p.status !== 'offline').size;
      } else if (typeof pres.values === 'function') {
        online = [...pres.values()].filter((p) => p && p.status !== 'offline').length;
      }
    }
  } catch {}
  const boosts = Math.max(0, Number(guild.premiumSubscriptionCount || 0));
  return { members, online, boosts };
}

// ------------------------------------------------------------
// ⏱️ Décision de renommage (fonction PURE)
// ------------------------------------------------------------
function shouldRename(prevValue, nextValue, lastRenameTs, now) {
  if (Number(prevValue) === Number(nextValue)) return false;
  if (lastRenameTs && now - lastRenameTs < RENAME_MIN_MS) return false;
  return true;
}

// ------------------------------------------------------------
// 🏗️ Activation : catégorie + 3 salons verrouillés, IDs enregistrés
// ------------------------------------------------------------
async function setupGuild(botId, guild) {
  const { PermissionFlagsBits, ChannelType } = require('discord.js');
  const stats = computeStats(guild);
  const everyone = guild.roles.everyone.id;
  const category = await guild.channels.create({
    name: '📊 Statistiques du serveur',
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.Connect] },
    ],
  });
  const ids = {};
  for (const kind of KINDS) {
    const channel = await guild.channels.create({
      name: statName(kind, stats[kind]),
      type: ChannelType.GuildVoice,
      parent: category.id,
      permissionOverwrites: [
        {
          id: everyone,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
        },
      ],
    });
    ids[kind] = channel.id;
    memory.set(`${botId}:${channel.id}`, { value: stats[kind], ts: Date.now() });
  }
  store.guildSettings.set(botId, guild.id, { stat_category: category.id, stat_ids: JSON.stringify(ids) });
  return { category: category.id, ids };
}

// ------------------------------------------------------------
// 🧹 Désactivation : salons + catégorie supprimés, réglage effacé
// ------------------------------------------------------------
async function offGuild(botId, guild) {
  const gs = store.guildSettings.get(botId, guild.id) || {};
  let ids = {};
  try { ids = JSON.parse(String(gs.stat_ids || '{}')); } catch {}
  const targets = [...KINDS.map((k) => ids[k]).filter(Boolean), gs.stat_category].filter(Boolean);
  for (const id of targets) {
    try {
      const channel = guild.channels.cache.get ? guild.channels.cache.get(id) : null;
      if (channel && typeof channel.delete === 'function') await channel.delete();
    } catch (e) {
      console.warn(`[Hoxera] 📊 suppression ${id} : ${e.message}`);
    }
    memory.delete(`${botId}:${id}`);
  }
  store.guildSettings.set(botId, guild.id, { stat_category: '', stat_ids: '' });
  return targets.length;
}

// ------------------------------------------------------------
// 🔁 Balayage : renomme les salons quand le chiffre a changé
// ------------------------------------------------------------
async function sweep(botManager) {
  const now = Date.now();
  for (const [botId, entry] of botManager.clients) {
    if (!entry || !entry.client || typeof entry.client.isReady !== 'function' || !entry.client.isReady()) continue;
    const guilds = entry.client.guilds && entry.client.guilds.cache;
    if (!guilds || typeof guilds.values !== 'function') continue;
    for (const guild of guilds.values()) {
      const gs = store.guildSettings.get(botId, guild.id) || {};
      const raw = String(gs.stat_ids || '');
      if (!raw) continue;
      let ids = {};
      try { ids = JSON.parse(raw); } catch { continue; }
      const stats = computeStats(guild);
      for (const kind of KINDS) {
        const id = ids[kind];
        if (!id) continue;
        const channel = guild.channels.cache.get ? guild.channels.cache.get(id) : null;
        if (!channel || typeof channel.setName !== 'function') continue;
        const wanted = statName(kind, stats[kind]);
        const key = `${botId}:${id}`;
        const mem = memory.get(key) || { value: null, ts: 0 };
        // Nom déjà correct (ex. retour après redémarrage) : rien à faire.
        if (channel.name === wanted) {
          memory.set(key, { value: stats[kind], ts: mem.ts });
          continue;
        }
        if (!shouldRename(mem.value, stats[kind], mem.ts, now)) continue;
        try {
          await channel.setName(wanted, 'Compteur de statistiques Hoxera');
          memory.set(key, { value: stats[kind], ts: now });
          console.log(`[Hoxera] 📊 ${guild.name || guild.id} : salon compteur → « ${wanted} »`);
        } catch (e) {
          console.warn(`[Hoxera] 📊 renommage impossible (${kind}) : ${e.message}`);
          // On garde l'ancien horodatage limité : nouvel essai au prochain
          // créneau, sans marteler l'API.
          memory.set(key, { value: mem.value, ts: Math.max(mem.ts, now - RENAME_MIN_MS + 60000) });
        }
      }
    }
  }
}

module.exports = { KINDS, RENAME_MIN_MS, statName, computeStats, shouldRename, setupGuild, offGuild, sweep };
