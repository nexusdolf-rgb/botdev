// ============================================================
// Test Hoxera v34 — « L'application ne répond pas » : plus jamais.
// Simule de VRAIES interactions Discord (commandes slash, boutons,
// menus de sélection, modales) pour TOUTES les commandes et TOUS
// les boutons, et vérifie que chaque interaction reçoit une réponse.
// + Assistant /ticket types setup de bout en bout (avec emoji invalide)
// + Dashboard Tickets (aperçu, rôles staff en listes, catégories)
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v34-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

// ---------------------- Faux objets Discord ----------------------
function fakeGuild() {
  const channels = new Map();
  const mkCh = (id, name, type) => {
    const ch = {
      id, name, type,
      isTextBased: () => type === 0,
      send: async () => ({}),
      toString: () => `#${name}`,
      permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) },
      permissionsFor: () => ({ has: () => true, ViewChannel: true, SendMessages: true }),
    };
    channels.set(id, ch);
    return ch;
  };
  mkCh('C1', 'general', 0);
  mkCh('C2', 'candidatures', 0);
  mkCh('V1', 'Créer un vocal', 2);
  mkCh('CAT1', 'Tickets', 4);
  const roles = new Map();
  const mkRole = (id, name) => { const r = { id, name, hexColor: '#5865F2', toString: () => `@${name}` }; roles.set(id, r); return r; };
  mkRole('R1', 'Staff');
  mkRole('R2', 'Modo');
  // Les caches Discord sont des « Collections » : get() + find() + values()
  const coll = (map) => ({
    get: (k) => map.get(k),
    has: (k) => map.has(k),
    find: (fn) => [...map.values()].find(fn),
    values: () => map.values(),
  });
  return {
    id: 'G1', name: 'Serveur Test', ownerId: 'u1', memberCount: 3,
    channels: { cache: coll(channels) },
    roles: { cache: coll(roles), everyone: { id: 'G1' } },
    members: { cache: new Map(), fetch: async () => null, me: null },
  };
}

function fakeInteraction(over = {}) {
  const user = over.user || { id: 'u1', tag: 'U#0001', username: 'U', bot: false, displayAvatarURL: () => '' };
  const member = over.member || { id: user.id, user, permissions: { has: () => true }, roles: { cache: new Map() }, voice: { setChannel: async () => ({}) }, displayName: 'U' };
  const guild = over.guild || fakeGuild();
  const i = {
    replied: false, deferred: false, replies: [],
    commandName: '', customId: '', values: [],
    fields: { getTextInputValue: () => '' },
    user, member, guild,
    channel: { id: 'C1', name: 'general', isTextBased: () => true, send: async () => ({}) },
    client: { user: { id: 'bot1' } },
    message: { id: 'msg-x', edit: async () => ({}), embeds: [], content: '' },
    options: {
      getString: () => null, getInteger: () => null, getUser: () => null,
      getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null,
      getMember: () => null,
    },
    reply: async function (p) { this.replied = true; this.replies.push(['reply', p]); this.lastMsg = { id: 'msg-' + (1000 + this.replies.length) }; return this.lastMsg; },
    update: async function (p) { this.replied = true; this.replies.push(['update', p]); return { id: 'msg-x' }; },
    showModal: async function (p) { this.replied = true; this.replies.push(['modal', p]); },
    deferReply: async function () { this.deferred = true; },
    deferUpdate: async function () { this.deferred = true; },
    isRepliable: () => true,
    isChatInputCommand: function () { return !!this.isChat; },
    isButton: function () { return !!this.isBtn; },
    isStringSelectMenu: function () { return !!this.isSelect; },
    isRoleSelectMenu: function () { return !!this.isRoleSelect; },
    isChannelSelectMenu: () => false,
    isModalSubmit: function () { return !!this.isModal; },
  };
  return Object.assign(i, over);
}

const okReply = (i) => {
  const last = i.replies[i.replies.length - 1];
  const text = String(last && last[1] ? (last[1].content || '') : '');
  return i.replied && !text.includes('Une erreur est survenue en traitant') && !text.includes('⚠️ Une erreur est survenue');
};

