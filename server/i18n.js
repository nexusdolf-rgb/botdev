// ============================================================
// Hoxera — Internationalisation (brique 5 : FR/EN)
// Chaque serveur choisit sa langue (/lang fr|en) et les messages
// publics du bot suivent. Repli : français.
// ============================================================
const store = require('./db');

const STRINGS = {
  fr: {
    // Panneau de tickets
    // v241 — panneau réécrit. Le nom du serveur n'apparaît plus qu'une fois
    // (il est déjà dans la bannière générée et dans le pied de page).
    // ⚠️ `panel_title` sert AUSSI de préfixe de reconnaissance à
    //    `pruneOldPanels` : voir PANEL_TITLE_PREFIXES dans panels.js.
    panel_title: '👑 Support | {server}',
    panel_welcome: 'Bienvenue sur le support officiel de {server}',
    panel_desc: 'Pour ouvrir un ticket, sélectionnez la catégorie correspondante à votre besoin via le menu ci-dessous et veuillez détailler en quelques lignes votre demande avant l\'ouverture.',
    panel_info_title: '__ⓘ Informations importantes :__',
    panel_rule1: '• Soyez clair et précis dans votre demande.',
    panel_rule2: '• Le manque de respect envers le staff est strictement interdit.',
    panel_rule3: '• Évitez les mentions inutiles.',
    panel_rule4: '• Les tickets inactifs pendant 2 heures seront automatiquement fermés puis supprimés.',
    panel_patience: '*⏳ Merci de votre patience, un membre du staff prendra votre ticket en charge dès que possible.*',
    // Salon de ticket
    ticket_title: '🎫 Ticket ouvert',
    ticket_type: '🗂️ Type de ticket',
    ticket_about: 'ℹ️ À propos de ce type',
    ticket_team: '🛡️ Équipe en charge',
    ticket_team_default: 'le staff du serveur',
    ticket_reason: '📝 Votre demande',
    ticket_answers: '📝 Réponses au questionnaire',
    ticket_steps: '📋 Déroulement de la prise en charge',
    ticket_step1: '✍️ Décrivez votre demande ici (texte, captures d’écran, fichiers).',
    ticket_step2: '👥 Un membre de l’équipe vous répond dans ce salon privé.',
    ticket_step3: '📄 À la fermeture définitive, la transcription vous est envoyée en MP.',
    ticket_buttons: '🔒 Actions réservées au staff',
    ticket_buttons_desc: '⚙️ Le menu déroulant ci-dessous est réservé au staff : 🖐️ prendre en charge · ⏸ mettre en attente · 🔒 fermer · 🔓 rouvrir · ➕ ajouter un membre · 🗑 supprimer (transcription en MP).',
    ticket_welcome_desc: 'Bienvenue {member} ! Un membre de l’équipe va vous répondre ici même.\n\n✍️ Décrivez votre demande : texte, captures d’écran ou fichiers.',
    ticket_first_line: '🎫 {type} — ticket de {member}',
    ticket_confirm: '✅ Votre ticket {type} a été créé : **{channel}**',
    // Transcription (MP)
    transcript_title: '🎫 Votre ticket a été clôturé',
    transcript_desc: 'Merci d\'avoir contacté l\'équipe de **{server}** 👋\n\nVotre ticket a été **traité et clôturé**.\nVous trouverez ci-dessous l\'intégralité de la conversation :\n\n📄 **Consulter la transcription** : [consulter la transcription]({url})\n\n💬 *Besoin d\'aide à nouveau ? Rouvrez simplement un ticket depuis le panneau du serveur.*',
    transcript_desc_file: 'Merci d\'avoir contacté l\'équipe de **{server}** 👋\n\nVotre ticket a été **traité et clôturé**.\nVous trouverez ci-dessous l\'intégralité de la conversation :\n\n📄 **Transcription** : fichier joint ci-dessous.\n\n💬 *Besoin d\'aide à nouveau ? Rouvrez simplement un ticket depuis le panneau du serveur.*',
    footer_tickets: 'Système de tickets',
    // Auto-modération (avertissements publics + MP)
    am_dm_title: '🛡️ Auto-modération — {server}',
    am_dm_deleted: 'Votre message a été supprimé sur **{server}**.\n📌 Raison : {reason}.',
    am_dm_no_perm: 'Votre message aurait dû être supprimé sur **{server}** ({reason}), mais le bot ne dispose pas de la permission de supprimer les messages dans ce salon. Le staff a été prévenu.',
    am_dm_spam: 'Vous avez envoyé trop de messages en très peu de temps sur **{server}**. Vos messages ont été supprimés et vous êtes en pause pour {minutes} minute(s).',
    am_reason_link: 'lien non autorisé',
    am_reason_caps: 'trop de majuscules',
    am_reason_mentions: 'trop de mentions',
    am_reason_word: 'mot interdit (« {word} »)',
    am_reason_spam: 'spam / trop de messages',
    // v243 — Phishing / faux Nitro. Deux niveaux : la certitude haute vient
    // d'un domaine connu, d'un typosquat ou d'une propagation multi-salons ;
    // la certitude moyenne d'un domaine-appât ou d'une expression d'arnaque.
    am_reason_phishing: 'lien de phishing / faux Nitro',
    am_reason_phishing_suspect: 'lien suspect : arnaque possible',
    am_dm_phishing: '🎣 Votre message contenait un lien d’arnaque connu (faux Nitro, faux cadeau Steam, vol de compte).\nIl a été supprimé sur **{server}**.\n\nSi vous avez cliqué sur ce lien et saisi votre mot de passe, **changez-le immédiatement** et activez l’authentification à deux facteurs.\nSi vous ne l’avez pas envoyé vous-même, votre compte est peut-être compromis.',
    am_public_warn_title: '⚠️ Avertissement automatique',
    am_public_warn_desc: '<@{userId}>, votre message a été supprimé dans <#{channelId}>.',
    am_public_detected_desc: '<@{userId}>, votre message a été détecté dans <#{channelId}> mais le bot ne pouvait pas le supprimer.',
    am_public_reason: '📌 Raison',
    am_public_level: '📊 Niveau',
    am_public_level_value: 'Avertissement {count}{limit}',
    am_public_next: '⚠️ Le prochain avertissement peut entraîner une sanction automatique.',
    am_public_sanction: '🛡️ Sanction appliquée',
    am_public_timeout: '⏳ Timeout pendant {minutes} minute(s).',
    am_public_kick: '👢 Expulsion automatique.',
    am_public_ban: '🔨 Bannissement automatique.',
    am_public_sanction_failed: '⚠️ La sanction automatique n\'a pas pu être appliquée. Le staff doit vérifier les permissions du bot.',
    am_public_footer: 'Auto-modération · {channel}',
    am_dm_warning_count: 'Avertissement {count}{limit} sur **{server}**.',
    // Tickets niveau pro (v85)
    ticket_number: '🎫 Ticket #{number}',
    ticket_opened_at: '📅 Ouvert le {date}',
    ticket_claimed: '🖐️ Pris en charge par {staff}',
    ticket_previous: '📂 Tickets précédents de ce membre',
    ticket_previous_none: 'premier ticket',
    ticket_claim_ok: '✅ Ticket pris en charge. Votre nom est affiché dans le salon.',
    ticket_claim_msg: '🖐️ **{staff}** prend ce ticket en charge.',
    ticket_add_modal_title: '➕ Ajouter un membre au ticket',
    ticket_add_modal_label: 'Membre à ajouter',
    // v238 — système « ajouter un membre » rendu professionnel : la fenêtre à
    // remplir explique ce qui est accepté, et chaque réponse est un vrai panneau.
    ticket_add_modal_ph: '@mention, identifiant ou pseudo',
    ticket_add_modal_hint: 'Ex : @Alice · 217871817411461121 · alice',
    ticket_add_ok: '✅ {member} a été ajouté au ticket.',
    ticket_add_ok_title: '👤 Membre ajouté au ticket',
    ticket_add_ok_desc: '**{name}** peut maintenant voir le salon, écrire et lire l\'historique.',
    ticket_add_account: '🔖 Compte',
    ticket_add_id: '🆔 Identifiant',
    ticket_add_by: '🖐️ Ajouté par',
    ticket_add_access: '🔓 Accès accordés',
    ticket_add_access_value: 'Voir le salon · Écrire · Historique des messages',
    ticket_add_err: '❌ Membre introuvable. Indiquez une @mention, un identifiant ou un pseudo.',
    ticket_add_err_title: '🔍 Membre introuvable',
    ticket_add_err_desc: 'Aucun membre de **{server}** ne correspond à « {query} ».',
    ticket_add_accepted: '✅ Ce que vous pouvez saisir',
    ticket_add_accepted_value: '• une **@mention** — tapez `@` puis le début du pseudo\n• l\'**identifiant** Discord — 17 à 20 chiffres\n• le **pseudo** ou le **surnom** exact dans ce serveur\n• un **début de pseudo** — je vous propose la liste si plusieurs membres correspondent',
    ticket_add_tip: '💡 Bon à savoir',
    ticket_add_tip_value: 'Le membre doit **déjà être sur le serveur**. Pour copier son identifiant : clic droit sur son profil → « Copier l\'identifiant de l\'utilisateur » (nécessite le mode développeur, dans Réglages Discord → Avancés).',
    ticket_add_amb_title: '🔎 Plusieurs membres correspondent',
    ticket_add_amb_desc: '« {query} » correspond à **{count}** membres de **{server}**. Sélectionnez le bon ci-dessous :',
    ticket_add_retry: '🔁 Réessayer',
    ticket_add_expired: '⏰ La demande a expiré. Recommence depuis le menu « ⚙️ Actions du staff ».',
    ticket_auto_warn: '⏰ **Rappel** : ce ticket est inactif depuis un moment. Sans nouveau message, il sera **fermé automatiquement dans 10 minutes** (puis supprimé après 24 h).',
    ticket_auto_closed: '⏰ Ticket **fermé automatiquement** : 2 heures sans activité.\n📄 La transcription sera envoyée à la suppression définitive.',
    ticket_auto_deleted: '⏰ Ticket **supprimé automatiquement** : fermé depuis plus de 24 h.',
    ticket_rating_title: '⭐ Comment évaluez-vous notre support ?',
    ticket_rating_desc: 'Votre ticket **#{number}** sur **{server}** vient d\'être clôturé. Merci de noter la prise en charge :',
    ticket_rating_thanks: '🙏 Merci pour votre note. Elle aide {server} à s\'améliorer.',
    ticket_rating_done: '⭐ Note enregistrée : {stars}/5. Merci !',
    ticket_rating_already: 'Vous avez déjà noté ce ticket.',
    // Bouclier anti-raid
    raid_alert_title: '🚨 RAID DÉTECTÉ — {server}',
    raid_alert_desc: '**{count} arrivées en {window} secondes** détectées → verrouillage automatique des salons pour protéger le serveur. Réouvre-les avec le dashboard ou `/lockdown off`.',
    raid_alert_only: '**{count} arrivées en {window} secondes** détectées → alerte envoyée (mode alerte : pas de verrouillage).',
    raid_auto_unlock: '\n🔓 Réouverture automatique prévue dans {minutes} minute(s).',

    // v242 — Anti-nuke
    nuke_alert_title: '🛡️ NUKE DÉTECTÉ — {server}',
    nuke_alert_hits: '**{count} actions destructrices en {window} s** attribuées à {actor}.',
    nuke_action_ban: '⛔ Membre banni automatiquement.',
    nuke_action_demote: '🔻 Permission Administrateur retirée.',
    nuke_action_lockdown: '🔒 {locked} salon(s) verrouillé(s).',
    nuke_action_alert: 'ℹ️ Alerte uniquement — aucune sanction appliquée.',
    nuke_failed: '⚠️ Sanction impossible : {error} → alerte envoyée, rien n\'a été appliqué.',
    nuke_blocked_owner: '👑 Auteur = propriétaire du serveur → aucune sanction (protection permanente).',
    nuke_blocked_whitelist: '✅ Auteur en liste blanche → aucune sanction.',
    nuke_blocked_bot: '🤖 Auteur = Hoxera → aucune sanction.',
    nuke_no_actor: '❓ Auteur non identifié → aucune sanction (Hoxera ne punit jamais sans certitude).',
    nuke_audit_missing: '🔑 Journal d\'audit illisible : {error}. Donnez à Hoxera la permission « Voir le journal d\'audit » pour identifier les auteurs. Aucune sanction appliquée.',
    nuke_kind_channel_delete: 'suppression de salon',
    nuke_kind_role_delete: 'suppression de rôle',
    nuke_kind_role_update: 'modification de rôle',
    nuke_kind_ban: 'bannissement',
    nuke_kind_kick: 'expulsion',
    nuke_kind_webhook: 'création de webhook',
    nuke_kind_channel_create: 'création de salon',
    nuke_kind_role_create: 'création de rôle',
    nuke_kind_overwrite: 'modification de permissions de salon',
    nuke_kind_emoji: 'suppression d\'emoji',
    nuke_kind_bot_add: 'ajout d\'un bot',
    nuke_action_quarantine: '🔒 Mis en quarantaine : tous les rôles retirés, membre conservé sur le serveur. Réversible.',
    nuke_blocked_other_bot: '🤖 Auteur = un AUTRE bot → aucune sanction (punir un bot de tickets casserait le serveur). Mettez-le en liste blanche si c\'est attendu.',
    nuke_field_action: '🛡️ Réaction',
    nuke_field_actor: '👤 Auteur',
    nuke_field_hits: '📊 Déclencheurs',
    raid_unlocked: 'Fin du verrouillage automatique après {minutes} minute(s). Le serveur est rouvert.',
    // Messages génériques (garde d'interaction)
    guard_not_ready: '⏳ Cette commande n\'est pas encore prête sur ce serveur — la synchronisation se fait automatiquement (retente dans 5 à 10 minutes).',
    guard_error: '⚠️ Une erreur est survenue en traitant cette action — elle a été enregistrée, réessaie dans un instant.',
    guard_slow: '⏳ Cette action prend trop de temps… réessaie dans un instant.',
    guard_busy: '😅 Hoxera est très sollicité en ce moment — réessaie dans une minute !',
    ctx_guild_only: 'ℹ️ Cette action est disponible uniquement sur un serveur.',
    ctx_profile_desc: 'Profil du membre, vu par le staff.',
    ctx_profile_created: 'Compte créé',
    ctx_profile_joined: 'A rejoint le serveur',
    ctx_profile_roles: 'Rôles',
    ctx_profile_warns: 'Avertissements actifs',
    ctx_warn_denied: '⛔ Permission de modération requise pour avertir.',
    ctx_warn_modal_title: 'Avertir le membre',
    ctx_warn_modal_reason: "Raison de l'avertissement",
    ctx_warn_empty: '⚠️ Raison vide : avertissement annulé.',
    ctx_warn_done: '✅ Membre averti — la raison est enregistrée au journal.',
    ctx_report_cooldown: "⏳ Vous avez déjà signalé un message il y a moins d'une minute.",
    ctx_report_done: '📨 Message signalé au staff. Merci !',
    ctx_ticket_reason: 'Ticket ouvert depuis un message :',
    // Commande /lang
    lang_set: '🌍 Langue du serveur définie sur : **Français** 🇫🇷',
    lang_usage: '❓ Utilisation : `/lang fr` ou `/lang en`.',
    // Aide
    help_title: '📚 Centre d\'aide — {bot}',
    // Assistant rôles
    rw_title: '📋 Assistant des rôles',
    rw_edit_title: '✏️ Modifier le panneau de rôles',
    rw_summary: 'Récapitulatif en direct — sélectionnez une action ci-dessous.',
  },
  en: {
    panel_title: '👑 Support | {server}',
    panel_welcome: 'Welcome to the official support of {server}',
    panel_desc: 'To open a ticket, select the category that matches your needs in the menu below, and please describe your request in a few lines before opening.',
    panel_info_title: '__ⓘ Important information:__',
    panel_rule1: '• Be clear and precise in your request.',
    panel_rule2: '• Disrespect towards the staff is strictly forbidden.',
    panel_rule3: '• Avoid unnecessary mentions.',
    panel_rule4: '• Tickets inactive for 2 hours will be automatically closed and deleted.',
    panel_patience: '*⏳ Thank you for your patience, a staff member will take care of your ticket as soon as possible.*',
    ticket_title: '🎫 Ticket opened',
    ticket_type: '🗂️ Ticket type',
    ticket_about: 'ℹ️ About this type',
    ticket_team: '🛡️ Team in charge',
    ticket_team_default: 'the server staff',
    ticket_reason: '📝 Your request',
    ticket_answers: '📝 Questionnaire answers',
    ticket_steps: '📋 How it works',
    ticket_step1: '✍️ Describe your request here (text, screenshots, files).',
    ticket_step2: '👥 A staff member will reply in this private channel.',
    ticket_step3: '📄 Once closed permanently, the full transcript is sent to you by DM.',
    ticket_buttons: '🔒 Staff-only actions',
    ticket_buttons_desc: '⚙️ Dropdown below is staff-only: 🖐️ claim · ⏸ hold · 🔒 close · 🔓 reopen · ➕ add member · 🗑 delete (transcript by DM).',
    ticket_welcome_desc: 'Welcome {member}! A staff member will reply to you right here.\n\n✍️ Describe your request: text, screenshots or files.',
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
    am_reason_spam: 'spam / too many messages',
    // v243 — Phishing / fake Nitro.
    am_reason_phishing: 'phishing / fake Nitro link',
    am_reason_phishing_suspect: 'suspicious link: possible scam',
    am_dm_phishing: '🎣 Your message contained a known scam link (fake Nitro, fake Steam gift, account theft).\nIt was deleted on **{server}**.\n\nIf you clicked that link and entered your password, **change it immediately** and enable two-factor authentication.\nIf you did not send it yourself, your account may be compromised.',
    am_public_warn_title: '⚠️ Automatic warning',
    am_public_warn_desc: '<@{userId}>, your message was deleted in <#{channelId}>.',
    am_public_detected_desc: '<@{userId}>, your message was detected in <#{channelId}> but the bot could not delete it.',
    am_public_reason: '📌 Reason',
    am_public_level: '📊 Level',
    am_public_level_value: 'Warning {count}{limit}',
    am_public_next: '⚠️ The next warning may trigger an automatic sanction.',
    am_public_sanction: '🛡️ Sanction applied',
    am_public_timeout: '⏳ Timeout for {minutes} minute(s).',
    am_public_kick: '👢 Automatic kick.',
    am_public_ban: '🔨 Automatic ban.',
    am_public_sanction_failed: '⚠️ The automatic sanction could not be applied. Staff should check the bot\'s permissions.',
    am_public_footer: 'Auto-moderation · {channel}',
    am_dm_warning_count: 'Warning {count}{limit} on **{server}**.',
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
    // v238 — professional "add a member" flow: the modal explains what is
    // accepted, and every answer is a real panel.
    ticket_add_modal_ph: '@mention, user ID or username',
    ticket_add_modal_hint: 'e.g. @Alice · 217871817411461121 · alice',
    ticket_add_ok: '✅ {member} has been added to the ticket.',
    ticket_add_ok_title: '👤 Member added to the ticket',
    ticket_add_ok_desc: '**{name}** can now view the channel, write and read the history.',
    ticket_add_account: '🔖 Account',
    ticket_add_id: '🆔 User ID',
    ticket_add_by: '🖐️ Added by',
    ticket_add_access: '🔓 Permissions granted',
    ticket_add_access_value: 'View channel · Send messages · Read message history',
    ticket_add_err: '❌ Member not found. Provide an @mention or a valid ID.',
    ticket_add_err_title: '🔍 Member not found',
    ticket_add_err_desc: 'No member of **{server}** matches “{query}”.',
    ticket_add_accepted: '✅ What you can type',
    ticket_add_accepted_value: '• an **@mention** — type `@` then the beginning of the username\n• the Discord **user ID** — 17 to 20 digits\n• the exact **username** or **nickname** on this server\n• the **beginning of a username** — I will list the matches if several members fit',
    ticket_add_tip: '💡 Good to know',
    ticket_add_tip_value: 'The member must **already be on the server**. To copy their ID: right-click their profile → “Copy User ID” (requires Developer Mode, in Discord Settings → Advanced).',
    ticket_add_amb_title: '🔎 Several members match',
    ticket_add_amb_desc: '“{query}” matches **{count}** members of **{server}**. Pick the right one below:',
    ticket_add_retry: '🔁 Try again',
    ticket_add_expired: '⏰ The request expired. Start again from the “⚙️ Staff actions” menu.',
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

    // v242 — Anti-nuke
    nuke_alert_title: '🛡️ NUKE DETECTED — {server}',
    nuke_alert_hits: '**{count} destructive actions in {window} s** attributed to {actor}.',
    nuke_action_ban: '⛔ Member automatically banned.',
    nuke_action_demote: '🔻 Administrator permission removed.',
    nuke_action_lockdown: '🔒 {locked} channel(s) locked down.',
    nuke_action_alert: 'ℹ️ Alert only — no sanction applied.',
    nuke_failed: '⚠️ Sanction impossible: {error} → alert sent, nothing was applied.',
    nuke_blocked_owner: '👑 Actor = server owner → no sanction (permanent protection).',
    nuke_blocked_whitelist: '✅ Actor is whitelisted → no sanction.',
    nuke_blocked_bot: '🤖 Actor = Hoxera → no sanction.',
    nuke_no_actor: '❓ Actor not identified → no sanction (Hoxera never punishes without certainty).',
    nuke_audit_missing: '🔑 Audit log unreadable: {error}. Grant Hoxera the “View Audit Log” permission to identify actors. No sanction applied.',
    nuke_kind_channel_delete: 'channel deletion',
    nuke_kind_role_delete: 'role deletion',
    nuke_kind_role_update: 'role update',
    nuke_kind_ban: 'ban',
    nuke_kind_kick: 'kick',
    nuke_kind_webhook: 'webhook creation',
    nuke_kind_channel_create: 'channel creation',
    nuke_kind_role_create: 'role creation',
    nuke_kind_overwrite: 'channel permission change',
    nuke_kind_emoji: 'emoji deletion',
    nuke_kind_bot_add: 'bot addition',
    nuke_action_quarantine: '🔒 Quarantined: all roles stripped, member kept in the server. Reversible.',
    nuke_blocked_other_bot: '🤖 Actor = ANOTHER bot → no sanction (punishing a ticket bot would break the server). Whitelist it if expected.',
    nuke_field_action: '🛡️ Reaction',
    nuke_field_actor: '👤 Actor',
    nuke_field_hits: '📊 Triggers',
    raid_unlocked: 'Automatic lockdown over after {minutes} minute(s). The server is reopened.',
    guard_not_ready: '⏳ This command is not ready yet on this server — it syncs automatically (try again in 5–10 minutes).',
    guard_error: '⚠️ Something went wrong while handling this action — it was logged, please try again in a moment.',
    guard_slow: '⏳ This action is taking too long… please try again in a moment.',
    guard_busy: '😅 Hoxera is very busy right now — try again in a minute!',
    ctx_guild_only: 'ℹ️ This action is only available on a server.',
    ctx_profile_desc: 'Member profile, staff view.',
    ctx_profile_created: 'Account created',
    ctx_profile_joined: 'Joined the server',
    ctx_profile_roles: 'Roles',
    ctx_profile_warns: 'Active warnings',
    ctx_warn_denied: '⛔ Moderation permission required to warn.',
    ctx_warn_modal_title: 'Warn the member',
    ctx_warn_modal_reason: 'Reason for the warning',
    ctx_warn_empty: '⚠️ Empty reason: warning cancelled.',
    ctx_warn_done: '✅ Member warned — the reason is saved in the journal.',
    ctx_report_cooldown: '⏳ You already reported a message less than a minute ago.',
    ctx_report_done: '📨 Message reported to the staff. Thank you!',
    ctx_ticket_reason: 'Ticket opened from a message:',
    lang_set: '🌍 Server language set to: **English** 🇬🇧',
    lang_usage: '❓ Usage: `/lang fr` or `/lang en`.',
    help_title: '📚 Help center — {bot}',
    rw_title: '📋 Role panel wizard',
    rw_edit_title: '✏️ Edit role panel',
    rw_summary: 'Live summary — pick an action below.',
  },
};

// v240 — es/de/pt/it retirés : ces 4 blocs n'avaient que 48 clés sur 105.
// Un serveur qui choisissait `/lang es` voyait donc un MÉLANGE espagnol/français
// (tout ce qui a été ajouté depuis — système d'ajout de membre, notes ⭐,
// anti-raid, assistants — retombait en français). Mieux vaut 2 langues complètes
// que 6 approximatives : le dashboard ne proposait déjà que fr + en.
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
