// ============================================================
// Hoxera — Design System Discord (v3.21)
// Une seule grammaire visuelle pour les panneaux, les salons privés
// et les messages privés. Les composants Discord restent natifs et
// compatibles avec les anciens custom_id.
// ============================================================
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
} = require('discord.js');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Traits de séparation (v220) — rendu « pro » des grands panneaux.
// Chaque grande section textuelle d'un panneau est séparée de la
// suivante par un long trait discret (20 × U+2501), à la place des
// simples sauts de ligne. Rendu 100 % texte, aucune couleur ajoutée.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SEPARATOR = '━'.repeat(20);

// Découpe un texte en paragraphes (sections) : chaque paragraphe délimité par
// une ligne vide devient un élément du tableau. Les blocs de code (``` ou ~~~)
// ne sont jamais coupés : une ligne vide À L'INTÉRIEUR d'une clôture appartient
// au bloc. Utilisé par sectionize() (qui les rejoint par SEPARATOR en texte)
// et par les panneaux natifs (Container V2) qui placent un séparateur pleine
// largeur entre chaque paragraphe.
function paragraphs(input) {
  if (input == null) return [];
  const src = String(input).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const out = [];
  let cur = [];
  let fence = null;
  const flush = () => {
    if (cur.length) out.push(cur.join('\n'));
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
  return out;
}

// Découpe un texte en sections puis les rejoint par le long trait. Garde-fous :
//   • un texte à section unique repart STRICTEMENT inchangé ;
//   • les blocs de code ne sont jamais coupés (voir paragraphs) ;
//   • le reste du texte (liens, markdown, émojis…) n'est pas touché.
function sectionize(input, max = Infinity) {
  if (input == null) return '';
  const src = String(input).replace(/\r\n?/g, '\n');
  const sections = paragraphs(src);
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Conteneurs Components V2 (v231) — séparateurs NATIFS pleine largeur.
//
// POURQUOI : un trait fait de caractères ━ est du TEXTE. Discord applique
// un padding interne à tout contenu d'embed : le trait s'arrête donc avant
// le bord arrondi, et sa longueur visible dépend du nombre de caractères
// (et passe à la ligne sur mobile, où l'embed est plus étroit). C'est ce
// que constatait déjà le commentaire v220 d'advancedTickets.js : « pas un
// trait de texte qui ne va pas jusqu'au bord du panneau ».
//
// Le Separator de Components V2 est un composant de LAYOUT : Discord le
// dessine sur toute la largeur du conteneur, bord à bord. Tous les panneaux
// du bot doivent avoir la MÊME longueur de trait — celle du panneau de
// tickets personnalisés, qui était déjà en natif.
//
// CONTRAINTES OFFICIELLES (doc discord.js « Display Components ») :
//   • avec le flag IsComponentsV2 on ne peut envoyer NI content, NI embeds,
//     NI poll, NI stickers ;
//   • 40 composants au maximum, IMBRIQUÉS COMPRIS (le conteneur compte) ;
//   • 4 000 caractères au maximum CUMULÉS sur tous les TextDisplay ;
//   • impossible de REVENIR à un message classique en éditant → un message
//     mis à jour (interaction.update) doit rester en V2 ;
//   • on PEUT passer en V2 à l'édition en mettant explicitement content,
//     embeds, poll et stickers à null.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const V2_TEXT_BUDGET = 4000;   // cumul de tous les TextDisplay
const V2_COMPONENT_CAP = 40;   // imbriqués compris
const V2_TITLE_MAX = 200;      // marge sous le budget, titre en « ## … »
const V2_FOOTER_MAX = 300;

function colorInt(variantOrColor) {
  // Les embeds classiques acceptent une couleur NUMÉRIQUE (setColor(0x57f287))
  // mais colorFor() ne reconnaît que les variantes nommées et les chaînes
  // « #rrggbb » : sans ce cas, une couleur numérique retombait silencieusement
  // sur COLORS.info. Le vert d'un quiz réussi se serait affiché en orange.
  if (typeof variantOrColor === 'number' && Number.isFinite(variantOrColor)) {
    return Math.min(Math.max(Math.trunc(variantOrColor), 0), 0xffffff);
  }
  return parseInt(colorFor(variantOrColor).slice(1), 16);
}

// État de construction d'un conteneur : on suit les deux plafonds Discord
// pour qu'un panneau très long se tronque proprement au lieu de faire
// rejeter le message entier par l'API.
function v2state() {
  return { chars: 0, components: 1 }; // 1 = le Container lui-même
}

function v2room(state, needed = 1) {
  return state.components + needed <= V2_COMPONENT_CAP;
}

// Ajoute un bloc de texte. Retourne false s'il a dû être abandonné
// (plafond de composants ou budget de caractères épuisé).
function v2text(container, content, state) {
  const raw = String(content == null ? '' : content);
  if (!raw.length || !v2room(state)) return false;
  const slice = raw.slice(0, Math.max(0, V2_TEXT_BUDGET - state.chars));
  if (!slice.length) return false;
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(slice));
  state.chars += slice.length;
  state.components += 1;
  return true;
}

// Séparateur NATIF pleine largeur. Jamais posé en doublon, jamais en fin
// de conteneur sans texte derrière.
function v2separator(container, state) {
  if (!v2room(state)) return false;
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  state.components += 1;
  return true;
}

// Construit le conteneur V2. Accepte la MÊME grammaire que embed()/panel()
// pour que la migration d'un message soit mécanique :
//   title       → TextDisplay « ## titre »
//   description → paragraphs() → un TextDisplay par paragraphe + séparateurs
//   content     → TextDisplay en tête (l'équivalent du content: classique)
//   fields      → un TextDisplay « **nom**\nvaleur » par champ + séparateurs
//   image       → MediaGallery pleine largeur
//   footer      → TextDisplay « -# … » (texte discret Discord) en pied
//   sections:false → aucun séparateur, texte brut
function v2container(options = {}) {
  const container = new ContainerBuilder().setAccentColor(colorInt(options.color || options.variant || 'info'));
  const state = v2state();
  const useSections = options.sections !== false;

  if (options.image) {
    if (v2room(state)) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(String(options.image)))
      );
      state.components += 1;
    }
  }

  // GRAMMAIRE CALQUÉE SUR LE PANNEAU DE TICKETS PERSONNALISÉS (v220), qui est
  // la référence visuelle retenue : titre, puis corps, avec un séparateur
  // natif ENTRE chaque bloc du corps — mais AUCUN séparateur juste après le
  // titre (le « ## » est déjà visuellement détaché), et un séparateur avant
  // le pied.
  const body = [];
  if (options.description) {
    const desc = String(options.description);
    if (useSections) body.push(...paragraphs(desc).map((p) => text(p, V2_TEXT_BUDGET)));
    else body.push(text(desc, V2_TEXT_BUDGET));
  }
  if (Array.isArray(options.fields)) {
    options.fields.slice(0, 25).forEach((field) => {
      const name = text(field.name || '', 256);
      const value = text(field.value || '—', 1024);
      body.push(name ? `**${name}**\n${value}` : value);
    });
  }

  // 1) content: l'équivalent du « content » d'un message classique. En V2 il
  //    est interdit au niveau du message → il devient un bloc en tête, suivi
  //    d'un séparateur s'il y a quelque chose derrière.
  const hasContent = !!options.content;
  if (hasContent) {
    v2text(container, text(options.content, 2000), state);
    if (options.title || body.length || options.footer !== false) v2separator(container, state);
  }
  // 2) titre : jamais suivi d'un séparateur.
  if (options.title) v2text(container, `## ${text(options.title, V2_TITLE_MAX)}`, state);
  // 3) corps : un séparateur ENTRE chaque bloc.
  body.forEach((block, index) => {
    if (index > 0) v2separator(container, state);
    v2text(container, block, state);
  });

  // Pied de panneau : texte discret, précédé d'un séparateur natif — la même
  // grammaire que le panneau de tickets personnalisés. Components V2 n'a pas
  // de champ « timestamp » : l'heure est reportée dans le pied pour ne pas
  // perdre l'information qu'affichait l'embed classique.
  if (options.footer !== false) {
    let stamp = '';
    if (options.timestamp !== false) {
      // new Date(undefined) donne « Invalid Date » : il faut new Date() sans
      // argument pour l'heure courante.
      const when = options.timestamp instanceof Date ? options.timestamp : new Date();
      if (!Number.isNaN(when.getTime())) {
        stamp = ` · ${when.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
      }
    }
    const footer = text(`${options.footer || DEFAULT_FOOTER}${stamp}`, V2_FOOTER_MAX);
    if (footer && v2room(state, 2)) {
      v2separator(container, state);
      v2text(container, `-# ${footer}`, state);
    }
  }

  // Les lignes de boutons/menus vont DANS le conteneur (V2 n'a pas de
  // components au niveau du message quand le flag est posé).
  const rows = Array.isArray(options.rows) ? options.rows : [];
  rows.slice(0, 5).forEach((row) => {
    if (row && v2room(state)) { container.addActionRowComponents(row); state.components += 1; }
  });
  return container;
}

