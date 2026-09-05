// Test v2.31 — SÉPARATEURS NATIFS PLEINE LARGEUR (Components V2), lot n°1.
//
// Pourquoi :
//   • Un trait fait de caractères ━ est du TEXTE. Discord applique un padding
//     interne à tout contenu d'embed : le trait s'arrête donc AVANT le bord
//     arrondi, et sa longueur visible dépend du nombre de caractères. Les
//     panneaux du bot n'avaient donc PAS tous la même longueur de trait.
//   • Le Separator de Components V2 est un composant de LAYOUT : Discord le
//     dessine bord à bord, jusqu'aux arrondis. C'est la grammaire déjà
//     utilisée par le panneau de tickets personnalisés (v220) — la référence
//     visuelle retenue par l'utilisateur.
//   • Ce que constatait déjà le commentaire v220 d'advancedTickets.js :
//     « pas un trait de texte qui ne va pas jusqu'au bord du panneau ».
//
// Ce lot (v231) :
//   • ui.js reçoit une API V2 complète : v2container, v2panel,
//     v2contentPanel, v2status, v2edit (+ colorInt, V2_TEXT_BUDGET,
//     V2_COMPONENT_CAP). Même grammaire d'options que embed()/panel() pour
//     que la migration d'un message soit mécanique.
//   • /quiz migré : lancement ET résultat (interaction.update).
//
// Garanties vérifiées ici :
//  1. L'API V2 est exportée et construit des payloads valides
//  2. Flag IsComponentsV2 posé, conteneur de type 17, couleur d'accent reprise
//  3. Zéro caractère ━ dans le payload : séparateurs 100 % natifs
//  4. Tout Separator est en divider:true (la ligne visible, pleine largeur)
//  5. Grammaire IDENTIQUE au panneau de référence : pas de séparateur après le
//     titre, un séparateur entre chaque bloc du corps, un séparateur avant le
//     pied
//  6. content: devient un bloc de tête (interdit au niveau du message en V2)
//  7. fields → un TextDisplay par champ
//  8. Éphémère : flag Ephemeral combiné à IsComponentsV2
//  9. Boutons/menus : les ActionRow vont DANS le conteneur
// 10. Limites Discord : 4 000 caractères cumulés, 40 composants imbriqués
// 11. sections:false → aucun séparateur
// 12. Pied : heure reportée, jamais « Invalid Date »
// 13. v2status / v2contentPanel / v2edit
// 14. /quiz migré dans le code source + payload réel conforme
// 15. interaction.update() accepte bien le flag (typings discord.js)
// 16. Garde-fous v220/v229/v230 toujours debout
// 17. Aucun secret ajouté + versionnage front v231
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v231-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const ui = require('../server/discord/ui');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SEP = ui.SEPARATOR;

// Rend le JSON du conteneur d'un payload v2panel.
const cont = (options, rows) => ui.v2panel(options, rows).components[0].toJSON();
const kids = (options, rows) => cont(options, rows).components;
const nSep = (options, rows) => kids(options, rows).filter((k) => k.type === 14).length;
const nText = (options, rows) => kids(options, rows).filter((k) => k.type === 10).length;
const texts = (options, rows) => kids(options, rows).filter((k) => k.type === 10).map((k) => k.content);
const types = (options, rows) => kids(options, rows).map((k) => k.type);

// ------------------------------------------------------------
console.log('\n1) API V2 exportée par ui.js');
['v2container', 'v2panel', 'v2contentPanel', 'v2status', 'v2edit', 'colorInt'].forEach((fn) => {
  check(`ui.${fn} est une fonction`, typeof ui[fn] === 'function');
});
check('ui.V2_TEXT_BUDGET = 4000 (limite officielle Discord)', ui.V2_TEXT_BUDGET === 4000);
check('ui.V2_COMPONENT_CAP = 40 (limite officielle, imbriqués compris)', ui.V2_COMPONENT_CAP === 40);
check('paragraphs() toujours exporté (partagé avec advancedTickets)', typeof ui.paragraphs === 'function');
check('sectionize() toujours exporté (messages non migrés)', typeof ui.sectionize === 'function');

