// ============================================================
// BotDev - Giveaways : réaction 🎉 → tirage au sort automatique
// /giveaway create durée prix gagnants | end | reroll
// ============================================================
// v233 — EmbedBuilder retiré : les giveaways sont en Components V2 (ui.v2panel).
const store = require('../db');
const ui = require('./ui');
const i18n = require('../i18n');
const logging = require('./logging');
const { levelFromXp } = require('./xp');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

function parseDuration(str) {
  const s = String(str || '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|sec|m|min|h|d)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const mult = { s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * mult;
}

function formatEnds(endsAt) {
  return `<t:${Math.floor(endsAt / 1000)}:R>`;
}

// v233 — SÉPARATEURS NATIFS PLEINE LARGEUR (Components V2).
// Le trait texte ━ s'arrêtait avant le bord arrondi de l'embed ; le Separator
// V2 est un composant de layout que Discord dessine bord à bord, comme dans le
// panneau de tickets personnalisés qui sert de référence au bot.
// `ping` : en Components V2 le champ `content` du message est INTERDIT — la
// mention @everyone/rôle devient un TextDisplay en tête de conteneur. Les
// mentions y notifient bien (doc officielle) et allowedMentions reste appliqué.
// La réaction 🎉 continue de fonctionner : les réactions sont indépendantes
// des composants d'un message.
// v292 — conditions de participation (rôle requis et/ou niveau minimum)
function conditionsOf(settings = {}) {
  const role = String((settings && settings.giveaway_req_role) || '').trim();
  const level = Math.max(0, parseInt((settings && settings.giveaway_req_level) || 0, 10) || 0);
  return { role, level };
}

function conditionsText(settings, lang) {
  const { role, level } = conditionsOf(settings);
  const parts = [];
  if (role) parts.push(i18n.t(lang, 'gw_cond_role', { role: /^\d{15,21}$/.test(role) ? `<@&${role}>` : role }));
  if (level > 0) parts.push(i18n.t(lang, 'gw_cond_level', { level: String(level) }));
  return parts.join(' · ');
}

function buildPanel(g, settings = {}, ping = '', opts = {}) {
  const lang = opts.lang || 'fr';
  const customMsg = String((settings && settings.message) || '').trim();
  const color = /^#[0-9a-fA-F]{6}$/.test(String((settings && settings.color) || '')) ? settings.color : '#FEE75C';
  const fields = [
    { name: '🏆 Nombre de gagnants', value: String(g.winners || 1), inline: true },
    { name: '⏰ Fin du tirage', value: formatEnds(g.ends_at), inline: true },
  ];
  // v292 — les conditions s'affichent sur le panneau quand elles existent
  const conds = conditionsText(settings, lang);
  if (conds) fields.push({ name: '📋 Conditions de participation', value: conds });
  // v292 — bouton « 👥 Participants » (réponse éphémère au clic)
  const rows = opts.botId ? [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hxgw:${opts.botId}:participants`)
      .setLabel(i18n.t(lang, 'gw_participants_btn'))
      .setStyle(ButtonStyle.Secondary),
  )] : [];
  return ui.v2panel({
    ...(ping ? { content: ping } : {}),
    color,
    title: '🎁 Giveaway',
    description: [
      `**${g.prize}**`,
      '',
      customMsg || 'Réagissez avec 🎉 pour participer !',
    ].join('\n'),
    fields,
    footer: 'Hoxera · Giveaway',
  }, rows);
}

// Rôle à mentionner au lancement : '@everyone' ou nom de rôle → mention Discord
function pingMention(guild, ref) {
  const str = String(ref || '').trim();
  if (!str) return '';
  if (str === '@everyone') return '@everyone';
  const role = guild.roles.cache.find((r) => r.id === str || r.name === str.replace(/^@/, ''));
  return role ? `<@&${role.id}>` : '';
}

// Démarre un giveaway : envoie l'embed + réaction, enregistre en base
async function startGiveaway(botId, interaction, durationMs, prize, winners) {
  const channel = interaction.channel;
  if (!channel || typeof channel.send !== 'function') {
    return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
  }
  const settings = store.guildSettings.get(botId, interaction.guild.id) || {};
  const color = settings.giveaway_color || '';
  const message = settings.giveaway_message || '';
  const ping = pingMention(interaction.guild, settings.giveaway_ping_role || '');
  const endsAt = Date.now() + Math.min(Math.max(durationMs, 15000), 30 * 86400000);
  const msg = await channel.send({
    ...buildPanel({ prize, winners, ends_at: endsAt }, { color, message, giveaway_req_role: settings.giveaway_req_role || '', giveaway_req_level: settings.giveaway_req_level || 0 }, ping, { botId, lang: i18n.langForGuild(interaction.guild.id) }),
    allowedMentions: { roles: ping ? [String(ping).replace(/<@&|>/g, '')] : [], everyone: ping === '@everyone' },
  });
  await msg.react('🎉').catch(() => {});
  store.giveaways.create({
    bot_id: botId, guild_id: interaction.guild.id,
    channel_id: channel.id, message_id: msg.id,
    prize, winners, ends_at: endsAt,
  });
  return interaction.reply({
    content: `🎁 Giveaway lancé dans ${channel} ! Tirage ${formatEnds(endsAt)} (${winners} gagnant(s)).`,
    ephemeral: true,
  });
}

// 🎁 Création depuis le dashboard (v198) : salon choisi, ping, message, couleur
async function startGiveawayDashboard(botId, guild, channel, opts) {
  const { prize, winners, durationMin, pingRole = '', message = '', color = '' } = opts || {};
  const gs = store.guildSettings.get(botId, guild.id) || {};
  const endsAt = Date.now() + Math.min(Math.max(parseInt(durationMin, 10) * 60000 || 3600000, 15000), 30 * 86400000);
  const ping = pingMention(guild, pingRole);
  const msg = await channel.send({
    ...buildPanel({ prize, winners, ends_at: endsAt }, { color, message, giveaway_req_role: gs.giveaway_req_role || '', giveaway_req_level: gs.giveaway_req_level || 0 }, ping, { botId, lang: i18n.langForGuild(guild.id) }),
    allowedMentions: { roles: ping ? [String(ping).replace(/<@&|>/g, '')] : [], everyone: ping === '@everyone' },
  });
  await msg.react('🎉').catch(() => {});
  const id = store.giveaways.create({
    bot_id: botId, guild_id: guild.id,
    channel_id: channel.id, message_id: msg.id,
    prize, winners, ends_at: endsAt,
  });
  return { id, ends_at: endsAt, channel: channel.id };
}

// v292 — un membre remplit-il les conditions (rôle / niveau) ?
async function checkConditions(botId, guild, userId, settings) {
  const { role, level } = conditionsOf(settings);
  if (!role && !level) return { ok: true };
  const member = await guild.members.fetch(String(userId)).catch(() => null);
  if (!member) return { ok: false, silent: true };
  if (role) {
    const r = guild.roles.cache.find((x) => x.id === role || x.name === String(role).replace(/^@/, ''));
    if (!r || !member.roles.cache.has(r.id)) return { ok: false, key: 'gw_denied_role', vars: { role: r ? r.name : String(role) } };
  }
  if (level > 0) {
    const row = store.xp.get(botId, guild.id, String(userId));
    const lvl = row ? Math.max(parseInt(row.level, 10) || 0, levelFromXp(parseInt(row.xp, 10) || 0)) : 0;
    if (lvl < level) return { ok: false, key: 'gw_denied_level', vars: { level: String(level) } };
  }
  return { ok: true };
}

// v292 — réaction 🎉 d'un membre non éligible : retirée + explication en MP
async function onReaction(botId, reaction, user) {
  try {
    if (!user || user.bot) return;
    if (String((reaction.emoji && reaction.emoji.name) || '') !== '🎉') return;
    const message = reaction.message;
    const guild = message && message.guild;
    if (!guild) return;
    const g = store.giveaways.byMessage(botId, guild.id, String(message.id));
    if (!g || g.drawn) return;
    const settings = store.guildSettings.get(botId, guild.id) || {};
    const { role, level } = conditionsOf(settings);
    if (!role && !level) return;
    const res = await checkConditions(botId, guild, user.id, settings);
    if (res.ok) return;
    try { await reaction.users.remove(String(user.id)); } catch (e) {}
    if (res.silent) return; // membre parti : rien à expliquer
    const lang = i18n.langForGuild(guild.id);
    const dmText = i18n.t(lang, 'gw_denied_dm', { prize: String(g.prize || ''), reason: i18n.t(lang, res.key, res.vars || {}) });
    try { const dm = await user.createDM(); await dm.send(dmText); } catch (e) { /* MP fermés */ }
    try {
      logging.log(botId, guild, { title: '🎁 Giveaway : participation refusée', description: `${user.id} — ${res.key === 'gw_denied_level' ? 'niveau insuffisant' : 'rôle manquant'}`, color: '#FEE75C' }).catch(() => {});
    } catch (e) {}
  } catch (e) { /* jamais bloquant */ }
}

// v292 — bouton « 👥 Participants » : liste + compteur en éphémère
async function handleParticipants(botId, interaction) {
  const guildId = String(interaction.guildId || (interaction.guild && interaction.guild.id) || '');
  const lang = i18n.langForGuild(guildId);
  const messageId = String((interaction.message && interaction.message.id) || '');
  const g = (guildId && messageId) ? store.giveaways.byMessage(botId, guildId, messageId) : null;
  if (!g) {
    await interaction.reply({ content: i18n.t(lang, 'gw_participants_gone'), ephemeral: true }).catch(() => {});
    return true;
  }
  let users = [];
  try {
    const msg = (interaction.channel && interaction.channel.messages)
      ? await interaction.channel.messages.fetch(g.message_id).catch(() => null)
      : null;
    const source = msg || interaction.message;
    const reaction = source && source.reactions && source.reactions.resolve ? source.reactions.resolve('🎉') : null;
    if (reaction) {
      const fetched = await reaction.users.fetch({ limit: 100 }).catch(() => reaction.users.cache);
      users = [...fetched.values()].filter((u) => !u.bot);
    }
  } catch (e) { /* liste vide */ }
  const title = i18n.t(lang, 'gw_participants_title', { prize: String(g.prize || '') });
  const body = users.length
    ? `${i18n.t(lang, 'gw_participants_count', { count: String(users.length) })}\n${users.slice(0, 30).map((u) => u.username || u.tag || u.id).join(', ')}${users.length > 30 ? '…' : ''}`
    : i18n.t(lang, 'gw_participants_none');
  await interaction.reply({ content: `**${title}**\n${body}`, ephemeral: true }).catch(() => {});
  return true;
}

// Tire les gagnants parmi les réactions 🎉
async function drawWinners(client, g) {
  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel) return { winners: [], message: null };
  const message = await channel.messages.fetch(g.message_id).catch(() => null);
  if (!message) return { winners: [], message: null };
  const reaction = message.reactions.cache.get('🎉');
  const users = reaction ? [...reaction.users.cache.values()].filter((u) => !u.bot) : [];
  const shuffled = users.sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(g.winners, shuffled.length));
  return { winners, message, channel };
}

// 🏁 Panneau final du giveaway (tirage effectué ou relancé) — message permanent
// affiché dans le salon : mêmes grandes sections que le panneau de lancement
// (prix / résultat / remerciement), séparées par des séparateurs NATIFS pleine
// largeur (v233). Le message d'origine étant en Components V2, Discord interdit
// d'en sortir à l'édition : ce panneau est donc V2 lui aussi.
function buildEndedPanel(g, winners = [], reroll = false) {
  const mentions = winners.map((u) => u.toString()).join(' ');
  return ui.v2panel({
    color: reroll ? '#FEE75C' : '#57F287',
    title: reroll ? '🎁 Giveaway — nouveau tirage' : '🎁 Giveaway terminé',
    description: [
      `**${g.prize}**`,
      '',
      winners.length
        ? `🏆 Gagnant(s) : ${mentions}`
        : '😢 Aucun participant — pas de gagnant.',
      '',
      'Merci à tous d\'avoir participé ! 🎉',
    ].join('\n'),
    fields: [
      { name: '🏆 Gagnants', value: String(winners.length), inline: true },
      { name: '⏰ Statut', value: reroll ? 'Nouveau tirage' : 'Terminé', inline: true },
    ],
    footer: 'Hoxera · Giveaway',
  });
}

async function announceWinners(client, g, winners, reroll = false) {
  const { channel, message } = await drawWinnersRaw(client, g);
  if (message) {
    // v233 — le message d'origine est en Components V2 : l'édition reste en V2.
    await message.edit(buildEndedPanel(g, winners, reroll)).catch(() => {});
  }
  if (channel) {
    const winnerMentions = winners.map((u) => u.toString()).join(' ');
    // v233 — séparateurs natifs pleine largeur. Les mentions des gagnants
    // deviennent un TextDisplay en tête (le champ content est interdit en V2) :
    // elles notifient toujours, et allowedMentions reste appliqué.
    await channel.send({
      ...ui.v2panel({
        content: winnerMentions || undefined,
        variant: winners.length ? 'success' : 'warning',
        title: winners.length ? '🎉 Giveaway terminé !' : '🎁 Giveaway sans gagnant',
        description: winners.length
          ? `Félicitations ${winnerMentions} ! Vous remportez **${g.prize}** !`
          : `Le giveaway « ${g.prize} » n'a eu aucun participant.`,
        fields: [{ name: '🏆 Résultat', value: winners.length ? `${winners.length} gagnant(s)` : 'Aucun participant', inline: true }],
        footer: 'Hoxera · Giveaways',
      }),
      allowedMentions: { users: winners.map((u) => String(u.id)) },
    }).catch(() => {});
  }
}

