// ============================================================
// BotDev - Commandes Discord de gestion des panneaux (façon Ticket Tool)
//   /ticket setup → assistant interactif avec MENUS DE SÉLECTION
//   (nom → catégorie → salon → rôle staff) — on ne tape rien,
//   on sélectionne dans les menus déroulants, puis « Suivant ».
//   /roles ...    → menus de rôles
// Réservées au propriétaire du serveur (tickets) / propriétaire ou admins (rôles)
// ============================================================
const {
  EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const store = require('../db');
const { sendTicketPanel, sendRoleMenu, findChannelInGuild, resolveRole, parseTypes, staffForTicket, startTypesWizard, handleTicketDeleteAsk, safeEmoji } = require('./panels');
const logging = require('./logging');

const DEFAULT_CFG = {
  name: '',
  channel: '',
  message: '🎫 Besoin d\'aide ? Clique sur le bouton pour ouvrir un ticket !',
  button_label: '🎫 Ouvrir un ticket',
  button_style: '1',
  support_role: '',
  category: 'Tickets',
  require_reason: 1,
};

function getCfg(botId, guildId) {
  const row = store.tickets.get(botId, guildId);
  return row ? { ...DEFAULT_CFG, ...row } : { ...DEFAULT_CFG };
}

// Seul le staff peut fermer / gérer les tickets
function ticketStaff(botId, interaction) {
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return false;
  try {
    if (guild.ownerId === interaction.user.id) return true;
    if (member.permissions && typeof member.permissions.has === 'function'
      && member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
  } catch {}
  const cfg = store.tickets.get(botId, guild.id) || {};
  if (cfg.support_role) {
    const role = resolveRole(guild, cfg.support_role);
    if (role && member.roles && member.roles.cache && member.roles.cache.has(role.id)) return true;
  }
  return false;
}

// ============================================================
// Assistant interactif /ticket setup (menus déroulants)
// ============================================================
const WIZARD_TTL = 10 * 60000; // 10 minutes

const STEPS = [
  { key: 'name', type: 'string', emoji: '📛', label: 'Nom du panel',
    question: 'Donne un nom à ton système de tickets. **Sélectionne** un nom rapide ou écris le tien.' },
  { key: 'category', type: 'string', emoji: '🗂️', label: 'Catégorie',
    question: 'Dans quelle catégorie les salons de tickets seront-ils créés ? **Sélectionne** une catégorie existante ou crées-en une.' },
  { key: 'channel', type: 'channel', emoji: '📨', label: 'Salon du panneau',
    question: 'Dans quel salon veux-tu envoyer le panneau avec le bouton ? **Sélectionne** le salon dans le menu.' },
  { key: 'role', type: 'role', emoji: '🛡️', label: 'Rôle du staff',
    question: 'Quel rôle peut voir tous les tickets ? **Sélectionne** le rôle dans le menu (ou clique « Terminer » pour aucun).' },
];

const NAME_PRESETS = [
  { label: 'Support', emoji: '🎫' },
  { label: 'Aide', emoji: '🆘' },
  { label: 'Recrutement', emoji: '📢' },
  { label: 'Réclamations', emoji: '⚠️' },
  { label: 'Général', emoji: '💬' },
];

const wizards = new Map();
const wizardKey = (botId, guildId, userId) => `${botId}:${guildId}:${userId}`;

function selectOptionsFor(state) {
  const step = STEPS[state.step];
  if (step.key === 'name') {
    const opts = NAME_PRESETS.map(p => ({
      label: p.label, value: p.label, emoji: p.emoji,
    }));
    opts.push({ label: 'Écrire un nom personnalisé', value: '__custom__', emoji: '✏️' });
    return opts;
  }
  if (step.key === 'category') {
    const seen = new Set();
    const cats = [...state.guild.channels.cache.values()]
      .filter(c => c.type === ChannelType.GuildCategory)
      .filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 23);
    const opts = cats.map(c => ({ label: c.name.slice(0, 80), value: c.name.slice(0, 80) }));
    opts.push({ label: 'Créer une nouvelle catégorie', value: '__custom__', emoji: '➕' });
    return opts;
  }
  return [];
}

function stepComponents(state) {
  const uid = state.userId;
  const step = STEPS[state.step];
  const rows = [];

  const first = new ActionRowBuilder();
  if (step.type === 'channel') {
    first.addComponents(new ChannelSelectMenuBuilder()
      .setCustomId(`bdw-sel:${state.botId}:${uid}`)
      .setPlaceholder('📨 Sélectionne le salon du panneau…')
      .setMinValues(1).setMaxValues(1)
      .setChannelTypes([ChannelType.GuildText]));
  } else if (step.type === 'role') {
    first.addComponents(new RoleSelectMenuBuilder()
      .setCustomId(`bdw-sel:${state.botId}:${uid}`)
      .setPlaceholder('🛡️ Sélectionne le rôle du staff…')
      .setMinValues(1).setMaxValues(1));
  } else {
    const opts = selectOptionsFor(state).map(o => {
      const b = new StringSelectMenuOptionBuilder()
        .setLabel(String(o.label).slice(0, 100))
        .setValue(String(o.value).slice(0, 100));
      const e = safeEmoji(o.emoji);
      if (e) b.setEmoji(e);
      return b;
    });
    first.addComponents(new StringSelectMenuBuilder()
      .setCustomId(`bdw-sel:${state.botId}:${uid}`)
      .setPlaceholder(`Choisis : ${step.label}`)
      .setMinValues(1).setMaxValues(1)
      .addOptions(opts));
  }
  rows.push(first);

  const second = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bdw:${state.botId}:${uid}:next`)
      .setLabel(state.step >= STEPS.length - 1 ? '✅ Terminer' : 'Suivant ➡️')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bdw:${state.botId}:${uid}:cancel`)
      .setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary),
  );
  rows.push(second);
  return rows;
}

