// ============================================================
// BotDev - Auto-modération (par serveur) :
//   - suppression des liens (invitations Discord, URL)
//   - suppression des messages trop en MAJUSCULES
//   - limite de mentions par message
//   - liste noire de mots (mot entier)
//   - anti-spam : X messages en 5 secondes → suppression + timeout
// Chaque infraction : suppression, avertissement public dans le même salon,
// MP (si possible), historique unifié et sanction aux paliers configurés.
// « Ignorer les admins » désactivable depuis le dashboard.
// ============================================================
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const store = require('../db');
const logging = require('./logging');
const i18n = require('../i18n');
const { autoModSanctionForWarning } = require('./community');

// botId:guildId:userId -> { times: [ms], messages: [Message] }
const spamTracker = new Map();
// Messages récemment supprimés par l'auto-mod (évite le double journal)
const recentlyDeleted = new Map(); // messageId -> ts

function wasAutomodded(messageId) {
  const ts = recentlyDeleted.get(String(messageId));
  if (!ts) return false;
  if (Date.now() - ts > 60000) { recentlyDeleted.delete(String(messageId)); return false; }
  return true;
}

function markAutomodded(messageId) {
  recentlyDeleted.set(String(messageId), Date.now());
}

// Prépare la phrase d'avertissement (texte personnalisé ou modèle traduit)
function warnText(gs, lang, server, reason) {
  const custom = String(gs.am_warn_text || '').trim();
  if (custom) {
    return custom
      .split('{reason}').join(reason)
      .split('{server}').join(server);
  }
  return i18n.t(lang, 'am_dm_deleted', { server, reason });
}

// Envoie l'avertissement en MP. Si les MP sont fermés → journal serveur.
async function sendWarn(botId, message, gs, lang, text) {
  let dmOk = false;
  try {
    if (message.author && typeof message.author.send === 'function') {
      await message.author.send({ content: text });
      dmOk = true;
    }
  } catch { /* MP fermés */ }
  if (!dmOk) {
    try {
      await logging.log(botId, message.guild, {
        title: '🛡️ Auto-modération',
        description: `<@${message.author.id}> : avertissement non distribué (messages privés fermés).\n${text}`,
        color: '#ED4245',
      });
    } catch { /* le journal ne doit jamais casser la modération */ }
  }
  // L'action détaillée est déjà enregistrée par recordAction() : un seul
  // événement doit apparaître dans l'historique, même si le MP échoue.
  return dmOk;
}

// Trace l'action de modération dans l'historique du dashboard
function recordAction(botId, message, reason) {
  try {
    store.automodLogs.add(botId, message.guild.id, {
      user_id: message.author.id,
      user_tag: message.author.tag || message.author.username || '',
      reason,
      content: (message.content || '').slice(0, 500),
      channel_id: message.channel ? message.channel.id : '',
    });
  } catch { }
}

// Ajoute une entrée à l'historique unifié des avertissements. Les tests
// forcés du dashboard ne créent volontairement aucun avertissement réel.
function registerAutomodWarning(botId, message, reason, opts = {}, gs = null) {
  if (opts.force) return { count: 0, sanction: null, saved: false };
  const count = store.warnings.count(botId, message.guild.id, message.author.id) + 1;
  let saved = false;
  let id = 0;
  try {
    const inserted = store.warnings.add(botId, message.guild.id, message.author.id, reason, 'auto-mod', {
      source: 'automod',
      channel_id: message.channel ? message.channel.id : '',
      message_id: message.id || '',
      warning_no: count,
      action: 'warn',
    });
    id = Number(inserted && inserted.lastInsertRowid) || 0;
    saved = true;
  } catch (e) {
    console.error('[Hoxera] avertissement auto-mod non enregistré :', e.message);
  }
  return { id, count, sanction: saved ? autoModSanctionForWarning(count, gs || store.guildSettings.get(botId, message.guild.id) || {}) : null, saved };
}

