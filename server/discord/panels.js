// ============================================================
// BotDev - Panneaux : tickets (avec TYPES de tickets en menu déroulant)
//                    + menus de rôles
// - Assistant interactif des types (/ticket types setup) :
//   renommer, emoji, catégorie, rôle staff, suppression — tout en menus
// - Boutons du ticket (staff uniquement) : Fermer · Réouvrir · En attente · Supprimer
// - Transcription envoyée en MP à la fermeture (avec diagnostic visible)
// ============================================================
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const store = require('../db');
const crypto = require('crypto');
const logging = require('./logging');

// 📊 Statistiques de tickets (affichées dans le dashboard)
function bumpTicketStats(guildId, totalDelta, openDelta) {
  try {
    const key = `ticket_stats_${guildId}`;
    const cur = JSON.parse(store.settings.get(key) || '{"total":0,"open":0}');
    cur.total = Math.max(0, (cur.total || 0) + totalDelta);
    cur.open = Math.max(0, (cur.open || 0) + openDelta);
    store.settings.set(key, JSON.stringify(cur));
  } catch {}
}

const WIZARD_TTL = 10 * 60000;

// ---------------------- Résolution salon / rôle ----------------------
async function findChannel(client, query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) {
    try { return await client.channels.fetch(idMatch[1]); } catch {}
    const cached = client.channels.cache.get(idMatch[1]);
    if (cached) return cached;
  }
  const name = q.replace(/^#/, '').toLowerCase();
  for (const guild of client.guilds.cache.values()) {
    const c = guild.channels.cache.find(ch => ch.name.toLowerCase() === name && ch.isTextBased());
    if (c) return c;
  }
  return null;
}

function findChannelInGuild(guild, query) {
  const q = String(query || '').trim();
  if (!q || !guild) return null;
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) {
    const c = guild.channels.cache.get(idMatch[1]);
    if (c) return c;
  }
  const name = q.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find(ch => ch.name.toLowerCase() === name && ch.isTextBased()) || null;
}

function resolveRole(guild, nameOrId) {
  const q = String(nameOrId || '').trim();
  if (!q) return null;
  const id = q.replace(/[<@&>]/g, '');
  if (/^\d{15,21}$/.test(id)) {
    const byId = guild.roles.cache.get(id);
    if (byId) return byId;
  }
  return guild.roles.cache.find(r => r.name.toLowerCase() === q.toLowerCase()) || null;
}

function cacheChannels(guild) {
  if (guild && guild.channels && guild.channels.cache) {
    if (typeof guild.channels.cache.values === 'function') return [...guild.channels.cache.values()];
    if (Array.isArray(guild.channels.cache)) return guild.channels.cache;
  }
  return [];
}

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16) || 'ticket';
}

// ============================================================
// Dispatch des interactions panneaux
// ============================================================
async function dispatchPanels(botId, interaction) {
  try {
    if (interaction.isChatInputCommand() && ['ticket', 'roles'].includes(interaction.commandName)) {
      const { handlePanelCommand } = require('./panelCommands');
      await handlePanelCommand(botId, interaction);
      return true;
    }
    if (interaction.isChatInputCommand() && ['botprofile', 'modlogs', 'blacklist'].includes(interaction.commandName)) {
      const { handleProfileCommand } = require('./profileCommands');
      await handleProfileCommand(botId, interaction);
      return true;
    }
    const cid = String(interaction.customId || '');

    // Assistant interactif /botprofile setup (boutons + modales + sélecteur de couleurs)
    if ((interaction.isButton() && cid.startsWith('bpw:'))
      || (interaction.isStringSelectMenu() && cid.startsWith('bpw-sel:'))
      || (interaction.isModalSubmit() && cid.startsWith('bpw-modal:'))) {
      const { handleProfileWizardInteraction } = require('./profileWizard');
      await handleProfileWizardInteraction(botId, interaction);
      return true;
    }

    // 📝 Raison demandée à l'ouverture d'un ticket + ❓ questionnaire du type + 🗑 raison de suppression (staff)
    if (interaction.isModalSubmit()) {
      if (cid.startsWith(`bd-tquest:${botId}`)) { await submitQuestionnaire(botId, interaction); return true; }
      if (cid.startsWith(`bd-treason:${botId}`)) { await submitReason(botId, interaction); return true; }
      if (cid.startsWith(`bd-tdel:${botId}`)) { await submitDeleteReason(botId, interaction); return true; }
    }

    // Assistant des types de tickets (/ticket types setup)
    if ((interaction.isStringSelectMenu() && cid.startsWith('bdw-ts:'))
      || (interaction.isRoleSelectMenu() && cid.startsWith('bdw-tr:'))
      || (interaction.isButton() && cid.startsWith('bdw-tb:'))
      || (interaction.isModalSubmit() && cid.startsWith('bdw-tm:'))) {
      await handleTypesWizardInteraction(botId, interaction);
      return true;
    }

    // Assistant /ticket setup (boutons + modales + menus de sélection)
    if ((interaction.isButton() && cid.startsWith('bdw:'))
      || (interaction.isModalSubmit() && cid.startsWith('bdw-modal:'))
      || ((interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) && cid.startsWith('bdw-sel:'))) {
      const { handleWizardInteraction } = require('./panelCommands');
      await handleWizardInteraction(botId, interaction);
      return true;
    }

    // Sélection d'un TYPE de ticket (menu déroulant du panneau)
    if (interaction.isStringSelectMenu() && cid.startsWith(`bd-ttype:${botId}`)) {
      await handleTicketTypeSelect(botId, interaction);
      return true;
    }

    // 💡 Boutons de suggestions (votes + statut staff)
    if (interaction.isButton() && cid.startsWith(`bd-sugg:${botId}`)) {
      const { handleSuggestionButton } = require('./suggest');
      await handleSuggestionButton(botId, interaction);
      return true;
    }

    if (interaction.isButton()) {
      // 🔘 Menus de rôles en mode boutons : un clic = un rôle (activable/désactivable)
      if (cid.startsWith(`bd-rmbtn:${botId}:`)) {
        await handleRoleMenuButton(botId, interaction, parseInt(cid.split(':')[2], 10), cid.split(':').slice(3).join(':'));
        return true;
      }
      if (cid === `bd-ticket:${botId}`) { await handleTicketButton(botId, interaction); return true; }
      if (cid === `bd-tmenu:${botId}:close`) { await handleTicketClose(botId, interaction); return true; }
      if (cid === `bd-tmenu:${botId}:reopen`) { await handleTicketReopen(botId, interaction); return true; }
      if (cid === `bd-tmenu:${botId}:hold`) { await handleTicketHold(botId, interaction); return true; }
      if (cid === `bd-tmenu:${botId}:delete`) { await handleTicketDeleteAsk(botId, interaction); return true; }
      if (cid === `bd-tmenu:${botId}:delconfirm`) { await handleTicketDeleteConfirm(botId, interaction); return true; }
      if (cid === `bd-tmenu:${botId}:delcancel`) { await handleTicketDeleteCancel(interaction); return true; }
      return false;
    }

    if (interaction.isStringSelectMenu()) {
      if (cid.startsWith(`bd-menu:${botId}:`)) {
        await handleRoleMenu(botId, interaction, parseInt(cid.split(':')[2], 10));
        return true;
      }
      return false;
    }
  } catch (e) {
    console.error('[BotDev] panel error:', e.message);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Une erreur est survenue.', ephemeral: true });
      }
    } catch {}
    return true;
  }
  return false;
}

// ============================================================
// Tickets (avec types personnalisables)
// ============================================================
const LEGACY_DEFAULT_MESSAGE = '🎫 Besoin d\'aide ? Clique sur le bouton pour ouvrir un ticket !';

function parseTypes(cfg) {
  try {
    const t = Array.isArray(cfg.types) ? cfg.types : JSON.parse(cfg.types || '[]');
    return Array.isArray(t) ? t.filter((x) => x && x.label) : [];
  } catch { return []; }
}

// Types normalisés : chaque type a staff_roles (liste) en plus de l'ancien staff_role
// + une description professionnelle + un questionnaire personnalisé (questions
// auxquelles le membre doit répondre OBLIGATOIREMENT à l'ouverture du ticket).
function normalizeTypes(cfg) {
  return parseTypes(cfg).map((t) => {
    const roles = Array.isArray(t.staff_roles)
      ? t.staff_roles.map((r) => String(r).trim()).filter(Boolean)
      : (t.staff_role ? [String(t.staff_role).trim()] : []);
    return {
      label: String(t.label || ''),
      emoji: String(t.emoji || ''),
      category: String(t.category || ''),
      description: String(t.description || '').slice(0, 100),
      questions: Array.isArray(t.questions)
        ? t.questions.map((q) => String(q).slice(0, 45)).filter(Boolean).slice(0, 5)
        : [],
      staff_roles: roles,
    };
  });
}

