// ============================================================
// BotDev - Commandes Discord de gestion des panneaux (façon Ticket Tool)
//   /ticket setup → assistant interactif pas à pas (nom → catégorie → salon → rôle)
//   /ticket ...   → configuration rapide + gestion
//   /roles ...    → menus de rôles
// Réservées au propriétaire du serveur (tickets) / propriétaire ou admins (rôles)
// ============================================================
const {
  EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const store = require('../db');
const { sendTicketPanel, sendRoleMenu, findChannelInGuild } = require('./panels');

const DEFAULT_CFG = {
  name: '',
  channel: '',
  message: '🎫 Besoin d\'aide ? Clique sur le bouton pour ouvrir un ticket !',
  button_label: '🎫 Ouvrir un ticket',
  support_role: '',
  category: 'Tickets',
};

function getCfg(botId, guildId) {
  const row = store.tickets.get(botId, guildId);
  return row ? { ...DEFAULT_CFG, ...row } : { ...DEFAULT_CFG };
}

// ============================================================
// Assistant interactif /ticket setup
// ============================================================
const WIZARD_TTL = 10 * 60000; // 10 minutes

const STEPS = [
  { key: 'name', emoji: '📛', label: 'Nom du panel', ph: 'Support',
    question: 'Donne un nom à ton système de tickets (ex : **Support**, **Aide**, **Recrutement**). C\'est juste un nom pour t\'y retrouver.' },
  { key: 'category', emoji: '🗂️', label: 'Catégorie', ph: 'Tickets',
    question: 'Dans quelle catégorie les salons de tickets seront-ils créés ? (elle sera créée automatiquement si elle n\'existe pas)' },
  { key: 'channel', emoji: '📨', label: 'Salon du panneau', ph: '#support',
    question: 'Dans quel salon veux-tu envoyer le panneau avec le bouton ? (ex : **#support**) — les membres cliqueront dessus pour ouvrir un ticket.' },
  { key: 'role', emoji: '🛡️', label: 'Rôle du staff', ph: 'Staff',
    question: 'Quel rôle peut voir tous les tickets ? (nom exact du rôle, ou laisse vide pour aucun)' },
];

const wizards = new Map();
const wizardKey = (botId, guildId, userId) => `${botId}:${guildId}:${userId}`;

function wizardRow(state) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bdw:${state.botId}:${state.userId}:write`).setLabel('✏️ Saisir').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bdw:${state.botId}:${state.userId}:next`)
      .setLabel(state.step >= STEPS.length - 1 ? '✅ Terminer' : 'Suivant ➡️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bdw:${state.botId}:${state.userId}:cancel`).setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary),
  );
  return row;
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
    let shown = v || '*non défini*';
    return `${mark} **${s.label}** : ${shown}`;
  });
  embed.addFields({ name: '📋 Récapitulatif', value: lines.join('\n') });
  embed.setFooter({ text: 'Clique sur « ✏️ Saisir » pour écrire une valeur, puis « Suivant »' });
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
  const state = { botId, guildId: interaction.guild.id, userId: interaction.user.id, step: 0, values, startedAt: Date.now() };
  const msg = await interaction.reply({ embeds: [wizardEmbed(state)], components: [wizardRow(state)], fetchReply: true });
  state.msg = msg;
  wizards.set(key, state);
}