// ------------------------------------------------------------
console.log('\n2) Structure du payload Components V2');
const quizDesc = '**Quelle est la capitale de la France ?**\n\n🇦 **Paris**\n🇧 **Lyon**\n🇨 **Lille**\n\n⚡ Réponds vite : **+5 points bonus** si tu réponds en moins de **8 secondes** !';
const quizOptions = { color: 0xe07a5f, title: '🧠 Quiz', description: quizDesc, footer: 'Hoxera · Mon serveur · Quiz' };
const quizPayload = ui.v2panel(quizOptions);
const quizCont = quizPayload.components[0].toJSON();

check('payload.flags contient IsComponentsV2',
  (quizPayload.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
check('payload ne contient NI content NI embeds (interdits en V2)',
  quizPayload.content === undefined && quizPayload.embeds === undefined);
check('un seul composant de haut niveau', quizPayload.components.length === 1);
check('composant de type 17 (Container)', quizCont.type === 17);
check('couleur d’accent reprise (0xe07a5f)', quizCont.accent_color === 0xe07a5f);
check('colorInt accepte un variant nommé', ui.colorInt('success') === parseInt('57F287', 16));
check('colorInt accepte un hexadécimal', ui.colorInt('#ED4245') === parseInt('ED4245', 16));

// ------------------------------------------------------------
console.log('\n3) Zéro trait texte — séparateurs 100 % natifs');
const quizJson = JSON.stringify(quizPayload);
check('aucun caractère ━ dans le payload du quiz', !quizJson.includes('━'));
check('aucun U+2501 isolé non plus', !quizJson.includes('\u2501'));
const seps = quizCont.components.filter((k) => k.type === 14);
check('le quiz produit bien des Separator', seps.length >= 1);
check('TOUS les Separator sont en divider:true (ligne visible pleine largeur)',
  seps.every((s) => s.divider === true));
check('aucun Separator en divider:false par défaut', !seps.some((s) => s.divider === false));

// ------------------------------------------------------------
console.log('\n4) Grammaire identique au panneau de référence (advancedTickets v220)');
// Référence : titre, puis corps, séparateur ENTRE chaque bloc du corps,
// AUCUN séparateur juste après le titre, séparateur avant le pied.
check('quiz : 3 paragraphes de description',
  ui.paragraphs(quizDesc).length === 3);
// 3 blocs de corps → 2 séparateurs entre eux + 1 avant le pied = 3.
check('quiz lancement : 3 séparateurs natifs (2 entre blocs + 1 pied)', nSep(quizOptions) === 3);
check('quiz lancement : 5 TextDisplay (titre + 3 blocs + pied)', nText(quizOptions) === 5);
check('AUCUN séparateur juste après le titre',
  !(types(quizOptions)[0] === 10 && types(quizOptions)[1] === 14));
check('le titre est le premier TextDisplay, en « ## »', texts(quizOptions)[0] === '## 🧠 Quiz');
check('séparateur avant le pied', types(quizOptions).slice(-2).join(',') === '14,10');
check('le pied est en texte discret « -# »', texts(quizOptions).slice(-1)[0].startsWith('-# '));

const resOk = { ...quizOptions, color: 0x57f287, description: '✅ **Bonne réponse !**\n\n**Quelle est la capitale de la France ?**\n\nLa bonne réponse était : **Paris**\n\n✨ +15 points (bonus rapidité ⚡)' };
const resKo = { ...quizOptions, color: 0xed4245, description: '❌ **Mauvaise réponse…**\n\n**Quelle est la capitale de la France ?**\n\nLa bonne réponse était : **Paris**' };
check('quiz résultat (bonne réponse, 4 blocs) : 4 séparateurs', nSep(resOk) === 4);
check('quiz résultat (mauvaise réponse, 3 blocs) : 3 séparateurs', nSep(resKo) === 3);
check('couleur du résultat (succès) reprise', cont(resOk).accent_color === 0x57f287);
check('couleur du résultat (échec) reprise', cont(resKo).accent_color === 0xed4245);

// ------------------------------------------------------------
console.log('\n5) content: devient un bloc de tête (interdit au niveau du message en V2)');
const withContent = ui.v2contentPanel('📝 **Candidatures**\nSalon : <#1>\n\nEnvoie le panneau avec `/apply panel`', { title: 'T', description: 'Corps A\n\nCorps B' });
const wcJson = withContent.components[0].toJSON();
check('payload sans champ content au niveau message', withContent.content === undefined);
// Le content classique est le texte du message, rendu tel quel AU-DESSUS de
// l'embed. En V2 il devient un bloc de tête CONSERVÉ INTÉGRALEMENT (non
// découpé en paragraphes) : c'est le rendu le plus fidèle à l'existant.
check('le content devient le premier TextDisplay, conservé intégralement',
  wcJson.components.filter((k) => k.type === 10)[0].content === '📝 **Candidatures**\nSalon : <#1>\n\nEnvoie le panneau avec `/apply panel`');
// content + titre + 2 blocs de corps + pied par défaut = 5 TextDisplay.
check('le content n’est PAS découpé en paragraphes (5 blocs au total)',
  wcJson.components.filter((k) => k.type === 10).length === 5);
check('séparateur après le bloc content', wcJson.components[1].type === 14);
check('aucun caractère ━', !JSON.stringify(withContent).includes('━'));

// ------------------------------------------------------------
console.log('\n6) fields → un TextDisplay par champ');
const withFields = ui.v2panel({ title: 'T', fields: [{ name: 'Serveurs', value: '8' }, { name: 'Membres', value: '190' }], footer: false });
const fTexts = texts({ title: 'T', fields: [{ name: 'Serveurs', value: '8' }, { name: 'Membres', value: '190' }], footer: false });
check('2 champs → 2 TextDisplay de corps', fTexts.slice(1).length === 2);
check('nom du champ mis en gras', fTexts[1] === '**Serveurs**\n8');
check('séparateur natif entre les deux champs', nSep({ title: 'T', fields: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }], footer: false }) === 1);
check('champs plafonnés à 25', nText({ title: 'T', fields: Array.from({ length: 40 }, (_, i) => ({ name: `C${i}`, value: 'v' })), footer: false }) <= 26);
check('withFields construit sans erreur', !!withFields);

