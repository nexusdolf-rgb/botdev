// ============================================================
// Hoxera — Communauté PRO : ⭐ Starboard, 📨 Traqueur d'invitations,
// 🖼️ Carte de bienvenue, ⚖️ Paliers de sanctions automatiques.
// Les décisions sont des fonctions PURES (testables sans Discord).
// ============================================================
const store = require('../db');

// ------------------------------------------------------------
// ⚖️ Paliers de sanctions automatiques (fonction pure)
// gs : guild_settings — 2 paliers indépendants :
//   - palier 1 : warn_timeout_limit avertissements → timeout warn_timeout_min minutes
//   - palier 2 : warn_limit avertissements → warn_action (timeout|kick|ban)
// Renvoie la sanction LA PLUS SÉVÈRE atteinte : {action, minutes} ou null.
// ------------------------------------------------------------
function sanctionForWarns(count, gs) {
  const g = gs || {};
  let result = null;
  const t1 = parseInt(g.warn_timeout_limit, 10) || 0;
  if (t1 > 0 && count >= t1) {
    result = { action: 'timeout', minutes: Math.max(1, parseInt(g.warn_timeout_min, 10) || 60) };
  }
  const t2 = parseInt(g.warn_limit, 10) || 0;
  const a2 = String(g.warn_action || 'none');
  if (t2 > 0 && count >= t2 && ['timeout', 'kick', 'ban'].includes(a2)) {
    if (a2 === 'timeout') {
      result = { action: 'timeout', minutes: Math.max(1, parseInt(g.warn_timeout_min, 10) || 60) };
    } else {
      result = { action: a2, minutes: 0 }; // kick/ban priment sur le timeout
    }
  }
  return result;
}

// ------------------------------------------------------------
// 🤖 Sanction d'un avertissement AUTO-MOD (fonction pure)
// L'auto-mod compte tous les avertissements du membre (manuels + automatiques)
// et applique l'action au seuil configuré. Après une sanction réussie, le
// compteur ACTIF repart à zéro ; l'historique reste visible au dashboard.
// ------------------------------------------------------------
function autoModSanctionForWarning(count, gs) {
  const g = gs || {};
  const n = Math.max(parseInt(count, 10) || 0, 0);
  const limit = Math.max(parseInt(g.am_warn_limit, 10) || 0, 0);
  const action = String(g.am_warn_action || 'none');
  if (!limit || n < limit) return null;
  if (!['timeout', 'kick', 'ban'].includes(action)) return null;
  return {
    action,
    minutes: action === 'timeout' ? Math.min(Math.max(parseInt(g.am_warn_timeout_min, 10) || 10, 1), 1440) : 0,
    threshold: limit,
  };
}

// ------------------------------------------------------------
// ⭐ Starboard — décision pure
// ------------------------------------------------------------
function starboardDecision(stars, minStars, alreadyPosted) {
  const n = parseInt(stars, 10) || 0;
  const min = Math.max(1, parseInt(minStars, 10) || 3);
  if (n >= min) return alreadyPosted ? 'update' : 'post';
  return alreadyPosted ? 'update' : 'none'; // en dessous du seuil : maj du compteur si déjà publié
}

