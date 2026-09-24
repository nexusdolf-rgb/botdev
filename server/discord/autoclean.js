// ============================================================
// Hoxera v317 — Nettoyage auto
// Salons choisis : un message (le plus ancien parmi les récents)
// est retiré toutes les X secondes. Jamais tout d’un coup.
// Les messages épinglés restent.
// ============================================================
'use strict';
const store = require('../db');
const { findChannelInGuild } = require('./panels');

const MIN_INTERVAL = 2;
const MAX_INTERVAL = 3600;
const DEFAULT_INTERVAL = 10;
const MAX_CHANNELS = 20;
const FETCH_LIMIT = 50;

const lastTick = new Map(); // `${botId}:${guildId}:${channelId}` → timestamp ms

function clampInterval(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL;
  return Math.min(Math.max(n, MIN_INTERVAL), MAX_INTERVAL);
}

function sanitizeChannels(list) {
  const raw = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const s = String(item || '').trim().slice(0, 80);
    if (!s || s.includes('<') || s.includes('>') || s.includes('\n')) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_CHANNELS) break;
  }
  return out;
}

function parseChannelsField(raw) {
  if (Array.isArray(raw)) return sanitizeChannels(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try { return sanitizeChannels(JSON.parse(raw)); } catch { return []; }
  }
  return [];
}

function parseConfig(gs) {
  const row = gs || {};
  return {
    enabled: !!(row.autoclean_enabled),
    channels: parseChannelsField(row.autoclean_channels),
    interval: clampInterval(row.autoclean_interval),
  };
}

function asMessageList(messages) {
  if (!messages) return [];
  if (Array.isArray(messages)) return messages.filter(Boolean);
  if (typeof messages.values === 'function') return [...messages.values()].filter(Boolean);
  if (typeof messages[Symbol.iterator] === 'function') {
    const out = [];
    for (const item of messages) {
      if (!item) continue;
      out.push(Array.isArray(item) ? item[1] : item);
    }
    return out.filter(Boolean);
  }
  return [];
}

function pickOldestDeletable(messages) {
  const list = asMessageList(messages)
    .filter((m) => m && !m.pinned && !m.system && m.deletable !== false);
  if (!list.length) return null;
  list.sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
  return list[0];
}

function tickKey(botId, guildId, channelId) {
  return `${botId}:${guildId}:${channelId}`;
}

function resetTicks() {
  lastTick.clear();
}

async function sweepChannel(botId, guild, channel, intervalSec, now) {
  if (!channel || typeof channel.messages?.fetch !== 'function') return { deleted: 0 };
  const key = tickKey(botId, guild.id, channel.id);
  if (now - (lastTick.get(key) || 0) < intervalSec * 1000) return { skipped: true };
  lastTick.set(key, now);

  let fetched;
  try {
    fetched = await channel.messages.fetch({ limit: FETCH_LIMIT });
  } catch {
    return { error: 'fetch' };
  }
  const target = pickOldestDeletable(fetched);
  if (!target || typeof target.delete !== 'function') return { deleted: 0 };
  try {
    await target.delete();
    return { deleted: 1, messageId: target.id };
  } catch {
    return { error: 'delete' };
  }
}

async function sweep(botId, entry, now = Date.now()) {
  const client = entry && entry.client;
  if (!client || typeof client.isReady === 'function' && !client.isReady()) return { ran: 0 };
  const guilds = client.guilds && client.guilds.cache
    ? [...client.guilds.cache.values()]
    : [];
  let ran = 0;
  for (const guild of guilds) {
    if (!guild || !guild.id) continue;
    const cfg = parseConfig(store.guildSettings.get(botId, guild.id));
    if (!cfg.enabled || !cfg.channels.length) continue;
    for (const ref of cfg.channels) {
      const channel = findChannelInGuild(guild, ref);
      if (!channel) continue;
      const isText = typeof channel.isTextBased === 'function'
        ? channel.isTextBased()
        : !!(channel.messages);
      if (!isText) continue;
      const result = await sweepChannel(botId, guild, channel, cfg.interval, now);
      if (result && result.deleted) ran += result.deleted;
    }
  }
  return { ran };
}

module.exports = {
  MIN_INTERVAL,
  MAX_INTERVAL,
  DEFAULT_INTERVAL,
  MAX_CHANNELS,
  clampInterval,
  sanitizeChannels,
  parseChannelsField,
  parseConfig,
  pickOldestDeletable,
  sweep,
  resetTicks,
};
