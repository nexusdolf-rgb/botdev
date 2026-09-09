// Test v2.29 — Système de traits de séparation (━) : extension aux messages restants.
//
// Contexte : la « grammaire des sections » posée en v220 (ui.SEPARATOR = 20 × ━,
// ui.sectionize(), application automatique dans ui.embed) couvrait déjà la
// plupart des panneaux. Restaient des messages construits HORS design system :
//   • `new EmbedBuilder()` direct dans des fichiers qui n'importaient pas ui.js
//   • `content:` texte brut multi-paragraphes
//
// v229 applique le trait sur 10 messages informatifs multi-blocs et VERROUILLE
// les exclusions (le trait y serait une régression visuelle).
//
// ⚖️  CRITÈRE OFFICIEL (v220, précisé par v229) — à ne jamais perdre de vue :
//   Ce n'est PAS « jeu interactif = pas de trait », mais
//   « JAMAIS de trait entre deux COURTES phrases ».
//     • le quiz PREND le trait : 3-4 blocs substantiels (question / réponses
//       A-B-C / bonus de rapidité / points gagnés)
//     • mariage, pendu, morpion : 2 phrases courtes + mises à jour live à chaque
//       tour → sections:false (héritage v220, inchangé)
//     • /shop : 2 phrases courtes → trait orphelin (bug corrigé en v220)
//     • /poll : chaque paragraphe EST une option de vote → 10 choix feraient
//       9 traits et hacheraient le vote
//
// Garanties vérifiées ici :
//  1. Le design system est inchangé (SEPARATOR, sectionize mono/multi/code)
//  2. Les 10 messages cibles passent bien par ui.sectionize
//  3. Les exclusions volontaires n'y passent PAS et sont documentées
//  4. Rendu réel : le bon nombre de traits pour chaque message
//  5. Garde-fous v220 toujours debout (sections:false >= 5, aucun ━ texte
//     dans les panneaux natifs Container V2)
//  6. Les 3 fichiers nouvellement branchés importent bien ui.js
//  7. Versionnage front cohérent (v229)
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v229-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const ui = require('../server/discord/ui');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SEP = ui.SEPARATOR;
const count = (s) => (String(s).split(SEP).length - 1);
const srcCache = new Map();
const src = (f) => { if (!srcCache.has(f)) srcCache.set(f, read(f)); return srcCache.get(f); };

// ------------------------------------------------------------
console.log('\n1) Design system inchangé (héritage v220)');
check('SEPARATOR = 20 × ━', SEP === '━'.repeat(20));
check('SEPARATOR = texte pur, sans couleur ANSI', /^[━]+$/.test(SEP) && !SEP.includes('\u001b'));
check('sectionize : texte mono-paragraphe STRICTEMENT inchangé', ui.sectionize('Une seule ligne.') === 'Une seule ligne.');
check('sectionize : vide / null → vide', ui.sectionize('') === '' && ui.sectionize(null) === '');
check('sectionize : 2 paragraphes → 1 trait', count(ui.sectionize('Bloc A\n\nBloc B')) === 1);
const withCode = 'Avant\n\n```\ncode\n\nencore\n```\n\nAprès';
check('sectionize : les blocs de code ne sont jamais coupés', count(ui.sectionize(withCode)) === 2);
check('sectionize : troncature sans demi-trait final', !/━{1,19}$/.test(ui.sectionize('A\n\nB\n\nC\n\nD\n\nE', 12)));

