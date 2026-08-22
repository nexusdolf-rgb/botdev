// ============================================================
// Hoxera — Internationalisation (brique 5 : FR/EN)
// Chaque serveur choisit sa langue (/lang fr|en) et les messages
// publics du bot suivent. Repli : français.
// ============================================================
const store = require('./db');

const STRINGS = {
  fr: {
    // Panneau de tickets
    panel_title: '👑 Support | {server}',
    panel_welcome: 'Bienvenue sur le support officiel de {server}',
    panel_desc: 'Pour ouvrir un ticket, sélectionnez la catégorie correspondante à votre besoin via le menu ci-dessous et veuillez détailler en quelques lignes votre demande avant l\'ouverture.',
    panel_info_title: '__ⓘ Informations importantes :__',
    panel_rule1: '🔴➡️ Soyez clair et précis dans votre demande.',
    panel_rule2: '🔴➡️ Le manque de respect envers le staff est strictement interdit.',
    panel_rule3: '🔴➡️ Évitez les mentions inutiles.',
    panel_rule4: '🔴➡️ Les tickets inactifs pendant 2 heures seront automatiquement fermés puis supprimés.',
    panel_patience: '*⏳ Merci de votre patience, un membre du staff prendra votre ticket en charge dès que possible.*',
    // Salon de ticket
    ticket_title: '🎫 Ticket ouvert — prise en charge en cours',
    ticket_type: '🗂️ Type de ticket',
    ticket_about: 'ℹ️ À propos de ce type',
    ticket_team: '🛡️ Équipe en charge',
    ticket_team_default: 'le staff du serveur',
    ticket_reason: '📝 Votre demande',
    ticket_answers: '📝 Réponses au questionnaire',
    ticket_steps: '📋 Déroulement de la prise en charge',
    ticket_step1: '1️⃣ Décrivez votre demande en détail (textes, captures d\'écran, fichiers).',
    ticket_step2: '2️⃣ Un membre du staff vous répond ici, dans ce salon privé.',
    ticket_step3: '3️⃣ À la fermeture définitive du ticket, la **transcription complète** vous est envoyée en message privé.',
    ticket_buttons: '🔒 Boutons réservés au staff',
    ticket_buttons_desc: '**🖐️ Prendre en charge** — s\'attribuer le ticket · **➕ Ajouter un membre** — inviter quelqu\'un · **🔒 Fermer** — verrouiller (réouvrable) · **⏸ En attente** — lecture seule · **🔓 Réouvrir** · **🗑 Supprimer** — fermeture définitive avec transcription en MP.\n🔒 *Réservés au staff du serveur.*',
    ticket_welcome_desc: 'Bienvenue {member} ! Votre demande a bien été enregistrée. Un membre de notre équipe vous répondra dans les plus brefs délais.\n\nVous pouvez dès maintenant décrire votre demande en détail : textes, captures d\'écran et fichiers sont les bienvenus.',
    ticket_first_line: '🎫 {type} — ticket de {member}',
    ticket_confirm: '✅ Ton ticket {type} a été créé : **{channel}** — clique dessus pour l\'ouvrir !',
    // Transcription (MP)
    transcript_title: '🎫 Ton ticket a été clôturé',
    transcript_desc: 'Merci d\'avoir contacté l\'équipe de **{server}** 👋\n\nTon ticket a été **traité et clôturé** par notre équipe.\nTu trouveras ci-dessous l\'intégralité de la conversation :\n\n📄 **Consulter la transcription** : [clique ici]({url})\n\n💬 *Besoin d\'aide à nouveau ? Rouvre simplement un ticket depuis le panneau du serveur.*',
    transcript_desc_file: 'Merci d\'avoir contacté l\'équipe de **{server}** 👋\n\nTon ticket a été **traité et clôturé** par notre équipe.\nTu trouveras ci-dessous l\'intégralité de la conversation :\n\n📄 **Transcription** : fichier joint ci-dessous.\n\n💬 *Besoin d\'aide à nouveau ? Rouvre simplement un ticket depuis le panneau du serveur.*',
    footer_tickets: 'Système de tickets',
    // Auto-modération (avertissements MP)
    am_dm_title: '🛡️ Auto-modération — {server}',
    am_dm_deleted: 'Ton message a été supprimé sur **{server}**.\n📌 Raison : {reason}.',
    am_dm_no_perm: 'Ton message aurait dû être supprimé sur **{server}** ({reason}), mais le bot n\'a pas la permission de supprimer les messages dans ce salon. Le staff a été prévenu.',
    am_dm_spam: 'Tu as envoyé trop de messages en très peu de temps sur **{server}** (spam). Tes messages ont été supprimés et tu es en timeout pendant {minutes} minute(s).',
    am_reason_link: 'lien non autorisé',
    am_reason_caps: 'trop de majuscules',
    am_reason_mentions: 'trop de mentions',
    am_reason_word: 'mot interdit (« {word} »)',
    // Tickets niveau pro (v85)
    ticket_number: '🎫 Ticket #{number}',
    ticket_opened_at: '📅 Ouvert le {date}',
    ticket_claimed: '🖐️ Pris en charge par {staff}',
    ticket_previous: '📂 Tickets précédents de ce membre',
    ticket_previous_none: 'premier ticket',
    ticket_claim_ok: '✅ Ticket pris en charge. Ton nom est affiché dans le salon.',
    ticket_claim_msg: '🖐️ **{staff}** prend ce ticket en charge.',
    ticket_add_modal_title: '➕ Ajouter un membre au ticket',
    ticket_add_modal_label: 'Membre à ajouter',
    ticket_add_modal_ph: '@membre ou identifiant',
    ticket_add_ok: '✅ {member} a été ajouté au ticket.',
    ticket_add_err: '❌ Membre introuvable. Donne une @mention ou un identifiant valide.',
    ticket_auto_warn: '⏰ **Rappel** : ce ticket est inactif depuis un moment. Sans nouveau message, il sera **fermé automatiquement dans 10 minutes** (puis supprimé après 24 h).',
    ticket_auto_closed: '⏰ Ticket **fermé automatiquement** : 2 heures sans activité.\n📄 La transcription sera envoyée à la suppression définitive.',
    ticket_auto_deleted: '⏰ Ticket **supprimé automatiquement** : fermé depuis plus de 24 h.',
    ticket_rating_title: '⭐ Comment évalues-tu notre support ?',
    ticket_rating_desc: 'Ton ticket **#{number}** sur **{server}** vient d\'être clôturé. Merci de noter la prise en charge :',
    ticket_rating_thanks: '🙏 Merci pour ta note ! Elle aide {server} à s\'améliorer.',
    ticket_rating_done: '⭐ Note enregistrée : {stars}/5 — merci !',
    ticket_rating_already: 'Tu as déjà noté ce ticket.',
    // Bouclier anti-raid
    raid_alert_title: '🚨 RAID DÉTECTÉ — {server}',
    raid_alert_desc: '**{count} arrivées en {window} secondes** détectées → verrouillage automatique des salons pour protéger le serveur. Réouvre-les avec le dashboard ou `/lockdown off`.',
    raid_alert_only: '**{count} arrivées en {window} secondes** détectées → alerte envoyée (mode alerte : pas de verrouillage).',
    raid_auto_unlock: '\n🔓 Réouverture automatique prévue dans {minutes} minute(s).',
    raid_unlocked: 'Fin du verrouillage automatique après {minutes} minute(s). Le serveur est rouvert.',
    // Messages génériques (garde d'interaction)
    guard_not_ready: '⏳ Cette commande n\'est pas encore prête sur ce serveur — la synchronisation se fait automatiquement (retente dans 5 à 10 minutes).',
    guard_error: '⚠️ Une erreur est survenue en traitant cette action — elle a été enregistrée, réessaie dans un instant.',
    guard_slow: '⏳ Cette action prend trop de temps… réessaie dans un instant.',
    guard_busy: '😅 Nexora est très sollicité en ce moment — réessaie dans une minute !',
    // Commande /lang
    lang_set: '🌍 Langue du serveur définie sur : **Français** 🇫🇷',
    lang_usage: '❓ Utilisation : `/lang fr` ou `/lang en`.',
    // Aide
    help_title: '📚 Centre d\'aide — {bot}',
    // Assistant rôles
    rw_title: '📋 Assistant des rôles',
    rw_edit_title: '✏️ Modifier le panneau de rôles',
    rw_summary: 'Récapitulatif en direct — choisis une action ci-dessous.',
  },
  en: {
    panel_title: '👑 Support | {server}',
    panel_welcome: 'Welcome to the official support of {server}',
    panel_desc: 'To open a ticket, select the category that matches your needs in the menu below, and please describe your request in a few lines before opening.',
    panel_info_title: '__ⓘ Important information:__',
    panel_rule1: '🔴➡️ Be clear and precise in your request.',
    panel_rule2: '🔴➡️ Disrespect towards the staff is strictly forbidden.',
    panel_rule3: '🔴➡️ Avoid unnecessary mentions.',
    panel_rule4: '🔴➡️ Tickets inactive for 2 hours will be automatically closed and deleted.',
    panel_patience: '*⏳ Thank you for your patience, a staff member will take care of your ticket as soon as possible.*',
    ticket_title: '🎫 Ticket opened — being handled',
    ticket_type: '🗂️ Ticket type',
    ticket_about: 'ℹ️ About this type',
    ticket_team: '🛡️ Team in charge',
    ticket_team_default: 'the server staff',
    ticket_reason: '📝 Your request',
    ticket_answers: '📝 Questionnaire answers',
    ticket_steps: '📋 How it works',
    ticket_step1: '1️⃣ Describe your request in detail (text, screenshots, files).',
    ticket_step2: '2️⃣ A staff member will answer you here, in this private channel.',
    ticket_step3: '3️⃣ Once the ticket is permanently closed, the **full transcript** is sent to you by DM.',
    ticket_buttons: '🔒 Staff buttons',
    ticket_buttons_desc: '**🖐️ Claim** — take the ticket · **➕ Add member** — invite someone · **🔒 Close** — lock (reopenable) · **⏸ On hold** — read only · **🔓 Reopen** · **🗑 Delete** — final close with transcript by DM.\n🔒 *Staff only.*',
    ticket_welcome_desc: 'Welcome {member}! Your request has been recorded. A member of our team will answer you as soon as possible.\n\nYou can now describe your request in detail: text, screenshots and files are welcome.',
    ticket_first_line: '🎫 {type} — ticket from {member}',
    ticket_confirm: '✅ Your ticket {type} has been created: **{channel}** — click to open it!',
    transcript_title: '🎫 Your ticket has been closed',
    transcript_desc: 'Thank you for contacting the **{server}** team 👋\n\nYour ticket has been **handled and closed** by our team.\nYou will find the full conversation below:\n\n📄 **View the transcript**: [click here]({url})\n\n💬 *Need help again? Just open a new ticket from the server panel.*',
    transcript_desc_file: 'Thank you for contacting the **{server}** team 👋\n\nYour ticket has been **handled and closed** by our team.\nYou will find the full conversation below:\n\n📄 **Transcript**: file attached below.\n\n💬 *Need help again? Just open a new ticket from the server panel.*',
    footer_tickets: 'Ticket system',
    // Auto-moderation (DM warnings)
    am_dm_title: '🛡️ Auto-moderation — {server}',
    am_dm_deleted: 'Your message was deleted on **{server}**.\n📌 Reason: {reason}.',
    am_dm_no_perm: 'Your message should have been deleted on **{server}** ({reason}), but the bot lacks the permission to delete messages in that channel. The staff has been notified.',
    am_dm_spam: 'You sent too many messages in a very short time on **{server}** (spam). Your messages were deleted and you are timed out for {minutes} minute(s).',
    am_reason_link: 'unallowed link',
    am_reason_caps: 'too many capital letters',
    am_reason_mentions: 'too many mentions',
    am_reason_word: 'forbidden word ("{word}")',
    // Pro tickets (v85)
    ticket_number: '🎫 Ticket #{number}',
    ticket_opened_at: '📅 Opened on {date}',
    ticket_claimed: '🖐️ Handled by {staff}',
    ticket_previous: '📂 Previous tickets from this member',
    ticket_previous_none: 'first ticket',
    ticket_claim_ok: '✅ Ticket claimed. Your name is now shown in the channel.',
    ticket_claim_msg: '🖐️ **{staff}** is taking this ticket.',
    ticket_add_modal_title: '➕ Add a member to the ticket',
    ticket_add_modal_label: 'Member to add',
    ticket_add_modal_ph: '@member or user ID',
    ticket_add_ok: '✅ {member} has been added to the ticket.',
    ticket_add_err: '❌ Member not found. Provide an @mention or a valid ID.',
    ticket_auto_warn: '⏰ **Reminder**: this ticket has been inactive for a while. Without a new message, it will be **automatically closed in 10 minutes** (then deleted after 24 h).',
    ticket_auto_closed: '⏰ Ticket **automatically closed**: 2 hours without activity.\n📄 The transcript will be sent on final deletion.',
    ticket_auto_deleted: '⏰ Ticket **automatically deleted**: closed for more than 24 h.',
    ticket_rating_title: '⭐ How would you rate our support?',
    ticket_rating_desc: 'Your ticket **#{number}** on **{server}** has just been closed. Please rate how we handled it:',
    ticket_rating_thanks: '🙏 Thank you! Your rating helps {server} improve.',
    ticket_rating_done: '⭐ Rating saved: {stars}/5 — thank you!',
    ticket_rating_already: 'You already rated this ticket.',
    // Anti-raid shield
    raid_alert_title: '🚨 RAID DETECTED — {server}',
    raid_alert_desc: '**{count} joins in {window} seconds** detected → automatic channel lockdown to protect the server. Reopen from the dashboard or `/lockdown off`.',
    raid_alert_only: '**{count} joins in {window} seconds** detected → alert sent (alert mode: no lockdown).',
    raid_auto_unlock: '\n🔓 Automatic reopen planned in {minutes} minute(s).',
    raid_unlocked: 'Automatic lockdown over after {minutes} minute(s). The server is reopened.',
    guard_not_ready: '⏳ This command is not ready yet on this server — it syncs automatically (try again in 5–10 minutes).',
    guard_error: '⚠️ Something went wrong while handling this action — it was logged, please try again in a moment.',
    guard_slow: '⏳ This action is taking too long… please try again in a moment.',
    guard_busy: '😅 Nexora is very busy right now — try again in a minute!',
    lang_set: '🌍 Server language set to: **English** 🇬🇧',
    lang_usage: '❓ Usage: `/lang fr` or `/lang en`.',
    help_title: '📚 Help center — {bot}',
    rw_title: '📋 Role panel wizard',
    rw_edit_title: '✏️ Edit role panel',
    rw_summary: 'Live summary — pick an action below.',
  },
};

