// ============================================================
// v324 — Panneau de liens façon DraftBot.
// Un texte au-dessus + UN embed (titre, texte, image, couleur)
// + des boutons lien, 2 par ligne (💙 Tiktok, 💙 Youtube…).
// ============================================================
const store = require('../db');
const i18n = require('../i18n');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');

const MAX_LINKS = 10;
const BUTTONS_PER_ROW = 2;
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
  return {
    id: String(x.id || `l${i + 1}`).slice(0, 24),
    label: String(x.label || '').trim().slice(0, 80),
    emoji: String(x.emoji || '').trim().slice(0, 80),
    url: String(x.url || '').trim().slice(0, 512),
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
  return sanitizeLinks(cfg.links || []).filter((l) => isSafeUrl(l.url) && l.label);
}

function buildPayload(cfg, lang = 'fr', guildName = '') {
  const texts = panelTexts(cfg, lang, guildName);
  const links = validLinks(cfg);

  const panel = new EmbedBuilder()
    .setTitle(texts.title)
    .setDescription(texts.description)
    .setColor(colorInt(texts.color));
  if (isSafeUrl(cfg.image)) panel.setImage(String(cfg.image).trim());
  if (texts.footer) panel.setFooter({ text: texts.footer });

  const rows = [];
  for (let i = 0; i < links.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder();
    links.slice(i, i + BUTTONS_PER_ROW).forEach((link) => {
      const b = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(String(link.label || 'Ouvrir').slice(0, 80))
        .setURL(link.url);
      if (link.emoji) {
        try { b.setEmoji(link.emoji); } catch { /* emoji invalide : on ignore */ }
      }
      row.addComponents(b);
    });
    rows.push(row);
  }

  const payload = { embeds: [panel], components: rows };
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
  MAX_LINKS, BUTTONS_PER_ROW, isSafeUrl, sanitizeLinks, cfgOf, saveCfg, panelTexts, validLinks, buildPayload, sendPanel,
};
