// Test v1.24 : plusieurs rôles staff par type de ticket + assistant + interface
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v24-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const { handlePanelCommand } = require('../server/discord/panelCommands');

(async () => {
  store.settings.set('public_url', 'https://botdev-kqbd.onrender.com');
  store.tickets.set(1, 'G1', {
    name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket',
    support_role: 'Staff', category: 'Tickets',
    types: JSON.stringify([
      { label: 'Ticket contre admin', emoji: '⚔️', category: 'Admin', staff_roles: ['Admins', 'Modos'] },
      { label: 'Signaler un bug', emoji: '🐛', category: 'Bugs', staff_roles: ['Devs'] },
    ]),
  });

  const roles = {
    R1: { id: 'R1', name: 'Staff' },
    R2: { id: 'R2', name: 'Admins' },
    R3: { id: 'R3', name: 'Modos' },
    R4: { id: 'R4', name: 'Devs' },
  };
  const roleNames = (ids) => ids.map((id) => roles[id].name);

  const fakeMessages = new Map();
  const ticketChannel = {
    id: 'CH1', name: 'ticket-contre-ad-membre',
    topic: 'Ticket de Membre#1 | 999888777666555444 | Ticket contre admin',
    send: async () => {},
    delete: async () => {},
    permissionOverwrites: { edit: async () => {} },
    messages: { fetch: async () => fakeMessages },
  };
  const guild = {
    id: 'G1', name: 'Serveur', ownerId: 'OWNER1',
    roles: { cache: { get: (id) => roles[id], find: (fn) => Object.values(roles).find(fn) } },
    channels: { cache: { get: () => undefined, find: () => undefined } },
    members: { me: null },
  };

  const staffBtn = (roleIds, cid) => ({
    guild, user: { id: 'S1' },
    member: { user: { id: 'S1', username: 'S', tag: 'S#1' }, roles: { cache: { has: (id) => roleIds.includes(id) } }, permissions: { has: () => false } },
    channel: ticketChannel, customId: cid,
    isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async (p) => { lastReply = p; },
    update: async (p) => { lastReply = p; },
    client: { users: { fetch: async (id) => ({ id, send: async () => {} }) } },
  });
  let lastReply = null;

  // ---------- 1. Un membre avec « Modos » (2e rôle staff) peut fermer ----------
  await panels.dispatchPanels(1, staffBtn(['R3'], 'bd-tmenu:1:close'));
  assert(lastReply.content.includes('fermé'), 'Modos autorisé : ' + (lastReply.content || ''));
  console.log('1️⃣  Rôle « Modos » (2ᵉ rôle du type) → fermeture AUTORISÉE ✅');

  // ---------- 2. Un membre avec « Devs » (autre type) est refusé ----------
  await panels.dispatchPanels(1, staffBtn(['R4'], 'bd-tmenu:1:close'));
  assert(lastReply.content.includes('staff'), 'Devs refusé sur un ticket admin');
  console.log('2️⃣  Rôle « Devs » (autre type) → REFUSÉ ✅');

  // ---------- 3. Ouverture : les DEUX rôles staff reçoivent les permissions ----------
  let created = null;
  const openGuild = {
    ...guild,
    channels: {
      cache: { get: () => undefined, find: () => undefined },
      create: async (opts) => {
        if (opts.type === 4) return { id: 'CATX', name: opts.name };
        created = opts;
        return { id: 'NEWCH', name: opts.name, send: async () => {}, topic: opts.topic };
      },
    },
  };
  let shownModal = null;
  const openSel = {
    guild: openGuild, user: { id: 'U1' },
    member: { user: { id: 'U1', username: 'Membre', tag: 'Membre#1' }, roles: { cache: { has: () => false } } },
    customId: 'bd-ttype:1', values: ['Ticket contre admin'],
    isStringSelectMenu: () => true, isButton: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async () => {}, showModal: async (m) => { shownModal = m; },
    client: { users: { fetch: async () => ({ send: async () => {} }) } },
  };
  await panels.dispatchPanels(1, openSel);
  assert(shownModal, 'modale raison attendue');
  await panels.dispatchPanels(1, {
    ...openSel, customId: 'bd-treason:1', isStringSelectMenu: () => false, isModalSubmit: () => true,
    fields: { getTextInputValue: () => 'test multi rôles' },
  });
  const staffPerms = created.permissionOverwrites.filter((p) => ['R2', 'R3'].includes(p.id));
  assert(staffPerms.length === 2, 'les DEUX rôles staff ont les permissions : ' + staffPerms.map((p) => p.id).join(','));
  console.log('3️⃣  Ticket ouvert : permissions données aux DEUX rôles staff ✅ (' + roleNames(staffPerms.map((p) => p.id)).join(' + ') + ')');

  // ---------- 4. Assistant : ajouter plusieurs rôles staff ----------
  const ownerWizard = (cid, extra = {}) => ({
    guild, user: { id: 'OWNER1' },
    member: { user: { id: 'OWNER1', tag: 'O#1' }, permissions: { has: () => false }, roles: { cache: { has: () => false } } },
    customId: cid,
    isButton: () => false, isModalSubmit: () => false, isStringSelectMenu: () => false,
    isRoleSelectMenu: () => false, isChatInputCommand: () => false, isChannelSelectMenu: () => false,
    reply: async (p) => { lastReply = p; return { id: 'WMSG', edit: async (q) => { lastReply = q; } }; },
    update: async (p) => { lastReply = p; },
    showModal: async (m) => { shownModal = m; },
    ...extra,
  });

  // /ticket types setup → choisir le type « Signaler un bug »
  const cmdSetup = {
    guild, user: { id: 'OWNER1' },
    member: { permissions: { has: () => false }, roles: { cache: { has: () => false } } },
    commandName: 'ticket', channel: { name: 'général' },
    options: { getSubcommand: () => 'setup', getSubcommandGroup: () => 'types' },
    reply: async (p) => { lastReply = p; return { id: 'WMSG', edit: async (q) => { lastReply = q; } }; },
    update: async (p) => { lastReply = p; },
    isChatInputCommand: () => true,
  };
  await handlePanelCommand(1, cmdSetup);
  await panels.handleTypesWizardInteraction(1, { ...ownerWizard('bdw-ts:1:OWNER1'), isStringSelectMenu: () => true, values: ['Signaler un bug'] });
  assert(lastReply.embeds[0].data.title.includes('Signaler un bug'), 'édition du type');
  assert(lastReply.embeds[0].data.fields.find((f) => f.name.includes('Rôles staff')).value.includes('Devs'), 'Devs déjà présent');

  // action ➕ ajouter un rôle
  await panels.handleTypesWizardInteraction(1, { ...ownerWizard('bdw-ts:1:OWNER1'), isStringSelectMenu: () => true, values: ['addrole'] });
  assert(lastReply.embeds[0].data.title.includes('Rôles staff'), 'écran ajout de rôle');
  // sélectionne Modos → ajouté, on RESTE sur l'écran
  await panels.handleTypesWizardInteraction(1, { ...ownerWizard('bdw-tr:1:OWNER1'), isRoleSelectMenu: () => true, values: ['R3'] });
  let types = JSON.parse(store.tickets.get(1, 'G1').types);
  const bugType = types.find((t) => t.label === 'Signaler un bug');
  assert(bugType.staff_roles.includes('Devs') && bugType.staff_roles.includes('Modos'), 'Modos ajouté : ' + bugType.staff_roles.join(','));
  assert(lastReply.embeds[0].data.title.includes('Rôles staff'), 'reste sur l\'écran (répétable)');
  // sélectionne Admins aussi
  await panels.handleTypesWizardInteraction(1, { ...ownerWizard('bdw-tr:1:OWNER1'), isRoleSelectMenu: () => true, values: ['R2'] });
  types = JSON.parse(store.tickets.get(1, 'G1').types);
  assert(types.find((t) => t.label === 'Signaler un bug').staff_roles.length === 3, '3 rôles staff');
  // Terminé → retour à l'édition
  await panels.handleTypesWizardInteraction(1, { ...ownerWizard('bdw-tb:1:OWNER1:doneroles'), isButton: () => true });
  assert(lastReply.embeds[0].data.title.includes('Signaler un bug'), 'retour à l\'édition');
  const rolesField = lastReply.embeds[0].data.fields.find((f) => f.name.includes('Rôles staff')).value;
  for (const r of ['Admins', 'Devs', 'Modos']) assert(rolesField.includes(r), 'rôle affiché : ' + r + ' (valeur : ' + rolesField.replace(/\n/g, ' | ') + ')');
  console.log('4️⃣  Assistant : ➕ ajout de rôles (répétable) → 3 rôles staff ✅ (', types.find((t) => t.label === 'Signaler un bug').staff_roles.join(', '), ')');

  // ---------- 5. Retirer un rôle ----------
  await panels.handleTypesWizardInteraction(1, { ...ownerWizard('bdw-ts:1:OWNER1'), isStringSelectMenu: () => true, values: ['removerole'] });
  assert(lastReply.embeds[0].data.title.includes('Retirer'), 'écran retrait');
  await panels.handleTypesWizardInteraction(1, { ...ownerWizard('bdw-ts:1:OWNER1'), isStringSelectMenu: () => true, values: ['Modos'] });
  types = JSON.parse(store.tickets.get(1, 'G1').types);
  assert(!types.find((t) => t.label === 'Signaler un bug').staff_roles.includes('Modos'), 'Modos retiré');
  console.log('5️⃣  Assistant : ➖ retrait d\'un rôle ✅ (', types.find((t) => t.label === 'Signaler un bug').staff_roles.join(', '), ')');

  // ---------- 6. /ticket types add sur un type existant : ajoute le rôle à la liste ----------
  let cmdReply = null;
  const ownerCmd = (sub, name, staffrole) => ({
    guild, user: { id: 'OWNER1' },
    member: { user: { id: 'OWNER1' }, permissions: { has: () => false }, roles: { cache: { has: () => false } } },
    commandName: 'ticket', channel: { name: 'général' },
    options: {
      getSubcommand: () => sub, getSubcommandGroup: () => 'types',
      getString: (k) => (k === 'nom' ? name : k === 'staffrole' ? staffrole : k === 'emoji' ? '🐛' : ''),
      getChannel: () => null, getRole: () => ({ name: 'Staff' }), getInteger: () => 1, getUser: () => ({ id: 'x', toString: () => '<@x>' }),
    },
    reply: async (p) => { cmdReply = p; },
  });
  await handlePanelCommand(1, ownerCmd('add', 'Signaler un bug', 'Supporters'));
  types = JSON.parse(store.tickets.get(1, 'G1').types);
  const bugRoles = types.find((t) => t.label === 'Signaler un bug').staff_roles;
  assert(bugRoles.includes('Supporters') && bugRoles.includes('Admins') && bugRoles.includes('Devs'), 'rôle ajouté SANS écraser : ' + bugRoles.join(','));
  console.log('6️⃣  /ticket types add sur type existant → rôle ajouté à la liste ✅ (', bugRoles.join(', '), ')');

  // ---------- 7. Payload : description mise à jour ----------
  const { buildSlashPayloads } = require('../server/discord/premade');
  store.modules.set(1, 'utility', true);
  const t = buildSlashPayloads(1).find((p) => p.name === 'ticket');
  const grp = t.options.find((o) => o.name === 'types');
  const setup = grp.options.find((o) => o.name === 'setup');
  assert(setup.description.includes('PLUSIEURS'), 'description setup multi-rôles');
  console.log('7️⃣  Payload : « PLUSIEURS rôles staff » ✅');

  console.log('\n🎉 Tous les tests v1.24 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
