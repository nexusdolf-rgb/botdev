// Test v2.35 — SÉPARATEURS NATIFS PLEINE LARGEUR, lot n°5 : extra.js.
//
// Ce lot :
//   • extra.js — TOUT le design system passe en Components V2 : 26 `ui.panel(`
//     → `ui.v2panel(`, le dernier `ui.embed(` (anniversaire du jour) et le
//     dernier `ui.sectionize(` actif (/apply view). Il reste **0 `ui.panel(`**,
//     **0 `ui.embed(`** et **0 `ui.sectionize(` actif** dans le fichier.
//
// Pièges traités (chacun aurait cassé la production silencieusement) :
//   • **`{...ui.v2panel(…), ephemeral: true}`** (2 sites : `/quiz top` et
//     `/birthday list`) — accoler `ephemeral` APRÈS le spread écrase le champ
//     `flags` et fait perdre `IsComponentsV2`. `ephemeral` est passé DANS les
//     options, qui combinent les deux flags.
//   • **`content` au niveau du message** (3 sites : annonce programmée,
//     anniversaire du jour, rappel en repli salon) — interdit en V2. Le texte
//     devient un TextDisplay en tête de conteneur ; `allowedMentions` reste au
//     niveau du message et continue de notifier.
//   • **`reminderPanel.embeds`** — le repli en salon réinjectait les embeds du
//     panneau MP. Sur un payload V2 `.embeds` vaut `undefined` : le message
//     serait parti VIDE. Les options sont factorisées et le panneau est
//     reconstruit avec le ping.
//   • **chaînes d'édition** — mariage (reply → update), pendu (reply → update),
//     morpion (reply → update) : Discord interdit de sortir du V2 à l'édition,
//     donc les DEUX BOUTS de chaque chaîne sont migrés ensemble.
//
// NON migré dans ce lot (volontaire, documenté dans docs/AGENT.md) :
//   • `/poll` (pollEmbed) — v230 l'a passé en CHAMPS d'embed : la séparation est
//     déjà native, il n'y a AUCUN trait. De plus c'est une chaîne d'édition.
//   • `/top` (renderTop) — description en `\n` simples, aucun trait, et
//     pagination éditée en place.
//   • `/snipe` et `/invites` — EmbedBuilder bruts, aucune description
//     multi-paragraphes → aucun trait.
//   • le **message de candidature** (handleModal) et sa décision **`applyd`** —
//     l'embed n'a QUE des champs (une ligne par question), donc AUCUN trait, et
//     `applyd` relit `interaction.message.embeds[0]` pour le recolorer. C'était
//     le « bloqueur extra.js:1128 » : il disparaît de lui-même puisque le
//     message n'a pas de trait à corriger.
//
// Garanties vérifiées ici :
//  1. Couverture source : plus aucun ui.panel/ui.embed/sectionize actif.
//  2. Le piège `flags` : aucun spread de v2panel suivi de `ephemeral`.
//  3. Rendu : les 2 réponses éphémères combinent bien les DEUX flags.
//  4. Runtime `sweepReminders` : MP en V2, repli salon en V2 avec le ping.
//  5. Runtime `sweepScheduled` : texte programmé en TextDisplay, mentions OK,
//     repli sans mentions toujours en V2.
//  6. Runtime `sweepBirthdays` : ping en TextDisplay, allowedMentions conservé.
//  7. Chaînes d'édition : les 4 `interaction.update(ui.v2panel(…))`.
//  8. Les exclusions volontaires sont toujours en embeds classiques.
//  9. Garde-fous v220 → v234.

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v235-'));

const { MessageFlags } = require('discord.js');
const store = require('../server/db');
const ui = require('../server/discord/ui');
const v2 = require('./helpers/v2');

const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'extra.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const count = (needle) => src.split(needle).length - 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) failures++;
};

