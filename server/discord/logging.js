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
// type (optionnel) : tickets | mod | automod | joinleave | other — filtré par le réglage log_events du serveur
function classifyType(title, explicit) {
  if (explicit) return explicit;
  const t = String(title || '');
  if (t.includes('Ticket')) return 'tickets';
  if (t.includes('Auto-mod') || t.includes('Anti-spam') || t.includes('Liste noire')) return 'automod';
  if (t.includes('membre') && (t.includes('Nouveau') || t.includes('parti') || t.includes('rejoint'))) return 'joinleave';
  // Sécurité : raids, verrouillages, bouclier
  if (t.includes('RAID') || t.includes('raid') || t.includes('Bouclier') || t.includes('Verrouillage') || t.includes('Réouverture') || t.includes('Sécurité')) return 'security';
  if (t.includes('Expulsion') || t.includes('Bannissement') || t.includes('Débannissement') || t.includes('Avertissement') || t.includes('Timeout') || t.includes('Purge') || t.includes('Sanction') || t.includes('Rôle temporaire')) return 'mod';
  return 'other';
}

function eventEnabled(gs, type) {
  if (!gs || !gs.log_events) return true; // pas de filtre → tout est journalisé
  try {
    const map = JSON.parse(gs.log_events);
    if (!map || typeof map !== 'object' || !Object.keys(map).length) return true;
    // Si le filtre existe, on ne journalise que les types marqués 1
    return map[type] === 1 || map[type] === true;
  } catch { return true; }
}

async function log(botId, guild, { title, description = '', color = '#5865F2', fields = [], footer = '', type = '' }) {
  try {
    const gs = store.guildSettings.get(botId, guild.id) || {};
    const evType = classifyType(title, type);
    if (!eventEnabled(gs, evType)) return;
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

module.exports = { log, logChannel, eventEnabled, classifyType };
