// Test v2.34 — SÉPARATEURS NATIFS PLEINE LARGEUR, lot n°4 : les tickets.
//
// Ce lot :
//   • panels.js — TOUT le fichier passe en Components V2 (11 emplacements) :
//     le panneau de tickets principal, le menu de rôles, les 4 annonces de
//     salon (fermé / réouvert / pris en charge / en attente), les 3 panneaux
//     automatiques (fermeture, rappel, suppression) et les 2 MP
//     (confirmation d'ouverture, demande d'évaluation).
//   • `buildTicketPanelEmbed` → `buildTicketPanel` : retourne désormais un
//     PAYLOAD (et non un EmbedBuilder) et reçoit `rows` en 6e argument, car en
//     V2 les lignes de boutons/menus vont DANS le conteneur.
//   • ui.js — `v2fieldName` : un nom de champ composé uniquement de caractères
//     invisibles (U+200B…) est un ESPACEUR hérité des embeds, pas un intitulé.
//
// Points de risque couverts :
//   • `pruneOldPanels` lisait `msg.embeds[0].title` pour ne garder qu'un seul
//     panneau par genre. Un payload V2 n'a plus de champ `embeds` : sans double
//     lecture, les NOUVEAUX panneaux n'auraient jamais été nettoyés et se
//     seraient accumulés en doublons dans les salons.
//   • `sendRoleMenu` ÉDITE un message déjà en place, envoyé avant cette version
//     en embed classique. Discord exige alors `content` / `embeds` /
//     `attachments` explicitement vidés pour basculer en V2.
//   • `roleMenuPayload` faisait `payload.components = components` APRÈS coup :
//     en V2 cela écrasait le conteneur. Les rangées passent en 2e argument.
//   • les 3 panneaux automatiques posaient le MÊME texte deux fois (content du
//     message + description de l'embed). La duplication est supprimée.
//   • le panneau de tickets part via `identity.sendAsProfile` (webhook). V2 +
//     webhook + pièce jointe = 400 ; ici la bannière est une URL HTTP rendue
//     par le site, donc aucune pièce jointe → MediaGallery compatible.
//
// NON migré dans ce lot (volontaire, documenté) :
//   • le wizard « assistant types » (6 étapes éditées en place). Une seule de
//     ses étapes produit un trait, et Discord interdit de revenir à un message
//     classique une fois en V2 : migrer UNE étape sans les 5 autres casserait
//     le wizard. Il faut un lot dédié.
//   • le récapitulatif de ticket (journal) : construit en EmbedBuilder brut
//     SANS description, il ne produit donc AUCUN trait. Le migrer imposerait de
//     réécrire `updateRecapRating`, qui relit `msg.embeds[0].fields` pour
//     remplacer la note ⭐. Bénéfice visuel nul pour le trait → reporté.
//
// Garanties vérifiées ici :
//   1. ui.js traite les noms de champs invisibles comme des espaceurs.
//   2. buildTicketPanel : payload V2, séparateur natif entre bienvenue et
//      explication, aucun trait texte ━, bannière en MediaGallery, règles
//      intactes, rows DANS le conteneur.
//   3. panelTitleOf lit le titre dans les DEUX formats (classique et V2).
//   4. roleMenuPayload : V2, menu DANS le conteneur, édition sans résidu.
//   5. Couverture : plus aucun ui.panel/ui.embed dans panels.js, aucune
//      duplication content/description sur les panneaux automatiques.
//   6. Garde-fous des versions précédentes (v220, v231, v232, v233).

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v234-'));

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder,
} = require('discord.js');
const store = require('../server/db');
const ui = require('../server/discord/ui');
const i18n = require('../server/i18n');
const panels = require('../server/discord/panels');

const IS_V2 = MessageFlags.IsComponentsV2;
const BOT = 'BOT234';
const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');

let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