// Description professionnelle affichée sous un type dans le menu déroulant
function typeOptionDescription(t) {
  if (t.description) return t.description.slice(0, 100);
  return `Ouvrir un ticket « ${t.label} » : notre équipe vous répond en privé.`.slice(0, 100);
}

// Rôles staff autorisés pour un ticket : ceux du type, sinon le rôle global
function staffRolesForTicket(botId, guild, channel) {
  const cfg = store.tickets.get(botId, guild.id) || {};
  const { typeLabel } = ticketMetaFor(channel);
  if (typeLabel) {
    const type = normalizeTypes(cfg).find((t) => t.label === typeLabel);
    if (type && type.staff_roles.length) return type.staff_roles;
  }
  return cfg.support_role ? [cfg.support_role] : [];
}

function isDefaultMessage(msg) {
  const s = String(msg || '').trim();
  if (!s) return true;
  return s === LEGACY_DEFAULT_MESSAGE;
}

function defaultPanelDescription(buttonLabel, hasTypes) {
  return [
    '**Une question, un problème ou une suggestion ?**',
    hasTypes
      ? 'Sélectionnez le **type de ticket** correspondant à votre demande dans le menu ci-dessous.'
      : `Cliquez sur **${buttonLabel}** ci-dessous.`,
    'Un **salon privé** s\'ouvre immédiatement : notre équipe vous répond au plus vite.',
  ].join('\n');
}

function buildTicketPanelEmbed(cfg, client, types) {
  const desc = isDefaultMessage(cfg.message)
    ? defaultPanelDescription(cfg.button_label || '🎫 Ouvrir un ticket', types.length > 0)
    : String(cfg.message);
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎫 Centre d\'assistance')
    .setDescription(desc)
    .addFields(
      { name: '🕐 Prise en charge rapide', value: 'Votre salon privé est ouvert **instantanément** : décrivez votre demande, notre équipe vous répond.', inline: true },
      { name: '🔒 100 % privé', value: 'Seuls **vous et le staff** pouvez voir la conversation.', inline: true },
      { name: '📩 Suivi assuré', value: 'À la fermeture, vous recevez la **transcription complète** en message privé.', inline: true },
    );
  if (types.length) {
    // 🗂️ Chaque type est présenté avec son emoji en titre et sa description
    // en dessous — bien organisé, comme une carte de services.
    embed.addFields({
      name: '🗂️ Nos services — choisissez dans le menu ci-dessous',
      value: 'Chaque demande est traitée dans un **salon privé**, en toute confidentialité.',
    });
    for (const t of types.slice(0, 12)) {
      embed.addFields({
        name: `${t.emoji || '🎫'} ${t.label}${t.category ? ` — ${t.category}` : ''}`.slice(0, 256),
        value: typeOptionDescription(t),
      });
    }
  }
  if (client && client.user) {
    try { embed.setThumbnail(client.user.displayAvatarURL({ dynamic: true })); } catch {}
  }
  const site = store.settings.get('public_url');
  if (site) embed.setFooter({ text: `Hoxera · ${site}` });
  return embed;
}

