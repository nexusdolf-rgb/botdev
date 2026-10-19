// ============================================================
// BotDev - Commandes Discord de configuration du serveur
//   /modlogs     → salon des journaux de modération
//   /blacklist   → liste noire de mots
// (v374 — /botprofile et l'identité par serveur sont retirés.)
// Permissions : propriétaire ou Administrateur sur le serveur concerné.
// ============================================================
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const store = require('../db');
const { canConfigureGuild } = require('./permissions');
// v229 : grammaire des sections (traits ━) pour les accusés de réception texte.
const ui = require('./ui');

function isOwner(interaction) {
  return interaction.guild.ownerId === interaction.user.id;
}

function isAdmin(interaction) {
  return canConfigureGuild(interaction.guild, interaction.member, interaction.user && interaction.user.id);
}

async function handleProfileCommand(botId, interaction) {
  // 🌍 Commandes globales : en message privé, on répond poliment.
  if (!interaction.guild) {
    return interaction.reply({ content: '🌍 Cette commande se configure sur un **serveur Discord**. Ajoutez-moi à votre serveur avec `/invite` !', ephemeral: true });
  }
  const guild = interaction.guild;
  const sub = interaction.options.getSubcommand();
  const botRecord = store.bots.get(botId);

  // ---------------------- /modlogs ----------------------
  if (interaction.commandName === 'modlogs') {
    if (!isOwner(interaction) && !isAdmin(interaction)) {
      return interaction.reply({ content: '⛔ Réservé au propriétaire ou aux administrateurs.', ephemeral: true });
    }
    if (sub === 'set') {
      const ch = interaction.options.getChannel('salon');
      if (!ch || !ch.isTextBased()) return interaction.reply({ content: '❌ Salon invalide.', ephemeral: true });
      store.guildSettings.set(botId, guild.id, { log_channel: `#${ch.name}` });
      return interaction.reply({ content: `✅ Les journaux (modération, tickets, auto-mod, arrivées/départs) seront envoyés dans ${ch}.`, ephemeral: true });
    }
    if (sub === 'off') {
      store.guildSettings.set(botId, guild.id, { log_channel: '' });
      return interaction.reply({ content: '⛔ Journaux désactivés.', ephemeral: true });
    }
    // view
    const gs = store.guildSettings.get(botId, guild.id) || {};
    return interaction.reply({
      content: gs.log_channel
        ? `📋 Salon des journaux : **${gs.log_channel}**\nModifiez : \`/modlogs set #salon\` · Désactivez : \`/modlogs off\``
        : '📋 Aucun salon de journaux.\nActivez : `/modlogs set #salon`',
      ephemeral: true,
    });
  }

  // ---------------------- /blacklist ----------------------
  if (interaction.commandName === 'blacklist') {
    if (!isOwner(interaction) && !isAdmin(interaction)) {
      return interaction.reply({ content: '⛔ Réservé au propriétaire ou aux administrateurs.', ephemeral: true });
    }
    if (sub === 'add') {
      const word = (interaction.options.getString('mot') || '').trim().toLowerCase();
      if (!word || word.length < 2) return interaction.reply({ content: '❌ Mot invalide (2 caractères minimum).', ephemeral: true });
      store.blacklist.add(botId, guild.id, word);
      const list = store.blacklist.all(botId, guild.id);
      return interaction.reply({ content: `✅ « ${word} » ajouté à la liste noire (${list.length} mot(s)). Les messages contenant ces mots seront supprimés automatiquement.`, ephemeral: true });
    }
    if (sub === 'remove') {
      const word = (interaction.options.getString('mot') || '').trim().toLowerCase();
      store.blacklist.remove(botId, guild.id, word);
      return interaction.reply({ content: `✅ « ${word} » retiré (s'il y était).`, ephemeral: true });
    }
    // list
    const list = store.blacklist.all(botId, guild.id);
    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('🔇 Liste noire de mots')
      .setDescription(list.length ? list.map((w) => `• ${w}`).join('\n').slice(0, 1900) : 'Aucun mot interdit.')
      .setFooter({ text: '/blacklist add mot · /blacklist remove mot' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return null;
}

module.exports = { handleProfileCommand };
