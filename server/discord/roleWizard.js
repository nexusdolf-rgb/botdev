// ============================================================
// Hoxera — Assistant interactif /roles setup & /roles edit
// Le créateur du serveur construit son panneau de rôles 100 %
// depuis Discord, sans dashboard :
//   nom → texte → texte du menu → salon → rôles (sélecteurs natifs)
// Puis le panneau est envoyé : les membres choisissent leurs rôles
// dans un menu déroulant (ou des boutons) et le bot les donne
// automatiquement.
// Réservé au propriétaire/administrateurs (comme le système de tickets).
// ============================================================
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const store = require('../db');
const panels = require('./panels');

const wizards = new Map(); // `${botId}:${guildId}:${userId}` -> state
const wizardKey = (botId, guildId, userId) => `${botId}:${guildId}:${userId}`;
const WIZARD_TTL = 10 * 60000; // 10 minutes

const MAX_OPTIONS = 25; // limite Discord pour un menu de sélection

// ---------- Aides d'interaction (anti-timeout, comme partout) ----------
async function ackDeferUpdate(interaction) {
  try { await interaction.deferUpdate(); } catch {}
}
async function ackReply(interaction, payload) {
  try {
    if (interaction.deferred) return await interaction.editReply(payload);
    return await interaction.reply(payload);
  } catch {
    try { return await interaction.followUp(payload); } catch { return null; }
  }
}

function textModal(botId, uid, title, label, placeholder, required, maxLen) {
  const modal = new ModalBuilder().setCustomId(`rls:modal:${botId}:${uid}`).setTitle(String(title).slice(0, 45));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('value')
      .setLabel(String(label).slice(0, 45))
      .setPlaceholder(String(placeholder).slice(0, 100))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(!!required)
      .setMaxLength(maxLen || 100),
  ));
  return modal;
}

// ---------- Rendu de l'assistant ----------
function summaryEmbed(state) {
  const v = state.values;
  const roles = v.options.length
    ? v.options.map((o, i) => `${i + 1}. ${o.emoji ? o.emoji + ' ' : ''}**${o.label}** → @${o.role}`).join('\n').slice(0, 1024)
    : '*aucun rôle pour l\'instant*';
  return new EmbedBuilder()
    .setColor('#8B5CF6')
    .setTitle(state.editId ? '✏️ Modifier le panneau de rôles' : '📋 Assistant des rôles')
    .setDescription('Récapitulatif en direct — choisis une action ci-dessous.')
    .addFields(
      { name: '📛 Nom', value: v.name || '*non défini*', inline: true },
      { name: '📨 Salon', value: v.channel ? `<#${v.channel}>` : '*salon actuel*', inline: true },
      { name: '🎨 Style', value: v.mode === 'buttons' ? '🔘 Boutons' : '📋 Menu déroulant', inline: true },
      { name: '📝 Texte au-dessus du panneau', value: v.content ? v.content.slice(0, 300) : '*aucun*', inline: false },
      { name: '🔽 Texte du menu', value: v.placeholder || 'Choisis tes rôles…', inline: false },
      { name: `🏷️ Rôles (${v.options.length}/${MAX_OPTIONS})`, value: roles, inline: false },
    )
    .setFooter({ text: '✅ Terminer et envoyer quand tout est prêt.' });
}

