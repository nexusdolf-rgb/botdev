// ============================================================
// Hoxera — 📣 Annonces personnalisées (v3.22)
// Composer visuel du dashboard → publication immédiate dans plusieurs
// salons avec mentions de rôles contrôlées. Indépendant des annonces
// programmées historiques.
// ============================================================
const store = require('../db');
const ui = require('./ui');
const panels = require('./panels');

const DEFAULT_COLOR = '#e07a5f';
const DEFAULT_FOOTER = 'Hoxera · Annonce du serveur';

function list(value, max = 20, maxLength = 100) {
  let result = value;
  if (typeof result === 'string') {
    try { result = JSON.parse(result || '[]'); } catch { result = result.split(/[,\n]/); }
  }
  if (!Array.isArray(result)) result = [];
  return [...new Set(result.map((x) => String(x || '').trim().slice(0, maxLength)).filter(Boolean))].slice(0, max);
}

function normalizeConfig(config = {}) {
  return {
    ...config,
    name: String(config.name || 'Annonce personnalisée').trim().slice(0, 80),
    title: String(config.title || '').trim().slice(0, 256),
    message: String(config.message || '').slice(0, 4000),
    color: /^#[0-9a-fA-F]{6}$/.test(String(config.color || '')) ? String(config.color) : DEFAULT_COLOR,
    image_url: /^https:\/\//i.test(String(config.image_url || '').trim()) ? String(config.image_url).trim().slice(0, 500) : '',
    footer: String(config.footer || '').trim().slice(0, 200),
    channels: list(config.channels, 20, 100),
    ping_roles: list(config.ping_roles, 10, 100),
  };
}

function roleRefKey(value) {
  return String(value || '').replace(/[<@&>]/g, '').trim().toLowerCase();
}

function roleMatches(role, ref) {
  if (!role) return false;
  if (String(role.id) === roleRefKey(ref)) return true;
  if (String(role.name || '').toLowerCase() === String(ref || '').toLowerCase()) return true;
  return panels.roleKey && panels.roleKey(role.name) === panels.roleKey(ref);
}

async function rolesFor(guild, refs) {
  let roles = refs.map((ref) => panels.resolveRole(guild, ref)).filter(Boolean);
  if (roles.length < refs.length && guild.roles && typeof guild.roles.fetch === 'function') {
    await guild.roles.fetch().catch(() => {});
    roles = refs.map((ref) => panels.resolveRole(guild, ref)).filter(Boolean);
  }
  return roles.filter((role, index, all) => all.findIndex((item) => item.id === role.id) === index);
}

function buildEmbed(config, guild) {
  const cfg = normalizeConfig(config);
  const title = cfg.title || cfg.name || '📣 Annonce';
  const e = ui.embed({
    color: cfg.color,
    author: { name: `Hoxera · ${guild && guild.name ? String(guild.name).slice(0, 170) : 'Annonce'}` },
    title,
    description: cfg.message || 'Écris ton annonce depuis le dashboard.',
    footer: cfg.footer || DEFAULT_FOOTER,
    image: cfg.image_url || '',
  });
  return e;
}

function buildPayload(config, guild, roleIds = []) {
  const payload = {
    embeds: [buildEmbed(config, guild)],
    allowedMentions: { roles: roleIds.map(String), users: [], parse: [] },
  };
  if (roleIds.length) payload.content = roleIds.map((id) => `<@&${id}>`).join(' ');
  return payload;
}

async function sendAnnouncement(botId, guildId, client) {
  const row = store.customAnnouncements.get(botId, guildId);
  if (!row) throw new Error('Configure d’abord ton annonce personnalisée.');
  const config = normalizeConfig(row);
  if (!config.message.trim()) throw new Error('Écris le contenu de ton annonce.');
  if (!config.channels.length) throw new Error('Choisis au moins un salon de publication.');
  const guild = client && client.guilds && client.guilds.cache.get(String(guildId));
  if (!guild) throw new Error('Le bot n’est pas présent sur ce serveur.');

  const channels = config.channels.map((ref) => panels.findChannelInGuild(guild, ref)).filter((channel, index, all) => channel && all.findIndex((item) => item.id === channel.id) === index);
  if (!channels.length) throw new Error('Aucun salon de publication n’a été trouvé.');
  const missingChannels = config.channels.filter((ref) => !panels.findChannelInGuild(guild, ref));
  const roles = await rolesFor(guild, config.ping_roles);
  const missingRoles = config.ping_roles.filter((ref) => !roles.some((role) => roleMatches(role, ref)));
  const payload = buildPayload(config, guild, roles.map((role) => role.id));
  let sent = 0;
  for (const channel of channels) {
    if (!channel || typeof channel.send !== 'function') continue;
    const message = await channel.send(payload);
    if (message) sent++;
  }
  if (!sent) throw new Error('L’annonce n’a pas pu être envoyée. Vérifie les permissions du bot.');
  return { sent, channels: channels.map((channel) => channel.id), missingChannels, missingRoles };
}

module.exports = { normalizeConfig, buildEmbed, buildPayload, sendAnnouncement };
