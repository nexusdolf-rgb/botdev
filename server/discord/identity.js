// ============================================================
// BotDev - Identité du bot PAR SERVEUR (nom, avatar, bannière, bio)
// Le bot s'exprime avec cette identité via des webhooks (Discord interdit
// de changer le nom/avatar global par serveur — c'est la méthode pro).
// ============================================================
const { EmbedBuilder } = require('discord.js');
const store = require('../db');

const webhookCache = new Map(); // botId:guildId:channelId -> webhook

function profile(botId, guildId) {
  return store.botProfiles.get(botId, guildId) || null;
}

// v211 — Profil d'envoi EFFECTIF : si un alias est actif (choisi dans les
// profils d'envoi), c'est lui qui signe les messages ; sinon le profil
// principal personnalisé ; sinon null (→ identité globale du bot).
function effectiveProfile(botId, guildId) {
  const principal = profile(botId, guildId);
  const activeId = store.profileState.getActive(botId, guildId);
  if (activeId) {
    const alias = store.profileAliases.get(activeId);
    if (alias && alias.name) {
      // Avatar : celui de l'alias, sinon celui du profil principal, sinon
      // l'avatar global du bot (pas d'URL) — jamais cassant.
      return { name: alias.name, avatar_url: alias.avatar_url || (principal && principal.avatar_url) || '' };
    }
  }
  return principal;
}

function absoluteUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  const site = store.settings.get('public_url') || '';
  return site ? site + path : '';
}

// Carte « profil du bot » affichée par /botprofile view
function buildProfileEmbed(botId, guildId, botRecord) {
  const p = profile(botId, guildId);
  const embed = new EmbedBuilder()
    .setColor(p && p.color ? p.color : '#e07a5f')
    .setAuthor({ name: 'Hoxera · Identité personnalisée' })
    .setTitle(`${p && p.name ? p.name : botRecord.name} — identité de ce serveur`)
    .setDescription(p && p.bio ? p.bio : 'Aucune bio définie pour ce serveur.')
    .setTimestamp();
  if (p && p.avatar_url) {
    const url = absoluteUrl(p.avatar_url);
    if (url) embed.setThumbnail(url);
  }
  if (p && p.banner_url) {
    const url = absoluteUrl(p.banner_url);
    if (url) embed.setImage(url);
  }
  embed.addFields(
    { name: '📛 Nom', value: (p && p.name) || botRecord.name, inline: true },
    { name: '🖼️ Avatar', value: p && p.avatar_url ? '✅ personnalisé' : 'avatar global', inline: true },
    { name: '🎴 Bannière', value: p && p.banner_url ? '✅ personnalisée' : 'aucune', inline: true },
  );
  embed.setFooter({ text: 'Personnalisez avec /botprofile set · avatar · banner · reset' });
  return embed;
}

// Récupère ou crée le webhook du salon (utilisé pour l'identité personnalisée)
const HOOK_NAME = 'Hoxera Identity';

// v373 — deux corrections ici, sur la raison la plus fréquente du « j'ai
// enregistré l'identité mais le bot ne la prend pas » :
//   1. `owner` n'est pas toujours rempli dans la réponse de fetchWebhooks.
//      On se rabattait alors sur une création de webhook à chaque redémarrage,
//      et sans la permission « Gérer les webhooks » la création échouait
//      silencieusement : plus aucune personnalisation, sans aucune trace.
//      On reconnaît donc aussi le webhook à son nom, et on le recrée s'il a
//      été supprimé à la main.
//   2. Un envoi raté gardait le webhook mort en cache pour toujours. Il est
//      maintenant oublié pour que l'envoi suivant le recrée.
async function webhookFor(client, botId, guild, channel) {
  const key = `${botId}:${guild.id}:${channel.id}`;
  const cached = webhookCache.get(key);
  if (cached) return cached;
  try {
    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find((h) => (h.owner && h.owner.id === client.user.id) || h.name === HOOK_NAME);
    if (!hook) {
      hook = await channel.createWebhook({
        name: HOOK_NAME,
        avatar: client.user.displayAvatarURL({ size: 64 }),
        reason: 'Identité du bot sur ce serveur',
      });
    }
    webhookCache.set(key, hook);
    return hook;
  } catch {
    return null; // permission « Gérer les webhooks » manquante
  }
}

function forgetWebhook(botId, guildId, channelId) {
  webhookCache.delete(`${botId}:${guildId}:${channelId}`);
}

// v373 — le diagnostic affiché par /botprofile view : l'identité ne peut
// s'appliquer que si le bot peut créer un webhook dans le salon visé.
async function identityStatus(client, botId, guild) {
  const p = profile(botId, guild.id);
  if (!p || !p.name) return { configured: false, webhook: true };
  const channel = guild.channels && guild.channels.cache
    ? guild.channels.cache.find((c) => c && c.isTextBased && c.isTextBased() && c.permissionsFor
      && c.permissionsFor(client.user) && c.permissionsFor(client.user).has('ManageWebhooks'))
    : null;
  return { configured: true, webhook: !!channel };
}

// Envoie un message avec l'identité du serveur (fallback : envoi normal).
// 🚦 Tous les envois passent par la FILE D'ATTENTE intelligente :
// les rafales (bienvenues, tickets, panneaux) sont lissées pour ne
// jamais dépasser les limites de débit de Discord.
async function sendAsProfile(client, botId, guild, channel, payload) {
  const queue = require('../queue');
  const p = effectiveProfile(botId, guild.id);
  if (!p || !p.name) {
    return queue.send(channel, payload);
  }
  let hook = await webhookFor(client, botId, guild, channel);
  if (!hook) return queue.send(channel, payload);
  const key = 'identite/' + String(botId) + '/' + String(guild.id).slice(0, 18);
  return queue.enqueue(async () => {
    const envoyer = (h) => h.send({
      ...payload,
      username: p.name.slice(0, 80),
      avatarURL: absoluteUrl(p.avatar_url) || undefined,
    });
    try {
      await envoyer(hook);
      return true;
    } catch (e) {
      // Webhook supprimé ou révoqué : on l'oublie et on en recrée un.
      forgetWebhook(botId, guild.id, channel.id);
      hook = await webhookFor(client, botId, guild, channel);
      if (hook) {
        try { await envoyer(hook); return true; } catch {}
      }
      try { await channel.send(payload); return true; } catch { return false; }
    }
  }, key);
}

// v373 — envoi « au nom du serveur » depuis n'importe quel module : on déduit
// le client et la guilde du salon, et on retombe proprement si le salon est un MP.
async function sendAs(botId, channel, payload) {
  const guild = channel && channel.guild;
  const client = channel && channel.client;
  // Salon sans guilde (MP) : rien à personnaliser, envoi direct comme avant.
  if (!guild || !client) return channel.send(payload);
  return sendAsProfile(client, botId, guild, channel, payload);
}

module.exports = {
  profile, effectiveProfile, buildProfileEmbed, sendAsProfile, absoluteUrl,
  sendAs, identityStatus, forgetWebhook, HOOK_NAME,
  // réservé aux tests : forcer un webhook en cache pour vérifier la reprise
  __testSetHook: (botId, guildId, channelId, hook) => webhookCache.set(`${botId}:${guildId}:${channelId}`, hook),
};
