// ============================================================================
// Test v241 — Textes affichés sur Discord : rendus professionnels et allégés.
//
// Demande utilisateur : « les textes […] rends-les plus pro comme les autres
// bots pro, retire les textes inutiles dans les panneaux […] tous les textes
// des panneaux bien organisés et pro. Ce ne sont pas les textes du dashboard,
// mais tous ceux qui seront affichés sur Discord. »
//
// Sept décisions validées par l'utilisateur, toutes vérifiées ici :
//   1. L'horodatage n'est plus ajouté aux panneaux (Discord affiche déjà
//      l'heure du message) — seule une Date EXPLICITE reste honorée.
//   2. Le panneau de tickets passe de 145 à ~98 mots : le nom du serveur n'y
//      apparaît qu'UNE fois, plus de 🔴➡️, plus de `__souligné__`, plus
//      d'auteur dupliquant le titre, plus d'espaceur invisible U+200B.
//   3. `pruneOldPanels` reconnaît l'ANCIEN titre « 👑 Support | » en plus du
//      nouveau, sinon les panneaux déjà en place ne seraient jamais nettoyés.
//   4. Une ligne composée uniquement de variables qui se résolvent en vide est
//      retirée, AINSI que son introduction en suspens (« … : »). C'est la cause
//      racine du bug `{channels}` — et le correctif vaut pour tous les modèles.
//   5. Bienvenue : le compteur de membres n'est plus écrit deux fois.
//   6. Départ : « Était membre depuis il y a 1 jour » (français cassé) devient
//      une vraie durée « Membre pendant 1 j ».
//   7. Avertissement, annonce de live, suggestion : textes corrigés et dédoublés.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v2 = require('./helpers/v2');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v241-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const ui = require('../server/discord/ui');
const i18n = require('../server/i18n');
const panels = require('../server/discord/panels');
const engine = require('../server/discord/engine');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// Ignore les commentaires : un texte cité dans un commentaire explicatif ne
// doit pas être compté comme présent dans le rendu.
const code = (f) => racine(f).split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
const BOT_ID = String(BOT.id || BOT);
const GUILD = 'G241';
const SERVEUR = 'Serveur de Hoxera';

// ============================================================================
console.log('\n1️⃣  Horodatage : plus ajouté par défaut, Date explicite honorée');
// ============================================================================
{
  const pied = (o) => v2.texts(ui.v2panel({ title: 'T', description: 'A', footer: 'Hoxera · X', ...o })).slice(-1)[0];
  const HEURE = /\d{2}\/\d{2} \d{2}:\d{2}/;

  check('par défaut : AUCUNE heure dans le pied', !HEURE.test(pied({})), pied({}));
  check('timestamp:true seul n’ajoute PLUS d’heure', !HEURE.test(pied({ timestamp: true })));
  check('timestamp:false : pas d’heure', !HEURE.test(pied({ timestamp: false })));
  check('une Date EXPLICITE reste honorée (starboard)',
    HEURE.test(pied({ timestamp: new Date(2024, 0, 5, 14, 30) })));
  check('une Date invalide ne produit JAMAIS « Invalid Date »',
    !pied({ timestamp: new Date('invalide') }).includes('Invalid Date'));
  // Le pied ne doit pas se retrouver avec un séparateur orphelin « · » vide.
  check('le pied reste propre (pas de « · » final orphelin)', !/[·]\s*$/.test(pied({})));

  // Plus aucun appel redondant dans le code : `timestamp: new Date()` doublait
  // l'heure déjà affichée par Discord.
  check('plus de `timestamp: new Date()` dans automod.js', !code('server/discord/automod.js').includes('timestamp: new Date()'));
  check('plus de `timestamp: new Date()` dans panels.js', !code('server/discord/panels.js').includes('timestamp: new Date()'));
  // La seule Date légitime : la date du message épinglé au starboard.
  check('le starboard conserve SA date (celle du message, pas « maintenant »)',
    racine('server/discord/community.js').includes('createdAt'));
}

