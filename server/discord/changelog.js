// ============================================================
// /update — journal de versions (comme /help, pour les mises à jour)
// Fondateur seul pour PUBLIER (NEXORA_ADMIN_DISCORD_ID).
// Tout le monde peut lire et choisir une version dans le menu.
// Au bout de 2 min, le panneau revient à « actuelle + précédente ».
// ============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const ui = require('./ui');

const VERSION = 348;
const DASHBOARD_URL = 'https://hoxera.is-a.dev';
const SUPPORT_URL = 'https://discord.gg/X9hTdr9N3';
const AUTO_REVERT_MS = 2 * 60 * 1000;
const SELECT_ID = (botId) => `hx-upd:${botId}`;

// Plus récent en premier. Menu Discord = 25 options max (accueil + 24 versions).
const VERSIONS = [
  {
    v: 348, date: '30/09', title: 'Modération plus claire',
    new: ['Le module **Modération** est rangé comme un bot pro : filtres compacts, options repliées, tout se choisit dans un **menu**.'],
    improved: ['Moins de pavés de texte. Sanctions, barème et anti-raid : listes claires (Avertir, Timeout, Expulser…).'],
    fixed: ['La page était trop longue : les mêmes aides se répétaient sur chaque filtre.'],
  },
  {
    v: 347, date: '30/09', title: 'Tickets : noms clairs',
    new: ['Les 3 systèmes ont un nom : **Ticket classique**, **Ticket menu**, **Ticket avancé**, avec un exemple sur chacun.'],
    improved: ['Les textes sous les modules sont plus clairs. Les menus des tickets disent à quel système ils appartiennent.'],
    fixed: ['« Autre système : tickets avancés » et « Panneau avec menu (liste) » n’expliquaient pas assez.'],
  },
  {
    v: 346, date: '30/09', title: 'Centre serveurs plus pro',
    new: ['La page **Choisissez un serveur** a des **bannières**, le nombre de membres, une **recherche** et des filtres (tous / à configurer / à inviter).'],
    improved: ['Le centre serveurs rattrape le reste du dashboard : plus seulement une petite icône et un nom.'],
    fixed: ['Sans bannière Discord, une lettre de secours s’affiche. Les photos passent par le site pour s’afficher partout.'],
  },
  {
    v: 345, date: '30/09', title: 'Commandes plus claires',
    new: ['**`/slowmode`** et **`/nick`** (comme les bots pro). `/clear` filtre un membre et un salon. `/unban` et `/say` : sélecteur. `/lockdown` peut verrouiller **un seul salon**.'],
    improved: ['Tous les menus des commandes sont en **français** (Créer, Verrouiller, Voir…) : plus de set / off / create.'],
    fixed: ['Des options demandaient encore un identifiant à coller, et des choix s’affichaient en anglais.'],
  },
  {
    v: 344, date: '30/09', title: 'Commandes : tout se clique',
    new: ['Les commandes de configuration ont des **sélecteurs** : salon, catégorie, rôle. `/ticket logs` choisit le salon du récapitulatif staff.'],
    improved: ['`/ticket setup` ajoute l’étape récap staff. `/ticket category`, `/giveaway`, `/event`, `/voicetemp`, `/apply` : on clique, on ne tape plus le nom.'],
    fixed: ['Plusieurs options demandaient encore d’écrire le nom d’un salon ou d’un rôle à la main.'],
  },
  {
    v: 343, date: '30/09', title: 'Captcha privé',
    new: ['Le captcha est **privé** : salon invisible aux autres, image et saisie dans un **fil privé**, tickets et serveur masqués jusqu’au succès.'],
    improved: ['Activer le captcha **isole tout seul** le serveur. Les tickets ne sont jamais ouverts au rôle vérifié.'],
    fixed: ['Le panneau et le code tapé étaient visibles de tout le serveur ; un nouveau membre voyait les tickets avant d’être vérifié.'],
  },
  {
    v: 342, date: '30/09', title: 'Captcha : rôle, textes, unique',
    new: ['Dans le captcha : **rôle après succès**, **titre et texte du panneau** modifiables, aperçu en direct.'],
    improved: ['Chaque arrivée reçoit un **nouveau** code, avec une image différente (pas la même à chaque fois).'],
    fixed: [],
  },
  {
    v: 341, date: '30/09', title: 'Captcha à l’arrivée',
    new: ['Quand un membre rejoint, le bot peut lui envoyer un **captcha** (image de lettres) dans le salon choisi : 2 essais, 2 minutes, sinon expulsion avec un MP clair.'],
    improved: ['Le message de bienvenue part **après** le captcha, dans le salon du module Bienvenue. Le bouton « Je suis humain » est toujours là.'],
    fixed: [],
  },
  {
    v: 340, date: '29/09', title: 'Ticket fermé : plus d’écriture',
    new: ['Après **🔒 Fermer**, le créateur voit encore le salon, mais il ne peut plus y écrire.'],
    improved: ['La réparation automatique ne redonne plus l’écriture sur un ticket déjà fermé.'],
    fixed: ['Le bouton Fermer (et `/ticket close`) laissait parfois le créateur écrire.'],
  },
  {
    v: 339, date: '28/09', title: 'Ticket : responsable sur le panneau',
    new: ['Après **Prendre ce ticket**, le bouton devient une ligne courte : **Responsable : @staff** — sur le même panneau.'],
    improved: ['Plus de message « untel s’occupe de ce ticket » dans le salon.'],
    fixed: [],
  },
  {
    v: 338, date: '28/09', title: 'Accueil plus pro',
    new: ['Page d’accueil publique : photo Optimus, un titre, un bouton, beaucoup d’air.'],
    improved: ['Moins de bruit visuel : plus une page produit qu’un panneau d’administration.'],
    fixed: [],
  },
  {
    v: 337, date: '28/09', title: 'Page d’accueil au niveau du dashboard',
    new: [],
    improved: ['La page publique a le même style que le centre serveurs : texte à gauche, carte en direct à droite, cartes argile.'],
    fixed: ['L’accueil restait sur l’ancien centrage et un mélange de couleurs.'],
  },
  {
    v: 336, date: '27/09', title: '/update tout de suite',
    new: ['`/update` est aussi enregistrée **sur le serveur support** : elle apparaît tout de suite, sans attendre 1 h.'],
    improved: ['La commande est placée en tête pour ne jamais être coupée par la limite Discord.'],
    fixed: ['`/update` n’apparaissait pas dans le menu : elle n’était pas encore chez Discord.'],
  },
  {
    v: 335, date: '27/09', title: 'Journal de versions',
    new: ['Menu déroulant : toutes les versions, un clic pour le détail complet.', 'Aperçu par défaut : version **actuelle** + version **précédente**.'],
    improved: ['Le panneau revient tout seul à l’aperçu au bout de 2 minutes.'],
    fixed: [],
  },
  {
    v: 334, date: '27/09', title: 'Commande /update',
    new: ['Commande **/update** : le fondateur publie le journal dans le salon des mises à jour.'],
    improved: [],
    fixed: [],
  },
  {
    v: 333, date: '27/09', title: 'Tickets : prendre + questions + ping',
    new: ['Bouton **Prendre ce ticket** (plus dans le menu) — il disparaît après un clic.', 'Chaque question du questionnaire a sa propre limite de caractères (1 à 4000).'],
    improved: [],
    fixed: ['À l’arrivée d’un membre, la mention ping **vraiment** (notification Discord).'],
  },
  {
    v: 332, date: '27/09', title: 'Lives : mobile + rôle',
    new: ['La mention de l’annonce de live peut être **un rôle du serveur**.'],
    improved: ['Sur téléphone, « Ajouter un compte à suivre » s’affiche en pile.'],
    fixed: [],
  },
  {
    v: 331, date: '26/09', title: 'Tickets : tout dans la carte',
    new: [],
    improved: ['Page Tickets : textes, types et extras sont **dans** la carte, plus rien en dessous.'],
    fixed: [],
  },
  {
    v: 330, date: '26/09', title: 'Tickets : moins de texte',
    new: [],
    improved: ['Cartes tickets rangées, descriptions courtes, textes optionnels repliés.'],
    fixed: [],
  },
  {
    v: 329, date: '26/09', title: 'Rôles par réaction',
    new: ['Titre et emoji du message « Rôles par réaction » modifiables dans le dashboard.'],
    improved: [],
    fixed: [],
  },
  {
    v: 328, date: '26/09', title: 'Tickets : autres menus',
    new: ['Plusieurs panneaux menu déroulant, chacun avec ses propres types.'],
    improved: [],
    fixed: [],
  },
  {
    v: 327, date: '26/09', title: 'Recherche rôles / salons',
    new: [],
    improved: ['La recherche affiche le nom simple, sans décorations.'],
    fixed: [],
  },
  {
    v: 326, date: '26/09', title: 'Rôles : limite Discord',
    new: [],
    improved: ['Sélecteurs de rôles identiques, limite Discord respectée.'],
    fixed: [],
  },
  {
    v: 325, date: '25/09', title: 'Sélecteurs mobile',
    new: [],
    improved: [],
    fixed: ['Sur téléphone, le clavier reste ouvert dans les sélecteurs.'],
  },
  {
    v: 324, date: '25/09', title: 'Liens : boutons 2 par ligne',
    new: [],
    improved: ['Boutons de liens affichés 2 par ligne, dans un encadré.'],
    fixed: [],
  },
  {
    v: 323, date: '24/09', title: 'Module Liens',
    new: ['Module Liens : un panneau, un embed par lien.'],
    improved: [],
    fixed: [],
  },
  {
    v: 322, date: '24/09', title: 'Tickets : noms clairs',
    new: [],
    improved: ['Noms plus clairs et page tickets rangée.'],
    fixed: [],
  },
  {
    v: 321, date: '24/09', title: 'Menu : modules découpés',
    new: ['Gros modules du menu dashboard découpés (plus lisible).'],
    improved: [],
    fixed: [],
  },
  {
    v: 320, date: '23/09', title: 'Vérification',
    new: [],
    improved: ['Texte de vérification modifiable, filtres plus clairs.'],
    fixed: [],
  },
  {
    v: 319, date: '23/09', title: 'Photo de profil à la connexion',
    new: [],
    improved: ['Connexion : photo de profil Optimus (plus l’emoji 🤖).'],
    fixed: [],
  },
  {
    v: 318, date: '23/09', title: 'Nettoyage auto : ordre',
    new: [],
    improved: ['Le nettoyage part des messages les plus anciens.'],
    fixed: [],
  },
  {
    v: 317, date: '23/09', title: 'Module nettoyage auto',
    new: ['Module nettoyage automatique des salons.'],
    improved: [],
    fixed: [],
  },
  {
    v: 316, date: '23/09', title: 'Photo de profil',
    new: [],
    improved: [],
    fixed: ['Photo de **profil** du bot, pas la bannière.'],
  },
  {
    v: 315, date: '23/09', title: 'Photo sur l’accueil',
    new: [],
    improved: ['Photo d’Optimus sur la page d’accueil, à la place de l’emoji.'],
    fixed: [],
  },
  {
    v: 314, date: '23/09', title: 'Liste noire',
    new: [],
    improved: [],
    fixed: ['Supprimer un mot de la liste noire l’enregistre tout de suite.'],
  },
  {
    v: 313, date: '23/09', title: 'Sélecteurs des modules',
    new: [],
    improved: ['Sélecteurs des modules façon DraftBot (plein largeur).'],
    fixed: [],
  },
  {
    v: 312, date: '22/09', title: 'Plus de signatures',
    new: [],
    improved: [],
    fixed: ['Plus aucune signature « Hoxera · … » sous les panneaux.'],
  },
];

