// ============================================================
// BotDev - Niveaux (XP) : gain en discutant, annonces de niveau,
// rôles de récompense, tout est configurable par serveur.
// ============================================================
const store = require('../db');
const { EmbedBuilder } = require('discord.js');

// Progression : niveau N nécessite 100*N² XP
function xpForLevel(level) {
  return 100 * level * level;
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

function resolveRole(guild, nameOrId) {
  const q = String(nameOrId || '').trim();
  if (!q) return null;
  const id = q.replace(/[<@&>]/g, '');
  if (/^\d{15,21}$/.test(id)) {
    const byId = guild.roles.cache.get(id);
    if (byId) return byId;
  }
  return guild.roles.cache.find((r) => r.name.toLowerCase() === q.toLowerCase()) || null;
}

function resolveChannel(guild, query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) {
    const c = guild.channels.cache.get(idMatch[1]);
    if (c) return c;
  }
  const name = q.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find((c) => c.name && c.name.toLowerCase() === name && c.isTextBased && c.isTextBased()) || null;
}

// Appelé à chaque message. Retourne true si de l'XP a été gagnée.
async function onMessage(botId, message) {
  if (!message || message.author.bot || !message.guild) return false;
  const gs = store.guildSettings.get(botId, message.guild.id) || {};
  if (gs.xp_enabled === 0) return false;

  const now = Date.now();
  const row = store.xp.get(botId, message.guild.id, message.author.id);
  const cooldown = Math.max(0, Number(gs.xp_cooldown ?? 60)) * 1000;
  if (row && row.last_ts && now - row.last_ts < cooldown) return false;

  const rawMin = Number(gs.xp_min ?? 10);
  const rawMax = Number(gs.xp_max ?? 25);
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  const amount = Math.floor(min + Math.random() * (max - min + 1));

  const newXp = (row ? row.xp : 0) + amount;
  const newLevel = levelFromXp(newXp);
  const oldLevel = row ? (row.level || 0) : 0;

  store.xp.add(botId, message.guild.id, message.author.id, amount, now);

  if (newLevel > oldLevel) {
    store.xp.setLevel(botId, message.guild.id, message.author.id, newLevel);
    await announce(botId, message, newLevel, gs);
    await applyRewards(botId, message, newLevel);
  }
  return true;
}

async function announce(botId, message, level, gs) {
  const template = String(gs.xp_message || '').trim() || '{user} vient d\'atteindre le **niveau {level}** ! 🎉';
  const text = template
    .replace(/\{user\}/g, `<@${message.author.id}>`)
    .replace(/\{level\}/g, String(level))
    .replace(/\{server\}/g, message.guild.name)
    .slice(0, 4096);
  let channel = null;
  // ⚠️ resolveChannel est ASYNCHRONE : sans await, on recevait une promesse
  // (sans .send) → l'annonce partait toujours dans le salon du message.
  if (gs.xp_channel) channel = await resolveChannel(message.guild, gs.xp_channel);
  channel = channel || message.channel;
  if (!channel || typeof channel.send !== 'function') return;

  // 🎉 Annonce de niveau en EMBED soigné (v209) : ton texte personnalisé
  // reste la description ({user}, {level}, {server}…), on y ajoute la
  // progression, le rang et la récompense de rôle débloquée.
  const row = store.xp.get(botId, message.guild.id, message.author.id) || { xp: 0 };
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const pct = next > cur ? Math.max(0, Math.min(1, (row.xp - cur) / (next - cur))) : 0;
  const bars = 12;
  const bar = '▰'.repeat(Math.round(pct * bars)) + '▱'.repeat(bars - Math.round(pct * bars));
  let pos = 0;
  try { pos = store.xp.rankOf(botId, message.guild.id, message.author.id) || 0; } catch {}
  let reward = '';
  try {
    const rewardAtLevel = (store.xpRoles.all(botId, message.guild.id) || []).find((r) => Number(r.level) === level);
    if (rewardAtLevel) {
      const role = resolveRole(message.guild, rewardAtLevel.role);
      if (role) reward = role.toString();
    }
  } catch {}

  const user = message.author || {};
  const embed = new EmbedBuilder()
    .setColor('#e07a5f')
    .setAuthor({ name: `${user.username || user.tag || 'Membre'} — niveau ${level} 🎉` })
    .setDescription(text)
    .addFields(
      { name: '📈 Niveau', value: `**${level}**`, inline: true },
      { name: '🏆 Rang', value: pos ? `#${pos}` : '—', inline: true },
      { name: '✨ XP', value: `${Math.max(row.xp || 0, cur)} / ${next}`, inline: true },
      ...(reward ? [{ name: '🎁 Rôle débloqué', value: reward, inline: true }] : []),
      { name: 'Progression', value: `${bar} ${Math.round(pct * 100)}%` },
    )
    .setFooter({ text: `Hoxera · ${message.guild.name}` })
    .setTimestamp();
  const identity = require('./identity');
  await identity.sendAsProfile(message.client, botId, message.guild, channel, { embeds: [embed] }).catch(() => {});
}

async function applyRewards(botId, message, level) {
  const roles = store.xpRoles.all(botId, message.guild.id);
  if (!roles.length || !message.member) return;
  const me = message.guild.members && message.guild.members.me ? message.guild.members.me : null;
  for (const r of roles) {
    if (r.level > level) continue;
    const role = resolveRole(message.guild, r.role);
    if (!role) continue;
    if (me && role.position >= me.roles.highest.position) continue;
    if (message.member.roles && message.member.roles.cache && !message.member.roles.cache.has(role.id)) {
      await message.member.roles.add(role).catch(() => {});
    }
  }
}

module.exports = { xpForLevel, levelFromXp, onMessage };