async function sendTicketPanel(botId, guildId, client, channel) {
  const cfg = store.tickets.get(botId, guildId);
  if (!cfg) throw new Error('Configuration des tickets introuvable');
  const types = normalizeTypes(cfg);
  const rows = [];
  if (types.length) {
    // Des types existent : seul le menu déroulant est affiché (pas de bouton en dessous).
    // Menu épuré : emoji + nom uniquement. Les détails de chaque type sont
    // déjà présentés dans l'embed « Centre d'assistance » (champ dédié par type).
    const select = new StringSelectMenuBuilder()
      .setCustomId(`bd-ttype:${botId}`)
      .setPlaceholder('🗂️ Choisissez le type de ticket…')
      .setMinValues(1).setMaxValues(1);
    for (const t of types.slice(0, 25)) {
      const opt = new StringSelectMenuOptionBuilder()
        .setLabel(String(t.label).slice(0, 100))
        .setValue(String(t.label).slice(0, 100));
      const e = safeEmoji(t.emoji);
      if (e) opt.setEmoji(e);
      select.addOptions(opt);
    }
    rows.push(new ActionRowBuilder().addComponents(select));
  } else {
    // Aucun type : simple bouton (style configurable)
    const style = [ButtonStyle.Primary, ButtonStyle.Secondary, ButtonStyle.Success, ButtonStyle.Danger][Number(cfg.button_style) - 1] || ButtonStyle.Primary;
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bd-ticket:${botId}`)
        .setLabel(cfg.button_label || '🎫 Ouvrir un ticket')
        .setStyle(style)
    ));
  }
  const identity = require('./identity');
  const guild = client && client.guilds ? client.guilds.cache.get(guildId) : null;
  const payload = { embeds: [buildTicketPanelEmbed(cfg, client, types)], components: rows };
  if (guild) {
    await identity.sendAsProfile(client, botId, guild, channel, payload);
  } else {
    await channel.send(payload);
  }
}

// ---------- Métadonnées du ticket (topic + mémoire) ----------
const ticketMeta = new Map(); // channelId -> { openerId, typeLabel }

function parseTopic(topic) {
  const t = String(topic || '');
  const m = t.match(/\| (\d{15,21})(?: \| (.*))?$/);
  return { openerId: m ? m[1] : null, typeLabel: m && m[2] ? m[2].trim() : null };
}

function ticketMetaFor(channel) {
  if (!channel) return { openerId: null, typeLabel: null };
  const fromTopic = parseTopic(channel.topic);
  if (fromTopic.openerId) return fromTopic;
  return ticketMeta.get(channel.id) || fromTopic;
}

// Le membre peut-il gérer ce ticket ? (propriétaire, admin, rôle support global OU rôle du type)
function isStaff(botId, interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return false;
  try {
    if (guild.ownerId === interaction.user.id) return true;
    if (member.permissions && typeof member.permissions.has === 'function'
      && member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  } catch {}
  const roles = staffRolesForTicket(botId, guild, interaction.channel);
  if (!roles.length) return false;
  const memberRoles = (member.roles && member.roles.cache) ? member.roles.cache : null;
  if (!memberRoles) return false;
  return roles.some((name) => {
    const role = resolveRole(guild, name);
    return !!(role && memberRoles.has(role.id));
  });
}

const staffForTicket = isStaff;

async function staffDeny(interaction) {
  return interaction.reply({ content: '🔒 Seul le **staff** de ce type de ticket peut utiliser ce bouton.', ephemeral: true });
}

// ---------- Création du ticket ----------
// Réponse d'interaction incassable : différée → editReply, sinon reply, sinon followUp.
// Plus JAMAIS de « Cette interaction a échoué » ni de confirmation invisible.
async function ackReply(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    return await interaction.reply(payload);
  } catch {
    try { return await interaction.followUp(payload); } catch { return null; }
  }
}

// Embed de bienvenue du salon de ticket : textes professionnels,
// type + description, équipe en charge, déroulement de la prise en charge,
// et les réponses du questionnaire personnalisé (si le type en a un).
function ticketWelcomeEmbed(member, chosen, staffMention, reason, dmWarning = '', answers = []) {
  const typeFields = [
    { name: '🗂️ Type de ticket', value: chosen ? `${chosen.emoji ? chosen.emoji + ' ' : ''}**${chosen.label}**` : '**Ticket simple**', inline: true },
  ];
  if (chosen && chosen.description) {
    typeFields.push({ name: 'ℹ️ À propos de ce type', value: chosen.description.slice(0, 1024), inline: true });
  }
  const fields = [...typeFields];
  if (Array.isArray(answers) && answers.length) {
    fields.push({
      name: '📝 Réponses au questionnaire',
      value: answers
        .map((a, i) => `**${i + 1}. ${a.q}**\n↳ ${a.a}`)
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }
  fields.push(
    { name: '🛡️ Équipe en charge', value: staffMention || 'le staff du serveur', inline: true },
    { name: '📝 Votre demande', value: reason ? reason.slice(0, 1024) : '—', inline: false },
    { name: '📋 Déroulement de la prise en charge', value: [
      '1️⃣ Décrivez votre demande en détail (textes, captures d\'écran, fichiers).',
      '2️⃣ Un membre du staff vous répond ici, dans ce salon privé.',
      '3️⃣ À la fermeture définitive du ticket, la **transcription complète** vous est envoyée en message privé.',
    ].join('\n') },
    { name: '🔒 Boutons réservés au staff', value: '**🔒 Fermer** — verrouiller (réouvrable) · **⏸ En attente** — lecture seule · **🔓 Réouvrir** · **🗑 Supprimer** — fermeture définitive avec transcription en MP.' + dmWarning },
  );
  const avatar = member.user.displayAvatarURL ? member.user.displayAvatarURL({ dynamic: true }) : '';
  const welcome = new EmbedBuilder()
    .setColor('#57F287')
    .setAuthor(avatar ? { name: `Ticket de ${member.user.username}`, iconURL: avatar } : { name: `Ticket de ${member.user.username}` })
    .setTitle('🎫 Ticket ouvert — prise en charge en cours')
    .setDescription(`Bienvenue ${member} ! Votre demande a bien été enregistrée. Un membre de notre équipe vous répondra dans les plus brefs délais.\n\nVous pouvez dès maintenant décrire votre demande en détail : textes, captures d'écran et fichiers sont les bienvenus.`)
    .addFields(...fields)
    .setTimestamp();
  const site = store.settings.get('public_url');
  if (site) welcome.setFooter({ text: `Hoxera · ${site}` });
  return welcome;
}

async function openTicket(botId, interaction, type, reason = '', answers = []) {
  const guild = interaction.guild;
  const member = interaction.member;
  const cfg = store.tickets.get(botId, guild.id);
  if (!cfg) return ackReply(interaction, { content: '⚠️ Les tickets ne sont pas configurés.', ephemeral: true });

  const types = parseTypes(cfg);
  const chosenRaw = type || types[0] || null;
  const chosen = chosenRaw ? {
    label: String(chosenRaw.label || ''),
    emoji: String(chosenRaw.emoji || ''),
    category: String(chosenRaw.category || ''),
    description: String(chosenRaw.description || '').slice(0, 100),
    questions: Array.isArray(chosenRaw.questions)
      ? chosenRaw.questions.map((q) => String(q).slice(0, 45)).filter(Boolean).slice(0, 5)
      : [],
    staff_roles: Array.isArray(chosenRaw.staff_roles)
      ? chosenRaw.staff_roles.map((r) => String(r).trim()).filter(Boolean)
      : (chosenRaw.staff_role ? [String(chosenRaw.staff_role).trim()] : []),
  } : null;
  const prefix = chosen ? slugify(chosen.label) : 'ticket';
  const uname = slugify(member.user.username);
  const baseName = `${prefix}-${uname}`.slice(0, 32);

  // 🔄 Réinitialisation automatique : purge les entrées du registre dont le
  // salon n'existe plus, puis supprime les anciens salons fermés de ce membre
  // → son nouveau ticket reprend le nom d'origine.
  const allChannels = cacheChannels(guild);
  store.closedTickets.pruneGuild(guild.id, allChannels.map((c) => c && c.id));

  const memberPrefix = `${prefix}-${uname}`;
  const staleChannels = allChannels.filter((c) => {
    if (!c || !c.name || !c.name.startsWith(memberPrefix)) return false;
    if (store.closedTickets.isClosed(c.id)) return true;
    try {
      const perms = c.permissionsFor ? c.permissionsFor(member.id) : null;
      return perms ? !perms.has(PermissionFlagsBits.ViewChannel) : false;
    } catch { return false; }
  });
  for (const stale of staleChannels) {
    store.closedTickets.remove(stale.id);
    try { await stale.delete(); } catch {}
  }

  // Un ticket n'est « ouvert » que si le membre peut encore le VOIR.
  // Les salons fermés par le bot (registre) sont ignorés.
  const existingOpen = guild.channels.cache.find((c) => {
    if (!c || !c.name || !c.name.endsWith(`-${uname}`)) return false;
    if (store.closedTickets.isClosed(c.id)) return false;
    try {
      const perms = c.permissionsFor ? c.permissionsFor(member.id) : null;
      return perms ? perms.has(PermissionFlagsBits.ViewChannel) : true;
    } catch { return true; }
  });
  if (existingOpen) {
    const mention = (existingOpen && typeof existingOpen.toString === 'function' && existingOpen.id)
      ? existingOpen.toString()
      : (existingOpen && existingOpen.name ? `#${existingOpen.name}` : '');
    return ackReply(interaction, { content: `Tu as déjà un ticket ouvert : ${mention}`, ephemeral: true });
  }

  // Suffixe de sécurité (-2, -3…) si un salon porte encore le nom
  let channelName = baseName;
  let counter = 1;
  while (guild.channels.cache.find((c) => c && c.name === channelName)) {
    counter += 1;
    channelName = `${baseName}-${counter}`.slice(0, 32);
  }

  // TOUS les rôles staff du type (ou le rôle global) obtiennent l'accès
  const staffNames = (chosen && chosen.staff_roles && chosen.staff_roles.length)
    ? chosen.staff_roles
    : (cfg.support_role ? [cfg.support_role] : []);
  const supportRoles = staffNames.map((n) => resolveRole(guild, n)).filter(Boolean);
  const catName = (chosen && chosen.category) ? chosen.category : (cfg.category || '');
  let parent = null;
  if (catName) {
    const lower = String(catName).toLowerCase();
    parent = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === lower);
    if (!parent) {
      try { parent = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory }); } catch {}
    }
  }

  const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const perms = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow },
  ];
  for (const r of supportRoles) perms.push({ id: r.id, allow });

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parent ? parent.id : null,
      permissionOverwrites: perms,
      topic: `Ticket de ${member.user.tag} | ${member.id} | ${chosen ? chosen.label : ''}`,
    });
  } catch (e) {
    return ackReply(interaction, { content: '⚠️ Je n\'ai pas pu créer le salon. Vérifie mes permissions (gérer les salons).', ephemeral: true });
  }
  ticketMeta.set(channel.id, { openerId: member.id, typeLabel: chosen ? chosen.label : '', reason, answers });
  bumpTicketStats(guild.id, 1, 1);

  // Boutons du staff : deux rangées propres
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bd-tmenu:${botId}:close`).setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bd-tmenu:${botId}:hold`).setLabel('⏸ En attente').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bd-tmenu:${botId}:reopen`).setLabel('🔓 Réouvrir').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bd-tmenu:${botId}:delete`).setLabel('🗑 Supprimer').setStyle(ButtonStyle.Secondary),
  );

  // Vérification MP dès l'ouverture : si les MP du membre sont fermés,
  // on l'avertit tout de suite qu'il ne pourra pas recevoir la transcription.
  let dmWarning = '';
  try {
    if (interaction.client && interaction.client.users) {
      const openerUser = await interaction.client.users.fetch(member.id);
      await openerUser.send(
        `🎫 Ton ticket est ouvert sur **${guild.name}** !\n👉 **Rejoins-le ici : ${channel}**\nNous te répondrons au plus vite. À la suppression du ticket, tu recevras la transcription ici.`
      );
    }
  } catch {
    dmWarning = '\n⚠️ **Mes messages privés ne t\'atteignent pas** : active « Autoriser les messages privés des membres du serveur » (Réglages Discord → Confidentialité) si tu veux recevoir la transcription à la fermeture.';
  }

  // Bienvenue + journaux : ces étapes ne doivent JAMAIS empêcher la confirmation.
  try {
    const staffMention = supportRoles.length ? supportRoles.map((r) => r.toString()).join(' ') : '';
    const welcome = ticketWelcomeEmbed(member, chosen, staffMention, reason, dmWarning, answers);
    const identity = require('./identity');
    await identity.sendAsProfile(interaction.client, botId, guild, channel, {
      content: `${member}${staffMention ? ' · ' + staffMention : ''}`,
      embeds: [welcome],
      components: [row1, row2],
    }).catch(() => {});

    await logging.log(botId, guild, {
      title: '🎫 Ticket ouvert', color: '#5865F2',
      fields: [
        { name: '👤 Créateur', value: `<@${member.id}>`, inline: true },
        { name: '📨 Salon', value: `<#${channel.id}>`, inline: true },
        { name: '🗂️ Type', value: chosen ? `${chosen.emoji || ''} ${chosen.label}` : 'simple', inline: true },
        { name: '📝 Raison', value: reason || '—' },
      ],
    });
  } catch (e) {
    console.error('[BotDev] ticket welcome/log:', e.message);
  }

  // ✅ Confirmation : TOUJOURS envoyée, quoi qu'il arrive.
  // 1) Réponse à l'interaction (lien cliquable vers le salon de ticket)
  const confirmMsg = `✅ Ton ticket a été créé : **${channel}** — clique dessus pour l'ouvrir !`;
  await ackReply(interaction, { content: confirmMsg, ephemeral: true });
  // 2) Message visible SOUS LE PANNEAU dans le salon des tickets
  //    (indépendant de l'interaction : même si Discord coupe la réponse
  //    éphémère, la confirmation reste visible pour tout le monde).
  try {
    const panelCh = interaction.channel;
    if (panelCh && typeof panelCh.send === 'function' && panelCh.id !== channel.id) {
      await panelCh.send({ content: `✅ Ticket créé pour ${member} : ${channel} — bonne prise en charge !` });
    }
  } catch (e) {
    console.error('[BotDev] confirm panel:', e.message);
  }
}

