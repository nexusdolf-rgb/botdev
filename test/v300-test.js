// v300 — 🛡️ Fiabilité commandes + vocaux temporaires (4 bugs du terrain corrigés).
// Vérifié :
//  1. modules vides en base = TOUT activé (avant : toutes les commandes mouraient
//     en silence) + commande de module désactivé = réponse CLAIRE (avant :
//     « pas encore prête, retente dans 5 à 10 minutes » trompeur) ;
//  2. création du salon vocal dans la BONNE catégorie (configurée → sinon celle
//     du salon de création → sinon racine ; catégorie refusée = réessai sans) ;
//  3. drapeau « création en cours » horodaté (un redémarrage ne bloque plus les
//     créations à vie) + liste des salons non détruite par le cache froid ;
//  4. panneau de contrôle : auto-réparation du propriétaire (le bouton NOM ne
//     dit plus « rejoignez un salon vocal » à quelqu'un qui est DEDANS) ;
//  5. balayeur sweepVoicetemp (30 s) : salons vides oubliés supprimés,
//     références mortes nettoyées, propriétaires perdus réparés, salon « ➕ »
//     jamais touché ;
//  6. bump v300.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v300');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const extra = require('../server/discord/extra');
const premade = require('../server/discord/premade');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// ---------------- Fakes ----------------
let createdCalls = [];
function mkChannel(id, name, over = {}) {
  return {
    id, name, type: over.type === undefined ? 2 : over.type, parentId: over.parentId || null, deleted: false,
    members: over.members || new Map(),
    delete: async function () { this.deleted = true; return this; },
    setName: async function (n) { this.name = n; },
    setUserLimit: async function () {},
    permissionOverwrites: { edit: async () => {}, set: async () => {} },
  };
}
function mkGuild(id, channels = [], over = {}) {
  const cache = new Map(channels.map((c) => [c.id, c]));
  const g = {
    id, name: 'S', roles: { everyone: { id: 'everyone' } },
    ownerId: over.ownerId || 'OWNER',
    channels: {
      cache,
      create: async (opts) => {
        createdCalls.push(opts);
        if (opts.parent && (over.rejectParents || []).includes(opts.parent)) throw new Error('Invalid Form Body');
        const ch = mkChannel('NEW' + (createdCalls.length), opts.name, { parentId: opts.parent || null });
        cache.set(ch.id, ch);
        return ch;
      },
      fetch: async (cid) => cache.get(cid) || null,
    },
    members: over.members ? { cache: new Map(over.members.map((m) => [m.id, m])) } : undefined,
  };
  return g;
}
function mkMember(id, name, channel) {
  return { id, displayName: name, user: { username: name, id }, voice: { channel: channel || null, setChannel: async (c) => { mkMember.moved = c; } }, send: async () => ({}) };
}

