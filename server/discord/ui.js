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
  SectionBuilder, ThumbnailBuilder, FileBuilder,
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

const DEFAULT_FOOTER = 'Hoxera · Assistant de votre serveur';

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
  // v241 — même règle qu'en V2 : l'heure n'est plus posée par défaut, seule
  // une Date explicite (information ≠ « maintenant ») l'est.
  if (options.timestamp instanceof Date && !Number.isNaN(options.timestamp.getTime())) e.setTimestamp(options.timestamp);
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
//   files       → un composant File (type 13) par pièce jointe uploadée
//   footer      → TextDisplay « -# … » (texte discret Discord) en pied
//   sections:false → aucun séparateur, texte brut
function v2container(options = {}) {
  const container = new ContainerBuilder().setAccentColor(colorInt(options.color || options.variant || 'info'));
  const state = v2state();
  const useSections = options.sections !== false;

  // ORDRE CALQUÉ SUR L'EMBED CLASSIQUE : content (texte du message, au-dessus
  // de l'embed) → author/titre/vignette → description → champs → image →
  // pied. Components V2 n'a pas d'ordre implicite : tout est explicite.

  // 1) content: l'équivalent du « content » d'un message classique. En V2 il
  //    est interdit au niveau du message → il devient un bloc en tête, suivi
  //    d'un séparateur s'il y a quelque chose derrière.
  const hasContent = !!options.content;
  const bodyBlocks = v2bodyBlocks(options, useSections);
  const authorName = options.author && options.author.name ? text(options.author.name, 256) : '';
  const hasFooter = options.footer !== false;
  if (hasContent) {
    v2text(container, text(options.content, 2000), state);
    if (authorName || options.title || bodyBlocks.length || hasFooter) v2separator(container, state);
  }

  // 2) En-tête : author + titre + vignette. Components V2 n'a ni champ
  //    « author » ni champ « thumbnail » d'embed : on les regroupe dans une
  //    SECTION dont la vignette est l'accessoire (jusqu'à 3 TextDisplay).
  //    Sans vignette, de simples TextDisplay suffisent.
  const thumbUrl = options.thumbnail ? String(options.thumbnail)
    : (options.author && options.author.iconURL ? String(options.author.iconURL) : '');
  const headTexts = [];
  if (authorName) headTexts.push(`**${authorName}**`);
  if (options.title) headTexts.push(`## ${text(options.title, V2_TITLE_MAX)}`);
  if (headTexts.length) {
    const usable = headTexts.slice(0, 3);
    // Section(1) + Thumbnail(1) + n TextDisplay : les composants imbriqués
    // comptent dans le plafond de 40.
    if (thumbUrl && v2room(state, 2 + usable.length)) {
      const section = new SectionBuilder();
      usable.forEach((t) => section.addTextDisplayComponents(new TextDisplayBuilder().setContent(t)));
      section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
      container.addSectionComponents(section);
      state.components += 2 + usable.length;
      state.chars += usable.reduce((a, t) => a + t.length, 0);
    } else {
      usable.forEach((t) => v2text(container, t, state));
    }
  }

  // 3) Corps : un séparateur natif ENTRE chaque bloc — mais AUCUN juste après
  //    l'en-tête (le « ## » est déjà visuellement détaché), comme dans le
  //    panneau de tickets personnalisés qui sert de référence.
  bodyBlocks.forEach((block, index) => {
    if (index > 0) v2separator(container, state);
    v2text(container, block, state);
  });

  // 4) image : MediaGallery pleine largeur (en bas, comme setImage()).
  if (options.image && v2room(state)) {
    if (bodyBlocks.length || headTexts.length) v2separator(container, state);
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(String(options.image)))
    );
    state.components += 1;
  }

  // 4b) files : en Components V2, une pièce jointe uploadée n'apparaît PAS
  //     toute seule — il faut la référencer dans un composant. Pour un fichier
  //     non-image (transcription .txt, .pdf, .zip…), c'est le composant File
  //     (type 13) qui s'y colle ; il ne sait afficher QUE de l'`attachment://`.
  //     ⚠️ L'appelant doit TOUJOURS passer le vrai tableau `files` au niveau du
  //     message : ici on ne pose que la référence visuelle.
  //     ⚠️ Interdit par webhook (piège n°10 : V2 + webhook + files = 400).
  //     Réservé aux envois en message classique (MP, channel.send).
  const fileRefs = (Array.isArray(options.files) ? options.files : [])
    .map((f) => String((f && f.name) || f || '').trim())
    .filter(Boolean)
    .map((n) => (n.startsWith('attachment://') ? n : `attachment://${n}`));
  fileRefs.slice(0, 10).forEach((ref, i) => {
    if (!v2room(state)) return;
    if (i === 0 && (bodyBlocks.length || headTexts.length || options.image)) v2separator(container, state);
    container.addFileComponents(new FileBuilder().setURL(ref));
    state.components += 1;
  });

  // 5) Pied de panneau : texte discret précédé d'un séparateur natif.
  //    v241 — L'HEURE N'EST PLUS AJOUTÉE PAR DÉFAUT. Discord affiche déjà
  //    l'horodatage de chaque message : le répéter en pied de panneau était une
  //    duplication systématique (~70 panneaux concernés), et l'utilisateur avait
  //    déjà demandé son retrait pour le ticket privé en v238.
  //    Une Date EXPLICITE reste honorée : elle porte alors une information qui
  //    n'est pas « maintenant » (ex. starboard → la date du message épinglé,
  //    `community.js`). Un `timestamp: true` seul ne suffit plus.
  if (hasFooter) {
    let stamp = '';
    const when = options.timestamp instanceof Date ? options.timestamp : null;
    if (when && !Number.isNaN(when.getTime())) {
      stamp = ` · ${when.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    }
    const footer = text(`${options.footer || DEFAULT_FOOTER}${stamp}`, V2_FOOTER_MAX);
    if (footer && v2room(state, 2) && (hasContent || headTexts.length || bodyBlocks.length || options.image || fileRefs.length)) {
      v2separator(container, state);
      v2text(container, `-# ${footer}`, state);
    }
  }

  // 6) Les lignes de boutons/menus vont DANS le conteneur (V2 n'accepte pas
  //    de components au niveau du message quand le flag est posé).
  const rows = Array.isArray(options.rows) ? options.rows : [];
  rows.slice(0, 5).forEach((row) => {
    if (row && v2room(state)) { container.addActionRowComponents(row); state.components += 1; }
  });
  return container;
}