function wizardEmbed(state) {
  const step = STEPS[state.step];
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🎫 Assistant de configuration — Étape ${state.step + 1}/${STEPS.length}`)
    .setDescription(`**${step.emoji} ${step.label}**\n${step.question}`);
  const lines = STEPS.map((s, i) => {
    const v = state.values[s.key];
    const mark = i < state.step ? '✅' : i === state.step ? '➡️' : '⏳';
    const shown = v || '*non défini*';
    return `${mark} **${s.label}** : ${shown}`;
  });
  embed.addFields({ name: '📋 Récapitulatif', value: lines.join('\n') });
  embed.setFooter({ text: 'Sélectionne dans le menu déroulant ci-dessus, ou clique « Suivant » pour garder la valeur actuelle.' });
  return embed;
}

async function startWizard(botId, interaction) {
  const key = wizardKey(botId, interaction.guild.id, interaction.user.id);
  const values = {
    name: 'Support',
    category: 'Tickets',
    channel: interaction.channel ? `#${interaction.channel.name}` : '',
    role: '',
  };
  const state = {
    botId, guildId: interaction.guild.id, userId: interaction.user.id,
    step: 0, values, startedAt: Date.now(), guild: interaction.guild,
  };
  const msg = await interaction.reply({
    embeds: [wizardEmbed(state)],
    components: stepComponents(state),
    fetchReply: true,
  });
  state.msg = msg;
  wizards.set(key, state);
}