const LANG_CODES = { fr: 'fr', en: 'en' };
const DEFAULT_LANG = 'fr';

function normalize(lang) {
  const l = String(lang || '').toLowerCase().slice(0, 2);
  return LANG_CODES[l] || DEFAULT_LANG;
}

// Langue d'un serveur (colonne lang des réglages)
function langForGuild(guildId) {
  try {
    if (!guildId) return DEFAULT_LANG;
    const row = store.db.prepare("SELECT lang FROM guild_settings WHERE guild_id = ? AND lang != '' LIMIT 1").get(String(guildId));
    return normalize(row && row.lang);
  } catch { return DEFAULT_LANG; }
}

// Traduit une clé avec des variables {x} — repli français si absent
function t(lang, key, vars = {}) {
  const l = normalize(lang);
  const table = STRINGS[l] || STRINGS[DEFAULT_LANG];
  let text = table[key] !== undefined ? table[key] : (STRINGS[DEFAULT_LANG][key] || key);
  for (const [k, v] of Object.entries(vars)) {
    text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

// Textes du panneau de tickets pour une langue
function panelTexts(lang) {
  const rules = [t(lang, 'panel_rule1'), t(lang, 'panel_rule2'), t(lang, 'panel_rule3'), t(lang, 'panel_rule4')];
  return {
    title: (server) => t(lang, 'panel_title', { server }),
    welcome: (server) => t(lang, 'panel_welcome', { server }),
    desc: t(lang, 'panel_desc'),
    infoTitle: t(lang, 'panel_info_title'),
    rules,
    patience: t(lang, 'panel_patience'),
  };
}

module.exports = { t, langForGuild, panelTexts, normalize, DEFAULT_LANG };
