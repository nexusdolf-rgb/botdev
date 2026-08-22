// ============================================================
// BotDev - Auto-modération (par serveur) :
//   - suppression des liens (invitations Discord, URL)
//   - suppression des messages trop en MAJUSCULES
//   - limite de mentions par message
//   - liste noire de mots (mot entier)
//   - anti-spam : X messages en 5 secondes → suppression + timeout
// Chaque action : avertissement en MP (langue du serveur) + journal.
// « Ignorer les admins » désactivable depuis le dashboard.
// ============================================================
const { PermissionsBitField } = require('discord.js');
const store = require('../db');
const logging = require('./logging');
const i18n = require('../i18n');

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
  // Trace toujours visible dans le dashboard (même sans salon #logs)
  try {
    store.automodLogs.add(botId, message.guild.id, {
      user_id: message.author.id,
      user_tag: message.author.tag || message.author.username || '',
      reason: 'voir contenu',
      content: text.slice(0, 500),
      channel_id: message.channel ? message.channel.id : '',
    });
  } catch { }
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
    recordAction(botId, message, reason);
    try {
      await logging.log(botId, message.guild, {
        title: '🛡️ Auto-modération',
        description: `Message supprimé (${reason})${deleted ? '' : ' ⚠️ permission de suppression manquante dans ce salon'}`,
        color: '#ED4245',
        fields: [
          { name: '👤 Auteur', value: `<@${message.author.id}>`, inline: true },
          { name: '📨 Salon', value: message.channel ? `<#${message.channel.id}>` : '—', inline: true },
          { name: '💬 Message', value: content.slice(0, 500) || '—' },
        ],
      });
    } catch { }
    // Avertissement MP (jamais silencieux) — sauf en mode test forcé
    if (!opts.noDm) {
      const text = deleted
        ? warnText(gs, lang, serverName, reason)
        : i18n.t(lang, 'am_dm_no_perm', { server: serverName, reason });
      await sendWarn(botId, message, gs, lang, text);
    }
    return { acted: true, reason, deleted, dmSent: !opts.noDm };
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
      spamTracker.set(key, { times: [], messages: [] });
      // 1) Supprime les messages du spammeur
      let deletedCount = 0;
      for (const m of entry.messages) {
        try { if (m.deletable) { markAutomodded(m.id); await m.delete(); deletedCount++; } } catch { }
      }
      // 2) Timeout (durée réglable)
      const minutes = Math.min(Math.max(parseInt(gs.am_timeout_min, 10) || 5, 1), 1440);
      let timedOut = false;
      try {
        if (!opts.force && message.member && message.member.moderatable) {
          await message.member.timeout(minutes * 60000, 'Spam détecté');
          timedOut = true;
        }
      } catch { }
      recordAction(botId, message, `spam (${deletedCount} message(s) supprimé(s)${timedOut ? ', timeout ' + minutes + ' min' : ''})`);
      try {
        await logging.log(botId, message.guild, {
          title: '🛡️ Anti-spam',
          description: `<@${message.author.id}> a envoyé ${entry.times.length} messages en 5 s → ${deletedCount} supprimé(s)${timedOut ? ` + timeout ${minutes} min` : ''}`,
          color: '#ED4245',
        });
      } catch { }
      if (!opts.noDm) {
        await sendWarn(botId, message, gs, lang, i18n.t(lang, 'am_dm_spam', { server: serverName, minutes }));
      }
      return { acted: true, reason: 'spam', deleted: deletedCount > 0, dmSent: !opts.noDm };
    }
  }

  return { acted: false };
}

module.exports = { runAutomod, blacklistWordMatch, wasAutomodded, _test: { spamTracker } };
