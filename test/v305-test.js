// v305 — SALONS VOCAUX TEMPORAIRES : correction du bug signalé par le
// fondateur le 14/09 — « le salon se crée, mais les boutons du panneau
// répondent "rejoignez un salon vocal" alors qu'on est dedans, et le salon
// se crée ailleurs que dans la catégorie configurée ».
//
// Causes identifiées et corrigées :
//  1. vtChannelOf exigeait que la LISTE des salons temporaires soit intacte ;
//     vidée (course création/suppression, balayage sur incident réseau), le
//     panneau ne retrouvait plus le salon même avec le registre propriétaire.
//     → la preuve n°1 est maintenant : position vocale + registre propriétaire.
//  2. Le balayage de sécurité traitait TOUT échec de fetch Discord comme
//     « salon supprimé » → propriétaire effacé + salon retiré de la liste
//     alors qu'il était occupé. → on ne retire que sur preuve (erreur
//     10003/10004) ; sur incident réseau on garde et on retente.
//  3. Création : si Discord refusait la catégorie configurée, repli SILENCIEUX
//     à la racine. → repli en cascade (catégorie configurée → catégorie du
//     salon de création → racine) et CHAQUE repli journalisé dans
//     /api/health/bot (source 'voicetemp-categorie').
//  4. L'action SUPPRIMER retire maintenant le salon de la liste immédiatement.
//  5. Relecture fraîche de la liste avant l'écriture à la création (course).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v305');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const extra = require('../server/discord/extra');
const health = require('../server/health');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// ============================ MOCK SERVEUR DISCORD ============================
const G = '1527070627314405387';
let seq = 1000;
const cache = new Map();
function mkChannel(id, name, type, parentId = null) {
  const ch = {
    id: String(id), name, type, parentId,
    members: new Map(),
    permissionOverwrites: { edit: async () => {}, set: async () => {} },
    delete: async () => { cache.delete(ch.id); ch.deleted = true; return ch; },
    setName: async (n) => { ch.name = n; },
    setUserLimit: async () => {},
    send: async () => ({ id: 'msg' + (seq++), edit: async () => {}, delete: async () => {} }),
  };
  cache.set(ch.id, ch);
  return ch;
}
const creator = mkChannel('1545727208709161053', '➕ Créer un vocal', 2, 'CATCREATEUR');
const cat = mkChannel('1527073074544119878', 'Vocaux temporaires', 4, null);
mkChannel('CATCREATEUR', 'Salons', 4, null);
const ordinaire = mkChannel('7000000000000000001', 'Vocal ordinaire', 2, 'AUTRECAT'); // salon NON géré par le système

