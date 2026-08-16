// ============================================================
// BotDev - Panneaux : tickets + menus de rôles (boutons & menus déroulants)
// ============================================================
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelType, PermissionFlagsBits,
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

// Recherche dans UN SEUL serveur (config par serveur)
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

// ---------------------- Dispatch des interactions panneaux ----------------------
// Retourne true si l'interaction a été traitée ici.
async function dispatchPanels(botId, interaction) {
  try {
    if (interaction.isChatInputCommand() && ['ticket', 'roles'].includes(interaction.commandName)) {
      const { handlePanelCommand } = require('./panelCommands');
      await handlePanelCommand(botId, interaction);
      return true;
    }
    // Assistant interactif /ticket setup (boutons + modales + menus de sélection)
    const cid = String(interaction.customId || '');
    if ((interaction.isButton() && cid.startsWith('bdw:'))
      || (interaction.isModalSubmit() && cid.startsWith('bdw-modal:'))
      || ((interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) && cid.startsWith('bdw-sel:'))) {
      const { handleWizardInteraction } = require('./panelCommands');
      await handleWizardInteraction(botId, interaction);
      return true;
    }
    if (interaction.isButton()) {
      const id = interaction.customId || '';
      if (id === `bd-ticket:${botId}`) { await handleTicketButton(botId, interaction); return true; }
      if (id === `bd-tmenu:${botId}:close`) { await handleTicketClose(botId, interaction); return true; }
      return false;
    }
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId || '';
      if (id.startsWith(`bd-menu:${botId}:`)) {
        await handleRoleMenu(botId, interaction, parseInt(id.split(':')[2], 10));
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

// ---------------------- Tickets ----------------------
async function sendTicketPanel(botId, guildId, client, channel) {
  const cfg = store.tickets.get(botId, guildId);
  if (!cfg) throw new Error('Configuration des tickets introuvable');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bd-ticket:${botId}`)
      .setLabel(cfg.button_label || '🎫 Ouvrir un ticket')
      .setStyle(ButtonStyle.Primary)
  );
  await channel.send({ content: cfg.message || null, components: [row] });
}

async function handleTicketButton(botId, interaction) {
  const guild = interaction.guild;
  const cfg = store.tickets.get(botId, guild.id);
  if (!cfg) return interaction.reply({ content: '⚠️ Les tickets ne sont pas configurés.', ephemeral: true });
  const member = interaction.member;
  const uname = (member.user.username || 'membre').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'membre';

  // Un seul ticket ouvert par membre
  const existing = guild.channels.cache.find(c => c.name === `ticket-${uname}`);
  if (existing) {
    return interaction.reply({ content: `Tu as déjà un ticket ouvert : ${existing}`, ephemeral: true });
  }

  const support = resolveRole(guild, cfg.support_role);
  let parent = null;
  if (cfg.category) {
    const catName = String(cfg.category).toLowerCase();
    parent = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catName);
    if (!parent) {
      try { parent = await guild.channels.create({ name: cfg.category, type: ChannelType.GuildCategory }); } catch {}
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
      name: `ticket-${uname}`,
      type: ChannelType.GuildText,
      parent: parent ? parent.id : null,
      permissionOverwrites: perms,
      topic: `Ticket de ${member.user.tag}`,
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
  await channel.send({
    content: `${member}${support ? ' ' + support.toString() : ''}\nBienvenue dans ton ticket ! Explique ta demande, l'équipe te répondra ici.`,
    components: [row],
  }).catch(() => {});

  await interaction.reply({ content: `✅ Ton ticket a été créé : ${channel}`, ephemeral: true });
}

async function handleTicketClose(botId, interaction) {
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

module.exports = { dispatchPanels, sendTicketPanel, sendRoleMenu, findChannel, findChannelInGuild, resolveRole };
