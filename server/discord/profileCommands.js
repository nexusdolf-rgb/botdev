// ============================================================
// BotDev - Commandes Discord du panneau d'identité du bot
//   /botprofile  → identité du bot sur CE serveur (nom, avatar, bannière, bio, couleur)
//   /modlogs     → salon des journaux de modération
//   /blacklist   → liste noire de mots
// Permissions : propriétaire ou Administrateur sur le serveur concerné.
// ============================================================
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const store = require('../db');
const assets = require('../assets');
const identity = require('./identity');
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
    return interaction.reply({ content: '🌍 Cette commande se configure sur un **serveur Discord**. Ajoute-moi à ton serveur avec `/invite` !', ephemeral: true });
  }
  const guild = interaction.guild;
  const sub = interaction.options.getSubcommand();
  const botRecord = store.bots.get(botId);

  if (interaction.commandName === 'botprofile') {
    if (!isAdmin(interaction)) {
      return interaction.reply({ content: '⛔ Seul le **propriétaire du serveur** ou un membre ayant la permission Discord **Administrateur** peut personnaliser l\'identité du bot.', ephemeral: true });
    }
    if (sub === 'setup') {
      const { startProfileWizard } = require('./profileWizard');
      return startProfileWizard(botId, interaction);
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
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return interaction.reply({ content: '❌ Couleur au format hexadécimal : #e07a5f', ephemeral: true });
        p.color = color;
      }
      store.botProfiles.set(botId, guild.id, p);
      return interaction.reply({
        content: ui.sectionize('✅ Identité mise à jour !\n\n📛 Nom : **' + (p.name || botRecord.name) + '**\n🎨 Couleur : ' + p.color + '\n📝 Bio : ' + (p.bio ? 'définie' : 'aucune') + '\n\nContinue avec `/botprofile avatar` et `/botprofile banner` pour les images.', 2000),
        ephemeral: true,
      });
    }

    if (sub === 'avatar' || sub === 'banner') {
      const file = interaction.options.getAttachment('image');
      if (!file) return interaction.reply({ content: '❌ Joins une image : touche l\'option « image », ta galerie s\'ouvre automatiquement.', ephemeral: true });
      if (file.size > 3 * 1024 * 1024) return interaction.reply({ content: '❌ Image trop lourde (3 Mo max).', ephemeral: true });
      // 📥 On répond immédiatement « en cours » : le téléchargement peut prendre
      // quelques secondes, sinon Discord affiche « l\'application ne répond plus ».
      try { await interaction.deferReply({ ephemeral: true }); } catch {}
      // Un assistant est en cours ? → on applique la photo directement à l'étape
      try {
        const { applyAttachmentToWizard } = require('./profileWizard');
        const applied = await applyAttachmentToWizard(botId, guild.id, interaction.user.id, sub, file.url, file.contentType || 'image/png', file.size || 0);
        if (applied) {
          return interaction.editReply({ content: `✅ Photo appliquée à l\'assistant ! Continue avec « Suivant ➡️ » ou envoie la suite.` });
        }
      } catch (e) {
        return interaction.editReply({ content: `⚠️ ${e.message.slice(0, 120)}` });
      }
      try {
        const res = await fetch(file.url);
        if (!res.ok) return interaction.editReply({ content: `⚠️ Impossible de récupérer l\'image (${res.status}).` });
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > 3 * 1024 * 1024) return interaction.editReply({ content: '❌ Image trop lourde (3 Mo max).' });
        const key = await assets.put(buf, file.contentType || 'image/png');
        if (sub === 'avatar') p.avatar_url = `/assets/${key}`;
        else p.banner_url = `/assets/${key}`;
        store.botProfiles.set(botId, guild.id, p);
        return interaction.editReply({
          content: ui.sectionize(`✅ ${sub === 'avatar' ? 'Avatar' : 'Bannière'} enregistré ! Le bot utilisera cette identité sur ce serveur.\n\nVérifie avec \`/botprofile view\`.`, 2000),
        });
      } catch (e) {
        return interaction.editReply({ content: `⚠️ Impossible de récupérer l\'image : ${e.message.slice(0, 120)}` });
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
