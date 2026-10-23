// ============================================================
// v379 — Salon de ticket d'Optimus : les cartes des captures du 22/10
//   1. Carte d'en-tête : 🎫 Ticket #11, Ouvert par, Statut, Type, Raison citée
//   2. Prise en charge : bouton grisé + ligne Statut réécrite + annonce
//   3. Ajouter un membre : carte + sélecteur natif (1 à 10 personnes)
//   4. Retirer un membre : carte « Aucun membre à retirer » / liste réelle
//   5. Fermer : raison → confirmation → compte à rebours 5 s → suppression
//   6. Transcription déposée dans le salon de logs
// Aucun réseau, aucun Discord : les interactions sont simulées.
// ============================================================
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v379-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const i18n = require('../server/i18n');
const v2 = require('./helpers/v2');

let ok = 0;
let ko = 0;
const failures = [];
const check = (label, cond, extra) => {
  if (cond) { ok++; console.log(`  ✅ ${label}`); return true; }
  ko++; failures.push(label);
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};

const BOT = store.bots.create({
  user_id: store.users.create('discord:v379@x', 'x', {}),
  name: 'Optimus Prime', token: 'T', client_id: '1', prefix: '!',
});
const GUILD = 'G379';
const STAFF = 'STAFF1';
const OPENER = '100000000000000001';

const TICKET_ID = 'CH379';
const LOGS_ID = '900000000000000001';

// ---------- Serveur factice ----------
const messages = [];
const logsMessages = [];
const deleted = [];
let progressMsg = null;

const mkMember = (id, username) => ({
  id,
  nickname: null,
  displayName: username,
  user: { id, username, tag: `${username}#0001`, displayAvatarURL: () => '' },
  toString: () => `<@${id}>`,
});

const members = new Map([
  [OPENER, mkMember(OPENER, 'Fox')],
  [STAFF, mkMember(STAFF, 'Marie')],
  ['100000000000000003', mkMember('100000000000000003', 'Douma')],
]);

const overwrites = new Map();
const ticketChannel = {
  id: TICKET_ID,
  name: 'ticket-11',
  topic: 'Ticket #11 de Fox#0001 | 100000000000000001 | Test',
  isTextBased: () => true,
  permissionOverwrites: {
    cache: overwrites,
    edit: async (id) => { overwrites.set(String(id), makeOverwrite({ view: true })); },
    delete: async (id) => { overwrites.delete(String(id)); },
  },
  permissionsFor: () => ({ has: () => true }),
  messages: { fetch: async () => new Map() },
  send: async (p) => { messages.push(p); return progressMsg; },
  delete: async () => { deleted.push(TICKET_ID); },
};
const logsChannel = {
  id: LOGS_ID,
  name: 'logs',
  isTextBased: () => true,
  send: async (p) => {
    logsMessages.push(p);
    return { id: `LOGMSG${logsMessages.length}`, components: p.components || [], edit: async () => ({}) };
  },
};

// PermissionOverwrite simulé : seules les méthodes utilisées par le code.
function makeOverwrite({ view = false, send = false } = {}) {
  const flags = new Set();
  if (view) flags.add('ViewChannel');
  if (send) flags.add('SendMessage');
  return {
    type: 1,
    allow: { has: (bit) => flags.has(String(bit)).valueOf() || flags.has(permissionName(bit)) },
    deny: { has: () => false },
  };
}
// PermissionFlagsBits de discord.js est un objet de BigInt : on compare son nom.
function permissionName(bit) {
  try {
    const { PermissionFlagsBits } = require('discord.js');
    return Object.keys(PermissionFlagsBits).find((k) => PermissionFlagsBits[k] === bit) || '';
  } catch { return ''; }
}

const guild = {
  id: GUILD,
  name: 'Optimus Serveur',
  ownerId: 'OWNER',
  roles: {
    cache: {
      get: (id) => (id === 'R1' ? { id: 'R1', name: 'Staff', toString: () => '@Staff' } : null),
      find: (fn) => [{ id: 'R1', name: 'Staff' }].find(fn),
      has: () => true,
    },
  },
  channels: {
    cache: {
      get: (id) => (id === TICKET_ID ? ticketChannel : (id === LOGS_ID ? logsChannel : null)),
      find: (fn) => [ticketChannel, logsChannel].find(fn),
      values: () => [ticketChannel, logsChannel].values(),
    },
    create: async () => ticketChannel,
  },
  members: { cache: members, fetch: async (id) => members.get(String(id)) || null },
};