// Équivalent V2 de panel() : même signature, même grammaire d'options.
// Retourne le payload complet à passer à reply()/send()/followUp().
function v2panel(options = {}, rows = []) {
  // discord.js 14 expose MessageFlags en Number (pas BigInt) : pas de mélange.
  const flags = MessageFlags.IsComponentsV2 | (options.ephemeral ? MessageFlags.Ephemeral : 0);
  return { flags, components: [v2container({ ...options, rows })] };
}

// Équivalent V2 de contentPanel().
function v2contentPanel(content, options = {}, rows = []) {
  return v2panel({ ...options, content }, rows);
}

// Équivalent V2 de status().
function v2status(options = {}, rows = []) {
  return v2panel({
    variant: options.variant || 'info',
    title: options.title || 'ℹ️ Information',
    description: options.description || '',
    fields: options.fields,
    footer: options.footer,
    timestamp: options.timestamp,
    ephemeral: options.ephemeral,
  }, rows);
}

// Payload d'ÉDITION vers/depuis le V2. Discord interdit de revenir à un
// message classique une fois en V2, et exige null explicites pour passer
// d'un embed classique au V2.
function v2edit(options = {}, rows = []) {
  const payload = v2panel(options, rows);
  return { ...payload, content: null, embeds: [], attachments: [] };
}

module.exports = {
  COLORS, DEFAULT_FOOTER, colorFor, colorInt, embed, panel, contentPanel, row, linkRow, status,
  text, SEPARATOR, sectionize, paragraphs,
  V2_TEXT_BUDGET, V2_COMPONENT_CAP, v2container, v2panel, v2contentPanel, v2status, v2edit,
};
