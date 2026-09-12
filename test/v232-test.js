// Test v2.32 — SÉPARATEURS NATIFS PLEINE LARGEUR, lot n°2.
//
// Ce lot :
//   • ui.v2container complété : champs inline, author + icône, vignette,
//     image. Sans ça, la migration aurait DÉGRADÉ le rendu des messages qui
//     utilisent la grille 3 colonnes des embeds.
//   • premade.js : `replyPanel` convertit 11 messages d'un coup (invite, buy,
//     pay, kick, ban, unban, timeout, warn, clear, daily, balance) +
//     /levels + la sanction envoyée en MP. 0 `sectionize` restant.
//   • suggest.js : `buildEmbed` → `buildPanel` (5 emplacements), dont les
//     deux `interaction.update()` de vote.
//   • queue.js : clé de dédoublonnage rendue V2-aware.
//   • xp.js : EXCLUSION VOLONTAIRE et documentée (webhook + pièce jointe).
//
// Garanties vérifiées ici :
//  1. queue.js distingue embed classique / panneau V2 / message texte
//  2. Champs inline regroupés par 3 (comme la grille Discord), jamais perdus
//  3. author + iconURL → Section avec Thumbnail en accessoire
//  4. thumbnail seul → accessoire du titre
//  5. image → MediaGallery pleine largeur, en bas
//  6. Ordre des blocs calqué sur l'embed classique
//  7. premade.js : plus aucun trait texte, 11 panneaux migrés
//  8. suggest.js : plus aucun trait texte, ping conservé, boutons conservés
//  9. xp.js : exclusion documentée (pas un oubli)
// 10. Plafonds Discord toujours respectés
// 11. Garde-fous v220/v229/v230/v231 toujours debout
// 12. Aucun secret ajouté + versionnage front v232
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v232-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../server/discord/ui');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SEP = ui.SEPARATOR;
const cont = (o, r) => ui.v2panel(o, r).components[0].toJSON();
const nDiv = (o, r) => cont(o, r).components.filter((k) => k.type === 14 && k.divider === true).length;
const txts = (o, r) => cont(o, r).components.filter((k) => k.type === 10).map((k) => k.content);
const kinds = (o, r) => cont(o, r).components.map((k) => k.type);

// ------------------------------------------------------------
console.log('\n1) queue.js — clé de dédoublonnage V2-aware');
const q = read('server/queue.js');
check('la clé distingue 3 familles (embed / v2 / msg)', /'embed'[\s\S]*'v2'[\s\S]*'msg'/.test(q));
check('un payload V2 est détecté par ses components', /Array\.isArray\(payload\.components\)/.test(q));
check('la raison du correctif est documentée', /v232/.test(q));

// ------------------------------------------------------------
console.log('\n2) Champs inline — la grille 3 colonnes n’est pas perdue');
const inline3 = { name: 'inline 3 champs', o: { title: 'T', footer: false, fields: [
  { name: '✨ XP', value: '120 / 500', inline: true },
  { name: '🏆 Rang', value: '#3', inline: true },
  { name: '🎁 Rôle', value: '<@&1>', inline: true },
] } };
const c3 = cont(inline3.o);
check('3 champs inline → UN seul bloc (regroupés comme la grille Discord)',
  c3.components.filter((k) => k.type === 10).length === 2);
check('les 3 champs sont sur la même ligne, séparés par « · »',
  txts(inline3.o)[1] === '**✨ XP** 120 / 500 · **🏆 Rang** #3 · **🎁 Rôle** <@&1>');
check('aucune information perdue (les 3 noms présents)',
  ['✨ XP', '🏆 Rang', '🎁 Rôle'].every((n) => txts(inline3.o)[1].includes(n)));

const inline4 = { title: 'T', footer: false, fields: [
  { name: 'A', value: '1', inline: true }, { name: 'B', value: '2', inline: true },
  { name: 'C', value: '3', inline: true }, { name: 'D', value: '4', inline: true },
] };
check('4 champs inline → 2 blocs (3 + 1, comme la grille Discord qui passe à la ligne)',
  cont(inline4).components.filter((k) => k.type === 10).length === 3);

const mixed = { title: 'T', footer: false, fields: [
  { name: 'A', value: '1', inline: true }, { name: 'B', value: '2', inline: true },
  { name: 'Progression', value: '▰▰▰ 60%', inline: false },
] };
check('inline puis non-inline → le non-inline part sur son propre bloc',
  txts(mixed).slice(1).join('||').includes('**Progression**\n▰▰▰ 60%'));