async function onReaction(botId, reaction) {
  try {
    if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
    const emojiName = reaction.emoji && reaction.emoji.name;
    if (emojiName !== '⭐' && emojiName !== '🌟') return;
    const msg = reaction.message;
    if (msg.partial) { try { await msg.fetch(); } catch { return; } }
    const guild = msg.guild;
    if (!guild) return;

    const gs = store.guildSettings.get(botId, guild.id) || {};
    const chanName = String(gs.starboard_channel || '').replace(/^#/, '').trim();
    if (!chanName) return; // starboard non configuré
    const board = guild.channels.cache.find(c => c.name === chanName && c.isTextBased && c.isTextBased());
    if (!board || board.id === msg.channel.id) return; // jamais de starboard du starboard

    // Compte total d'étoiles (⭐ + 🌟), auteur exclu du comptage ? Non : simple et lisible.
    let stars = 0;
    for (const r of msg.reactions.cache.values()) {
      const n = r.emoji && r.emoji.name;
      if (n === '⭐' || n === '🌟') stars += r.count || 0;
    }

    const existing = store.starboard.get(botId, guild.id, msg.id);
    const decision = starboardDecision(stars, gs.starboard_min, !!existing);
    if (decision === 'none') return;

    const { EmbedBuilder } = require('discord.js');
    const ui = require('./ui');
    const author = msg.author || {};
    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: author.tag || author.username || 'Membre', iconURL: author.displayAvatarURL ? author.displayAvatarURL({ size: 64 }) : undefined })
      .setDescription(msg.content ? ui.sectionize(String(msg.content).slice(0, 2000)) : '*—*')
      .addFields({ name: '\u200b', value: `[Aller au message](${msg.url})` })
      .setFooter({ text: `⭐ ${stars} · #${msg.channel.name}` })
      .setTimestamp(msg.createdAt || new Date());
    const img = msg.attachments && msg.attachments.first ? msg.attachments.first() : null;
    if (img && img.contentType && img.contentType.startsWith('image/')) embed.setImage(img.url);

    if (decision === 'post') {
      const sent = await board.send({ content: `⭐ **${stars}**`, embeds: [embed] }).catch(() => null);
      if (sent) store.starboard.set(botId, guild.id, msg.id, sent.id, stars);
      if (sent) store.activity.add(botId, guild.id, '⭐', `Message de ${author.tag || author.username || 'un membre'} épinglé au starboard (${stars} étoiles)`);
    } else {
      // mise à jour du compteur (ou suppression si retombé à 0)
      const starMsg = await board.messages.fetch(existing.star_message_id).catch(() => null);
      if (!starMsg) { store.starboard.remove(botId, guild.id, msg.id); return; }
      if (stars <= 0) {
        await starMsg.delete().catch(() => {});
        store.starboard.remove(botId, guild.id, msg.id);
      } else {
        await starMsg.edit({ content: `⭐ **${stars}**`, embeds: [embed] }).catch(() => {});
        store.starboard.set(botId, guild.id, msg.id, existing.star_message_id, stars);
      }
    }
  } catch (e) {
    console.error('[Hoxera] starboard:', e.message);
  }
}

// ------------------------------------------------------------
// 📨 Traqueur d'invitations
// ------------------------------------------------------------
// Détection pure : compare l'état AVANT/APRÈS des invitations.
// before/after : [{code, uses, inviter_id}] → renvoie l'invitation utilisée ou null.
function detectInviteUsed(before, after) {
  const prev = new Map((before || []).map(i => [i.code, i]));
  for (const inv of (after || [])) {
    const old = prev.get(inv.code);
    if (old && (inv.uses || 0) > (old.uses || 0)) return inv;
    if (!old && (inv.uses || 0) > 0) return inv; // invitation créée et utilisée entre 2 relevés
  }
  return null;
}

async function cacheInvites(botId, guild) {
  try {
    const invites = await guild.invites.fetch();
    const rows = [...invites.values()].map(i => ({
      code: i.code, uses: i.uses || 0,
      inviter_id: i.inviter ? i.inviter.id : '',
    }));
    store.inviteUses.replaceAll(botId, guild.id, rows);
  } catch { /* permission Gérer le serveur manquante : silencieux */ }
}

async function onMemberJoinInvites(botId, member) {
  try {
    const guild = member.guild;
    const before = store.inviteUses.all(botId, guild.id);
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return;
    const after = [...invites.values()].map(i => ({
      code: i.code, uses: i.uses || 0,
      inviter_id: i.inviter ? i.inviter.id : '',
    }));
    const used = detectInviteUsed(before, after);
    store.inviteUses.replaceAll(botId, guild.id, after);
    if (used && used.inviter_id) {
      store.inviteJoins.add(botId, guild.id, member.id, used.inviter_id, used.code);
    }
  } catch { /* silencieux */ }
}

