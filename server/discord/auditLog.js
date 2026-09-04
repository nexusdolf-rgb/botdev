// ============================================================
// Hoxera — Journal d'audit AVANCÉ (v88)
// Écoute les événements Discord non couverts jusqu'ici et les
// journalise par catégorie configurable (log_events) :
//   messages (supprimés/modifiés/en masse) · roles · channels
//   (salons/threads) · server (réglages/webhooks) · voice
// Chaque fonction est exportée pour être testable, et branchée
// dans botManager.js.
// ============================================================
const store = require('../db');
const logging = require('./logging');

const TYPE_MESSAGES = 'messages';
const TYPE_ROLES = 'roles';
const TYPE_CHANNELS = 'channels';
const TYPE_SERVER = 'server';
const TYPE_VOICE = 'voice';

function snippet(s, len = 500) {
  const t = String(s || '').trim();
  return t ? t.slice(0, len) : '—';
}

function userTag(m) {
  try { return m.author && m.author.tag ? m.author.tag : '?'; } catch { return '?'; }
}

function chanRef(c) {
  try { return c ? `<#${c.id}>` : '—'; } catch { return '—'; }
}

function memberTag(m) {
  try { return m.user && m.user.tag ? m.user.tag : '?'; } catch { return '?'; }
}

function roleDiff(oldM, newM) {
  try {
    const oldRoles = new Set([...oldM.roles.cache.keys()]);
    const newRoles = new Set([...newM.roles.cache.keys()]);
    const added = [...newRoles].filter((id) => !oldRoles.has(id));
    const removed = [...oldRoles].filter((id) => !newRoles.has(id));
    const name = (m, id) => {
      const r = m.roles.cache.get(id);
      return r ? r.name : id;
    };
    return {
      added: added.map((id) => name(newM, id)),
      removed: removed.map((id) => name(oldM, id)),
    };
  } catch { return { added: [], removed: [] }; }
}

// ---------------------- Messages ----------------------