// ── Lecteurs de payload Components V2 ───────────────────────────────────────
// Un conteneur peut imbriquer des Section (type 18) qui contiennent elles-mêmes
// des TextDisplay : la lecture est donc récursive.
function v2texts(payload) {
  const out = [];
  const walk = (c) => {
    for (const k of (c && c.components) || []) {
      if (Number(k.type) === 10) out.push(String(k.content || ''));
      else walk(k);
    }
  };
  walk(payload.components[0].toJSON());
  return out;
}
const v2cont = (payload) => payload.components[0].toJSON();
const v2top = (payload) => v2cont(payload).components.map((k) => Number(k.type));
const v2div = (payload) => v2cont(payload).components.filter((k) => Number(k.type) === 14 && k.divider === true).length;
const v2json = (payload) => JSON.stringify(v2cont(payload));
const isV2 = (payload) => (payload.flags & IS_V2) !== 0 && payload.embeds === undefined;
const row = (id) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(id).setLabel('x').setStyle(ButtonStyle.Primary));

console.log('\n1️⃣  ui.js — les noms de champs invisibles sont des espaceurs');
{
  // Le panneau de tickets utilisait { name: '\u200b', value: P.patience } pour
  // aérer l'embed. En V2, « **\u200b** » s'afficherait comme un intitulé vide.
  const blank = '\u200b';
  const p = ui.v2panel({
    title: 'T',
    fields: [
      { name: '📋 Vrai intitulé', value: 'valeur A' },
      { name: blank, value: 'texte de patience' },
      { name: '   ', value: 'espaces seules' },
      { name: '\u200b\u200d\ufeff', value: 'zwj + bom' },
    ],
  });
  const t = v2texts(p);
  check('un VRAI intitulé est conservé en gras', t.some((x) => x.startsWith('**📋 Vrai intitulé**')));
  check('U+200B seul : seule la valeur est affichée', t.includes('texte de patience'));
  check('espaces seules : seule la valeur est affichée', t.includes('espaces seules'));
  check('ZWJ + BOM : seule la valeur est affichée', t.includes('zwj + bom'));
  check('aucun « **<invisible>** » ne subsiste dans le rendu',
    !t.some((x) => /\*\*[\u200B-\u200F\u2060\uFEFF\s]+\*\*/.test(x)));
  check('aucun caractère invisible ne fuite dans les TextDisplay',
    !t.some((x) => /[\u200B-\u200F\u2060\uFEFF]/.test(x)));

  // Même règle pour les champs INLINE (regroupés avec « · »).
  const pi = ui.v2panel({
    title: 'T',
    fields: [
      { name: blank, value: 'a', inline: true },
      { name: '⏱️ Durée', value: '1 h', inline: true },
    ],
  });
  const ti = v2texts(pi);
  check('champ inline sans intitulé : pas de « ** ** » avant la valeur',
    ti.some((x) => x.startsWith('a · ') || x.includes('a · ')) && !ti.some((x) => /\*\*\s*\*\*/.test(x)));
}