// ---------- Raisons : ouverture & suppression ----------
const pendingReasons = new Map(); // userId -> { botId, guildId, type }
const pendingDeletes = new Map(); // userId -> { botId }

function reasonModal(botId, customId, title, label, placeholder) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(String(label).slice(0, 45))
    .setPlaceholder(String(placeholder).slice(0, 100))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

// ❓ Questionnaire personnalisé du type (réponses OBLIGATOIRES) :
// une modale avec une question par champ, puis la raison (si activée).
const pendingQuestionnaires = new Map(); // userId -> { botId, guildId, type, ts }

function questionnaireModal(botId, type) {
  const questions = (type && type.questions && type.questions.length)
    ? type.questions.map((q) => String(q).slice(0, 45)).filter(Boolean).slice(0, 5)
    : [];
  const modal = new ModalBuilder()
    .setCustomId(`bd-tquest:${botId}`)
    .setTitle(`📝 ${type ? String(type.label || 'Ticket').slice(0, 30) : 'Ticket'} — questionnaire`);
  questions.forEach((q, i) => {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(`q${i}`)
        .setLabel(q)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500),
    ));
  });
  return modal;
}

async function askReason(botId, interaction, type, answers = [], skipQuestionnaire = false) {
  const cfg = store.tickets.get(botId, interaction.guild.id) || {};
  // Questionnaire personnalisé du type : d'abord les questions obligatoires
  // (sauf si on vient justement d'y répondre : skipQuestionnaire)
  if (!skipQuestionnaire && type && type.questions && type.questions.length) {
    pendingQuestionnaires.set(interaction.user.id, { botId, guildId: interaction.guild.id, type, ts: Date.now() });
    await interaction.showModal(questionnaireModal(botId, type));
    return;
  }
  // Questionnaire désactivé → ouverture directe sans raison
  if (cfg.require_reason === 0 || cfg.require_reason === false) {
    // On diffère la réponse : l'ouverture du salon peut prendre quelques secondes,
    // on évite ainsi le « Cette interaction a échoué ».
    try { await interaction.deferReply({ ephemeral: true }); } catch {}
    await openTicket(botId, interaction, type, '', answers);
    return;
  }
  pendingReasons.set(interaction.user.id, { botId, guildId: interaction.guild.id, type, answers, ts: Date.now() });
  await interaction.showModal(reasonModal(
    botId,
    `bd-treason:${botId}`,
    '📝 Ouvre ton ticket',
    'Raison de ta demande',
    'Explique brièvement pourquoi tu ouvres ce ticket…'
  ));
}

async function submitQuestionnaire(botId, interaction) {
  const pending = pendingQuestionnaires.get(interaction.user.id);
  pendingQuestionnaires.delete(interaction.user.id);
  if (!pending || pending.botId !== botId || Date.now() - (pending.ts || 0) > WIZARD_TTL) {
    return interaction.reply({ content: '⏰ Ta demande a expiré, réessaie.', ephemeral: true });
  }
  const questions = (pending.type.questions || []);
  const answers = questions.map((q, i) => ({
    q: String(q).slice(0, 45),
    a: (interaction.fields.getTextInputValue(`q${i}`) || '').trim().slice(0, 500) || '—',
  }));
  // On enchaîne : la raison (si activée) puis l'ouverture du ticket avec les réponses
  await askReason(botId, interaction, pending.type, answers, true);
}

async function submitReason(botId, interaction) {
  const pending = pendingReasons.get(interaction.user.id);
  pendingReasons.delete(interaction.user.id);
  if (!pending || pending.botId !== botId || Date.now() - (pending.ts || 0) > WIZARD_TTL) {
    return interaction.reply({ content: '⏰ Ta demande a expiré, réessaie.', ephemeral: true });
  }
  const reason = (interaction.fields.getTextInputValue('value') || '').trim();
  // Réponse différée : l'ouverture du salon peut prendre quelques secondes,
  // la confirmation (avec le lien du ticket) arrive ensuite proprement.
  try { await interaction.deferReply({ ephemeral: true }); } catch {}
  await openTicket(botId, interaction, pending.type, reason, pending.answers || []);
}

async function handleTicketButton(botId, interaction) {
  await askReason(botId, interaction, null);
}

async function handleTicketTypeSelect(botId, interaction) {
  const cfg = store.tickets.get(botId, interaction.guild.id) || {};
  const label = interaction.values[0];
  const type = normalizeTypes(cfg).find((t) => t.label === label) || { label, questions: [] };
  await askReason(botId, interaction, type);
}

// ---------- Transcription + MP ----------
async function buildTranscript(botId, interaction, extraLines = []) {
  const channel = interaction.channel;
  const guild = interaction.guild;
  const meta = ticketMetaFor(channel);
  let text = '';
  if (meta.reason) text += `📝 Raison du ticket : ${meta.reason}\n\n`;
  if (Array.isArray(meta.answers) && meta.answers.length) {
    text += '❓ Questionnaire :\n' + meta.answers.map((a) => `${a.q} → ${a.a}`).join('\n') + '\n\n';
  }
  try {
    const fetched = await channel.messages.fetch({ limit: 100 });
    const arr = [...fetched.values()].reverse();
    text += arr.map((m) => {
      const time = m.createdAt ? m.createdAt.toISOString().slice(11, 19) : '--:--:--';
      const content = m.content || (m.attachments && m.attachments.size ? '[pièce jointe]' : (m.embeds && m.embeds.length ? '[embed]' : ''));
      return `[${time}] ${m.author ? m.author.username : '?'}: ${content}`;
    }).join('\n');
  } catch {}
  if (extraLines.length) text += '\n\n' + extraLines.join('\n');
  let token = '', url = '';
  try {
    token = crypto.randomBytes(8).toString('hex');
    store.transcripts.add({
      token, bot_id: botId, guild_id: guild.id, channel_name: channel.name,
      opener_id: meta.openerId || '', type_label: meta.typeLabel || '', server_name: guild.name,
      messages: text.slice(0, 300000),
    });
    const site = store.settings.get('public_url');
    if (site) url = `${site}/transcript/${token}`;
  } catch (e) { console.error('[BotDev] transcript:', e.message); }
  return { text, url, openerId: meta.openerId };
}

// Envoie la transcription en MP. Résout l'utilisateur avec double fallback.
async function sendTranscriptDm(interaction, guild, channelName, { text, url, openerId }) {
  if (!openerId) return false;
  let user = null;
  try { user = await interaction.client.users.fetch(openerId); } catch {}
  if (!user) {
    try { user = (await guild.members.fetch(openerId)).user; } catch {}
  }
  if (!user) return false;
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎫 Ton ticket a été fermé')
    .setDescription([
      `Merci d\'avoir contacté l\'équipe de **${guild.name}** ! 👋`,
      '',
      'Ton ticket a été traité et fermé par notre équipe. Si tu as besoin de quoi que ce soit, n\'hésite pas à ouvrir un nouveau ticket.',
      '',
      url ? `📄 **Ta transcription** : [Clique ici](${url})` : '📄 **Ta transcription** : fichier joint ci-dessous.',
    ].join('\n'))
    .setFooter({ text: 'BotDev · tickets automatiques' });
  try {
    await user.send({
      embeds: [embed],
      files: [{ attachment: Buffer.from(text || 'Transcription indisponible.', 'utf-8'), name: `transcription-${channelName}.txt` }],
    });
    return true;
  } catch (e) {
    console.log('[BotDev] DM transcription impossible:', e.message);
    return false;
  }
}

