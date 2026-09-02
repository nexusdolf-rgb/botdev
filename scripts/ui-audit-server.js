// ============================================================
// Serveur d'audit UI (dev uniquement, jamais en prod)
// ------------------------------------------------------------
// Monte le vrai dashboard (routes + statiques) sur une copie de
// la base, avec un CLIENT DISCORD SIMULÉ riche (salons, rôles,
// membres aux noms volontairement très longs = pires cas de
// débordement) pour auditer le rendu mobile + desktop.
//
// Usage : BOTDEV_DATA_DIR=<dossier> PORT=3100 node scripts/ui-audit-server.js
// ============================================================
process.env.BOTDEV_DATA_DIR = process.env.BOTDEV_DATA_DIR || '/home/user/ui-audit';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const store = require('../server/db');
const security = require('../server/security');
const routes = require('../server/routes');
const botManager = require('../server/discord/botManager');

// Convertit un ID court du mock en vrai ID Discord (19 chiffres) : le rendu
// des mentions <#id> côté dashboard exige des IDs de 15 à 21 chiffres, comme
// en production. Sans cela, l'audit ne reproduit pas le chemin réel.
const lid = (n) => '9'.repeat(3) + String(n).padStart(16, '0');

// ------------------------------------------------------------
// Fabrique un faux salon Discord
// ------------------------------------------------------------
function chan(id, name, type) {
  return { id: lid(id), name, type, parentId: type === 0 ? 'cat1' : null, position: 0 };
}

// ------------------------------------------------------------
// Fabrique un faux rôle Discord
// ------------------------------------------------------------
function role(id, name, position, color = 0) {
  return { id: lid(id), name, position, color, hexColor: '#' + color.toString(16).padStart(6, '0') };
}

// ------------------------------------------------------------
// Fabrique un faux membre
// ------------------------------------------------------------
function member(id, username, guild, joinedDaysAgo = 100, roleIds = []) {
  const longUserId = lid(id);
  const user = {
    id: longUserId,
    username,
    globalName: username,
    displayName: username,
    discriminator: '0001',
    bot: false,
    avatar: '',
    displayAvatarURL: (o) => 'https://cdn.discordapp.com/avatars/' + id + '/a.png',
    toString: () => `<@${id}>`,
  };
  const roles = new Map();
  for (const r of roleIds) {
    const longRoleId = lid(r);
    if (guild.roles.cache.has(longRoleId)) roles.set(longRoleId, guild.roles.cache.get(longRoleId));
  }
  const highest = [...roles.values()].sort((a, b) => b.position - a.position)[0] || { id: '0', name: '@everyone', position: 0, hexColor: '#99AAB5' };
  return {
    id: longUserId,
    user,
    displayName: username,
    nickname: null,
    joinedAt: new Date(Date.now() - joinedDaysAgo * 86400000),
    roles: { cache: roles, highest },
    displayAvatarURL: (o) => user.displayAvatarURL(o),
    toString: () => `<@${longUserId}>`,
  };
}