async function drawWinnersRaw(client, g) {
  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel) return { winners: [], message: null };
  const message = await channel.messages.fetch(g.message_id).catch(() => null);
  if (!message) return { winners: [], message: null };
  const reaction = message.reactions.cache.get('🎉');
  let users = reaction ? [...reaction.users.cache.values()].filter((u) => !u.bot) : [];
  // v292 — conditions de participation : seuls les membres éligibles peuvent gagner
  const guild = client.guilds.cache.get(g.guild_id) || channel.guild || null;
  const settings = guild ? (store.guildSettings.get(g.bot_id, guild.id) || {}) : {};
  const { role, level } = conditionsOf(settings);
  if (guild && (role || level)) {
    const eligible = [];
    for (const u of users) {
      const res = await checkConditions(g.bot_id, guild, u.id, settings);
      if (res.ok) eligible.push(u);
    }
    users = eligible;
  }
  const shuffled = users.sort(() => Math.random() - 0.5);
  return { winners: shuffled.slice(0, Math.min(g.winners, shuffled.length)), message, channel };
}

// Termine un giveaway (déclenche le tirage). fromSweep = sans interaction.
async function endGiveaway(botId, client, g, fromSweep = false) {
  if (g.drawn) return { ok: false, reason: 'déjà tiré' };
  store.giveaways.markDrawn(g.id);
  const { winners, channel } = await drawWinnersRaw(client, g);
  await announceWinners(client, g, winners, false);
  return { ok: true, winners: winners.map((u) => u.username) };
}