let createMode = 'normal'; // 'normal' | 'cat-refusee'
const USER = { id: '1497375017980137534', username: 'Fondateur', bot: false };
const INVITE = { id: '1336752601802473482', username: 'Invite', bot: false };
function mkMemberReal(u) {
  const m = { id: u.id, user: u, displayName: u.username, voice: { channel: null, setChannel: null } };
  m.voice.setChannel = async (ch) => {
    if (m.voice.channel) m.voice.channel.members.delete(u.id);
    m.voice.channel = ch; if (ch) ch.members.set(u.id, m);
  };
  return m;
}
const membre = mkMemberReal(USER);
const invite = mkMemberReal(INVITE);
let fetchMode = 'ok'; // 'ok' | 'reseau' | 'disparu'
const guild = {
  id: G, name: 'Serveur Test', roles: { everyone: { id: G } },
  channels: {
    cache,
    create: async (opts) => {
      if (createMode === 'cat-refusee' && opts.parent === cat.id) { const e = new Error('Missing Permissions'); e.code = 50013; throw e; }
      return mkChannel(String(9000000000000000000n + BigInt(seq++)), opts.name, opts.type === undefined ? 2 : opts.type, opts.parent || null);
    },
    fetch: async (id) => {
      if (fetchMode === 'reseau') { const e = new Error('rate limited'); e.code = 500001; throw e; }
      if (fetchMode === 'disparu') { const e = new Error('Unknown Channel'); e.code = 10003; throw e; }
      const ch = cache.get(String(id));
      if (!ch) { const e = new Error('Unknown Channel'); e.code = 10003; throw e; }
      return ch;
    },
  },
  members: { cache: new Map([[USER.id, membre], [INVITE.id, invite]]) },
  emojis: { cache: new Map() },
};
const entry = { client: { guilds: { cache: new Map([[G, guild]]) } } };
const botId = store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' });
store.voicetemp.set(botId, G, { creator_channel: creator.id, category: cat.id, name_template: '🔊 {name}', panel_channel: '' });
const mineKey = `vt_channels_${G}`;
const liste = () => { try { return JSON.parse(store.settings.get(mineKey) || '[]'); } catch { return []; } };
const ownerOf = (chId) => String(store.settings.get(`vt_owner:${G}:${chId}`) || '');
function mkBouton(act, user = USER) {
  const replies = [];
  return {
    i: {
      customId: `vt:${botId}:${act}`, guild, user,
      isButton: () => true, isUserSelectMenu: () => false, isModalSubmit: () => false,
      reply: async (p) => { replies.push(p); },
      showModal: async () => { replies.push({ __modal: true }); },
    },
    replies,
  };
}
const json = (x) => JSON.stringify(x || {});

