// Test v5.5 — tous les systèmes de tickets utilisent une catégorie existante
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-all-ticket-placement-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const source = fs.readFileSync(path.join(__dirname, '..', 'server/discord/panels.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');

const categoryPanel = { id: 'CAT-PANEL', name: 'Panneau', type: ChannelType.GuildCategory };
const categoryType = { id: 'CAT-TYPE', name: 'Tickets Support', type: ChannelType.GuildCategory };
const categoryGlobal = { id: 'CAT-GLOBAL', name: 'Tickets Global', type: ChannelType.GuildCategory };
const panel = {
  id: 'PANEL', name: 'ouvrir-ticket', type: ChannelType.GuildText,
  parentId: categoryPanel.id, parent: categoryPanel, position: 3,
  send: async () => ({ id: 'PANEL-MESSAGE' }),
};
const staffRole = { id: 'ROLE-STAFF', name: 'Staff', position: 10, toString: () => '<@&ROLE-STAFF>' };
const channels = new Map([[categoryPanel.id, categoryPanel], [categoryType.id, categoryType], [categoryGlobal.id, categoryGlobal], [panel.id, panel]]);
const collection = (map) => ({
  get: (id) => map.get(String(id)),
  find: (fn) => [...map.values()].find(fn),
  values: () => map.values(),
});
const guild = {
  id: 'G1', name: 'Serveur tickets',
  channels: { cache: collection(channels), create: null },
  roles: { cache: collection(new Map([[staffRole.id, staffRole]])) },
};
let lastCreate = null;
guild.channels.create = async (options) => {
  lastCreate = options;
  const ticket = {
    id: `TICKET-${channels.size}`, name: options.name, type: ChannelType.GuildText,
    parentId: options.parent, parent: channels.get(options.parent), position: 10,
    send: async () => ({ id: `WELCOME-${channels.size}` }),
    toString: () => `<#TICKET-${channels.size}>`,
  };
  channels.set(ticket.id, ticket);
  return ticket;
};

function interactionFor(userId) {
  const user = { id: userId, username: `user-${userId}`, tag: `user-${userId}#0001` };
  const member = { id: userId, user, roles: { cache: { has: () => false } } };
  const interaction = {
    guild, member, user, channel: panel,
    client: { user: { id: 'BOT', displayAvatarURL: () => '' }, users: null },
    deferred: false, replied: false, replyPayload: null,
    deferReply: async () => {},
    reply: async (payload) => { interaction.replyPayload = payload; return payload; },
    followUp: async (payload) => payload,
  };
  return interaction;
}

(async () => {
  const botId = Number(store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' }));
  store.tickets.set(botId, 'G1', {
    channel: panel.id,
    menu_channel: panel.id,
    menu_category: categoryPanel.id,
    category: categoryGlobal.id,
    support_role: staffRole.name,
    types: [{ label: 'Support', emoji: '🎫', category: categoryType.id, staff_roles: [staffRole.name] }],
    require_reason: 0,
  });

  lastCreate = null;
  const typed = interactionFor('USER-TYPE');
  await panels.openTicket(botId, typed, { label: 'Support', emoji: '🎫', category: categoryType.id, staff_roles: [staffRole.name] });
  assert(lastCreate, 'ticket legacy créé');
  assert.strictEqual(lastCreate.parent, categoryPanel.id, 'les anciens panneaux utilisent la catégorie du menu');
  assert(!lastCreate.permissionOverwrites.some((overwrite) => overwrite.type === ChannelType.GuildCategory), 'aucune permission de catégorie créée');
  assert(lastCreate.permissionOverwrites.some((overwrite) => overwrite.id === guild.id && overwrite.deny.includes(PermissionFlagsBits.ViewChannel)), 'membres généraux refusés');
  assert(lastCreate.permissionOverwrites.some((overwrite) => overwrite.id === 'USER-TYPE' && overwrite.allow.includes(PermissionFlagsBits.ViewChannel)), 'créateur autorisé');
  assert(lastCreate.permissionOverwrites.some((overwrite) => overwrite.id === staffRole.id && overwrite.allow.includes(PermissionFlagsBits.ViewChannel)), 'staff autorisé');
  console.log('✅ ancien menu/type : ticket placé dans la catégorie du panneau, créateur + staff autorisés');

  // Parcours ancien bouton simple : la catégorie globale sélectionnée est
  // utilisée, sans création de catégorie ni placement au hasard.
  store.tickets.set(botId, 'G1', {
    channel: panel.id, category: categoryGlobal.id, support_role: staffRole.name, types: [], require_reason: 0,
  });
  lastCreate = null;
  await panels.openTicket(botId, interactionFor('USER-SIMPLE'), null);
  assert(lastCreate, 'ticket bouton simple créé');
  assert.strictEqual(lastCreate.parent, categoryGlobal.id, 'catégorie globale respectée');
  console.log('✅ ancien bouton simple : catégorie globale sélectionnée respectée');

  // Catégorie supprimée ou absente : rien n’est créé, jamais de catégorie
  // automatique et aucun repli vers le salon où se trouve le panneau.
  store.tickets.set(botId, 'G1', {
    channel: panel.id, menu_channel: panel.id, menu_category: '', category: '', support_role: '', types: [], require_reason: 0,
  });
  lastCreate = null;
  const missing = interactionFor('USER-MISSING');
  await panels.openTicket(botId, missing, null);
  assert(lastCreate, 'compatibilité : ticket créé sans catégorie automatique');
  assert.strictEqual(lastCreate.type, ChannelType.GuildText);
  assert.strictEqual(lastCreate.parent, categoryPanel.id, 'repli sûr vers la catégorie du panneau');
  assert(![...channels.values()].some((channel) => channel.type === ChannelType.GuildCategory && channel.name === 'Tickets'), 'aucune catégorie créée');
  console.log('✅ ancienne configuration sans catégorie : repli sûr vers le panneau, aucune catégorie créée');

  assert(source.includes('const catName = configOverride'));
  assert(source.includes('menuCategory || globalCategory || typeCategory'));
  assert(source.includes('let parent = null') && source.includes('findCategoryRef'));
  assert(source.includes('channel.setParent(parent.id, { lockPermissions: false })'));
  assert(!source.includes('type: ChannelType.GuildCategory }'));
  assert(dashboard.includes('Catégorie de création du ticket'));
  console.log('✅ invariant global : aucun système de ticket ne peut créer une catégorie');

  store.db.close();
  console.log('\n🎉 Tous les tests v5.5 tickets passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  try { store.db.close(); } catch {}
  process.exit(1);
});