// ---------- Fermer / Réouvrir / En attente / Supprimer (staff) ----------
// 🔒 Fermer = verrouiller le ticket (le staff peut Réouvrir).
// 📄 La transcription n'est envoyée qu'à la SUPPRESSION (le point final).
async function handleTicketClose(botId, interaction) {
  if (!isStaff(botId, interaction)) return staffDeny(interaction);
  const channel = interaction.channel;
  const guild = interaction.guild;
  const { openerId } = ticketMetaFor(channel);
  if (openerId) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: false, SendMessages: false }).catch(() => {});
  }
  store.closedTickets.add(channel.id, botId, guild.id);
  bumpTicketStats(guild.id, 0, -1);
  await logging.log(botId, guild, {
    title: '🔒 Ticket fermé', color: '#ED4245',
    fields: [
      { name: '📨 Salon', value: `<#${channel.id}>`, inline: true },
      { name: '🛡️ Par', value: `${interaction.user.tag}`, inline: true },
      { name: '📄 Transcription', value: 'envoyée à la suppression', inline: true },
    ],
  });
  await interaction.reply({
    content: '🔒 Ticket fermé. 📄 La **transcription** sera envoyée en MP au créateur au moment de la **suppression** (`/ticket delete` ou bouton 🗑).',
    ephemeral: true,
  });
}

async function handleTicketReopen(botId, interaction) {
  if (!isStaff(botId, interaction)) return staffDeny(interaction);
  const channel = interaction.channel;
  store.closedTickets.remove(channel.id);
  bumpTicketStats(interaction.guild.id, 0, 1);
  const { openerId } = ticketMetaFor(channel);
  if (openerId) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: true, SendMessages: true }).catch(() => {});
  }
  await interaction.reply({ content: '🔓 Ticket réouvert !', ephemeral: true });
}

async function handleTicketHold(botId, interaction) {
  if (!isStaff(botId, interaction)) return staffDeny(interaction);
  const channel = interaction.channel;
  const { openerId } = ticketMetaFor(channel);
  if (openerId) {
    await channel.permissionOverwrites.edit(openerId, { ViewChannel: true, SendMessages: false }).catch(() => {});
  }
  await interaction.reply({ content: '⏸ Ticket mis en attente (le créateur ne peut plus écrire).', ephemeral: true });
}

async function handleTicketDeleteAsk(botId, interaction) {
  if (!isStaff(botId, interaction)) return staffDeny(interaction);
  pendingDeletes.set(interaction.user.id, { botId, ts: Date.now() });
  await interaction.showModal(reasonModal(
    botId,
    `bd-tdel:${botId}`,
    '🗑 Supprimer le ticket',
    'Raison de la suppression',
    'Ex : problème résolu, spam, hors sujet…'
  ));
}

async function submitDeleteReason(botId, interaction) {
  const pending = pendingDeletes.get(interaction.user.id);
  pendingDeletes.delete(interaction.user.id);
  if (!pending || pending.botId !== botId || Date.now() - (pending.ts || 0) > WIZARD_TTL) {
    return interaction.reply({ content: '⏰ La suppression a expiré, réessaie.', ephemeral: true });
  }
  if (!isStaff(botId, interaction)) return staffDeny(interaction);
  const chName = interaction.channel ? interaction.channel.name || '' : '';
  const chTopic = interaction.channel && interaction.channel.topic ? interaction.channel.topic : '';
  if (!chName.startsWith('ticket-') && !chTopic.includes('Ticket de')) {
    return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un salon de ticket.', ephemeral: true });
  }
  const reason = (interaction.fields.getTextInputValue('value') || '').trim() || 'aucune raison';
  const channel = interaction.channel;
  const guild = interaction.guild;
  // ⏱️ Réponse différée AVANT le travail long (transcription + MP) :
  // sans ça, Discord coupe l'interaction au bout de 3 secondes.
  try { await interaction.deferReply({ ephemeral: true }); } catch {}
  store.closedTickets.add(channel.id, botId, guild.id);
  bumpTicketStats(guild.id, 0, -1);
  const t = await buildTranscript(botId, interaction, [
    `🗑 Ticket supprimé par ${interaction.user.tag} — raison : ${reason}`,
  ]);
  const dmOk = await sendTranscriptDm(interaction, guild, channel.name, t);
  await logging.log(botId, guild, {
    title: '🗑 Ticket supprimé', color: '#ED4245',
    fields: [
      { name: '📨 Salon', value: `<#${channel.id}>`, inline: true },
      { name: '🛡️ Par', value: `${interaction.user.tag}`, inline: true },
      { name: '📝 Raison', value: reason },
    ],
  });
  await ackReply(interaction, {
    content: '🗑 Ticket supprimé.' + (dmOk ? ' 📄 Transcription envoyée en MP.' : ' ⚠️ MP impossible pour le créateur.'),
    ephemeral: true,
  });
  setTimeout(() => { channel.delete().catch(() => {}); }, 2500);
}

async function handleTicketDeleteConfirm(botId, interaction) {
  if (!isStaff(botId, interaction)) return staffDeny(interaction);
  const channel = interaction.channel;
  const guild = interaction.guild;
  store.closedTickets.add(channel.id, botId, guild.id);
  bumpTicketStats(guild.id, 0, -1);
  const t = await buildTranscript(botId, interaction, [
    `🗑 Ticket supprimé par ${interaction.user.tag} — raison : aucune raison fournie`,
  ]);
  const dmOk = await sendTranscriptDm(interaction, guild, channel.name, t);
  await interaction.update({
    content: '🗑 Ticket supprimé.' + (dmOk ? ' 📄 Transcription envoyée en MP.' : ' ⚠️ MP impossible pour le créateur.'),
    embeds: [], components: [],
  }).catch(() => {});
  setTimeout(() => { channel.delete().catch(() => {}); }, 2500);
}

async function handleTicketDeleteCancel(interaction) {
  await interaction.update({ content: '❌ Suppression annulée.', embeds: [], components: [] });
}

// ============================================================
// Assistant interactif des types de tickets (/ticket types setup)
// ============================================================
const typesWizards = new Map();
const typesWizardKey = (botId, guildId, userId) => `${botId}:${guildId}:${userId}`;

function typesList(botId, guildId) {
  const cfg = store.tickets.get(botId, guildId) || {};
  return parseTypes(cfg);
}

function saveTypes(botId, guildId, types) {
  const cfg = store.tickets.get(botId, guildId) || {};
  store.tickets.set(botId, guildId, { ...cfg, types: JSON.stringify(types) });
}

function updateType(botId, guildId, label, fields) {
  const types = typesList(botId, guildId);
  const idx = types.findIndex((t) => t.label === label);
  if (idx === -1) return;
  types[idx] = { ...types[idx], ...fields };
  saveTypes(botId, guildId, types);
}

function addType(botId, guildId, t) {
  const types = typesList(botId, guildId).filter((x) => x.label !== t.label);
  types.push(t);
  saveTypes(botId, guildId, types);
}

function removeType(botId, guildId, label) {
  saveTypes(botId, guildId, typesList(botId, guildId).filter((t) => t.label !== label));
}

function typeOption(label, emoji, value) {
  const b = new StringSelectMenuOptionBuilder()
    .setLabel(String(label).slice(0, 80))
    .setValue(String(value || label).slice(0, 100));
  const e = safeEmoji(emoji);
  if (e) b.setEmoji(e);
  return b;
}

// Emoji sûr : ne garde que les vrais émojis (Unicode ou personnalisés <:nom:id>).
// Un emoji invalide stocké (ex : du texte) faisait planter la construction des
// menus → Discord affichait « L'application ne répond pas ».
function safeEmoji(s) {
  const str = String(s || '').trim();
  if (!str) return '';
  if (/^<a?:[a-zA-Z0-9_]+:\d{15,21}>$/.test(str)) return str;
  if (/^[\p{Extended_Pictographic}\u200D\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]+$/u.test(str)) return str;
  return '';
}