const NOTES = VERSIONS[0]; // compat tests / aperçu actuel

function isFounder(userId) {
  const id = String(process.env.NEXORA_ADMIN_DISCORD_ID || '').trim();
  return /^\d{15,21}$/.test(id) && String(userId || '') === id;
}

function bullets(lines) {
  return (lines || []).filter(Boolean).map((line) => `• ${line}`).join('\n');
}

function versionByNum(n) {
  const num = parseInt(n, 10);
  return VERSIONS.find((x) => x.v === num) || null;
}

function currentAndPrevious() {
  return { current: VERSIONS[0], previous: VERSIONS[1] || null };
}

function formatBlock(entry, { heading } = {}) {
  const parts = [];
  if (heading) parts.push(`**v${entry.v} — ${entry.title}** · ${entry.date}`);
  if (entry.new && entry.new.length) parts.push(`✨ **Nouveautés**\n${bullets(entry.new)}`);
  if (entry.improved && entry.improved.length) parts.push(`🛠️ **Améliorations**\n${bullets(entry.improved)}`);
  if (entry.fixed && entry.fixed.length) parts.push(`🔧 **Corrections**\n${bullets(entry.fixed)}`);
  if (parts.length <= 1) parts.push('_Aucun détail enregistré pour cette version._');
  return parts.join('\n\n');
}

