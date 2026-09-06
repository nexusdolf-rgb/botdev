// ============================================================================
// Test v236 — DERNIER LOT de la migration « trait texte ━ » → Components V2.
//
// Objectif utilisateur (inchangé depuis v229) : « le trait du quiz et le panneau
// du Système de tickets personnalisés ne sont pas à la même longueur » → tous
// les panneaux doivent utiliser le séparateur NATIF pleine largeur du panneau de
// tickets (advancedTickets.js), jamais un trait texte.
//
// v231 quiz · v232 premade · v233 suggest/giveaway · v234 guildEvents/panels ·
// v235 extra.js · **v236 : les 16 derniers emplacements répartis sur 12 fichiers**
// (logging, liveWatch, community, engine, roleWizard, panelCommands,
//  profileCommands, profileWizard, automod, announcements, tasks, events).
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const v2 = require('./helpers/v2');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v236-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const ui = require('../server/discord/ui');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', f), 'utf8');
// Compte les occurrences RÉELLES d'un appel (les mentions dans les commentaires
// explicatifs v236 ne doivent pas fausser l'inventaire).
const codeOnly = (f) => src(f).split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// Un vrai bot en base : runJoinEvent/runLeaveEvent lisent store.bots.get(botId).
const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
const GUILD = 'G236';

// Les envois testés sont asynchrones : tout le scénario est dans une fonction.
async function main() {

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) Inventaire : plus aucun trait texte ni embed classique actif');
// ═══════════════════════════════════════════════════════════════════════════
// `ui.panel()` et `ui.embed()` produisent des EMBEDS classiques : leur largeur
// dépend de l'écran et un trait texte n'y atteint jamais les bords arrondis.
// Après v236 il ne doit plus en rester UN SEUL dans le code exécuté.
const FICHIERS = ['logging.js', 'liveWatch.js', 'community.js', 'engine.js', 'roleWizard.js',
  'panelCommands.js', 'profileCommands.js', 'profileWizard.js', 'automod.js',
  'announcements.js', 'tasks.js', 'events.js'];
