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
    .setColor(p && p.color ? p.color : '#5865F2')
    .setTitle(`${p && p.name ? p.name : botRecord.name} — identité de ce serveur`)
    .setDescription(p && p.bio ? p.bio : 'Aucune bio définie pour ce serveur.');
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
  embed.setFooter({ text: 'Personnalise avec /botprofile set · avatar · banner · reset' });
  return embed;
}

// Récupère ou crée le webhook du salon (utilisé pour l'identité personnalisée)
async function webhookFor(client, botId, guild, channel) {
  const key = `${botId}:${guild.id}:${channel.id}`;
  const cached = webhookCache.get(key);
  if (cached) return cached;
  try {
    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find((h) => h.owner && h.owner.id === client.user.id);
    if (!hook) {
      hook = await channel.createWebhook({ name: 'Hoxera Identity', avatar: client.user.displayAvatarURL({ size: 64 }) });
    }
    webhookCache.set(key, hook);
    return hook;
  } catch {
    return null; // permission Manages Webhooks manquante
  }
}

// Envoie un message avec l'identité du serveur (fallback : envoi normal)
async function sendAsProfile(client, botId, guild, channel, payload) {
  const p = profile(botId, guild.id);
  if (!p || !p.name) {
    return channel.send(payload).catch(() => {});
  }
  const hook = await webhookFor(client, botId, guild, channel);
  if (!hook) return channel.send(payload).catch(() => {});
  try {
    await hook.send({
      ...payload,
      username: p.name.slice(0, 80),
      avatarURL: absoluteUrl(p.avatar_url) || undefined,
    });
  } catch {
    await channel.send(payload).catch(() => {});
  }
}

module.exports = { profile, buildProfileEmbed, sendAsProfile, absoluteUrl };