// ============================================================================
console.log('\n2️⃣  Panneau de tickets : 4 retraits demandés, tout le reste INTACT');
// ============================================================================
// Le 06/09 l'utilisateur a d'abord refusé ma réécriture complète du panneau
// (« tu le laisses comme il était avant »), puis a demandé EXACTEMENT 4 retraits :
//   1. l'auteur « {serveur} · Centre d'assistance »
//   2. les flèches 🔴➡️ → puces « • »
//   3. « Sélectionnez une option pour commencer » dans le pied
//   4. la liste « 🗂️ Types disponibles »
// Rien d'autre ne doit bouger. Cette section est un GARDE-FOU dans les deux sens :
// elle échoue si un retrait est annulé OU si un élément conservé disparaît.
const payload = panels.buildTicketPanel({ message: '' }, {}, [], SERVEUR, GUILD);
const textes = v2.texts(payload);
const brut = v2.json(payload);
const P = i18n.panelTexts('fr');
{
  // ---- les 4 retraits demandés ----
  check('1. auteur « · Centre d\'assistance » RETIRÉ',
    !textes.some((t) => t.includes(`· Centre d'assistance`)));
  check('2. flèches 🔴➡️ REMPLACÉES par des puces « • »',
    !brut.includes('🔴➡️') && P.rules.length === 4 && P.rules.every((r) => r.startsWith('•')));
  check('2b. les 4 règles sont toujours là, textes inchangés',
    P.rules[0].includes('Soyez clair et précis') && P.rules[1].includes('manque de respect')
    && P.rules[2].includes('mentions inutiles') && P.rules[3].includes('inactifs pendant 2 heures'));
  check('2c. les puces « • » existent aussi en anglais',
    i18n.panelTexts('en').rules.every((r) => r.startsWith('•'))
    && !i18n.panelTexts('en').rules.some((r) => r.includes('🔴➡️')));
  check('3. « Sélectionnez une option pour commencer » RETIRÉ du pied',
    !v2.footer(payload).includes('Sélectionnez une option'));
  check('4. liste « 🗂️ Types disponibles » RETIRÉE',
    !brut.includes('Types disponibles'));
  check('4b. le retrait vaut aussi quand des types sont configurés',
    !v2.json(panels.buildTicketPanel({ message: '' }, {},
      [{ label: 'Candidature staff', emoji: '📝', questions: [1] }], SERVEUR, GUILD)).includes('Types disponibles'));

  // ---- le menu déroulant, jamais touché ----
  const srcPanels = code('server/discord/panels.js');
  check('menu déroulant : identifiant « bd-ttype:${botId} » intact',
    srcPanels.includes('setCustomId(`bd-ttype:${botId}`)'));
  check('menu déroulant : intitulé « 🗂️ Choisissez le type de ticket… » intact',
    srcPanels.includes("setPlaceholder('🗂️ Choisissez le type de ticket…')"));
  check('menu déroulant : 1 valeur min/max, 25 options max',
    srcPanels.includes('setMinValues(1).setMaxValues(1)') && srcPanels.includes('types.slice(0, 25)'));

  // ---- tout ce qui doit RESTER ----
  check('titre conservé : « 👑 Support | {serveur} »',
    v2.title(payload) === `👑 Support | ${SERVEUR}`, v2.title(payload));
  check('bienvenue conservée', textes.some((t) => t.includes(`Bienvenue sur le support officiel de ${SERVEUR}`)));
  check('description conservée (sélectionnez la catégorie…)',
    P.desc.includes('sélectionnez la catégorie correspondante à votre besoin via le menu ci-dessous'));
  check('rubrique « __ⓘ Informations importantes :__ » conservée avec soulignement',
    P.infoTitle === '__ⓘ Informations importantes :__');
  check('message de patience conservé, en italique',
    P.patience.startsWith('*⏳ Merci de votre patience') && textes.some((t) => t.includes('Merci de votre patience')));
  check('pied conservé : « Hoxera · {serveur} »',
    v2.footer(payload) === `Hoxera · ${SERVEUR}`, v2.footer(payload));
  check('bannière conservée (MediaGallery)', brut.includes('/api/tickets/panel-banner/'));
  // #ED4245 = 15548997 en décimal : c'est la valeur sérialisée dans le conteneur.
  check('couleur d’accent conservée (#ED4245 = 15548997)', brut.includes('15548997'));
  check('pied toujours SANS heure (décision globale v241)',
    !/\d{2}\/\d{2} \d{2}:\d{2}/.test(v2.footer(payload)));

  // ---- structure Components V2 (v234) ----
  check('toujours UN seul conteneur au niveau du message', payload.components.length === 1);
  check('toujours des séparateurs NATIFS pleine largeur', v2.dividers(payload) >= 2);
  check('aucun trait texte ━', !brut.includes(ui.SEPARATOR));
  check('plafond de 40 composants imbriqués respecté',
    (function compter(c) { let n = 0; for (const k of c.components || []) n += 1 + compter(k); return n; }(payload.components[0])) <= 40);
}

