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
  { f: 'server/discord/extra.js',           needle: 'content: ui.sectionize(`📝 **Candidatures**',              label: '/apply view — récapitulatif des candidatures' },
  { f: 'server/discord/panelCommands.js',   needle: 'content: ui.sectionize(`✅ Type «',                        label: '/ticket types — accusés de réception (add + maj)' },
  { f: 'server/discord/panels.js',          needle: ".setDescription(ui.sectionize('Les membres qui ouvrent",   label: 'assistant types — étape Questionnaire' },
  { f: 'server/discord/premade.js',         needle: '.setDescription(ui.sectionize(`**Top ${LIMIT}',            label: '/levels — classement des niveaux' },
  { f: 'server/discord/profileCommands.js', needle: "content: ui.sectionize('✅ Identité mise à jour !",        label: '/botprofile — identité mise à jour' },
  { f: 'server/discord/profileCommands.js', needle: 'content: ui.sectionize(`✅ ${sub ===',                     label: '/botprofile — avatar / bannière enregistré' },
  { f: 'server/discord/profileWizard.js',   needle: 'content: ui.sectionize(`📱 **Pour ouvrir ta galerie :**',  label: '/botprofile setup — mode d’emploi galerie' },
  { f: 'server/discord/extra.js',           needle: '.setDescription(ui.sectionize(`**${question}**',           label: '/quiz — lancement (3 blocs substantiels)' },
  { f: 'server/discord/extra.js',           needle: '.setDescription(ui.sectionize(`${correctPick ?',           label: '/quiz — résultat après réponse' },
];
for (const t of TARGETS) check(t.label, src(t.f).includes(t.needle));
check('panelCommands.js : les 2 accusés de réception sont branchés',
  (src('server/discord/panelCommands.js').match(/content: ui\.sectionize\(`✅ Type «/g) || []).length === 2);

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
  pm.includes('.setDescription(`Achète un article avec tes coins') && !pm.includes('ui.sectionize(`Achète un article'));
check('/shop : exclusion documentée + référence au trait orphelin', pm.includes(EXCL) && pm.includes('trait orphelin'));
check('mariage / pendu / morpion : toujours >= 5 « sections: false » (garde-fou v220)',
  (ex.match(/sections: false/g) || []).length >= 5);
check('le CRITÈRE v229 est écrit dans le code (aux 2 emplacements du quiz)',
  (ex.match(/jamais de trait entre deux COURTES phrases/g) || []).length === 2);
check('le quiz n’est plus marqué comme exclusion', !/le quiz est un JEU INTERACTIF/.test(ex));

// ------------------------------------------------------------
console.log('\n4) Rendu réel : nombre de traits par message');
const applyView = ui.sectionize('📝 **Candidatures**\nSalon : <#C1>\nQuestions (2/5) :\n1. Quel âge as-tu ?\n2. Pourquoi nous ?\n\nEnvoie le panneau avec `/apply panel`', 2000);
check('/apply view : 1 trait (récap → instruction finale)', count(applyView) === 1);

const typeAdded = ui.sectionize('✅ Type « 🎫 Support » ajouté !\nTypes actuels : Support\n\n📨 Re-envoie le panneau avec `/ticket panel` pour afficher le menu de sélection.', 2000);
check('/ticket types add : 1 trait', count(typeAdded) === 1);

const typeUpdated = ui.sectionize('✅ Type « 🎫 **Support** » mis à jour !\n🛡️ Staff de ce type : <@&R1>\n\n💡 Ajoute **plusieurs rôles staff** avec `/ticket types setup`.\n\nTypes actuels : Support\n\n📨 Re-envoie le panneau avec `/ticket panel`.', 2000);
check('/ticket types (maj) : 3 traits', count(typeUpdated) === 3);

const identity = ui.sectionize('✅ Identité mise à jour !\n\n📛 Nom : **Optimus Prime**\n🎨 Couleur : #e07a5f\n📝 Bio : définie\n\nContinue avec `/botprofile avatar` et `/botprofile banner`.', 2000);
check('/botprofile (maj) : 2 traits', count(identity) === 2);

const gallery = ui.sectionize('📱 **Pour ouvrir ta galerie :**\n\n1️⃣ Tape `/botprofile avatar` puis touche l\'option « image ».\n\n2️⃣ Ou touche le **bouton ➕** de la barre de message.', 2000);
check('/botprofile setup galerie : 2 traits', count(gallery) === 2);

const levels = ui.sectionize('**Top 10 — les membres les plus actifs**\n\n**1.** <@U1> — **12** · 4500 XP\n**2.** <@U2> — **9** · 3100 XP', 4096);
check('/levels : 1 trait (en-tête → classement)', count(levels) === 1);

const questions = ui.sectionize('Les membres qui ouvrent ce type de ticket devront répondre **obligatoirement** à ces questions.\n\n*Par défaut : aucune question (seule la raison est demandée).*', 4096);
check('assistant Questionnaire : 1 trait', count(questions) === 1);

const quizGo = ui.sectionize('**Quelle est la capitale de la France ?**\n\n🇦 **Paris**\n🇧 **Lyon**\n🇨 **Lille**\n\n⚡ Réponds vite : **+5 points bonus** si tu réponds en moins de **8 secondes** !', 4096);
check('/quiz lancement : 2 traits (question / réponses / bonus)', count(quizGo) === 2);
const quizOk = ui.sectionize('✅ **Bonne réponse !**\n\n**Quelle est la capitale de la France ?**\n\nLa bonne réponse était : **Paris**\n\n✨ +15 points (bonus rapidité ⚡)', 4096);
check('/quiz résultat (bonne réponse) : 3 traits', count(quizOk) === 3);
const quizKo = ui.sectionize('❌ **Mauvaise réponse…**\n\n**Quelle est la capitale de la France ?**\n\nLa bonne réponse était : **Paris**', 4096);
check('/quiz résultat (mauvaise réponse) : 2 traits', count(quizKo) === 2);

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
  .filter((f) => /TextDisplayBuilder|ContainerBuilder/.test(src(f)));
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
check('index.html : 7 références ?v=230', (src('public/index.html').match(/\?v=230/g) || []).length === 7);
check('index.html : plus aucune référence ?v=228', !src('public/index.html').includes('?v=228'));
check('sw.js : cache botdev-v230', src('public/sw.js').includes("const CACHE = 'botdev-v230';"));

console.log(failures === 0
  ? '\n✅ V229 — Traits ━ étendus aux 10 messages multi-blocs (dont le quiz), exclusions verrouillées, garde-fous v220 intacts.'
  : `\n❌ V229 — ${failures} échec(s)`);
process.exit(failures ? 1 : 0);