function updateSelectRow(botId, currentValue) {
  const options = [{
    label: '🏠 Actuelle + précédente',
    value: 'home',
    description: currentValue === 'home' ? 'Vous êtes ici' : 'Aperçu des 2 dernières versions',
  }];
  for (const entry of VERSIONS.slice(0, 24)) {
    options.push({
      label: `v${entry.v} — ${entry.title}`.slice(0, 100),
      value: String(entry.v),
      description: (currentValue === String(entry.v) ? 'Vous êtes ici · ' : '') + entry.date,
    });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SELECT_ID(botId))
      .setPlaceholder('📂 Choisir une version…')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options.slice(0, 25)),
  );
}

function linkRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🌐 Dashboard').setURL(DASHBOARD_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🆘 Serveur support').setURL(SUPPORT_URL),
  );
}

function rowsFor(botId, currentValue) {
  return [updateSelectRow(botId, currentValue), linkRow()];
}

function buildHomePanel(botId) {
  const { current, previous } = currentAndPrevious();
  const chunks = [
    'Aperçu des **2 dernières versions**. Le menu ci-dessous ouvre le détail complet d’une version. Dans 2 minutes, on revient ici.',
    formatBlock(current, { heading: true }),
  ];
  if (previous) chunks.push(formatBlock(previous, { heading: true }));
  return ui.v2panel({
    color: '#e07a5f',
    title: `🚀 Optimus Prime — Mises à jour (v${current.v})`,
    description: chunks.join('\n\n'),
    footer: false,
  }, rowsFor(botId, 'home'));
}

