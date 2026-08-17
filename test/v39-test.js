// ============================================================
// Test Hoxera v39 — Questionnaires personnalisés par type de ticket
//  1. Stockage/normalisation des questions (max 5, 45 car.)
//  2. Assistant /ticket types setup : ajouter/retirer des questions
//  3. Ouverture d'un ticket : modale questionnaire (obligatoire) →
//     modale raison → le salon privé contient les réponses
//  4. Sans raison activée : questionnaire → ouverture directe
//  5. Dashboard : section questionnaire par type + badge dans l'aperçu
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v39-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const panels = require('../server/discord/panels');
  const BOT = 1, G = 'G1';

  // ---------- 1. Normalisation ----------
  store.tickets.set(BOT, G, { require_reason: 1, types: JSON.stringify([
    { label: 'Recrutement', emoji: '💼', description: 'Rejoins notre équipe.', category: '', questions: ['Non RP ?', 'Quel âge as-tu ?', 'Pourquoi nous rejoindre ?'], staff_roles: [] },
  ]) });
  const n = panels.normalizeTypes(store.tickets.get(BOT, G));
  check('questions : conservées', n[0].questions.length === 3 && n[0].questions[0] === 'Non RP ?');
  check('questions : limitées à 5', panels.normalizeTypes({ types: JSON.stringify([{ label: 'X', questions: ['1', '2', '3', '4', '5', '6'] }]) })[0].questions.length === 5);
  check('questions : coupées à 45 caractères', panels.normalizeTypes({ types: JSON.stringify([{ label: 'X', questions: ['a'.repeat(80)] }]) })[0].questions[0].length === 45);

  // ---------- Fakes ----------
  const sent = [];
  const dms = [];
  const makeGuild = () => {
    const chans = new Map();
    const mk = (id, name, type) => { const c = { id, name, type, isTextBased: () => type === 0, send: async (p) => { sent.push(p); return {}; }, toString: () => '#' + name, permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) }, permissionsFor: () => ({ has: () => true }) }; chans.set(id, c); return c; };
    mk('C1', 'support', 0);
    const roles = new Map([['R1', { id: 'R1', name: 'Staff', hexColor: '#5865F2', toString: () => '@Staff', position: 10 }]]);
    const coll = (map) => ({ get: (k) => map.get(k), has: (k) => map.has(k), find: (fn) => [...map.values()].find(fn), values: () => map.values() });
    return {
      id: 'G1', name: 'Serveur', ownerId: 'u1', memberCount: 5,
      channels: {
        cache: coll(chans),
        create: async (opts) => {
          const c = { id: 'tk-1', name: opts.name, type: opts.type, topic: opts.topic, isTextBased: () => true, send: async (p) => { sent.push(p); return {}; }, toString: () => '#' + opts.name, permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) }, permissionsFor: () => ({ has: () => true }) };
          chans.set(c.id, c);
          return c;
        },
      },
      roles: { cache: coll(roles), everyone: { id: 'G1' } },
      members: { cache: new Map(), fetch: async () => null, me: { roles: { highest: { position: 100 } } } },
    };
  };
  const makeUser = (id = 'u1') => ({ id, tag: 'Alice#0001', username: 'Alice', bot: false, displayAvatarURL: () => 'https://cdn.example.com/av.png', send: async (m) => { dms.push(m); return {}; } });
  const makeI = (over = {}) => {
    const user = over.user || makeUser('u1');
    const member = over.member || { id: user.id, user, permissions: { has: () => true }, roles: { cache: new Map(), add: async () => ({}), remove: async () => ({}) } };
    const i = {
      replied: false, deferred: false, replies: [], commandName: '', customId: '', values: [],
      fields: { getTextInputValue: () => '' }, user, member, guild: makeGuild(),
      channel: { id: 'C1', name: 'support', isTextBased: () => true, send: async (p) => { sent.push(p); return {}; } },
      client: { user: { id: 'bot1' }, users: { fetch: async () => makeUser('u1') } },
      message: { id: 'msg-x', edit: async () => ({}), embeds: [], content: '' },
      options: { getString: () => null, getInteger: () => null, getUser: () => null, getChannel: () => null, getSubcommand: () => null, getSubcommandGroup: () => null },
      reply: async function (p) { this.replied = true; this.replies.push(['reply', p]); this.lastMsg = { id: 'msg-1001' }; return this.lastMsg; },
      update: async function (p) { this.replied = true; this.replies.push(['update', p]); return {}; },
      deferReply: async function () { this.deferred = true; },
      editReply: async function (p) { this.replied = true; this.replies.push(['edit', p]); return {}; },
      showModal: async function (p) { this.replied = true; this.replies.push(['modal', p]); },
      isRepliable: () => true,
      isChatInputCommand: function () { return !!this.isChat; },
      isButton: function () { return !!this.isBtn; },
      isStringSelectMenu: function () { return !!this.isSelect; },
      isRoleSelectMenu: function () { return !!this.isRoleSelect; },
      isModalSubmit: function () { return !!this.isModal; },
    };
    return Object.assign(i, over);
  };

  // ---------- 2. Assistant : questionnaire ----------
  const w0 = makeI({ isChat: true, commandName: 'ticket' });
  w0.options.getSubcommandGroup = () => 'types';
  w0.options.getSubcommand = () => 'setup';
  await panels.dispatchPanels(BOT, w0);
  // choisir le type existant « Recrutement »
  const wPick = makeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['Recrutement'] });
  await panels.dispatchPanels(BOT, wPick);
  // action « ❓ Questionnaire »
  const wQ = makeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['questions'] });
  await panels.dispatchPanels(BOT, wQ);
  check('wizard : étape questionnaire ouverte', wQ.replied && wQ.replies[0][0] === 'update');
  // ajouter une question
  const wAdd = makeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['__addq__'] });
  await panels.dispatchPanels(BOT, wAdd);
  check('wizard : ➕ question → modale', wAdd.replied && wAdd.replies[0][0] === 'modal');
  const wQVal = makeI({ isModal: true, customId: `bdw-tm:${BOT}:u1`, fields: { getTextInputValue: () => 'Ton pseudo RP ?' } });
  await panels.dispatchPanels(BOT, wQVal);
  let typesNow = JSON.parse(store.tickets.get(BOT, G).types);
  const recrut = () => typesNow.find((t) => t.label === 'Recrutement');
  check('wizard : question ajoutée (4/5)', wQVal.replied && recrut().questions.length === 4 && recrut().questions[3] === 'Ton pseudo RP ?');
  // retirer une question
  const wRem = makeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['__remq__'] });
  await panels.dispatchPanels(BOT, wRem);
  const wRemPick = makeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['Ton pseudo RP ?'] });
  await panels.dispatchPanels(BOT, wRemPick);
  typesNow = JSON.parse(store.tickets.get(BOT, G).types);
  check('wizard : question retirée', wRemPick.replied && recrut().questions.length === 3);
  // 6e question refusée
  for (let k = 0; k < 3; k++) {
    const a = makeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['__addq__'] });
    await panels.dispatchPanels(BOT, a);
    const v = makeI({ isModal: true, customId: `bdw-tm:${BOT}:u1`, fields: { getTextInputValue: () => 'Question ' + k } });
    await panels.dispatchPanels(BOT, v);
  }
  typesNow = JSON.parse(store.tickets.get(BOT, G).types);
  check('wizard : max 5 questions respecté', recrut().questions.length === 5);
  // terminer → retour à l'édition
  const wDone = makeI({ isSelect: true, customId: `bdw-ts:${BOT}:u1`, values: ['__doneq__'] });
  await panels.dispatchPanels(BOT, wDone);
  check('wizard : ✅ Terminé → retour édition', wDone.replied);

  // ---------- 3. Ouverture complète avec questionnaire ----------
  // remettre le type propre
  store.tickets.set(BOT, G, { require_reason: 1, types: JSON.stringify([
    { label: 'Recrutement', emoji: '💼', description: 'Rejoins notre équipe.', category: '', questions: ['Non RP ?', 'Quel âge as-tu ?'], staff_roles: [] },
  ]) });
  // 3a. sélection du type dans le panneau
  const wSel = makeI({ isSelect: true, customId: `bd-ttype:${BOT}`, values: ['Recrutement'] });
  await panels.dispatchPanels(BOT, wSel);
  check('ouverture : le type → modale questionnaire', wSel.replied && wSel.replies[0][0] === 'modal');
  const modalData = wSel.replies[0][1];
  check('ouverture : 2 champs obligatoires', modalData.components.length === 2);
  // 3b. soumission des réponses → modale raison
  const wAns = makeI({ isModal: true, customId: `bd-tquest:${BOT}`, fields: { getTextInputValue: (k) => (k === 'q0' ? 'Non' : '20 ans') } });
  await panels.dispatchPanels(BOT, wAns);
  const reasonModalJson = wAns.replies[0][1].toJSON ? wAns.replies[0][1].toJSON() : {};
  check('ouverture : réponses → modale raison', wAns.replied && wAns.replies[0][0] === 'modal' && reasonModalJson.custom_id === `bd-treason:${BOT}`);
  // 3c. raison → ouverture du ticket (réponse différée puis confirmation avec lien)
  const wReason = makeI({ isModal: true, customId: `bd-treason:${BOT}`, fields: { getTextInputValue: () => 'Je veux devenir modo' } });
  await panels.dispatchPanels(BOT, wReason);
  check('ouverture : ticket créé', wReason.replied && wReason.deferred);
  const lastReply = wReason.replies[wReason.replies.length - 1];
  check('ouverture : confirmation avec le lien du ticket', lastReply && lastReply[0] === 'edit' && String(lastReply[1].content).includes('Ton ticket a été créé') && String(lastReply[1].content).includes('#recrutement-alice'));
  check('ouverture : lien aussi envoyé en MP', dms.some((m) => String(m).includes('Rejoins-le ici')));
  // 🔒 Le lien du salon de ticket reste PRIVÉ : aucun message public sous le panneau
  check('ouverture : AUCUN message public sous le panneau (lien privé)', !sent.some((p) => p.content && String(p.content).includes('Ticket créé pour')));
  const ticketEmbeds = sent.filter((p) => p.embeds && p.embeds.length);
  const lastEmbed = ticketEmbeds.length ? ticketEmbeds[ticketEmbeds.length - 1].embeds[0].toJSON() : null;
  const embStr = lastEmbed ? JSON.stringify(lastEmbed) : '';
  check('salon : réponses au questionnaire affichées', embStr.includes('Réponses au questionnaire') && embStr.includes('Non RP ?') && embStr.includes('20 ans'));
  check('salon : question 1 + réponse', embStr.includes('**1. Non RP ?**') && embStr.includes('↳ Non'));
  check('salon : la raison est affichée', embStr.includes('Je veux devenir modo'));
  const meta = panels.ticketMetaFor({ id: 'tk-1' });
  check('méta : réponses conservées (transcription)', Array.isArray(meta.answers) && meta.answers.length === 2 && meta.answers[0].q === 'Non RP ?');

  // ---------- 4. Raison désactivée : questionnaire → ouverture directe ----------
  sent.length = 0;
  store.tickets.set(BOT, G, { require_reason: 0, types: JSON.stringify([
    { label: 'Recrutement', emoji: '💼', description: '', category: '', questions: ['Dispo le week-end ?'], staff_roles: [] },
  ]) });
  const wSel2 = makeI({ isSelect: true, customId: `bd-ttype:${BOT}`, values: ['Recrutement'] });
  await panels.dispatchPanels(BOT, wSel2);
  check('sans raison : modale questionnaire d\'abord', wSel2.replies[0][0] === 'modal');
  const wAns2 = makeI({ isModal: true, customId: `bd-tquest:${BOT}`, fields: { getTextInputValue: () => 'Oui' } });
  await panels.dispatchPanels(BOT, wAns2);
  const afterEmbeds = sent.filter((p) => p.embeds && p.embeds.length);
  const last2 = wAns2.replies[wAns2.replies.length - 1];
  check('sans raison : ticket ouvert directement (pas de 2e modale)', wAns2.replied && afterEmbeds.length === 1 && wAns2.replies.length === 1);
  check('sans raison : confirmation avec lien', last2 && last2[0] === 'edit' && String(last2[1].content).includes('Ton ticket a été créé'));
  check('sans raison : réponse affichée dans le salon', JSON.stringify(afterEmbeds[0].embeds[0].toJSON()).includes('Dispo le week-end ?'));

  // ---------- 5. Dashboard : questionnaire par type ----------
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', { url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
  w.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body) => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith('/guilds/G1')) return resp({
      guild: { id: 'G1', name: 'S', members: 3 },
      channels: [{ id: 'C1', name: 'support' }, { id: 'CAT1', name: 'Tickets', category: true }],
      roles: [{ id: 'R1', name: 'Staff' }],
      settings: {}, tickets: { message: '', button_label: '🎫 Ouvrir un ticket', button_style: '1', require_reason: 1, support_role: 'Staff', category: 'Tickets', types: [{ label: 'Recrutement', emoji: '💼', description: 'Rejoins-nous.', category: '', questions: ['Non RP ?', 'Âge ?'], staff_roles: ['Staff'] }] },
      tickets_stats: { total: 0, open: 0 }, events: { defs: {}, state: {} }, role_menus: [], xp_roles: [], profile: {}, blacklist: [], voicetemp: {}, applications: {}, scheduled: [], log_events: {},
    });
    return resp({ ok: true });
  };
  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');
  w.eval(code + '\n;\n' + String.raw`
  window.__r = (async () => {
    Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!' }, guildId: 'G1', module: 'tickets' };
    const gdata = await App.api('/bots/1/guilds/G1');
    const c = document.createElement('div');
    await Dashboard.renderers.tickets(c, gdata);
    return {
      addQBtn: !!c.querySelector('[data-addq]'),
      qInputs: c.querySelectorAll('.t-questions input').length,
      qValues: [...c.querySelectorAll('.t-questions input')].map((i) => i.value),
      previewBadge: c.querySelector('#t-preview') ? c.querySelector('#t-preview').textContent.includes('2 question(s)') : false,
    };
  })();
  `);
  await new Promise((r) => setTimeout(r, 2500));
  const dash = await w.__r;
  console.log(JSON.stringify(dash, null, 2));
  check('dashboard : bouton « Ajouter une question »', dash.addQBtn);
  check('dashboard : les 2 questions pré-remplies', dash.qInputs === 2 && dash.qValues.includes('Non RP ?') && dash.qValues.includes('Âge ?'));
  check('dashboard : badge « 2 question(s) » dans l\'aperçu', dash.previewBadge);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V39 — Questionnaires personnalisés par type : 100 % fonctionnels. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
