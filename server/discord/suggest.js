// ============================================================
// BotDev - Suggestions : /suggest + votes 👍👎 + statut staff
// ============================================================
// v232 — EmbedBuilder retiré : les suggestions sont en Components V2 (ui.v2panel).
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('./ui');
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

// v232 — SÉPARATEURS NATIFS PLEINE LARGEUR (Components V2).
// Le trait texte ━ s'arrêtait avant le bord arrondi de l'embed ; le Separator
// V2 est un composant de layout que Discord dessine bord à bord, comme dans le
// panneau de tickets personnalisés qui sert de référence au bot.
// `ping` : en Components V2 le champ `content` du message est INTERDIT. Le
// ping @everyone / rôle devient donc un TextDisplay en tête de conteneur — les
// mentions y notifient bien (doc officielle) et allowedMentions reste appliqué.
function buildPanel(s, authorTag, settings = {}, ping = '') {
  const customColor = /^#[0-9a-fA-F]{6}$/.test(String((settings && settings.suggestion_color) || '')) ? settings.suggestion_color : '';
  return ui.v2panel({
    ...(ping ? { content: ping } : {}),
    color: customColor || (s.status === 'approved' ? '#57F287' : s.status === 'denied' ? '#ED4245' : '#e07a5f'),
    author: { name: `Suggestion #${s.id} — ${authorTag || 'membre'}` },
    description: String(s.text || '').slice(0, 1500),
    // Les 3 compteurs étaient en inline:true (grille 3 colonnes des embeds).
    // Components V2 n'a pas de champs inline : ui.v2panel les regroupe par 3
    // dans un seul bloc séparé par « · » → le rendu reste compact, sur une
    // ligne, sans dégrader l'information.
    fields: [
      { name: '📊 Statut', value: STATUS_EMOJI[s.status] || 'En attente', inline: true },
      { name: '👍 Votes', value: String(s.upvotes), inline: true },
      { name: '👎 Votes', value: String(s.downvotes), inline: true },
    ],
    // v241 — « Votez avec les boutons » expliquait l'évidence : les boutons sont
    // juste en dessous. Le pied ne garde que la signature produit, alignée sur le
    // panneau de tickets (`Hoxera · Support`) : le numéro de suggestion figure
    // déjà dans le titre, et une information ne s'écrit qu'une fois par panneau.
    footer: 'Hoxera · Suggestions',
  }, buildComponents(s, settings));
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
    ...buildPanel(s, interaction.user.tag, settings, pingContent),
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
    // v232 — le message d'origine est en Components V2 : Discord interdit d'en
    // sortir à l'édition, donc la mise à jour des votes reste en V2.
    await interaction.update(buildPanel(fresh, '', settings));
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
  await interaction.update(buildPanel(fresh, '', settings));   // v232 — reste en V2
  // 📢 Salon des approuvées : annonce publique quand une suggestion est validée
  if (action === 'approve' && settings.suggestion_approve_channel) {
    try {
      const approveChan = suggestionChannel(botId, interaction.guild);
      const targetRef = settings.suggestion_approve_channel;
      const idMatch = targetRef.match(/(\d{15,21})/);
      const chan = idMatch ? interaction.guild.channels.cache.get(idMatch[1]) : null
        || interaction.guild.channels.cache.find((c) => c && c.name && c.name.toLowerCase() === targetRef.replace(/^#/, '').toLowerCase() && c.isTextBased && c.isTextBased());
      if (chan && typeof chan.send === 'function') {
        // v232 — séparateurs natifs pleine largeur.
        await chan.send(ui.v2panel({
          color: '#57F287',
          author: { name: '✅ Suggestion approuvée' },
          description: `**${String(fresh.text || '').slice(0, 1500)}**\n\n💡 Suggestion de <@${fresh.author_id}> — **approuvée par le staff** !`,
          footer: `Hoxera · Suggestion #${fresh.id}`,
        })).catch(() => {});
      }
    } catch (e) {}
  }
  return;
}

module.exports = { submitSuggestion, handleSuggestionButton, suggestionChannel, buildPanel, buildComponents };
