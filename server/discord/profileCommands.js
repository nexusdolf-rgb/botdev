// ============================================================
// BotDev - Commandes Discord du panneau d'identité du bot
//   /botprofile  → identité du bot sur CE serveur (nom, avatar, bannière, bio, couleur)
//   /modlogs     → salon des journaux de modération
//   /blacklist   → liste noire de mots
// Permissions : propriétaire du serveur (botprofile) / propriétaire ou admins (modlogs, blacklist)
// ============================================================
const { PermissionsBitField, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const store = require('../db');
const assets = require('../assets');
const identity = require('./identity');

function isOwner(interaction) {
  return interaction.guild.ownerId === interaction.user.id;
}

function isAdmin(interaction) {
  return interaction.member && interaction.member.permissions
    && typeof interaction.member.permissions.has === 'function'
    && interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function handleProfileCommand(botId, interaction) {
  const guild = interaction.guild;
  const sub = interaction.options.getSubcommand();
  const botRecord = store.bots.get(botId);

  if (interaction.commandName === 'botprofile') {
    if (!isOwner(interaction)) {
      return interaction.reply({ content: '⛔ Seul le **propriétaire du serveur** peut personnaliser l\'identité du bot.', ephemeral: true });
    }
    const p = store.botProfiles.get(botId, guild.id) || {};

    if (sub === 'view') {
      return interaction.reply({ embeds: [identity.buildProfileEmbed(botId, guild.id, botRecord)] });
    }

    if (sub === 'set') {
      const name = interaction.options.getString('nom');
      const bio = interaction.options.getString('bio');
      const color = interaction.options.getString('couleur');
      if (!name && !bio && !color) return interaction.reply({ content: '❌ Précise au moins un élément (nom, bio ou couleur).', ephemeral: true });
      if (name) p.name = name;
      if (bio) p.bio = bio;
      if (color) {
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return interaction.reply({ content: '❌ Couleur au format hexadécimal : #5865F2', ephemeral: true });
        p.color = color;
      }
      store.botProfiles.set(botId, guild.id, p);
      return interaction.reply({
        content: '✅ Identité mise à jour !\n\n📛 Nom : **' + (p.name || botRecord.name) + '**\n🎨 Couleur : ' + p.color + '\n📝 Bio : ' + (p.bio ? 'définie' : 'aucune') + '\n\nContinue avec `/botprofile avatar` et `/botprofile banner` pour les images.',
        ephemeral: true,
      });
    }

    if (sub === 'avatar' || sub === 'banner') {
      const file = interaction.options.getAttachment('image');
      if (!file) return interaction.reply({ content: '❌ Joins une image (choisis-la dans ta galerie).', ephemeral: true });
      if (file.size > 3 * 1024 * 1024) return interaction.reply({ content: '❌ Image trop lourde (3 Mo max).', ephemeral: true });
      try {
        const res = await fetch(file.url);
        const buf = Buffer.from(await res.arrayBuffer());
        const key = await assets.put(buf, file.contentType || 'image/png');
        if (sub === 'avatar') p.avatar_url = `/assets/${key}`;
        else p.banner_url = `/assets/${key}`;
        store.botProfiles.set(botId, guild.id, p);
        return interaction.reply({
          content: `✅ ${sub === 'avatar' ? 'Avatar' : 'Bannière'} enregistré ! Le bot utilisera cette identité sur ce serveur.\n\nVérifie avec \`/botprofile view\`.`,
          ephemeral: true,
        });
      } catch (e) {
        return interaction.reply({ content: `⚠️ Impossible de récupérer l'image : ${e.message.slice(0, 120)}`, ephemeral: true });
      }
    }

    if (sub === 'reset') {
      store.botProfiles.remove(botId, guild.id);
      return interaction.reply({ content: '♻️ Identité personnalisée supprimée — le bot reprend son identité globale sur ce serveur.', ephemeral: true });
    }
    return interaction.reply({ content: '❓ Sous-commande inconnue.', ephemeral: true });
  }

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
        ? `📋 Salon des journaux : **${gs.log_channel}**\nModifie : \`/modlogs set #salon\` · Désactive : \`/modlogs off\``
        : '📋 Aucun salon de journaux.\nActive : `/modlogs set #salon`',
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