// ---------- Interaction factice ----------
function withPredicates(obj, which) {
  const base = {
    ...obj,
    isChatInputCommand: () => which === 'chat',
    isButton: () => which === 'button',
    isStringSelectMenu: () => which === 'select',
    isUserSelectMenu: () => which === 'userSelect',
    isAnySelectMenu: () => which === 'select' || which === 'userSelect',
    isModalSubmit: () => which === 'modal',
    isRepliable: () => true,
    deferred: false,
    replied: false,
  };
  return new Proxy(base, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && /^is[A-Z]/.test(prop)) return () => false;
      return undefined;
    },
  });
}

function mkInteraction(which, { customId = '', values = [], value = '', user = STAFF, channel = ticketChannel } = {}) {
  const replyLog = [];
  const proxy = withPredicates({
    id: 'I379',
    customId,
    values,
    channel,
    guild,
    user: { id: user, tag: `${user}#0001`, username: user, bot: false },
    member: {
      user: { id: user, tag: `${user}#0001` },
      roles: { cache: { has: (id) => id === 'R1' } },
      permissions: { has: () => false },
    },
    client: {
      user: { id: 'BOTID379' },
      users: { fetch: async (id) => ({ id, send: async () => ({}), displayAvatarURL: () => '' }) },
    },
    fields: { getTextInputValue: () => value },
    options: { getString: () => null, getUser: () => null, getSubcommand: () => null },
    replyLog,
    modals: [],
  }, which);
  // ⚠️ les propriétés sont écrites SUR le proxy : le Proxy n'a pas de piège
  // `set`, elles atterrissent donc sur sa cible et restent lisibles.
  proxy.reply = async (p) => { proxy.replied = p; replyLog.push(p); return {}; };
  proxy.editReply = async (p) => { proxy.edited = p; replyLog.push(p); return {}; };
  proxy.update = async (p) => { proxy.updated = p; replyLog.push(p); return {}; };
  proxy.followUp = async (p) => { proxy.followed = p; replyLog.push(p); return {}; };
  proxy.deferReply = async () => { proxy.deferred = true; };
  proxy.deferUpdate = async () => { proxy.deferredUpdate = true; };
  proxy.showModal = async (m) => { proxy.modal = m; proxy.modals.push(m); };
  return proxy;
}

const allText = (p) => v2.allText(p || {});
const json = (p) => v2.json(p || {});

