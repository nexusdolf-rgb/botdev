// ============================================================
// Hoxera — Design System Discord (v3.20)
// Une seule grammaire visuelle pour les panneaux, les salons privés
// et les messages privés. Les composants Discord restent natifs et
// compatibles avec les anciens custom_id.
// ============================================================
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const COLORS = Object.freeze({
  brand: '#5865F2',
  info: '#5865F2',
  success: '#57F287',
  warning: '#FEE75C',
  danger: '#ED4245',
  ticket: '#5865F2',
  live: '#FE2C55',
  economy: '#F1C40F',
});

const DEFAULT_FOOTER = 'Hoxera · Assistant de ton serveur';

function colorFor(variantOrColor) {
  const value = String(variantOrColor || 'info');
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : (COLORS[value] || COLORS.info);
}

function text(value, max = 4096) {
  return String(value || '').slice(0, max);
}

function embed(options = {}) {
  const e = new EmbedBuilder()
    .setColor(colorFor(options.color || options.variant || 'info'));
  if (options.title) e.setTitle(text(options.title, 256));
  if (options.description) e.setDescription(text(options.description, 4096));
  if (options.author && options.author.name) e.setAuthor({
    name: text(options.author.name, 256),
    ...(options.author.iconURL ? { iconURL: options.author.iconURL } : {}),
    ...(options.author.url ? { url: options.author.url } : {}),
  });
  if (Array.isArray(options.fields)) {
    e.addFields(options.fields.slice(0, 25).map((field) => ({
      name: text(field.name || '\u200b', 256),
      value: text(field.value || '—', 1024),
      inline: !!field.inline,
    })));
  }
  if (options.thumbnail) e.setThumbnail(String(options.thumbnail));
  if (options.image) e.setImage(String(options.image));
  if (options.footer !== false) e.setFooter({ text: text(options.footer || DEFAULT_FOOTER, 2048) });
  if (options.timestamp !== false) e.setTimestamp(options.timestamp instanceof Date ? options.timestamp : undefined);
  return e;
}

function panel(options = {}, components = []) {
  const payload = { embeds: [embed(options)] };
  if (Array.isArray(components) && components.length) payload.components = components;
  return payload;
}

function contentPanel(content, options = {}, components = []) {
  return { content: text(content, 2000), ...panel(options, components) };
}

function row(buttons = []) {
  const actionRow = new ActionRowBuilder();
  for (const definition of buttons.slice(0, 5)) {
    if (!definition) continue;
    const b = new ButtonBuilder()
      .setCustomId(text(definition.customId || definition.custom_id || 'hx-ui-button', 100))
      .setLabel(text(definition.label || 'Action', 80))
      .setStyle(definition.style || ButtonStyle.Secondary);
    if (definition.emoji) b.setEmoji(definition.emoji);
    if (definition.disabled) b.setDisabled(true);
    actionRow.addComponents(b);
  }
  return actionRow;
}

function linkRow(label, url, emoji = '') {
  const b = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(text(label, 80)).setURL(String(url));
  if (emoji) b.setEmoji(emoji);
  return new ActionRowBuilder().addComponents(b);
}

function status(options = {}, components = []) {
  return panel({
    variant: options.variant || 'info',
    title: options.title || 'ℹ️ Information',
    description: options.description || '',
    fields: options.fields,
    footer: options.footer,
    timestamp: options.timestamp,
  }, components);
}

module.exports = { COLORS, DEFAULT_FOOTER, colorFor, embed, panel, contentPanel, row, linkRow, status, text };
