// Test v5.4 — placement simple des tickets dans une catégorie existante
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-ticket-placement-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const advanced = require('../server/discord/advancedTickets');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');

const category = { id: 'CAT-SUPPORT', name: 'Tickets Support', type: ChannelType.GuildCategory };
const panel = {
  id: 'PANEL', name: 'ouvrir-un-ticket', type: ChannelType.GuildText,
  parentId: category.id, parent: category, position: 4,
  send: async () => ({ id: 'PANEL-MESSAGE' }),
};
const channels = new Map([[category.id, category], [panel.id, panel]]);
const collection = (map) => ({
  get: (id) => map.get(String(id)),
  find: (fn) => [...map.values()].find(fn),
  values: () => map.values(),
});
const staffRole = { id: 'ROLE-STAFF', name: 'Staff', position: 10, toString: () => '<@&ROLE-STAFF>' };
const guild = {
  id: 'G1', name: 'Serveur Tickets',
  channels: { cache: collection(channels), create: null },
  roles: { cache: collection(new Map([[staffRole.id, staffRole]])) },
};
let createdOptions = null;
let createdChannel = null;
guild.channels.create = async (options) => {
  createdOptions = options;
  createdChannel = {
    id: 'NEW-TICKET', name: options.name, type: ChannelType.GuildText,
    parentId: options.parent, parent: category, position: 5,
    send: async () => ({ id: 'WELCOME' }),
    toString: () => '<#NEW-TICKET>',
  };
  channels.set(createdChannel.id, createdChannel);
  return createdChannel;
};

function interactionFor() {
  const member = {
    id: 'USER-1',
    user: { id: 'USER-1', username: 'Alice', tag: 'Alice#0001' },
    roles: { cache: { has: () => false } },
  };
  return {
    guild,
    member,
    user: member.user,
    channel: panel,
    client: { user: { id: 'BOT-1', displayAvatarURL: () => '' }, users: null },
    deferred: false,
    replied: false,
    deferReply: async () => {},
    replyPayload: null,
    reply: async (payload) => { this.replyPayload = payload; return payload; },
    followUp: async (payload) => payload,
  };
}

(async () => {
  const botId = Number(store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' }));
  const type = { id: 'support', label: 'Support', category: category.id, staff_roles: [staffRole.name], color: '#5865F2' };
  const override = advanced.advancedConfigForOpen({ id: 9, require_reason: 0, panel_channel: panel.id }, type, { channel: panel });
  assert.strictEqual(override.category_required, true);
  assert.strictEqual(override.panel_channel_id, panel.id);
  assert.strictEqual(panels.findCategoryRef(guild, category.id), category);

  const interaction = interactionFor();
  await panels.openTicket(botId, interaction, type, '', [], override);
  assert(createdOptions, 'le salon est créé');
  assert.strictEqual(createdOptions.type, ChannelType.GuildText);
  assert.strictEqual(createdOptions.parent, category.id, 'le ticket est créé dans la catégorie choisie');
  assert.strictEqual(createdOptions.permissionOverwrites[0].id, guild.id);
  assert(createdOptions.permissionOverwrites.some((overwrite) => overwrite.id === 'USER-1' && overwrite.allow.includes(PermissionFlagsBits.ViewChannel)), 'le créateur voit son ticket');
  assert(createdOptions.permissionOverwrites.some((overwrite) => overwrite.id === staffRole.id && overwrite.allow.includes(PermissionFlagsBits.ViewChannel)), 'le staff voit son ticket');
  assert(![...channels.values()].some((channel) => channel.type === ChannelType.GuildCategory && channel.id !== category.id), 'aucune catégorie créée');
  console.log('✅ nouveau système : un salon privé, dans la catégorie choisie, visible par créateur + staff');

  // Une catégorie configurée mais supprimée doit bloquer proprement la
  // création : surtout aucun repli silencieux vers la catégorie du panneau.
  createdOptions = null;
  const missingInteraction = interactionFor();
  const missingType = { ...type, category: 'CAT-DELETED' };
  const missingOverride = advanced.advancedConfigForOpen({ id: 9, require_reason: 0, panel_channel: panel.id }, missingType, { channel: panel });
  await panels.openTicket(botId, missingInteraction, missingType, '', [], missingOverride);
  assert.strictEqual(createdOptions, null, 'aucun ticket créé avec une catégorie introuvable');
  console.log('✅ catégorie supprimée : erreur claire, aucun salon créé au mauvais endroit');

  assert(dashboard.includes('Catégorie de création du ticket'));
  assert(dashboard.includes('Choisis une catégorie Discord pour le type'));
  assert(dashboard.includes('Le salon privé sera créé directement ici'));
  assert(dashboard.includes('type.category') && dashboard.includes('missingCategory'));
  assert(fs.readFileSync(path.join(__dirname, '..', 'server/discord/panels.js'), 'utf8').includes('const typeCategory = chosen'));
  assert(fs.readFileSync(path.join(__dirname, '..', 'server/discord/panels.js'), 'utf8').includes('findCategoryRef'));
  console.log('✅ dashboard : catégorie obligatoire et validation du nouveau placement présents');

  store.db.close();
  console.log('\n🎉 Tous les tests v5.4 placement tickets passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  try { store.db.close(); } catch {}
  process.exit(1);
});