function typesPickEmbed(state) {
  const types = typesList(state.botId, state.guildId);
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🗂️ Assistant des types de tickets')
    .setDescription('Choisis un type à modifier, créé-en un nouveau, ou termine.')
    .addFields({
      name: '📋 Types actuels',
      value: types.length
        ? types.map((t) => {
            const roles = Array.isArray(t.staff_roles) ? t.staff_roles : (t.staff_role ? [t.staff_role] : []);
            return `${t.emoji || '🎫'} **${t.label}**${t.category ? ` → ${t.category}` : ''}${roles.length ? ` · 🛡️ ${roles.join(', ')}` : ''}`;
          }).join('\n').slice(0, 1024)
        : 'Aucun type — commence avec « ➕ Nouveau type ».',
    })
    .setFooter({ text: 'Le panneau (/ticket panel) affiche ces types dans un menu déroulant.' });
}

function typesPickComponents(state) {
  const types = typesList(state.botId, state.guildId).slice(0, 23);
  const opts = types.map((t) => ({ label: t.label, value: t.label, emoji: t.emoji || '🎫' }));
  opts.push({ label: '➕ Nouveau type', value: '__new__', emoji: '➕' });
  opts.push({ label: '✅ Terminer', value: '__done__', emoji: '✅' });
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bdw-ts:${state.botId}:${state.userId}`)
      .setPlaceholder('Choisis un type…')
      .setMinValues(1).setMaxValues(1)
      .addOptions(opts.map((o) => typeOption(o.label, o.emoji, o.value)))
  )];
}

function currentType(state) {
  const t = typesList(state.botId, state.guildId).find((x) => x.label === state.current);
  if (!t) return { label: state.current, emoji: '', category: '', description: '', staff_roles: [] };
  const roles = Array.isArray(t.staff_roles) ? t.staff_roles : (t.staff_role ? [t.staff_role] : []);
  return { ...t, description: String(t.description || ''), staff_roles: roles.filter(Boolean) };
}

function typesEditEmbed(state) {
  const t = currentType(state);
  const qs = Array.isArray(t.questions) ? t.questions.filter(Boolean) : [];
  return new EmbedBuilder()
    .setColor('#8B5CF6')
    .setTitle(`${t.emoji || '🎫'} ${t.label}`)
    .setDescription('Choisis une action :')
    .addFields(
      { name: '😀 Emoji', value: t.emoji || 'aucun', inline: true },
      { name: '🗂️ Catégorie', value: t.category || 'par défaut', inline: true },
      { name: '📝 Description', value: t.description || '*aucune — ajoute une explication professionnelle affichée dans le centre d\'assistance*', inline: false },
      { name: '❓ Questionnaire (' + qs.length + '/5)', value: qs.length ? qs.map((q, i) => `${i + 1}. ${q}`).join('\n') : '*aucun — par défaut, seule la raison est demandée*', inline: false },
      { name: '🛡️ Rôles staff (' + (t.staff_roles || []).length + ')', value: (t.staff_roles || []).length ? t.staff_roles.join('\n') : 'aucun', inline: true },
    );
}

function typesEditComponents(state) {
  const actions = [
    { label: '✏️ Renommer', value: 'rename', emoji: '✏️' },
    { label: '😀 Changer l\'emoji', value: 'emoji', emoji: '😀' },
    { label: '📝 Description du type', value: 'desc', emoji: '📝' },
    { label: '❓ Questionnaire (questions obligatoires)', value: 'questions', emoji: '❓' },
    { label: '🗂️ Changer la catégorie', value: 'category', emoji: '🗂️' },
    { label: '🛡️ ➕ Ajouter un rôle staff', value: 'addrole', emoji: '🛡️' },
    { label: '🛡️ ➖ Retirer un rôle staff', value: 'removerole', emoji: '🛡️' },
    { label: '🗑 Supprimer ce type', value: 'delete', emoji: '🗑' },
    { label: '⬅️ Retour', value: 'back', emoji: '⬅️' },
  ];
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bdw-ts:${state.botId}:${state.userId}`)
      .setPlaceholder('Action…')
      .setMinValues(1).setMaxValues(1)
      .addOptions(actions.map((a) => typeOption(a.label, a.emoji, a.value)))
  )];
}

function typesCategoryComponents(state) {
  const cats = [...state.guild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildCategory)
    .map((c) => c.name);
  const uniq = [...new Set(cats)].slice(0, 23);
  const opts = uniq.map((n) => ({ label: n, value: n }));
  opts.push({ label: '➕ Nouvelle catégorie (écrire)', value: '__custom__', emoji: '➕' });
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bdw-ts:${state.botId}:${state.userId}`)
      .setPlaceholder('Choisis une catégorie…')
      .setMinValues(1).setMaxValues(1)
      .addOptions(opts.map((o) => typeOption(o.label, o.emoji || '', o.value)))
  )];
}

// Étape « ➕ Ajouter un rôle staff » : sélecteur de rôle natif (répétable) + Terminé
function typesAddRoleComponents(state) {
  const t = currentType(state);
  const used = (t.staff_roles || []).length;
  return [
    new ActionRowBuilder().addComponents(
      new (require('discord.js').RoleSelectMenuBuilder)()
        .setCustomId(`bdw-tr:${state.botId}:${state.userId}`)
        .setPlaceholder(`🛡️ Choisis un rôle à ajouter (${used} sélectionné(s))…`)
        .setMinValues(1).setMaxValues(1)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bdw-tb:${state.botId}:${state.userId}:doneroles`).setLabel('✅ Terminé').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bdw-tb:${state.botId}:${state.userId}:back`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function typesAddRoleEmbed(state) {
  const t = currentType(state);
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🛡️ Rôles staff de « ${t.label} »`)
    .setDescription('Sélectionne **autant de rôles que tu veux** : chacun pourra gérer les tickets de ce type (fermer, réouvrir, supprimer).')
    .addFields({
      name: `📋 Rôles actuels (${(t.staff_roles || []).length})`,
      value: (t.staff_roles || []).length ? t.staff_roles.join('\n') : 'aucun',
    });
}

// Étape « ➖ Retirer un rôle staff » : menu des rôles actuels (répétable)
function typesRemoveRoleComponents(state) {
  const t = currentType(state);
  const roles = (t.staff_roles || []).slice(0, 23);
  const opts = roles.map((r) => ({ label: r, value: r, emoji: '🛡️' }));
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bdw-ts:${state.botId}:${state.userId}`)
        .setPlaceholder('Choisis un rôle à retirer…')
        .setMinValues(1).setMaxValues(1)
        .addOptions(opts.map((o) => typeOption(o.label, o.emoji, o.value)))
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bdw-tb:${state.botId}:${state.userId}:doneroles`).setLabel('✅ Terminé').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bdw-tb:${state.botId}:${state.userId}:back`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function typesRemoveRoleEmbed(state) {
  const t = currentType(state);
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(`🛡️ Retirer un rôle de « ${t.label} »`)
    .setDescription('Sélectionne un rôle pour le retirer de la gestion de ce type de ticket.');
}

// ❓ Étape « Questionnaire » : questions obligatoires du type (ajout/retrait répétables)
function typesQuestionsEmbed(state) {
  const t = currentType(state);
  const qs = (t.questions || []).filter(Boolean);
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`❓ Questionnaire de « ${t.label} »`)
    .setDescription('Les membres qui ouvrent ce type de ticket devront répondre **obligatoirement** à ces questions (une fenêtre s\'ouvre avant la création du ticket).\n\n*Par défaut : aucune question (seule la raison est demandée).*')
    .addFields({
      name: `📋 Questions actuelles (${qs.length}/5)`,
      value: qs.length ? qs.map((q, i) => `**${i + 1}.** ${q}`).join('\n') : 'aucune',
    });
}

function typesQuestionsComponents(state) {
  const t = currentType(state);
  const qs = (t.questions || []).filter(Boolean);
  const opts = [
    { label: '➕ Ajouter une question', value: '__addq__', emoji: '➕' },
  ];
  if (qs.length) opts.push({ label: '➖ Retirer une question', value: '__remq__', emoji: '➖' });
  opts.push({ label: '✅ Terminé', value: '__doneq__', emoji: '✅' });
  opts.push({ label: '⬅️ Retour', value: 'back', emoji: '⬅️' });
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bdw-ts:${state.botId}:${state.userId}`)
      .setPlaceholder('Gère le questionnaire…')
      .setMinValues(1).setMaxValues(1)
      .addOptions(opts.map((o) => typeOption(o.label, o.emoji, o.value)))
  )];
}

function typesRemoveQuestionEmbed(state) {
  const t = currentType(state);
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle(`❓ Retirer une question de « ${t.label} »`)
    .setDescription('Sélectionne la question à retirer du questionnaire.');
}

