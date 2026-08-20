// ============================================================
// BotDev - Auto-modération (par serveur) :
//   - suppression des liens (invitations Discord, URL)
//   - suppression des messages trop en MAJUSCULES
//   - limite de mentions par message
//   - anti-spam : X messages en 5 secondes → timeout 5 min
// Les administrateurs et modérateurs sont ignorés.
// ============================================================
const { PermissionsBitField } = require('discord.js');
const store = require('../db');
const logging = require('./logging');

const spamTracker = new Map(); // botId:guildId:userId -> [timestamps]

async function runAutomod(botId, message) {
  if (!message || !message.guild || message.author.bot) return { acted: false };
  const gs = store.guildSettings.get(botId, message.guild.id) || {};
  if (gs.am_enabled !== 1) return { acted: false };

  // « Ignorer les admins/modérateurs » : activé par défaut (standard).
  // Désactivable depuis le dashboard pour que l'auto-mod s'applique à TOUT le monde.
  const ignoreStaff = gs.am_ignore_staff === undefined || gs.am_ignore_staff === 1;
  const member = message.member;
  if (ignoreStaff && member && member.permissions && typeof member.permissions.has === 'function') {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)
      || member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return { acted: false };
    }
  }

  const content = message.content || '';
  let reason = null;

  // Liens
  if (gs.am_links === 1 && /(discord\.gg\/|discordapp\.com\/invite\/|discord\.com\/invite\/|https?:\/\/)/i.test(content)) {
    reason = 'lien non autorisé';
  }
  // Majuscules : long message majoritairement en MAJUSCULES (>70 %),
  // ou message court ENTIÈREMENT en majuscules (ex. « SALUT »).
  if (!reason && gs.am_caps === 1) {
    const letters = content.match(/[a-zà-ÿ]/gi) || [];
    const caps = content.match(/[A-ZÀ-Ý]/g) || [];
    if (letters.length) {
      const ratio = caps.length / letters.length;
      const allCapsShort = letters.length >= 5 && caps.length === letters.length;
      const mostlyCapsLong = content.length > 12 && letters.length >= 8 && ratio > 0.7;
      if (allCapsShort || mostlyCapsLong) reason = 'trop de majuscules';
    }
  }
  // Mentions
  if (!reason && Number(gs.am_mentions) > 0) {
    const mentions = (content.match(/<@!?\d+>/g) || []).length;
    if (mentions > Number(gs.am_mentions)) reason = 'trop de mentions';
  }
  // Liste noire de mots (mot entier, insensible à la casse)
  if (!reason) {
    const words = store.blacklist.all(botId, message.guild.id);
    if (words.length) {
      const hit = words.find((w) => blacklistWordMatch(content, w));
      if (hit) reason = `mot interdit (« ${hit} »)`;
    }
  }

  if (reason) {
    try { if (message.deletable) await message.delete(); } catch {}
    try {
      await logging.log(botId, message.guild, {
        title: '🛡️ Auto-modération',
        description: `Message supprimé (${reason})`,
        color: '#ED4245',
        fields: [
          { name: '👤 Auteur', value: `<@${message.author.id}>`, inline: true },
          { name: '📨 Salon', value: message.channel ? `<#${message.channel.id}>` : '—', inline: true },
          { name: '💬 Message', value: content.slice(0, 500) || '—' },
        ],
      });
    } catch { /* l'échec d'un log ne doit jamais casser la modération */ }
    return { acted: true, reason };
  }

  // Anti-spam
  const limit = Number(gs.am_spam ?? 0);
  if (limit > 0) {
    const key = `${botId}:${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const times = (spamTracker.get(key) || []).filter((t) => now - t < 5000);
    times.push(now);
    spamTracker.set(key, times);
    if (times.length >= limit) {
      spamTracker.set(key, []);
      try {
        if (message.member && message.member.moderatable) {
          await message.member.timeout(5 * 60000, 'Spam détecté');
        }
      } catch {}
      try {
        await logging.log(botId, message.guild, {
          title: '🛡️ Anti-spam',
          description: `<@${message.author.id}> a été mis en timeout (5 min)`,
          color: '#ED4245',
        });
      } catch {}
      return { acted: true, reason: 'spam' };
    }
  }

  return { acted: false };
}

// Vérifie qu'un mot interdit apparaît comme MOT ENTIER dans le message :
// « salut » matche, « salutations » non ; « déjà » matche, « déjàvu » non.
// Les lettres accentuées comptent comme des lettres.
function blacklistWordMatch(content, word) {
  const w = String(word).toLowerCase();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const letter = 'A-Za-zÀ-ÿ0-9_';
  const re = new RegExp('(^|[^' + letter + '])(' + esc + ')($|[^' + letter + '])', 'i');
  return re.test(content || '');
}

module.exports = { runAutomod, blacklistWordMatch, _test: { spamTracker } };
