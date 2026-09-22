// ============================================================
// BotDev - Suggestions : /suggest + votes 👍👎 + statut staff
// ============================================================
// v232 — EmbedBuilder retiré : les suggestions sont en Components V2 (ui.v2panel).
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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

// 💡 v299 — nouveau statut intermédiaire « 💬 En discussion » (le staff en parle).
const STATUS_EMOJI = { pending: '⏳ En attente', approved: '✅ Approuvée', denied: '❌ Refusée', discussion: '💬 En discussion' };

// v232 — SÉPARATEURS NATIFS PLEINE LARGEUR (Components V2).
// Le trait texte ━ s'arrêtait avant le bord arrondi de l'embed ; le Separator
// V2 est un composant de layout que Discord dessine bord à bord, comme dans le
// panneau de tickets personnalisés qui sert de référence au bot.
// `ping` : en Components V2 le champ `content` du message est INTERDIT. Le
// ping @everyone / rôle devient donc un TextDisplay en tête de conteneur — les
// mentions y notifient bien (doc officielle) et allowedMentions reste appliqué.
function buildPanel(s, authorTag, settings = {}, ping = '') {
  const customColor = /^#[0-9a-fA-F]{6}$/.test(String((settings && settings.suggestion_color) || '')) ? settings.suggestion_color : '';
  // 💡 v299 — anonymat : le pseudo n'apparaît NULLE PART (l'author_id reste en
  // base pour le staff). Le tag est désormais mémorisé (author_tag) : avant,
  // il disparaissait dès la première réédition du message (votes/statut).
  const who = s.anonymous ? '🕶️ Anonyme' : (authorTag || s.author_tag || 'membre');
  const statusColor = s.status === 'approved' ? '#57F287'
    : s.status === 'denied' ? '#ED4245'
      : s.status === 'discussion' ? '#FEE75C'
        : '#e07a5f';
  const fields = [
    { name: '📊 Statut', value: STATUS_EMOJI[s.status] || 'En attente', inline: true },
    { name: '👍 Votes', value: String(s.upvotes), inline: true },
    { name: '👎 Votes', value: String(s.downvotes), inline: true },
  ];
  // 💡 v299 — le motif du refus s'affiche sous la suggestion (bloquet dédié).
  if (s.status === 'denied' && String(s.status_reason || '').trim()) {
    fields.push({ name: '📝 Motif du refus', value: String(s.status_reason).slice(0, 500) });
  }
  return ui.v2panel({
    ...(ping ? { content: ping } : {}),
    color: customColor || statusColor,
    author: { name: `Suggestion #${s.id} — ${who}` },
    description: String(s.text || '').slice(0, 1500),
    // Les 3 compteurs étaient en inline:true (grille 3 colonnes des embeds).
    // Components V2 n'a pas de champs inline : ui.v2panel les regroupe par 3
    // dans un seul bloc séparé par « · » → le rendu reste compact, sur une
    // ligne, sans dégrader l'information.
    fields,
    // v241 — « Votez avec les boutons » expliquait l'évidence : les boutons sont
    // juste en dessous. Le pied ne garde que la signature produit, alignée sur le
    // panneau de tickets (`Hoxera · Support`) : le numéro de suggestion figure
    // déjà dans le titre, et une information ne s'écrit qu'une fois par panneau.
    footer: false,
  }, buildComponents(s, settings));
}

function buildComponents(s, settings = {}) {
  const downAllowed = !(settings && (settings.suggestion_downvotes === 0 || settings.suggestion_downvotes === false));
  const btns = [
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:up:${s.id}`).setLabel(`👍 ${s.upvotes}`).setStyle(ButtonStyle.Primary),
  ];
  if (downAllowed) btns.push(new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:down:${s.id}`).setLabel(`👎 ${s.downvotes}`).setStyle(ButtonStyle.Secondary));
  // 💡 v299 — les actions du staff passent sur leur propre ligne : ✅ Approuver,
  // ❌ Refuser (motif obligatoire via modale) et le nouveau 💬 En discussion.
  const staffBtns = [
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:approve:${s.id}`).setLabel('✅ Approuver').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:deny:${s.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bd-sugg:${s.bot_id}:discuss:${s.id}`).setLabel('💬 En discussion').setStyle(ButtonStyle.Secondary),
  ];
  return [new ActionRowBuilder().addComponents(btns), new ActionRowBuilder().addComponents(staffBtns)];
}

// 💡 v299 — modale « motif du refus » : Discord exige une réponse de modale
// avec le champ `reason` (obligatoire, 500 caractères max).
function denyReasonModal(botId, sid) {
  const modal = new ModalBuilder().setCustomId(`bd-suggdeny:${botId}:${sid}`).setTitle('❌ Refuser la suggestion');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('📝 Motif du refus (affiché publiquement)')
      .setPlaceholder('Ex : déjà proposé, hors budget, pas prioritaire…')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500),
  ));
  return modal;
}