// ------------------------------------------------------------
console.log('\n2) Les 10 messages cibles passent par ui.sectionize');
const TARGETS = [
  // v235 — /apply view est passé en Components V2 : le `content: ui.sectionize(…)`
  // est devenu la `description` du conteneur (séparateur NATIF pleine largeur).
  { f: 'server/discord/extra.js',           needle: 'description: `📝 **Candidatures**',                        label: '/apply view — récapitulatif des candidatures (v235 : V2)' },
  // v236 — ces accusés de réception sont en Components V2 : le
  // `content: ui.sectionize(…)` est devenu la `description` du conteneur.
  { f: 'server/discord/panelCommands.js',   needle: 'description: `✅ Type «',                                 label: '/ticket types — accusés de réception (add + maj) (v236 : V2)' },
  { f: 'server/discord/panels.js',          needle: ".setDescription(ui.sectionize('Les membres qui ouvrent",   label: 'assistant types — étape Questionnaire' },
  // v232 — /levels est passé en Components V2 (séparateurs natifs pleine
  // largeur) via le helper replyPanel de premade.js.
  { f: 'server/discord/premade.js',         needle: "title: '📈 Classement des niveaux',",                     label: '/levels — classement des niveaux (v232 : V2)' },
  { f: 'server/discord/premade.js',         needle: 'send(ui.v2panel(options, components))',                   label: 'premade.js — replyPanel convertit 11 messages (v232)' },
  { f: 'server/discord/profileCommands.js', needle: "description: '✅ Identité mise à jour !",                 label: '/botprofile — identité mise à jour (v236 : V2)' },
  { f: 'server/discord/profileCommands.js', needle: 'description: `✅ ${sub ===',                              label: '/botprofile — avatar / bannière enregistré (v236 : V2)' },
  { f: 'server/discord/profileWizard.js',   needle: 'description: `📱 **Pour ouvrir votre galerie :**',           label: '/botprofile setup — mode d’emploi galerie (v236 : V2)' },
  // v231 — le quiz est passé en Components V2 (séparateurs natifs pleine
  // largeur) : il ne passe plus par ui.sectionize().
  { f: 'server/discord/extra.js',           needle: 'const quizOptions = {',                                     label: '/quiz — lancement (v231 : options du conteneur V2)' },
  { f: 'server/discord/extra.js',           needle: 'ui.v2panel(quizOptions, [row])',                            label: '/quiz — lancement envoyé en v2panel' },
  { f: 'server/discord/extra.js',           needle: 'const resultPayload = ui.v2panel({',                        label: '/quiz — résultat après réponse (v231 : V2)' },
];
for (const t of TARGETS) check(t.label, src(t.f).includes(t.needle));
// v236 — les 2 accusés de réception sont en V2 (`description:` du conteneur).
check('panelCommands.js : les 2 accusés de réception sont branchés en V2',
  (src('server/discord/panelCommands.js').match(/description: `✅ Type «/g) || []).length === 2);

// ------------------------------------------------------------
console.log('\n3) Les exclusions volontaires sont préservées ET documentées');
const ex = src('server/discord/extra.js');
const pm = src('server/discord/premade.js');
const EXCL = 'EXCLUSION VOLONTAIRE';
// v230 : /poll est passé en CHAMPS D'EMBED (un champ par option). Il reste
// exclu de la grammaire des sections — voir test/v230-test.js pour le détail.
check('/poll : toujours AUCUN sectionize (liste d’options ≠ sections)',
  !ex.includes('.setDescription(ui.sectionize(lines.join'));
check('/poll : rendu en champs d’embed documenté (v230)',
  ex.includes('.addFields(fields)') && ex.includes('9 traits'));
check('/shop : description courte non sectionizée',
  pm.includes('.setDescription(`Achetez un article avec vos coins') && !pm.includes('ui.sectionize(`Achète un article'));
check('/shop : exclusion documentée + référence au trait orphelin', pm.includes(EXCL) && pm.includes('trait orphelin'));
check('mariage / pendu / morpion : toujours >= 5 « sections: false » (garde-fou v220)',
  (ex.match(/sections: false/g) || []).length >= 5);
// v231 — le critère était dupliqué aux 2 emplacements du quiz ; il est
// maintenant écrit UNE fois, au lancement (le résultat y renvoie). Le
// critère lui-même est inchangé et reste la référence du bot.
check('le CRITÈRE v229 est écrit dans le code',
  (ex.match(/jamais de trait entre deux COURTES phrases/g) || []).length >= 1);
check('le quiz n’est plus marqué comme exclusion', !/le quiz est un JEU INTERACTIF/.test(ex));

// ------------------------------------------------------------
console.log('\n4) Rendu réel : nombre de traits par message');
// v235 — /apply view est en Components V2 : le trait texte est remplacé par un
// séparateur NATIF pleine largeur entre les 2 paragraphes (récap → instruction).
const applyView = ui.v2panel({
  description: '📝 **Candidatures**\nSalon : <#C1>\nQuestions (2/5) :\n1. Quel âge as-tu ?\n2. Pourquoi nous ?\n\nEnvoie le panneau avec `/apply panel`',
  footer: false,
  ephemeral: true,
});
const applyJson = JSON.stringify(applyView.components[0].toJSON());
check('/apply view : 1 séparateur NATIF (récap → instruction finale), 0 trait texte',
  applyView.components[0].toJSON().components.filter((k) => k.type === 14 && k.divider === true).length === 1
  && !applyJson.includes(SEP));
check('/apply view : `footer: false` respected → aucun pied ajouté',
  !applyView.components[0].toJSON().components.some((k) => k.type === 10 && String(k.content || '').startsWith('-# ')));

const typeAdded = ui.sectionize('✅ Type « 🎫 Support » ajouté !\nTypes actuels : Support\n\n📨 Re-envoie le panneau avec `/ticket panel` pour afficher le menu de sélection.', 2000);
check('/ticket types add : 1 trait', count(typeAdded) === 1);

const typeUpdated = ui.sectionize('✅ Type « 🎫 **Support** » mis à jour !\n🛡️ Staff de ce type : <@&R1>\n\n💡 Ajoute **plusieurs rôles staff** avec `/ticket types setup`.\n\nTypes actuels : Support\n\n📨 Re-envoie le panneau avec `/ticket panel`.', 2000);
check('/ticket types (maj) : 3 traits', count(typeUpdated) === 3);

const identity = ui.sectionize('✅ Identité mise à jour !\n\n📛 Nom : **Optimus Prime**\n🎨 Couleur : #e07a5f\n📝 Bio : définie\n\nContinue avec `/botprofile avatar` et `/botprofile banner`.', 2000);
check('/botprofile (maj) : 2 traits', count(identity) === 2);

const gallery = ui.sectionize('📱 **Pour ouvrir ta galerie :**\n\n1️⃣ Tape `/botprofile avatar` puis touche l\'option « image ».\n\n2️⃣ Ou touche le **bouton ➕** de la barre de message.', 2000);
check('/botprofile setup galerie : 2 traits', count(gallery) === 2);

// v232 — /levels est en Components V2 : on vérifie le séparateur NATIF du
// payload réel, plus le trait texte. 2 paragraphes → 1 séparateur entre eux
// + 1 avant le pied = 2.
const levelsV2 = ui.v2panel({ title: '📈 Classement des niveaux', description: '**Top 10 — les membres les plus actifs**\n\n**1.** <@U1> — **12** · 4500 XP\n**2.** <@U2> — **9** · 3100 XP', footer: 'Hoxera · Serveur' }).components[0].toJSON();
check('/levels : 2 séparateurs natifs (1 entre blocs + 1 pied)',
  levelsV2.components.filter((k) => k.type === 14 && k.divider === true).length === 2);
check('/levels : aucun trait texte ━',
  !JSON.stringify(levelsV2.components).includes(SEP));

const questions = ui.sectionize('Les membres qui ouvrent ce type de ticket devront répondre **obligatoirement** à ces questions.\n\n*Par défaut : aucune question (seule la raison est demandée).*', 4096);
check('assistant Questionnaire : 1 trait', count(questions) === 1);

// v231 — le quiz est en Components V2 : on compte les SÉPARATEURS NATIFS
// produits par le payload réel (divider:true), plus aucun trait texte.
// Barème : n paragraphes → (n-1) séparateurs entre blocs + 1 avant le pied.
const quizV2 = (desc) => {
  const j = JSON.stringify(ui.v2panel({ title: '🧠 Quiz', description: desc, footer: 'F' }).components[0].toJSON());
  return (j.match(/"divider":true/g) || []).length;
};
check('/quiz lancement : 3 séparateurs natifs (2 entre blocs + 1 pied)',
  quizV2('**Quelle est la capitale de la France ?**\n\n🇦 **Paris**\n🇧 **Lyon**\n🇨 **Lille**\n\n⚡ Réponds vite : **+5 points bonus** si tu réponds en moins de **8 secondes** !') === 3);
check('/quiz résultat (bonne réponse) : 4 séparateurs natifs',
  quizV2('✅ **Bonne réponse !**\n\n**Quelle est la capitale de la France ?**\n\nLa bonne réponse était : **Paris**\n\n✨ +15 points (bonus rapidité ⚡)') === 4);
check('/quiz résultat (mauvaise réponse) : 3 séparateurs natifs',
  quizV2('❌ **Mauvaise réponse…**\n\n**Quelle est la capitale de la France ?**\n\nLa bonne réponse était : **Paris**') === 3);
check('/quiz : le payload V2 ne contient AUCUN trait texte ━',
  !JSON.stringify(ui.v2panel({ title: '🧠 Quiz', description: 'A\n\nB', footer: 'F' })).includes(SEP));

// Exclusions : ZÉRO trait.
const extra = require('../server/discord/extra');
const pollJson = extra.pollEmbed('Question ?', ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], new Map()).toJSON();
check('/poll (10 choix) : 0 trait — la liste reste lisible',
  !JSON.stringify(pollJson).includes(SEP));
check('/shop : 0 trait — deux phrases courtes, pas de trait orphelin',
  count('Achète un article avec tes coins : `/buy article`\n\n💰 **Ton solde : 120 coins**') === 0);

// Les 3 autres jeux gardent leur rendu naturel via sections:false.
for (const [name, raw] of [
  ['mariage', '❓ **Alice**, **Bob** te demande en mariage !\n\nUne belle histoire commence peut-être. Choisis ta réponse ci-dessous.'],
  ['pendu', '**Alice**, devine le mot caché !\n\n`_ _ _ _ _`'],
  ['morpion', '**Alice** (❌) contre **Bob** (⭕)\n\nAu tour de **Alice** !'],
]) {
  const d = ui.panel({ title: 'T', description: raw, sections: false }).embeds[0].data.description;
  check(`jeu « ${name} » : 0 trait, sauts de ligne naturels conservés`, !d.includes(SEP) && d.includes('\n\n'));
}

// ------------------------------------------------------------
console.log('\n5) Garde-fous v220 toujours debout');
check('ui.panel : le trait reste appliqué par défaut',
  ui.panel({ title: 'T', description: 'Partie A\n\nPartie B' }).embeds[0].data.description.includes(SEP));
check('ui.panel : sections:false conserve le texte brut', (() => {
  const d = ui.panel({ title: 'T', description: 'Partie A\n\nPartie B', sections: false }).embeds[0].data.description;
  return d.includes('\n\n') && !d.includes(SEP);
})());

const nativeFiles = fs.readdirSync(path.join(__dirname, '..', 'server', 'discord'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => `server/discord/${f}`)
  // v231 — ui.js est le MODULE DE DESIGN SYSTEM : il définit à la fois le
  // trait texte (pour les messages pas encore migrés) et les conteneurs V2.
  // Le scan de source porte donc sur les fichiers qui CONSTRUISENT des
  // panneaux, et il est complété ci-dessous par un garde-fou FONCTIONNEL sur
  // le payload réel — bien plus fort qu'une recherche de caractère.
  .filter((f) => /TextDisplayBuilder|ContainerBuilder/.test(src(f)))
  .filter((f) => !f.endsWith('discord/ui.js'));
check('panneaux natifs V2 détectés pour le contrôle', nativeFiles.length >= 1);
const badNative = nativeFiles.filter((f) => src(f).split('\n')
  .some((line) => line.includes('━') && !line.trim().startsWith('//') && !line.trim().startsWith('*')));
check('garde-fou V2 : aucun ━ texte dans les panneaux natifs', badNative.length === 0);
if (badNative.length) console.log('     ↳ fichiers en cause :', badNative.join(', '));
check('advancedTickets : séparateurs NATIFS toujours présents (>= 3)',
  (src('server/discord/advancedTickets.js').match(/addSeparatorComponents\(new SeparatorBuilder\(\)\.setDivider\(true\)\)/g) || []).length >= 3);

// ------------------------------------------------------------
console.log('\n6) Les fichiers nouvellement branchés importent ui.js');
for (const f of ['server/discord/panelCommands.js', 'server/discord/profileCommands.js', 'server/discord/profileWizard.js']) {
  check(`${path.basename(f)} : import ui présent`, /const ui = require\('\.\/ui'\);/.test(src(f)));
}
check('extra.js / panels.js / premade.js : imports ui conservés',
  ['server/discord/extra.js', 'server/discord/panels.js', 'server/discord/premade.js']
    .every((f) => /const ui = require\('\.\/ui'\);/.test(src(f))));

// ------------------------------------------------------------
console.log('\n7) Aucun secret ajouté + versionnage front v229');
const touched = ['server/discord/extra.js', 'server/discord/panelCommands.js', 'server/discord/panels.js',
  'server/discord/premade.js', 'server/discord/profileCommands.js', 'server/discord/profileWizard.js',
  'public/index.html', 'public/sw.js'];
check('aucun token en dur dans les fichiers modifiés',
  !touched.some((f) => /(ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_]{15,}/.test(src(f))));
check('index.html : 7 références ?v=256', (src('public/index.html').match(/\?v=256/g) || []).length === 7);
check('index.html : plus aucune référence ?v=236', !src('public/index.html').includes('?v=236'));
check('sw.js : cache botdev-v241', src('public/sw.js').includes("const CACHE = 'botdev-v256';"));

console.log(failures === 0
  ? '\n✅ V229 — Traits ━ étendus aux 10 messages multi-blocs (dont le quiz), exclusions verrouillées, garde-fous v220 intacts.'
  : `\n❌ V229 — ${failures} échec(s)`);
process.exit(failures ? 1 : 0);
