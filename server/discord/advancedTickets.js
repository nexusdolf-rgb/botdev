// ============================================================
// Hoxera — 🎨 Système de tickets personnalisés (v3.16)
// Système INDÉPENDANT de l'ancien module tickets :
// - panneau en boutons simples OU menu déroulant ;
// - affichage vertical professionnel façon panneau Discord ;
// - plusieurs types ;
// - couleur par type dans l'embed du ticket ;
// - panneau précédent de CE système remplacé, jamais l'ancien ;
// - ouverture réutilisant la sécurité/transcription des tickets existants.
// ============================================================
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ContainerBuilder, TextDisplayBuilder, SectionBuilder,
  SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js');
const store = require('../db');
const ui = require('./ui');

const DEFAULT_COLOR = '#e07a5f';
const DEFAULT_IMAGE = 'https://hoxera.is-a.dev/icons/support-banner.png';
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

function colorInt(value) {
  return parseInt(validColor(value).slice(1), 16);
}

function safeId(value, fallback) {
  const id = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return id || fallback;
}

function safeImage(value) {
  const image = String(value || '').trim().slice(0, 500);
  return /^https:\/\//i.test(image) ? image : '';
}

function normalizeType(raw = {}, index = 0) {
  const roles = Array.isArray(raw.staff_roles)
    ? raw.staff_roles.map((r) => String(r).trim()).filter(Boolean).slice(0, 10)
    : (raw.staff_role ? [String(raw.staff_role).trim()] : []);
  return {
    id: safeId(raw.id, `t${index + 1}`),
    label: String(raw.label || '').trim().slice(0, 80),
    button_label: String(raw.button_label || '').trim().slice(0, 80),
    emoji: String(raw.emoji || '').trim().slice(0, 100),
    description: String(raw.description || '').trim().slice(0, 100),
    questions: Array.isArray(raw.questions)
      ? raw.questions.map((q) => String(q).trim().slice(0, 45)).filter(Boolean).slice(0, 5)
      : [],
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
    name: String(row.name || 'Créer un ticket').slice(0, 80),
    channel: String(row.channel || '').slice(0, 100),
    message: String(row.message || '').slice(0, 1900),
    image_url: safeImage(row.image_url || DEFAULT_IMAGE),
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

function buttonLabelFor(type) {
  return type.button_label || `Envoyer un ticket ${type.label.toLowerCase()}`;
}

function buildPanelPayload(config) {
  const cfg = normalizeConfig(config);
  if (!cfg.id) throw new Error('Le panneau personnalisé n\'est pas encore enregistré.');
  if (!cfg.types.length) throw new Error('Ajoute au moins un type de ticket personnalisé.');

  // Components V2 permet de placer chaque bouton à droite de son type,
  // comme dans le modèle visuel fourni : description puis bouton, verticalement.
  const container = new ContainerBuilder()
    .setAccentColor(colorInt(cfg.types[0].color));
  if (cfg.image_url) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.image_url))
    );
  }
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${cfg.name}`))
    // Contenu libre du serveur : structuré en sections comme partout (v220).
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(ui.sectionize(cfg.message || 'Choisis le type de ticket qui correspond à ta demande :', 1900)))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  if (cfg.mode === 'menu') {
    // En mode menu, les descriptions restent visibles dans le panneau et le
    // sélecteur unique se trouve à la fin du conteneur. Chaque type devient
    // une section séparée par le long trait (v220), comme dans les embeds.
    const typeSections = ui.sectionize(
      cfg.types.map((type) => `${colorSymbol(type)} ${type.emoji || '🎫'} **${type.label}**\n${descriptionFor(type)}`).join('\n\n'),
      3900,
    );
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(typeSections));
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
      const panels = require('./panels');
      const emoji = panels.safeEmoji(type.emoji);
      if (emoji) option.setEmoji(emoji);
      select.addOptions(option);
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  } else {
    for (const type of cfg.types) {
      const button = new ButtonBuilder()
        .setCustomId(`hx2-btn:${cfg.bot_id}:${cfg.id}:${type.id}`)
        .setLabel(buttonLabelFor(type).slice(0, 80))
        .setStyle(BUTTON_STYLES[type.button_style] || ButtonStyle.Primary);
      const panels = require('./panels');
      const emoji = panels.safeEmoji(type.emoji);
      if (emoji) button.setEmoji(emoji);
      const questionHint = type.questions && type.questions.length ? ` · ❓ ${type.questions.length} question(s)` : '';
      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `### ${type.emoji || '🎫'} ${type.label}\n${colorSymbol(type)} ${descriptionFor(type)}${questionHint}`
        ))
        .setButtonAccessory(button);
      container.addSectionComponents(section);
    }
  }
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Hoxera · Support privé · Choisis une option pour commencer'));
  return { flags: MessageFlags.IsComponentsV2, components: [container] };
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