function onMessageDelete(botId, message) {
  try {
    if (!message || !message.guild) return;
    if (message.author && message.author.bot) return; // les messages des bots font déjà leur propre journal
    // Déjà journalisé par l'auto-mod → pas de doublon
    try {
      const automod = require('./automod');
      if (automod.wasAutomodded && automod.wasAutomodded(message.id)) return;
    } catch {}
    let atts = 0;
    try {
      if (message.attachments && message.attachments.size) atts = message.attachments.size;
      else if (Array.isArray(message.attachments)) atts = message.attachments.length;
    } catch {}
    logging.log(botId, message.guild, {
      title: '🗑 Message supprimé', color: '#ED4245', type: TYPE_MESSAGES,
      fields: [
        { name: '👤 Auteur', value: userTag(message), inline: true },
        { name: '📨 Salon', value: chanRef(message.channel), inline: true },
        { name: '💬 Contenu', value: snippet(message.content) + (atts ? `\n📎 ${atts} pièce(s) jointe(s)` : '') },
      ],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit messageDelete:', e.message); }
}

function onMessageDeleteBulk(botId, messages) {
  try {
    if (!messages || !messages.size) return;
    const first = messages.first();
    if (!first || !first.guild) return;
    logging.log(botId, first.guild, {
      title: '🗑 Messages supprimés en masse', color: '#ED4245', type: TYPE_MESSAGES,
      description: `${messages.size} messages supprimés d'un coup.`,
      fields: [{ name: '📨 Salon', value: chanRef(first.channel), inline: true }],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit messageDeleteBulk:', e.message); }
}

function onMessageUpdate(botId, oldMsg, newMsg) {
  try {
    if (!oldMsg || !newMsg || !oldMsg.guild) return;
    if (oldMsg.author && oldMsg.author.bot) return;
    if (!oldMsg.content || oldMsg.content === newMsg.content) return; // embeds/liens ajoutés, pas de texte
    logging.log(botId, oldMsg.guild, {
      title: '✏️ Message modifié', color: '#FEE75C', type: TYPE_MESSAGES,
      fields: [
        { name: '👤 Auteur', value: userTag(oldMsg), inline: true },
        { name: '📨 Salon', value: chanRef(oldMsg.channel), inline: true },
        { name: '🔙 Avant', value: snippet(oldMsg.content) },
        { name: '🔜 Après', value: snippet(newMsg.content) },
      ],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit messageUpdate:', e.message); }
}

// ---------------------- Membres (rôles / pseudo) ----------------------

function onGuildMemberUpdate(botId, oldMember, newMember) {
  try {
    if (!oldMember || !newMember || !newMember.guild) return;
    const { added, removed } = roleDiff(oldMember, newMember);
    const nickChanged = String(oldMember.nickname || '') !== String(newMember.nickname || '');
    if (!added.length && !removed.length && !nickChanged) return;
    const fields = [
      { name: '👤 Membre', value: memberTag(newMember), inline: true },
    ];
    if (added.length) fields.push({ name: '➕ Rôles ajoutés', value: added.map((r) => `\`${r}\``).join(' ') || '—', inline: false });
    if (removed.length) fields.push({ name: '➖ Rôles retirés', value: removed.map((r) => `\`${r}\``).join(' ') || '—', inline: false });
    if (nickChanged) {
      fields.push({ name: '✏️ Pseudo', value: `\`${snippet(oldMember.nickname, 40) || '—'}\` → \`${snippet(newMember.nickname, 40) || '—'}\`` });
    }
    logging.log(botId, newMember.guild, {
      title: '🏷️ Membre modifié (rôles / pseudo)', color: '#e07a5f', type: TYPE_ROLES, fields,
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit guildMemberUpdate:', e.message); }
}

// ---------------------- Salons ----------------------

function channelTypeLabel(c) {
  try {
    const { ChannelType } = require('discord.js');
    return { [ChannelType.GuildText]: 'salon texte', [ChannelType.GuildVoice]: 'salon vocal', [ChannelType.GuildCategory]: 'catégorie', [ChannelType.GuildAnnouncement]: 'annonces', [ChannelType.GuildStageVoice]: 'scène', [ChannelType.GuildForum]: 'forum' }[c.type] || 'salon';
  } catch { return 'salon'; }
}

function onChannelCreate(botId, channel) {
  try {
    if (!channel || !channel.guild) return;
    logging.log(botId, channel.guild, {
      title: '📂 Salon créé', color: '#57F287', type: TYPE_CHANNELS,
      fields: [
        { name: '📨 Salon', value: `${channel.name} (${channelTypeLabel(channel)})`, inline: true },
        { name: '👤 Par', value: 'voir journal d\'audit Discord', inline: true },
      ],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit channelCreate:', e.message); }
}

function onChannelDelete(botId, channel) {
  try {
    if (!channel || !channel.guild) return;
    logging.log(botId, channel.guild, {
      title: '🗑 Salon supprimé', color: '#ED4245', type: TYPE_CHANNELS,
      fields: [{ name: '📨 Salon', value: `${channel.name} (${channelTypeLabel(channel)})` }],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit channelDelete:', e.message); }
}

function onChannelUpdate(botId, oldC, newC) {
  try {
    if (!oldC || !newC || !newC.guild) return;
    const changes = [];
    if (String(oldC.name || '') !== String(newC.name || '')) changes.push(`nom : \`${oldC.name}\` → \`${newC.name}\``);
    if (String(oldC.topic || '') !== String(newC.topic || '')) changes.push('sujet modifié');
    if (changes.length) {
      logging.log(botId, newC.guild, {
        title: '✏️ Salon modifié', color: '#FEE75C', type: TYPE_CHANNELS,
        fields: [
          { name: '📨 Salon', value: chanRef(newC), inline: true },
          { name: '🔧 Changements', value: changes.join('\n') },
        ],
      }).catch(() => {});
    }
  } catch (e) { console.error('[Hoxera] audit channelUpdate:', e.message); }
}

// ---------------------- Threads ----------------------

function onThreadCreate(botId, thread) {
  try {
    if (!thread || !thread.guild) return;
    logging.log(botId, thread.guild, {
      title: '🧵 Fil créé', color: '#57F287', type: TYPE_CHANNELS,
      fields: [
        { name: '🧵 Fil', value: `\`${thread.name}\``, inline: true },
        { name: '📨 Parent', value: chanRef(thread.parent), inline: true },
      ],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit threadCreate:', e.message); }
}

function onThreadDelete(botId, thread) {
  try {
    if (!thread || !thread.guild) return;
    logging.log(botId, thread.guild, {
      title: '🗑 Fil supprimé', color: '#ED4245', type: TYPE_CHANNELS,
      fields: [{ name: '🧵 Fil', value: `\`${thread.name}\`` }],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit threadDelete:', e.message); }
}

// ---------------------- Rôles ----------------------

function onRoleCreate(botId, role) {
  try {
    if (!role || !role.guild) return;
    logging.log(botId, role.guild, {
      title: '🏷️ Rôle créé', color: '#57F287', type: TYPE_ROLES,
      fields: [{ name: '🏷️ Rôle', value: `\`${role.name}\``, inline: true }, { name: '🎨 Couleur', value: role.hexColor || '—', inline: true }],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit roleCreate:', e.message); }
}

function onRoleDelete(botId, role) {
  try {
    if (!role || !role.guild) return;
    logging.log(botId, role.guild, {
      title: '🗑 Rôle supprimé', color: '#ED4245', type: TYPE_ROLES,
      fields: [{ name: '🏷️ Rôle', value: `\`${role.name}\`` }],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit roleDelete:', e.message); }
}

function onRoleUpdate(botId, oldR, newR) {
  try {
    if (!oldR || !newR || !newR.guild) return;
    const changes = [];
    if (String(oldR.name || '') !== String(newR.name || '')) changes.push(`nom : \`${oldR.name}\` → \`${newR.name}\``);
    if (String(oldR.hexColor || '') !== String(newR.hexColor || '')) changes.push(`couleur : ${oldR.hexColor || '—'} → ${newR.hexColor || '—'}`);
    if (String(oldR.permissions ? oldR.permissions.bitfield : '') !== String(newR.permissions ? newR.permissions.bitfield : '')) changes.push('permissions modifiées');
    if (changes.length) {
      logging.log(botId, newR.guild, {
        title: '✏️ Rôle modifié', color: '#FEE75C', type: TYPE_ROLES,
        fields: [{ name: '🏷️ Rôle', value: `\`${newR.name}\``, inline: true }, { name: '🔧 Changements', value: changes.join('\n') }],
      }).catch(() => {});
    }
  } catch (e) { console.error('[Hoxera] audit roleUpdate:', e.message); }
}

// ---------------------- Serveur ----------------------

function onGuildUpdate(botId, oldG, newG) {
  try {
    if (!oldG || !newG) return;
    const changes = [];
    if (String(oldG.name || '') !== String(newG.name || '')) changes.push(`nom : \`${oldG.name}\` → \`${newG.name}\``);
    if (String(oldG.icon || '') !== String(newG.icon || '')) changes.push('icône modifiée');
    if (changes.length) {
      logging.log(botId, newG, {
        title: '⚙️ Serveur modifié', color: '#FEE75C', type: TYPE_SERVER,
        fields: [{ name: '🔧 Changements', value: changes.join('\n') }],
      }).catch(() => {});
    }
  } catch (e) { console.error('[Hoxera] audit guildUpdate:', e.message); }
}

function onWebhooksUpdate(botId, channel) {
  try {
    if (!channel || !channel.guild) return;
    logging.log(botId, channel.guild, {
      title: '🪝 Webhooks modifiés', color: '#FEE75C', type: TYPE_SERVER,
      description: 'Un webhook a été créé, modifié ou supprimé dans ce salon.',
      fields: [{ name: '📨 Salon', value: chanRef(channel) }],
    }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit webhooksUpdate:', e.message); }
}

// ---------------------- Vocal ----------------------

function onVoiceState(botId, oldState, newState) {
  try {
    const guild = (newState && newState.guild) || (oldState && oldState.guild);
    if (!guild) return;
    const member = (newState && newState.member) || (oldState && oldState.member);
    if (!member) return;
    const oldCh = oldState && oldState.channel;
    const newCh = newState && newState.channel;
    if (oldCh && newCh && oldCh.id === newCh.id) return; // mute/cam → trop de bruit
    let title = '🔊 Connexion vocale';
    let color = '#57F287';
    let desc = `${memberTag(member)} a rejoint le salon vocal ${newCh ? `\`${newCh.name}\`` : ''}.`;
    if (oldCh && !newCh) { title = '🔇 Déconnexion vocale'; color = '#ED4245'; desc = `${memberTag(member)} a quitté le salon vocal \`${oldCh.name}\`.`; }
    if (oldCh && newCh) { title = '🔀 Déplacement vocal'; color = '#e07a5f'; desc = `${memberTag(member)} : \`${oldCh.name}\` → \`${newCh.name}\`.`; }
    logging.log(botId, guild, { title, color, type: TYPE_VOICE, description: desc }).catch(() => {});
  } catch (e) { console.error('[Hoxera] audit voice:', e.message); }
}

module.exports = {
  onMessageDelete, onMessageDeleteBulk, onMessageUpdate,
  onGuildMemberUpdate,
  onChannelCreate, onChannelDelete, onChannelUpdate,
  onThreadCreate, onThreadDelete,
  onRoleCreate, onRoleDelete, onRoleUpdate,
  onGuildUpdate, onWebhooksUpdate,
  onVoiceState,
};