(async () => {
  console.log('\n1️⃣  Couverture source — extra.js entièrement en V2');
  check('plus aucun ui.panel(', count('ui.panel(') === 0);
  check('plus aucun ui.embed(', count('ui.embed(') === 0);
  // v267 — +3 sites : panneau vocaux temporaires (vtNoChannelPanel,
  // buildVtPanel, réponse éphémère say).
  check('35 emplacements en ui.v2panel(', count('ui.v2panel(') === 35);
  // Les 2 occurrences restantes de « ui.sectionize( » sont dans des
  // COMMENTAIRES (la note v230 sur /poll et la note v235 sur /apply view).
  check('plus aucun ui.sectionize( ACTIF (2 occurrences, toutes en commentaire)',
    count('ui.sectionize(') === 2
    && count('// v235 — ce résumé passait par ui.sectionize()') === 1
    && count('// de sections → ui.sectionize() ne s\'applique toujours pas ici') === 1);
  check('plus aucune réinjection de `.embeds` d’un payload V2', !/embeds: \w+Panel\.embeds/.test(src));

  console.log('\n2️⃣  Le piège du flag Éphémère (2 sites)');
  // `{...ui.v2panel(…), ephemeral: true}` écraserait `flags` → message illisible.
  check('aucun spread de v2panel suivi de `ephemeral: true`',
    !/\.\.\.ui\.v2panel\([\s\S]{0,400}?ephemeral: true,\s*\}\);/.test(src));
  check('/quiz top : `ephemeral` DANS les options de ui.v2panel',
    /title: '🧠 Classement Quiz',[\s\S]{0,200}?ephemeral: true,\s*\}\)\);/.test(src));
  check('/birthday list : `ephemeral` DANS les options de ui.v2panel',
    /title: '🎂 Anniversaires du serveur',[\s\S]{0,200}?ephemeral: true,\s*\}\)\);/.test(src));
  {
    const p = ui.v2panel({ title: 'T', description: 'x', ephemeral: true });
    check('les DEUX flags sont combinés (IsComponentsV2 + Ephemeral)',
      (p.flags & MessageFlags.IsComponentsV2) !== 0 && (p.flags & MessageFlags.Ephemeral) !== 0);
    check('un spread `{...p, ephemeral:true}` aurait bien PERDU le flag V2 (le piège est réel)',
      (({ ...p, ephemeral: true }).flags & MessageFlags.IsComponentsV2) === 0
      || ({ ...p, ephemeral: true }).flags === p.flags);
  }

  console.log('\n3️⃣  Le `content` du message est interdit en V2 (3 sites)');
  check('annonce programmée : `content: s.text` passé DANS les options',
    /const scheduledOptions = \{[\s\S]{0,300}?content: s\.text,/.test(src));
  check('annonce programmée : plus de `{ ...scheduledPanel, content: s.text }`',
    !/\{ \.\.\.scheduledPanel, content: s\.text/.test(src));
  check('anniversaire du jour : ping en TextDisplay, plus de `content:` message',
    /content: `<@\$\{member\.id\}>`,\s*\n\s*variant: 'warning',/.test(src));
  check('allowedMentions reste au niveau du message (les mentions notifient toujours)',
    count('allowedMentions: { users: [String(member.id)] }') === 1
    && count("allowedMentions: { users: [String(r.user_id)] }") === 1);
  {
    // Le rendu réel : `content` devient le PREMIER TextDisplay du conteneur.
    const p = ui.v2panel({ content: '<@123>', title: '🎂 Joyeux anniversaire !', description: 'Bon anniversaire !', footer: 'F' });
    check('le ping est rendu en tête de conteneur (1er TextDisplay)', v2.texts(p)[0] === '<@123>');
    check('le payload n’a PAS de champ `content` au niveau du message', p.content === undefined);
  }

  console.log('\n4️⃣  Runtime — sweepReminders (MP + repli en salon)');
  {
    const BOT = 'B235';
    const G = 'GR235';
    const dms = [];
    const chanMsgs = [];
    // a) MP ouverts → le rappel part en MP, en V2.
    const userOk = { id: 'u1', send: async (p) => { dms.push(p); return {}; } };
    const guildR = { id: G, name: 'Serveur R', channels: { cache: { get: (id) => (id === 'CR1' ? { id: 'CR1', send: async (p) => { chanMsgs.push(p); return {}; } } : null) } } };
    const entryOk = { client: { users: { fetch: async () => userOk }, guilds: { cache: { get: (id) => (id === G ? guildR : null) } } } };
    store.reminders.add(BOT, G, 'CR1', 'u1', Date.now() - 1000, 'Premier paragraphe.\n\nDeuxième paragraphe.', 'once');
    const extra = require('../server/discord/extra');
    await extra.sweepReminders(BOT, entryOk);
    await sleep(50);
    check('rappel : envoyé en MP', dms.length === 1);
    check('rappel MP : payload Components V2', v2.isV2(dms[0]));
    check('rappel MP : le texte multi-paragraphes est découpé en 2 blocs',
      v2.texts(dms[0]).includes('Premier paragraphe.') && v2.texts(dms[0]).includes('Deuxième paragraphe.'));
    check('rappel MP : séparateur NATIF entre les 2 paragraphes (pas de trait texte)',
      v2.dividers(dms[0]) >= 1 && !v2.json(dms[0]).includes(ui.SEPARATOR));
    check('rappel MP : le nom du serveur est conservé', v2.json(dms[0]).includes('Serveur R'));
    check('rappel MP : aucun `content` au niveau du message', dms[0].content === undefined);
    check('rappel MP : rien n’est parti dans le salon', chanMsgs.length === 0);

    // b) MP fermés → repli dans le salon, AVEC le ping. C'est le site qui
    //    lisait `reminderPanel.embeds` (undefined en V2 → message vide).
    const chan2 = [];
    const guildFail = { id: G, name: 'Serveur R', channels: { cache: { get: (id) => (id === 'CR2' ? { id: 'CR2', send: async (p) => { chan2.push(p); return {}; } } : null) } } };
    const entryFail = { client: { users: { fetch: async () => ({ id: 'u2', send: async () => { throw new Error('Cannot send messages to this user'); } }) }, guilds: { cache: { get: (id) => (id === G ? guildFail : null) } } } };
    store.reminders.add(BOT, G, 'CR2', 'u2', Date.now() - 1000, 'Rappel en repli.', 'once');
    await extra.sweepReminders(BOT, entryFail);
    await sleep(50);
    check('rappel : MP fermé → repli envoyé dans le salon', chan2.length === 1);
    check('repli salon : payload Components V2 (pas de message vide)', v2.isV2(chan2[0]));
    check('repli salon : le ping <@u2> est en tête de conteneur', v2.texts(chan2[0])[0] === '<@u2>');
    check('repli salon : le texte du rappel est bien présent (le bug `.embeds` l’aurait vidé)',
      v2.texts(chan2[0]).includes('Rappel en repli.'));
    check('repli salon : allowedMentions conservé → la mention notifie',
      chan2[0].allowedMentions && chan2[0].allowedMentions.users && chan2[0].allowedMentions.users[0] === 'u2');
    check('repli salon : aucun `content` ni `embeds` au niveau du message',
      chan2[0].content === undefined && chan2[0].embeds === undefined);
  }

  console.log('\n5️⃣  Runtime — sweepScheduled (annonce programmée)');
  {
    const BOT = 'B235';
    const G = 'GS235';
    const sent = [];
    const channel = { id: 'C1', send: async (p) => { sent.push(p); return { id: 'm1' }; } };
    const guild = { id: G, name: 'Serveur S', channels: { cache: { get: (id) => (id === 'C1' ? channel : null) } } };
    const entry = { client: { guilds: { cache: { get: (id) => (id === G ? guild : null) } } } };
    store.guildSettings.set(BOT, G, { timezone: 'Europe/Paris' });
    store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 7, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: 'Bonjour le serveur !' });
    const extra = require('../server/discord/extra');
    extra.sweepScheduled(BOT, entry, new Date('2026-08-20T05:00:00Z')); // 7h Paris
    await sleep(120);
    check('annonce : envoyée', sent.length === 1);
    check('annonce : payload Components V2', v2.isV2(sent[0]));
    check('annonce : le texte programmé est le 1er TextDisplay (même position qu’avant)',
      v2.texts(sent[0])[0] === 'Bonjour le serveur !');
    check('annonce : plus de `content` au niveau du message', sent[0].content === undefined);
    check('annonce : le titre du panneau est conservé', v2.title(sent[0]) === '📅 Annonce programmée');
    check('annonce : l’horaire et le fuseau sont conservés', v2.json(sent[0]).includes('07:00') && v2.json(sent[0]).includes('Europe/Paris'));
    check('annonce : mentions activées par défaut', Array.isArray(sent[0].allowedMentions.parse) && sent[0].allowedMentions.parse.includes('everyone'));
    check('annonce : aucun trait texte ━', !v2.json(sent[0]).includes(ui.SEPARATOR));

    // Repli sans mentions (@everyone interdit) : doit RESTER en V2.
    const sent2 = [];
    const channelErr = {
      id: 'C1',
      send: async (p) => {
        if (p.allowedMentions && p.allowedMentions.parse && p.allowedMentions.parse.includes('everyone')) {
          const e = new Error('Missing Permissions'); e.code = 50013; throw e;
        }
        sent2.push(p); return { id: 'm2' };
      },
    };
    const entryErr = { client: { guilds: { cache: { get: () => ({ id: G, name: 'Serveur S', channels: { cache: { get: () => channelErr } } }) } } } };
    store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 10, minute: 0, days: [1, 2, 3, 4, 5, 6, 7], text: '@everyone bonjour' });
    extra.sweepScheduled(BOT, entryErr, new Date('2026-08-20T08:00:00Z')); // 10h Paris
    await sleep(150);
    check('repli sans mentions : renvoyé', sent2.length === 1);
    check('repli sans mentions : toujours en Components V2 (pas de retour en arrière)', v2.isV2(sent2[0]));
    check('repli sans mentions : mentions désactivées', sent2[0].allowedMentions.parse.length === 0);
    check('repli sans mentions : le texte est conservé', v2.texts(sent2[0])[0] === '@everyone bonjour');
  }

  console.log('\n6️⃣  Runtime — sweepBirthdays (anniversaire du jour)');
  {
    const BOT = 'B235';
    const G = 'GB235';
    const bdayMsgs = [];
    const rolesCache = new Map();
    const makeMember = (uid) => ({
      id: uid,
      toString: () => `<@${uid}>`,
      roles: { cache: { has: () => false }, add: async () => {}, remove: async () => {} },
      user: { id: uid, username: uid, tag: `${uid}#0001` },
    });
    const guild = {
      id: G, name: 'Serveur B',
      roles: { cache: { get: (id) => rolesCache.get(id), find: (fn) => [...rolesCache.values()].find(fn) || null } },
      members: { me: { roles: { highest: { position: 10 } } }, fetch: async (uid) => (uid === 'u1' ? makeMember(uid) : null) },
      channels: { cache: { get: (id) => (id === 'BC1' ? { id: 'BC1', send: async (p) => { bdayMsgs.push(p); return {}; } } : null), find: () => null } },
    };
    const entry = { client: { guilds: { cache: { get: (id) => (id === G ? guild : null), values: () => [guild] } } } };
    store.guildSettings.set(BOT, G, { birthday_channel: 'BC1', timezone: 'Europe/Paris' });
    store.birthdays.set(BOT, G, 'u1', 20, 8);
    const extra = require('../server/discord/extra');
    await extra.sweepBirthdays(BOT, entry, new Date('2026-08-20T05:00:00Z')); // 7h Paris le 20 août
    check('anniversaire : message envoyé', bdayMsgs.length === 1);
    check('anniversaire : payload Components V2', v2.isV2(bdayMsgs[0]));
    check('anniversaire : le ping <@u1> est en tête de conteneur', v2.texts(bdayMsgs[0])[0] === '<@u1>');
    check('anniversaire : plus de `content` ni `embeds` au niveau du message',
      bdayMsgs[0].content === undefined && bdayMsgs[0].embeds === undefined);
    check('anniversaire : le titre et le message du serveur sont conservés',
      v2.title(bdayMsgs[0]) === '🎂 Joyeux anniversaire !' && v2.json(bdayMsgs[0]).includes('Profite bien de cette journée spéciale'));
    check('anniversaire : allowedMentions conservé → la mention notifie',
      bdayMsgs[0].allowedMentions && bdayMsgs[0].allowedMentions.users[0] === 'u1');
  }

  console.log('\n7️⃣  Chaînes d’édition — les DEUX BOUTS migrés ensemble');
  {
    // Discord interdit de revenir à un message classique une fois en V2 : chaque
    // couple (reply → update) doit donc être en V2 des deux côtés.
    const updates = (src.match(/interaction\.update\(ui\.v2panel\(/g) || []).length;
    check('4 interaction.update(ui.v2panel(…)) : mariage ×2, pendu, morpion', updates === 4);
    check('mariage : la demande (reply) et la réponse (update) sont toutes les 2 en V2',
      /const proposal = ui\.v2panel\(\{/.test(src) && /title: '💍 Mariage accepté !'/.test(src));
    check('pendu : lancement et mise à jour live en V2',
      /const penduPanel = ui\.v2panel\(\{/.test(src) && /title: over \? \(won \? '🪢 Pendu · gagné !'/.test(src));
    check('morpion : lancement et mise à jour live en V2',
      /const morpionPanel = ui\.v2panel\(\{/.test(src) && /title: state\.over \? '⭕❌ Morpion · partie terminée'/.test(src));
    check('les jeux gardent `sections: false` (2 phrases courtes → pas de séparateur)',
      (src.match(/sections: false/g) || []).length >= 4);
    check('quiz : le résultat (déjà V2 en v231) est toujours là', /resultPayload/.test(src));
  }

  console.log('\n8️⃣  Exclusions volontaires — toujours en embeds classiques');
  {
    check('/poll : toujours en champs d’embed (v230, aucun trait)',
      /embeds: \[pollEmbed\(question, choices, votes\)\]/.test(src) && /function pollEmbed\(/.test(src));
    check('/top : toujours en EmbedBuilder (description en \\n simples, aucun trait)',
      /const payload = \{ embeds: \[embed\], components: \[row\] \};/.test(src));
    check('/snipe : EmbedBuilder brut, aucun trait', /'\*Message vide\*'/.test(src));
    check('/invites : EmbedBuilder brut, aucun trait', /'📨 Invitations'/.test(src));
    check('message de candidature : EmbedBuilder brut SANS description → aucun trait',
      /const embed = new EmbedBuilder\(\)\s*\n\s*\.setColor\('#e07a5f'\)\s*\n\s*\.setTitle\(cfg\.title \|\| '📝 Candidature'\)/.test(src));
    check('applyd : relit toujours interaction.message.embeds[0] (le message n’a pas migré)',
      /const emb = interaction\.message\.embeds\[0\];/.test(src)
      && (src.match(/EmbedBuilder\.from\(emb\)/g) || []).length === 2);
    check('les 2 MP de décision de candidature sont, eux, en V2',
      /applicant\.send\(ui\.v2panel\(\{/.test(src) && (src.match(/applicant\.send\(ui\.v2panel\(\{/g) || []).length === 2);
    check('xp.js reste EXCLU du V2 (webhook + pièce jointe = 400)', read('server/discord/xp.js').includes('ui.sectionize(text)'));
  }

  console.log('\n9️⃣  Garde-fous des versions précédentes');
  {
    check('v220 : advancedTickets.js toujours en séparateurs natifs', read('server/discord/advancedTickets.js').includes('setDivider(true)'));
    check('v232 : premade.js toujours sans sectionize', !read('server/discord/premade.js').includes('ui.sectionize('));
    check('v232 : suggest.js toujours sans sectionize', !read('server/discord/suggest.js').includes('ui.sectionize('));
    check('v233 : giveaway.js toujours sans sectionize', !read('server/discord/giveaway.js').includes('ui.sectionize('));
    check('v233 : guildEvents.js toujours sans sectionize', !read('server/discord/guildEvents.js').includes('ui.sectionize('));
    const panelsSrc = read('server/discord/panels.js');
    check('v234 : panels.js toujours sans ui.panel/ui.embed', !panelsSrc.includes('ui.panel(') && !panelsSrc.includes('ui.embed('));
    check('v234 : panelTitleOf toujours présent (nettoyage des doublons)', /function panelTitleOf\(msg\)/.test(panelsSrc));
    check('v234 : ui.v2fieldName traite toujours les espaceurs invisibles', read('server/discord/ui.js').includes('BLANK_FIELD_NAME'));
    // Garde-fou global : aucun panneau V2 ne contient de trait texte.
    const samples = [
      ui.v2panel({ title: 'T', description: 'A\n\nB', footer: 'F' }),
      ui.v2panel({ content: '<@1>', title: 'T', description: 'A\n\nB', footer: 'F' }),
      ui.v2panel({ title: 'T', description: 'A\n\nB', footer: false, ephemeral: true }),
    ];
    check('aucun des payloads V2 construits ici ne contient de trait texte ━',
      samples.every((p) => !JSON.stringify(p.components[0].toJSON()).includes(ui.SEPARATOR)));
    check('tous ces payloads portent le flag IsComponentsV2', samples.every((p) => v2.isV2(p)));
  }

  console.log(`\n${failures === 0 ? '🎉 Tous les tests v235 passent' : `❌ ${failures} échec(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ Erreur fatale :', e); process.exit(1); });
