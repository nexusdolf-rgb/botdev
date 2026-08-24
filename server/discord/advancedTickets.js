// ============================================================
// Hoxera — 🎨 Système de tickets personnalisés (v3.14)
// Système INDÉPENDANT de l'ancien module tickets :
// - panneau en boutons simples OU menu déroulant ;
// - plusieurs types ;
// - couleur par type dans l'embed du ticket ;
// - panneau précédent de CE système remplacé, jamais l'ancien ;
// - ouverture réutilisant la sécurité/transcription des tickets existants.
// ============================================================
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder,
} = require('discord.js');
const store = require('../db');

const DEFAULT_COLOR = '#5865F2';
const BUTTON_STYLES = {
  '1': ButtonStyle.Primary,
  '2': ButtonStyle.Secondary,
  '3': ButtonStyle.Success,
  '4': ButtonStyle.Danger,
};
const COLOR_SYMBOLS = { '1': '🔵', '2': '⚪', '3': '🟢', '4': '🔴' };

function validColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : DEFAULT_COLOR;
}

function safeId(value, fallback) {
  const id = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return id || fallback;
}

function normalizeType(raw = {}, index = 0) {
  const roles = Array.isArray(raw.staff_roles)
    ? raw.staff_roles.map((r) => String(r).trim()).filter(Boolean).slice(0, 10)
    : (raw.staff_role ? [String(raw.staff_role).trim()] : []);
  return {
    id: safeId(raw.id, `t${index + 1}`),
    label: String(raw.label || '').trim().slice(0, 80),
    emoji: String(raw.emoji || '').trim().slice(0, 100),
    description: String(raw.description || '').trim().slice(0, 100),
    category: String(raw.category || '').trim().slice(0, 100),
    color: validColor(raw.color),
    button_style: ['1', '2', '3', '4'].includes(String(raw.button_style)) ? String(raw.button_style) : '1',
    staff_roles: roles,
  };
}

function normalizeConfig(row = {}) {
  let types = row.types;
  if (typeof types === 'string') {
    try { types = JSON.parse(types || '[]'); } catch { types = []; }
  }
  return {
    ...row,
    mode: row.mode === 'menu' ? 'menu' : 'buttons',
    name: String(row.name || 'Tickets personnalisés').slice(0, 80),
    channel: String(row.channel || '').slice(0, 100),
    message: String(row.message || '').slice(0, 1900),
    require_reason: (row.require_reason === 0 || row.require_reason === false) ? 0 : 1,
    types: (Array.isArray(types) ? types : []).map((t, i) => normalizeType(t, i)).filter((t) => t.label).slice(0, 25),
  };
}

function getConfig(botId, guildId) {
  const row = store.advancedTickets.get(botId, guildId);
  return row ? normalizeConfig(row) : null;
}

function typeById(config, typeId) {
  return config && config.types ? config.types.find((t) => t.id === String(typeId)) : null;
}

function colorSymbol(type) {
  return COLOR_SYMBOLS[type.button_style] || '🔵';
}

function descriptionFor(type) {
  return type.description || `Ouvrir un ticket « ${type.label} » en privé.`;
}

function buildPanelPayload(config) {
  const cfg = normalizeConfig(config);
  if (!cfg.id) throw new Error('Le panneau personnalisé n\'est pas encore enregistré.');
  if (!cfg.types.length) throw new Error('Ajoute au moins un type de ticket personnalisé.');

  const lines = cfg.types.map((type) => `${colorSymbol(type)} ${type.emoji || '🎫'} **${type.label}** — ${descriptionFor(type)}`).join('\n');
  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle(`🎨 ${cfg.name}`)
    .setDescription(cfg.message || 'Choisis le type de ticket qui correspond à ta demande :')
    .addFields({ name: '🗂️ Types disponibles', value: lines.slice(0, 1024) })
    .setFooter({ text: 'Hoxera · système de tickets personnalisés' })
    .setTimestamp();

  const rows = [];
  if (cfg.mode === 'menu') {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`hx2-menu:${cfg.bot_id}:${cfg.id}`)
      .setPlaceholder('🗂️ Choisis un type de ticket…')
      .setMinValues(1)
      .setMaxValues(1);
    for (const type of cfg.types) {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`${colorSymbol(type)} ${type.label}`.slice(0, 100))
        .setDescription(descriptionFor(type).slice(0, 100))
        .setValue(type.id);
      // Le vrai emoji du type reste prioritaire ; le symbole de couleur est
      // déjà présent dans le label afin de rester visible dans un menu Discord.
      const panels = require('./panels');
      const emoji = panels.safeEmoji(type.emoji);
      if (emoji) option.setEmoji(emoji);
      select.addOptions(option);
    }
    rows.push(new ActionRowBuilder().addComponents(select));
  } else {
    // Discord limite une rangée à 5 boutons : jusqu'à 25 types, 5 rangées.
    for (let i = 0; i < cfg.types.length; i += 5) {
      const row = new ActionRowBuilder();
      for (const type of cfg.types.slice(i, i + 5)) {
        const button = new ButtonBuilder()
          .setCustomId(`hx2-btn:${cfg.bot_id}:${cfg.id}:${type.id}`)
          .setLabel(`${type.emoji ? type.emoji + ' ' : ''}${type.label}`.slice(0, 80))
          .setStyle(BUTTON_STYLES[type.button_style] || ButtonStyle.Primary);
        row.addComponents(button);
      }
      rows.push(row);
    }
  }
  return { embeds: [embed], components: rows };
}