// Appelé depuis dispatchPanels pour les boutons et modales de l'assistant
async function handleWizardInteraction(botId, interaction) {
  if (interaction.isButton()) {
    const parts = (interaction.customId || '').split(':');
    if (parts.length !== 4 || parts[1] !== String(botId)) return;
    const [, , uid, action] = parts;
    if (uid !== interaction.user.id) return;
    const state = wizards.get(wizardKey(botId, interaction.guild.id, uid));
    if (!state) return interaction.reply({ content: '⏰ Cet assistant a expiré. Relance `/ticket setup`.', ephemeral: true });
    if (Date.now() - state.startedAt > WIZARD_TTL) {
      wizards.delete(wizardKey(botId, interaction.guild.id, uid));
      return interaction.update({ content: '⏰ Assistant expiré. Relance `/ticket setup`.', embeds: [], components: [] });
    }

    if (action === 'cancel') {
      wizards.delete(wizardKey(botId, interaction.guild.id, uid));
      return interaction.update({ content: '❌ Configuration annulée.', embeds: [], components: [] });
    }

    if (action === 'write') {
      const step = STEPS[state.step];
      const modal = new ModalBuilder()
        .setCustomId(`bdw-modal:${state.botId}:${state.userId}`)
        .setTitle(`${step.emoji} ${step.label}`);
      const input = new TextInputBuilder()
        .setCustomId('value')
        .setLabel(step.label)
        .setPlaceholder(step.ph)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100);
      if (state.values[step.key]) input.setValue(state.values[step.key]);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (action === 'next') {
      state.step += 1;
      if (state.step >= STEPS.length) return finalizeWizard(state, interaction);
      return interaction.update({ embeds: [wizardEmbed(state)], components: [wizardRow(state)] });
    }
    return null;
  }

  if (interaction.isModalSubmit()) {
    const parts = (interaction.customId || '').split(':');
    if (parts.length !== 3 || parts[1] !== String(botId)) return;
    const [, , uid] = parts;
    if (uid !== interaction.user.id) return;
    const key = wizardKey(botId, interaction.guild.id, uid);
    const state = wizards.get(key);
    if (!state) return interaction.reply({ content: '⏰ Cet assistant a expiré.', ephemeral: true });
    const step = STEPS[state.step];
    const v = interaction.fields.getTextInputValue('value').trim();
    if (v) state.values[step.key] = v;
    state.startedAt = Date.now();
    try { await state.msg.edit({ embeds: [wizardEmbed(state)], components: [wizardRow(state)] }); } catch {}
    return interaction.reply({ content: `✅ « ${step.label} » enregistré ! Clique sur « Suivant » pour continuer.`, ephemeral: true });
  }
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

  // Système de tickets : propriétaire du serveur uniquement (comme demandé)
  if (interaction.commandName === 'ticket' && !isOwner) {
    return interaction.reply({ content: '⛔ Seul le **propriétaire du serveur** peut configurer le système de tickets.', ephemeral: true });
  }
  // Menus de rôles : propriétaire ou administrateurs
  if (interaction.commandName === 'roles' && !isOwner && !isAdmin) {
    return interaction.reply({ content: '⛔ Réservé au propriétaire ou aux administrateurs.', ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  if (interaction.commandName === 'ticket') return handleTicket(botId, sub, interaction, guild, member);
  return handleRoles(botId, sub, interaction, guild);
}

// ---------------------- /ticket ----------------------
async function handleTicket(botId, sub, interaction, guild) {
  const cfg = getCfg(botId, guild.id);
  const save = async (fields) => {
    store.tickets.set(botId, guild.id, { ...cfg, ...fields });
    await interaction.reply({ content: '✅ Configuration enregistrée !', ephemeral: true });
  };

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
          { name: '🛡️ Rôle staff', value: cfg.support_role || 'aucun', inline: true },
          { name: '🔘 Bouton', value: cfg.button_label, inline: true },
          { name: '💬 Message', value: cfg.message.slice(0, 200), inline: false },
        )
        .setFooter({ text: 'Modifie tout avec /ticket setup (assistant) ou les sous-commandes rapides' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    case 'close': {
      const ch = interaction.channel;
      if (!ch || !ch.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ Cette commande doit être utilisée dans un salon de ticket.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Fermeture du ticket…', ephemeral: true });
      return setTimeout(() => ch.delete().catch(() => {}), 3000);
    }
    case 'add': {
      const ch = interaction.channel;
      if (!ch || !ch.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ Utilise cette commande dans un salon de ticket.', ephemeral: true });
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
      const user = interaction.options.getUser('membre');
      await ch.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false }).catch(() => {});
      return interaction.reply({ content: `✅ ${user} ne peut plus voir ce ticket.`, ephemeral: true });
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
