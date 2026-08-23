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
      { key: 'channel', label: 'Salon d\'accueil', type: 'channel', placeholder: '#bienvenue' },
      { key: 'message', label: 'Message ({user}, {server}, {count}…)', type: 'multiline', default: 'Bienvenue {user} sur {server} ! Tu es le membre n°{count} 🎉' },
      { key: 'card', label: '🖼️ Carte de bienvenue en image (avatar + pseudo)', type: 'checkbox', default: false },
      { key: 'embed', label: 'Envoyer en embed', type: 'checkbox', default: false },
      { key: 'color', label: 'Couleur de l\'embed', type: 'color', default: '#57F287' },
      { key: 'image', label: 'Image de l\'embed (URL, optionnel)', type: 'text', placeholder: 'https://…' },
    ],
  },
  member_leave: {
    label: 'Message de départ',
    emoji: '👋',
    description: 'Envoie un message quand un membre quitte le serveur.',
    config: [
      { key: 'channel', label: 'Salon des départs', type: 'channel', placeholder: '#au-revoir' },
      { key: 'message', label: 'Message', type: 'multiline', default: '{user} a quitté {server} 😢' },
      { key: 'embed', label: 'Envoyer en embed', type: 'checkbox', default: false },
      { key: 'color', label: 'Couleur de l\'embed', type: 'color', default: '#ED4245' },
      { key: 'image', label: 'Image de l\'embed (URL, optionnel)', type: 'text', placeholder: 'https://…' },
    ],
  },
  autorole: {
    label: 'Auto-rôle',
    emoji: '🏷️',
    description: 'Donne automatiquement un ou PLUSIEURS rôles aux nouveaux membres.',
    config: [
      { key: 'roles', label: 'Rôles à donner automatiquement (plusieurs possibles)', type: 'rolesmulti', placeholder: 'Membre, Nouveau' },
      { key: 'role', label: 'Ancien réglage (un seul rôle — laisser vide si la liste ci-dessus est utilisée)', type: 'role', placeholder: 'Membre' },
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

  // 📈 Statistiques : nouveaux membres du jour
  try {
    store.joinStats.bump(botId, member.guild.id, new Date().toISOString().slice(0, 10));
  } catch (e) { console.error('[Hoxera] join stats:', e.message); }

  // 🛡️ Bouclier anti-raid : compteur d'arrivées + déclenchement éventuel
  try {
    const antiraid = require('./antiraid');
    await antiraid.onJoin(botId, member);
  } catch (e) { console.error('[Hoxera] anti-raid join:', e.message); }

  if (state.member_join && state.member_join.enabled) {
    const cfg = state.member_join.config || {};
    const channel = await resolveChannel(member.guild, cfg.channel);
    if (channel) {
      const text = render(member, botRecord, cfg.message);
      // 🖼️ Carte de bienvenue en image (avatar + pseudo) — jamais bloquante :
      // si la génération échoue, le message part sans image.
      let files = [];
      if (cfg.card) {
        try {
          const community = require('./community');
          const buf = await community.welcomeCard(member);
          if (buf && buf.length) files = [{ attachment: buf, name: 'bienvenue.png' }];
        } catch (e) { console.error('[Hoxera] carte de bienvenue :', e.message); }
      }
      if (cfg.embed) {
        const embed = new EmbedBuilder().setColor(cfg.color || '#57F287').setDescription(text);
        if (files.length) embed.setImage('attachment://bienvenue.png');
        else if (cfg.image) embed.setImage(String(cfg.image).trim());
        await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { embeds: [embed], files }).catch(() => {});
      } else {
        await identity.sendAsProfile(member.client || botRecord, botId, member.guild, channel, { content: text, files }).catch(() => {});
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
    // 🏷️ v2.1 : PLUSIEURS rôles possibles (liste « roles » séparée par des
    // virgules) + compatibilité avec l'ancien réglage « role » (un seul).
    const wanted = parseRoleList(cfg);
    for (const name of wanted) {
      const role = member.guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (role && member.guild.members.me && role.position < member.guild.members.me.roles.highest.position) {
        await member.roles.add(role).catch(() => {});
      }
    }
  }
}

// 🏷️ Liste des rôles voulus par l'auto-rôle (fonction PURE, testable) :
// combine la liste multiple (cfg.roles, séparés par des virgules) et
// l'ancien réglage simple (cfg.role), sans doublons ni entrées vides.
function parseRoleList(cfg) {
  const out = [];
  const push = (v) => {
    const name = String(v || '').trim();
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  String((cfg && cfg.roles) || '').split(',').forEach(push);
  push(cfg && cfg.role);
  return out;
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

module.exports = { EVENT_DEFS, eventsState, runJoinEvent, runLeaveEvent, resolveChannel, parseRoleList };