// Vérifie les giveaways arrivés à échéance (appelé toutes les 30 s)
async function sweep(botId, entry) {
  const due = store.giveaways.due().filter((g) => g.bot_id === botId);
  for (const g of due) {
    try {
      await endGiveaway(botId, entry.client, g, true);
    } catch (e) {
      console.error('[BotDev] giveaway sweep:', e.message);
      store.giveaways.markDrawn(g.id);
    }
  }
  // ⏰ v292 — rappel 5 minutes avant la fin (option par serveur, un seul rappel)
  try {
    for (const g of store.giveaways.dueForReminder(botId, Date.now())) {
      store.giveaways.markReminded(g.id); // marqué D'ABORD : jamais deux rappels
      const gs = store.guildSettings.get(g.bot_id, g.guild_id) || {};
      if (!parseInt(gs.giveaway_reminder, 10)) continue;
      const channel = await entry.client.channels.fetch(g.channel_id).catch(() => null);
      if (!channel || typeof channel.send !== 'function') continue;
      const lang = i18n.langForGuild(g.guild_id);
      await channel.send(i18n.t(lang, 'gw_reminder', { prize: String(g.prize || ''), time: formatEnds(g.ends_at) })).catch(() => {});
    }
  } catch (e) { console.error('[BotDev] giveaway reminder:', e.message); }
}

module.exports = { parseDuration, buildPanel, buildEndedPanel, pingMention, startGiveaway, startGiveawayDashboard, endGiveaway, sweep, conditionsOf, conditionsText, checkConditions, onReaction, handleParticipants };
