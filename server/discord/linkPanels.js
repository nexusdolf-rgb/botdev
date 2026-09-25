// ============================================================
// v323 — Panneau de liens (dashboard).
// Un seul panneau (textes uniques, comme les tickets) + plusieurs
// liens. Chaque lien a son embed personnalisable. Le lien est
// écrit dans l’embed ET en bouton cliquable.
// ============================================================
const store = require('../db');
const i18n = require('../i18n');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const MAX_LINKS = 8;
const KEY = (botId, guildId) => `linkpanel:${botId}:${guildId}`;

function isSafeUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch { return false; }
}

function hexColor(v, fallback = '#e07a5f') {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function colorInt(hex) {
  return parseInt(String(hex || '#e07a5f').replace('#', ''), 16) || 0xe07a5f;
}

function sanitizeLink(raw, i) {
  const x = raw && typeof raw === 'object' ? raw : {};
  const url = String(x.url || '').trim().slice(0, 512);
  return {
    id: String(x.id || `l${i + 1}`).slice(0, 24),
    label: String(x.label || '').trim().slice(0, 80),
    emoji: String(x.emoji || '').trim().slice(0, 80),
    url,
    title: String(x.title || '').trim().slice(0, 256),
    description: String(x.description || '').trim().slice(0, 1000),
    color: hexColor(x.color, '#5865F2'),
    image: String(x.image || '').trim().slice(0, 500),
  };
}

function sanitizeLinks(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_LINKS).map((x, i) => sanitizeLink(x, i));
}

const DEFAULTS = {
  channel: '',
  message_id: '',
  content: '',
  title: '',
  description: '',
  color: '#e07a5f',
  image: '',
  footer: '',
  links: [],
};

function cfgOf(botId, guildId) {
  let raw = {};
  try { raw = JSON.parse(store.settings.get(KEY(botId, guildId)) || '{}') || {}; } catch { raw = {}; }
  return {
    ...DEFAULTS,
    ...raw,
    channel: String(raw.channel || '').slice(0, 30),
    message_id: String(raw.message_id || '').slice(0, 30),
    content: String(raw.content || '').slice(0, 1900),
    title: String(raw.title || '').slice(0, 256),
    description: String(raw.description || '').slice(0, 2000),
    color: hexColor(raw.color),
    image: String(raw.image || '').slice(0, 500),
    footer: String(raw.footer || '').slice(0, 200),
    links: sanitizeLinks(raw.links),
  };
}

function saveCfg(botId, guildId, patch) {
  const cur = cfgOf(botId, guildId);
  const next = { ...cur, ...(patch || {}) };
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'links')) next.links = sanitizeLinks(patch.links);
  store.settings.set(KEY(botId, guildId), JSON.stringify({
    channel: String(next.channel || '').slice(0, 30),
    message_id: String(next.message_id || '').slice(0, 30),
    content: String(next.content || '').slice(0, 1900),
    title: String(next.title || '').slice(0, 256),
    description: String(next.description || '').slice(0, 2000),
    color: hexColor(next.color),
    image: String(next.image || '').slice(0, 500),
    footer: String(next.footer || '').slice(0, 200),
    links: sanitizeLinks(next.links),
  }));
  return cfgOf(botId, guildId);
}

function vars(s, guildName) {
  return String(s || '').split('{server}').join(guildName || 'le serveur');
}

function panelTexts(cfg, lang, guildName) {
  const title = vars(String(cfg.title || '').trim() || i18n.t(lang, 'links_panel_title'), guildName).slice(0, 256);
  const description = vars(String(cfg.description || '').trim() || i18n.t(lang, 'links_panel_desc'), guildName).slice(0, 2000);
  const content = vars(String(cfg.content || '').trim(), guildName).slice(0, 1900);
  return { title, description, content, color: hexColor(cfg.color), footer: String(cfg.footer || '').trim().slice(0, 200) };
}

function validLinks(cfg) {
  return sanitizeLinks(cfg.links || []).filter((l) => isSafeUrl(l.url) && (l.label || l.title));
}

function linkDescription(link) {
  const body = String(link.description || '').trim();
  const url = String(link.url || '').trim();
  if (!body) return url;
  if (body.includes(url)) return body.slice(0, 4096);
  return `${body}\n\n${url}`.slice(0, 4096);
}

function buildPayload(cfg, lang = 'fr', guildName = '') {
  const texts = panelTexts(cfg, lang, guildName);
  const links = validLinks(cfg);
  const embeds = [];

  const panel = new EmbedBuilder()
    .setTitle(texts.title)
    .setDescription(texts.description)
    .setColor(colorInt(texts.color));
  if (isSafeUrl(cfg.image)) panel.setImage(String(cfg.image).trim());
  if (texts.footer) panel.setFooter({ text: texts.footer });
  embeds.push(panel);

  links.forEach((link) => {
    const eb = new EmbedBuilder()
      .setTitle(String(link.title || link.label || 'Lien').slice(0, 256))
      .setDescription(linkDescription(link))
      .setColor(colorInt(link.color));
    if (isSafeUrl(link.url)) eb.setURL(link.url);
    if (isSafeUrl(link.image)) eb.setImage(String(link.image).trim());
    embeds.push(eb);
  });

  const rows = [];
  for (let i = 0; i < links.length; i += 5) {
    const row = new ActionRowBuilder();
    links.slice(i, i + 5).forEach((link) => {
      const b = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(String(link.label || link.title || 'Ouvrir').slice(0, 80))
        .setURL(link.url);
      if (link.emoji) {
        try { b.setEmoji(link.emoji); } catch { /* emoji invalide : on ignore */ }
      }
      row.addComponents(b);
    });
    rows.push(row);
  }

  const payload = { embeds, components: rows };
  if (texts.content) payload.content = texts.content;
  return payload;
}

async function sendPanel(botId, guild, channelId) {
  const cfg = cfgOf(botId, guild.id);
  const chId = String(channelId || cfg.channel || '');
  const channel = guild.channels && guild.channels.cache ? guild.channels.cache.get(chId) : null;
  if (!channel || typeof channel.send !== 'function') {
    const e = new Error('Salon du panneau introuvable.');
    e.code = 'NO_CHANNEL';
    throw e;
  }
  const links = validLinks(cfg);
  if (!links.length) {
    const e = new Error('Ajoutez au moins un lien valide (https://…).');
    e.code = 'NO_LINKS';
    throw e;
  }
  const lang = i18n.langForGuild(guild.id);
  const payload = buildPayload(cfg, lang, guild.name || '');
  let sent = null;
  if (cfg.message_id) {
    try {
      const old = await channel.messages.fetch(cfg.message_id);
      sent = await old.edit(payload);
    } catch { sent = null; }
  }
  if (!sent) sent = await channel.send(payload);
  saveCfg(botId, guild.id, { channel: channel.id, message_id: sent.id });
  return sent;
}

module.exports = {
  MAX_LINKS, isSafeUrl, sanitizeLinks, cfgOf, saveCfg, panelTexts, validLinks, buildPayload, sendPanel,
};
