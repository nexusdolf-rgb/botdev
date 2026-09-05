// ============================================================
// BotDev - Niveaux (XP) : gain en discutant, annonces de niveau,
// rôles de récompense, tout est configurable par serveur.
// ============================================================
const store = require('../db');
const { EmbedBuilder } = require('discord.js');
const ui = require('./ui');

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

// ============================================================
// v214 — Rôles de niveau « en échelle » : chaque niveau configuré
// possède son rôle. Atteindre un palier donne SON rôle et RETIRE les
// rôles des paliers inférieurs : le membre ne porte que son rang actuel.
// ============================================================

// Calcule l'objectif de rôle pour un niveau donné : le rôle du dernier
// palier atteint + les rôles de palier inférieurs qui doivent être retirés.
function computeRankGoal(rewards, level) {
  const list = (Array.isArray(rewards) ? rewards : [])
    .filter((r) => r && String(r.role || '').trim())
    .map((r) => ({ level: Math.max(1, parseInt(r.level, 10) || 1), role: String(r.role).trim() }))
    .sort((a, b) => a.level - b.level);
  let target = null;
  for (const r of list) if (r.level <= Number(level)) target = r;
  return {
    add: target ? target.role : null,
    remove: target ? list.filter((r) => r.level < target.level).map((r) => r.role) : [],
    targetLevel: target ? target.level : 0,
  };
}

// Applique le rôle de rang à un membre (ajout + retraits), en respectant la
// hiérarchie Discord. Renvoie les compteurs d'actions réellement effectuées.
async function applyRankToMember(botId, guild, member, level, rewards) {
  const out = { added: 0, removed: 0, changed: false };
  try {
    const roles = Array.isArray(rewards) ? rewards : store.xpRoles.all(botId, guild.id);
    if (!roles.length || !member || member.user && member.user.bot) return out;
    if (!member.roles || !member.roles.cache) return out;
    const goal = computeRankGoal(roles, Number(level) || 0);
    if (!goal.add) return out;
    const me = guild.members && guild.members.me ? guild.members.me : null;
    const target = resolveRole(guild, goal.add);
    if (!target) return out;
    if (me && me.roles && me.roles.highest && target.position >= me.roles.highest.position) return out;
    if (!member.roles.cache.has(target.id)) {
      await member.roles.add(target).catch(() => {});
      out.added = 1;
      out.changed = true;
    }
    for (const name of goal.remove) {
      if (name === goal.add) continue;
      const lower = resolveRole(guild, name);
      if (!lower || lower.id === target.id) continue;
      if (me && me.roles && me.roles.highest && lower.position >= me.roles.highest.position) continue;
      if (member.roles.cache.has(lower.id)) {
        await member.roles.remove(lower).catch(() => {});
        out.removed += 1;
        out.changed = true;
      }
    }
  } catch (e) {
    console.error('[Hoxera] rôle de niveau :', e.message);
  }
  return out;
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
    await announce(botId, message, newLevel, gs, oldLevel);
    await applyRewards(botId, message, newLevel);
  }
  return true;
}

async function announce(botId, message, level, gs, oldLevel = 0) {
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
    // v214 : le rôle annoncé est celui du palier FRANCHI (même en sautant
    // plusieurs niveaux d'un coup : ex 3 → 6 avec un palier à 5).
    const rewards = store.xpRoles.all(botId, message.guild.id) || [];
    let crossed = null;
    for (const r of rewards) {
      if (Number(r.level) > Number(oldLevel) && Number(r.level) <= Number(level)) crossed = r;
    }
    if (crossed) {
      const role = resolveRole(message.guild, crossed.role);
      if (role) reward = role.toString();
    }
  } catch {}

  const user = message.author || {};
  const avatarUrl = (typeof user.displayAvatarURL === 'function')
    ? user.displayAvatarURL({ extension: 'png', size: 256 }) : '';
  const authorName = `${user.username || user.tag || 'Membre'} 🎉`;
  const authorOpts = { name: authorName };
  if (avatarUrl) authorOpts.iconURL = avatarUrl;
  const embed = new EmbedBuilder()
    .setColor('#e07a5f')
    .setAuthor(authorOpts)
    .setDescription(ui.sectionize(text))
    .addFields(
      { name: '✨ XP', value: `${Math.max(row.xp || 0, cur)} / ${next}`, inline: true },
      { name: '🏆 Rang', value: pos ? `#${pos}` : '—', inline: true },
      ...(reward ? [{ name: '🎁 Rôle débloqué', value: reward, inline: true }] : []),
      { name: 'Progression', value: `${bar} ${Math.round(pct * 100)}%` },
    )
    .setFooter({ text: `Hoxera · ${message.guild.name}` })
    .setTimestamp();
  // 🖼️ Carte de montée de niveau (v210) : image avatar + niveau + barre de
  // progression, option activée par défaut — jamais bloquante : si la
  // génération échoue (ou option désactivée), l'embed part seul.
  let files = [];
  const cardEnabled = !(gs.xp_card === 0 || gs.xp_card === false);
  if (cardEnabled) {
    try {
      const community = require('./community');
      const buf = await community.levelUpCard({
        avatarUrl, name: user.username || user.tag || 'Membre',
        server: message.guild.name, level, pct,
      });
      if (buf && buf.length) {
        files = [{ attachment: buf, name: 'levelup.png' }];
        embed.setImage('attachment://levelup.png');
      }
    } catch (e) { console.error('[Hoxera] carte de niveau :', e.message); }
  }
  const identity = require('./identity');
  await identity.sendAsProfile(message.client, botId, message.guild, channel, { embeds: [embed], files }).catch(() => {});
}

async function applyRewards(botId, message, level) {
  const member = message.member;
  if (!member || !member.guild) return;
  await applyRankToMember(botId, message.guild, member, level, store.xpRoles.all(botId, message.guild.id));
}

module.exports = { xpForLevel, levelFromXp, onMessage, computeRankGoal, applyRankToMember, resolveRole };
