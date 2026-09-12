// v268 — Interface pro façon TempVoice (en mieux) + NOS propres émojis.
//
// Le panneau vocal passe au standard des bots pros : labels COURTS en
// majuscules, rangées alignées, 10 contrôles (NOM, LIMITE, PRIVÉ, PUBLIC,
// RÉCUPÉRER, AJOUTER, RETIRER, EXPULSER, TRANSFÉRER, SUPPRIMER) — et surtout
// un pack de 10 émojis Hoxera, dessinés pour nous, que le bot installe sur le
// serveur (/voicetemp emotes ou bouton dashboard) ; sans eux, repli unicode.
//
// Vérifié ici : forme du nouveau panneau, LIMITE (modale + bornes 0-99),
// EXPULSER (sort du vocal + accès coupé), TRANSFÉRER (nouveau propriétaire),
// RÉCUPÉRER (seulement si le propriétaire est absent), installation des
// émojis + utilisation dans le panneau, routes/dashboard/slash, version.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dir = '/tmp/v268test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const v2 = require('./helpers/v2');
const store = require('../server/db');
const extra = require('../server/discord/extra');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const mkChannel = (id, name) => {
  const ch = {
    id, name, edits: [], sets: [], deleted: false, renamed: [], limits: [],
    permissionOverwrites: {
      edit: async (t, o) => { ch.edits.push([String(t), o]); },
      set: async (arr) => { ch.sets.push(arr); },
    },
    setName: async (n) => { ch.renamed.push(n); },
    setUserLimit: async (n) => { ch.limits.push(n); },
    delete: async () => { ch.deleted = true; },
  };
  return ch;
};

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });

  console.log('— 1. Le nouveau panneau : style TempVoice, labels majuscules —');
  const panel = extra.buildVtPanel(botId, null);
  const rows = v2.rows(panel);
  const btn = rows.flatMap((r) => r.components || []).filter((c) => c.type === 2);
  check("10 boutons carrés dans l'ordre", btn.map((b) => b.custom_id.split(':').pop()).join('|') === 'rename|limit|lock|unlock|claim|add|rem|kick|transfer|del');
  check('…émojis seuls, SANS libellé (style TempVoice)', btn.every((b) => !b.label) && btn[0].emoji.name === '✏️' && btn[1].emoji.name === '👥' && btn[4].emoji.name === '🔑');
  check('rangée 3 finit par suppression rouge, émoji seul', !rows[2].components[1].label && rows[2].components[1].style === 4);
  check('légende émoji+nom dans le message', v2.texts(panel).join(' ').includes('NOM') && v2.texts(panel).join(' ').includes('Appuyez sur les boutons'));
  check('boutons membre en émojis seuls (ajouter/retirer/expulser/transférer)',
    [rows[1].components[1], rows[1].components[2], rows[1].components[3], rows[2].components[0]].every((c) => c.type === 2 && !c.label && c.emoji));
  check('3 rubriques d\'aide (accès, membres, salon)', v2.texts(panel).length >= 4);

  console.log('— 2. NOS émojis : pack, installation, utilisation —');
  const assets = fs.readdirSync(path.join(__dirname, '..', 'server', 'assets', 'voicetemp'));
  check('10 émojis Hoxera livrés avec le bot', extra.VT_EMOTES.every((k) => assets.includes('hox_' + k + '.png')) && assets.length === 10);
  check('…tous sous la limite Discord (256 Ko)', extra.VT_EMOTES.every((k) => fs.statSync(path.join(__dirname, '..', 'server', 'assets', 'voicetemp', 'hox_' + k + '.png')).size < 256000));
  let emoteSeq = 0;
  const createdEmotes = [];
  const guildE = {
    id: 'gE',
    emojis: {
      cache: { get: (id) => createdEmotes.find((e) => e.id === id) || null, find: (fn) => createdEmotes.find(fn) || undefined },
      create: async ({ attachment, name }) => { const e = { id: String(900000000000000000n + BigInt(++emoteSeq)), name }; createdEmotes.push(e); return e; },
    },
  };
  const created = await extra.installVtEmotes(botId, guildE);
  check('/voicetemp emotes : 10 émojis créés sur le serveur', created.length === 10, String(created.length));
  const again = await extra.installVtEmotes(botId, guildE);
  check('…relancé : rien ne se duplique', again.length === 0);
  check('…mémorisés par serveur', Object.keys(JSON.parse(store.settings.get('vt_emotes:gE') || '{}')).length === 10);
  check('le panneau affiche NOS émojis une fois installés', v2.rows(extra.buildVtPanel(botId, guildE))[0].components[0].emoji.id === '900000000000000001');

  console.log('— 3. LIMITE, EXPULSER, TRANSFÉRER —');
  store.voicetemp.set(botId, 'g1', { creator_channel: 'HUB', category: '', panel_channel: '' });
  store.settings.set('vt_channels_g1', JSON.stringify(['V1']));
  const ch = mkChannel('V1', '🔊 Salon de Léo');
  const kicked = { id: 'U9', voice: { setChannel: async (c) => { kicked.out = true; } } };
  ch.members = { get: (id) => (id === 'U9' ? kicked : null), has: (id) => id === 'U9' || id === 'U1' };
  const guild = { id: 'g1', roles: { everyone: { id: 'everyone' } }, channels: { cache: new Map([['V1', ch]]) }, emojis: { cache: { get: () => null, find: () => undefined } } };
  extra.vtSetOwner('g1', 'V1', 'U1');
  const replyOf = async (i) => { let rep = null; i.reply = async (p) => { rep = p; }; await extra.handleVtInteraction(botId, {}, i); return rep; };
  const base = (act, over = {}) => ({
    isButton: () => true, isUserSelectMenu: () => false, isModalSubmit: () => false,
    customId: `vt:${botId}:${act}`, guild, user: { id: 'U1' }, values: [], ...over,
  });
  let modal = null;
  await extra.handleVtInteraction(botId, {}, { ...base('limit'), showModal: async (m) => { modal = m; } });
  check('👥 LIMITE : modale personnelle demandée', !!modal && JSON.stringify(modal.toJSON ? modal.toJSON() : modal).includes(`vtlimit:${botId}`));
  let rep = await replyOf({ ...base('limit'), isModalSubmit: () => true, customId: `vtlimit:${botId}`, fields: { getTextInputValue: () => '150' } });
  check('…150 demandé : borné à 99 places', ch.limits.length === 1 && ch.limits[0] === 99 && rep && rep.ephemeral === true);
  rep = await replyOf({ ...base('limit'), isModalSubmit: () => true, customId: `vtlimit:${botId}`, fields: { getTextInputValue: () => '0' } });
  check('…0 : illimité', ch.limits[1] === 0);
  rep = await replyOf(base('kick', { isButton: () => false, isUserSelectMenu: () => true, values: ['U9'] }));
  check('👢 EXPULSER : sorti du vocal ET accès coupé', kicked.out === true && ch.edits.some(([t, o]) => t === 'U9' && o.Connect === false) && rep.ephemeral === true);
  ch.edits.length = 0; kicked.out = false;
  rep = await replyOf(base('rem', { isButton: () => false, isUserSelectMenu: () => true, values: ['U9'] }));
  check('➖ RETIRER : accès coupé sans expulsion', kicked.out === false && ch.edits.some(([t, o]) => t === 'U9' && o.Connect === false) && rep.ephemeral === true);
  let pick = null;
  rep = await replyOf(base('add'));
  pick = JSON.stringify(rep);
  check('➕ bouton : panneau personnel avec menu membre', rep.ephemeral === true && pick.includes(`vt:${botId}:add`) && pick.includes('Choisissez un membre'));
  rep = await replyOf(base('transfer', { isButton: () => false, isUserSelectMenu: () => true, values: ['U7'] }));
  check('🤝 TRANSFÉRER : nouveau propriétaire enregistré', extra.vtGetOwner('g1', 'V1') === 'U7' && rep.ephemeral === true);

  console.log('— 4. RÉCUPÉRER : seulement un salon abandonné —');
  const ch2 = mkChannel('V2', '🔊 Salon de Mia');
  ch2.members = { get: (id) => null, has: (id) => id === 'U3' }; // U3 dedans, propriétaire U8 absent
  const guild2 = { id: 'g2', roles: { everyone: { id: 'everyone' } }, channels: { cache: new Map([['V2', ch2]]) }, emojis: { cache: { get: () => null, find: () => undefined } } };
  store.voicetemp.set(botId, 'g2', { creator_channel: 'HUB', category: '', panel_channel: '' });
  store.settings.set('vt_channels_g2', JSON.stringify(['V2']));
  extra.vtSetOwner('g2', 'V2', 'U8');
  rep = await replyOf({ ...base('claim'), guild: guild2, user: { id: 'U3' } });
  check('🔑 propriétaire parti + membre dedans : salon récupéré', extra.vtGetOwner('g2', 'V2') === 'U3' && rep.ephemeral === true);
  extra.vtSetOwner('g2', 'V2', 'U8');
  ch2.members = { get: () => null, has: (id) => id === 'U8' || id === 'U3' }; // propriétaire présent
  rep = await replyOf({ ...base('claim'), guild: guild2, user: { id: 'U3' } });
  check('🔑 propriétaire encore là : refus poli', extra.vtGetOwner('g2', 'V2') === 'U8' && JSON.stringify(rep).includes('Rien à récupérer'));

  console.log('— 5. Commande, routes, dashboard —');
  const cmd = extra.buildExtraPayloads(botId).find((p) => p.name === 'voicetemp');
  check('/voicetemp propose l\'action emotes', JSON.stringify(cmd.options).includes('"emotes"'));
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('route POST …/voicetemp/emotes', routes.includes("voicetemp/emotes'"));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('dashboard : bouton « Installer les émojis Hoxera »', dash.includes('id="vt-emotes"') && dash.includes('voicetemp/emotes'));

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=277 référencé 7 fois', (index.match(/\?v=277/g) || []).length === 7);
  check('sw.js : cache « botdev-v277 »', sw.includes("const CACHE = 'botdev-v277';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v268 — ${ok} vérifications OK : notre interface pro, avec nos émojis.`);
  else { console.log(`❌ v268 — ${ko} échec(s)`); process.exitCode = 1; }
})();
