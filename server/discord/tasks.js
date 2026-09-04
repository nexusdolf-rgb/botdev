// ============================================================
// BotDev - Tâches périodiques : rôles temporaires expirés + giveaways échus
// Appelé toutes les 30 secondes depuis index.js pour chaque bot en ligne.
// ============================================================
const store = require('../db');
const giveaway = require('./giveaway');
const logging = require('./logging');
const ui = require('./ui');

function parseRoleDuration(str) {
  const s = String(str || '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|sec|m|min|h|d|j)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const mult = { s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000, j: 86400000 }[m[2]];
  return n * mult;
}

function formatDuration(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d} jour(s)`;
  if (h > 0) return `${h} heure(s)`;
  return `${m} minute(s)`;
}

// Donne un rôle temporaire : /temprole @membre @rôle durée
async function giveTempRole(botId, interaction, member, role, durationMs) {
  const expiresAt = Date.now() + Math.min(Math.max(durationMs, 60000), 90 * 86400000);
  await member.roles.add(role).catch(() => {});
  store.tempRoles.add(botId, interaction.guild.id, member.id, role.name, expiresAt);
  await logging.log(botId, interaction.guild, {
    title: '⏳ Rôle temporaire', color: '#FEE75C',
    fields: [
      { name: '👤 Membre', value: `${member.user.tag}`, inline: true },
      { name: '🏷️ Rôle', value: role.name, inline: true },
      { name: '⏱ Durée', value: formatDuration(durationMs), inline: true },
    ],
  });
  return interaction.reply({
    ...ui.panel({
      variant: 'success',
      title: '🏷️ Rôle temporaire attribué',
      description: `${member} reçoit le rôle **${role.name}**.`,
      fields: [
        { name: '⏱️ Durée', value: formatDuration(durationMs), inline: true },
        { name: '🔄 Retrait', value: 'Automatique à la fin de la durée.', inline: true },
      ],
      footer: `Hoxera · ${interaction.guild.name} · Rôles temporaires`,
    }),
    ephemeral: true,
  });
}

// Supprime les avertissements publics arrivés à 24 h. La référence est
// persistée en base : un redémarrage du bot ne laisse pas le message éternel.
async function sweepAutomodWarningMessages(botId, entry) {
  const due = store.automodWarningMessages.due(Date.now(), 200).filter((row) => row.bot_id === botId);
  for (const row of due) {
    const guild = entry && entry.client && entry.client.guilds.cache.get(row.guild_id);
    const channel = guild && guild.channels && guild.channels.cache.get(row.channel_id);
    if (!channel || !channel.messages || typeof channel.messages.fetch !== 'function') continue;
    const message = await channel.messages.fetch(row.message_id).catch(() => null);
    if (!message) {
      // Le message a déjà disparu (modérateur, Discord ou timer local).
      store.automodWarningMessages.remove(row.id);
      continue;
    }
    try {
      try { require('./automod').markAutomodded(row.message_id); } catch {}
      await message.delete();
      store.automodWarningMessages.remove(row.id);
    } catch (e) {
      // On conserve la référence pour réessayer au prochain cycle si les
      // permissions Discord ont changé ou si le réseau était momentanément HS.
      console.error(`[Hoxera] expiration avertissement #${row.message_id} : ${String(e.message || e).slice(0, 160)}`);
    }
  }
}

// Retire les rôles temporaires arrivés à échéance
async function sweep(botId, entry) {
  try { await sweepAutomodWarningMessages(botId, entry); } catch (e) { console.error('[Hoxera] expiration avertissements:', e.message); }
  try { await giveaway.sweep(botId, entry); } catch (e) { console.error('[BotDev] giveaway sweep:', e.message); }

  // Hoxera 2.0 : rappels, messages programmés, anniversaires
  const extra = require('./extra');
  try { await extra.sweepReminders(botId, entry); } catch (e) { console.error('[Hoxera] reminders sweep:', e.message); }
  try { extra.sweepScheduled(botId, entry); } catch (e) { console.error('[Hoxera] scheduled sweep:', e.message); }
  try { await extra.sweepBirthdays(botId, entry); } catch (e) { console.error('[Hoxera] birthdays sweep:', e.message); }

  // 🎫 Fermeture automatique des tickets inactifs (promis sur le panneau)
  try { const panels = require('./panels'); await panels.sweepInactiveTickets(botId, entry); }
  catch (e) { console.error('[Hoxera] ticket sweep:', e.message); }

  // 🛡️ Anti-raid : purge du compteur + réouverture automatique programmée
  try { const antiraid = require('./antiraid'); await antiraid.sweep(botId, entry); }
  catch (e) { console.error('[Hoxera] anti-raid sweep:', e.message); }

  const due = store.tempRoles.due().filter((t) => t.bot_id === botId);
  for (const t of due) {
    try {
      const guild = entry.client.guilds.cache.get(t.guild_id);
      const member = guild ? await guild.members.fetch(t.user_id).catch(() => null) : null;
      const role = guild ? guild.roles.cache.find((r) => r.name.toLowerCase() === t.role.toLowerCase()) : null;
      if (member && role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role).catch(() => {});
        await logging.log(botId, guild, {
          title: '⏳ Rôle temporaire expiré', color: '#e07a5f',
          fields: [
            { name: '👤 Membre', value: `${member.user.tag}`, inline: true },
            { name: '🏷️ Rôle', value: role.name, inline: true },
          ],
        });
      }
    } catch (e) { console.error('[BotDev] temprole sweep:', e.message); }
    store.tempRoles.remove(t.id);
  }

  // ⏱️ Bans temporaires du barème Auto-Mod (v213) : levée automatique à échéance
  const dueBans = store.automodTempBans.due(botId, Date.now());
  for (const ban of dueBans) {
    try {
      const guild = entry.client.guilds.cache.get(ban.guild_id);
      if (guild && typeof guild.bans.remove === 'function') {
        await guild.bans.remove(ban.user_id, ban.reason || 'Fin du ban temporaire Auto-Mod');
        await logging.log(botId, guild, {
          title: '⏱️ Ban temporaire levé', color: '#57F287',
          fields: [
            { name: '👤 Membre', value: `\`${ban.user_tag || ban.user_id}\``, inline: true },
            { name: '📋 Raison initiale', value: String(ban.reason || '—').slice(0, 200), inline: true },
          ],
        });
      }
    } catch (e) { console.error('[Hoxera] temp-ban sweep:', e.message); }
    try { store.automodTempBans.remove(ban.id); } catch {}
  }
}

module.exports = { parseRoleDuration, formatDuration, giveTempRole, sweepAutomodWarningMessages, sweep };