(async () => {
  const B = Number(store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' }));

  console.log('— 1. Commandes : modules + messages clairs —');
  const B2 = Number(store.bots.create({ user_id: 1, name: 'T2', token: 'y', client_id: 'c2', prefix: '!' }));
  check('bot sans AUCUNE ligne modules → tout est activé (auto-réparation)',
    premade.enabledModules(B2).length === Object.keys(premade.MODULES).length);
  check('/help fait partie des commandes actives par défaut', premade.enabledCommandNames(B2).includes('help'));
  // Bot avec modules renseignés : « vue » désactivé
  for (const k of Object.keys(premade.MODULES)) store.modules.set(B, k, true);
  store.modules.set(B, 'utility', false);
  check('module désactivé explicitement → respecté', !premade.enabledModules(B).includes('utility') && premade.enabledModules(B).includes('community'));
  let replied = null;
  const fakeI = (name) => ({
    commandName: name, guild: { id: 'G', ownerId: 'O' }, member: { permissions: { has: () => true } },
    options: { getString: () => null, getBoolean: () => null },
    replied: false, deferred: false,
    reply: async (p) => { replied = p; return {}; },
  });
  await premade.handlePremadeSlash(B, {}, fakeI('help'));
  check('commande de module désactivé → réponse CLAIRE « module désactivé »',
    replied && /module \*\*désactivé\*\*/.test(replied.content) && replied.ephemeral === true);
  check('…et plus le silence qui disait « pas encore prête »', !/pas encore prête/.test(String(replied && replied.content)));
  replied = null;
  await premade.handlePremadeSlash(B, {}, fakeI('commande_inconnue'));
  check('commande totalement inconnue → reste au filet de sécurité (pas de réponse)', replied === null);
  const srcPremade = racine('server/discord/premade.js');
  check('le filet « pas encore prête » existe toujours en dernier recours', racine('server/discord/botManager.js').includes('guard_not_ready') && srcPremade.includes("if (!Object.keys(m).length) return Object.keys(MODULES);"));

  console.log('— 2. Vocaux : création dans la bonne catégorie —');
  const G1 = 'g300a';
  store.voicetemp.set(B, G1, { creator_channel: 'HUB', category: 'CAT', name_template: '🔊 {name}', panel_channel: '' });
  const cat = mkChannel('CAT', 'Vocaux', { type: 4 }); const hub = mkChannel('HUB', '➕ Créer un vocal', { parentId: 'CAT' });
  const g1 = mkGuild(G1, [cat, hub]);
  const m1 = mkMember('U1', 'Léo');
  createdCalls = [];
  await extra.onVoiceState(B, {}, {}, { channelId: 'HUB', member: m1, guild: g1 });
  check('catégorie configurée → le salon est créé DEDANS', createdCalls.length === 1 && createdCalls[0].parent === 'CAT');
  check('salon au nom du membre + membre déplacé dedans', createdCalls[0].name.includes('Léo') && mkMember.moved && String(mkMember.moved.id).startsWith('NEW'));
  // Catégorie vide (option par défaut du dashboard) → celle du salon de création
  const G2 = 'g300b';
  store.voicetemp.set(B, G2, { creator_channel: 'HUB2', category: '', name_template: '', panel_channel: '' });
  const hub2 = mkChannel('HUB2', '➕ Créer un vocal', { parentId: 'CAT2' });
  const g2 = mkGuild(G2, [hub2, mkChannel('CAT2', 'Vocal', { type: 4 })]);
  createdCalls = [];
  await extra.onVoiceState(B, {}, {}, { channelId: 'HUB2', member: mkMember('U2', 'Zoé'), guild: g2 });
  check('catégorie vide → repli sur la catégorie du salon de création (avant : racine)', createdCalls.length === 1 && createdCalls[0].parent === 'CAT2');
  // Catégorie supprimée (id introuvable) → repli, PAS d'échec silencieux
  const G3 = 'g300c';
  store.voicetemp.set(B, G3, { creator_channel: 'HUB3', category: 'MORTE', name_template: '', panel_channel: '' });
  const hub3 = mkChannel('HUB3', '➕ Créer un vocal');
  const g3 = mkGuild(G3, [hub3]);
  createdCalls = [];
  await extra.onVoiceState(B, {}, {}, { channelId: 'HUB3', member: mkMember('U3', 'Ada'), guild: g3 });
  check('catégorie supprimée → salon créé quand même (sans catégorie)', createdCalls.length === 1 && !createdCalls[0].parent);
  // Catégorie refusée par Discord → réessai sans catégorie
  const G4 = 'g300d';
  store.voicetemp.set(B, G4, { creator_channel: 'HUB4', category: 'BADCAT', name_template: '', panel_channel: '' });
  const g4 = mkGuild(G4, [mkChannel('HUB4', '➕'), mkChannel('BADCAT', 'C', { type: 4 })], { rejectParents: ['BADCAT'] });
  // BADCAT est dans le cache (valide en apparence) mais Discord refuse → réessai sans parent
  createdCalls = [];
  await extra.onVoiceState(B, {}, {}, { channelId: 'HUB4', member: mkMember('U4', 'Bob'), guild: g4 });
  check('catégorie refusée par Discord → réessai sans catégorie (salon créé)', createdCalls.length === 2 && createdCalls[0].parent === 'BADCAT' && !createdCalls[1].parent);

  console.log('— 3. Vocaux : drapeau de création + liste non destructible —');
  const G5 = 'g300e';
  store.voicetemp.set(B, G5, { creator_channel: 'HUB5', category: '', name_template: '', panel_channel: '' });
  const g5 = mkGuild(G5, [mkChannel('HUB5', '➕')]);
  store.settings.set('vt_creating_g300e', String(Date.now())); // création « en cours » fraîche
  createdCalls = [];
  await extra.onVoiceState(B, {}, {}, { channelId: 'HUB5', member: mkMember('U5', 'Kai'), guild: g5 });
  check('création déjà en cours (fraîche) → ignorée (anti-double)', createdCalls.length === 0);
  store.settings.set('vt_creating_g300e', String(Date.now() - 60000)); // plantée il y a 1 min
  await extra.onVoiceState(B, {}, {}, { channelId: 'HUB5', member: mkMember('U5', 'Kai'), guild: g5 });
  check('drapeau PÉRIMÉ (redémarrage) → la création refonctionne (avant : bloqué à vie)', createdCalls.length === 1);
  check('drapeau remis à zéro après création', !store.settings.get('vt_creating_g300e'));
  // Liste non détruite par le cache froid
  const G6 = 'g300f';
  store.voicetemp.set(B, G6, { creator_channel: 'HUB6', category: '', name_template: '', panel_channel: '' });
  store.settings.set('vt_channels_g300f', JSON.stringify(['VIVANT']));
  const g6 = mkGuild(G6, [mkChannel('HUB6', '➕')]); // VIVANT absent du cache (démarrage à froid)
  await extra.onVoiceState(B, {}, {}, { channelId: 'HUB6', member: mkMember('U6', 'Ivy'), guild: g6 });
  const liste = JSON.parse(store.settings.get('vt_channels_g300f') || '[]');
  check('cache froid : la liste n est PAS amputée des salons existants', liste.includes('VIVANT') && liste.length === 2);

  console.log('— 4. Panneau : auto-réparation du propriétaire —');
  const G7 = 'g300g';
  store.voicetemp.set(B, G7, { creator_channel: 'HUB7', category: 'CAT7', name_template: '', panel_channel: '' });
  const temp = mkChannel('TEMP1', '🔊 Vieux salon'); temp.parentId = 'CAT7';
  const g7 = mkGuild(G7, [mkChannel('HUB7', '➕'), mkChannel('CAT7', 'V', { type: 4 }), temp]);
  const mem7 = mkMember('U7', 'Max', temp);
  g7.members = { cache: new Map([['U7', mem7]]) };
  store.settings.set('vt_channels_g300g', JSON.stringify(['TEMP1'])); // dans la liste…
  check('…mais SANS propriétaire (avant v267) → le panneau le retrouve et le réattribue',
    extra.vtChannelOf(B, g7, 'U7') === temp && extra.vtGetOwner(G7, 'TEMP1') === 'U7');
  // Hors liste mais dans la catégorie configurée
  const temp2 = mkChannel('TEMP2', '🔊 Perdu'); temp2.parentId = 'CAT7';
  g7.channels.cache.set('TEMP2', temp2);
  store.settings.set('vt_channels_g300g', JSON.stringify(['TEMP1']));
  const mem8 = mkMember('U8', 'Eva', temp2);
  g7.members.cache.set('U8', mem8);
  check('salon perdu de la liste mais dans la catégorie → retrouvé + réinscrit',
    extra.vtChannelOf(B, g7, 'U8') === temp2 && JSON.parse(store.settings.get('vt_channels_g300g')).includes('TEMP2'));
  // Propriété d'un AUTRE membre : respectée
  check('salon d un autre propriétaire → pas de vol', extra.vtChannelOf(B, g7, 'U9x') === null);
  const mem9 = mkMember('U9x', 'Vic', temp);
  g7.members.cache.set('U9x', mem9);
  check('dedans mais propriété à un autre actif → null (utiliser 🔑 Récupérer)', extra.vtChannelOf(B, g7, 'U9x') === null);
  // Membre dans le salon « ➕ » : jamais considéré comme SON salon
  const memHub = mkMember('U10', 'Ann', g7.channels.cache.get('HUB7'));
  g7.members.cache.set('U10', memHub);
  check('membre dans le salon « ➕ » → aucun salon personnel', extra.vtChannelOf(B, g7, 'U10') === null);

  console.log('— 5. Balayeur de sécurité (sweepVoicetemp) —');
  check('sweepVoicetemp exporté', typeof extra.sweepVoicetemp === 'function');
  const G8 = 'g300h';
  store.voicetemp.set(B, G8, { creator_channel: 'HUB8', category: '', name_template: '', panel_channel: '' });
  const vide = mkChannel('VIDE', '🔊 Abandonné');            // vide → à supprimer
  const plein = mkChannel('PLEIN', '🔊 Actif');                // occupé sans propriétaire → réparation
  const membP = mkMember('UP', 'Pat');
  plein.members = new Map([['UP', membP]]);
  const hub8 = mkChannel('HUB8', '➕ Créer un vocal');          // créateur vide → JAMAIS supprimé
  const g8 = mkGuild(G8, [vide, plein, hub8]);
  store.settings.set('vt_channels_g300h', JSON.stringify(['VIDE', 'PLEIN', 'MORT', 'HUB8']));
  extra.vtSetOwner('g300h', 'VIDE', 'Ugone');
  const entry8 = { client: { guilds: { cache: new Map([[G8, g8]]) } } };
  await extra.sweepVoicetemp(B, entry8);
  check('salon vide oublié → supprimé (même sans événement de départ)', vide.deleted === true);
  check('salon mort → référence nettoyée + propriétaire oublié', !JSON.parse(store.settings.get('vt_channels_g300h')).includes('MORT'));
  check('salon occupé sans propriétaire → premier membre dedans propriétaire', extra.vtGetOwner('g300h', 'PLEIN') === 'UP');
  check('salon « ➕ Créer un vocal » jamais supprimé même vide', hub8.deleted === false && JSON.parse(store.settings.get('vt_channels_g300h')).includes('HUB8'));
  check('liste finale propre', JSON.stringify(JSON.parse(store.settings.get('vt_channels_g300h'))) === JSON.stringify(['PLEIN', 'HUB8']));
  // Salon déjà propriétaire : non volé par le balayeur
  const G9 = 'g300i';
  store.voicetemp.set(B, G9, { creator_channel: 'HUB9', category: '', name_template: '', panel_channel: '' });
  const occ = mkChannel('OCC', '🔊 Pris'); occ.members = new Map([['UB', mkMember('UB', 'Bea')]]);
  const g9 = mkGuild(G9, [occ, mkChannel('HUB9', '➕')]);
  extra.vtSetOwner('g300h', 'x', 'y'); // bruit
  store.settings.set('vt_channels_g300i', JSON.stringify(['OCC']));
  extra.vtSetOwner('g300i', 'OCC', 'UA');
  await extra.sweepVoicetemp(B, { client: { guilds: { cache: new Map([[G9, g9]]) } } });
  check('propriétaire existant (même absent du salon) → intact', extra.vtGetOwner('g300i', 'OCC') === 'UA' && !occ.deleted);
  check('le balayeur est branché sur la boucle de 30 s', racine('server/discord/tasks.js').includes('extra.sweepVoicetemp(botId, entry)'));

  console.log('— 6. Garde-fous commandes extra —');
  const srcExtra = racine('server/discord/extra.js');
  check('options manquantes → réponse claire au lieu de planter', srcExtra.includes("typeof interaction.options.getString !== 'function'"));
  check('commandName absent → ignoré proprement', srcExtra.includes("String(interaction.commandName || '').toLowerCase()"));

  console.log('— 7. Bump v300 —');
  const index = racine('public/index.html');
  check('index.html : ?v=325 référencé 7 fois', (index.match(/\?v=325/g) || []).length === 7, String((index.match(/\?v=325/g) || []).length));
  check('sw.js : cache « botdev-v325 »', racine('public/sw.js').includes("const CACHE = 'botdev-v325';"));

  console.log(`\n🎉 v300 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