function advancedConfigForOpen(config, type, interaction = null) {
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
    // Le salon réellement cliqué est transmis explicitement : le placement
    // ne dépend plus d'une déduction fragile lors de l'ouverture.
    // Dès qu'une catégorie est choisie, le nouveau système l'exige : aucune
    // création ni repli silencieux vers la catégorie du panneau.
    category_required: true,
    panel_channel_id: interaction && interaction.channel ? interaction.channel.id : (config.panel_channel || ''),
  };
}

// Discord limite une modale à cinq champs. Comme dans l'ancien système,
// les questions du type et la raison générale sont donc réunies dans une
// seule fenêtre lorsque cela tient (maximum quatre questions + la raison).
const ADVANCED_MODAL_TTL = 10 * 60000;
const pendingReasons = new Map();
const pendingQuestionnaires = new Map();
const pendingCombined = new Map();

function pendingKey(botId, guildId, userId) {
  return `${botId}:${guildId}:${userId}`;
}

function questionsFor(type) {
  return type && Array.isArray(type.questions)
    ? type.questions.map((q) => String(q).trim().slice(0, 45)).filter(Boolean).slice(0, 5)
    : [];
}

function wantsReason(config) {
  return !(config.require_reason === 0 || config.require_reason === false);
}

function fieldValue(interaction, customId) {
  try {
    return interaction.fields && typeof interaction.fields.getTextInputValue === 'function'
      ? String(interaction.fields.getTextInputValue(customId) || '').trim()
      : '';
  } catch {
    return '';
  }
}

function expiredReply(interaction) {
  return interaction.reply({ content: '⏰ Ta demande a expiré, réessaie depuis le panneau.', ephemeral: true }).catch(() => {});
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

function questionnaireModal(botId, panelId, type, questions) {
  const modal = new ModalBuilder()
    .setCustomId(`hx2-tquest:${botId}:${panelId}:${type.id}`)
    .setTitle(`📝 ${type.label} — questionnaire`.slice(0, 45));
  questions.forEach((question, index) => {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(`q${index}`)
        .setLabel(question)
        .setPlaceholder('Écris ta réponse…')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500),
    ));
  });
  return modal;
}

function combinedModal(botId, panelId, type, questions) {
  const modal = new ModalBuilder()
    .setCustomId(`hx2-tcomb:${botId}:${panelId}:${type.id}`)
    .setTitle(`📝 ${type.label} — ouverture`.slice(0, 45));
  questions.forEach((question, index) => {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(`q${index}`)
        .setLabel(question)
        .setPlaceholder('Écris ta réponse…')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500),
    ));
  });
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('📝 Pourquoi ouvres-tu ce ticket ?')
      .setPlaceholder('Explique brièvement ta demande…')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000),
  ));
  return modal;
}

async function openForType(botId, interaction, config, type, reason = '', answers = []) {
  const panels = require('./panels');
  try {
    if (!interaction.deferred && !interaction.replied && typeof interaction.deferReply === 'function') {
      await interaction.deferReply({ ephemeral: true });
    }
  } catch {}
  await panels.openTicket(botId, interaction, type, reason, answers, advancedConfigForOpen(config, type, interaction));
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

  const questions = questionsFor(type);
  const key = pendingKey(botId, guild.id, interaction.user.id);
  const reason = wantsReason(config);
  // Une modale unique : questions du type + raison générale, comme dans
  // l'ancien système. C'est important : Discord interdit modale → modale.
  if (questions.length && reason && questions.length < 5) {
    pendingCombined.set(key, { botId, guildId: guild.id, panelId, type, questions, ts: Date.now() });
    return interaction.showModal(combinedModal(botId, panelId, type, questions));
  }
  if (questions.length) {
    // Cinq questions remplissent déjà la limite Discord : la raison générale
    // n'est pas ajoutée dans ce cas, exactement comme l'ancien système.
    pendingQuestionnaires.set(key, { botId, guildId: guild.id, panelId, type, questions, ts: Date.now() });
    return interaction.showModal(questionnaireModal(botId, panelId, type, questions));
  }
  if (reason) {
    pendingReasons.set(key, { botId, guildId: guild.id, panelId, type, ts: Date.now() });
    return interaction.showModal(reasonModal(botId, panelId, type));
  }
  return openForType(botId, interaction, config, type);
}