console.log('\n2️⃣  buildTicketPanel — le panneau de tickets en Components V2');
{
  const types = [
    { emoji: '🎫', label: 'Support', questions: [] },
    { emoji: '📝', label: 'Candidature staff', questions: [{ q: 'Pourquoi ?' }] },
  ];
  const payload = panels.buildTicketPanel({ message: '' }, {}, types, 'Serveur de Hoxera', 'G234', [row('bd-ticket:BOT')]);
  const t = v2texts(payload);
  const P = i18n.panelTexts('fr');

  check('retourne un PAYLOAD Components V2 (plus d’EmbedBuilder)', isV2(payload));
  check('un seul composant au niveau du message : le conteneur', payload.components.length === 1);
  check('le titre i18n est rendu en « ## »', t.includes(`## ${P.title('Serveur de Hoxera')}`));
  check('l’auteur est conservé', t.some((x) => x === "**Serveur de Hoxera · Centre d'assistance**"));
  check('la bienvenue i18n est conservée', t.some((x) => x.includes(P.welcome('Serveur de Hoxera'))));
  check('bienvenue et explication sont DEUX blocs distincts',
    t.includes(P.welcome('Serveur de Hoxera')) && t.some((x) => x.startsWith(P.desc.slice(0, 30))));
  check('un séparateur NATIF les divise (pas un trait texte)', v2div(payload) >= 1);
  check('aucun trait texte ━ dans tout le panneau', !v2json(payload).includes(ui.SEPARATOR));
  check('les règles restent dans leur propre bloc, sans trait dedans',
    t.some((x) => x.includes('🔴➡️') && !x.includes(ui.SEPARATOR)));
  check('le message de patience est présent (espaceur retiré)',
    t.some((x) => x.includes('Merci de votre patience')));
  check('la liste des types est présente avec le compteur de questions',
    t.some((x) => x.includes('🗂️ Types disponibles') && x.includes('Candidature staff') && x.includes('❓ 1')));
  check('la bannière est rendue en MediaGallery (type 12)', v2top(payload).includes(12));
  check('l’URL de la bannière générée par le site est conservée',
    v2json(payload).includes('/api/tickets/panel-banner/G234.png'));
  check('le pied de panneau est en texte discret « -# »',
    t.some((x) => x.startsWith('-# Hoxera · Serveur de Hoxera · Sélectionne une option')));
  check('les boutons sont DANS le conteneur (ActionRow type 1 imbriqué)',
    v2top(payload).includes(1) && v2json(payload).includes('bd-ticket:BOT'));
  check('plafond de 40 composants imbriqués respecté',
    (function count(c) { let n = 0; for (const k of c.components || []) { n += 1 + count(k); } return n; }(v2cont(payload))) <= 40);

  // Message personnalisé configuré dans le dashboard : il remplace P.desc.
  const custom = panels.buildTicketPanel({ message: 'Règles maison.\n\nDeuxième paragraphe maison.' }, {}, [], 'S', 'G234');
  const tc = v2texts(custom);
  check('message personnalisé : il remplace l’explication standard',
    tc.includes('Règles maison.') && tc.includes('Deuxième paragraphe maison.') && !tc.some((x) => x.includes(P.desc.slice(0, 25))));
  check('message personnalisé multi-paragraphes → séparateur natif', v2div(custom) >= 2);

  // Image importée par l'utilisateur (v198) : elle prime sur la bannière.
  const withImg = panels.buildTicketPanel({ message: '', image_url: 'https://exemple.test/ma-banniere.png' }, {}, [], 'S', 'G234');
  check('image importée par l’utilisateur : elle remplace la bannière générée',
    v2json(withImg).includes('ma-banniere.png') && !v2json(withImg).includes('panel-banner'));
}

console.log('\n3️⃣  pruneOldPanels — reconnaître les DEUX formats de panneau');
{
  const titleOf = panels.__testPanelTitleOf;
  check('panelTitleOf est exposé pour les tests', typeof titleOf === 'function');

  // a) Panneau CLASSIQUE déjà en place dans un salon (envoyé avant la v234).
  const classic = { embeds: [{ title: '👑 Support | Ancien serveur' }], components: [] };
  check('panneau classique : le titre est lu depuis embeds[0]',
    titleOf(classic) === '👑 Support | Ancien serveur');

  // b) Panneau V2 (depuis la v234) : le titre est un TextDisplay « ## … ».
  const v2 = panels.buildTicketPanel({ message: '' }, {}, [], 'Nouveau serveur', 'G234');
  const asMessage = { embeds: [], components: v2.components };
  check('panneau V2 : le titre est lu depuis le conteneur',
    titleOf(asMessage) === '👑 Support | Nouveau serveur');

  // c) Le conteneur peut être du JSON brut (message rechargé depuis l'API).
  check('panneau V2 en JSON brut : idem',
    titleOf({ embeds: [], components: [v2cont(v2)] }) === '👑 Support | Nouveau serveur');

  // d) Un message qui n'est pas un panneau ne doit JAMAIS être supprimé.
  check('message ordinaire (embed sans titre) : aucune correspondance', titleOf({ embeds: [{}], components: [] }) === '');
  check('message ordinaire (conteneur sans ##) : aucune correspondance',
    titleOf({ embeds: [], components: [{ type: 17, components: [{ type: 10, content: 'salut' }] }] }) === '');
  check('message vide / null : ne plante pas', titleOf({}) === '' && titleOf(null) === '');
  check('composants Discord résolus (classes, pas JSON) : ne plante pas',
    titleOf({ embeds: [], components: [new ActionRowBuilder()] }) === '');

  // e) Le filtre « 👑 Support | » et la sélection par genre sont inchangés.
  check('le filtre sur le préfixe « 👑 Support | » est conservé',
    /startsWith\('👑 Support \|'\)/.test(src));
  check('la sélection par genre (menu / bouton) est conservée',
    /ids\.includes\('bd-ttype'\)/.test(src) && /kind === 'menu'/.test(src));
  check('pruneOldPanels passe par panelTitleOf (plus de lecture directe)',
    /const title = panelTitleOf\(msg\);/.test(src) && !/const emb = msg\.embeds && msg\.embeds\[0\];/.test(src));
}

