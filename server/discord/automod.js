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

const spamTracker = new Map(); // botId:guildId:userId -> [timestamps]

async function runAutomod(botId, message) {
  if (!message || !message.guild || message.author.bot) return { acted: false };
  const gs = store.guildSettings.get(botId, message.guild.id) || {};
  if (gs.am_enabled !== 1) return { acted: false };

  const member = message.member;
  if (member && member.permissions && typeof member.permissions.has === 'function') {
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
  // Majuscules
  if (!reason && gs.am_caps === 1 && content.length > 12) {
    const letters = content.match(/[a-zà-ÿ]/gi) || [];
    const caps = content.match(/[A-ZÀ-Ý]/g) || [];
    if (letters.length >= 8 && caps.length / letters.length > 0.7) reason = 'trop de majuscules';
  }
  // Mentions
  if (!reason && Number(gs.am_mentions) > 0) {
    const mentions = (content.match(/<@!?\d+>/g) || []).length;
    if (mentions > Number(gs.am_mentions)) reason = 'trop de mentions';
  }

  if (reason) {
    try { if (message.deletable) await message.delete(); } catch {}
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
      return { acted: true, reason: 'spam' };
    }
  }

  return { acted: false };
}

module.exports = { runAutomod };
