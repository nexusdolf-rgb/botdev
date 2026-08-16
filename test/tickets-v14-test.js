// Test v1.14 : assistant /ticket types setup + bouton Supprimer + statut DM honnête
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v14-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const { handlePanelCommand } = require('../server/discord/panelCommands');
const { buildSlashPayloads } = require('../server/discord/premade');

(async () => {
  store.settings.set('public_url', 'https://botdev-kqbd.onrender.com');
  store.tickets.set(1, 'G1', {
    name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket',
    support_role: 'Staff', category: 'Tickets',
    types: JSON.stringify([{ label: 'Ticket contre admin', emoji: '⚔️', category: 'Admin', staff_role: 'Admins' }]),
  });

  const roles = { R1: { id: 'R1', name: 'Staff' }, R2: { id: 'R2', name: 'Admins' } };
  const catAdmin = { id: 'CAT1', name: 'Admin', type: 4 };
  const guild = {
    id: 'G1', name: 'Serveur', ownerId: 'OWNER1',
    roles: { cache: { get: (id) => roles[id], find: (fn) => Object.values(roles).find(fn) } },
    channels: { cache: { get: (id) => (id === 'CAT1' ? catAdmin : undefined), find: () => undefined } },
    members: { me: null },
  };
  guild.channels.cache.values = function* () { yield catAdmin; };

  // ============ 1. /ticket types setup → étape « pick » avec les types + actions ============
  let lastReply, shownModal;
  const owner = {
    user: { id: 'OWNER1' },
    member: { user: { id: 'OWNER1', tag: 'Owner#1' }, permissions: { has: () => false }, roles: { cache: { has: () => false } } },
    guild, channel: { name: 'général' },
    commandName: 'ticket',
    options: { getSubcommand: () => 'setup', getSubcommandGroup: () => 'types' },
    reply: async (p) => { lastReply = p; return { id: 'WMSG' }; },
    update: async (p) => { lastReply = p; },
    showModal: async (m) => { shownModal = m; },
    isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isChatInputCommand: () => false,
  };
  await handlePanelCommand(1, owner);
  assert(lastReply.embeds[0].data.title.includes('Assistant des types'));
  const pickOpts = lastReply.components[0].components[0].options;
  const pickLabels = pickOpts.map((o) => o.data.label);
  assert(pickLabels.includes('Ticket contre admin') && pickLabels.includes('➕ Nouveau type') && pickLabels.includes('✅ Terminer'));
  console.log('1️⃣  /ticket types setup → menu :', pickLabels.join(' | '), '✅');

  // ============ 2. « ➕ Nouveau type » → modale nom ============
  const pickNew = { ...owner, customId: 'bdw-ts:1:OWNER1', isStringSelectMenu: () => true, values: ['__new__'] };
  await panels.handleTypesWizardInteraction(1, pickNew);
  assert(shownModal && shownModal.data.title.includes('Nouveau type'));
  console.log('2️⃣  ➕ Nouveau type → modale « Nom du type » ✅');

  // ============ 3. Soumission → type créé, étape edit ============
  const submitName = {
    ...owner, customId: 'bdw-tm:1:OWNER1', isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'Candidature staff' },
    reply: async (p) => { lastReply = p; },
  };
  await panels.handleTypesWizardInteraction(1, submitName);
  let types = JSON.parse(store.tickets.get(1, 'G1').types);
  assert(types.some((t) => t.label === 'Candidature staff'));
  console.log('3️⃣  Nom soumis → type créé ✅ (', types.map((t) => t.label).join(', '), ')');

  // ============ 4. Étape edit : action « rôle staff » → sélecteur de rôle natif ============
  const pickEdit = { ...owner, customId: 'bdw-ts:1:OWNER1', isStringSelectMenu: () => true, values: ['role'] };
  await panels.handleTypesWizardInteraction(1, pickEdit);
  assert(lastReply.embeds[0].data.title.includes('Rôle staff'));
  const roleSelect = lastReply.components[0].components[0];
  assert(roleSelect.data.type === 6, 'sélecteur de rôle natif attendu');
  const btnLabels = lastReply.components[1].components.map((b) => b.data.label);
  assert(btnLabels.includes('❌ Aucun rôle'));
  console.log('4️⃣  Action « 🛡️ Rôle staff » → sélecteur de rôle natif + bouton « ❌ Aucun rôle » ✅');

  // ============ 5. Sélection du rôle Admins → staff_role enregistré ============
  const rolePick = { ...owner, customId: 'bdw-tr:1:OWNER1', isRoleSelectMenu: () => true, values: ['R2'] };
  await panels.handleTypesWizardInteraction(1, rolePick);
  types = JSON.parse(store.tickets.get(1, 'G1').types);
  const cand = types.find((t) => t.label === 'Candidature staff');
  assert(cand.staff_role === 'Admins');
  console.log('5️⃣  Rôle sélectionné → staff_role = Admins ✅');

  // ============ 6. Renommer via modale ============
  const renameSel = { ...owner, customId: 'bdw-ts:1:OWNER1', isStringSelectMenu: () => true, values: ['rename'] };
  await panels.handleTypesWizardInteraction(1, renameSel);
  assert(shownModal.data.title.includes('Renommer'));
  await panels.handleTypesWizardInteraction(1, { ...owner, customId: 'bdw-tm:1:OWNER1', isModalSubmit: () => true, fields: { getTextInputValue: () => 'Recrutement staff' }, reply: async () => {} });
  types = JSON.parse(store.tickets.get(1, 'G1').types);
  assert(types.some((t) => t.label === 'Recrutement staff') && !types.some((t) => t.label === 'Candidature staff'));
  console.log('6️⃣  Renommage via modale ✅ (« Candidature staff » → « Recrutement staff »)');

  // ============ 7. Suppression via confirmation ============
  const delSel = { ...owner, customId: 'bdw-ts:1:OWNER1', isStringSelectMenu: () => true, values: ['delete'] };
  await panels.handleTypesWizardInteraction(1, delSel);
  assert(lastReply.embeds[0].data.title.includes('Supprimer'));
  const confirmBtn = { ...owner, customId: 'bdw-tb:1:OWNER1:confirmdel', isButton: () => true };
  await panels.handleTypesWizardInteraction(1, confirmBtn);
  types = JSON.parse(store.tickets.get(1, 'G1').types);
  assert(!types.some((t) => t.label === 'Recrutement staff'));
  assert(lastReply.embeds[0].data.title.includes('Assistant des types'));
  console.log('7️⃣  Suppression avec confirmation ✅');

  // ============ 8. Boutons du ticket : 2 rangées + Supprimer ============
  let welcomePayload = null;
  const ticketChannel = {
    id: 'CH1', name: 'ticket-contre-ad-x',
    topic: 'Ticket de Membre#1 | 999888777666555444 | Ticket contre admin',
    send: async (p) => { welcomePayload = p; },
    delete: async () => {}, permissionOverwrites: { edit: async () => {} },
    messages: { fetch: async () => new Map() },
  };
  const guildOpen = {
    ...guild,
    channels: {
      cache: { get: () => undefined, find: () => undefined },
      create: async (opts) => { if (opts.type === 4) return { id: 'CATX', name: opts.name }; return ticketChannel; },
    },
  };
  const openInt = {
    guild: guildOpen, user: { id: 'U1' },
    member: { user: { id: 'U1', username: 'Membre', tag: 'Membre#1' }, roles: { cache: { has: () => false } } },
    customId: 'bd-ticket:1', isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async () => {},
  };
  await panels.dispatchPanels(1, openInt);
  const row1Labels = welcomePayload.components[0].components.map((c) => c.data.label);
  const row2Labels = welcomePayload.components[1].components.map((c) => c.data.label);
  assert(row1Labels.join(',') === '🔒 Fermer,⏸ En attente,🔓 Réouvrir');
  assert(row2Labels.join(',') === '🗑 Supprimer');
  console.log('8️⃣  Boutons du ticket : [' + row1Labels.join(' | ') + '] + [' + row2Labels.join(' | ') + '] ✅');

  // ============ 9. Supprimer : confirmation → transcription MP → suppression salon ============
  let deleted = false;
  const staffUser = { id: 'R2' };
  const delChannel = { ...ticketChannel, delete: async () => { deleted = true; } };
  const staffBtn = (cid, channel) => ({
    guild, user: { id: 'STAFF1' },
    member: { user: { id: 'STAFF1' }, roles: { cache: { has: (id) => id === 'R2' } }, permissions: { has: () => false } },
    channel,
    customId: cid, isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async (p) => { lastBtnReply = p; },
    update: async (p) => { lastBtnReply = p; },
    client: { users: { fetch: async (id) => ({ id, send: async (p) => { dmPayload = p; } }) } },
  });
  let lastBtnReply, dmPayload = null;
  await panels.dispatchPanels(1, staffBtn('bd-tmenu:1:delete', delChannel));
  assert(lastBtnReply.content.includes('Supprimer définitivement'), 'confirmation demandée');
  assert(lastBtnReply.components[0].components.length === 2, 'boutons Confirmer/Annuler');
  console.log('9️⃣  🗑 Supprimer → confirmation demandée ✅');

  await panels.dispatchPanels(1, staffBtn('bd-tmenu:1:delconfirm', delChannel));
  assert(dmPayload && dmPayload.embeds[0].data.title.includes('fermé'), 'MP envoyé avant suppression');
  assert(dmPayload.files[0].name.startsWith('transcription-'), 'fichier transcription joint');
  await new Promise((r) => setTimeout(r, 2600));
  assert(deleted === true, 'salon supprimé');
  console.log('🔟  Confirmation → MP + transcription + salon supprimé ✅');

  // ============ 11. Statut honnête : DM impossible → avertissement ============
  let dmFailedReply = null;
  const noDmStaff = {
    ...staffBtn('bd-tmenu:1:close', ticketChannel),
    reply: async (p) => { dmFailedReply = p; },
    client: { users: { fetch: async () => { throw new Error('no'); } } },
  };
  noDmStaff.guild = { ...guild, members: { fetch: async () => { throw new Error('no'); } } };
  await panels.dispatchPanels(1, noDmStaff);
  assert(dmFailedReply.content.includes('⚠️'), 'avertissement visible : ' + dmFailedReply.content);
  console.log('1️⃣1️⃣  DM impossible → avertissement visible ✅ («', dmFailedReply.content, '»)');

  // ============ 12. Payload : types setup ============
  const payloads = buildSlashPayloads(1);
  const ticket = payloads.find((p) => p.name === 'ticket');
  const group = ticket.options.find((o) => o.name === 'types');
  const subs = group.options.map((o) => o.name);
  assert(subs[0] === 'setup', 'setup en premier');
  assert(subs.includes('add') && subs.includes('remove') && subs.includes('list'));
  console.log('1️⃣2️⃣  Payload : /ticket types setup ✅ (', subs.join(', '), ')');

  console.log('\n🎉 Tous les tests v1.14 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
