// ============================================================
// BotDev - Commandes Discord de gestion des panneaux (façon Ticket Tool)
//   /ticket ...  → configure et gère le système de tickets sur Discord
//   /roles ...   → liste et envoie les menus de rôles
// Réservées aux administrateurs (default_member_permissions = 8)
// ============================================================
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const store = require('../db');
const { sendTicketPanel, sendRoleMenu, findChannelInGuild } = require('./panels');

const DEFAULT_CFG = {
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

async function handlePanelCommand(botId, interaction) {
  const member = interaction.member;
  if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return interaction.reply({ content: '⛔ Cette commande est réservée aux administrateurs du serveur.', ephemeral: true });
  }
  const guild = interaction.guild;
  const sub = interaction.options.getSubcommand();

  if (interaction.commandName === 'ticket') return handleTicket(botId, sub, interaction, guild, member);
  return handleRoles(botId, sub, interaction, guild);
}

// ---------------------- /ticket ----------------------
async function handleTicket(botId, sub, interaction, guild, member) {
  const cfg = getCfg(botId, guild.id);
  const save = async (fields) => {
    store.tickets.set(botId, guild.id, { ...cfg, ...fields });
    await interaction.reply({ content: '✅ Configuration enregistrée !', ephemeral: true });
  };

  switch (sub) {
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
      if (!channel || !channel.isTextBased()) return interaction.reply({ content: '❌ Salon introuvable. Configure-le avec `/ticket channel` ou précise un salon.', ephemeral: true });
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
          { name: '📨 Salon du panneau', value: cfg.channel || 'non défini (utilise `/ticket channel`)', inline: true },
          { name: '🗂️ Catégorie', value: cfg.category || 'aucune', inline: true },
          { name: '🛡️ Rôle staff', value: cfg.support_role || 'aucun', inline: true },
          { name: '🔘 Bouton', value: cfg.button_label, inline: true },
          { name: '💬 Message', value: cfg.message.slice(0, 200), inline: false },
        )
        .setFooter({ text: 'Utilise les sous-commandes de /ticket pour modifier' });
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

module.exports = { handlePanelCommand };