(async () => {
  console.log('— 1. Pins de version v305 —');
  const html = racine('public/index.html');
  check('index.html : ?v=331 ×7', (html.match(/\?v=331/g) || []).length === 7);
  check('sw.js : cache botdev-v331', racine('public/sw.js').includes("const CACHE = 'botdev-v331';"));

  console.log('— 2. Création : bonne catégorie + liste + propriétaire —');
  await extra.onVoiceState(botId, entry, { channel: null, guild }, { channelId: creator.id, member: membre, guild });
  const l1 = liste();
  check('un salon est créé', l1.length === 1, 'liste=' + json(l1));
  const salon = cache.get(l1[0]);
  check('créé DANS la catégorie configurée', !!salon && String(salon.parentId) === cat.id, salon ? 'parent=' + salon.parentId : 'introuvable');
  check('nom = modèle + pseudo', !!salon && salon.name === '🔊 Fondateur', salon && salon.name);
  check('propriétaire enregistré', ownerOf(l1[0]) === USER.id);
  check('membre déplacé dedans', membre.voice.channel === salon);

  console.log('— 3. Boutons du panneau : agissent sur SON salon —');
  {
    const b = mkBouton('lock');
    await extra.handleInteraction(botId, entry, b.i);
    check('🔒 PRIVÉ fonctionne', !json(b.replies[0]).includes('Rejoignez') && !json(b.replies[0]).includes('Pas encore'), json(b.replies[0]).slice(0, 150));
  }
  {
    const b = mkBouton('rename');
    await extra.handleInteraction(botId, entry, b.i);
    check('✏️ NOM ouvre la fenêtre de renommage', !!(b.replies[0] && b.replies[0].__modal));
  }

  console.log('— 4. Scénario du fondateur : liste perdue → le panneau marche quand même —');
  store.settings.set(mineKey, '[]');
  {
    const b = mkBouton('unlock');
    await extra.handleInteraction(botId, entry, b.i);
    const d = json(b.replies[0]);
    check('clic avec liste VIDE : toujours fonctionnel', !d.includes('Rejoignez') && !d.includes('Pas encore'), d.slice(0, 150));
    check('…et la liste est RÉPARÉE au passage', liste().includes(salon.id), 'liste=' + json(liste()));
  }
  store.settings.set(`vt_owner:${G}:${salon.id}`, '');
  {
    const b = mkBouton('lock');
    await extra.handleInteraction(botId, entry, b.i);
    check('registre propriétaire effacé : récupération automatique', !json(b.replies[0]).includes('Rejoignez'));
    check('propriétaire restauré', ownerOf(salon.id) === USER.id);
  }

  console.log('— 5. Sécurité : jamais de prise de contrôle d’un salon ordinaire —');
  {
    invite.voice.setChannel(ordinaire);
    const b = mkBouton('lock', INVITE);
    await extra.handleInteraction(botId, entry, b.i);
    const d = json(b.replies[0]);
    check('invité dans un salon NON temporaire : panneau « rejoignez »', d.includes('Rejoignez') || d.includes('Créer un vocal'), d.slice(0, 150));
    check('…et aucun propriétaire usurpé', ownerOf(ordinaire.id) === '');
    invite.voice.setChannel(null);
  }

  console.log('— 6. Catégorie refusée par Discord : repli visible + journalisé —');
  {
    createMode = 'cat-refusee';
    await extra.onVoiceState(botId, entry, { channel: null, guild }, { channelId: creator.id, member: invite, guild });
    createMode = 'normal';
    const l = liste();
    const s2 = cache.get(l[l.length - 1]);
    check('salon créé dans la catégorie du salon de création', !!s2 && String(s2.parentId) === 'CATCREATEUR', s2 ? 'parent=' + s2.parentId : json(l));
    const errs = health.snapshot().errors24h.last || [];
    check('repli journalisé dans /api/health/bot', errs.some((e) => e.source === 'voicetemp-categorie'), json(errs).slice(0, 200));
  }

  console.log('— 7. Balayage de sécurité : plus de destruction sur incident réseau —');
  {
    // Le salon du fondateur est occupé, retiré du cache, fetch en erreur réseau.
    cache.delete(salon.id);
    fetchMode = 'reseau';
    await extra.sweepVoicetemp(botId, entry);
    fetchMode = 'ok';
    check('incident réseau : salon GARDÉ dans la liste', liste().includes(salon.id), 'liste=' + json(liste()));
    check('incident réseau : propriétaire GARDÉ', ownerOf(salon.id) === USER.id);
    cache.set(salon.id, salon); // le salon « revient » (le cache était juste incomplet)
  }
  {
    // Salon VRAIMENT supprimé sur Discord (erreur 10003) → nettoyage propre.
    cache.delete(salon.id);
    fetchMode = 'disparu';
    await extra.sweepVoicetemp(botId, entry);
    fetchMode = 'ok';
    check('salon vraiment disparu : retiré de la liste', !liste().includes(salon.id));
    check('salon vraiment disparu : propriétaire effacé', ownerOf(salon.id) === '');
  }

  console.log('— 8. SUPPRIMER : retrait immédiat de la liste —');
  {
    await extra.onVoiceState(botId, entry, { channel: null, guild }, { channelId: creator.id, member: membre, guild });
    const l = liste();
    const s3 = cache.get(l[l.length - 1]);
    const b = mkBouton('del');
    await extra.handleInteraction(botId, entry, b.i);
    check('🗑️ salon supprimé sur Discord', !!s3.deleted);
    check('🗑️ retiré de la liste immédiatement', !liste().includes(s3.id), 'liste=' + json(liste()));
  }

  console.log('— 9. Départ du salon : suppression automatique intacte —');
  {
    await extra.onVoiceState(botId, entry, { channel: null, guild }, { channelId: creator.id, member: invite, guild });
    const l = liste();
    const s4 = cache.get(l[l.length - 1]);
    check('salon de l’invité créé', !!s4);
    invite.voice.setChannel(null); s4.members.clear();
    await extra.onVoiceState(botId, entry, { channel: s4, guild }, { channelId: null, member: invite, guild });
    check('salon vide supprimé', !!s4.deleted);
    check('…et retiré de la liste', !liste().includes(s4.id));
  }

  console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  console.log(`\n✅ v305 : ${ok} vérifications passed.`);
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