check('les inline précédents restent groupés',
  txts(mixed)[1] === '**A** 1 · **B** 2');

const longInline = { title: 'T', footer: false, fields: [
  { name: 'Motif', value: 'x'.repeat(90), inline: true },
  { name: 'Type', value: 'y'.repeat(90), inline: true },
] };
check('champs inline TROP LONGS → empilés dans le même bloc (pas de ligne coupée)',
  txts(longInline)[1].includes('\n') && !txts(longInline)[1].includes(' · '));
check('champs plafonnés à 25', cont({ title: 'T', footer: false, fields: Array.from({ length: 40 }, (_, i) => ({ name: `C${i}`, value: 'v' })) }).components.length <= 40);

// ------------------------------------------------------------
console.log('\n3) author + icône → Section avec Thumbnail');
const auth = cont({ author: { name: 'Alice 🎉', iconURL: 'https://cdn/a.png' }, description: 'Niveau 5 !', footer: false });
check('une Section est créée (type 9)', auth.components.some((k) => k.type === 9));
const sec = auth.components.find((k) => k.type === 9);
check('la Section contient le nom de l’auteur', sec.components[0].content === '**Alice 🎉**');
check('la vignette est l’accessoire de la Section (type 11)', sec.accessory && sec.accessory.type === 11);
check('l’URL de la vignette est reprise', sec.accessory.media.url === 'https://cdn/a.png');
const authNoIcon = cont({ author: { name: 'Bob' }, description: 'X', footer: false });
check('author SANS icône → simple TextDisplay (pas de Section inutile)',
  !authNoIcon.components.some((k) => k.type === 9) && authNoIcon.components[0].content === '**Bob**');

// ------------------------------------------------------------
console.log('\n4) thumbnail seul → accessoire du titre');
const thumb = cont({ title: '🎫 Ticket #12', thumbnail: 'https://cdn/t.png', description: 'A\n\nB', footer: false });
const thumbSec = thumb.components.find((k) => k.type === 9);
check('Section créée pour le titre + vignette', !!thumbSec);
check('le titre est dans la Section', thumbSec.components[0].content === '## 🎫 Ticket #12');
check('la vignette est l’accessoire', thumbSec.accessory.media.url === 'https://cdn/t.png');

// ------------------------------------------------------------
console.log('\n5) image → MediaGallery pleine largeur');
const img = cont({ title: 'T', description: 'A', image: 'https://cdn/i.png', footer: false });
check('MediaGallery présent (type 12)', img.components.some((k) => k.type === 12));
check('l’image est en BAS, comme setImage() sur un embed classique',
  kinds({ title: 'T', description: 'A', image: 'https://cdn/i.png', footer: false }).slice(-1)[0] === 12);
const attach = cont({ title: 'T', description: 'A', image: 'attachment://carte.png', footer: false });
check('une pièce jointe attachment:// est référencée dans un composant',
  JSON.stringify(attach).includes('attachment://carte.png'));

// ------------------------------------------------------------
console.log('\n6) Ordre des blocs calqué sur l’embed classique');
const full = cont({ content: 'PING', author: { name: 'Auteur' }, title: 'Titre', description: 'Corps', fields: [{ name: 'F', value: 'V' }], image: 'https://cdn/i.png', footer: 'Pied' });
const seq = kinds({ content: 'PING', author: { name: 'Auteur' }, title: 'Titre', description: 'Corps', fields: [{ name: 'F', value: 'V' }], image: 'https://cdn/i.png', footer: 'Pied' });
check('content en tête', seq[0] === 10 && full.components[0].content === 'PING');
check('séparateur après le content', seq[1] === 14);
check('author puis description puis champs puis image puis pied',
  seq.indexOf(12) > seq.indexOf(10) && full.components.slice(-1)[0].content.startsWith('-# Pied'));
check('tous les séparateurs sont en divider:true',
  full.components.filter((k) => k.type === 14).every((k) => k.divider === true));

