// v267 — Vocaux temporaires + : panneau de contrôle PRO (demande du maître).
//
// Le concept : un membre rejoint le salon vocal « ➕ Créer un vocal » → un
// salon À SON NOM se crée et il y est déplacé → dans le salon textuel choisi
// (dashboard ou /voicetemp set … panneau:#salon), un panneau lui permet de
// gérer SON salon : 🔒 privé / 🔓 public, ➕ ➖ invités, ✏️ renommer,
// 🗑️ supprimer. Chaque réponse est ÉPHÉMÈRE : ce que clique quelqu'un ne se
// voit que chez lui. Seul le propriétaire du salon peut agir dessus.
//
// Vérifié ici : forme du panneau (boutons + menus utilisateur), propriété
// des salons, chaque action du panneau, création/suppression avec
// propriétaire, commande et routes, carte dashboard.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v267test-' + Date.now();
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

const mkChannel = (id, name) => ({
  id,
  name,
  edits: [],
  sets: [],
  deleted: false,
  renamed: [],
  permissionOverwrites: {
    cache: new Map(),
    edit: async function (t, o) { this._e = this._e || []; this._e.push([String(t), o]); mkChannelEdits.push([id, String(t), o]); },
    set: async function (arr) { mkChannelSets.push([id, arr]); },
  },
  setName: async function (n) { this.renamed.push(n); },
  delete: async function () { this.deleted = true; },
});
let mkChannelEdits = [];
let mkChannelSets = [];

