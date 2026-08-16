// ============================================================
// BotDev - Journal de modération par serveur (log_channel)
// Trace : actions de modération, tickets, auto-mod, arrivées/départs.
// ============================================================
const { EmbedBuilder } = require('discord.js');
const store = require('../db');

function logChannel(botId, guild) {
  const gs = store.guildSettings.get(botId, guild.id) || {};
  const q = (gs.log_channel || '').trim();
  if (!q) return null;
  const idMatch = q.match(/(\d{15,21})/);
  if (idMatch) return guild.channels.cache.get(idMatch[1]) || null;
  const name = q.replace(/^#/, '').toLowerCase();
  return guild.channels.cache.find((c) => c && c.name && c.name.toLowerCase() === name && c.isTextBased && c.isTextBased()) || null;
}

// Événement de log. color: '#ED4245' (mod), '#57F287' (ok), '#FEE75C' (info), '#5865F2' (tickets)
async function log(botId, guild, { title, description = '', color = '#5865F2', fields = [], footer = '' }) {
  try {
    const channel = logChannel(botId, guild);
    if (!channel || !channel.send) return;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title.slice(0, 256))
      .setTimestamp();
    if (description) embed.setDescription(String(description).slice(0, 1024));
    for (const f of fields.slice(0, 8)) {
      embed.addFields({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline });
    }
    if (footer) embed.setFooter({ text: String(footer).slice(0, 256) });
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[BotDev] log:', e.message);
  }
}

module.exports = { log, logChannel };