// Le membre peut-il trancher une suggestion ? (propriétaire ou Gérer les messages)
function isSuggStaff(interaction) {
  try {
    if (interaction.guild && interaction.guild.ownerId === interaction.user.id) return true;
    const p = interaction.member && interaction.member.permissions;
    if (p && typeof p.has === 'function' && p.has(0x20)) return true;
  } catch {}
  return false;
}

// 💡 v299 — annonce publique d'une suggestion approuvée (salon des approuvées).
// Anonyme = aucune mention de l'auteur dans l'annonce.
function buildApprovedAnnouncement(s) {
  const who = s.anonymous ? 'Suggestion **anonyme**' : `Suggestion de <@${s.author_id}>`;
  return ui.v2panel({
    color: '#57F287',
    author: { name: '✅ Suggestion approuvée' },
    description: `**${String(s.text || '').slice(0, 1500)}**\n\n💡 ${who} — **approuvée par le staff** !`,
    footer: false,
  });
}

// /suggest texte [anonyme] → poste dans le salon des suggestions
// 💡 v299 — `anon` n'est accepté que si le serveur a activé l'option
// « suggestions anonymes » (dashboard) ; sinon réponse éphémère.
async function submitSuggestion(botId, interaction, text, anon = false) {
  const channel = suggestionChannel(botId, interaction.guild);
  if (!channel) {
    return interaction.reply({ content: '❌ Les suggestions ne sont pas configurées. Le propriétaire doit définir un salon (`/suggestions set #salon`).', ephemeral: true });
  }
  const settings = store.guildSettings.get(botId, interaction.guild.id) || {};
  const wantAnon = anon === true;
  if (wantAnon && !(settings.suggestion_anon === 1 || settings.suggestion_anon === true)) {
    return interaction.reply({ content: '🕶️ Les suggestions anonymes ne sont pas activées sur ce serveur.', ephemeral: true });
  }
  const id = store.suggestions.create({
    bot_id: botId, guild_id: interaction.guild.id,
    author_id: interaction.user.id, text,
    message_id: '', channel_id: channel.id,
    author_tag: (interaction.user && (interaction.user.tag || interaction.user.username)) || '',
    anonymous: wantAnon ? 1 : 0,
  });
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

  // approve / deny / discuss : staff uniquement
  if (!isSuggStaff(interaction)) return interaction.reply({ content: '🔒 Seul le staff peut changer le statut.', ephemeral: true });

  // 💡 v299 — ❌ Refuser ouvre la modale « motif obligatoire » : le refus n'est
  // enregistré qu'à la validation de la modale (submitDenyReason).
  if (action === 'deny') return interaction.showModal(denyReasonModal(botId, sid));
  if (action !== 'approve' && action !== 'discuss') {
    return interaction.reply({ content: '⚠️ Action inconnue.', ephemeral: true });
  }

  store.suggestions.setStatus(sid, action === 'approve' ? 'approved' : 'discussion');
  const fresh = store.suggestions.get(sid);
  await interaction.update(buildPanel(fresh, '', settings));   // v232 — reste en V2
  // 📢 Salon des approuvées : annonce publique quand une suggestion est validée
  if (action === 'approve' && settings.suggestion_approve_channel) {
    try {
      const targetRef = settings.suggestion_approve_channel;
      const idMatch = targetRef.match(/(\d{15,21})/);
      const chan = idMatch ? interaction.guild.channels.cache.get(idMatch[1]) : null
        || interaction.guild.channels.cache.find((c) => c && c.name && c.name.toLowerCase() === targetRef.replace(/^#/, '').toLowerCase() && c.isTextBased && c.isTextBased());
      if (chan && typeof chan.send === 'function') {
        // v232 — séparateurs natifs pleine largeur ; v299 — anonyme respecté.
        await chan.send(buildApprovedAnnouncement(fresh)).catch(() => {});
      }
    } catch (e) {}
  }
  return;
}

// 💡 v299 — validation de la modale « motif du refus ».
async function submitDenyReason(botId, interaction) {
  const sid = parseInt(String(interaction.customId).split(':')[2], 10);
  const s = store.suggestions.get(sid);
  if (!s || s.bot_id !== botId) return interaction.reply({ content: 'Suggestion introuvable.', ephemeral: true });
  if (!isSuggStaff(interaction)) return interaction.reply({ content: '🔒 Seul le staff peut changer le statut.', ephemeral: true });
  let reason = '';
  try { reason = String(interaction.fields.getTextInputValue('reason') || '').trim(); } catch {}
  if (!reason) return interaction.reply({ content: '❓ Le motif du refus est obligatoire.', ephemeral: true });
  store.suggestions.setStatusWithReason(sid, 'denied', reason);
  const fresh = store.suggestions.get(sid);
  const settings = store.guildSettings.get(botId, interaction.guild.id) || {};
  await interaction.update(buildPanel(fresh, '', settings));   // v232 — reste en V2
}

module.exports = { submitSuggestion, handleSuggestionButton, submitDenyReason, denyReasonModal, buildApprovedAnnouncement, suggestionChannel, buildPanel, buildComponents };