// Construit la liste des blocs de corps (description + champs), sans rien
// poser dans le conteneur : v2container décide où mettre les séparateurs.
//
// ⚠️ COMPONENTS V2 N'A PAS DE CHAMPS INLINE. La grille 3 colonnes des embeds
// classiques n'existe pas : chaque TextDisplay occupe toute la largeur. Pour
// ne pas dégrader le rendu, les champs inline CONSÉCUTIFS sont regroupés par
// 3 (comme la grille Discord) dans un seul bloc, séparés par « · ». Si la
// ligne dépasse V2_INLINE_LINE, on repasse à un champ par ligne.
const V2_INLINE_LINE = 150;
const V2_INLINE_GROUP = 3;

// v234 — un nom de champ composé uniquement de caractères invisibles (espace
// sans largeur U+200B, ZWJ, BOM, espaces) est un ESPACEUR hérité des embeds
// classiques, pas un intitulé. En V2 il faut n'afficher QUE la valeur, sinon
// le rendu montre un « **⁠** » vide au-dessus du texte.
const BLANK_FIELD_NAME = /^[\u200B-\u200F\u2060\uFEFF\s]*$/;

function v2fieldName(name) {
  const n = String(name == null ? '' : name);
  return BLANK_FIELD_NAME.test(n) ? '' : text(n, 256);
}

// Champ en ligne : intitulé + valeur sur la même ligne (colonnes « · »).
function v2fieldLine(field) {
  const name = v2fieldName(field.name);
  const value = text(field.value || '—', 1024);
  return name ? `**${name}** ${value}` : value;
}

// Champ hors ligne : intitulé seul sur sa ligne, valeur dessous.
function v2fieldBlock(field) {
  const name = v2fieldName(field.name);
  const value = text(field.value || '—', 1024);
  return name ? `**${name}**\n${value}` : value;
}

function v2bodyBlocks(options, useSections) {
  const body = [];
  if (options.description) {
    const desc = String(options.description);
    if (useSections) body.push(...paragraphs(desc).map((p) => text(p, V2_TEXT_BUDGET)));
    else body.push(text(desc, V2_TEXT_BUDGET));
  }
  if (Array.isArray(options.fields) && options.fields.length) {
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const lines = group.map(v2fieldLine);
      const joined = lines.join(' · ');
      // Regroupe par 3 comme la grille inline de Discord ; si c'est trop long
      // pour une ligne, on empile dans le MÊME bloc (pas de séparateur entre
      // les champs d'un même groupe : ce sont des colonnes, pas des sections).
      if (joined.length <= V2_INLINE_LINE) body.push(joined);
      else body.push(lines.join('\n'));
      group = [];
    };
    options.fields.slice(0, 25).forEach((field, index, all) => {
      if (field && field.inline) {
        group.push(field);
        if (group.length >= V2_INLINE_GROUP) flush();
      } else {
        flush();
        body.push(field ? v2fieldBlock(field) : '—');   // v234 — même règle sur les espaceurs
      }
      if (index === all.length - 1) flush();
    });
  }
  return body;
}

// Équivalent V2 de panel() : même signature, même grammaire d'options.
// Retourne le payload complet à passer à reply()/send()/followUp().
function v2panel(options = {}, rows = []) {
  // discord.js 14 expose MessageFlags en Number (pas BigInt) : pas de mélange.
  const flags = MessageFlags.IsComponentsV2 | (options.ephemeral ? MessageFlags.Ephemeral : 0);
  // ⚠️ v239 — `{ ...options, rows }` ÉCRASAIT `options.rows` avec le `[]` par
  // défaut du 2ᵉ paramètre : passer ses boutons via `rows:` DANS les options
  // les faisait disparaître en silence (aucune erreur, juste pas de bouton).
  // Le 2ᵉ argument reste prioritaire ; `options.rows` sert maintenant de repli.
  const finalRows = (Array.isArray(rows) && rows.length) ? rows
    : (Array.isArray(options.rows) ? options.rows : []);
  return { flags, components: [v2container({ ...options, rows: finalRows })] };
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