// Appelé depuis dispatchPanels pour les boutons, modales et menus de l'assistant
async function handleWizardInteraction(botId, interaction) {
  // --- Menus de sélection (chaîne / salon / rôle) ---
  if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
    const parts = (interaction.customId || '').split(':');
    if (parts.length !== 3 || parts[1] !== String(botId)) return;
    const uid = parts[2];
    if (uid !== interaction.user.id) return;
    const key = wizardKey(botId, interaction.guild.id, uid);
    const state = wizards.get(key);
    if (!state) return interaction.reply({ content: '⏰ Cet assistant a expiré. Relance `/ticket setup`.', ephemeral: true });

    const step = STEPS[state.step];
    if (interaction.isStringSelectMenu()) {
      const v = interaction.values[0];
      if (v === '__custom__') {
        return showCustomModal(state, interaction);
      }
      state.values[step.key] = v;
    } else if (interaction.isChannelSelectMenu()) {
      const ch = interaction.guild.channels.cache.get(interaction.values[0]);
      state.values.channel = ch ? `#${ch.name}` : interaction.values[0];
    } else {
      const role = interaction.guild.roles.cache.get(interaction.values[0]);
      state.values.role = role ? role.name : interaction.values[0];
    }

    state.startedAt = Date.now();
    state.step += 1;
    if (state.step >= STEPS.length) return finalizeWizard(state, interaction);
    return interaction.update({ embeds: [wizardEmbed(state)], components: stepComponents(state) });
  }

  // --- Boutons ---
  if (interaction.isButton()) {
    const parts = (interaction.customId || '').split(':');
    if (parts.length !== 4 || parts[1] !== String(botId)) return;
    const [, , uid, action] = parts;
    if (uid !== interaction.user.id) return;
    const key = wizardKey(botId, interaction.guild.id, uid);
    const state = wizards.get(key);
    if (!state) return interaction.reply({ content: '⏰ Cet assistant a expiré. Relance `/ticket setup`.', ephemeral: true });
    if (Date.now() - state.startedAt > WIZARD_TTL) {
      wizards.delete(key);
      return interaction.update({ content: '⏰ Assistant expiré. Relance `/ticket setup`.', embeds: [], components: [] });
    }
    if (action === 'cancel') {
      wizards.delete(key);
      return interaction.update({ content: '❌ Configuration annulée.', embeds: [], components: [] });
    }
    if (action === 'next') {
      state.step += 1;
      if (state.step >= STEPS.length) return finalizeWizard(state, interaction);
      return interaction.update({ embeds: [wizardEmbed(state)], components: stepComponents(state) });
    }
    return null;
  }

  // --- Modales (nom ou catégorie personnalisés) ---
  if (interaction.isModalSubmit()) {
    const parts = (interaction.customId || '').split(':');
    if (parts.length !== 3 || parts[1] !== String(botId)) return;
    const uid = parts[2];
    if (uid !== interaction.user.id) return;
    const key = wizardKey(botId, interaction.guild.id, uid);
    const state = wizards.get(key);
    if (!state) return interaction.reply({ content: '⏰ Cet assistant a expiré.', ephemeral: true });
    const step = STEPS[state.step];
    const v = interaction.fields.getTextInputValue('value').trim();
    if (v) state.values[step.key] = v;
    state.startedAt = Date.now();
    try { await state.msg.edit({ embeds: [wizardEmbed(state)], components: stepComponents(state) }); } catch {}
    return interaction.reply({ content: `✅ « ${step.label} » enregistré ! Sélectionne puis clique sur « Suivant » pour continuer.`, ephemeral: true });
  }
}

function showCustomModal(state, interaction) {
  const step = STEPS[state.step];
  const modal = new ModalBuilder()
    .setCustomId(`bdw-modal:${state.botId}:${state.userId}`)
    .setTitle(`${step.emoji} ${step.label}`);
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(step.label)
    .setPlaceholder(step.key === 'name' ? 'Mon système de support' : 'Tickets')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100);
  if (state.values[step.key]) input.setValue(state.values[step.key]);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

async function finalizeWizard(state, interaction) {
  const guild = interaction.guild;
  const cfg = {
    ...DEFAULT_CFG,
    name: state.values.name || 'Support',
    channel: state.values.channel || '',
    category: state.values.category || 'Tickets',
    support_role: state.values.role || '',
  };
  store.tickets.set(state.botId, guild.id, cfg);

  const channel = findChannelInGuild(guild, cfg.channel) || interaction.channel;
  let sent = false, warn = '';
  if (channel && channel.isTextBased()) {
    try {
      await sendTicketPanel(state.botId, guild.id, interaction.client, channel);
      sent = true;
    } catch (e) { warn = e.message.slice(0, 150); }
  } else {
    warn = 'Salon introuvable — envoie le panneau avec `/ticket panel`.';
  }

  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('✅ Système de tickets configuré !')
    .setDescription(sent ? `Le panneau a été envoyé dans ${channel} — tes membres peuvent maintenant ouvrir des tickets.` : `⚠️ ${warn}`)
    .addFields(
      { name: '📛 Nom', value: cfg.name, inline: true },
      { name: '🗂️ Catégorie', value: cfg.category, inline: true },
      { name: '📨 Salon', value: cfg.channel || 'non défini', inline: true },
      { name: '🛡️ Rôle staff', value: cfg.support_role || 'aucun', inline: true },
    )
    .setFooter({ text: 'Modifie tout à tout moment avec /ticket channel, /ticket role, /ticket category…' });

  wizards.delete(wizardKey(state.botId, guild.id, state.userId));
  await interaction.update({ embeds: [embed], components: [] });
}

