// ============================================================
// BotDev - Événements (bienvenue, départ, auto-rôle)
// ============================================================
const { EmbedBuilder } = require('discord.js');
const store = require('../db');
const { resolveVariables } = require('./engine');
const identity = require('./identity');
const logging = require('./logging');

const EVENT_DEFS = {
  member_join: {
    label: 'Message de bienvenue',
    emoji: '👋',
    description: 'Envoie un message quand un membre rejoint le serveur.',
    config: [
      { key: 'channel', label: 'Salon (mention, ex: #bienvenue)', type: 'text', placeholder: '#bienvenue' },
      { key: 'message', label: 'Message ({user}, {server}, {count}…)', type: 'multiline', default: 'Bienvenue {user} sur {server} ! Tu es le membre n°{count} 🎉' },
      { key: 'embed', label: 'Envoyer en embed', type: 'checkbox', default: false },
      { key: 'color', label: 'Couleur de l\'embed', type: 'text', default: '#57F287' },
      { key: 'image', label: 'Image de l\'embed (URL, optionnel)', type: 'text', placeholder: 'https://…' },
    ],
  },
  member_leave: {
    label: 'Message de départ',
    emoji: '👋',
    description: 'Envoie un message quand un membre quitte le serveur.',
    config: [
      { key: 'channel', label: 'Salon (mention)', type: 'text', placeholder: '#au-revoir' },
      { key: 'message', label: 'Message', type: 'multiline', default: '{user} a quitté {server} 😢' },
      { key: 'embed', label: 'Envoyer en embed', type: 'checkbox', default: false },
      { key: 'color', label: 'Couleur de l\'embed', type: 'text', default: '#ED4245' },
      { key: 'image', label: 'Image de l\'embed (URL, optionnel)', type: 'text', placeholder: 'https://…' },
    ],
  },
  autorole: {
    label: 'Auto-rôle',
    emoji: '🏷️',
    description: 'Donne automatiquement un rôle aux nouveaux membres.',
    config: [
      { key: 'role', label: 'Nom du rôle', type: 'text', placeholder: 'Membre' },
    ],
  },
};

function eventsState(botId, guildId) {
  const rows = store.events.all(botId, guildId);
  const out = {};
  for (const key of Object.keys(EVENT_DEFS)) {
    out[key] = rows[key] || { enabled: false, config: {} };
  }
  return out;
}

async function runJoinEvent(botId, member) {
  const state = store.events.all(botId, member.guild.id);
  const botRecord = store.bots.get(botId);

  if (state.member_join && state.member_join.enabled) {
    const cfg = state.member_join.config || {};
    const channel = await resolveChannel(member.guild, cfg.channel);
    if (channel) {
      const text = render(member, botRecord, cfg.message);
      if (cfg.embed) {
        const embed = new EmbedBuilder().setColor(cfg.color || '#57F287').setDescription(text);
        if (cfg.image) embed.setImage(String(cfg.image).trim());
        await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { embeds: [embed] }).catch(() => {});
      } else {
        await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { content: text }).catch(() => {});
      }
      await logging.log(botId, member.guild, {
        title: '👋 Nouveau membre',
        description: `${member.user.tag} a rejoint le serveur (membre n°${member.guild.memberCount || 0})`,
        color: '#57F287',
      });
    }
  }

  if (state.autorole && state.autorole.enabled) {
    const cfg = state.autorole.config || {};
    const role = member.guild.roles.cache.find(r => r.name.toLowerCase() === String(cfg.role || '').toLowerCase());
    if (role && member.guild.members.me && role.position < member.guild.members.me.roles.highest.position) {
      await member.roles.add(role).catch(() => {});
    }
  }
}

async function runLeaveEvent(botId, member) {
  const state = store.events.all(botId, member.guild.id);
  const botRecord = store.bots.get(botId);
  if (!(state.member_leave && state.member_leave.enabled)) return;
  const cfg = state.member_leave.config || {};
  const channel = await resolveChannel(member.guild, cfg.channel);
  if (!channel) return;
  const text = render(member, botRecord, cfg.message);
  if (cfg.embed) {
    const embed = new EmbedBuilder().setColor(cfg.color || '#ED4245').setDescription(text);
    if (cfg.image) embed.setImage(String(cfg.image).trim());
    await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { embeds: [embed] }).catch(() => {});
  } else {
    await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { content: text }).catch(() => {});
  }
  await logging.log(botId, member.guild, {
    title: '👋 Membre parti',
    description: `${member.user.tag} a quitté le serveur`,
    color: '#ED4245',
  });
}

function render(member, botRecord, template) {
  const guild = member.guild;
  const ctx = {
    vars: {
      userMention: `<@${member.id}>`,
      userTag: member.user.tag,
      userName: member.user.username,
      userId: member.id,
      serverName: guild.name,
      serverId: guild.id,
      channelMention: '',
      channelId: '',
      prefix: botRecord.prefix,
      args: '',
      arg1: '', arg2: '', arg3: '', arg4: '', arg5: '',
      count: guild.memberCount || 0,
      coins: 0,
      randomUser: '',
      botMention: '',
    },
  };
  return resolveVariables(template || '', ctx);
}

async function resolveChannel(guild, query) {
  if (!query) return null;
  const q = String(query).trim();
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) {
    const ch = await guild.channels.fetch(idMatch[1]).catch(() => null);
    if (ch) return ch;
  }
  return guild.channels.cache.find(c => c.name.toLowerCase() === q.toLowerCase() && c.isTextBased()) || null;
}

module.exports = { EVENT_DEFS, eventsState, runJoinEvent, runLeaveEvent, resolveChannel };
