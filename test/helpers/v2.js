// test/helpers/v2.js — Lecteur de payload Components V2 pour les tests.
//
// Pourquoi ce fichier existe (v234) :
//   Depuis la migration vers Components V2, un message n'a plus de champ
//   `embeds` : tout est dans `components[0]`, un CONTENEUR (type 17) qui
//   imbrique TextDisplay (10), Separator (14), MediaGallery (12), Section (9),
//   Thumbnail (11) et File (13)
//   et ActionRow (1). Les tests qui faisaient `payload.embeds[0].toJSON()`
//   lèvent donc « Cannot read properties of undefined ».
//
//   Plutôt que de dupliquer la lecture dans chaque test (et de la réécrire à
//   chaque lot de migration), ce module centralise l'équivalence :
//
//     AVANT (embed classique)              APRÈS (Components V2)
//     ────────────────────────             ─────────────────────────────
//     payload.embeds[0].toJSON().title     v2.title(payload)
//     …description                         v2.texts(payload) (blocs)
//     …fields                              v2.texts(payload) (blocs « **n** v »)
//     …image.url                           v2.mediaUrls(payload)
//     payload.components[0]                v2.rows(payload)  ← DANS le conteneur
//     payload.embeds.length === 1          v2.isV2(payload)
//
//   Règle d'or : on met à jour la FORME de l'assertion, jamais son INTENTION.
//
// Ce fichier n'est pas un test : run-all.js ne lit que test/*.js (non récursif).

const { MessageFlags } = require('discord.js');

const IS_V2 = MessageFlags.IsComponentsV2;

// Types de composants Components V2 (Discord API).
// ⚠️ v239 — SECTION valait 18, ce qui est FAUX : discord.js expose
// ComponentType.Section = 9 (le 18 n'existe pas dans l'API). La constante
// n'était lue nulle part, donc aucun test ne cassait — mais 21 fichiers
// importent ce helper : la prochaine assertion sur une Section aurait échoué
// en silence. Valeurs recopiées de `require('discord.js').ComponentType`.
const TYPE = {
  ACTION_ROW: 1,
  SECTION: 9,
  TEXT_DISPLAY: 10,
  THUMBNAIL: 11,
  MEDIA_GALLERY: 12,
  FILE: 13,
  SEPARATOR: 14,
  CONTAINER: 17,
};

// Normalise en JSON : accepte un builder discord.js ou du JSON brut.
function plain(value) {
  if (!value) return value;
  return typeof value.toJSON === 'function' ? value.toJSON() : value;
}

// Le conteneur racine (type 17). Un payload V2 n'a qu'un seul composant de
// premier niveau : tout le reste est imbriqué dedans.
function container(payload) {
  if (!payload || !Array.isArray(payload.components) || !payload.components.length) return null;
  return plain(payload.components[0]);
}

// Tous les TextDisplay, dans l'ordre de rendu (récursif : un Section contient
// ses propres TextDisplay).
function texts(payload) {
  const out = [];
  const walk = (node) => {
    const json = plain(node);
    for (const child of (json && json.components) || []) {
      if (Number(child.type) === TYPE.TEXT_DISPLAY) out.push(String(child.content || ''));
      else walk(child);
    }
  };
  walk(container(payload));
  return out;
}