// ============================================================
// Dispatch principal des commandes
// ============================================================
async function handlePanelCommand(botId, interaction) {
  const member = interaction.member;
  const guild = interaction.guild;
  const isOwner = guild.ownerId === interaction.user.id;
  const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

  const sub = interaction.options.getSubcommand();
  const group = (typeof interaction.options.getSubcommandGroup === 'function') ? interaction.options.getSubcommandGroup() : null;
  // Système de tickets :
  //  - configuration (dont les types) : propriétaire du serveur uniquement
  //  - gestion (close/add/remove) : propriétaire, admin OU staff (rôle du type)
  if (interaction.commandName === 'ticket') {
    if (group === 'types' || sub === 'type') {
      if (!isOwner) {
        return interaction.reply({ content: '⛔ Seul le **propriétaire du serveur** peut configurer les types de tickets.', ephemeral: true });
      }
    } else if (['close', 'add', 'remove', 'delete'].includes(sub)) {
      if (!isOwner && !isAdmin && !ticketStaff(botId, interaction) && !staffForTicket(botId, interaction)) {
        return interaction.reply({ content: '🔒 Seul le **staff** (rôle support) ou les administrateurs peuvent gérer les tickets.', ephemeral: true });
      }
    } else if (!isOwner) {
      return interaction.reply({ content: '⛔ Seul le **propriétaire du serveur** peut configurer le système de tickets.', ephemeral: true });
    }
    return handleTicket(botId, sub, group, interaction, guild);
  }
  // Menus de rôles : propriétaire ou administrateurs
  if (!isOwner && !isAdmin) {
    return interaction.reply({ content: '⛔ Réservé au propriétaire ou aux administrateurs.', ephemeral: true });
  }
  return handleRoles(botId, sub, interaction, guild);
}