// Applique la sanction du palier atteint, en respectant la hiérarchie Discord.
async function applyAutoSanction(message, sanction, reason, warningCount) {
  if (!sanction) return { applied: false, action: '', minutes: 0, error: '' };
  const member = message.member;
  const why = `Auto-modération : ${warningCount} avertissements — ${String(reason || '').slice(0, 300)}`;
  if (!member) return { applied: false, action: sanction.action, minutes: sanction.minutes || 0, error: 'membre introuvable' };
  try {
    if (sanction.action === 'timeout') {
      if (!member.moderatable || typeof member.timeout !== 'function') return { applied: false, action: 'timeout', minutes: sanction.minutes, error: 'timeout impossible (hiérarchie ou permission)' };
      await member.timeout(sanction.minutes * 60000, why);
      return { applied: true, action: 'timeout', minutes: sanction.minutes, error: '' };
    }
    if (sanction.action === 'kick') {
      if (!member.kickable || typeof member.kick !== 'function') return { applied: false, action: 'kick', minutes: 0, error: 'expulsion impossible (hiérarchie ou permission)' };
      await member.kick(why);
      return { applied: true, action: 'kick', minutes: 0, error: '' };
    }
    if (sanction.action === 'ban') {
      if (!member.bannable || typeof member.ban !== 'function') return { applied: false, action: 'ban', minutes: 0, error: 'bannissement impossible (hiérarchie ou permission)' };
      await member.ban({ reason: why });
      return { applied: true, action: 'ban', minutes: 0, error: '' };
    }
  } catch (e) {
    return { applied: false, action: sanction.action, minutes: sanction.minutes || 0, error: String(e.message || e).slice(0, 180) };
  }
  return { applied: false, action: sanction.action, minutes: sanction.minutes || 0, error: 'action inconnue' };
}

function sanctionPublicText(lang, sanction, result) {
  if (!result || !result.applied) return i18n.t(lang, 'am_public_sanction_failed');
  if (sanction.action === 'timeout') return i18n.t(lang, 'am_public_timeout', { minutes: result.minutes });
  if (sanction.action === 'kick') return i18n.t(lang, 'am_public_kick');
  if (sanction.action === 'ban') return i18n.t(lang, 'am_public_ban');
  return i18n.t(lang, 'am_public_sanction_failed');
}