// ------------------------------------------------------------
// Fabrique un faux serveur Discord (pires cas de longueur)
// ------------------------------------------------------------
function makeGuild(id, name, { big = false } = {}) {
  const channels = new Map();
  const roles = new Map();
  const members = new Map();

  // Rôles : certains très longs (pires cas)
  const roleDefs = [
    ['1001', 'Administrateur', 10],
    ['1002', 'Modération - Équipe Support Premium', 9],
    ['1003', 'Staff Candidatures & Recrutement RP', 8],
    ['1004', 'Membre VIP · Accès aux salons exclusifs', 7],
    ['1005', 'Boosteur Niveau 3 — Merci pour votre soutien !', 6],
    ['1006', 'Joueur Confirmé (ancien combattant)', 5],
    ['1007', 'Nouveau Membre', 1],
  ];
  for (const [rid, rname, rpos] of roleDefs) roles.set(lid(rid), role(rid, rname, rpos));

  // Salons : textes, vocaux, catégories, avec de longs noms
  const textChans = big ? [
    ['2001', '📢-annonces-importantes-du-serveur-officiel', 0],
    ['2002', '📣-communications-communautaires-et-partenariats', 0],
    ['2003', '👋-présentations-des-nouveaux-arrivants-bienvenue', 0],
    ['2004', '💬-discussion-générale-bavardage-libre-et-amical', 0],
    ['2005', '🎮-discussions-jeux-vidéo-et-live-streaming', 0],
    ['2006', '🎟️-ouvertures-de-tickets-support-technique', 0],
    ['2007', '🤖-commandes-et-bots-divertissement', 0],
    ['2008', '📸-partage-de-créations-screenshots-et-montages', 0],
    ['2009', '🎵-musique-partage-de-playlists-et-recommandations', 0],
    ['2010', '🌍-annonces-internationales-multi-langues', 0],
    ['2011', '🧪-salon-de-test-des-bots-et-commandes', 0],
    ['2012', '🛠️-remontées-de-bugs-et-demandes-d-amélioration', 0],
    ['2013', '📋-candidatures-rôleplay-emplois-du-serveur', 0],
    ['2014', '🎉-événements-speciaux-concours-et-sorties', 0],
  ] : [
    ['2001', '📢-annonces', 0],
    ['2002', '💬-général', 0],
    ['2003', '🤖-commandes', 0],
    ['2004', '🎟️-tickets-support', 0],
  ];
  const voiceChans = big ? [
    ['3001', '🔊 Salon vocal général des membres', 2],
    ['3002', '🎮 Vocal Jeux & Streaming Coopératif', 2],
    ['3003', '🎧 Vocal Musique et Ambiance Chill', 2],
  ] : [['3001', '🔊 Général', 2]];
  const categoryChans = [
    ['4001', 'INFORMATIONS OFFICIELLES DU SERVEUR', 4],
    ['4002', 'COMMUNAUTÉ & DISCUSSION', 4],
    ['4003', 'VOCAUX', 4],
  ];
  for (const [cid, cname, ctype] of [...textChans, ...voiceChans, ...categoryChans]) channels.set(lid(cid), chan(cid, cname, ctype));

  // Membres : noms variés (longs, accents, emojis, Unicode)
  const memberDefs = big ? [
    ['5001', 'ZedZed_KarachoLeGrandChef', 10, ['1001']],
    ['5002', 'AlexandraDuSudOuest', 200, ['1002', '1003']],
    ['5003', 'Jean-Michel Le Sans-Faute Officiel', 30, ['1006']],
    ['5004', 'ミクサ_サポートロボ', 400, ['1002']],
    ['5005', 'Maxime RP - Membre Fondateur Historique', 90, ['1006', '1005']],
    ['5006', '𝒮𝓉𝓎𝓁𝒾𝓈𝓉𝓊𝒹𝒾ℴ', 120, ['1004']],
    ['5007', 'SansPseudonyme1', 5, ['1007']],
    ['5008', 'UnMembreAvecUnTrèsTrèsLongPseudonyme', 15, ['1007']],
    ['5009', 'Gamer_Pro_2287', 45, ['1007', '1006']],
    ['5010', 'Élise Été 2026 (vacances)', 60, ['1007']],
    ['5011', 'Staff-Asistant#001', 300, ['1002', '1003']],
    ['5012', 'Le Candidat Numéro Un Officiel', 8, ['1007']],
  ] : [
    ['5001', 'ZedZed_Karacho', 10, ['1001']],
    ['5002', 'Alex', 200, ['1002']],
    ['5003', 'Max', 90, ['1006']],
    ['5004', 'BotTest', 5, ['1007']],
  ];
  for (const [mid, mname, days, rids] of memberDefs) members.set(lid(mid), member(mid, mname, { roles: { cache: roles } }, days, rids));

  return {
    id: String(id),
    name,
    icon: '',
    banner: null,
    memberCount: members.size,
    premiumSubscriptionCount: 3,
    channels: { cache: channels },
    roles: { cache: roles },
    members: { cache: members },
    bannerURL: () => '',
    iconURL: () => '',
    fetch: async () => ({ ...this, members: { cache: members } }),
    toString: () => name,
  };
}

// ------------------------------------------------------------
// Faux client Discord (interface minimale lue par les routes)
// ------------------------------------------------------------
function makeClient(guilds) {
  const guildMap = new Map();
  for (const g of guilds) guildMap.set(String(g.id), g);
  const user = {
    id: '1537443352281088000',
    username: 'Optimus Prime',
    tag: 'Optimus Prime#2500',
    displayName: 'Optimus Prime',
    discriminator: '2500',
    bot: true,
    avatar: '',
    displayAvatarURL: (o) => 'https://cdn.discordapp.com/avatars/1/a.png',
    fetch: async () => user,
  };
  return {
    user,
    isReady: () => true,
    ws: { ping: 42 },
    guilds: { cache: guildMap },
    channels: { cache: new Map() },
    users: { cache: new Map() },
    fetch: async (id) => (guildMap.get(String(id)) ? guildMap.get(String(id)) : user),
    login: async () => {},
  };
}

// ------------------------------------------------------------
// Injection du mock dans le gestionnaire de bots
// ------------------------------------------------------------
const bot = store.db.prepare('SELECT id FROM bots LIMIT 1').get();
if (bot) {
  const guildA = makeGuild('1513133061489955006', 'OneState CI-ML-SN', { big: true });
  const guildB = makeGuild('1539668540787925052', 'Support Officiel Optimus Prime & Hoxera', { big: false });
  const guildC = makeGuild('1539226855004053626', 'Support Hoxera — assistance et aide rapide', { big: false });
  const guildD = makeGuild('1510643183728595035', '[ ONE | ONE ] CHEAT', { big: false });
  const guildE = makeGuild('1527070627314405387', '🟠Communauté-CODM 🟠 — call of duty mobile fr', { big: false });
  const client = makeClient([guildA, guildB, guildC, guildD, guildE]);
  botManager.clients.set(bot.id, { client });
  // Seconde copie : le sélecteur de serveurs liste les 51 guildes du user ;
  // on n'injecte que celles qui ont un nom long pour le pire cas.
  console.log('[audit] Client simulé injecté pour le bot #' + bot.id + ' — ' + [guildA, guildB, guildC, guildD, guildE].map(g => g.name).join(' | '));
} else {
  console.log('[audit] Aucun bot en base — modules serveur indisponibles.');
}

// ------------------------------------------------------------
// Application (mêmes middlewares que server/index.js)
// ------------------------------------------------------------
const app = express();
app.use(security.securityHeaders);
app.use(express.json({ limit: '250kb' }));
app.use(cookieParser());
app.use((req, res, next) => next());
app.use('/api', security.originGuard, routes);
app.get('/ping', (req, res) => res.type('text').send('pong'));
app.get('/transcript/:token', (req, res) => res.status(404).send('n/a'));
app.use('/assets', (req, res) => res.status(404).end());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = Number(process.env.PORT || 3100);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [AUDIT] Dashboard sur http://0.0.0.0:${PORT}`);
});