// ---------------------- /ticket ----------------------
async function handleTicket(botId, sub, group, interaction, guild) {
  const cfg = getCfg(botId, guild.id);
  const save = async (fields) => {
    store.tickets.set(botId, guild.id, { ...cfg, ...fields });
    await interaction.reply({ content: '✅ Configuration enregistrée !', ephemeral: true });
  };

  // ---- /ticket types (groupe) : assistant + ajouter / supprimer / lister ----
  if (group === 'types' || sub === 'type') {
    const types = parseTypes(cfg);
    const action = group === 'types' ? sub : 'add';
    if (action === 'setup') {
      return startTypesWizard(botId, interaction);
    }
    if (action === 'add') {
      const nom = (interaction.options.getString('nom') || '').trim();
      if (!nom) return interaction.reply({ content: '❌ Donne un nom au type de ticket.', ephemeral: true });
      const emojiRaw = (interaction.options.getString('emoji') || '').trim();
      const emoji = safeEmoji(emojiRaw);
      if (emojiRaw && !emoji) return interaction.reply({ content: '❌ Emoji invalide — utilise un vrai emoji (ex : 🤝).', ephemeral: true });
      const categorie = (interaction.options.getString('categorie') || '').trim();
      const description = (interaction.options.getString('description') || '').trim();
      const staffrole = (interaction.options.getString('staffrole') || '').trim();
      const existingType = types.find((t) => t.label.toLowerCase() === nom.toLowerCase());
      const others = types.filter((t) => t.label.toLowerCase() !== nom.toLowerCase());
      const staffRoles = existingType
        ? [...(Array.isArray(existingType.staff_roles) ? existingType.staff_roles : (existingType.staff_role ? [existingType.staff_role] : []))]
        : [];
      if (staffrole && !staffRoles.includes(staffrole)) staffRoles.push(staffrole);
      if (existingType) {
        existingType.emoji = emoji || existingType.emoji || '';
        existingType.description = description || existingType.description || '';
        existingType.category = categorie || existingType.category || '';
        existingType.staff_roles = staffRoles;
        others.push(existingType);
      } else {
        others.push({ label: nom.slice(0, 100), emoji: emoji.slice(0, 100), description: description.slice(0, 100), category: categorie.slice(0, 100), staff_roles: staffRoles });
      }
      store.tickets.set(botId, guild.id, { ...cfg, types: JSON.stringify(others) });
      return interaction.reply({
        content: `✅ Type « ${emoji || '🎫'} **${nom}** » mis à jour !${staffRoles.length ? `\n🛡️ Staff de ce type : ${staffRoles.join(', ')}` : ''}\n\n💡 Ajoute **plusieurs rôles staff** avec \`/ticket types setup\` → « ➕ Ajouter un rôle staff ».\n\nTypes actuels : ${others.map((t) => t.label).join(', ') || 'aucun'}\n\n📨 Re-envoie le panneau avec \`/ticket panel\` pour mettre à jour le menu déroulant.`,
        ephemeral: true,
      });
    }
    if (action === 'remove') {
      const nom = (interaction.options.getString('nom') || '').trim();
      if (!nom) return interaction.reply({ content: '❌ Donne le nom du type à supprimer.', ephemeral: true });
      const others = types.filter((t) => t.label.toLowerCase() !== nom.toLowerCase());
      if (others.length === types.length) {
        return interaction.reply({ content: `❌ Type « ${nom} » introuvable. Utilise \`/ticket types list\`.`, ephemeral: true });
      }
      store.tickets.set(botId, guild.id, { ...cfg, types: JSON.stringify(others) });
      return interaction.reply({ content: `✅ Type « ${nom} » supprimé.\nTypes restants : ${others.map((t) => t.label).join(', ') || 'aucun'}`, ephemeral: true });
    }
    // list
    if (!types.length) {
      return interaction.reply({ content: '🗂️ Aucun type pour l\'instant. Ajoute-en avec `/ticket types add`.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🗂️ Types de tickets')
      .setDescription(types.map((t) => {
        const roles = Array.isArray(t.staff_roles) ? t.staff_roles : (t.staff_role ? [t.staff_role] : []);
        return `${t.emoji || '🎫'} **${t.label}**${t.category ? ` → catégorie « ${t.category} »` : ''}${roles.length ? `\n    🛡️ Staff : ${roles.join(', ')}` : ''}`;
      }).join('\n'))
      .setFooter({ text: 'Ajoute : /ticket types add · Supprime : /ticket types remove · Le panneau (/ticket panel) affiche le menu déroulant.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  switch (sub) {
    case 'setup':
      return startWizard(botId, interaction);
    case 'channel': {
      const ch = interaction.options.getChannel('salon');
      if (!ch || !ch.isTextBased()) return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
      return save({ channel: `#${ch.name}` });
    }
    case 'category': {
      const name = interaction.options.getString('nom');
      return save({ category: name });
    }
    case 'role': {
      const role = interaction.options.getRole('role');
      return save({ support_role: role.name });
    }
    case 'button': {
      const texte = interaction.options.getString('texte');
      return save({ button_label: texte });
    }
    case 'message': {
      const texte = interaction.options.getString('texte');
      return save({ message: texte });
    }
    case 'panel': {
      let channel = interaction.options.getChannel('salon') || null;
      if (!channel && cfg.channel) channel = findChannelInGuild(guild, cfg.channel);
      if (!channel) channel = interaction.channel;
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: '❌ Salon introuvable. Configure-le avec `/ticket setup` ou précise un salon.', ephemeral: true });
      try {
        await sendTicketPanel(botId, guild.id, interaction.client, channel);
        return interaction.reply({ content: `✅ Panneau envoyé dans ${channel} !`, ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: `⚠️ Erreur : ${e.message.slice(0, 150)}`, ephemeral: true });
      }
    }
    case 'config': {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎫 Configuration des tickets')
        .addFields(
          { name: '📛 Nom du panel', value: cfg.name || '—', inline: true },
          { name: '📨 Salon du panneau', value: cfg.channel || 'non défini (utilise `/ticket setup`)', inline: true },
          { name: '🗂️ Catégorie', value: cfg.category || 'aucune', inline: true },
          { name: '🛡️ Rôle staff global', value: cfg.support_role || 'aucun (les types peuvent avoir les leurs)', inline: true },
          { name: '🔘 Bouton', value: `${cfg.button_label} (${['bleu', 'gris', 'vert', 'rouge'][Number(cfg.button_style) - 1] || 'bleu'})`, inline: true },
          { name: '📝 Questionnaire à l\'ouverture', value: (cfg.require_reason === 0 || cfg.require_reason === false) ? '❌ désactivé (ouverture directe)' : '✅ obligatoire (raison demandée)', inline: true },
          { name: '🗂️ Types de tickets', value: parseTypes(cfg).map((t) => {
            const roles = Array.isArray(t.staff_roles) ? t.staff_roles : (t.staff_role ? [t.staff_role] : []);
            return `${t.emoji || '🎫'} **${t.label}**${t.category ? ' (→ ' + t.category + ')' : ''}${roles.length ? `\n    🛡️ Staff : ${roles.join(', ')}` : ''}`;
          }).join('\n').slice(0, 1024) || 'aucun (ajoute avec /ticket types add)' },
          { name: '💬 Message', value: cfg.message.slice(0, 200), inline: false },
        )
        .setFooter({ text: 'Modifie tout avec /ticket setup ou /ticket types setup (assistants) et les sous-commandes rapides' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    case 'close': {
      const ch = interaction.channel;
      const topic = ch && ch.topic ? ch.topic : '';
      if (!ch || (!ch.name.startsWith('ticket-') && !topic.includes('Ticket de'))) {
        return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un salon de ticket.', ephemeral: true });
      }
      if (!ticketStaff(botId, interaction)) {
        return interaction.reply({ content: '🔒 Seul le **staff** peut fermer ce ticket.', ephemeral: true });
      }
      // 🔒 Fermer = verrouiller (le staff peut réouvrir) — la transcription part à la suppression
      const m = topic.match(/\| (\d{15,21})/);
      const openerId = m ? m[1] : null;
      if (openerId) {
        await ch.permissionOverwrites.edit(openerId, { ViewChannel: false, SendMessages: false }).catch(() => {});
      }
      store.closedTickets.add(ch.id, botId, guild.id);
      require('./panels').bumpTicketStats(guild.id, 0, -1);
      await logging.log(botId, guild, {
        title: '🔒 Ticket fermé', color: '#ED4245',
        fields: [
          { name: '📨 Salon', value: `<#${ch.id}>`, inline: true },
          { name: '🛡️ Par', value: `${interaction.user.tag}`, inline: true },
          { name: '📄 Transcription', value: 'envoyée à la suppression', inline: true },
        ],
      });
      return interaction.reply({
        content: '🔒 Ticket fermé. 📄 La **transcription** sera envoyée en MP au créateur au moment de la **suppression** (`/ticket delete`).',
        ephemeral: true,
      });
    }
    case 'delete': {
      const ch = interaction.channel;
      const topic = ch && ch.topic ? ch.topic : '';
      if (!ch || (!ch.name.startsWith('ticket-') && !topic.includes('Ticket de'))) {
        return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un salon de ticket.', ephemeral: true });
      }
      // Demande la raison puis supprime (transcription envoyée en MP au créateur)
      return handleTicketDeleteAsk(botId, interaction);
    }
    case 'add': {
      const ch = interaction.channel;
      if (!ch || !ch.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ Utilise cette commande dans un salon de ticket.', ephemeral: true });
      }
      if (!ticketStaff(botId, interaction)) {
        return interaction.reply({ content: '🔒 Seul le **staff** peut gérer les tickets.', ephemeral: true });
      }
      const user = interaction.options.getUser('membre');
      await ch.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
      return interaction.reply({ content: `✅ ${user} peut maintenant voir ce ticket.`, ephemeral: true });
    }
    case 'remove': {
      const ch = interaction.channel;
      if (!ch || !ch.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ Utilise cette commande dans un salon de ticket.', ephemeral: true });
      }
      if (!ticketStaff(botId, interaction)) {
        return interaction.reply({ content: '🔒 Seul le **staff** peut gérer les tickets.', ephemeral: true });
      }
      const user = interaction.options.getUser('membre');
      await ch.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false }).catch(() => {});
      return interaction.reply({ content: `✅ ${user} ne peut plus voir ce ticket.`, ephemeral: true });
    }
    case 'type': {
      const nom = (interaction.options.getString('nom') || '').trim();
      if (!nom) return interaction.reply({ content: '❌ Donne un nom au type de ticket.', ephemeral: true });
      const emojiRaw = (interaction.options.getString('emoji') || '').trim();
      const emoji = safeEmoji(emojiRaw);
      if (emojiRaw && !emoji) return interaction.reply({ content: '❌ Emoji invalide — utilise un vrai emoji (ex : 🤝).', ephemeral: true });
      const categorie = (interaction.options.getString('categorie') || '').trim();
      const types = parseTypes(cfg).filter((t) => t.label.toLowerCase() !== nom.toLowerCase());
      types.push({ label: nom.slice(0, 100), emoji: emoji.slice(0, 100), category: categorie.slice(0, 100) });
      store.tickets.set(botId, guild.id, { ...cfg, types: JSON.stringify(types) });
      return interaction.reply({
        content: `✅ Type « ${emoji || '🎫'} ${nom} » ajouté !\nTypes actuels : ${types.map((t) => t.label).join(', ') || 'aucun'}\n\n📨 Re-envoie le panneau avec \`/ticket panel\` pour afficher le menu de sélection.`,
        ephemeral: true,
      });
    }
    default:
      return interaction.reply({ content: '❓ Sous-commande inconnue.', ephemeral: true });
  }
}

// ---------------------- /roles ----------------------
async function handleRoles(botId, sub, interaction, guild) {
  switch (sub) {
    case 'list': {
      const menus = store.roleMenus.all(botId, guild.id);
      if (!menus.length) {
        return interaction.reply({
          content: '📋 Aucun menu sur ce serveur. Crée-en un dans le dashboard BotDev (onglet Panneaux), puis envoie-le avec `/roles send`.',
          ephemeral: true,
        });
      }
      const embed = new EmbedBuilder()
        .setColor('#8B5CF6')
        .setTitle('📋 Menus de rôles')
        .setDescription(menus.map((m, i) => `**${i + 1}.** ${m.name} — ${m.options.length} rôle(s)${m.channel ? ` · salon ${m.channel}` : ''}`).join('\n'))
        .setFooter({ text: 'Envoie un menu avec /roles send <numéro>' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    case 'send': {
      const n = interaction.options.getInteger('numero');
      const menus = store.roleMenus.all(botId, guild.id);
      const menu = menus[n - 1];
      if (!menu) return interaction.reply({ content: '❌ Menu introuvable. Utilise `/roles list` pour voir les numéros.', ephemeral: true });
      let channel = interaction.options.getChannel('salon') || null;
      if (!channel && menu.channel) channel = findChannelInGuild(guild, menu.channel);
      if (!channel) channel = interaction.channel;
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: '❌ Salon introuvable.', ephemeral: true });
      try {
        await sendRoleMenu(botId, interaction.client, menu, channel);
        return interaction.reply({ content: `✅ Menu « ${menu.name} » envoyé dans ${channel} !`, ephemeral: true });
      } catch (e) {
        return interaction.reply({ content: `⚠️ Erreur : ${e.message.slice(0, 150)}`, ephemeral: true });
      }
    }
    default:
      return interaction.reply({ content: '❓ Sous-commande inconnue.', ephemeral: true });
  }
}

module.exports = { handlePanelCommand, handleWizardInteraction };