function typesRemoveQuestionComponents(state) {
  const t = currentType(state);
  const qs = (t.questions || []).filter(Boolean).slice(0, 23);
  const opts = qs.map((q, i) => ({ label: `${i + 1}. ${q}`, value: q, emoji: '❓' }));
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bdw-ts:${state.botId}:${state.userId}`)
      .setPlaceholder('Choisis une question à retirer…')
      .setMinValues(1).setMaxValues(1)
      .addOptions(opts.map((o) => typeOption(o.label, o.emoji, o.value)))
  )];
}

function typesConfirmComponents(state) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bdw-tb:${state.botId}:${state.userId}:confirmdel`).setLabel('✅ Confirmer la suppression').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bdw-tb:${state.botId}:${state.userId}:cancel`).setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary),
  )];
}

function textModal(botId, uid, title, label, placeholder, required, maxLen) {
  const modal = new ModalBuilder()
    .setCustomId(`bdw-tm:${botId}:${uid}`)
    .setTitle(String(title).slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(String(label).slice(0, 45))
    .setPlaceholder(String(placeholder).slice(0, 100))
    .setStyle(TextInputStyle.Short)
    .setMaxLength(maxLen || 100)
    .setRequired(!!required);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function startTypesWizard(botId, interaction) {
  const state = {
    botId, guildId: interaction.guild.id, userId: interaction.user.id,
    step: 'pick', current: null, modal: null, startedAt: Date.now(),
    guild: interaction.guild, msg: null,
  };
  try {
    const msg = await interaction.reply({
      embeds: [typesPickEmbed(state)],
      components: typesPickComponents(state),
      fetchReply: true,
    });
    state.msg = msg;
    typesWizards.set(typesWizardKey(botId, interaction.guild.id, interaction.user.id), state);
  } catch (e) {
    // Si le menu ne peut pas être construit (donnée invalide), on répond quand même
    console.error('[BotDev] types wizard start:', e.message);
    try {
      await interaction.reply({
        content: '⚠️ Un élément de la liste des types est invalide (probablement un emoji). Corrige les types dans le **dashboard** (onglet Tickets) puis relance `/ticket types setup`.',
        ephemeral: true,
      });
    } catch {}
  }
}

async function handleTypesWizardInteraction(botId, interaction) {
  const parts = String(interaction.customId || '').split(':');
  const uid = parts[2];
  if (!uid || uid !== interaction.user.id) return;
  const key = typesWizardKey(botId, interaction.guild.id, uid);
  const state = typesWizards.get(key);
  if (!state) return interaction.reply({ content: '⏰ Assistant expiré. Relance `/ticket types setup`.', ephemeral: true });
  if (Date.now() - state.startedAt > WIZARD_TTL) {
    typesWizards.delete(key);
    return interaction.update({ content: '⏰ Assistant expiré. Relance `/ticket types setup`.', embeds: [], components: [] });
  }

  const backToPick = () => { state.step = 'pick'; state.current = null; return { embeds: [typesPickEmbed(state)], components: typesPickComponents(state) }; };
  const backToEdit = () => { state.step = 'edit'; return { embeds: [typesEditEmbed(state)], components: typesEditComponents(state) }; };

  // --- Menu déroulant (choix du type / action / catégorie / retrait de rôle) ---
  if (interaction.isStringSelectMenu()) {
    const v = interaction.values[0];
    // Étape « ➖ Retirer un rôle staff » : répétable
    if (state.step === 'removerole') {
      const t = currentType(state);
      updateType(botId, state.guildId, state.current, { staff_roles: (t.staff_roles || []).filter((r) => r !== v) });
      return interaction.update({ embeds: [typesRemoveRoleEmbed(state)], components: typesRemoveRoleComponents(state) });
    }
    if (state.step === 'pick') {
      if (v === '__done__') {
        typesWizards.delete(key);
        return interaction.update({
          embeds: [new EmbedBuilder().setColor('#57F287').setTitle('✅ Terminé !')
            .setDescription('📨 Envoie le panneau avec `/ticket panel` pour afficher ton menu déroulant.')],
          components: [],
        });
      }
      if (v === '__new__') {
        state.modal = 'name';
        return interaction.showModal(textModal(botId, uid, '➕ Nouveau type', 'Nom du type', 'Ticket contre admin', true, 100));
      }
      state.current = v;
      state.step = 'edit';
      return interaction.update(backToEdit());
    }
    if (state.step === 'edit') {
      if (v === 'back') return interaction.update(backToPick());
      if (v === 'rename') { state.modal = 'rename'; return interaction.showModal(textModal(botId, uid, '✏️ Renommer', 'Nouveau nom', state.current, true, 100)); }
      if (v === 'emoji') { state.modal = 'emoji'; return interaction.showModal(textModal(botId, uid, '😀 Emoji', 'Emoji', '🤝', false, 10)); }
      if (v === 'desc') { state.modal = 'desc'; return interaction.showModal(textModal(botId, uid, '📝 Description du type', 'Description affichée sous le type', 'Ex : signale un abus du staff, en toute confidentialité', false, 100)); }
      if (v === 'questions') {
        state.step = 'questions';
        return interaction.update({ embeds: [typesQuestionsEmbed(state)], components: typesQuestionsComponents(state) });
      }
      if (v === 'category') {
        state.step = 'category';
        return interaction.update({
          embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('🗂️ Catégorie du type')
            .setDescription(`Choisis la catégorie pour **${state.current}** (ou écris-en une nouvelle).`)],
          components: typesCategoryComponents(state),
        });
      }
      if (v === 'addrole') {
        state.step = 'addrole';
        return interaction.update({ embeds: [typesAddRoleEmbed(state)], components: typesAddRoleComponents(state) });
      }
      if (v === 'removerole') {
        state.step = 'removerole';
        return interaction.update({ embeds: [typesRemoveRoleEmbed(state)], components: typesRemoveRoleComponents(state) });
      }
      if (v === 'delete') {
        state.step = 'confirmdelete';
        return interaction.update({
          embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('🗑 Supprimer ce type ?')
            .setDescription(`Le type **${state.current}** sera retiré du menu déroulant. Les tickets déjà ouverts ne sont pas affectés.`)],
          components: typesConfirmComponents(state),
        });
      }
    }
    if (state.step === 'category') {
      if (v === '__custom__') {
        state.modal = 'category';
        state.step = 'edit';
        return interaction.showModal(textModal(botId, uid, '➕ Nouvelle catégorie', 'Nom de la catégorie', 'Partenariats', true, 100));
      }
      updateType(botId, state.guildId, state.current, { category: v });
      return interaction.update(backToEdit());
    }
    // ❓ Questionnaire personnalisé : ajouter / retirer des questions obligatoires
    if (state.step === 'questions') {
      if (v === '__addq__') {
        state.modal = 'addquestion';
        return interaction.showModal(textModal(botId, uid, '➕ Question du questionnaire', 'La question (obligatoire)', 'Ex : Quel est ton âge ?', true, 45));
      }
      if (v === '__remq__') {
        state.step = 'removeq';
        return interaction.update({ embeds: [typesRemoveQuestionEmbed(state)], components: typesRemoveQuestionComponents(state) });
      }
      if (v === '__doneq__' || v === 'back') return interaction.update(backToEdit());
    }
    if (state.step === 'removeq') {
      const t = currentType(state);
      const qs = (t.questions || []).filter(Boolean);
      const questions = qs.filter((q) => q !== v);
      updateType(botId, state.guildId, state.current, { questions });
      state.step = 'questions';
      return interaction.update({ embeds: [typesQuestionsEmbed(state)], components: typesQuestionsComponents(state) });
    }
    return null;
  }

  // --- Sélecteur de rôle natif (étape « ajouter un rôle staff ») : répétable ---
  if (interaction.isRoleSelectMenu()) {
    const role = interaction.guild.roles.cache.get(interaction.values[0]);
    if (!role) return interaction.update({ embeds: [typesAddRoleEmbed(state)], components: typesAddRoleComponents(state) });
    const t = currentType(state);
    const roles = [...(t.staff_roles || [])];
    if (!roles.includes(role.name)) roles.push(role.name);
    updateType(botId, state.guildId, state.current, { staff_roles: roles });
    return interaction.update({ embeds: [typesAddRoleEmbed(state)], components: typesAddRoleComponents(state) });
  }

  // --- Boutons (terminer les rôles / retour / confirmation) ---
  if (interaction.isButton()) {
    const action = parts[3];
    if (action === 'doneroles') return interaction.update(backToEdit());
    if (action === 'back') {
      if (state.step === 'addrole' || state.step === 'removerole') return interaction.update(backToEdit());
      return interaction.update(backToPick());
    }
    if (action === 'confirmdel') {
      removeType(botId, state.guildId, state.current);
      state.step = 'pick'; state.current = null;
      return interaction.update(backToPick());
    }
    if (action === 'cancel') return interaction.update(backToEdit());
    return null;
  }

  // --- Modales (nom / renommage / emoji / catégorie) ---
  if (interaction.isModalSubmit()) {
    const val = (interaction.fields.getTextInputValue('value') || '').trim();
    const mode = state.modal;
    state.modal = null;
    if (mode === 'name') {
      if (!val) return interaction.reply({ content: '❌ Nom vide — annulé.', ephemeral: true });
      const existing = typesList(botId, state.guildId).find((t) => t.label.toLowerCase() === val.toLowerCase());
      if (existing) {
        state.current = existing.label;
        state.step = 'edit';
      } else {
        addType(botId, state.guildId, { label: val.slice(0, 100), emoji: '', category: '', staff_role: '' });
        state.current = val.slice(0, 100);
        state.step = 'edit';
      }
      try { await state.msg.edit(backToEdit()); } catch {}
      return interaction.reply({ content: `✅ Type « ${val} » prêt — choisis son emoji, sa catégorie et son rôle staff dans le menu.`, ephemeral: true });
    }
    if (mode === 'rename') {
      if (!val) return interaction.reply({ content: '❌ Nom vide — annulé.', ephemeral: true });
      updateType(botId, state.guildId, state.current, { label: val.slice(0,100) });
      state.current = val.slice(0, 100);
      try { await state.msg.edit(backToEdit()); } catch {}
      return interaction.reply({ content: '✅ Type renommé !', ephemeral: true });
    }
    if (mode === 'emoji') {
      if (val && !safeEmoji(val)) {
        state.modal = 'emoji';
        try { await state.msg.edit(backToEdit()); } catch {}
        return interaction.reply({ content: '❌ Emoji invalide — utilise un vrai emoji (ex : 🤝) ou un emoji personnalisé du serveur.', ephemeral: true });
      }
      updateType(botId, state.guildId, state.current, { emoji: val.slice(0, 100) });
      try { await state.msg.edit(backToEdit()); } catch {}
      return interaction.reply({ content: '✅ Emoji enregistré !', ephemeral: true });
    }
    if (mode === 'category') {
      updateType(botId, state.guildId, state.current, { category: val.slice(0, 100) });
      try { await state.msg.edit(backToEdit()); } catch {}
      return interaction.reply({ content: '✅ Catégorie enregistrée !', ephemeral: true });
    }
    if (mode === 'desc') {
      updateType(botId, state.guildId, state.current, { description: val.slice(0, 100) });
      try { await state.msg.edit(backToEdit()); } catch {}
      return interaction.reply({ content: '✅ Description enregistrée — elle apparaîtra sous le type dans le menu !', ephemeral: true });
    }
    if (mode === 'addquestion') {
      const t = currentType(state);
      const qs = (t.questions || []).filter(Boolean);
      if (qs.length >= 5) {
        state.step = 'questions';
        try { await state.msg.edit({ embeds: [typesQuestionsEmbed(state)], components: typesQuestionsComponents(state) }); } catch {}
        return interaction.reply({ content: '❌ Maximum 5 questions par type.', ephemeral: true });
      }
      if (!val) return interaction.reply({ content: '❌ Question vide — annulée.', ephemeral: true });
      qs.push(val.slice(0, 45));
      updateType(botId, state.guildId, state.current, { questions: qs });
      state.step = 'questions';
      try { await state.msg.edit({ embeds: [typesQuestionsEmbed(state)], components: typesQuestionsComponents(state) }); } catch {}
      return interaction.reply({ content: `✅ Question ajoutée (${qs.length}/5) — les membres devront y répondre obligatoirement à l'ouverture !`, ephemeral: true });
    }
    return interaction.reply({ content: '✅ Enregistré !', ephemeral: true });
  }

  return null;
}