// ------------------------------------------------------------
// 🖼️ Carte de bienvenue (image générée avec sharp, zéro dépendance en plus)
// ------------------------------------------------------------
function welcomeCardSvg(username, serverName, memberCount) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const name = esc(String(username || 'Membre').slice(0, 24));
  const server = esc(String(serverName || '').slice(0, 32));
  return `<svg width="880" height="280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b1e2e"/>
      <stop offset="55%" stop-color="#232746"/>
      <stop offset="100%" stop-color="#2b1e46"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e07a5f"/>
      <stop offset="100%" stop-color="#EB459E"/>
    </linearGradient>
  </defs>
  <rect width="880" height="280" rx="24" fill="url(#bg)"/>
  <rect x="0" y="268" width="880" height="12" rx="6" fill="url(#accent)"/>
  <circle cx="140" cy="140" r="86" fill="none" stroke="url(#accent)" stroke-width="6"/>
  <text x="260" y="118" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#b8bccf">Bienvenue sur ${server}</text>
  <text x="260" y="170" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="bold" fill="#ffffff">${name}</text>
  <text x="260" y="216" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#8f93a8">Tu es le membre n°${parseInt(memberCount, 10) || 1} 🎉</text>
</svg>`;
}

async function welcomeCard(member) {
  const sharp = require('sharp');
  const svg = welcomeCardSvg(
    member.user ? (member.user.globalName || member.user.username) : 'Membre',
    member.guild ? member.guild.name : '',
    member.guild ? member.guild.memberCount : 1
  );
  const base = sharp(Buffer.from(svg)).png();

  // Avatar rond, incrusté dans le cercle
  try {
    const url = member.user && member.user.displayAvatarURL
      ? member.user.displayAvatarURL({ extension: 'png', size: 256 })
      : null;
    if (url) {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const size = 160;
      const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
      const avatar = await require('sharp')(buf).resize(size, size).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
      return await base.composite([{ input: avatar, left: 60, top: 60 }]).toBuffer();
    }
  } catch { /* avatar indisponible → carte sans avatar */ }
  return await base.toBuffer();
}

// ------------------------------------------------------------
// 🖼️ Carte de montée de niveau (image générée avec sharp — même
// recette que la carte de bienvenue). v210.
// ------------------------------------------------------------
function levelUpCardSvg({ name, server, level, pct } = {}) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const uname = esc(String(name || 'Membre').slice(0, 24));
  const srv = esc(String(server || '').toUpperCase().slice(0, 28));
  const lvl = parseInt(level, 10) || 1;
  const p = Math.max(0, Math.min(100, Math.round((Number(pct) || 0) * 100)));
  const barW = Math.round(520 * p / 100);
  return `<svg width="880" height="280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b1e2e"/>
      <stop offset="55%" stop-color="#232746"/>
      <stop offset="100%" stop-color="#2b1e46"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e07a5f"/>
      <stop offset="100%" stop-color="#EB459E"/>
    </linearGradient>
  </defs>
  <rect width="880" height="280" rx="24" fill="url(#bg)"/>
  <rect x="0" y="268" width="880" height="12" rx="6" fill="url(#accent)"/>
  <circle cx="140" cy="140" r="86" fill="none" stroke="url(#accent)" stroke-width="6"/>
  <text x="260" y="96" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="#8f93a8">${srv}</text>
  <text x="260" y="148" font-family="Arial, Helvetica, sans-serif" font-size="50" font-weight="bold" fill="#ffffff">Niveau ${lvl}</text>
  <text x="260" y="196" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#b8bccf">${uname} monte de niveau !</text>
  <rect x="260" y="224" width="520" height="14" rx="7" fill="#1a1c28"/>
  <rect x="260" y="224" width="${Math.max(barW, 14)}" height="14" rx="7" fill="url(#accent)"/>
  <text x="790" y="212" font-family="Arial, Helvetica, sans-serif" font-size="17" text-anchor="end" fill="#b8bccf">${p}%</text>
</svg>`;
}

async function levelUpCard({ avatarUrl = '', name, server, level, pct } = {}) {
  const sharp = require('sharp');
  const svg = levelUpCardSvg({ name, server, level, pct });
  const base = sharp(Buffer.from(svg)).png();
  try {
    if (avatarUrl) {
      const res = await fetch(String(avatarUrl));
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const size = 160;
        const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
        const avatar = await require('sharp')(buf).resize(size, size).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
        return await base.composite([{ input: avatar, left: 60, top: 60 }]).toBuffer();
      }
    }
  } catch { /* avatar indisponible → carte sans avatar */ }
  return await base.toBuffer();
}

module.exports = {
  sanctionForWarns, autoModSanctionForWarning,
  starboardDecision, onReaction,
  detectInviteUsed, cacheInvites, onMemberJoinInvites,
  welcomeCardSvg, welcomeCard, levelUpCardSvg, levelUpCard,
};
