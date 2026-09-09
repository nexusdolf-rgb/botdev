// Test v2.33 — SÉPARATEURS NATIFS PLEINE LARGEUR, lot n°3.
//
// Ce lot :
//   • giveaway.js — `buildEmbed` → `buildPanel`, `buildEndedEmbed` →
//     `buildEndedPanel`. 5 emplacements : 2 lancements (slash + dashboard),
//     l'ÉDITION du message en fin de tirage, et l'annonce des gagnants.
//   • guildEvents.js — `eventPanel` reçoit `rows` et `content` en paramètres
//     (en V2 les boutons vont DANS le conteneur et le champ `content` du
//     message est interdit). 7 emplacements : création, mise à jour des
//     inscrits, rappels 24 h et 1 h, /event list, /event delete.
//
// Points de risque couverts :
//   • le giveaway est un message PERMANENT édité à la fin du tirage → les deux
//     bouts doivent être en V2 (Discord interdit d'en sortir à l'édition) ;
//   • la réaction 🎉 doit continuer de fonctionner (indépendante des composants) ;
//   • le ping @everyone/rôle devient un TextDisplay (content interdit en V2)
//     et `allowedMentions` doit rester appliqué ;
//   • les champs inline (gagnants / fin du tirage) ne doivent pas être perdus ;
//   • le flag Éphémère doit être COMBINÉ au flag IsComponentsV2, pas accolé à
//     un spread qui écraserait `flags`.
//
// Garanties vérifiées ici :
//  1. giveaway : plus aucun trait texte, séparateurs natifs, couleurs conservées
//  2. giveaway : compteurs inline regroupés, jamais perdus
//  3. giveaway : ping en TextDisplay, allowedMentions conservé
//  4. giveaway : édition de fin de tirage en V2
//  5. guildEvents : eventPanel accepte rows + content, boutons DANS le conteneur
//  6. guildEvents : éphémère combiné au flag V2
//  7. Plus aucun `.embeds` extrait d'un payload V2 (cassait à coup sûr)
//  8. Garde-fous v220/v229/v230/v231/v232 toujours debout
//  9. Aucun secret ajouté + versionnage front v233
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v235-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const { MessageFlags } = require('discord.js');
const store = require('../server/db');
const ui = require('../server/discord/ui');
const giveaway = require('../server/discord/giveaway');
const guildEvents = require('../server/discord/guildEvents');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SEP = ui.SEPARATOR;
const cont = (p) => p.components[0].toJSON();
const txts = (p) => cont(p).components.filter((k) => k.type === 10).map((k) => k.content);
const allText = (p) => txts(p).join('\n');
const nDiv = (p) => cont(p).components.filter((k) => k.type === 14 && k.divider === true).length;
const rows = (p) => cont(p).components.filter((k) => k.type === 1);

const G = { prize: 'Nitro Boost', winners: 2, ends_at: Date.now() + 3600000 };

// ------------------------------------------------------------
console.log('\n1) giveaway — plus aucun trait texte, séparateurs natifs');
check('buildPanel exporté', typeof giveaway.buildPanel === 'function');
check('buildEndedPanel exporté', typeof giveaway.buildEndedPanel === 'function');
check('buildEmbed retiré (renommé)', giveaway.buildEmbed === undefined);
check('buildEndedEmbed retiré (renommé)', giveaway.buildEndedEmbed === undefined);
const gwSrc = read('server/discord/giveaway.js');
check('PLUS AUCUN ui.sectionize dans giveaway.js', !gwSrc.includes('ui.sectionize'));
check('EmbedBuilder retiré des imports', !gwSrc.split('\n').some((l) => l.includes('EmbedBuilder') && !l.trim().startsWith('//')));