// Avertissement visible dans le MÊME salon que le message supprimé.
// Le message est retiré après 15 secondes pour ne pas polluer le salon ;
// l'historique complet reste dans le dashboard.
async function sendPublicWarning(message, lang, reason, warningCount, gs, sanction, sanctionResult, deleted) {
  if (!message.channel || typeof message.channel.send !== 'function') return { sent: false, error: 'salon non envoyable' };
  const limit = Math.max(parseInt(gs.am_warn_limit, 10) || 0, 0);
  const limitText = limit > 0 ? `/${limit}` : '';
  const title = sanction
    ? `🛡️ ${i18n.t(lang, 'am_public_warn_title')} · ${warningCount}${limitText}`
    : `${i18n.t(lang, 'am_public_warn_title')} · ${warningCount}${limitText}`;
  const embed = new EmbedBuilder()
    .setColor(sanction ? '#ED4245' : '#FEE75C')
    .setTitle(title.slice(0, 256))
    .setDescription(i18n.t(lang, deleted ? 'am_public_warn_desc' : 'am_public_detected_desc', {
      userId: message.author.id,
      channelId: message.channel.id,
    }))
    .addFields(
      { name: i18n.t(lang, 'am_public_reason'), value: String(reason || '—').slice(0, 1024) },
      { name: i18n.t(lang, 'am_public_level'), value: i18n.t(lang, 'am_public_level_value', { count: warningCount, limit: limitText }), inline: true },
    )
    .setFooter({ text: i18n.t(lang, 'am_public_footer', { channel: message.channel.name || 'salon' }) })
    .setTimestamp();
  if (sanction) {
    embed.addFields({ name: i18n.t(lang, 'am_public_sanction'), value: sanctionPublicText(lang, sanction, sanctionResult) });
  } else if (limit > 0) {
    embed.addFields({ name: 'ℹ️', value: i18n.t(lang, 'am_public_next') });
  }
  const sent = await message.channel.send({
    content: message.author.id ? `<@${message.author.id}>` : undefined,
    embeds: [embed],
    allowedMentions: { users: message.author.id ? [String(message.author.id)] : [] },
  });
  if (sent && typeof sent.delete === 'function') {
    const timer = setTimeout(() => sent.delete().catch(() => {}), 15000);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
  return { sent: true };
}

// Vérifie qu'un mot interdit apparaît comme MOT ENTIER dans le message :
// « salut » matche, « salutations » non ; insensible à la casse, accents OK.
function blacklistWordMatch(content, word) {
  const w = String(word).toLowerCase();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const letter = 'A-Za-zÀ-ÿ0-9_';
  const re = new RegExp('(^|[^' + letter + '])(' + esc + ')($|[^' + letter + '])', 'i');
  return re.test(content || '');
}

async function runAutomod(botId, message, opts = {}) {
  if (!message || !message.guild) return { acted: false };
  if (message.author.bot && !opts.force) return { acted: false };
  const gs = store.guildSettings.get(botId, message.guild.id) || {};
  if (gs.am_enabled !== 1) return { acted: false };
  const lang = i18n.langForGuild(message.guild.id);
  const serverName = message.guild.name || 'ce serveur';

  // « Ignorer les admins/modérateurs » : activé par défaut (standard).
  const ignoreStaff = gs.am_ignore_staff === undefined || gs.am_ignore_staff === 1;
  const member = message.member;
  if (!opts.force && ignoreStaff && member && member.permissions && typeof member.permissions.has === 'function') {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)
      || member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return { acted: false };
    }
  }

  const content = message.content || '';
  let reason = null;
  let reasonKey = null;

  // Liens
  if (gs.am_links === 1 && /(discord\.gg\/|discordapp\.com\/invite\/|discord\.com\/invite\/|https?:\/\/)/i.test(content)) {
    reasonKey = 'am_reason_link';
    reason = i18n.t(lang, reasonKey);
  }
  // Majuscules
  if (!reason && gs.am_caps === 1) {
    const letters = content.match(/[a-zà-ÿ]/gi) || [];
    const caps = content.match(/[A-ZÀ-Ý]/g) || [];
    if (letters.length) {
      const ratio = caps.length / letters.length;
      const allCapsShort = letters.length >= 5 && caps.length === letters.length;
      const mostlyCapsLong = content.length > 12 && letters.length >= 8 && ratio > 0.7;
      if (allCapsShort || mostlyCapsLong) {
        reasonKey = 'am_reason_caps';
        reason = i18n.t(lang, reasonKey);
      }
    }
  }
  // Mentions
  if (!reason && Number(gs.am_mentions) > 0) {
    const mentions = (content.match(/<@!?\d+>/g) || []).length;
    if (mentions > Number(gs.am_mentions)) {
      reasonKey = 'am_reason_mentions';
      reason = i18n.t(lang, reasonKey);
    }
  }
  // Liste noire de mots
  if (!reason) {
    const words = store.blacklist.all(botId, message.guild.id);
    if (words.length) {
      const hit = words.find((w) => blacklistWordMatch(content, w));
      if (hit) {
        reasonKey = 'am_reason_word';
        reason = i18n.t(lang, reasonKey, { word: hit });
      }
    }
  }

  if (reason) {
    let deleted = false;
    try { if (message.deletable) { markAutomodded(message.id); await message.delete(); deleted = true; } } catch { }

    // Chaque infraction supprimée devient un avertissement traçable. Le
    // premier reste un avertissement public ; le deuxième atteint par défaut
    // le palier « timeout 10 min » (réglable dans le dashboard).
    const warning = registerAutomodWarning(botId, message, reason, opts, gs);
    let sanctionResult = { applied: false, action: '', minutes: 0, error: '' };
    if (!opts.force && warning.sanction) {
      sanctionResult = await applyAutoSanction(message, warning.sanction, reason, warning.count);
      if (warning.id && sanctionResult.applied) {
        try { store.warnings.setAction(warning.id, sanctionResult.action); } catch { }
      }
    }

    recordAction(botId, message, reason);
    try {
      await logging.log(botId, message.guild, {
        title: '🛡️ Auto-modération',
        description: `Message ${deleted ? 'supprimé' : 'détecté'} (${reason})`,
        color: '#ED4245',
        type: 'automod',
        fields: [
          { name: '👤 Auteur', value: `<@${message.author.id}>`, inline: true },
          { name: '📨 Salon', value: message.channel ? `<#${message.channel.id}>` : '—', inline: true },
          { name: '⚠️ Avertissement', value: warning.count ? `${warning.count}` : 'test', inline: true },
          { name: '💬 Message', value: content.slice(0, 500) || '—' },
        ],
      });
    } catch { }

    let publicWarning = { sent: false, error: '' };
    if (!opts.force && warning.count) {
      try {
        publicWarning = await sendPublicWarning(message, lang, reason, warning.count, gs, warning.sanction, sanctionResult, deleted);
      } catch (e) {
        publicWarning = { sent: false, error: String(e.message || e).slice(0, 180) };
        console.error('[Hoxera] avertissement public impossible :', publicWarning.error);
      }
    }

    // Avertissement MP (jamais silencieux) — sauf en mode test forcé.
    if (!opts.noDm) {
      let text = deleted
        ? warnText(gs, lang, serverName, reason)
        : i18n.t(lang, 'am_dm_no_perm', { server: serverName, reason });
      if (warning.count) text += `\n${i18n.t(lang, 'am_dm_warning_count', { server: serverName, count: warning.count, limit: gs.am_warn_limit > 0 ? '/' + gs.am_warn_limit : '' })}`;
      if (warning.sanction) text += `\n${sanctionPublicText(lang, warning.sanction, sanctionResult)}`;
      await sendWarn(botId, message, gs, lang, text);
    }
    return {
      acted: true,
      reason,
      deleted,
      dmSent: !opts.noDm,
      warningCount: warning.count,
      publicWarning: publicWarning.sent,
      sanction: sanctionResult,
    };
  }

  // Anti-spam : X messages en 5 s → suppression des messages + timeout + MP
  const limit = Number(gs.am_spam ?? 0);
  if (limit > 0) {
    const key = `${botId}:${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const entry = spamTracker.get(key) || { times: [], messages: [] };
    entry.times = entry.times.filter((t) => now - t < 5000);
    entry.messages = entry.messages.slice(-(limit - 1));
    entry.times.push(now);
    entry.messages.push(message);
    spamTracker.set(key, entry);
    if (entry.times.length >= limit) {
      const burstCount = entry.times.length;
      spamTracker.set(key, { times: [], messages: [] });
      // 1) Supprime les messages du spammeur
      let deletedCount = 0;
      for (const m of entry.messages) {
        try { if (m.deletable) { markAutomodded(m.id); await m.delete(); deletedCount++; } } catch { }
      }

      // 2) Le spam est lui-même un avertissement. S'il atteint un palier,
      // la sanction progressive prime ; sinon on conserve le timeout
      // anti-spam historique configuré dans « Timeout spam ».
      const reasonLabel = i18n.t(lang, 'am_reason_spam');
      const warning = registerAutomodWarning(botId, message, reasonLabel, opts, gs);
      let sanctionResult = { applied: false, action: '', minutes: 0, error: '' };
      let spamSanction = null;
      if (!opts.force && warning.sanction) {
        sanctionResult = await applyAutoSanction(message, warning.sanction, reasonLabel, warning.count);
        spamSanction = warning.sanction;
      } else if (!opts.force) {
        const minutes = Math.min(Math.max(parseInt(gs.am_timeout_min, 10) || 5, 1), 1440);
        try {
          if (message.member && message.member.moderatable && typeof message.member.timeout === 'function') {
            await message.member.timeout(minutes * 60000, 'Spam détecté');
            sanctionResult = { applied: true, action: 'timeout', minutes, error: '' };
            spamSanction = { action: 'timeout', minutes };
          }
        } catch (e) {
          sanctionResult = { applied: false, action: 'timeout', minutes, error: String(e.message || e).slice(0, 180) };
          spamSanction = { action: 'timeout', minutes };
        }
      }
      if (warning.id && sanctionResult.applied) {
        try { store.warnings.setAction(warning.id, sanctionResult.action); } catch { }
      }
      const actionText = sanctionResult.applied
        ? `, ${sanctionResult.action}${sanctionResult.minutes ? ' ' + sanctionResult.minutes + ' min' : ''}`
        : '';
      recordAction(botId, message, `${reasonLabel} (${deletedCount} message(s) supprimé(s)${actionText})`);
      try {
        await logging.log(botId, message.guild, {
          title: '🛡️ Anti-spam',
          description: `<@${message.author.id}> a envoyé ${burstCount} messages en 5 s → ${deletedCount} supprimé(s)${actionText}`,
          color: '#ED4245',
          type: 'automod',
        });
      } catch { }

      let publicWarning = { sent: false, error: '' };
      if (!opts.force && warning.count) {
        try {
          publicWarning = await sendPublicWarning(message, lang, reasonLabel, warning.count, gs, spamSanction, sanctionResult, deletedCount > 0);
        } catch (e) {
          publicWarning = { sent: false, error: String(e.message || e).slice(0, 180) };
          console.error('[Hoxera] avertissement public anti-spam impossible :', publicWarning.error);
        }
      }
      if (!opts.noDm) {
        let text = i18n.t(lang, 'am_dm_spam', { server: serverName, minutes: sanctionResult.minutes || parseInt(gs.am_timeout_min, 10) || 5 });
        if (warning.count) text += `\n${i18n.t(lang, 'am_dm_warning_count', { server: serverName, count: warning.count, limit: gs.am_warn_limit > 0 ? '/' + gs.am_warn_limit : '' })}`;
        if (spamSanction && warning.sanction) text += `\n${sanctionPublicText(lang, spamSanction, sanctionResult)}`;
        await sendWarn(botId, message, gs, lang, text);
      }
      return {
        acted: true,
        reason: 'spam',
        deleted: deletedCount > 0,
        dmSent: !opts.noDm,
        warningCount: warning.count,
        publicWarning: publicWarning.sent,
        sanction: sanctionResult,
      };
    }
  }

  return { acted: false };
}

module.exports = {
  runAutomod,
  blacklistWordMatch,
  wasAutomodded,
  _test: { spamTracker, registerAutomodWarning, applyAutoSanction, sendPublicWarning },
};