// ---------------------- Simulation de toutes les commandes ----------------------
(async () => {
  const store = require('../server/db');
  const extra = require('../server/discord/extra');
  const panels = require('../server/discord/panels');
  const BOT = 1;

  // --- Un emoji INVALIDE déjà stocké ne doit plus casser l'assistant ---
  store.tickets.set(BOT, 'G1', { types: JSON.stringify([{ label: 'Bug', emoji: 'mauvais!!', category: '', staff_roles: [] }]) });
  let i = fakeInteraction({ isChat: true, commandName: 'ticket' });
  i.options.getSubcommandGroup = () => 'types';
  i.options.getSubcommand = () => 'setup';
  await panels.dispatchPanels(BOT, i);
  check('wizard types setup : répond même avec un emoji invalide stocké', i.replied && i.replies.length === 1 && i.replies[0][0] === 'reply');
  store.tickets.set(BOT, 'G1', { types: JSON.stringify([]) });

  // --- Assistant complet /ticket types setup (bout en bout) ---
  const wizard = async (label, over, expectType) => {
    const w = fakeInteraction(over);
    await panels.dispatchPanels(BOT, w);
    const last = w.replies[w.replies.length - 1];
    const typeOk = !last || last[0] === expectType || expectType === 'any';
    check(label, w.replied && typeOk);
    return w;
  };
  // 1) démarrage
  const w0 = await wizard('wizard : démarrage', { isChat: true, commandName: 'ticket', options: { getSubcommandGroup: () => 'types', getSubcommand: () => 'setup' } }, 'reply');
  check('wizard : le menu de départ contient des composants', w0.replies[0] && Array.isArray(w0.replies[0][1].components) && w0.replies[0][1].components.length >= 1);
  // 2) nouveau type (modal nom)
  await wizard('wizard : ➕ Nouveau type → modale', { isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['__new__'] }, 'modal');
  // 3) soumission du nom
  const wName = fakeInteraction({ isModal: true, customId: `bdw-tm:${BOT}:u1`, fields: { getTextInputValue: () => 'Support' } });
  await panels.dispatchPanels(BOT, wName);
  check('wizard : nom du type enregistré', wName.replied && store.tickets.get(BOT, 'G1').types.includes('Support'));
  // 4-5) changer l'emoji → modale (l'assistant est déjà sur le type « Support »)
  await wizard('wizard : action emoji → modale', { isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['emoji'] }, 'modal');
  // 6) emoji INVALIDE refusé
  const wBad = fakeInteraction({ isModal: true, customId: `bdw-tm:${BOT}:u1`, fields: { getTextInputValue: () => 'pas un emoji' } });
  await panels.dispatchPanels(BOT, wBad);
  const typesAfter = JSON.parse(store.tickets.get(BOT, 'G1').types);
  check('wizard : emoji invalide refusé (pas stocké)', wBad.replied && typesAfter[0].emoji === '');
  // 7) emoji valide
  await wizard('wizard : action emoji (2e fois) → modale', { isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['emoji'] }, 'modal');
  const wGood = fakeInteraction({ isModal: true, customId: `bdw-tm:${BOT}:u1`, fields: { getTextInputValue: () => '🤝' } });
  await panels.dispatchPanels(BOT, wGood);
  check('wizard : emoji valide stocké', wGood.replied && JSON.parse(store.tickets.get(BOT, 'G1').types)[0].emoji === '🤝');
  // 8) ajouter un rôle staff (sélecteur de rôle natif)
  await wizard('wizard : ➕ rôle staff → sélecteur', { isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['addrole'] }, 'update');
  const wRole = fakeInteraction({ isRoleSelect: true, customId: `bdw-tr:${BOT}:u1`, values: ['R1'] });
  await panels.dispatchPanels(BOT, wRole);
  check('wizard : rôle staff ajouté', wRole.replied && JSON.parse(store.tickets.get(BOT, 'G1').types)[0].staff_roles.includes('Staff'));
  // 9) terminer les rôles
  await wizard('wizard : bouton ✅ Terminé', { isBtn: true, customId: `bdw-tb:${BOT}:u1:doneroles` }, 'update');
  // 10) retirer le rôle
  await wizard('wizard : ➖ retirer un rôle', { isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['removerole'] }, 'update');
  const wRem = fakeInteraction({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['Staff'] });
  await panels.dispatchPanels(BOT, wRem);
  check('wizard : rôle retiré', wRem.replied && JSON.parse(store.tickets.get(BOT, 'G1').types)[0].staff_roles.length === 0);
  // 11) supprimer le type (confirmation)
  await wizard('wizard : 🗑 supprimer → confirmation', { isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['delete'] }, 'update');
  await wizard('wizard : confirmation suppression', { isBtn: true, customId: `bdw-tb:${BOT}:u1:confirmdel` }, 'update');
  check('wizard : type supprimé', JSON.parse(store.tickets.get(BOT, 'G1').types).length === 0);
  // 12) bouton Terminer de l'écran principal
  const wDone = await wizard('wizard : ✅ Terminer (fin)', { isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['__done__'] }, 'update');
  const donePayload = wDone.replies[wDone.replies.length - 1][1];
  check('wizard : écran final « Terminé » sans composants', donePayload.components && donePayload.components.length === 0);

  // --- /ticket setup (assistant principal) ---
  const wSetup = fakeInteraction({ isChat: true, commandName: 'ticket' });
  wSetup.options.getSubcommandGroup = () => null;
  wSetup.options.getSubcommand = () => 'setup';
  await panels.dispatchPanels(BOT, wSetup);
  check('/ticket setup : répond avec le menu de l\'assistant', wSetup.replied && wSetup.replies[0][0] === 'reply');

  // --- /roles list + send ---
  store.roleMenus.create({ bot_id: BOT, guild_id: 'G1', name: 'Menu', channel: 'C1', options: JSON.stringify([{ label: 'Staff', emoji: '🛡️', role: 'Staff' }]) });
  const wRoles = fakeInteraction({ isChat: true, commandName: 'roles' });
  wRoles.options.getSubcommand = () => 'list';
  await panels.dispatchPanels(BOT, wRoles);
  check('/roles list : répond', okReply(wRoles));
  const wSend = fakeInteraction({ isChat: true, commandName: 'roles' });
  wSend.options.getSubcommand = () => 'send';
  wSend.options.getInteger = (k) => (k === 'numero' ? 1 : null);
  await panels.dispatchPanels(BOT, wSend);
  check('/roles send : répond et envoie le menu', okReply(wSend) && wSend.replies[0][1].content.includes('envoyé'));

  // ================= EXTRA : toutes les commandes =================
  const chat = (name, opts = {}) => fakeInteraction({ isChat: true, commandName: name, options: { getString: (k) => (opts.str && opts.str[k]) || null, getInteger: (k) => (opts.int && opts.int[k]) || null, getUser: () => opts.user || null, getChannel: () => opts.channel || null } });

  const runCmd = async (label, name, opts, extraAssert) => {
    const x = chat(name, opts);
    await extra.handleInteraction(BOT, {}, x);
    check(label, okReply(x) && (!extraAssert || extraAssert(x)));
    return x;
  };

  const u2 = { id: 'u2', tag: 'B#0001', username: 'B', bot: false, displayAvatarURL: () => '', toString: () => '<@u2>' };
  await runCmd('/marry : demande envoyée', 'marry', { user: u2 });
  const m = store.marriages.get(BOT, 'G1', 'u1');
  check('/marry : pas encore marié (attente de la réponse)', !m);
  await runCmd('/divorce : célibataire → message', 'divorce', {});
  await runCmd('/couple : célibataire → message', 'couple', {});
  for (const a of ['hug', 'kiss', 'slap', 'pat', 'punch']) await runCmd(`/${a} : répond`, a, { user: u2 });
  await runCmd('/rps : répond', 'rps', { str: { choix: 'pierre' } });
  await runCmd('/pendu : partie lancée', 'pendu', {}, (x) => x.replies[0][1].components.length === 2);
  await runCmd('/morpion : partie lancée', 'morpion', { user: u2 });
  await runCmd('/birthday set : enregistré', 'birthday', { str: { action: 'set' }, int: { jour: 14, mois: 7 } });
  check('/birthday : stocké', !!store.birthdays.get(BOT, 'G1', 'u1'));
  await runCmd('/birthday list : répond', 'birthday', { str: { action: 'list' } });
  await runCmd('/birthday remove : répond', 'birthday', { str: { action: 'remove' } });
  await runCmd('/remind : répond', 'remind', { str: { duree: '2h', texte: 'test' } });
  const pollMsg = await runCmd('/poll : créé', 'poll', { str: { question: 'Pizza ?', choix: 'Oui | Non' } });
  check('/poll : réponse avec composants', pollMsg.replies[0][1].components && pollMsg.replies[0][1].components.length === 1);
  // snipe : pré-remplir le cache
  extra.trackDeleted(BOT, { guild: { id: 'G1' }, channel: { id: 'C1' }, author: { tag: 'X#1', username: 'X', displayAvatarURL: () => '' }, content: 'coucou', attachments: { size: 0 } });
  await runCmd('/snipe : répond', 'snipe', {});
  await runCmd('/work : répond', 'work', {});
  await runCmd('/gamble : répond (solde insuffisant)', 'gamble', { int: { montant: 100 } });
  await runCmd('/rob : répond (cible pauvre)', 'rob', { user: u2 });
  await runCmd('/lockdown on : répond', 'lockdown', { str: { action: 'on' } });
  const gs = store.guildSettings.get(BOT, 'G1');
  check('/lockdown : salons verrouillés stockés', !!gs && JSON.parse(gs.lockdown_channels).length === 2);
  await runCmd('/lockdown off : répond', 'lockdown', { str: { action: 'off' } });
  await runCmd('/voicetemp set : répond', 'voicetemp', { str: { action: 'set' }, channel: { id: 'V1', type: 2 } });
  await runCmd('/voicetemp view : répond', 'voicetemp', { str: { action: 'view' } });
  await runCmd('/voicetemp off : répond', 'voicetemp', { str: { action: 'off' } });
  await runCmd('/apply set : répond', 'apply', { str: { action: 'set' }, channel: { id: 'C2', isTextBased: () => true } });
  await runCmd('/apply question : répond', 'apply', { str: { action: 'question', texte: 'Quel âge as-tu ?' } });
  await runCmd('/apply view : répond', 'apply', { str: { action: 'view' } });
  await runCmd('/apply panel : répond avec bouton', 'apply', { str: { action: 'panel' } });

  // ================= BOUTONS =================
  // mariage : accepter (l'utilisateur ciblé clique)
  await runCmd('/marry : nouvelle demande', 'marry', { user: u2 });
  const wAcc = fakeInteraction({ isBtn: true, customId: `hx:marry:G1:a:u1:u2`, user: u2, member: { id: 'u2', user: u2, permissions: { has: () => true }, roles: { cache: new Map() } } });
  await extra.handleInteraction(BOT, {}, wAcc);
  check('bouton 💍 Accepter : mariage créé + message mis à jour', okReply(wAcc) && !!store.marriages.get(BOT, 'G1', 'u1'));
  // mariage : refuser (autre couple)
  await runCmd('/marry : demande pour refus', 'marry', { user: u2 });
  // u1 doit divorcer d'abord — simulons un autre membre u3
  const u3 = { id: 'u3', tag: 'C#0001', username: 'C', bot: false, displayAvatarURL: () => '', toString: () => '<@u3>' };
  const wRef = fakeInteraction({ isBtn: true, customId: `hx:marry:G1:r:u3:u2`, user: u2, member: { id: 'u2', user: u2, permissions: { has: () => true }, roles: { cache: new Map() } } });
  await extra.handleInteraction(BOT, {}, wRef);
  check('bouton 💔 Refuser : répond', okReply(wRef));
  // pendu : 26 lettres, chaque clic répond
  const penduRun = chat('pendu', {});
  await extra.handleInteraction(BOT, {}, penduRun);
  const penduId = penduRun.lastMsg ? penduRun.lastMsg.id : 'msg-1001';
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let penduOk = true;
  for (const l of letters) {
    const wL = fakeInteraction({ isBtn: true, customId: `hx:pendu:G1:${l}`, message: { id: penduId, edit: async () => ({}), embeds: [], content: '' } });
    await extra.handleInteraction(BOT, {}, wL);
    if (!wL.replied) { penduOk = false; break; }
  }
  check('pendu : 26 clics de lettres = 26 réponses', penduOk);
  // morpion : déroulé d'une partie complète
  const morpionRun = chat('morpion', { user: u2 });
  await extra.handleInteraction(BOT, {}, morpionRun);
  const mMsgId = morpionRun.lastMsg ? morpionRun.lastMsg.id : 'msg-1002';
  const mUser = (id) => ({ id, tag: '#' + id, username: id, bot: false, displayAvatarURL: () => '' });
  const click = async (cell, uid) => {
    const w = fakeInteraction({ isBtn: true, customId: `hx:morpion:G1:${cell}`, user: mUser(uid), member: { id: uid, user: mUser(uid), permissions: { has: () => true }, roles: { cache: new Map() } }, message: { id: mMsgId, edit: async () => ({}), embeds: [], content: '' } });
    await extra.handleInteraction(BOT, {}, w);
    return w.replied;
  };
  const game = [await click(0, 'u1'), await click(4, 'u2'), await click(1, 'u1'), await click(5, 'u2'), await click(2, 'u1')];
  check('morpion : partie complète — chaque coup répond', game.every(Boolean));
  // poll : vote
  const pollRun = chat('poll', { str: { question: 'Q ?', choix: 'A | B' } });
  await extra.handleInteraction(BOT, {}, pollRun);
  const pollMsgId = pollRun.lastMsg ? pollRun.lastMsg.id : 'msg-1003';
  const wVote = fakeInteraction({ isBtn: true, customId: `hx:poll:G1:0`, message: { id: pollMsgId, edit: async () => ({}), embeds: [], content: '' } });
  await extra.handleInteraction(BOT, {}, wVote);
  check('poll : vote → mise à jour', okReply(wVote));
  // candidature : bouton → modale → soumission → décision
  const wApplyBtn = fakeInteraction({ isBtn: true, customId: `hx:apply:G1` });
  await extra.handleInteraction(BOT, {}, wApplyBtn);
  check('apply : bouton → modale ouverte', wApplyBtn.replied && wApplyBtn.replies[0][0] === 'modal');
  const wApplyModal = fakeInteraction({ isModal: true, customId: `hxapply:G1`, fields: { getTextInputValue: () => 'J\'ai 20 ans' } });
  await extra.handleInteraction(BOT, {}, wApplyModal);
  check('apply : modale soumise → candidature envoyée + réponse', okReply(wApplyModal));
  const wApplyAccept = fakeInteraction({ isBtn: true, customId: `hx:applyd:G1:accept:u2`, message: { id: 'msg-app', edit: async () => ({}), embeds: [{ title: '📝 Candidature', description: 'x' }], content: '' } });
  await extra.handleInteraction(BOT, {}, wApplyAccept);
  check('apply : décision ✅ Accepter → mise à jour', okReply(wApplyAccept));
  const wApplyRefuse = fakeInteraction({ isBtn: true, customId: `hx:applyd:G1:refuse:u2`, message: { id: 'msg-app2', edit: async () => ({}), embeds: [{ title: '📝 Candidature', description: 'x' }], content: '' } });
  await extra.handleInteraction(BOT, {}, wApplyRefuse);
  check('apply : décision ❌ Refuser → mise à jour', okReply(wApplyRefuse));

  // ================= DASHBOARD TICKETS (aperçu + rôles en listes) =================
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
    url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const wdom = dom.window;
  global.window = wdom; global.document = wdom.document; global.navigator = wdom.navigator; global.location = wdom.location;
  wdom.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body) => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith('/guilds/G1')) return resp({
      guild: { id: 'G1', name: 'S', members: 5 },
      channels: [{ id: 'C1', name: 'support' }, { id: 'CAT1', name: 'Tickets', category: true }],
      roles: [{ id: 'R1', name: 'Staff' }, { id: 'R2', name: 'Modo' }],
      settings: {}, tickets: { message: 'Besoin d\'aide ?', button_label: '🎫 Ouvrir un ticket', button_style: '3', require_reason: 1, support_role: 'Staff', category: 'Tickets', types: [{ label: 'Support', emoji: '🤝', category: '', staff_roles: ['Staff'] }] },
      tickets_stats: { total: 1, open: 0 }, events: { defs: {}, state: {} }, role_menus: [], xp_roles: [], profile: {}, blacklist: [], voicetemp: {}, applications: {}, scheduled: [], log_events: {},
    });
    return resp({ ok: true });
  };
  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');
  wdom.eval(code + '\n;\n' + String.raw`
  window.__r = (async () => {
    Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!' }, guildId: 'G1', module: 'tickets' };
    const gdata = await App.api('/bots/1/guilds/G1');
    const c = document.createElement('div');
    await Dashboard.renderers.tickets(c, gdata);
    return {
      preview: !!c.querySelector('#t-preview'),
      previewHasDropdown: c.querySelector('#t-preview') && c.querySelector('#t-preview').textContent.includes('Support'),
      roleSelect: !!c.querySelector('.t-role-sel'),
      categorySelect: !!c.querySelector('[data-k="categorySel"]'),
      emojiErr: !!c.querySelector('[data-emojierr]'),
      stats: c.textContent.includes('Ouverts en ce moment'),
    };
  })();
  `);
  await new Promise((r) => setTimeout(r, 2500));
  const dashRes = await wdom.__r;
  console.log(JSON.stringify(dashRes, null, 2));
  check('dashboard tickets : aperçu en direct', dashRes.preview);
  check('dashboard tickets : aperçu montre les types (menu déroulant)', dashRes.previewHasDropdown);
  check('dashboard tickets : rôles staff en menus déroulants', dashRes.roleSelect);
  check('dashboard tickets : catégorie en menu déroulant', dashRes.categorySelect);
  check('dashboard tickets : alerte emoji invalide', dashRes.emojiErr);
  check('dashboard tickets : bandeau de stats', dashRes.stats);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V34 — TOUTES les commandes et TOUS les boutons répondent. Plus jamais « L\'application ne répond pas ». 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