// ============================================================================
console.log('\n3️⃣  pruneOldPanels : préfixe unique « 👑 Support | » (comme avant)');
// ============================================================================
{
  // La liste de préfixes introduite en v241 n'a plus de raison d'être : le titre
  // n'a pas changé. On est revenu au filtre d'origine.
  const srcPanels = code('server/discord/panels.js');
  check('le filtre d\'origine sur « 👑 Support | » est rétabli',
    /startsWith\('👑 Support \|'\)/.test(srcPanels));
  check('plus de liste PANEL_TITLE_PREFIXES', !srcPanels.includes('PANEL_TITLE_PREFIXES'));
  check('plus de helper isTicketPanelTitle', !srcPanels.includes('isTicketPanelTitle'));
  // Les anciens panneaux en place dans les salons restent reconnus et nettoyés.
  const titleOf = panels.__testPanelTitleOf;
  const p241 = panels.buildTicketPanel({ message: '' }, {}, [], 'Nouveau serveur', GUILD);
  check('panelTitleOf lit le titre d\'un conteneur V2',
    titleOf({ embeds: [], components: p241.components }) === '👑 Support | Nouveau serveur');
  check('panelTitleOf lit le titre d\'un embed classique',
    titleOf({ embeds: [{ title: '👑 Support | Ancien serveur' }], components: [] }) === '👑 Support | Ancien serveur');
}

// ============================================================================
console.log('\n4️⃣  {channels} : la ligne vide ET son introduction sautent');
// ============================================================================
{
  const resous = (modele, vars) => engine.resolveVariables(modele, { vars });
  const MODELE = 'Pour bien commencer, découvrez les salons utiles :\n{channels}\n\nPassez un bon moment ! 🚀';

  // Cas du bug signalé : aucun salon détaillé (réglage par défaut).
  const vide = resous(MODELE, { channelsMention: '' });
  check('sans salon : l’introduction en suspens est retirée', !vide.includes('Pour bien commencer'), JSON.stringify(vide));
  check('sans salon : {channels} n’apparaît pas en clair', !vide.includes('{channels}'));
  check('sans salon : le reste du message est intact', vide.includes('Passez un bon moment ! 🚀'));
  check('sans salon : pas de ligne vide en tête', !/^\s*\n/.test(vide));
  check('sans salon : pas de trou au milieu (3 sauts de ligne d’affilée)', !vide.includes('\n\n\n'));

  // Salons configurés : le bloc doit rester EXACTEMENT comme avant.
  const plein = resous(MODELE, { channelsMention: '📜 Règles → <#1>\n🎫 Tickets → <#2>' });
  check('avec salons : l’introduction est conservée', plein.includes('Pour bien commencer, découvrez les salons utiles :'));
  check('avec salons : les mentions sont conservées', plein.includes('📜 Règles → <#1>') && plein.includes('🎫 Tickets → <#2>'));

  // Le correctif est générique : il vaut pour TOUTES les variables.
  check('générique : {count} vide seul sur sa ligne saute aussi',
    !resous('Total :\n{count}', { count: '' }).includes('Total :'));
  check('générique : une ligne MIXTE (texte + variable) n’est jamais retirée',
    resous('Total : {count} membres', { count: '' }).includes('Total :  membres'));
  check('générique : une introduction SANS deux-points n’est pas retirée',
    resous('Voici la liste\n{channels}', { channelsMention: '' }).includes('Voici la liste'));
  check('générique : les autres variables continuent de se résoudre',
    resous('Bonjour {user} sur {server}', { userMention: '<@1>', serverName: 'X' }) === 'Bonjour <@1> sur X');
  check('un modèle sans aucune ligne vide est rendu tel quel',
    resous('A\nB', {}) === 'A\nB');
}

// ============================================================================
console.log('\n5️⃣  Bienvenue + départ : plus de doublon, durée correcte');
// ============================================================================
const events = require('../server/discord/events');
let captures = [];
const membre = () => ({
  id: 'U9', partial: false,
  user: { id: 'U9', tag: 'Alice', username: 'Alice', bot: false, createdTimestamp: Date.now() - 30 * 86400000, displayAvatarURL: () => 'https://cdn.test/a.png' },
  guild: {
    id: GUILD, name: SERVEUR, memberCount: 42, iconURL: () => null,
    channels: { cache: { get: () => undefined, find: () => ({ id: 'CEV', name: 'accueil', isTextBased: () => true, send: async (p) => { captures.push(p); return { id: 'M' }; } }) } },
    roles: { cache: { find: () => null } },
  },
  roles: { cache: [] },
  joinedTimestamp: Date.now() - 86400000,   // 1 jour
});