// Titre : le TextDisplay « ## … » posé par ui.v2panel pour options.title.
function title(payload) {
  const found = texts(payload).find((t) => t.startsWith('## '));
  return found ? found.replace(/^##\s*/, '') : '';
}

// Auteur : le TextDisplay « **…** » qui précède le titre (ui.v2panel rend
// options.author.name en gras, juste au-dessus du « ## »).
function author(payload) {
  const all = texts(payload);
  const i = all.findIndex((t) => t.startsWith('## '));
  if (i > 0 && /^\*\*.*\*\*$/.test(all[i - 1])) return all[i - 1].slice(2, -2);
  return '';
}

// Pied de panneau : le TextDisplay discret « -# … ».
function footer(payload) {
  const found = texts(payload).find((t) => t.startsWith('-# '));
  return found ? found.replace(/^-#\s*/, '') : '';
}

// Séparateurs natifs pleine largeur (divider: true). C'est l'équivalent V2 des
// anciens traits texte « ━ » — et ce que la migration vient remplacer.
function dividers(payload) {
  const c = container(payload);
  if (!c) return 0;
  return (c.components || []).filter((k) => Number(k.type) === TYPE.SEPARATOR && k.divider === true).length;
}

// URLs des MediaGallery (équivalent de embed.image.url / setImage()).
function mediaUrls(payload) {
  const out = [];
  const walk = (node) => {
    const json = plain(node);
    if (!json) return;
    if (Number(json.type) === TYPE.MEDIA_GALLERY) {
      for (const item of json.items || []) {
        const url = item && item.media && item.media.url;
        if (url) out.push(String(url));
      }
    }
    for (const child of json.components || []) walk(child);
  };
  walk(container(payload));
  return out;
}

// URLs des Thumbnail (équivalent de embed.thumbnail.url).
function thumbnailUrls(payload) {
  const out = [];
  const walk = (node) => {
    const json = plain(node);
    if (!json) return;
    if (Number(json.type) === TYPE.THUMBNAIL && json.media && json.media.url) out.push(String(json.media.url));
    for (const child of json.components || []) walk(child);
    // v236 — quand l'en-tête porte une vignette, ui.v2panel l'imbrique dans une
    // SECTION dont la vignette est l'`accessory` (et non un enfant `components`).
    if (json.accessory) walk(json.accessory);
  };
  walk(container(payload));
  return out;
}

// ActionRow imbriquées DANS le conteneur : en V2 les boutons/menus ne peuvent
// plus être au niveau du message.
function rows(payload) {
  const out = [];
  const walk = (node) => {
    const json = plain(node);
    if (!json) return;
    if (Number(json.type) === TYPE.ACTION_ROW) { out.push(json); return; }
    for (const child of json.components || []) walk(child);
  };
  walk(container(payload));
  return out;
}

// Tous les composants interactifs (boutons, menus) de toutes les rangées.
function controls(payload) {
  return rows(payload).flatMap((r) => r.components || []);
}

// Le premier composant interactif dont le customId commence par `prefix`.
function controlByPrefix(payload, prefix) {
  return controls(payload).find((c) => String(c.custom_id || '').startsWith(prefix)) || null;
}

// Tout le texte visible d'un payload : `content` du message (format classique)
// OU les TextDisplay du conteneur (format V2). Permet de conserver telles
// quelles les assertions du type `reponse.content.includes('…')` après une
// migration, en remplaçant seulement `reponse.content` par `v2.allText(reponse)`.
function allText(payload) {
  if (!payload) return '';
  const parts = [];
  if (typeof payload.content === 'string' && payload.content) parts.push(payload.content);
  parts.push(...texts(payload));
  return parts.join('\n');
}

// Couleur d'accent du conteneur (équivalent V2 de embed.color), en entier.
function accentColor(payload) {
  const c = container(payload);
  return c ? c.accent_color : undefined;
}

// Est-ce bien un payload Components V2 (flag posé ET plus d'embeds) ?
function isV2(payload) {
  return !!payload && (Number(payload.flags) & Number(IS_V2)) !== 0 && payload.embeds === undefined;
}

// JSON complet du conteneur — pratique pour chercher une chaîne n'importe où.
function json(payload) {
  return JSON.stringify(container(payload) || {});
}

// Nombre total de composants imbriqués (plafond Discord : 40).
function componentCount(payload) {
  let n = 0;
  const walk = (node) => {
    const jsonNode = plain(node);
    for (const child of (jsonNode && jsonNode.components) || []) { n += 1; walk(child); }
  };
  walk(container(payload));
  return n;
}

module.exports = {
  TYPE, IS_V2,
  plain, container, texts, title, author, footer,
  dividers, mediaUrls, thumbnailUrls, rows, controls, controlByPrefix,
  isV2, json, componentCount, allText, accentColor,
};
