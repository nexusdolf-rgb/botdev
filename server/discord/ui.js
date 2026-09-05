// ============================================================
// Hoxera — Design System Discord (v3.21)
// Une seule grammaire visuelle pour les panneaux, les salons privés
// et les messages privés. Les composants Discord restent natifs et
// compatibles avec les anciens custom_id.
// ============================================================
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Traits de séparation (v220) — rendu « pro » des grands panneaux.
// Chaque grande section textuelle d'un panneau est séparée de la
// suivante par un long trait discret (20 × U+2501), à la place des
// simples sauts de ligne. Rendu 100 % texte, aucune couleur ajoutée.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SEPARATOR = '━'.repeat(20);

// Découpe un texte en sections : chaque paragraphe délimité par une
// ligne vide (2+ sauts de ligne) devient une section, puis les sections
// sont rejointes par le trait. Garde-fous :
//   • un texte à section unique repart STRICTEMENT inchangé ;
//   • les blocs de code (``` ou ~~~) ne sont jamais coupés : une ligne
//     vide À L'INTÉRIEUR d'une clôture appartient au bloc ;
//   • le reste du texte (liens, markdown, émojis…) n'est pas touché.
function sectionize(input, max = Infinity) {
  if (input == null) return '';
  const src = String(input).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const sections = [];
  let cur = [];
  let fence = null;
  const flush = () => {
    if (cur.length) sections.push(cur.join('\n'));
    cur = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMark = /^(```+|~~~+)/.exec(trimmed);
    if (fence) {
      cur.push(line);
      if (fenceMark) fence = null;
      continue;
    }
    if (fenceMark) {
      fence = fenceMark[1];
      cur.push(line);
      continue;
    }
    if (trimmed === '') {
      flush();
      continue;
    }
    cur.push(line);
  }
  flush();
  let out = sections.length > 1 ? sections.join('\n' + SEPARATOR + '\n') : src;
  if (Number.isFinite(max) && out.length > max) {
    // On tronque, puis on retire un éventuel trait coupé en plein vol
    // (jamais de demi-trait visible en bas du panneau).
    out = out.slice(0, max).replace(/━+$/, '');
  }
  return out;
}

const COLORS = Object.freeze({
  brand: '#e07a5f',
  info: '#e07a5f',
  success: '#57F287',
  warning: '#FEE75C',
  danger: '#ED4245',
  ticket: '#e07a5f',
  live: '#FE2C55',
  social: '#EB459E',   // vie sociale : couple, mariage, affection
  economy: '#F1C40F',  // or de l'économie : gains, solde, boutique, classements coins
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
  if (options.description) {
    // La description passe par la grammaire des sections (v220) : les
    // paragraphes séparés par une ligne vide deviennent des sections
    // séparées par le long trait. Option « sections: false » = texte brut.
    const desc = options.sections === false
      ? text(options.description, 4096)
      : sectionize(options.description, 4096);
    e.setDescription(desc);
  }
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

module.exports = { COLORS, DEFAULT_FOOTER, colorFor, embed, panel, contentPanel, row, linkRow, status, text, SEPARATOR, sectionize };
