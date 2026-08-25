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

function buildEmbed(s, authorTag) {
  return new EmbedBuilder()
    .setColor(s.status === 'approved' ? '#57F287' : s.status === 'denied' ? '#ED4245' : '#5865F2')
    .setAuthor({ name: `Suggestion #${s.id} — ${authorTag || 'membre'}` })
    .setDescription(String(s.text || '').slice(0, 1500))
    .addFields(
      { name: '📊 Statut', value: STATUS_EMOJI[s.status] || 'En attente', inline: true },
      { name: '👍 Votes', value: String(s.upvotes), inline: true },
      { name: '👎 Votes', value: String(s.downvotes), inline: true },
    )
    .setFooter({ text: `Hoxera · Suggestion #${s.id} · Vote avec les boutons` })
    .setTimestamp();
}

function buildComponents(s) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:up:${s.id}`).setLabel(`👍 ${s.upvotes}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:down:${s.id}`).setLabel(`👎 ${s.downvotes}`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:approve:${s.id}`).setLabel('✅ Approuver').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:deny:${s.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  )];
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
  const s = store.suggestions.get(id);
  const msg = await channel.send({ embeds: [buildEmbed(s, interaction.user.tag)], components: buildComponents(s) });
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

  if (action === 'up' || action === 'down') {
    const res = store.suggestions.vote(sid, interaction.user.id, action);
    const fresh = store.suggestions.get(sid);
    await interaction.update({ embeds: [buildEmbed(fresh, '')], components: buildComponents(fresh) });
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
  await interaction.update({ embeds: [buildEmbed(fresh, '')], components: buildComponents(fresh) });
  return;
}

module.exports = { submitSuggestion, handleSuggestionButton, suggestionChannel, buildEmbed, buildComponents };