function actionsComponents(state) {
  const actions = [
    { label: '✏️ Renommer le panneau', value: 'name', emoji: '✏️' },
    { label: '📝 Changer le texte au-dessus', value: 'content', emoji: '📝' },
    { label: '🔽 Changer le texte du menu', value: 'placeholder', emoji: '🔽' },
    { label: '📨 Choisir le salon', value: 'channel', emoji: '📨' },
    { label: state.values.mode === 'buttons' ? '📋 Passer en menu déroulant' : '🔘 Passer en boutons', value: 'mode', emoji: '🎨' },
    { label: '➕ Ajouter un rôle', value: 'addrole', emoji: '➕' },
  ];
  if (state.values.options.length) actions.push({ label: '➖ Retirer un rôle', value: 'removerole', emoji: '➖' });
  actions.push(
    { label: '✅ Terminer et envoyer', value: 'finish', emoji: '✅' },
    { label: '❌ Annuler', value: 'cancel', emoji: '❌' },
  );
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rls:sel:${state.botId}:${state.userId}`)
      .setPlaceholder('Action…')
      .setMinValues(1).setMaxValues(1)
      .addOptions(actions.map((a) => {
        const o = new StringSelectMenuOptionBuilder().setLabel(String(a.label).slice(0, 80)).setValue(a.value);
        if (a.emoji) o.setEmoji(a.emoji);
        return o;
      })),
  )];
}

function addRoleComponents(state) {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`rls:role:${state.botId}:${state.userId}`)
        .setPlaceholder(`🛡️ Sélectionne un rôle à ajouter (${state.values.options.length}/${MAX_OPTIONS})…`)
        .setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rls:btn:${state.botId}:${state.userId}:doneroles`).setLabel('✅ Terminé').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rls:btn:${state.botId}:${state.userId}:back`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function removeRoleComponents(state) {
  const opts = state.values.options.slice(0, 25);
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rls:sel:${state.botId}:${state.userId}`)
        .setPlaceholder('Choisis un rôle à retirer…')
        .setMinValues(1).setMaxValues(1)
        .addOptions(opts.map((o, i) => {
          const b = new StringSelectMenuOptionBuilder().setLabel(String(o.label).slice(0, 80)).setValue(String(i));
          if (o.emoji) b.setEmoji(String(o.emoji).slice(0, 10));
          return b;
        })),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rls:btn:${state.botId}:${state.userId}:doneroles`).setLabel('✅ Terminé').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rls:btn:${state.botId}:${state.userId}:back`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function channelComponents(state) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`rls:chan:${state.botId}:${state.userId}`)
        .setPlaceholder('📨 Sélectionne le salon du panneau…')
        .setMinValues(1).setMaxValues(1)
        .setChannelTypes([ChannelType.GuildText]),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rls:btn:${state.botId}:${state.userId}:skipchannel`).setLabel('⏭ Utiliser le salon actuel').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rls:btn:${state.botId}:${state.userId}:back`).setLabel('⬅️ Retour').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function backToEdit(state) {
  state.step = 'edit';
  return { embeds: [summaryEmbed(state)], components: actionsComponents(state) };
}