(async () => {
  // ---------- Configuration du bot ----------
  store.settings.set('public_url', 'https://hoxera.is-a.dev');
  store.tickets.set(BOT, GUILD, {
    support_role: 'Staff',
    types: JSON.stringify([{ label: 'Test', emoji: '🧠', description: '', staff_roles: [] }]),
    require_reason: 0,
  });
  store.guildSettings.set(BOT, GUILD, {
    log_channel: LOGS_ID,
    ticket_log_channel: '',
  });
  store.openTickets.add(BOT, GUILD, {
    channel_id: TICKET_ID, number: 11, opener_id: OPENER,
    opener_tag: 'Fox#0001', open_reason: 'Connexion impossible', type_label: 'Test',
  });
  overwrites.set(OPENER, makeOverwrite({ view: true, send: true }));

  // ═══════════════════════════════════════════════════════════════
  console.log('\n1) Carte du ticket — mêmes lignes que la capture');
  // ═══════════════════════════════════════════════════════════════
  const opener = members.get(OPENER);
  const chosen = { label: 'Test', emoji: '🧠', description: '', staff_roles: [] };
  const cardOpen = panels.ticketWelcomePanel(
    opener, chosen, '<@&R1>', 'Bonjour Mr j’arrive pas j’ai gros problème', '', [], 'fr',
    { number: 11 }, {}, { rows: panels.__testStaffTicketRows(BOT, false, 'fr') },
  );
  const cardText = allText(cardOpen);
  check('titre « 🎫 Ticket #11 »', v2.title(cardOpen) === '🎫 Ticket #11');
  check('un trait pleine largeur sous le titre', v2.dividers(cardOpen) === 1);
  check('ligne Ouvert par', cardText.includes('👤 **Ouvert par :** <@100000000000000001>'));
  check('ligne Statut (en attente)', cardText.includes('⏳ **Statut :** en attente'));
  check('ligne Type avec l’emoji du type', cardText.includes('🏷 **Type :** 🧠 Test'));
  check('ligne Raison + bloc de code', cardText.includes('📄 **Raison :**')
    && cardText.includes('```\nBonjour Mr j’arrive pas j’ai gros problème'));
  check('aucun séparateur entre les lignes de la carte',
    (cardText.match(/━━/g) || []).length === 0 && !cardText.includes('\n\n'));
  const cardJson = json(cardOpen);
  check('bouton « Pris en charge » (Primary, actif)',
    cardJson.includes('"label":"🖐️ Pris en charge"') && cardJson.includes('"style":1')
      && !cardJson.includes('"disabled":true'));
  check('menu « Gérer ce ticket… » sans engrenage', cardJson.includes('"placeholder":"Gérer ce ticket…"'));
  check('menu : 5 actions, sans « Supprimer définitivement »',
    ['hold', 'reopen', 'addmember', 'removemember', 'close'].every((v) => cardJson.includes(`"value":"${v}"`))
      && !cardJson.includes('"value":"delete"'));
  check('menu : « Fermer le ticket » est la dernière action',
    (cardJson.match(/"value":"([a-z]+)"/g) || []).pop() === '"value":"close"',
    JSON.stringify((cardJson.match(/"value":"([a-z]+)"/g) || []).slice(-2)));
  check('bouton au-dessus du menu', v2.rows(cardOpen).length === 2
    && v2.rows(cardOpen)[0].components[0].type === 2
    && v2.rows(cardOpen)[1].components[0].type === 3);
  check('aucune ligne colorée ni pied', v2.accentColor(cardOpen) === undefined && v2.footer(cardOpen) === '');

  const cardClaimed = panels.ticketWelcomePanel(
    opener, chosen, '', 'raison', '', [], 'fr', { number: 11 }, {},
    { rows: panels.__testStaffTicketRows(BOT, true, 'fr'), claimedBy: STAFF },
  );
  check('carte prise en charge : statut « pris en charge par @Marie »',
    allText(cardClaimed).includes('⏳ **Statut :** pris en charge par <@STAFF1>'));
  check('carte prise en charge : bouton grisé', json(cardClaimed).includes('"disabled":true'));

  // ═══════════════════════════════════════════════════════════════
  console.log('\n2) Prise en charge — bouton grisé, statut réécrit, annonce');
  // ═══════════════════════════════════════════════════════════════
  const claimI = mkInteraction('button', { customId: `bd-tmenu:${BOT}:claim` });
  claimI.message = {
    id: 'MSG-CARD',
    edited: null,
    components: [
      { type: 17, components: [
        { type: 10, content: '## 🎫 Ticket #11' },
        { type: 14, divider: true },
        { type: 10, content: '👤 **Ouvert par :** <@100000000000000001>\n⏳ **Statut :** en attente' },
        { type: 1, components: [{ type: 2, custom_id: `bd-tmenu:${BOT}:claim`, style: 1, label: '🖐️ Pris en charge' }] },
      ] },
    ],
    toJSON() { return this.components; },
    edit: async (p) => { claimI.message.edited = p; return {}; },
  };
  await panels.dispatchPanels(BOT, claimI);
  check('bouton désactivé sur le panneau', !!claimI.message.edited
    && JSON.stringify(claimI.message.edited.components).includes('"disabled":true'));
  check('ligne Statut réécrite', JSON.stringify(claimI.message.edited.components)
    .includes('⏳ **Statut :** pris en charge par <@STAFF1>'));
  check('annonce « 🔔 Ticket pris en charge » envoyée dans le salon',
    messages.some((m) => v2.title(m) === '🔔 Ticket pris en charge'
      && allText(m).includes('s’occupe désormais de ce ticket.')));

  // ═══════════════════════════════════════════════════════════════
  console.log('\n3) Ajouter un membre — carte + sélecteur natif');
  // ═══════════════════════════════════════════════════════════════
  const addAsk = mkInteraction('select', { customId: `bd-troom:${BOT}`, values: ['addmember'] });
  await panels.dispatchPanels(BOT, addAsk);
  const addJson = json(addAsk.replied);
  check('carte « ➕ Ajouter un membre au ticket »',
    v2.title(addAsk.replied) === '➕ Ajouter un membre au ticket'
      && allText(addAsk.replied).includes('Choisis une ou plusieurs personnes dans la liste'));
  check('sélecteur natif de membres (type 5)', addJson.includes('"type":5') && addJson.includes(`"custom_id":"bd-taddsel:${BOT}"`));
  check('placeholder « 👥 Choisis le(s) membre(s) à ajouter »', addJson.includes('"placeholder":"👥 Choisis le(s) membre(s) à ajouter"'));
  check('au moins 1 et jusqu’à 10 membres', addJson.includes('"min_values":1') && addJson.includes('"max_values":10'));
  check('carte éphémère (visible par le staff seul)', (Number(addAsk.replied.flags) & 64) !== 0);

  const addSel = mkInteraction('userSelect', {
    customId: `bd-taddsel:${BOT}`,
    values: ['100000000000000003'],
  });
  await panels.dispatchPanels(BOT, addSel);
  check('accès accordé au membre choisi', overwrites.has('100000000000000003'));
  check('confirmation « ✅ Membres ajoutés au ticket »',
    v2.title(addSel.edited) === '✅ Membres ajoutés au ticket'
      && allText(addSel.edited).includes('<@100000000000000003>'));

  // ═══════════════════════════════════════════════════════════════
  console.log('\n4) Retirer un membre — carte vide, puis liste réelle');
  // ═══════════════════════════════════════════════════════════════
  // Aucun membre ajouté : on retire celui du test précédent.
  overwrites.delete('100000000000000003');
  const removeEmpty = mkInteraction('select', { customId: `bd-troom:${BOT}`, values: ['removemember'] });
  await panels.dispatchPanels(BOT, removeEmpty);
  check('carte « 👥 Aucun membre à retirer »', v2.title(removeEmpty.replied) === '👥 Aucun membre à retirer');
  const descEmpty = v2.texts(removeEmpty.replied).filter((t) => !t.startsWith('### ')).join('\n');
  check('texte exact de la capture',
    descEmpty === 'Seuls les membres ajoutés au ticket apparaissent ici. Utilise « ➕ Ajouter un membre » d’abord.',
    JSON.stringify(descEmpty));
  check('aucun menu quand la liste est vide', v2.rows(removeEmpty.replied).length === 0);

  overwrites.set('100000000000000003', makeOverwrite({ view: true, send: true }));
  const removeList = mkInteraction('select', { customId: `bd-troom:${BOT}`, values: ['removemember'] });
  await panels.dispatchPanels(BOT, removeList);
  const removeJson = json(removeList.replied);
  check('carte « ➖ Retirer un membre du ticket »', v2.title(removeList.replied) === '➖ Retirer un membre du ticket');
  check('le membre ajouté est proposé (le créateur ne l’est pas)',
    removeJson.includes('"value":"100000000000000003"') && !removeJson.includes(`"value":"${OPENER}"`));
  const pick = mkInteraction('select', { customId: `bd-trempick:${BOT}`, values: ['100000000000000003'] });
  await panels.dispatchPanels(BOT, pick);
  check('accès retiré', !overwrites.has('100000000000000003'));
  check('confirmation « ✅ Membre retiré du ticket »', v2.title(pick.edited) === '✅ Membre retiré du ticket');

  // ═══════════════════════════════════════════════════════════════
  console.log('\n5) Fermer — raison, confirmation, compte à rebours 5 s');
  // ═══════════════════════════════════════════════════════════════
  const closeAsk = mkInteraction('select', { customId: `bd-troom:${BOT}`, values: ['close'] });
  await panels.dispatchPanels(BOT, closeAsk);
  check('la fermeture ouvre la fenêtre de raison', !!closeAsk.modal);
  check('fenêtre intitulée « 🔒 Fermer le ticket »',
    String(closeAsk.modal.data && closeAsk.modal.data.title).includes('Fermer le ticket'));

  const closeModal = mkInteraction('modal', { customId: `bd-tcls:${BOT}`, value: 'Ticket été fermé' });
  await panels.dispatchPanels(BOT, closeModal);
  const confirmCard = closeModal.replied;
  check('carte « 🔒 Confirmer la fermeture du ticket »', v2.title(confirmCard) === '🔒 Confirmer la fermeture du ticket');
  const confirmText = allText(confirmCard);
  check('ligne Ticket', confirmText.includes('🗓 **Ticket :** #11'));
  check('ligne Raison', confirmText.includes('📝 **Raison :** Ticket été fermé'));
  check('ligne Fermé par', confirmText.includes('👮 **Fermé par :** <@STAFF1>'));
  check('avertissement de suppression + transcription',
    confirmText.includes('⚠️ Le salon sera supprimé et une transcription sera envoyée dans le salon de logs.'));
  check('deux traits : sous le titre et avant l’avertissement', v2.dividers(confirmCard) === 2);
  const confirmJson = json(confirmCard);
  check('bouton rouge « ✅ Confirmer la fermeture »', confirmJson.includes('"label":"✅ Confirmer la fermeture"') && confirmJson.includes('"style":4'));
  check('bouton gris « ❌ Annuler »', confirmJson.includes('"label":"❌ Annuler"') && confirmJson.includes('"style":2'));
  check('les deux boutons sont sur deux rangées', v2.rows(confirmCard).length === 2);
  check('carte éphémère', (Number(confirmCard.flags) & 64) !== 0);
  check('rien n’est supprimé avant confirmation', deleted.length === 0);

  // Le message public de compte à rebours.
  progressMsg = {
    edited: null,
    edit: async (p) => { progressMsg.edited = p; return {}; },
  };
  const realSetTimeout = global.setTimeout;
  const timers = [];
  global.setTimeout = (fn, ms) => { timers.push(ms); return 0; };
  const confirm = mkInteraction('button', { customId: `bd-tclsok:${BOT}` });
  await panels.dispatchPanels(BOT, confirm);
  global.setTimeout = realSetTimeout;

  check('accusé immédiat (deferUpdate)', confirm.deferredUpdate === true);
  check('carte éphémère passée à « ⏳ Fermeture en cours… »',
    v2.title(confirm.edited) === '⏳ Fermeture en cours…');
  check('titre de la carte en « ### » (taille du texte, pas un gros titre)',
    v2.json(confirm.edited).includes('### ⏳ Fermeture en cours…'));
  check('« ⏳ Fermeture en cours… » : le titre seul, aucune phrase en dessous',
    v2.texts(confirm.edited).length === 1
    && !allText(confirm.edited).includes('La transcription est en préparation'));
  check('message public « ⏳ Fermeture en cours… » envoyé',
    messages.some((m) => v2.title(m) === '⏳ Fermeture en cours…'));
  check('compte à rebours : « Ce salon sera supprimé dans 5 secondes. »',
    allText(progressMsg.edited).includes('Ce salon sera supprimé dans 5 secondes.'));
  check('« ✅ Ticket fermé » : le compte à rebours seul, plus de phrase sur la transcription',
    v2.texts(progressMsg.edited).filter((t) => !t.startsWith('### ')).join('\n') === 'Ce salon sera supprimé dans 5 secondes.'
    && !allText(progressMsg.edited).includes('La transcription a été envoyée'),
    JSON.stringify(v2.texts(progressMsg.edited)));
  check('suppression programmée après 5 000 ms', timers.includes(5000), JSON.stringify(timers));
  check('ticket retiré des tickets ouverts', !store.openTickets.getByChannel(TICKET_ID));

  // ═══════════════════════════════════════════════════════════════
  console.log('\n6) Transcription déposée dans le salon de logs');
  // ═══════════════════════════════════════════════════════════════
  const logPayload = logsMessages.find((m) => v2.title(m) === '📄 Transcription · Ticket #11');
  check('panneau « 📄 Transcription · Ticket #11 » dans les logs', !!logPayload);
  check('fichier .txt joint', !!logPayload && Array.isArray(logPayload.files) && logPayload.files.length === 1
    && /transcription-ticket-11\.txt$/.test(logPayload.files[0].name));
  check('raison et auteur consignés', allText(logPayload).includes('Ticket été fermé')
    && allText(logPayload).includes('<@STAFF1>'));
  const whoBlock = v2.texts(logPayload).find((t) => t.includes('Ouvert par')) || '';
  check('carte de transcription : le créateur du ticket est cité en premier',
    whoBlock.startsWith(`👤 **Ouvert par :** <@${OPENER}>`)
    && whoBlock.includes('👮 **Fermé par :** <@STAFF1>'), JSON.stringify(whoBlock));
  check('carte de transcription : « Ouvert par » avant « Fermé par »',
    allText(logPayload).indexOf('Ouvert par') < allText(logPayload).indexOf('Fermé par'));
  check('aucune ligne colorée dans le panneau de logs', v2.accentColor(logPayload) === undefined);
  check('carte de transcription : titre en « ### »', v2.json(logPayload).includes('### 📄 Transcription · Ticket #11'));
  check('carte de transcription : bloc « ⭐ Évaluation » en attente',
    v2.texts(logPayload).includes('**⭐ Évaluation**\nEn attente de la note du membre…'));
  // ⭐ La note du membre réécrit AUSSI la carte de transcription du salon de logs.
  const stored = store.ticketLogMsgs.get(BOT, GUILD, 11);
  check('référence de la carte de transcription enregistrée', !!stored
    && stored.transcript_channel_id === LOGS_ID && /^LOGMSG/.test(String(stored.transcript_message_id)));
  let ratingEdit = null;
  logsChannel.messages = {
    fetch: async (id) => (String(id) === String(stored.transcript_message_id)
      ? {
        components: JSON.parse(JSON.stringify(logPayload.components.map((c) => (c.toJSON ? c.toJSON() : c)))),
        edit: async (p) => { ratingEdit = p; return {}; },
      }
      : null),
  };
  await panels.__testUpdateRecapRating(BOT, { guilds: { cache: { get: (id) => (String(id) === GUILD ? guild : undefined) } } }, GUILD, 11, 5);
  check('la note remplit le bloc « ⭐ Évaluation » de la carte de transcription',
    !!ratingEdit && v2.texts(ratingEdit).includes('**⭐ Évaluation**\n⭐⭐⭐⭐⭐ (5/5)'),
    JSON.stringify(ratingEdit && v2.texts(ratingEdit)));

  // Repli : sans journal de modération, le récapitulatif des tickets sert de
  // salon de logs (et non le MP), pour que la phrase de la carte reste vraie.
  store.guildSettings.set(BOT, GUILD, { log_channel: '', ticket_log_channel: LOGS_ID });
  logsMessages.length = 0;
  const t2 = await panels.__testSendTranscriptToLogs(BOT, guild, 'ticket-12', { text: 'x', url: '' }, { number: 12, reason: 'test', staffId: STAFF });
  check('repli : le salon du récapitulatif reçoit la transcription', t2 === true && logsMessages.length === 1);
  store.guildSettings.set(BOT, GUILD, { log_channel: LOGS_ID, ticket_log_channel: '' });

  // ═══════════════════════════════════════════════════════════════
  console.log('\n7) Textes FR/EN et versions');
  // ═══════════════════════════════════════════════════════════════
  for (const cle of [
    'ticket_card_owner', 'ticket_card_status', 'ticket_card_type', 'ticket_card_reason',
    'ticket_claim_btn', 'ticket_menu_ph', 'ticket_claimed_title', 'ticket_claimed_desc',
    'ticket_add_title', 'ticket_add_desc', 'ticket_add_select_ph',
    'ticket_remove_title', 'ticket_remove_empty_title', 'ticket_remove_empty_desc',
    'ticket_close_confirm_title', 'ticket_close_confirm_warn', 'ticket_close_confirm_yes',
    'ticket_close_confirm_no', 'ticket_close_progress_title', 'ticket_close_done_desc',
  ]) {
    const fr = i18n.t('fr', cle, { member: 'x', staff: 'x', status: 'x', type: 'x', number: 1, reason: 'x', name: 'x' });
    const en = i18n.t('en', cle, { member: 'x', staff: 'x', status: 'x', type: 'x', number: 1, reason: 'x', name: 'x' });
    check(`i18n ${cle} : FR + EN`, typeof fr === 'string' && fr !== cle && typeof en === 'string' && en !== cle);
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  check('cache public inchangé (aucun fichier servi modifié)', (html.match(/\?v=378/g) || []).length === 7);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');
  check('aucun tiret cadratin dans les nouveaux textes',
    ![/—/.test(i18n.t('fr', 'ticket_add_desc')), /—/.test(i18n.t('fr', 'ticket_remove_empty_desc')),
      /—/.test(i18n.t('fr', 'ticket_close_confirm_warn')), /—/.test(i18n.t('fr', 'ticket_claimed_desc'))].some(Boolean));

  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
  if (ko) { failures.forEach((f) => console.log('  ❌ ' + f)); process.exit(1); }
  console.log('\n✅ v379-test.js : cartes du salon de ticket conformes aux captures.');
})().catch((e) => { console.error('❌', e); process.exit(1); });
