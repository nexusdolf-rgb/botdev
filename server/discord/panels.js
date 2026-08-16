// ============================================================
// BotDev - Panneaux : tickets (avec TYPES de tickets en menu déroulant)
//                    + menus de rôles
// Seul le staff (rôle support ou Gérer le serveur) peut fermer les tickets.
// ============================================================
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const store = require('../db');

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

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16) || 'ticket';
}

// ---------------------- Dispatch des interactions panneaux ----------------------
async function dispatchPanels(botId, interaction) {
  try {
    if (interaction.isChatInputCommand() && ['ticket', 'roles'].includes(interaction.commandName)) {
      const { handlePanelCommand } = require('./panelCommands');
      await handlePanelCommand(botId, interaction);
      return true;
    }
    const cid = String(interaction.customId || '');
    // Assistant interactif /ticket setup (boutons + modales + menus de sélection)
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
    if (interaction.isButton()) {
      if (cid === `bd-ticket:${botId}`) { await handleTicketButton(botId, interaction); return true; }
      if (cid === `bd-tmenu:${botId}:close`) { await handleTicketClose(botId, interaction); return true; }
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

// ---------------------- Tickets (avec types) ----------------------
const LEGACY_DEFAULT_MESSAGE = '🎫 Besoin d\'aide ? Clique sur le bouton pour ouvrir un ticket !';

function parseTypes(cfg) {
  try {
    const t = Array.isArray(cfg.types) ? cfg.types : JSON.parse(cfg.types || '[]');
    return Array.isArray(t) ? t.filter((x) => x && x.label) : [];
  } catch { return []; }
}

function isDefaultMessage(msg) {
  const s = String(msg || '').trim();
  if (!s) return true;
  return s === LEGACY_DEFAULT_MESSAGE;
}

function defaultPanelDescription(buttonLabel) {
  return [
    'Bienvenue dans notre **centre d\'assistance** 👋',
    '',
    'Tu as une question, un problème ou une suggestion ? Ouvre un **ticket privé** et notre équipe te répondra aussi vite que possible.',
    '',
    '**Comment ça marche ?**',
    `1️⃣  Choisis un **type de ticket** ci-dessous (ou clique sur **${buttonLabel}**)`,
    '2️⃣  Décris ta demande dans le salon privé qui s\'ouvre automatiquement',
    '3️⃣  Notre équipe te répond — c\'est tout !',
  ].join('\n');
}

function buildTicketPanelEmbed(cfg, client, types) {
  const desc = isDefaultMessage(cfg.message)
    ? defaultPanelDescription(cfg.button_label || '🎫 Ouvrir un ticket')
    : String(cfg.message);
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎫 Centre d\'assistance')
    .setDescription(desc)
    .addFields(
      { name: '🕐 Réponse rapide', value: 'Ton ticket est créé **instantanément** dans un salon privé.', inline: true },
      { name: '🔒 100 % privé', value: 'Seuls **toi et le staff** voient la conversation.', inline: true },
      { name: '📩 Suivi facile', value: 'Le staff ferme ton ticket en un clic quand tout est réglé.', inline: true },
    );
  if (types.length) {
    embed.addFields({
      name: '🗂️ Types de tickets',
      value: types.map((t) => `${t.emoji || '🎫'} **${t.label}**${t.category ? ` → catégorie « ${t.category} »` : ''}`).join('\n').slice(0, 1024),
    });
  }
  if (client && client.user) {
    try { embed.setThumbnail(client.user.displayAvatarURL({ dynamic: true })); } catch {}
  }
  const site = store.settings.get('public_url');
  if (site) embed.setFooter({ text: `Propulsé par BotDev · ${site}` });
  return embed;
}

async function sendTicketPanel(botId, guildId, client, channel) {
  const cfg = store.tickets.get(botId, guildId);
  if (!cfg) throw new Error('Configuration des tickets introuvable');
  const types = parseTypes(cfg);
  const rows = [];
  if (types.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`bd-ttype:${botId}`)
      .setPlaceholder('🗂️ Choisis le type de ticket…')
      .setMinValues(1).setMaxValues(1);
    for (const t of types.slice(0, 25)) {
      const opt = new StringSelectMenuOptionBuilder()
        .setLabel(String(t.label).slice(0, 100))
        .setValue(String(t.label).slice(0, 100));
      if (t.emoji && /^\p{Extended_Pictographic}/u.test(String(t.emoji))) opt.setEmoji(String(t.emoji));
      select.addOptions(opt);
    }
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bd-ticket:${botId}`)
      .setLabel(cfg.button_label || '🎫 Ouvrir un ticket')
      .setStyle(ButtonStyle.Primary)
  ));
  await channel.send({ embeds: [buildTicketPanelEmbed(cfg, client, types)], components: rows });
}

// Le membre est-il staff de ce serveur ? (rôle support OU Gérer le serveur)
function isStaff(botId, interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return false;
  try {
    if (guild.ownerId === interaction.user.id) return true;
    if (member.permissions && typeof member.permissions.has === 'function'
      && member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  } catch {}
  const cfg = store.tickets.get(botId, guild.id) || {};
  if (cfg.support_role) {
    const role = resolveRole(guild, cfg.support_role);
    if (role && member.roles && member.roles.cache && member.roles.cache.has(role.id)) return true;
  }
  return false;
}

// Crée le salon du ticket (éventuellement selon un type)
async function openTicket(botId, interaction, type) {
  const guild = interaction.guild;
  const member = interaction.member;
  const cfg = store.tickets.get(botId, guild.id);
  if (!cfg) return interaction.reply({ content: '⚠️ Les tickets ne sont pas configurés.', ephemeral: true });

  const types = parseTypes(cfg);
  const chosen = type || types[0] || null;
  const prefix = chosen ? slugify(chosen.label) : 'ticket';
  const uname = slugify(member.user.username);
  const channelName = `${prefix}-${uname}`.slice(0, 32);

  const existing = guild.channels.cache.find((c) => c.name === channelName);
  if (existing) {
    return interaction.reply({ content: `Tu as déjà un ticket ouvert : ${existing}`, ephemeral: true });
  }

  const support = resolveRole(guild, cfg.support_role);
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
  if (support) perms.push({ id: support.id, allow });

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parent ? parent.id : null,
      permissionOverwrites: perms,
      topic: `Ticket de ${member.user.tag}${chosen ? ` — type : ${chosen.label}` : ''}`,
    });
  } catch (e) {
    return interaction.reply({ content: '⚠️ Je n\'ai pas pu créer le salon. Vérifie mes permissions (gérer les salons).', ephemeral: true });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bd-tmenu:${botId}:close`)
      .setLabel('🔒 Fermer le ticket')
      .setStyle(ButtonStyle.Danger)
  );
  const welcome = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('🎫 Ticket ouvert !')
    .setDescription([
      `Bienvenue ${member} 👋`,
      '',
      chosen ? `🗂️ **Type** : ${chosen.emoji || ''} ${chosen.label}` : null,
      'Explique ta demande en détail (tu peux joindre des captures d\'écran ou des fichiers). Notre équipe te répondra ici **au plus vite**.',
      '',
      '🔒 Seul le **staff** peut fermer ce ticket.',
    ].filter(Boolean).join('\n'));
  const site = store.settings.get('public_url');
  if (site) welcome.setFooter({ text: `BotDev · ${site}` });
  await channel.send({
    content: `${member}${support ? ' · ' + support.toString() : ''}`,
    embeds: [welcome],
    components: [row],
  }).catch(() => {});

  await interaction.reply({ content: `✅ Ton ticket a été créé : ${channel}`, ephemeral: true });
}

async function handleTicketButton(botId, interaction) {
  await openTicket(botId, interaction, null);
}

async function handleTicketTypeSelect(botId, interaction) {
  const cfg = store.tickets.get(botId, interaction.guild.id) || {};
  const label = interaction.values[0];
  const type = parseTypes(cfg).find((t) => t.label === label) || { label };
  await openTicket(botId, interaction, type);
}

async function handleTicketClose(botId, interaction) {
  if (!isStaff(botId, interaction)) {
    return interaction.reply({ content: '🔒 Seul le **staff** peut fermer ce ticket.', ephemeral: true });
  }
  const channel = interaction.channel;
  await interaction.reply({ content: '🔒 Fermeture du ticket…', ephemeral: true }).catch(() => {});
  setTimeout(() => { channel.delete().catch(() => {}); }, 3000);
}

// ---------------------- Menus de rôles ----------------------
async function sendRoleMenu(botId, client, menu, channel) {
  if (!menu.options || !menu.options.length) throw new Error('Ce menu n\'a aucune option.');
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

module.exports = { dispatchPanels, sendTicketPanel, sendRoleMenu, findChannel, findChannelInGuild, resolveRole, parseTypes, isStaff, openTicket };