// ------------------------------------------------------------
console.log('\n7) Éphémère et composants interactifs');
const eph = ui.v2panel({ ...quizOptions, ephemeral: true });
check('flag Ephemeral posé', (eph.flags & MessageFlags.Ephemeral) === MessageFlags.Ephemeral);
check('flag IsComponentsV2 toujours posé en éphémère',
  (eph.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
check('les deux flags sont bien combinés', eph.flags === (MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral));

const quizRow = new ActionRowBuilder().addComponents(
  ['🇦', '🇧', '🇨'].map((e, i) => new ButtonBuilder().setCustomId(`hx:quiz:1:${i}`).setLabel(e).setStyle(ButtonStyle.Primary)),
);
const withRow = ui.v2panel(quizOptions, [quizRow]);
const wrJson = withRow.components[0].toJSON();
check('ActionRow inclus DANS le conteneur (type 1)', wrJson.components.some((k) => k.type === 1));
check('les 3 boutons de réponse sont conservés',
  wrJson.components.find((k) => k.type === 1).components.length === 3);
check('custom_id inchangés (routage handleButton intact)',
  wrJson.components.find((k) => k.type === 1).components.map((b) => b.custom_id).join(',') === 'hx:quiz:1:0,hx:quiz:1:1,hx:quiz:1:2');
check('les boutons restent après le texte', types(quizOptions, [quizRow]).slice(-1)[0] === 1);

const disabledRow = new ActionRowBuilder().addComponents(
  [0, 1, 2].map((i) => new ButtonBuilder().setCustomId(`hx:quiz:1:${i}`).setLabel(['🇦', '🇧', '🇨'][i])
    .setStyle(i === 0 ? ButtonStyle.Success : ButtonStyle.Danger).setDisabled(true)),
);
const withDisabled = ui.v2panel(resOk, [disabledRow]);
check('boutons désactivés du résultat conservés',
  withDisabled.components[0].toJSON().components.find((k) => k.type === 1).components.every((b) => b.disabled === true));

// ------------------------------------------------------------
console.log('\n8) Limites Discord respectées (4 000 caractères / 40 composants)');
const huge = ui.v2panel({ title: 'T', description: Array.from({ length: 200 }, (_, i) => `Paragraphe ${i} ${'x'.repeat(200)}`).join('\n\n'), footer: 'F' });
const hugeCont = huge.components[0].toJSON();
const totalChars = hugeCont.components.filter((k) => k.type === 10).reduce((a, k) => a + k.content.length, 0);
check('texte cumulé <= 4000', totalChars <= 4000);
const totalComponents = 1 + hugeCont.components.length;
check('composants (conteneur compris) <= 40', totalComponents <= 40);
check('le panneau géant se tronque au lieu de faire rejeter le message', totalChars > 0);
check('chaque TextDisplay individuel reste lisible', hugeCont.components.filter((k) => k.type === 10).every((k) => k.content.length > 0));

// ------------------------------------------------------------
console.log('\n9) sections:false — aucun séparateur');
const raw = ui.v2panel({ title: 'T', description: 'Phrase courte A\n\nPhrase courte B', sections: false, footer: false });
check('sections:false → 0 Separator', nSep({ title: 'T', description: 'A\n\nB', sections: false, footer: false }) === 0);
check('sections:false → le texte brut est conservé d’un bloc',
  texts({ title: 'T', description: 'A\n\nB', sections: false, footer: false })[1] === 'A\n\nB');
check('sections:true (défaut) → séparateur présent', nSep({ title: 'T', description: 'A\n\nB', footer: false }) === 1);
check('le panneau existe toujours', !!raw);

// ------------------------------------------------------------
console.log('\n10) Pied de panneau — heure reportée, jamais « Invalid Date »');
const footDefault = texts({ title: 'T', description: 'A', footer: 'Hoxera · Mon serveur' }).slice(-1)[0];
check('pied rendu en texte discret', footDefault.startsWith('-# Hoxera · Mon serveur'));
check('AUCUN « Invalid Date » dans le pied', !footDefault.includes('Invalid Date'));
check('AUCUN « Invalid Date » nulle part dans le payload', !JSON.stringify(ui.v2panel(quizOptions)).includes('Invalid Date'));
check('heure reportée dans le pied (V2 n’a pas de champ timestamp)', /\d{2}\/\d{2} \d{2}:\d{2}/.test(footDefault));
const footOff = texts({ title: 'T', description: 'A', footer: 'F', timestamp: false }).slice(-1)[0];
check('timestamp:false → pas d’heure dans le pied', !/\d{2}:\d{2}/.test(footOff));
const footNone = ui.v2panel({ title: 'T', description: 'A', footer: false });
check('footer:false → aucun bloc de pied', !texts({ title: 'T', description: 'A', footer: false }).some((t) => t.startsWith('-# ')));
check('footer:false → pas de séparateur final orphelin',
  types({ title: 'T', description: 'A', footer: false }).slice(-1)[0] !== 14);
check('le payload sans pied est valide', !!footNone);
const customDate = texts({ title: 'T', description: 'A', footer: 'F', timestamp: new Date('2026-01-02T03:04:05Z') }).slice(-1)[0];
check('timestamp: une Date précise est bien reprise', !customDate.includes('Invalid Date'));

// ------------------------------------------------------------
console.log('\n11) v2status et v2edit');
const st = ui.v2status({ variant: 'danger', title: '❌ Erreur', description: 'Bloc A\n\nBloc B', ephemeral: true });
check('v2status pose IsComponentsV2', (st.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
check('v2status pose Ephemeral', (st.flags & MessageFlags.Ephemeral) === MessageFlags.Ephemeral);
check('v2status reprend la couleur du variant', cont({ variant: 'danger', title: 'T', description: 'A' }).accent_color === parseInt('ED4245', 16));
check('v2status titre par défaut', texts({ variant: 'info', description: 'A' })[0] === '## ℹ️ Information'
  || ui.v2status({ description: 'A' }).components[0].toJSON().components.filter((k) => k.type === 10)[0].content === '## ℹ️ Information');
const ed = ui.v2edit({ title: 'T', description: 'A\n\nB' });
check('v2edit met content à null (passage embed → V2)', ed.content === null);
check('v2edit vide embeds (passage embed → V2)', Array.isArray(ed.embeds) && ed.embeds.length === 0);
check('v2edit vide attachments', Array.isArray(ed.attachments) && ed.attachments.length === 0);
check('v2edit pose le flag V2', (ed.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);

// ------------------------------------------------------------
console.log('\n12) /quiz migré dans le code source');
const ex = read('server/discord/extra.js');
check('lancement : ui.v2panel(quizOptions, [row])', ex.includes('ui.v2panel(quizOptions, [row])'));
check('lancement : plus de setDescription(ui.sectionize(`**${question}**',
  !ex.includes('.setDescription(ui.sectionize(`**${question}**'));
check('résultat : const resultPayload = ui.v2panel({', ex.includes('const resultPayload = ui.v2panel({'));
check('résultat : plus de setDescription(ui.sectionize(`${correctPick',
  !ex.includes('.setDescription(ui.sectionize(`${correctPick'));
check('résultat : interaction.update reçoit le payload V2', ex.includes('await interaction.update(resultPayload);'));
check('plus aucun { embeds: [embed], components: [row] } pour le quiz',
  !ex.includes('? await target.send({ embeds: [embed], components: [row] })'));
check('envoi dans le salon configuré : target.send(quizPayload)', ex.includes('await target.send(quizPayload)'));
check('reply : { ...quizPayload, fetchReply: true }', ex.includes("await interaction.reply({ ...quizPayload, fetchReply: true })"));
check('la raison de la migration est documentée', /v231 — SÉPARATEURS NATIFS PLEINE LARGEUR/.test(ex));
check('le critère v229 est toujours écrit dans le code',
  (ex.match(/jamais de trait entre deux COURTES phrases/g) || []).length >= 1);

// ------------------------------------------------------------
console.log('\n13) interaction.update() accepte le flag V2 (typings discord.js)');
const typings = read('node_modules/discord.js/typings/index.d.ts');
check('InteractionUpdateOptions étend MessageEditOptions',
  /export interface InteractionUpdateOptions extends MessageEditOptions/.test(typings));
check('MessageEditOptions autorise le flag IsComponentsV2',
  /MessageFlags\.SuppressEmbeds \| MessageFlags\.IsComponentsV2/.test(typings));

// ------------------------------------------------------------
console.log('\n14) Garde-fous des versions précédentes toujours debout');
check('advancedTickets : séparateurs SeparatorBuilder toujours >= 3',
  (read('server/discord/advancedTickets.js').match(/addSeparatorComponents\(new SeparatorBuilder\(\)\.setDivider\(true\)\)/g) || []).length >= 3);
check('mariage / pendu / morpion : toujours >= 5 « sections: false »',
  (ex.match(/sections: false/g) || []).length >= 5);
check('/poll : toujours en champs d’embed (v230)', /addFields\(fields\)/.test(ex));
check('/poll : shortLabel toujours en place (v230)', /const shortLabel/.test(ex));
check('ui.sectionize reste utilisé ailleurs (migration progressive)',
  (ex.match(/ui\.sectionize\(/g) || []).length >= 1);
check('SEPARATOR reste exporté (messages non migrés)', typeof ui.SEPARATOR === 'string' && ui.SEPARATOR.length === 20);
check('ui.panel/embed classiques toujours fonctionnels',
  ui.panel({ title: 'T', description: 'A\n\nB' }).embeds[0].data.description.includes(SEP));

// ------------------------------------------------------------
console.log('\n15) Aucun secret ajouté + versionnage front v231');
check('aucun token en dur dans ui.js',
  !/(ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_]{15,}/.test(read('server/discord/ui.js')));
check('aucun token en dur dans extra.js',
  !/(ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_]{15,}/.test(ex));
check('index.html : 7 références ?v=234', (read('public/index.html').match(/\?v=234/g) || []).length === 7);
check('index.html : plus aucune référence ?v=230', !read('public/index.html').includes('?v=230'));
check('sw.js : cache botdev-v234', read('public/sw.js').includes("const CACHE = 'botdev-v234';"));

console.log(failures === 0
  ? '\n✅ V231 — Séparateurs natifs pleine largeur : API V2 en place, /quiz migré, zéro trait texte, grammaire alignée sur le panneau de référence.'
  : `\n❌ V231 — ${failures} échec(s)`);
process.exit(failures ? 1 : 0);