for (const f of FICHIERS) {
  const code = codeOnly(f);
  check(`${f} : plus aucun ui.panel() / ui.embed()`,
    !/ui\.panel\(/.test(code) && !/ui\.embed\(/.test(code),
    (code.match(/ui\.(panel|embed)\(/g) || []).join(', '));
}
// Les 3 appels ui.sectionize() restants sont des EXCLUSIONS VOLONTAIRES :
// ils sont tous dans des messages envoyés AVEC une pièce jointe par webhook
// (V2 + webhook + files = 400 BAD REQUEST) ou dans un assistant multi-étapes.
const RESTANTS = FICHIERS.concat(['xp.js', 'panels.js', 'extra.js', 'premade.js'])
  .map((f) => ({ f, n: (codeOnly(f).match(/ui\.sectionize\(/g) || []).length }))
  .filter((x) => x.n > 0);
check('seuls panels.js (assistant) et xp.js (carte de niveau) gardent ui.sectionize — events.js n’en a plus (v240)',
  RESTANTS.map((x) => `${x.f}:${x.n}`).sort().join(' ') === 'panels.js:1 xp.js:1',
  JSON.stringify(RESTANTS));
console.log('✅ inventaire : 0 ui.panel / 0 ui.embed / 2 ui.sectionize documentés (events.js nettoyé en v240)');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) Annonce personnalisée (announcements.js) — buildPanel / buildPayload');
// ═══════════════════════════════════════════════════════════════════════════
const announcements = require('../server/discord/announcements');
check('buildEmbed renommé en buildPanel et exporté', typeof announcements.buildPanel === 'function'
  && announcements.buildEmbed === undefined);
store.customAnnouncements.set(BOT, GUILD, {
  name: 'Grande nouvelle', title: '📣 Ouverture', message: 'Le serveur ouvre ce soir !\n\nPréparez vos rôles.',
  color: '#57F287', footer: 'Hoxera · Communauté', image_url: 'https://hoxera.is-a.dev/a.png',
});
const cfg = store.customAnnouncements.get(BOT, GUILD);
const sansPing = announcements.buildPayload(cfg, { name: 'Serveur test' }, []);
check('sans rôle pingé : payload Components V2', v2.isV2(sansPing));
check('sans rôle pingé : titre + les 2 paragraphes séparés nativement',
  v2.title(sansPing) === '📣 Ouverture' && v2.dividers(sansPing) >= 1
  && v2.texts(sansPing).includes('Le serveur ouvre ce soir !')
  && v2.texts(sansPing).includes('Préparez vos rôles.'));
check('sans rôle pingé : aucun trait texte ━', !v2.json(sansPing).includes(ui.SEPARATOR));
check('sans rôle pingé : image en MediaGallery + couleur d\'accent',
  v2.mediaUrls(sansPing).includes('https://hoxera.is-a.dev/a.png') && v2.accentColor(sansPing) === 0x57F287);
check('sans rôle pingé : aucun content au niveau message (interdit en V2)', sansPing.content === undefined);

const avecPing = announcements.buildPayload(cfg, { name: 'Serveur test' }, ['R1', 'R2']);
check('avec rôles pingés : le ping devient un TextDisplay en tête de conteneur',
  v2.texts(avecPing)[0] === '<@&R1> <@&R2>');
check('avec rôles pingés : allowedMentions conservé au niveau message (notification réelle)',
  JSON.stringify(avecPing.allowedMentions) === JSON.stringify({ roles: ['R1', 'R2'], users: [], parse: [] }));
check('avec rôles pingés : séparateur natif après le ping', v2.dividers(avecPing) >= 2);
console.log('✅ annonces : V2 + ping en tête + mentions toujours notifiées');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) Journal de modération (logging.js) — envoyé réellement');
// ═══════════════════════════════════════════════════════════════════════════
const logging = require('../server/discord/logging');
let logPayload = null;
const logChannel = {
  id: 'CLOG', name: 'logs', isTextBased: () => true,
  send: async (p) => { logPayload = p; return { id: 'M1' }; },
};
const logGuild = {
  id: GUILD, name: 'Serveur test',
  channels: { cache: { get: () => undefined, find: () => logChannel } },
};
store.guildSettings.set(BOT, GUILD, { log_channel: 'logs' });
await logging.log(BOT, logGuild, {
  title: '🛡️ Auto-modération',
  description: 'Message supprimé.\n\nMotif : lien interdit.',
  fields: [{ name: '👤 Membre', value: '<@U1>', inline: true }, { name: '📋 Règle', value: 'liens', inline: true }],
  color: '#ED4245',
});
check('journal : payload Components V2 (plus d\'embed)', logPayload && v2.isV2(logPayload));
check('journal : titre + les 2 paragraphes de la description séparés nativement',
  v2.title(logPayload) === '🛡️ Auto-modération' && v2.dividers(logPayload) >= 1
  && v2.texts(logPayload).includes('Message supprimé.') && v2.texts(logPayload).includes('Motif : lien interdit.'));
check('journal : les champs sont rendus (libellé + valeur)',
  v2.json(logPayload).includes('👤 Membre') && v2.json(logPayload).includes('<@U1>')
  && v2.json(logPayload).includes('📋 Règle'));
check('journal : aucun trait texte ━', !v2.json(logPayload).includes(ui.SEPARATOR));
check('journal : plafond de 40 composants respecté', v2.componentCount(logPayload) <= 40,
  `${v2.componentCount(logPayload)} composants`);
console.log('✅ journal : V2, séparateurs natifs, champs conservés');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) Bienvenue / départ (events.js) — le piège webhook + pièce jointe');
// ═══════════════════════════════════════════════════════════════════════════
const events = require('../server/discord/events');
const identity = require('../server/discord/identity');
const sendAsProfileOriginal = identity.sendAsProfile;
let sentPayloads = [];
// On intercepte l'envoi « au nom du bot » : en production il passe par webhook,
// ici on capture simplement le payload pour l'inspecter.
identity.sendAsProfile = async (_bot, _botId, _guild, _channel, payload) => {
  sentPayloads.push(payload);
  if (process.env.DBG) console.log('>>> APPEL sendAsProfile depuis :', new Error('x').stack.split('\n').slice(2,4).map((l)=>l.trim()).join(' <- '));
  return { id: 'MSG' };
};
const member = (partial) => ({
  id: 'U9', partial: !!partial,
  // `createdTimestamp` alimente le compteur « 📅 Compte créé » du panneau.
  user: partial ? undefined : { id: 'U9', tag: 'Alice#0001', username: 'Alice', bot: false, createdTimestamp: Date.now() - 30 * 86400000, displayAvatarURL: () => 'https://cdn.discordapp.com/a.png' },
  guild: {
    id: GUILD, name: 'Serveur test', memberCount: 42, iconURL: () => null,
    channels: { cache: { get: () => undefined, find: () => ({ id: 'CEV', name: 'accueil', isTextBased: () => true, send: async (p) => { sentPayloads.push(p); return { id: 'M' }; } }) } },
    roles: { cache: { find: () => null } },
  },
  roles: { cache: [] },
  joinedTimestamp: Date.now() - 86400000,
});

// --- 4a. DÉPART : jamais de pièce jointe → toujours Components V2 ---
// store.events.set(botId, guildId, type, enabled, config) — `enabled` est un
// argument séparé, pas une clé de l'objet de configuration.
store.events.set(BOT, GUILD, 'member_leave', true,
  { channel: 'accueil', message: 'Alice nous quitte.\n\nBonne continuation !', plain: false });
sentPayloads = [];
await events.runLeaveEvent(BOT, member(false), { test: true });
check('départ : un payload envoyé', sentPayloads.length === 1, `${sentPayloads.length}`);
check('départ : Components V2', v2.isV2(sentPayloads[0]));
check('départ : auteur + les 2 paragraphes séparés nativement',
  v2.json(sentPayloads[0]).includes("Alice nous quitte.") && v2.dividers(sentPayloads[0]) >= 1
  && v2.texts(sentPayloads[0]).includes('Bonne continuation !'));
check('départ : aucun trait texte ━', !v2.json(sentPayloads[0]).includes(ui.SEPARATOR));
check('départ : aucune pièce jointe (webhook + V2 compatible)',
  sentPayloads[0].files === undefined && sentPayloads[0].attachments === undefined);

// --- 4b. ARRIVÉE sans carte (réglage par défaut) → Components V2 ---
store.events.set(BOT, GUILD, 'member_join', true,
  { channel: 'accueil', message: 'Bienvenue Alice !\n\nLis le règlement.', plain: false, card: false });
sentPayloads = [];
await events.runJoinEvent(BOT, member(false), { test: true });
// L'arrivée écrit AUSSI une ligne dans le journal de modération (logging.js),
// et le salon mocké est le même pour les deux : on isole donc le panneau de
// bienvenue parmi les payloads capturés.
const welcome = sentPayloads.find((p) => v2.json(p).includes('Bienvenue sur'));
const journal = sentPayloads.find((p) => v2.json(p).includes('Journa'));
check('arrivée sans carte : le panneau de bienvenue est envoyé', !!welcome);
check('arrivée sans carte : Components V2', welcome && v2.isV2(welcome));
check('arrivée sans carte : les 2 paragraphes séparés nativement',
  welcome && v2.texts(welcome).includes('Bienvenue Alice !') && v2.texts(welcome).includes('Lis le règlement.')
  && v2.dividers(welcome) >= 1);
// v241 — l'intitulé « Vous êtes le membre » + la valeur « n°42 » formaient une
// phrase coupée en deux. Devenu « Membre n° » + « 42 ». La rubrique est en outre
// SUPPRIMÉE si le message configuré contient déjà {count} (fin du doublon).
check('arrivée sans carte : les compteurs (n° membre + âge du compte) sont rendus',
  welcome && v2.json(welcome).includes('👥 Membre n°') && v2.json(welcome).includes('**42**')
  && v2.json(welcome).includes('📅 Compte créé'));
check('arrivée sans carte : l\'avatar est porté par la vignette, jamais répété',
  welcome && v2.thumbnailUrls(welcome).includes('https://cdn.discordapp.com/a.png')
  && !(v2.author(welcome) || '').includes('https://'));
check('arrivée sans carte : aucune pièce jointe (webhook + V2 compatible)',
  welcome && welcome.files === undefined);
check('arrivée sans carte : aucun trait texte ━', welcome && !v2.json(welcome).includes(ui.SEPARATOR));
check('arrivée sans carte : la ligne de journal est, elle aussi, en V2',
  journal && v2.isV2(journal) && !v2.json(journal).includes(ui.SEPARATOR));

// --- 4c. Le branchement « carte image » est bien présent dans le code ---
// Générer une vraie carte exigerait sharp + une image de fond ; on vérifie le
// garde-fou au niveau du code : c'est lui qui évite le 400 BAD REQUEST.
const evSrc = src('events.js');
check('arrivée AVEC carte + webhook : l\'embed classique est conservé (V2 + webhook + files = 400)',
  evSrc.includes('welcomePayload = { embeds: [embed], files };'));
check('arrivée AVEC carte : le branchement dépend de la carte ET du webhook (v240)',
  evSrc.includes('const carteV2 = files.length && !viaWebhook;')
  && evSrc.includes('if (!files.length || carteV2) {'));
check('arrivée AVEC carte : le piège est documenté dans le code',
  evSrc.includes('files = 400 BAD REQUEST'));
check('arrivée : les 3 compteurs sont partagés par les 2 rendus (welcomeFields)',
  evSrc.includes('const welcomeFields = [') && evSrc.includes('.addFields(...welcomeFields)')
  && evSrc.includes('fields: welcomeFields,'));
console.log('✅ arrivée/départ : V2 par défaut, embed classique uniquement si carte image + webhook');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n5) Garde-fous sur les pièges déjà rencontrés');
// ═══════════════════════════════════════════════════════════════════════════
// Piège v233/v235 : `{ ...ui.v2panel(…), ephemeral: true }` écrase `flags`.
const tasksSrc = src('tasks.js');
check('tasks.js : ephemeral passé DANS les options (pas après le spread)',
  /ui\.v2panel\(\{[\s\S]{0,900}ephemeral: true,\n\s*\}\)\);/.test(tasksSrc)
  && !tasksSrc.includes('ephemeral: true,\n  });'));
