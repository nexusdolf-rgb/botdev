// ============================================================
// Hoxera — Anti-raid (verrouillage du serveur)
// Logique partagée entre la commande Discord /lockdown et le
// dashboard (module Réglages serveur) : UNE seule source de vérité.
// ============================================================
const { ChannelType, PermissionsBitField } = require('discord.js');
const store = require('../db');
const logging = require('./logging');

// État actuel du verrouillage (pour le dashboard et /lockdown view)
function state(botId, guild) {
  const gs = store.guildSettings.get(botId, guild.id) || {};
  let list = [];
  try { list = JSON.parse(gs.lockdown_channels || '[]'); } catch {}
  const channels = list.map((e) => {
    const ch = guild.channels && guild.channels.cache ? guild.channels.cache.get(e.id) : null;
    return { id: e.id, name: ch ? ch.name : 'salon supprimé', wasDenied: !!e.wasDenied, exists: !!ch };
  });
  return { locked: list.length > 0, channels };
}

// Verrouille tous les salons texte (sauf ceux déjà fermés) et mémorise
// l'état d'origine pour pouvoir tout rouvrir proprement.
async function on(botId, guild, byTag) {
  const gs = store.guildSettings.get(botId, guild.id) || {};
  let existing = [];
  try { existing = JSON.parse(gs.lockdown_channels || '[]'); } catch {}
  if (existing.length) return { already: true, channels: existing.length };
  const locked = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildText) continue;
    const everyone = guild.roles.everyone;
    const perms = ch.permissionsFor ? ch.permissionsFor(everyone) : null;
    if (!perms || !perms.has(PermissionsBitField.Flags.ViewChannel)) continue;
    const wasDenied = !perms.has(PermissionsBitField.Flags.SendMessages);
    locked.push({ id: ch.id, wasDenied });
    if (!wasDenied) {
      await ch.permissionOverwrites.edit(everyone, { SendMessages: false }).catch(() => {});
    }
  }
  store.guildSettings.set(botId, guild.id, { lockdown_channels: JSON.stringify(locked) });
  try {
    await logging.log(botId, guild, {
      title: '🚨 Verrouillage du serveur', color: '#ED4245',
      description: `${byTag} a verrouillé ${locked.length} salon(s) (anti-raid).`,
    });
  } catch {}
  return { already: false, channels: locked.length };
}

// Rouvre uniquement les salons que le bot avait verrouillés
// (restaure l'état d'origine, sans toucher aux autres).
async function off(botId, guild, byTag) {
  const gs = store.guildSettings.get(botId, guild.id) || {};
  let existing = [];
  try { existing = JSON.parse(gs.lockdown_channels || '[]'); } catch {}
  if (!existing.length) return { reopened: 0 };
  let reopened = 0;
  for (const e of existing) {
    const ch = guild.channels.cache.get(e.id);
    if (!ch || (typeof ch.isTextBased === 'function' && !ch.isTextBased())) continue;
    if (!e.wasDenied) {
      await ch.permissionOverwrites.delete(guild.roles.everyone).catch(() => {});
      reopened++;
    }
  }
  store.guildSettings.set(botId, guild.id, { lockdown_channels: '' });
  try {
    await logging.log(botId, guild, {
      title: '🔓 Réouverture du serveur', color: '#57F287',
      description: `${byTag} a rouvert ${reopened} salon(s).`,
    });
  } catch {}
  return { reopened };
}

module.exports = { state, on, off };