function buildVersionPanel(botId, num) {
  const entry = versionByNum(num);
  if (!entry) return buildHomePanel(botId);
  return ui.v2panel({
    color: '#e07a5f',
    title: `📦 v${entry.v} — ${entry.title}`,
    description: `${entry.date}\n\n${formatBlock(entry)}`,
    footer: false,
  }, rowsFor(botId, String(entry.v)));
}

function buildUpdatePanel(botId) {
  return buildHomePanel(botId || 1);
}

const revertTimers = new Map();

function scheduleRevert(botId, message) {
  if (!message || !message.id) return;
  const key = String(message.id);
  const prev = revertTimers.get(key);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    revertTimers.delete(key);
    const payload = ui.v2edit
      ? { ...buildHomePanel(botId), content: null, embeds: [], attachments: [] }
      : buildHomePanel(botId);
    Promise.resolve(message.edit(payload)).catch(() => {});
  }, AUTO_REVERT_MS);
  if (typeof t.unref === 'function') t.unref();
  revertTimers.set(key, t);
}

async function handleUpdate(botId, interaction) {
  const uid = interaction && interaction.user && interaction.user.id;
  if (!isFounder(uid)) {
    return interaction.reply({
      content: '⛔ Cette commande est réservée au fondateur.',
      ephemeral: true,
    });
  }
  const payload = buildHomePanel(botId);
  try {
    const violations = typeof ui.v2Audit === 'function' ? ui.v2Audit(payload) : [];
    if (violations && violations.length) {
      return interaction.reply({
        content: '⚠️ Le panneau de mise à jour dépasse une limite Discord — il sera corrigé.',
        ephemeral: true,
      });
    }
  } catch { /* envoi quand même */ }
  await interaction.reply(payload);
  try {
    const msg = await interaction.fetchReply();
    scheduleRevert(botId, msg);
  } catch { /* le panneau reste, sans retour auto */ }
}

async function handleSelect(botId, interaction) {
  if (!interaction || typeof interaction.isStringSelectMenu !== 'function' || !interaction.isStringSelectMenu()) return false;
  if (String(interaction.customId || '') !== SELECT_ID(botId)) return false;
  const value = String((interaction.values && interaction.values[0]) || 'home');
  const payload = value === 'home' ? buildHomePanel(botId) : buildVersionPanel(botId, value);
  await interaction.update(payload);
  scheduleRevert(botId, interaction.message);
  return true;
}

function slashPayload() {
  return {
    name: 'update',
    description: '📢 Publier le journal de version dans ce salon (fondateur uniquement)',
    dm_permission: false,
  };
}

// Instantané sur le serveur support (les commandes GLOBALES peuvent mettre 1 h).
async function syncOnSupportGuild(entry, record) {
  if (!entry || !entry.client || !entry.client.rest) return false;
  const guildId = String(process.env.HOXERA_SUPPORT_GUILD_ID || '1539668540787925052').trim();
  if (!/^\d{15,21}$/.test(guildId)) return false;
  const appId = (record && record.client_id) || (entry.client.user && entry.client.user.id);
  if (!appId) return false;
  await entry.client.rest.put(`/applications/${appId}/guilds/${guildId}/commands`, {
    body: [slashPayload()],
  });
  return true;
}

module.exports = {
  VERSION,
  NOTES,
  VERSIONS,
  DASHBOARD_URL,
  SUPPORT_URL,
  AUTO_REVERT_MS,
  SELECT_ID,
  isFounder,
  buildUpdatePanel,
  buildHomePanel,
  buildVersionPanel,
  handleUpdate,
  handleSelect,
  scheduleRevert,
  slashPayload,
  syncOnSupportGuild,
};