// Piège v236 : dans un assistant, `components: []` viderait le conteneur V2.
const rwSrc = src('roleWizard.js');
// ⚠️ Les autres `components: []` de roleWizard.js sont LÉGITIMES : ce sont les
// étapes de l'assistant (messages classiques à boutons), pas l'accusé final.
// On ne vérifie donc que l'editReply qui porte le conteneur V2.
const rwReceipt = (rwSrc.match(/editReply\(\{\s*\.\.\.ui\.v2panel\([\s\S]{0,700}?\}\);/) || [''])[0];
check('roleWizard.js : l\'accusé de réception V2 ne vide pas `components` (viderait le conteneur)',
  rwReceipt.length > 0 && !rwReceipt.includes('components: []'), rwReceipt.slice(0, 100));
check('roleWizard.js : l\'editReply nettoie content + embeds du message précédent',
  rwSrc.includes('content: null, embeds: [],'));
// Piège V2 : le ping ne peut pas rester dans le `content` du message.
const amSrc = src('automod.js');
check('automod.js : le ping de blacklist est un TextDisplay (option content du conteneur)',
  amSrc.includes('content: `<@${userId}>`') && !/send\(\{\n\s*content: `<@\$\{userId\}>`,\n\s*embeds:/.test(amSrc));
check('automod.js : allowedMentions conservé pour notifier réellement',
  amSrc.includes('allowedMentions: { users: [userId] }'));
const lwSrc = src('liveWatch.js');
check('liveWatch.js : le ping @here est passé en option `content` du conteneur',
  lwSrc.includes("content: ping || ''") && lwSrc.includes("allowedMentions: { parse: ping ? ['everyone'] : [] }"));
check('liveWatch.js : le lien du live (perdu avec author.url) est porté par un bouton',
  lwSrc.includes('.setStyle(ButtonStyle.Link)') && lwSrc.includes('Regarder le live'));
// Piège V2 : `content` + `embeds` interdits au niveau message.
const comSrc = src('community.js');
check('community.js : l\'édition du starboard nettoie content + embeds + attachments',
  comSrc.includes('content: null, embeds: [], attachments: []'));
check('community.js : le même panneau sert à la publication ET à l\'édition',
  (comSrc.match(/ui\.v2panel\(starOptions\)/g) || []).length === 2);
console.log('✅ garde-fous : flags éphémères, composants, pings et chaînes d\'édition');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n6) Aucun secret ajouté');
// ═══════════════════════════════════════════════════════════════════════════
const modifs = FICHIERS.map((f) => `server/discord/${f}`).concat(['test/v236-test.js', 'test/helpers/v2.js']);
const SECRET = /(ghp_|github_pat_|rnd_|xox[baprs]-)[A-Za-z0-9_-]{15,}/;
const fuites = modifs.filter((f) => SECRET.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
check('aucun token en dur dans les fichiers modifiés', fuites.length === 0, fuites.join(', '));

identity.sendAsProfile = sendAsProfileOriginal;
try { store.db.close(); } catch {}
fs.rmSync(DATA_DIR, { recursive: true, force: true });

}

main().then(() => {
  console.log(`\n${echecs === 0 ? '🎉' : '❌'} V236 — ${echecs} échec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
}).catch((e) => { console.error('💥 Erreur fatale du test :', e); process.exit(1); });