async function deletePreviousPanel(guild, config) {
  if (!guild || !config || !config.panel_message_id || !config.panel_channel) return;
  const channel = guild.channels.cache.get(String(config.panel_channel));
  if (!channel || !channel.messages || typeof channel.messages.fetch !== 'function') return;
  const message = await channel.messages.fetch(String(config.panel_message_id)).catch(() => null);
  if (message && typeof message.delete === 'function') await message.delete().catch(() => {});
}

async function sendPanel(botId, guildId, client) {
  const stored = getConfig(botId, guildId);
  if (!stored) throw new Error('Configure d\'abord le nouveau système de tickets personnalisés.');
  if (!stored.channel) throw new Error('Choisis le salon du nouveau panneau.');
  if (!stored.types.length) throw new Error('Ajoute au moins un type de ticket personnalisé.');
  const guild = client && client.guilds && client.guilds.cache.get(String(guildId));
  if (!guild) throw new Error('Le bot n\'est pas présent sur ce serveur.');
  const panels = require('./panels');
  const channel = panels.findChannelInGuild(guild, stored.channel);
  if (!channel || typeof channel.send !== 'function') throw new Error('Salon du nouveau panneau introuvable ou non envoyable.');

  const payload = buildPanelPayload(stored);
  // Envoie d'abord le nouveau panneau : si Discord refuse, l'ancien reste
  // intact. On ne supprime que le précédent panneau de ce système.
  const sent = await channel.send(payload);
  await deletePreviousPanel(guild, stored);
  store.advancedTickets.setPanelMessage(botId, guildId, sent.id, channel.id);
  return sent;
}

function advancedConfigForOpen(config, type) {
  return {
    // Ces propriétés sont lues par panels.openTicket ; aucune écriture dans
    // la table historique `tickets` n'est faite.
    category: type.category || '',
    support_role: '',
    menu_category: '',
    require_reason: config.require_reason,
    types: [],
    advanced_panel_id: config.id,
    advanced_type_id: type.id,
  };
}

function reasonModal(botId, panelId, type) {
  return new ModalBuilder()
    .setCustomId(`hx2-reason:${botId}:${panelId}:${type.id}`)
    .setTitle(`📝 ${type.label}`.slice(0, 45))
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Pourquoi ouvres-tu ce ticket ?')
        .setPlaceholder('Explique brièvement ta demande…')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000),
    ));
}

async function openForType(botId, interaction, config, type, reason = '') {
  const panels = require('./panels');
  try {
    if (!interaction.deferred && !interaction.replied && typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch {}
  await panels.openTicket(botId, interaction, type, reason, [], advancedConfigForOpen(config, type));
}

async function startTypeInteraction(botId, interaction, panelId, typeId) {
  const guild = interaction.guild;
  const config = guild ? getConfig(botId, guild.id) : null;
  if (!config || Number(config.id) !== Number(panelId)) {
    await interaction.reply({ content: '⚠️ Ce panneau de tickets n\'est plus à jour. Demande au staff de le renvoyer.', ephemeral: true }).catch(() => {});
    return;
  }
  const type = typeById(config, typeId);
  if (!type) {
    await interaction.reply({ content: '⚠️ Ce type de ticket n\'existe plus. Le panneau doit être renvoyé.', ephemeral: true }).catch(() => {});
    return;
  }
  if (config.require_reason) {
    await interaction.showModal(reasonModal(botId, config.id, type));
  } else {
    await openForType(botId, interaction, config, type);
  }
}

async function handleReasonSubmit(botId, interaction, panelId, typeId) {
  const guild = interaction.guild;
  const config = guild ? getConfig(botId, guild.id) : null;
  const type = config && Number(config.id) === Number(panelId) ? typeById(config, typeId) : null;
  if (!config || !type) {
    await interaction.reply({ content: '⚠️ Ce type de ticket n\'est plus disponible.', ephemeral: true }).catch(() => {});
    return;
  }
  const reason = interaction.fields && typeof interaction.fields.getTextInputValue === 'function'
    ? String(interaction.fields.getTextInputValue('reason') || '').trim()
    : '';
  await openForType(botId, interaction, config, type, reason);
}

// Retourne true uniquement pour les interactions du nouveau panneau.
async function handleInteraction(botId, interaction) {
  const cid = String(interaction && interaction.customId || '');
  const isButton = interaction && typeof interaction.isButton === 'function' && interaction.isButton();
  const isSelect = interaction && typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu();
  const isModal = interaction && typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit();
  const prefix = `hx2-`;
  if (!cid.startsWith(prefix)) return false;

  const parts = cid.split(':');
  if (isModal && parts[0] === 'hx2-reason' && parts[1] === String(botId)) {
    await handleReasonSubmit(botId, interaction, Number(parts[2]), parts.slice(3).join(':'));
    return true;
  }
  if (isButton && parts[0] === 'hx2-btn' && parts[1] === String(botId)) {
    await startTypeInteraction(botId, interaction, Number(parts[2]), parts.slice(3).join(':'));
    return true;
  }
  if (isSelect && parts[0] === 'hx2-menu' && parts[1] === String(botId)) {
    await startTypeInteraction(botId, interaction, Number(parts[2]), interaction.values && interaction.values[0]);
    return true;
  }
  return true; // préfixe réservé : aucune autre couche ne doit le traiter.
}

module.exports = {
  normalizeType,
  normalizeConfig,
  buildPanelPayload,
  sendPanel,
  handleInteraction,
  advancedConfigForOpen,
};