(async () => {
  store.guildSettings.set(BOT_ID, GUILD, { lang: 'fr' });

  // --- 5a. Le corps contient {count} → la rubrique « Membre n° » saute. ---
  store.events.set(BOT_ID, GUILD, 'member_join', true,
    { channel: 'accueil', message: 'Bienvenue ! Vous êtes le membre n°{count} 🎉', plain: false, card: false });
  captures = [];
  await events.runJoinEvent(BOT_ID, membre(), { test: true });
  const avecCount = captures.find((p) => v2.isV2(p) && v2.json(p).includes("vient d'arriver"));
  check('arrivée avec {count} dans le corps : le panneau est envoyé', !!avecCount);
  check('arrivée avec {count} : la rubrique « 👥 Membre n° » est SUPPRIMÉE (fin du doublon)',
    avecCount && !v2.json(avecCount).includes('👥 Membre n°'));
  check('arrivée avec {count} : le compteur reste visible dans le corps',
    avecCount && v2.json(avecCount).includes('n°42'));
  check('arrivée : « 📅 Compte créé » est conservé', avecCount && v2.json(avecCount).includes('📅 Compte créé'));

  // --- 5b. Le corps ne contient PAS {count} → la rubrique reste. ---
  store.events.set(BOT_ID, GUILD, 'member_join', true,
    { channel: 'accueil', message: 'Passez un bon moment parmi nous ! 🚀', plain: false, card: false });
  captures = [];
  await events.runJoinEvent(BOT_ID, membre(), { test: true });
  const sansCount = captures.find((p) => v2.isV2(p) && v2.json(p).includes('Passez un bon moment'));
  check('arrivée sans {count} : la rubrique « 👥 Membre n° » est CONSERVÉE',
    sansCount && v2.json(sansCount).includes('👥 Membre n°') && v2.json(sansCount).includes('**42**'));
  check('arrivée : l’intitulé n’est plus la phrase coupée « Vous êtes le membre »',
    sansCount && !v2.json(sansCount).includes('Vous êtes le membre'));
  check('arrivée : pied de page signé « Hoxera · … »',
    sansCount && v2.footer(sansCount) === `Hoxera · ${SERVEUR}`, sansCount ? v2.footer(sansCount) : '');
  check('arrivée : aucune heure dans le pied', sansCount && !/\d{2}\/\d{2} \d{2}:\d{2}/.test(v2.footer(sansCount)));

  // --- 5c. Départ : durée réelle, plus de « il y a ». ---
  store.events.set(BOT_ID, GUILD, 'member_leave', true,
    { channel: 'accueil', message: "Merci d'avoir fait partie de {server} 💛", plain: false });
  captures = [];
  await events.runLeaveEvent(BOT_ID, membre(), { test: true });
  const depart = captures.find((p) => v2.isV2(p) && v2.json(p).includes("s'en va"));
  check('départ : le panneau est envoyé', !!depart);
  check('départ : rubrique « 🕐 Membre pendant » (plus « Était membre depuis »)',
    depart && v2.json(depart).includes('🕐 Membre pendant') && !v2.json(depart).includes('Était membre depuis'));
  check('départ : PLUS d’horodatage relatif <t:…:R> dans la durée',
    depart && !/Membre pendant[^]*<t:\d+:R>/.test(v2.json(depart)));
  check('départ : la durée vaut 1 j (membre depuis 24 h)',
    depart && v2.json(depart).includes('1 j'), depart ? v2.json(depart).match(/Membre pendant.{0,40}/)?.[0] : '');
  // Garde-fou du bug d'unité trouvé en rendant le panneau : `joinedTimestamp`
  // est converti en SECONDES plus haut, alors que la durée attend des ms.
  check('départ : AUCUNE durée aberrante (> 40 ans = secondes prises pour des ms)',
    depart && !/\d{2,} ans/.test(v2.json(depart)));
  check('départ : « 👥 Membres restants » conservé', depart && v2.json(depart).includes('👥 Membres restants'));
  check('départ : pied de page signé « Hoxera · … »', depart && v2.footer(depart) === `Hoxera · ${SERVEUR}`);

  // --- 5d. Textes par défaut du formulaire (EVENT_DEFS). ---
  const defs = events.EVENT_DEFS || events.DEFS || null;
  const srcEvents = code('server/discord/events.js');
  check('défaut arrivée : ne répète plus « Bienvenue {user} sur {server} »',
    !srcEvents.includes("default: 'Bienvenue {user} sur {server}"));
  check('défaut départ : ne répète plus « {user} a quitté {server} »',
    !srcEvents.includes("{user} a quitté {server}"));
  check('défaut arrivée : contient un « vous » (garde-fou v240)',
    srcEvents.includes("l'équipe est là pour vous aider"));
  if (defs) check('EVENT_DEFS toujours exposé', typeof defs === 'object');

  // ==========================================================================
  console.log('\n6️⃣  Avertissement, live, suggestion');
  // ==========================================================================
  {
    const automod = code('server/discord/automod.js');
    // Le MP disait « a été pris en compte » alors que le message est SUPPRIMÉ.
    check('avertissement : plus le faux « a été pris en compte »', !automod.includes('a été pris en compte'));
    check('avertissement : dit bien « supprimé »', automod.includes('a été **supprimé**'));
    check('avertissement : la rubrique moralisatrice « 🧭 Conseil » est retirée',
      !automod.includes("'🧭 Conseil'"));
    check('avertissement : pied signé « Hoxera · Protection du serveur »',
      automod.includes("footer: 'Hoxera · Protection du serveur'"));
  }
  {
    const live = code('server/discord/liveWatch.js');
    // La plateforme était nommée 2 fois (titre « LIVE sur TikTok » + corps
    // « vient de lancer un live sur **TikTok** »), et le streamer aussi.
    check('live : le titre nomme le streamer ET la plateforme',
      live.includes('est en live sur ${p.label}'));
    check('live : le corps ne répète plus « vient de lancer un live sur »',
      !live.includes('vient de lancer un live sur'));
    check('live : le corps ne répète plus le nom du streamer en gras',
      !live.includes('**${result.name}** vient'));
  }
  {
    const suggest = code('server/discord/suggest.js');
    check('suggestion : plus le pied « Votez avec les boutons » (évidence)',
      !suggest.includes('Votez avec les boutons'));
    // Le n° de suggestion figure déjà dans le TITRE : le pied ne garde que la
    // signature, alignée sur `Hoxera · Support` du panneau de tickets.
    check('suggestion : pied « Hoxera · Suggestions » (aligné sur les tickets)',
      suggest.includes("footer: 'Hoxera · Suggestions'"));
    const panneau = require('../server/discord/suggest').buildPanel(
      { id: 7, text: 'Ajouter un salon vocal', upvotes: 3, downvotes: 1, bot_id: BOT_ID }, 'Alice', {}, '');
    check('suggestion : rendu réel du pied', v2.footer(panneau) === 'Hoxera · Suggestions', v2.footer(panneau));
    check('suggestion : le n° reste visible UNE fois, dans le titre',
      (v2.json(panneau).split('#7').length - 1) === 1, `${v2.json(panneau).split('#7').length - 1} fois`);
    check('suggestion : aucune heure dans le pied', !/\d{2}\/\d{2} \d{2}:\d{2}/.test(v2.footer(panneau)));
  }

  // ==========================================================================
  console.log('\n7️⃣  Modèles du dashboard + versionnage');
  // ==========================================================================
  {
    const dash = code('public/js/dashboard.js');
    check('modèle arrivée : {user} retiré (l’en-tête porte déjà le pseudo)',
      !dash.includes('Bienvenue {user} sur {server}'));
    check('modèle arrivée : {channels} conservé, sur sa propre ligne',
      dash.includes('{channels}'));
    check('modèle arrivée : l’introduction des salons précède {channels}',
      /Pour bien commencer, découvrez les salons utiles :\\n\{channels\}/.test(dash));
    check('modèle départ : {user} retiré', !dash.includes('Au revoir {user}'));
    check('modèle départ : {server} conservé', dash.includes("Merci d'avoir fait partie de {server}"));
  }
  {
    const html = racine('public/index.html');
    check('index.html : ?v=264 référencé 7 fois', (html.match(/\?v=264/g) || []).length === 7,
      String((html.match(/\?v=264/g) || []).length));
    check('index.html : plus aucun ?v=240', !html.includes('?v=240'));
    check('sw.js : cache « botdev-v241 »', racine('public/sw.js').includes("'botdev-v264'"));
  }

  // ==========================================================================
  console.log(`\n${echecs === 0
    ? '🎉 Tous les tests v241 passent — textes Discord professionnels et allégés.'
    : `❌ v241 — ${echecs} échec(s)`}`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch((e) => { console.error('💥', e); process.exit(1); });