const pDef = giveaway.buildPanel(G, {});
check('payload en Components V2', (pDef.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
check('aucun trait texte ━', !JSON.stringify(pDef).includes(SEP));
check('couleur par défaut conservée (or FEE75C)', cont(pDef).accent_color === 0xFEE75C);
const pPink = giveaway.buildPanel(G, { color: '#FF00FF', message: 'Message perso' });
check('couleur personnalisée conservée', cont(pPink).accent_color === 0xFF00FF);
check('message personnalisé conservé', allText(pPink).includes('Message perso'));
check('texte par défaut conservé', allText(pDef).includes('Réagissez avec 🎉'));
check('titre en « ## 🎁 Giveaway »', txts(pDef)[0] === '## 🎁 Giveaway');
check('tous les Separator en divider:true (pleine largeur)',
  cont(pDef).components.filter((k) => k.type === 14).every((k) => k.divider === true));
// 2 paragraphes (prix + message) + 1 bloc de compteurs = 3 blocs → 2 + 1 pied = 3.
check('3 séparateurs natifs (2 entre blocs + 1 pied)', nDiv(pDef) === 3);
const p2par = giveaway.buildPanel(G, { message: 'Réagissez avec 🎉 pour participer !\n\nSeuls les membres du serveur sont éligibles.' });
check('message utilisateur à 2 paragraphes → 4 séparateurs', nDiv(p2par) === 4);
check('les 2 paragraphes du message utilisateur sont conservés distincts',
  allText(p2par).includes('Réagissez avec 🎉 pour participer !') && allText(p2par).includes('Seuls les membres du serveur sont éligibles.'));

// ------------------------------------------------------------
console.log('\n2) giveaway — compteurs inline regroupés, jamais perdus');
const counters = txts(pDef).find((t) => t.includes('🏆 Nombre de gagnants'));
check('les 2 compteurs inline sont regroupés sur une ligne', !!counters && counters.includes(' · '));
check('nombre de gagnants conservé', counters.includes('**🏆 Nombre de gagnants** 2'));
check('fin du tirage conservée en timestamp Discord <t:…:R>', /\*\*⏰ Fin du tirage\*\* <t:\d+:R>/.test(counters));
check('formatEnds inchangé (compte à rebours relatif Discord)',
  giveaway.buildPanel({ ...G, ends_at: 1800000000000 }, {}) && allText(giveaway.buildPanel({ ...G, ends_at: 1800000000000 }, {})).includes('<t:1800000000:R>'));

// ------------------------------------------------------------
console.log('\n3) giveaway — ping en TextDisplay, allowedMentions conservé');
const pPing = giveaway.buildPanel(G, {}, '@everyone');
check('le ping devient le premier TextDisplay', txts(pPing)[0] === '@everyone');
check('payload sans champ content au niveau message (interdit en V2)', pPing.content === undefined);
check('séparateur entre le ping et le panneau', cont(pPing).components[1].type === 14);
check('allowedMentions toujours passé au send (lancement slash)',
  /allowedMentions: \{ roles: ping \? \[String\(ping\)\.replace\(\/<@&\|>\/g, ''\)\] : \[\], everyone: ping === '@everyone' \}/.test(gwSrc));
check('les 2 lancements passent par buildPanel(…, ping)',
  (gwSrc.match(/buildPanel\(\{ prize, winners, ends_at: endsAt \}, \{ color, message \}, ping\)/g) || []).length === 2);

// ------------------------------------------------------------
console.log('\n4) giveaway — édition de fin de tirage en V2');
const pEnd = giveaway.buildEndedPanel(G, [{ toString: () => '<@u1>' }, { toString: () => '<@u2>' }], false);
check('panneau final en Components V2', (pEnd.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
check('aucun trait texte ━', !JSON.stringify(pEnd).includes(SEP));
check('couleur verte (terminé)', cont(pEnd).accent_color === 0x57F287);
const pReroll = giveaway.buildEndedPanel(G, [{ toString: () => '<@u1>' }], true);
check('couleur or (nouveau tirage)', cont(pReroll).accent_color === 0xFEE75C);
check('titre « nouveau tirage » pour un reroll', txts(pReroll)[0].includes('nouveau tirage'));
check('3 sections conservées (prix / gagnants / merci)',
  ['**Nitro Boost**', '🏆 Gagnant(s) : <@u1> <@u2>', "Merci à tous d'avoir participé"].every((x) => allText(pEnd).includes(x)));
// 3 paragraphes + 1 bloc de compteurs = 4 blocs → 3 + 1 pied = 4.
check('4 séparateurs natifs sur le panneau final', nDiv(pEnd) === 4);
const pNoWin = giveaway.buildEndedPanel({ prize: 'X' }, [], false);
check('sans gagnant : mention « Aucun participant »', allText(pNoWin).includes('Aucun participant'));
check('message.edit reçoit le payload V2 (pas { embeds: [...] })',
  gwSrc.includes('await message.edit(buildEndedPanel(g, winners, reroll))')
  && !gwSrc.includes('message.edit({ embeds:'));
check('annonce des gagnants en v2panel avec mentions en tête',
  gwSrc.includes('...ui.v2panel({\n        content: winnerMentions || undefined,'));

// ------------------------------------------------------------
console.log('\n5) guildEvents — eventPanel(rows, content), boutons DANS le conteneur');
const geSrc = read('server/discord/guildEvents.js');
check('PLUS AUCUN ui.panel/ui.embed dans guildEvents.js',
  !geSrc.includes('ui.panel(') && !geSrc.includes('ui.embed('));
check('PLUS AUCUN ui.sectionize', !geSrc.includes('ui.sectionize'));
check('PLUS AUCUN `.embeds` extrait d’un payload (cassait à coup sûr)',
  !/eventPanel\([^)]*\)\.embeds/.test(geSrc));
check('eventPanel accepte rows et content', /function eventPanel\(entry, guildId, ev, rows = \[\], content = ''\)/.test(geSrc));

const uid = store.users.create('discord:233@discord.botdev', 'x', {});
const BOT = store.bots.create({ user_id: uid, name: 'Test233', token: 'T', client_id: '1', prefix: '!' });
const evId = store.guildEvents.add(BOT, 'G233', {
  title: 'Soirée jeux', description: 'On joue ensemble.', starts_at: Date.now() + 86400000,
  channel_id: 'C1', ping_role: 'none', created_by: 'U1',
});
store.guildEvents.toggleParticipant(evId, 'U1');
store.guildEvents.toggleParticipant(evId, 'U2');
const ev = store.guildEvents.get(evId);
const fakeEntry = { client: { guilds: { cache: { get: () => null } } } };
const fakeRow = { toJSON: () => ({ type: 1, components: [{ type: 2, custom_id: 'hxev:join:1', label: '🎮 Participer', style: 3 }] }) };

const pEv = guildEvents.eventPanel(fakeEntry, 'G233', ev, [fakeRow]);
check('panneau d’événement en Components V2', (pEv.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2);
check('aucun trait texte ━', !JSON.stringify(pEv).includes(SEP));
check('titre de l’événement conservé', txts(pEv)[0] === `## 🎮 ${ev.title}`);
check('les BOUTONS sont DANS le conteneur', rows(pEv).length === 1);
check('les 2 champs inline (Quand / Participants) regroupés sur une ligne',
  txts(pEv).some((t) => t.includes('🕒 Quand') && t.includes('👥 Participants') && t.includes(' · ')));
check('le nombre d’inscrits est correct', allText(pEv).includes('2 inscrit(s)'));
check('le champ Détails (non inline) a son propre bloc',
  txts(pEv).some((t) => t.startsWith('**📝 Détails**\n')));
check('le champ Liste des inscrits est présent', allText(pEv).includes('**📋 Liste**'));
check('pied avec l’ID de l’événement', txts(pEv).slice(-1)[0].includes(`ID ${ev.id}`));

const pReminder = guildEvents.eventPanel(fakeEntry, 'G233', ev, [fakeRow], '📣 **Soirée jeux** commence dans **24 h**');
check('le texte de rappel devient le premier TextDisplay',
  txts(pReminder)[0] === '📣 **Soirée jeux** commence dans **24 h**');
check('séparateur entre le rappel et le panneau', cont(pReminder).components[1].type === 14);
check('sans content → pas de bloc de tête en trop', txts(pEv)[0].startsWith('## 🎮'));

const evNoDesc = store.guildEvents.get(store.guildEvents.add(BOT, 'G233', {
  title: 'Sans description', starts_at: Date.now() + 86400000, channel_id: 'C1', ping_role: 'none', created_by: 'U1',
}));
check('événement sans inscrit : message d’attente conservé',
  allText(guildEvents.eventPanel(fakeEntry, 'G233', evNoDesc, [])).includes("Personne n'est inscrit pour le moment"));

// ------------------------------------------------------------
console.log('\n6) guildEvents — éphémère COMBINÉ au flag V2');
check('/event list : ephemeral passé DANS les options de v2panel',
  /ui\.v2panel\(\{ variant: 'brand', title: '🎮 Événements à venir'[\s\S]*?ephemeral: true \}\)/.test(geSrc));
check('/event list : plus de spread + ephemeral externe (écrasait flags)',
  !/\.\.\.ui\.panel\(\{ variant: 'brand', title: '🎮 Événements à venir'/.test(geSrc));
check('/event delete : ephemeral passé DANS les options',
  /const prompt = ui\.v2panel\(\{[\s\S]*?ephemeral: true,\s*\}\);/.test(geSrc));
check('/event delete : plus de { ...prompt, ephemeral: true }',
  !geSrc.includes('interaction.reply({ ...prompt, ephemeral: true })'));
// Preuve par le payload : les deux flags coexistent.
const both = ui.v2panel({ title: 'T', description: 'A', ephemeral: true });
check('les 2 flags coexistent bien dans un même payload',
  (both.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2
  && (both.flags & MessageFlags.Ephemeral) === MessageFlags.Ephemeral);

// ------------------------------------------------------------
console.log('\n7) Garde-fous des versions précédentes');
const ex = read('server/discord/extra.js');
check('v232 — premade.js : replyPanel toujours en v2panel', /send\(ui\.v2panel\(options, components\)\)/.test(read('server/discord/premade.js')));
check('v232 — suggest.js : buildPanel toujours exporté', typeof require('../server/discord/suggest').buildPanel === 'function');
check('v232 — queue.js : clé de dédoublonnage 3 familles', /'embed'[\s\S]*'v2'[\s\S]*'msg'/.test(read('server/queue.js')));
check('v232 — xp.js : exclusion toujours documentée', read('server/discord/xp.js').includes('⛔ EXCLUSION VOLONTAIRE'));
check('v231 — /quiz toujours en ui.v2panel', (ex.match(/ui\.v2panel\(/g) || []).length >= 2);
check('v231 — colorInt accepte les couleurs numériques', ui.colorInt(0x57f287) === 0x57f287);
check('v230 — /poll toujours en champs d’embed', /addFields\(fields\)/.test(ex));
check('v229 — mariage / pendu / morpion : >= 5 « sections: false »', (ex.match(/sections: false/g) || []).length >= 5);
check('v220 — advancedTickets : >= 3 SeparatorBuilder pleine largeur',
  (read('server/discord/advancedTickets.js').match(/addSeparatorComponents\(new SeparatorBuilder\(\)\.setDivider\(true\)\)/g) || []).length >= 3);
check('ui.panel classique toujours fonctionnel (messages non migrés)',
  ui.panel({ title: 'T', description: 'A\n\nB' }).embeds[0].data.description.includes(SEP));

// ------------------------------------------------------------
console.log('\n8) Aucun secret ajouté + versionnage front v233');
['server/discord/giveaway.js', 'server/discord/guildEvents.js'].forEach((f) => {
  check(`aucun token en dur dans ${path.basename(f)}`,
    !/(ghp_|github_pat_|rnd_|xox[baprs]-)[A-Za-z0-9_-]{15,}/.test(read(f)));
});
check('index.html : 7 références ?v=252', (read('public/index.html').match(/\?v=252/g) || []).length === 7);
check('index.html : plus aucune référence ?v=232', !read('public/index.html').includes('?v=232'));
check('sw.js : cache botdev-v241', read('public/sw.js').includes("const CACHE = 'botdev-v252';"));

console.log(failures === 0
  ? '\n✅ V233 — Lot n°3 : giveaways (5) et événements (7) en séparateurs natifs pleine largeur, édition de fin de tirage comprise.'
  : `\n❌ V233 — ${failures} échec(s)`);
process.exit(failures ? 1 : 0);
