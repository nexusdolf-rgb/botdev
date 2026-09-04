// ============================================================
// BotDev - Suggestions : /suggest + votes 👍👎 + statut staff
// ============================================================
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('../db');

function suggestionChannel(botId, guild) {
  const gs = store.guildSettings.get(botId, guild.id) || {};
  const q = (gs.suggestion_channel || '').trim();
  if (!q) return null;
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) return guild.channels.cache.get(idMatch[1]) || null;
  const name = q.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find((c) => c && c.name && c.name.toLowerCase() === name && c.isTextBased && c.isTextBased()) || null;
}

const STATUS_EMOJI = { pending: '⏳ En attente', approved: '✅ Approuvée', denied: '❌ Refusée' };

function buildEmbed(s, authorTag, settings = {}) {
  const customColor = /^#[0-9a-fA-F]{6}$/.test(String((settings && settings.suggestion_color) || '')) ? settings.suggestion_color : '';
  return new EmbedBuilder()
    .setColor(customColor || (s.status === 'approved' ? '#57F287' : s.status === 'denied' ? '#ED4245' : '#e07a5f'))
    .setAuthor({ name: `Suggestion #${s.id} — ${authorTag || 'membre'}` })
    .setDescription(String(s.text || '').slice(0, 1500))
    .addFields(
      { name: '📊 Statut', value: STATUS_EMOJI[s.status] || 'En attente', inline: true },
      { name: '👍 Votes', value: String(s.upvotes), inline: true },
      { name: '👎 Votes', value: String(s.downvotes), inline: true },
    )
    .setFooter({ text: 'Hoxera · Vote avec les boutons' })
    .setTimestamp();
}

function buildComponents(s, settings = {}) {
  const downAllowed = !(settings && (settings.suggestion_downvotes === 0 || settings.suggestion_downvotes === false));
  const btns = [
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:up:${s.id}`).setLabel(`👍 ${s.upvotes}`).setStyle(ButtonStyle.Primary),
  ];
  if (downAllowed) btns.push(new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:down:${s.id}`).setLabel(`👎 ${s.downvotes}`).setStyle(ButtonStyle.Secondary));
  btns.push(
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:approve:${s.id}`).setLabel('✅ Approuver').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:deny:${s.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  );
  return [new ActionRowBuilder().addComponents(btns)];
}

// /suggest texte → poste dans le salon des suggestions
async function submitSuggestion(botId, interaction, text) {
  const channel = suggestionChannel(botId, interaction.guild);
  if (!channel) {
    return interaction.reply({ content: '❌ Les suggestions ne sont pas configurées. Le propriétaire doit définir un salon (`/suggestions set #salon`).', ephemeral: true });
  }
  const id = store.suggestions.create({
    bot_id: botId, guild_id: interaction.guild.id,
    author_id: interaction.user.id, text,
    message_id: '', channel_id: channel.id,
  });
  const settings = store.guildSettings.get(botId, interaction.guild.id) || {};
  const s = store.suggestions.get(id);
  const pingRef = String(settings.suggestion_ping_role || '').trim();
  let pingContent = '';
  if (pingRef === '@everyone') pingContent = '@everyone';
  else if (pingRef) {
    const role = interaction.guild.roles.cache.find((r) => r.id === pingRef || r.name === pingRef.replace(/^@/, ''));
    if (role) pingContent = `<@&${role.id}>`;
  }
  const msg = await channel.send({
    content: pingContent || undefined,
    embeds: [buildEmbed(s, interaction.user.tag, settings)],
    components: buildComponents(s, settings),
    allowedMentions: pingContent === '@everyone' ? { everyone: true } : (pingContent ? { roles: [pingContent.replace(/<@&|>/g, '')] } : {}),
  });
  store.db.prepare('UPDATE suggestions SET message_id = ? WHERE id = ?').run(msg.id, id);
  return interaction.reply({ content: `💡 Suggestion envoyée dans ${channel} !`, ephemeral: true });
}

// Gère les clics sur les boutons de suggestion
async function handleSuggestionButton(botId, interaction) {
  const parts = String(interaction.customId).split(':');
  const action = parts[2];
  const sid = parseInt(parts[3], 10);
  const s = store.suggestions.get(sid);
  if (!s || s.bot_id !== botId) return interaction.reply({ content: 'Suggestion introuvable.', ephemeral: true });

  const settings = store.guildSettings.get(botId, interaction.guild.id) || {};
  if (action === 'up' || action === 'down') {
    if (action === 'down' && (settings.suggestion_downvotes === 0 || settings.suggestion_downvotes === false)) {
      return interaction.reply({ content: '👎 Les votes négatifs sont désactivés sur ce serveur.', ephemeral: true });
    }
    const res = store.suggestions.vote(sid, interaction.user.id, action);
    const fresh = store.suggestions.get(sid);
    await interaction.update({ embeds: [buildEmbed(fresh, '', settings)], components: buildComponents(fresh, settings) });
    return;
  }

  // approve / deny : staff uniquement
  const member = interaction.member;
  const isStaff = (() => {
    try {
      if (interaction.guild.ownerId === interaction.user.id) return true;
      if (member.permissions && typeof member.permissions.has === 'function' && member.permissions.has(0x20)) return true;
    } catch {}
    return false;
  })();
  if (!isStaff) return interaction.reply({ content: '🔒 Seul le staff peut changer le statut.', ephemeral: true });

  store.suggestions.setStatus(sid, action === 'approve' ? 'approved' : 'denied');
  const fresh = store.suggestions.get(sid);
  await interaction.update({ embeds: [buildEmbed(fresh, '', settings)], components: buildComponents(fresh, settings) });
  // 📢 Salon des approuvées : annonce publique quand une suggestion est validée
  if (action === 'approve' && settings.suggestion_approve_channel) {
    try {
      const approveChan = suggestionChannel(botId, interaction.guild);
      const targetRef = settings.suggestion_approve_channel;
      const idMatch = targetRef.match(/(\d{15,21})/);
      const chan = idMatch ? interaction.guild.channels.cache.get(idMatch[1]) : null
        || interaction.guild.channels.cache.find((c) => c && c.name && c.name.toLowerCase() === targetRef.replace(/^#/, '').toLowerCase() && c.isTextBased && c.isTextBased());
      if (chan && typeof chan.send === 'function') {
        await chan.send({
          embeds: [new EmbedBuilder()
            .setColor('#57F287')
            .setAuthor({ name: '✅ Suggestion approuvée' })
            .setDescription(`**${String(fresh.text || '').slice(0, 1500)}**\n\n💡 Suggestion de <@${fresh.author_id}> — **approuvée par le staff** !`)
            .setFooter({ text: `Hoxera · Suggestion #${fresh.id}` })
            .setTimestamp()],
        }).catch(() => {});
      }
    } catch (e) {}
  }
  return;
}

module.exports = { submitSuggestion, handleSuggestionButton, suggestionChannel, buildEmbed, buildComponents };
