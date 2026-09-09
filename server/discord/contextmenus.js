// ============================================================
// BotDev — v259 : menus contextuels (clic droit dans Discord)
// ------------------------------------------------------------
// Quatre entrées, comme prévu à la feuille de route :
//   • clic droit sur un MEMBRE  : « Voir le profil », « Avertir » ;
//   • clic droit sur un MESSAGE : « Signaler ce message »,
//     « Ouvrir un ticket sur ce message ».
// Règles produit héritées des versions précédentes :
//   • toutes les confirmations sont ÉPHÉMÈRES (v238) ;
//   • « Avertir » passe par une MODALE de raison (jamais de raison vide) ;
//   • « Signaler » est protégé par un anti-spam (1 signalement / minute) ;
//   • textes fr + en (v240), lus via i18n comme le reste du bot.
// Les payloads (type 2 = membre, type 3 = message) sont AJOUTÉS EN TÊTE de
// la synchronisation globale : le plafond de sécurité de 90 commandes ne
// pourra jamais les évincer.
// ============================================================
const store = require('../db');
const ui = require('./ui');
const {
  PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');

const NAMES = {
  profile: { fr: 'Voir le profil', en: 'View profile' },
  warn: { fr: 'Avertir', en: 'Warn' },
  report: { fr: 'Signaler ce message', en: 'Report message' },
  ticket: { fr: 'Ouvrir un ticket sur ce message', en: 'Open ticket on this message' },
};

const keyOfName = (name) => Object.keys(NAMES).find((k) => NAMES[k].fr === name || NAMES[k].en === name) || null;

function buildContextMenuPayloads() {
  return [
    { type: 2, name: NAMES.profile.fr, name_localizations: { en: NAMES.profile.en } },
    {
      type: 2,
      name: NAMES.warn.fr,
      name_localizations: { en: NAMES.warn.en },
      // Visible uniquement par qui peut modérer : Discord filtre le menu.
      default_member_permissions: String(PermissionsBitField.Flags.ModerateMembers),
    },
    { type: 3, name: NAMES.report.fr, name_localizations: { en: NAMES.report.en } },
    { type: 3, name: NAMES.ticket.fr, name_localizations: { en: NAMES.ticket.en } },
  ];
}

// 🐌 Anti-spam des signalements : 1 par minute et par membre (mémoire vive,
// un redémarrage du bot réinitialise — volontairement simple et sans table).
const REPORT_COOLDOWN_MS = 60 * 1000;
const reportCooldown = new Map();

function langOf(i) {
  try {
    return require('../i18n').langForGuild(i && i.guild ? i.guild.id : null);
  } catch { return 'fr'; }
}
function tr(lang) {
  return (key) => {
    try { return require('../i18n').t(lang, key); } catch { return key; }
  };
}
function fmtDate(ms, lang) {
  try {
    return new Date(ms).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

async function handleInteraction(botId, entry, i) {
  // ── Modale de raison du menu « Avertir » ────────────────────────────────
  if (i.isModalSubmit && i.isModalSubmit() && String(i.customId || '').startsWith('ctxwarn:')) {
    const lang = langOf(i); const t = tr(lang);
    const targetId = String(i.customId).slice('ctxwarn:'.length);
    let reason = '';
    try { reason = String(i.fields.getTextInputValue('reason') || '').trim(); } catch { reason = ''; }
    if (!reason) {
      await i.reply({ content: t('ctx_warn_empty'), ephemeral: true }).catch(() => {});
      return true;
    }
    try {
      store.warnings.add(botId, i.guild.id, targetId, reason, i.user.id, { source: 'manual', action: 'warn' });
    } catch (e) { console.error('[BotDev] ctx warn add:', e.message); }
    try {
      await require('./logging').log(botId, i.guild, {
        title: 'Avertissement manuel (clic droit)',
        description: `${i.user} a averti <@${targetId}>.\nRaison : ${reason.slice(0, 400)}`,
        color: '#FEE75C',
        type: 'mod',
      });
    } catch {}
    await i.reply(ui.v2panel({
      ephemeral: true,
      color: '#FEE75C',
      title: t('ctx_warn_done'),
    })).catch(() => {});
    return true;
  }

  const isUser = i.isUserContextMenuInteraction && i.isUserContextMenuInteraction();
  const isMsg = i.isMessageContextMenuInteraction && i.isMessageContextMenuInteraction();
  if (!isUser && !isMsg) return false;

  const key = keyOfName(i.commandName);
  if (!key) return false;

  const lang = langOf(i); const t = tr(lang);
  if (!i.guild) {
    await i.reply({ content: t('ctx_guild_only'), ephemeral: true }).catch(() => {});
    return true;
  }

  // ── Voir le profil ─────────────────────────────────────────────────────
  if (key === 'profile') {
    const target = i.targetUser;
    const member = i.targetMember;
    let warns = 0;
    try { warns = store.warnings.count(botId, i.guild.id, target.id); } catch {}
    const roles = member && member.roles && member.roles.cache
      ? member.roles.cache.filter((r) => r.id !== i.guild.id).map((r) => r.name).slice(0, 6).join(', ') || '—'
      : '—';
    await i.reply(ui.v2panel({
      ephemeral: true,
      color: '#e07a5f',
      title: `${target.username}`,
      description: t('ctx_profile_desc'),
      fields: [
        { name: t('ctx_profile_created'), value: fmtDate(target.createdTimestamp, lang) },
        { name: t('ctx_profile_joined'), value: member && member.joinedTimestamp ? fmtDate(member.joinedTimestamp, lang) : '—' },
        { name: t('ctx_profile_roles'), value: String(roles).slice(0, 500) },
        { name: t('ctx_profile_warns'), value: String(warns) },
      ],
    })).catch(() => {});
    return true;
  }

  // ── Avertir : modale de raison ─────────────────────────────────────────
  if (key === 'warn') {
    const can = i.member && i.member.permissions
      && i.member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
    if (!can) {
      await i.reply({ content: t('ctx_warn_denied'), ephemeral: true }).catch(() => {});
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId(`ctxwarn:${i.targetUser.id}`)
      .setTitle(t('ctx_warn_modal_title'));
    const input = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel(t('ctx_warn_modal_reason'))
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(200);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
    return true;
  }

  // ── Signaler ce message ────────────────────────────────────────────────
  if (key === 'report') {
    const ck = `${i.guild.id}:${i.user.id}`;
    const last = reportCooldown.get(ck) || 0;
    if (Date.now() - last < REPORT_COOLDOWN_MS) {
      await i.reply({ content: t('ctx_report_cooldown'), ephemeral: true }).catch(() => {});
      return true;
    }
    reportCooldown.set(ck, Date.now());
    const msg = i.targetMessage;
    try {
      store.reports.add(botId, i.guild.id, i.user.id, {
        messageId: msg.id,
        messageAuthorId: msg.author ? msg.author.id : '',
        channelId: i.channel ? i.channel.id : '',
        reason: String(msg.content || '').slice(0, 500),
      });
    } catch (e) { console.error('[BotDev] ctx report add:', e.message); }
    try {
      await require('./logging').log(botId, i.guild, {
        title: 'Message signalé (clic droit)',
        description: `${i.user} a signalé un message de ${msg.author || 'un membre'} dans ${i.channel}.\nLien : ${msg.url}`,
        color: '#FEE75C',
        type: 'mod',
      });
    } catch {}
    await i.reply(ui.v2panel({ ephemeral: true, color: '#57F287', title: t('ctx_report_done') })).catch(() => {});
    return true;
  }

  // ── Ouvrir un ticket sur ce message ────────────────────────────────────
  if (key === 'ticket') {
    const msg = i.targetMessage;
    const extrait = String(msg.content || '').slice(0, 300);
    const reason = `${t('ctx_ticket_reason')} ${msg.url}${extrait ? `\n> ${extrait}` : ''}`;
    const panels = require('./panels');
    await panels.openTicket(botId, i, null, reason);
    return true;
  }

  return false;
}

module.exports = { buildContextMenuPayloads, handleInteraction, NAMES, REPORT_COOLDOWN_MS };