// ============================================================
// Menus de rôles
// ============================================================
async function sendRoleMenu(botId, client, menu, channel) {
  if (!menu.options || !menu.options.length) throw new Error('Ce menu n\'a aucune option.');
  // 🔘 Mode boutons : un bouton par rôle (clic = activer/désactiver)
  if (menu.mode === 'buttons') {
    const rows = [];
    const opts = menu.options.slice(0, 25);
    for (let i = 0; i < opts.length; i += 5) {
      const row = new ActionRowBuilder();
      opts.slice(i, i + 5).forEach((o) => {
        const btn = new ButtonBuilder()
          .setCustomId(`bd-rmbtn:${botId}:${menu.id}:${String(o.role || '').slice(0, 80)}`)
          .setLabel(String(o.label || o.role || 'Rôle').slice(0, 80))
          .setStyle(ButtonStyle.Primary);
        if (o.emoji && /^\p{Extended_Pictographic}/u.test(String(o.emoji))) btn.setEmoji(String(o.emoji));
        row.addComponents(btn);
      });
      rows.push(row);
    }
    await channel.send({ content: menu.content || null, components: rows });
    return;
  }
  const row = new ActionRowBuilder();
  const select = new StringSelectMenuBuilder()
    .setCustomId(`bd-menu:${botId}:${menu.id}`)
    .setPlaceholder((menu.placeholder || 'Choisis tes rôles…').slice(0, 150))
    .setMinValues(0)
    .setMaxValues(Math.max(menu.options.length, 1));
  for (const o of menu.options) {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(String(o.label || 'Rôle').slice(0, 100))
      .setValue(String(o.role || '').slice(0, 100));
    if (o.emoji && /^\p{Extended_Pictographic}/u.test(String(o.emoji))) opt.setEmoji(String(o.emoji));
    select.addOptions(opt);
  }
  row.addComponents(select);
  await channel.send({ content: menu.content || null, components: [row] });
}

// 🔘 Mode boutons : un clic = activation/désactivation d'un seul rôle
async function handleRoleMenuButton(botId, interaction, menuId, roleRef) {
  const menu = store.roleMenus.get(menuId);
  if (!menu || menu.bot_id !== botId) return;
  const guild = interaction.guild;
  const member = interaction.member;
  const opt = menu.options.find((o) => String(o.role || '') === roleRef);
  if (!opt) return interaction.reply({ content: '❓ Ce rôle n\'existe plus dans ce menu.', ephemeral: true });
  const role = resolveRole(guild, opt.role);
  if (!role) return interaction.reply({ content: '❓ Le rôle est introuvable (renommé ou supprimé).', ephemeral: true });
  const has = member.roles.cache.has(role.id);
  try {
    if (has) {
      await member.roles.remove(role);
      return interaction.reply({ content: `➖ Rôle **${role.name}** retiré.`, ephemeral: true });
    }
    await member.roles.add(role);
    return interaction.reply({ content: `✅ Tu as reçu le rôle **${role.name}** !`, ephemeral: true });
  } catch {
    return interaction.reply({ content: '⚠️ Je n\'ai pas la permission de modifier ce rôle.', ephemeral: true });
  }
}

async function handleRoleMenu(botId, interaction, menuId) {
  const menu = store.roleMenus.get(menuId);
  if (!menu || menu.bot_id !== botId) return;
  const guild = interaction.guild;
  const member = interaction.member;
  const selected = new Set(interaction.values);
  let changed = false;
  for (const opt of menu.options) {
    const role = resolveRole(guild, opt.role);
    if (!role) continue;
    const shouldHave = selected.has(opt.role);
    const has = member.roles.cache.has(role.id);
    try {
      if (shouldHave && !has) { await member.roles.add(role); changed = true; }
      else if (!shouldHave && has) { await member.roles.remove(role); changed = true; }
    } catch {}
  }
  await interaction.reply({
    content: changed ? '✅ Tes rôles ont été mis à jour !' : '👍 Aucun changement.',
    ephemeral: true,
  });
}

module.exports = {
  dispatchPanels, sendTicketPanel, sendRoleMenu, findChannel, findChannelInGuild, bumpTicketStats,
  resolveRole, parseTypes, isStaff, staffForTicket, openTicket, safeEmoji,
  startTypesWizard, handleTypesWizardInteraction,
  handleTicketDeleteAsk, ticketMetaFor, ticketWelcomeEmbed, typeOptionDescription, normalizeTypes,
};