// ---------- Démarrage ----------
// editId = null → création ; 'pick' → choisir le panneau ; number → modifier
async function start(botId, interaction, editId) {
  const uid = interaction.user.id;
  const guild = interaction.guild;

  if (editId === 'pick') {
    const menus = store.roleMenus.all(botId, guild.id);
    if (!menus.length) {
      return interaction.reply({ content: '📋 Aucun panneau à modifier. Crée-en un avec `/roles setup` !', ephemeral: true });
    }
    if (menus.length === 1) return startEdit(botId, interaction, menus[0].id);
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rls:pick:${botId}:${uid}`)
        .setPlaceholder('Quel panneau modifier ?')
        .setMinValues(1).setMaxValues(1)
        .addOptions(menus.slice(0, 25).map((m, i) => new StringSelectMenuOptionBuilder()
          .setLabel(String(m.name || ('Panneau ' + (i + 1))).slice(0, 80))
          .setValue(String(m.id))
          .setDescription(`${m.options.length} rôle(s) · ${m.mode === 'buttons' ? 'boutons' : 'menu déroulant'}`.slice(0, 100)))),
    );
    const msg = await interaction.reply({ content: '✏️ Quel panneau veux-tu modifier ?', components: [row], fetchReply: true });
    wizards.set(wizardKey(botId, guild.id, uid), { botId, guildId: guild.id, userId: uid, step: 'pick', editId: null, values: null, msg, startedAt: Date.now() });
    return;
  }

  if (editId && Number.isFinite(Number(editId))) {
    return startEdit(botId, interaction, Number(editId));
  }

  // Création : on commence par le nom
  wizards.set(wizardKey(botId, guild.id, uid), {
    botId, guildId: guild.id, userId: uid, step: 'name', modal: 'name', editId: null,
    values: { name: '', content: '', placeholder: 'Choisis tes rôles…', channel: '', options: [], mode: 'menu' },
    msg: null, startedAt: Date.now(),
  });
  await interaction.showModal(textModal(botId, uid, '📋 Nouveau panneau', 'Nom du panneau', 'Rôles du serveur', true, 50));
}

async function startEdit(botId, interaction, menuId) {
  const uid = interaction.user.id;
  const menu = store.roleMenus.get(menuId);
  if (!menu || menu.bot_id !== botId || menu.guild_id !== interaction.guild.id) {
    return interaction.reply({ content: '❌ Panneau introuvable.', ephemeral: true });
  }
  const msg = await interaction.reply({
    embeds: [summaryEmbed({ botId, guildId: interaction.guild.id, userId: uid, step: 'edit', editId: menuId, values: { name: menu.name, content: menu.content, placeholder: menu.placeholder, channel: menu.channel, options: menu.options, mode: menu.mode }, msg: null, startedAt: Date.now() })],
    components: actionsComponents({ botId, guildId: interaction.guild.id, userId: uid, editId: menuId, values: { name: menu.name, content: menu.content, placeholder: menu.placeholder, channel: menu.channel, options: menu.options, mode: menu.mode } }),
    fetchReply: true,
  });
  wizards.set(wizardKey(botId, interaction.guild.id, uid), {
    botId, guildId: interaction.guild.id, userId: uid, step: 'edit', editId: menuId,
    values: { name: menu.name, content: menu.content, placeholder: menu.placeholder, channel: menu.channel, options: menu.options, mode: menu.mode },
    msg, startedAt: Date.now(),
  });
}

// ---------- Sauvegarde + envoi ----------
async function finish(botId, state, interaction) {
  const v = state.values;
  if (!v.options.length) {
    return interaction.editReply({ content: '⚠️ Ajoute au moins **un rôle** avant de terminer.', components: [] }).catch(() => {});
  }
  if (!v.name.trim()) v.name = 'Panneau de rôles';

  const payload = {
    name: v.name.slice(0, 50),
    content: v.content.slice(0, 1900),
    placeholder: v.placeholder.slice(0, 150) || 'Choisis tes rôles…',
    channel: v.channel || '',
    mode: v.mode === 'buttons' ? 'buttons' : 'menu',
    options: v.options.slice(0, 25).map((o) => ({
      label: String(o.label).slice(0, 100),
      emoji: panels.safeEmoji(o.emoji),
      role: String(o.role).slice(0, 100),
    })),
  };

  let menu = null;
  try {
    if (state.editId) {
      store.roleMenus.update(state.editId, {
        name: payload.name, content: payload.content, placeholder: payload.placeholder,
        channel: payload.channel, mode: payload.mode, options: JSON.stringify(payload.options),
      });
      menu = store.roleMenus.get(state.editId);
    } else {
      const id = store.roleMenus.create({
        bot_id: botId, guild_id: state.guildId,
        name: payload.name, content: payload.content, placeholder: payload.placeholder,
        channel: payload.channel, mode: payload.mode, options: JSON.stringify(payload.options),
      });
      menu = store.roleMenus.get(id);
    }
  } catch (e) {
    return interaction.editReply({ content: `⚠️ Enregistrement impossible : ${e.message.slice(0, 120)}`, components: [] }).catch(() => {});
  }

  // Envoi du panneau (accusé de réception déjà fait via deferUpdate)
  const guild = interaction.guild;
  let channel = null;
  if (v.channel) channel = guild.channels.cache.get(String(v.channel).replace(/[<#>]/g, '')) || panels.findChannelInGuild(guild, v.channel);
  if (!channel || (typeof channel.isTextBased === 'function' && !channel.isTextBased())) channel = interaction.channel;
  let sentMsg = '📨 Envoie-le ensuite avec `/roles send ' + (store.roleMenus.all(botId, state.guildId).length) + '`.';
  try {
    if (channel && typeof channel.send === 'function') {
      await panels.sendRoleMenu(botId, interaction.client, menu, channel);
      sentMsg = `📨 Panneau envoyé dans ${channel} !`;
    }
  } catch (e) {
    sentMsg = `⚠️ Panneau enregistré mais envoi impossible : ${e.message.slice(0, 120)}`;
  }

  const embed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle(state.editId ? '✅ Panneau mis à jour !' : '✅ Panneau de rôles créé !')
    .setDescription(`${sentMsg}\n\n**${payload.name}** — ${payload.options.length} rôle(s), style ${payload.mode === 'buttons' ? '🔘 boutons' : '📋 menu déroulant'}.\n\nLes membres peuvent maintenant choisir leurs rôles !`)
    .setFooter({ text: 'Modifie-le à tout moment avec /roles edit.' });
  return interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
}

// ---------- Gestion des interactions de l'assistant ----------
async function handleWizardInteraction(botId, interaction) {
  const cid = String(interaction.customId || '');
  if (!cid.startsWith('rls:')) return false;
  const parts = cid.split(':');
  const uid = parts[3];
  if (!uid || uid !== interaction.user.id) {
    return interaction.reply({ content: '🔒 Ce panneau de configuration ne t\'appartient pas.', ephemeral: true });
  }
  const key = wizardKey(botId, interaction.guild.id, uid);
  const state = wizards.get(key);
  if (!state) return interaction.reply({ content: '⏰ Assistant expiré. Relance `/roles setup` ou `/roles edit`.', ephemeral: true });
  if (Date.now() - state.startedAt > WIZARD_TTL) {
    wizards.delete(key);
    return interaction.reply({ content: '⏰ Assistant expiré. Relance `/roles setup` ou `/roles edit`.', ephemeral: true });
  }

  // --- Choix du panneau à modifier (/roles edit avec plusieurs panneaux) ---
  if (cid.startsWith('rls:pick:')) {
    await ackDeferUpdate(interaction);
    const menuId = Number(interaction.values[0]);
    const menu = store.roleMenus.get(menuId);
    if (!menu || menu.bot_id !== botId) return interaction.editReply({ content: '❌ Panneau introuvable.', components: [] }).catch(() => {});
    state.editId = menuId;
    state.values = { name: menu.name, content: menu.content, placeholder: menu.placeholder, channel: menu.channel, options: menu.options, mode: menu.mode };
    state.step = 'edit';
    return interaction.editReply({ embeds: [summaryEmbed(state)], components: actionsComponents(state) }).catch(() => {});
  }

  // --- Modales (nom / texte / emoji) ---
  if (interaction.isModalSubmit()) {
    const val = (interaction.fields.getTextInputValue('value') || '').trim();
    await ackReply(interaction, { content: '✅ Enregistré !', ephemeral: true });
    const mode = state.modal;
    state.modal = null;
    if (mode === 'name') {
      if (val) state.values.name = val.slice(0, 50);
      state.step = 'edit';
    } else if (mode === 'content') {
      state.values.content = val.slice(0, 1900);
      state.step = 'edit';
    } else if (mode === 'placeholder') {
      if (val) state.values.placeholder = val.slice(0, 150);
      state.step = 'edit';
    } else if (mode === 'emoji' && state.pendingRole) {
      const emoji = panels.safeEmoji(val);
      state.values.options.push({
        label: String(state.pendingRole.name || 'Rôle').slice(0, 100),
        emoji: emoji || '',
        role: String(state.pendingRole.name || '').slice(0, 100),
      });
      state.pendingRole = null;
      state.step = 'addrole';
    }
    // Premier message de l'assistant (création) : on l'envoie maintenant
    if (!state.msg) {
      const m = await interaction.followUp({
        embeds: [summaryEmbed(state)],
        components: state.step === 'addrole' ? addRoleComponents(state) : actionsComponents(state),
        fetchReply: true,
      }).catch(() => null);
      state.msg = m;
    } else {
      try {
        await state.msg.edit({
          embeds: [summaryEmbed(state)],
          components: state.step === 'addrole' ? addRoleComponents(state) : actionsComponents(state),
        });
      } catch {}
    }
    return true;
  }

  // --- Sélecteur de rôle natif (étape « ajouter ») ---
  if (interaction.isRoleSelectMenu()) {
    const role = interaction.guild.roles.cache.get(interaction.values[0]);
    if (!role) return interaction.update({}).catch(() => {});
    if (state.values.options.length >= MAX_OPTIONS) {
      return interaction.reply({ content: `❌ Maximum ${MAX_OPTIONS} rôles par panneau.`, ephemeral: true });
    }
    if (state.values.options.some((o) => o.role === role.name)) {
      return interaction.reply({ content: `❌ Le rôle « ${role.name} » est déjà dans le panneau.`, ephemeral: true });
    }
    // On demande l'emoji (optionnel) avant d'ajouter
    state.pendingRole = role;
    state.modal = 'emoji';
    await interaction.showModal(textModal(botId, uid, '😀 Emoji du rôle', 'Emoji (optionnel)', role.name, false, 10));
    return true;
  }

  // --- Sélecteur de salon natif ---
  if (interaction.isChannelSelectMenu()) {
    await ackDeferUpdate(interaction);
    state.values.channel = interaction.values[0];
    state.step = 'edit';
    return interaction.editReply(backToEdit(state)).catch(() => {});
  }

  // --- Menus d'action / retrait de rôle ---
  if (interaction.isStringSelectMenu()) {
    const v = interaction.values[0];
    if (state.step === 'removerole') {
      await ackDeferUpdate(interaction);
      const idx = Number(v);
      if (Number.isFinite(idx)) state.values.options.splice(idx, 1);
      return interaction.editReply({ embeds: [summaryEmbed(state)], components: removeRoleComponents(state) }).catch(() => {});
    }
    // Actions ouvrant une modale : PAS de defer avant showModal (interdit par Discord)
    if (v === 'name') { state.modal = 'name'; return interaction.showModal(textModal(botId, uid, '✏️ Nom du panneau', 'Nom', state.values.name || 'Rôles du serveur', true, 50)); }
    if (v === 'content') { state.modal = 'content'; return interaction.showModal(textModal(botId, uid, '📝 Texte au-dessus', 'Texte affiché au-dessus du menu', 'Choisis tes rôles !', false, 1900)); }
    if (v === 'placeholder') { state.modal = 'placeholder'; return interaction.showModal(textModal(botId, uid, '🔽 Texte du menu', 'Texte gris d\'attente du menu', 'Choisis tes rôles…', false, 150)); }
    // Actions de navigation : accusé de réception puis mise à jour
    await ackDeferUpdate(interaction);
    if (v === 'channel') { state.step = 'channel'; return interaction.editReply({ embeds: [summaryEmbed(state)], components: channelComponents(state) }).catch(() => {}); }
    if (v === 'mode') {
      state.values.mode = state.values.mode === 'buttons' ? 'menu' : 'buttons';
      return interaction.editReply(backToEdit(state)).catch(() => {});
    }
    if (v === 'addrole') { state.step = 'addrole'; return interaction.editReply({ embeds: [summaryEmbed(state)], components: addRoleComponents(state) }).catch(() => {}); }
    if (v === 'removerole') { state.step = 'removerole'; return interaction.editReply({ embeds: [summaryEmbed(state)], components: removeRoleComponents(state) }).catch(() => {}); }
    if (v === 'finish') { wizards.delete(key); return finish(botId, state, interaction); }
    if (v === 'cancel') {
      wizards.delete(key);
      return interaction.editReply({ content: '❌ Annulé — rien n\'a été enregistré.', embeds: [], components: [] }).catch(() => {});
    }
    return true;
  }

  // --- Boutons (terminé les rôles / retour / salon actuel) ---
  if (interaction.isButton()) {
    const action = parts[4];
    await ackDeferUpdate(interaction);
    if (action === 'doneroles' || action === 'back') {
      state.pendingRole = null;
      return interaction.editReply(backToEdit(state)).catch(() => {});
    }
    if (action === 'skipchannel') {
      state.values.channel = '';
      return interaction.editReply(backToEdit(state)).catch(() => {});
    }
  }
  return true;
}

module.exports = { start, handleWizardInteraction, wizards };