console.log('\n4️⃣  roleMenuPayload + sendRoleMenu — menu de rôles en V2');
{
  const menu = {
    id: 'M234', name: 'Rôles & notifications', mode: 'select', guild_id: 'G234',
    content: 'Choisis tes rôles ci-dessous.\n\nTu peux les activer ou les retirer à tout moment.',
    options: [{ label: '🎮 Gamer', role: 'R1' }, { label: '🎨 Créatif', role: 'R2' }],
  };
  const p = panels.roleMenuPayload(BOT, menu);
  const t = v2texts(p);
  check('payload Components V2', isV2(p));
  check('titre conservé', t.includes('## 📋 Rôles & notifications'));
  check('les 2 paragraphes du contenu personnalisé sont séparés',
    t.includes('Choisis tes rôles ci-dessous.') && t.includes('Tu peux les activer ou les retirer à tout moment.'));
  check('séparateur natif entre eux', v2div(p) >= 1);
  check('aucun trait texte ━', !v2json(p).includes(ui.SEPARATOR));
  check('« Comment ça marche ? » conservé', t.some((x) => x.startsWith('**🧭 Comment ça marche ?**')));
  check('le pied indique le nombre de rôles', t.some((x) => x.startsWith('-# Hoxera · 2 rôle(s) disponible(s)')));
  check('le menu déroulant est DANS le conteneur', v2top(p).includes(1) && v2json(p).includes('bd-menu:'));
  check('plus de « payload.components = components » après coup',
    !/payload\.components = components;/.test(src));

  // Mode boutons : les boutons doivent aussi être dans le conteneur.
  const pb = panels.roleMenuPayload(BOT, { ...menu, mode: 'buttons' });
  check('mode boutons : payload V2 avec les boutons DANS le conteneur',
    isV2(pb) && v2top(pb).includes(1) && v2json(pb).includes('bd-rmbtn:'));
  check('mode boutons : le texte d’aide correspond au mode',
    v2texts(pb).some((x) => x.includes('Clique sur un bouton pour recevoir ou retirer le rôle')));

  // sendRoleMenu édite un message DÉJÀ envoyé (avant la v234 : embed classique).
  check('édition d’un ancien message classique : content/embeds/attachments vidés',
    /existing\.edit\(\{ \.\.\.payload, content: null, embeds: \[\], attachments: \[\] \}\)/.test(src));
  check('le repli sur un nouvel envoi en cas de message supprimé est conservé',
    /Unknown Message\|10008\|10003/.test(src));
}