function currentAdvancedType(botId, interaction, panelId, typeId) {
  const guild = interaction.guild;
  const config = guild ? getConfig(botId, guild.id) : null;
  const type = config && Number(config.id) === Number(panelId) ? typeById(config, typeId) : null;
  return { config, type };
}

async function handleCombinedSubmit(botId, interaction, panelId, typeId) {
  const guildId = interaction.guild && interaction.guild.id;
  const key = pendingKey(botId, guildId, interaction.user.id);
  const pending = pendingCombined.get(key);
  pendingCombined.delete(key);
  if (!pending || Date.now() - (pending.ts || 0) > ADVANCED_MODAL_TTL) return expiredReply(interaction);
  const { config, type } = currentAdvancedType(botId, interaction, panelId, typeId);
  if (!config || !type) {
    await interaction.reply({ content: '⚠️ Ce type de ticket n\'est plus disponible.', ephemeral: true }).catch(() => {});
    return;
  }
  const answers = pending.questions.map((question, index) => ({
    q: String(question).slice(0, 45),
    a: fieldValue(interaction, `q${index}`).slice(0, 500) || '—',
  }));
  const reason = fieldValue(interaction, 'reason').slice(0, 1000);
  await openForType(botId, interaction, config, type, reason, answers);
}

async function handleQuestionnaireSubmit(botId, interaction, panelId, typeId) {
  const guildId = interaction.guild && interaction.guild.id;
  const key = pendingKey(botId, guildId, interaction.user.id);
  const pending = pendingQuestionnaires.get(key);
  pendingQuestionnaires.delete(key);
  if (!pending || Date.now() - (pending.ts || 0) > ADVANCED_MODAL_TTL) return expiredReply(interaction);
  const { config, type } = currentAdvancedType(botId, interaction, panelId, typeId);
  if (!config || !type) {
    await interaction.reply({ content: '⚠️ Ce type de ticket n\'est plus disponible.', ephemeral: true }).catch(() => {});
    return;
  }
  const answers = pending.questions.map((question, index) => ({
    q: String(question).slice(0, 45),
    a: fieldValue(interaction, `q${index}`).slice(0, 500) || '—',
  }));
  await openForType(botId, interaction, config, type, '', answers);
}

async function handleReasonSubmit(botId, interaction, panelId, typeId) {
  const guild = interaction.guild;
  const config = guild ? getConfig(botId, guild.id) : null;
  const type = config && Number(config.id) === Number(panelId) ? typeById(config, typeId) : null;
  const key = guild ? pendingKey(botId, guild.id, interaction.user.id) : '';
  const pending = key ? pendingReasons.get(key) : null;
  if (pending) {
    pendingReasons.delete(key);
    if (Date.now() - (pending.ts || 0) > ADVANCED_MODAL_TTL) return expiredReply(interaction);
  }
  if (!config || !type) {
    await interaction.reply({ content: '⚠️ Ce type de ticket n\'est plus disponible.', ephemeral: true }).catch(() => {});
    return;
  }
  const reason = fieldValue(interaction, 'reason').slice(0, 1000);
  await openForType(botId, interaction, config, type, reason);
}

// Retourne true uniquement pour les interactions du nouveau panneau.
async function handleInteraction(botId, interaction) {
  const cid = String(interaction && interaction.customId || '');
  const isButton = interaction && typeof interaction.isButton === 'function' && interaction.isButton();
  const isSelect = interaction && typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu();
  const isModal = interaction && typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit();
  if (!cid.startsWith('hx2-')) return false;

  const parts = cid.split(':');
  if (isModal && parts[1] === String(botId) && ['hx2-tcomb', 'hx2-tquest'].includes(parts[0])) {
    const panelId = Number(parts[2]);
    const typeId = parts.slice(3).join(':');
    if (parts[0] === 'hx2-tcomb') await handleCombinedSubmit(botId, interaction, panelId, typeId);
    else await handleQuestionnaireSubmit(botId, interaction, panelId, typeId);
    return true;
  }
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
