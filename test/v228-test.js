// Test v2.28 — Robustesse : messages « partiels » Discord (auteur inconnu).
//
// Bug réel constaté en production (santé du bot, 05/09/2026) :
//   « Cannot read properties of null (reading 'tag') » (source : promesse)
// Cause : quand un message supprimé n'était pas dans le cache du bot (envoyé
// avant son démarrage, par exemple), Discord livre un message PARTIEL sans
// auteur. Le traqueur /snipe lisait `message.author.tag` → plantage silencieux
// remonté comme « promesse non gérée ».
//
// Garanties vérifiées ici :
//  1. trackDeleted ignore proprement un message partiel (auteur null)
//  2. trackDeleted ignore toujours les bots et les messages hors serveur
//  3. trackDeleted fonctionne toujours pour un vrai message (cache /snipe rempli)
//  4. Un auteur sans displayAvatarURL ne fait pas planter
//  5. Le journal des rôles temporaires (tasks.js) tolère un membre sans .user
//  6. Versionnage front cohérent (v228)
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v228-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const extra = require('../server/discord/extra');

let failures = 0;
function check(name, ok) {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  console.log('\n1) Message partiel (auteur null) → ignoré sans planter');
  const partial = { partial: true, guild: { id: 'G228' }, channel: { id: 'C1' }, author: null, content: null, attachments: null };
  let crashed = false;
  try { extra.trackDeleted(1, partial); } catch (e) { crashed = true; console.log('     ↳', e.message); }
  check('aucune exception sur un message partiel', !crashed);

  console.log('\n2) Filtres inchangés : bots et hors-serveur ignorés');
  crashed = false;
  try {
    extra.trackDeleted(1, { guild: { id: 'G228' }, channel: { id: 'C2' }, author: { bot: true, tag: 'Bot#0000', displayAvatarURL: () => '' }, content: 'x', attachments: { size: 0 } });
    extra.trackDeleted(1, { guild: null, channel: { id: 'C3' }, author: { tag: 'A#1', displayAvatarURL: () => '' }, content: 'x', attachments: { size: 0 } });
    extra.trackDeleted(1, null);
    extra.trackDeleted(1, { guild: { id: 'G228' }, channel: null, author: { tag: 'A#1' } });
  } catch (e) { crashed = true; console.log('     ↳', e.message); }
  check('bots / hors-serveur / null / sans salon : aucune exception', !crashed);

  console.log('\n3) Un vrai message supprimé alimente toujours /snipe');
  const { EmbedBuilder } = require('discord.js');
  extra.trackDeleted(1, {
    guild: { id: 'G228' }, channel: { id: 'C9' },
    author: { tag: 'Membre#1234', username: 'Membre', displayAvatarURL: () => 'https://cdn.example/a.png' },
    content: 'message secret', attachments: { size: 1 },
  });
  // On rejoue /snipe via le routeur d'interactions (comme le vrai bot) :
  // le cache doit contenir l'entrée que l'on vient de tracer.
  let replied = null;
  const user = { id: 'U1', tag: 'U#0001', username: 'U', bot: false, displayAvatarURL: () => '' };
  const interaction = {
    isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false,
    isModalSubmit: () => false, isRepliable: () => true, isAutocomplete: () => false,
    isAnySelectMenu: () => false, isUserSelectMenu: () => false, isRoleSelectMenu: () => false, isChannelSelectMenu: () => false,
    commandName: 'snipe', customId: '', values: [],
    user, member: { id: 'U1', user, permissions: { has: () => true }, roles: { cache: new Map() }, displayName: 'U' },
    guild: { id: 'G228', name: 'Serveur test', ownerId: 'owner', members: { me: { permissions: { has: () => true } } }, channels: { cache: new Map() }, roles: { cache: new Map() } },
    channel: { id: 'C9', name: 'general', isTextBased: () => true, send: async () => ({}) },
    client: { user: { id: 'bot1' } },
    options: { getUser: () => null, getString: () => null, getInteger: () => null, getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null, getMember: () => null },
    replied: false, deferred: false,
    reply: async function (payload) { this.replied = true; replied = payload; return {}; },
    deferReply: async function () { this.deferred = true; },
    editReply: async function (payload) { replied = payload; return {}; },
  };
  try { await extra.handleInteraction(1, {}, interaction); } catch (e) { console.log('     ↳', e.message); }
  const embed = replied && replied.embeds && replied.embeds[0];
  const json = embed ? (embed.toJSON ? embed.toJSON() : embed) : null;
  check('/snipe a répondu', !!replied);
  check('/snipe montre le bon auteur', !!json && json.author && json.author.name === 'Membre#1234');
  check('/snipe montre le contenu', !!json && json.description === 'message secret');
  void EmbedBuilder;

  console.log('\n4) Auteur sans displayAvatarURL → pas de plantage');
  crashed = false;
  try { extra.trackDeleted(1, { guild: { id: 'G228' }, channel: { id: 'C10' }, author: { username: 'Sans' }, content: 'ok', attachments: null }); }
  catch (e) { crashed = true; console.log('     ↳', e.message); }
  check('auteur minimal accepté', !crashed);

  console.log('\n5) tasks.js : plus de lecture directe de member.user.tag');
  const tasks = read('server/discord/tasks.js');
  check('aucun `${member.user.tag}` non protégé', !tasks.includes('${member.user.tag}'));
  check('repli sur username puis id présent', tasks.includes('member.user.tag || member.user.username')) ;

  console.log('\n6) extra.js : garde explicite sur l’auteur');
  const src = read('server/discord/extra.js');
  check('trackDeleted vérifie l’auteur avant lecture', /const author = message\.author;\s*\n\s*if \(!author \|\| author\.bot\) return;/.test(src));

  console.log('\n7) Versionnage front cohérent (v228)');
  const indexHtml = read('public/index.html');
  const swSource = read('public/sw.js');
  check('index.html : 7 références ?v=229', (indexHtml.match(/\?v=229/g) || []).length === 7);
  check('sw.js : cache v228', swSource.includes("const CACHE = 'botdev-v229';"));

  console.log(failures === 0 ? '\n✅ V228 — Messages partiels tolérés, /snipe intact, front v228.' : `\n❌ V228 — ${failures} échec(s)`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('❌ V228 — erreur inattendue :', e); process.exit(1); });