const mkGuild = (channels) => ({
  id: 'g1',
  name: 'Serveur test',
  roles: { everyone: { id: 'everyone' } },
  channels: { cache: new Map(channels.map((c) => [c.id, c])) },
});

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });

  console.log('— 1. Le panneau de contrôle : pro, organisé, complet —');
  const panel = extra.buildVtPanel(botId);
  check('panneau Components V2', v2.isV2(panel));
  check('titre clair', v2.title(panel).includes('Interface Hoxera — vocaux temporaires'), v2.title(panel));
  const rows = v2.rows(panel);
  check('3 rangées rangées 4/4/2 (tiennent sur mobile)', rows.length === 3 && rows[0].components.length === 4 && rows[1].components.length === 4 && rows[2].components.length === 2);
  const comps = rows.map((r) => r.components || []);
  const btns = comps.flat().filter((c) => c.type === 2);
  check('10 boutons : nom limite privé public récupérer ajouter retirer expulser transférer supprimer',
    btns.map((b) => b.custom_id.split(':').pop()).join('|') === 'rename|limit|lock|unlock|claim|add|rem|kick|transfer|del');
  check('rangées 1-2 : nom limite privé public / récupérer ajouter retirer expulser',
    comps[0].map((c) => c.custom_id.split(':').pop()).join('|') === 'rename|limit|lock|unlock'
    && comps[1].map((c) => c.custom_id.split(':').pop()).join('|') === 'claim|add|rem|kick');
  check('rangée 3 : transférer + suppression en rouge', comps[2][0].custom_id === `vt:${botId}:transfer` && comps[2][1].custom_id === `vt:${botId}:del` && comps[2][1].style === 4);
  check('légende des contrôles présente dans le message', v2.texts(panel).join(' ').includes('NOM') && v2.texts(panel).join(' ').includes('SUPPRIMER'));

  console.log('— 2. Propriété du salon —');
  store.voicetemp.set(botId, 'g1', { creator_channel: 'HUB', category: '', panel_channel: '' });
  store.settings.set('vt_channels_g1', JSON.stringify(['V1']));
  const ch = mkChannel('V1', '🔊 Salon de Léo');
  const guild = mkGuild([ch]);
  extra.vtSetOwner('g1', 'V1', 'U1');
  check('le propriétaire retrouve son salon', extra.vtChannelOf(botId, guild, 'U1') === ch);
  check('un autre membre : aucun salon', extra.vtChannelOf(botId, guild, 'U2') === null);

  console.log('— 3. Chaque action du panneau (réponses éphémères) —');
  const replyOf = async (i) => { let rep = null; i.reply = async (p) => { rep = p; }; await extra.handleVtInteraction(botId, {}, i); return rep; };
  const baseI = (act, extra2 = {}) => ({
    isButton: () => true, isUserSelectMenu: () => false, isModalSubmit: () => false,
    customId: `vt:${botId}:${act}`, guild, user: { id: 'U1' }, values: [], ...extra2,
  });
  mkChannelEdits = [];
  let rep = await replyOf(baseI('lock'));
  check('🔒 privé : connexion interdite à @everyone, autorisée au propriétaire',
    rep && rep.ephemeral === true
    && mkChannelEdits.some(([cid, t, o]) => cid === 'V1' && t === 'everyone' && o.Connect === false)
    && mkChannelEdits.some(([cid, t, o]) => cid === 'V1' && t === 'U1' && o.Connect === true));
  mkChannelSets = [];
  rep = await replyOf(baseI('unlock'));
  check('🔓 public : permissions remises à zéro, réponse éphémère', rep && rep.ephemeral === true && mkChannelSets.length === 1);
  mkChannelEdits = [];
  rep = await replyOf(baseI('add', { isButton: () => false, isUserSelectMenu: () => true, values: ['U9'] }));
  check('➕ invité : permissions d\'entrée accordées au membre choisi',
    rep && rep.ephemeral === true && mkChannelEdits.some(([cid, t, o]) => t === 'U9' && o.Connect === true));
  mkChannelEdits = [];
  rep = await replyOf(baseI('rem', { isButton: () => false, isUserSelectMenu: () => true, values: ['U9'] }));
  check('➖ retiré : connexion refusée au membre', mkChannelEdits.some(([cid, t, o]) => t === 'U9' && o.Connect === false));
  let modal = null;
  await extra.handleVtInteraction(botId, {}, { ...baseI('rename'), showModal: async (m) => { modal = m; } });
  check('✏️ renommer : modale personnelle demandée', !!modal && JSON.stringify(modal.toJSON ? modal.toJSON() : modal).includes(`vtrename:${botId}`));
  rep = await replyOf({
    isButton: () => false, isUserSelectMenu: () => false, isModalSubmit: () => true,
    customId: `vtrename:${botId}`, guild, user: { id: 'U1' },
    fields: { getTextInputValue: () => ' Salon gaming' },
  });
  check('…modale renvoyée : salon renommé', ch.renamed.includes('Salon gaming') && rep && rep.ephemeral === true);
  rep = await replyOf(baseI('del'));
  check('🗑️ supprimer : salon supprimé et propriété effacée', ch.deleted === true && extra.vtGetOwner('g1', 'V1') === '');
  rep = await replyOf(baseI('lock'));
  check('sans salon à soi : explication éphémère (rejoins le ➕)', rep && rep.ephemeral === true && JSON.stringify(rep).includes('Pas encore de salon'));
  const foreign = await extra.handleVtInteraction(botId, {}, { isButton: () => true, customId: 'autre:chose', guild, user: { id: 'U1' } });
  check("composant d'un autre module : ignoré", foreign === false);

  console.log('— 4. Création et suppression automatiques avec propriétaire —');
  const created = mkChannel('V2', '🔊 x');
  const guild2 = {
    id: 'g2', name: 'S2', roles: { everyone: { id: 'everyone' } },
    channels: { cache: new Map(), create: async (opts) => { created.name = opts.name; guild2.channels.cache.set(created.id, created); return created; } },
  };
  store.voicetemp.set(botId, 'g2', { creator_channel: 'HUB2', category: 'CAT', panel_channel: '' });
  const member = { id: 'U5', displayName: 'Léo', voice: { setChannel: async (c) => { member.movedTo = c; } } };
  await extra.onVoiceState(botId, {}, {}, { channelId: 'HUB2', member, guild: guild2 });
  check('rejoint le ➕ : salon créé au nom du membre', created.name.includes('Léo'));
  check('…membre déplacé dedans', member.movedTo === created);
  check('…propriétaire mémorisé', extra.vtGetOwner('g2', 'V2') === 'U5');
  const empty = mkChannel('V2', '🔊 Léo');
  empty.members = { size: 0 };
  guild2.channels.cache.set('V2', empty);
  store.settings.set('vt_channels_g2', JSON.stringify(['V2']));
  await extra.onVoiceState(botId, {}, { channel: empty, guild: guild2 }, { guild: guild2 });
  check('salon vide : supprimé et propriétaire oublié', empty.deleted === true && extra.vtGetOwner('g2', 'V2') === '');

  console.log('— 5. Commande, routes, dashboard —');
  const payloads = extra.buildExtraPayloads(botId);
  const cmd = payloads.find((p) => p.name === 'voicetemp');
  check("/voicetemp propose l'option panneau (salon textuel)", !!cmd && JSON.stringify(cmd.options).includes('panneau'));
  const routes = fs.readFileSync(require('path').join(__dirname, '..', 'server/routes.js'), 'utf8');
  check('route POST …/voicetemp/panel (bouton dashboard)', routes.includes("voicetemp/panel'"));
  check('PUT préserve les réglages existants', routes.includes('...prevVt'));
  const dash = fs.readFileSync(require('path').join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
  check("dashboard : sélecteur de salon textuel + bouton d'envoi du panneau",
    dash.includes('id="vt-panel"') && dash.includes('vt-panel-send'));

  console.log('— 6. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=283 référencé 7 fois', (index.match(/\?v=283/g) || []).length === 7,
    String((index.match(/\?v=283/g) || []).length));
  check('sw.js : cache « botdev-v283 »', sw.includes("const CACHE = 'botdev-v283';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v267 — ${ok} vérifications OK : chaque membre administre son salon vocal.`);
  else { console.log(`❌ v267 — ${ko} échec(s)`); process.exitCode = 1; }
})();