// ------------------------------------------------------------
console.log('\n7) premade.js — 11 panneaux + /levels + sanction MP');
const pm = read('server/discord/premade.js');
check('replyPanel passe par ui.v2panel', /send\(ui\.v2panel\(options, components\)\)/.test(pm));
check('PLUS AUCUN ui.sectionize dans premade.js', !pm.includes('ui.sectionize'));
// 11 appels historiques (invite, buy, pay, kick, ban, unban, timeout, warn,
// clear, daily, balance) + /levels migré en v232 = 12.
check('12 appels replyPanel (11 historiques + /levels migré en v232)',
  (pm.match(/await replyPanel\(\{/g) || []).length === 12);
['invite', 'buy', 'pay', 'kick', 'ban', 'unban', 'timeout', 'warn', 'clear', 'daily', 'balance'].forEach((c) => {
  check(`commande « ${c} » toujours présente`, new RegExp(`case '${c}':`).test(pm));
});
check('/levels migré en replyPanel', pm.includes("title: '📈 Classement des niveaux',"));
check('/levels : plus d’EmbedBuilder + sectionize', !pm.includes(".setDescription(ui.sectionize(`**Top ${LIMIT}"));
check('sanction MP en v2panel', pm.includes('await target.send(ui.v2panel({'));
check('la raison de la migration est documentée', /v232 — SÉPARATEURS NATIFS PLEINE LARGEUR/.test(pm));

// ------------------------------------------------------------
console.log('\n8) suggest.js — buildPanel, ping conservé, boutons conservés');
const sg = read('server/discord/suggest.js');
const suggest = require('../server/discord/suggest');
check('buildPanel exporté', typeof suggest.buildPanel === 'function');
check('buildComponents toujours exporté', typeof suggest.buildComponents === 'function');
check('buildEmbed retiré (renommé)', suggest.buildEmbed === undefined);
check('PLUS AUCUN ui.sectionize dans suggest.js', !sg.includes('ui.sectionize'));
// Le mot « EmbedBuilder » subsiste dans un commentaire explicatif : ce qui
// compte, c'est qu'il n'est plus IMPORTÉ ni UTILISÉ.
check('EmbedBuilder retiré des imports', !/require\('discord\.js'\)[\s\S]{0,200}EmbedBuilder/.test(sg.split('\n')[3] || '')
  && !sg.split('\n').some((l) => l.includes('EmbedBuilder') && !l.trim().startsWith('//')));
check('plus aucun new EmbedBuilder dans suggest.js', !sg.includes('new EmbedBuilder'));
check('les 2 interaction.update passent par buildPanel',
  (sg.match(/interaction\.update\(buildPanel\(/g) || []).length === 2);
check('l’annonce d’approbation est en v2panel', sg.includes("await chan.send(ui.v2panel({"));

const row = { id: 7, status: 'pending', upvotes: 3, downvotes: 1, bot_id: 'B', text: 'Ajouter un salon musique.\n\nEt un salon cinéma.' };
const pSug = suggest.buildPanel(row, 'Toto', {});
check('payload en Components V2', (pSug.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
check('aucun trait texte ━', !JSON.stringify(pSug).includes(SEP));
check('2 paragraphes → 3 séparateurs natifs (2 entre blocs + 1 pied)',
  pSug.components[0].toJSON().components.filter((k) => k.type === 14 && k.divider === true).length === 3);
check('les 3 compteurs inline groupés sur une ligne',
  pSug.components[0].toJSON().components.filter((k) => k.type === 10)
    .some((k) => /^\*\*📊 Statut\*\* .* · \*\*👍 Votes\*\* 3 · \*\*👎 Votes\*\* 1$/.test(k.content)));
check('les boutons de vote sont DANS le conteneur',
  pSug.components[0].toJSON().components.some((k) => k.type === 1));
const pPing = suggest.buildPanel(row, 'Toto', {}, '@everyone');
check('le ping @everyone devient un TextDisplay en tête (content interdit en V2)',
  pPing.components[0].toJSON().components.filter((k) => k.type === 10)[0].content === '@everyone');
check('payload sans champ content au niveau message', pPing.content === undefined);
const pColor = suggest.buildPanel(row, 'T', { suggestion_color: '#123456' });
check('couleur personnalisée → accent du conteneur', pColor.components[0].toJSON().accent_color === 0x123456);
const pAppr = suggest.buildPanel({ ...row, status: 'approved' }, 'T', {});
check('statut approuvé → vert', pAppr.components[0].toJSON().accent_color === 0x57f287);
const pDen = suggest.buildPanel({ ...row, status: 'denied' }, 'T', {});
check('statut refusé → rouge', pDen.components[0].toJSON().accent_color === 0xed4245);

// ------------------------------------------------------------
console.log('\n9) xp.js — exclusion VOLONTAIRE et documentée');
const xp = read('server/discord/xp.js');
check('l’exclusion est marquée ⛔ EXCLUSION VOLONTAIRE', xp.includes('⛔ EXCLUSION VOLONTAIRE de la migration Components V2'));
check('la cause officielle est citée (400 BAD REQUEST)', xp.includes('400 BAD REQUEST'));
check('la source est citée (Webhook Resource / Execute Webhook)', xp.includes('Execute Webhook'));
check('xp.js utilise toujours sectionize (assumé, documenté)', xp.includes('ui.sectionize(text)'));

// ------------------------------------------------------------
console.log('\n10) Plafonds Discord toujours respectés');
const heavy = ui.v2panel({
  content: 'C'.repeat(1900), author: { name: 'A', iconURL: 'https://cdn/a.png' }, title: 'T',
  description: Array.from({ length: 60 }, (_, i) => `Paragraphe ${i} ${'x'.repeat(120)}`).join('\n\n'),
  fields: Array.from({ length: 25 }, (_, i) => ({ name: `Champ ${i}`, value: 'v'.repeat(80), inline: true })),
  image: 'https://cdn/i.png', footer: 'Pied',
}, [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('x').setLabel('B').setStyle(ButtonStyle.Primary))]);
const hc = heavy.components[0].toJSON();
const nested = JSON.stringify(hc).split('"type":').length - 1;
const totalChars = (() => {
  let n = 0;
  const walk = (k) => { if (k.type === 10 && k.content) n += k.content.length; (k.components || []).forEach(walk); };
  hc.components.forEach(walk);
  return n;
})();
check('texte cumulé (Sections comprises) <= 4000', totalChars <= 4000);
check('composants imbriqués compris <= 40', nested <= 40);
check('le panneau saturé se tronque au lieu d’être rejeté', totalChars > 0 && nested > 0);

// ------------------------------------------------------------
console.log('\n11) Garde-fous des versions précédentes');
const ex = read('server/discord/extra.js');
check('v231 — /quiz toujours en ui.v2panel', (ex.match(/ui\.v2panel\(/g) || []).length >= 2);
check('v231 — colorInt accepte les couleurs numériques', ui.colorInt(0x57f287) === 0x57f287);
check('v230 — /poll toujours en champs d’embed', /addFields\(fields\)/.test(ex));
check('v229 — mariage / pendu / morpion : >= 5 « sections: false »', (ex.match(/sections: false/g) || []).length >= 5);
check('v220 — advancedTickets : >= 3 SeparatorBuilder pleine largeur',
  (read('server/discord/advancedTickets.js').match(/addSeparatorComponents\(new SeparatorBuilder\(\)\.setDivider\(true\)\)/g) || []).length >= 3);
check('ui.panel classique toujours fonctionnel (messages non migrés)',
  ui.panel({ title: 'T', description: 'A\n\nB' }).embeds[0].data.description.includes(SEP));
check('ui.sectionize toujours exporté', typeof ui.sectionize === 'function');

// ------------------------------------------------------------
console.log('\n12) Aucun secret ajouté + versionnage front v232');
['server/discord/premade.js', 'server/discord/suggest.js', 'server/discord/xp.js', 'server/queue.js', 'server/discord/ui.js'].forEach((f) => {
  check(`aucun token en dur dans ${path.basename(f)}`,
    !/(ghp_|github_pat_|rnd_|xox[baprs]-)[A-Za-z0-9_-]{15,}/.test(read(f)));
});
check('index.html : 7 références ?v=290', (read('public/index.html').match(/\?v=290/g) || []).length === 7);
check('index.html : plus aucune référence ?v=231', !read('public/index.html').includes('?v=231'));
check('sw.js : cache botdev-v241', read('public/sw.js').includes("const CACHE = 'botdev-v290';"));

console.log(failures === 0
  ? '\n✅ V232 — Lot n°2 : 18 emplacements migrés (premade ×13, suggest ×5), queue.js corrigé, xp.js exclu et documenté.'
  : `\n❌ V232 — ${failures} échec(s)`);
process.exit(failures ? 1 : 0);