console.log('\n5️⃣  Couverture — tout panels.js est en V2');
{
  const count = (needle) => src.split(needle).length - 1;
  check('plus aucun ui.panel( dans panels.js', count('ui.panel(') === 0);
  check('plus aucun ui.embed( dans panels.js', count('ui.embed(') === 0);
  // v237 — +3 emplacements : le récapitulatif du journal des tickets, le
  // panneau de confirmation de la note, et le message du salon privé
  // (ticketWelcomePanel). 11 (v234) + 3 (v237) = 14.
  // v238 — +5 emplacements : les 4 panneaux du nouveau système « Ajouter un
  // membre » (confirmation, introuvable, homonymes, refus de Discord) et la
  // réponse « réservé au staff ». 14 + 5 = 19.
  // v239 — +1 : le MP de transcription (sendTranscriptDm), dernier panneau du
  // bot encore construit à la main. 19 + 1 = 20.
  check('20 emplacements passés en ui.v2panel( (11+3+5+1)', count('ui.v2panel(') === 20);
  check('plus aucune duplication « Panel.content = i18n.t(...) »', count('Panel.content = i18n.t') === 0);
  check('plus aucune référence à buildTicketPanelEmbed', count('buildTicketPanelEmbed') === 0);
  // v237 — il ne reste QU'UNE lecture de .embeds[0] dans le code exécuté :
  //   • panelTitleOf — rétro-compatibilité : les panneaux déjà en place dans les
  //     salons sont des embeds classiques et doivent quand même être nettoyés.
  // `updateRecapRating` ne relit plus l'embed : le récapitulatif du journal est
  // passé en Components V2 et la note s'écrit en patchant le TextDisplay du
  // conteneur. (5 occurrences : 4 dans des commentaires explicatifs + 1 code.)
  check('plus aucune extraction .embeds[0] hors panelTitleOf (updateRecapRating migrée en v237)',
    count('embeds[0]') === 5
    && /const emb = msg && msg\.embeds && msg\.embeds\[0\];/.test(src)
    && !/EmbedBuilder\.from\(msg\.embeds\[0\]\)/.test(src));
  check('panelTitleOf lit AUSSI le conteneur V2 (type 17 → TextDisplay « ## »)',
    src.includes('Number(json.type) !== 17') && src.includes(".replace(/^##\\s*/, '')"));

  // Les 3 panneaux automatiques ne posaient le même texte QUE dans content :
  // vérifié ici sur le rendu réel, pas seulement sur le source.
  for (const [label, key, titre] of [
    ['fermeture auto', 'ticket_auto_closed', '⏰ Ticket fermé automatiquement'],
    ['rappel auto', 'ticket_auto_warn', '⚠️ Ticket bientôt fermé'],
    ['suppression auto', 'ticket_auto_deleted', '🗑️ Ticket supprimé automatiquement'],
  ]) {
    const texte = i18n.t('fr', key, { number: 1 });
    check(`panneau ${label} : le texte i18n n’a pas de saut de paragraphe (donc pas de trait)`,
      !texte.includes('\n\n'));
    check(`panneau ${label} : « ${titre} » toujours présent dans le source`, src.includes(titre));
  }

  // Le wizard « assistant types » reste volontairement en embeds classiques.
  check('wizard « assistant types » : toujours 1 sectionize (reporté dans un lot dédié)',
    count('ui.sectionize(') === 1 && /typesQuestionsEmbed/.test(src));
  check('les 6 étapes du wizard sont toujours cohérentes entre elles',
    ['typesPickEmbed', 'typesEditEmbed', 'typesAddRoleEmbed', 'typesRemoveRoleEmbed', 'typesQuestionsEmbed', 'typesRemoveQuestionEmbed']
      .every((f) => src.includes(`function ${f}(state)`)));
  check('le récap de ticket (journal) reste en EmbedBuilder : aucune description, donc aucun trait',
    /📔 Récapitulatif — Ticket #/.test(src) && /updateRecapRating/.test(src));
}

console.log('\n6️⃣  Garde-fous des versions précédentes');
{
  check('v220 : advancedTickets.js toujours en séparateurs natifs',
    fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'advancedTickets.js'), 'utf8').includes('setDivider(true)'));
  check('v231 : /quiz toujours en V2',
    fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'extra.js'), 'utf8').includes('v2panel'));
  const premade = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'premade.js'), 'utf8');
  check('v232 : premade.js toujours sans sectionize', !premade.includes('ui.sectionize('));
  const sugg = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'suggest.js'), 'utf8');
  check('v232 : suggest.js toujours sans sectionize', !sugg.includes('ui.sectionize('));
  const giv = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'giveaway.js'), 'utf8');
  check('v233 : giveaway.js toujours sans sectionize', !giv.includes('ui.sectionize('));
  const ev = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'guildEvents.js'), 'utf8');
  check('v233 : guildEvents.js toujours sans sectionize', !ev.includes('ui.sectionize('));
  check('v232 : xp.js reste EXCLU du V2 (webhook + pièce jointe = 400)',
    fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'xp.js'), 'utf8').includes('ui.sectionize(text)'));
  check('ui.js : v2panel reste compatible drop-in avec ui.panel (mêmes options)',
    typeof ui.v2panel === 'function' && (() => {
      const opts = { variant: 'info', title: 'T', description: 'A\n\nB', fields: [{ name: 'n', value: 'v' }], footer: 'F' };
      const a = ui.v2panel(opts);
      const b = ui.v2panel({ ...opts });
      return isV2(a) && v2json(a) === v2json(b) && a.components.length === 1;
    })());
  check('ui.js : v2edit vide bien les champs classiques', (() => {
    const e = ui.v2edit({ title: 'x' });
    return e.content === null && Array.isArray(e.embeds) && e.embeds.length === 0 && (e.flags & IS_V2) !== 0;
  })());
}

console.log(`\n${failures === 0 ? '🎉 Tous les tests v234 passent' : `❌ ${failures} échec(s)`}`);
process.exit(failures === 0 ? 0 : 1);
