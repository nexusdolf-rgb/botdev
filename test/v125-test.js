// Test v3.21 — placement et accès des salons de tickets (réparation globale)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v321-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const panels = require('../server/discord/panels');
const advanced = require('../server/discord/advancedTickets');
const source = fs.readFileSync(path.join(__dirname, '..', 'server/discord/panels.js'), 'utf8');

const roleSupport = { id: 'R-SUPPORT', name: '🟢 🎫・Team Support', position: 10 };
const roleManager = { id: 'R-MANAGER', name: 'Super Modérateur', position: 11 };
const category = { id: 'CAT-SUPPORT', name: '────〔🎫・SUPPORT・〕────', type: 4 };
const panel = {
  id: 'PANEL', name: 'contact-staff', type: 0, parentId: category.id, parent: category, position: 7,
  isTextBased: () => true,
};
const overwriteMap = new Map();
const edits = [];
const ticket = {
  id: 'TICKET', name: 'ticket-test', type: 0, parentId: 'CAT-WRONG',
  permissionOverwrites: {
    cache: overwriteMap,
    edit: async (id, permissions) => { edits.push({ id, permissions }); overwriteMap.set(String(id), { allow: { has: () => true } }); },
  },
  setParent: async (id) => { ticket.parentId = String(id); },
  setPosition: async (position) => { ticket.position = position; },
};
const channels = new Map([[category.id, category], [panel.id, panel], [ticket.id, ticket]]);
const roles = new Map([[roleSupport.id, roleSupport], [roleManager.id, roleManager]]);
const collection = (map) => ({
  get: (id) => map.get(String(id)),
  find: (fn) => [...map.values()].find(fn),
  values: () => map.values(),
});
const guild = {
  id: 'G1', name: 'Serveur test',
  channels: { cache: collection(channels) },
  roles: { cache: collection(roles) },
};

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
  store.tickets.set(botId, 'G1', {
    channel: '#contact-staff', menu_channel: '#contact-staff', menu_category: category.name,
    category: category.name, support_role: roleSupport.name,
    types: [{ label: 'Signalement', category: category.name, staff_roles: [roleManager.name] }],
  });
  const row = { bot_id: botId, guild_id: 'G1', channel_id: ticket.id, number: 1, opener_id: 'USER' , type_label: 'Signalement' };

  // Le nom décoré copié depuis le dashboard retrouve le rôle Discord réel.
  assert.strictEqual(panels.resolveRole(guild, '🎫 Team Support').id, roleSupport.id);
  assert.strictEqual(panels.resolveRole(guild, 'Super Modérateur').id, roleManager.id);
  assert.deepStrictEqual(panels.staffRoleRefsForConfig({ support_role: roleSupport.name }, { staff_roles: [roleManager.name] }), [roleManager.name, roleSupport.name]);
  console.log('✅ résolution tolérante et combinaison rôle du type + rôle global');

  const repaired = await panels.repairTicketChannel(botId, guild, ticket, row);
  assert.strictEqual(repaired.roles, 2);
  assert.strictEqual(repaired.moved, true);
  assert.strictEqual(ticket.parentId, category.id);
  assert.ok(edits.some((edit) => edit.id === roleSupport.id));
  assert.ok(edits.some((edit) => edit.id === roleManager.id));
  assert.ok(edits.some((edit) => edit.id === 'USER'));
  assert.strictEqual(ticket.position, panel.position + 1);
  console.log('✅ réparation : accès staff + créateur et placement juste sous le panneau');

  const openOverride = advanced.advancedConfigForOpen({ id: 4, require_reason: 1, panel_channel: 'OLD' }, { id: 't1', category: category.name }, { channel: { id: panel.id } });
  assert.strictEqual(openOverride.panel_channel_id, panel.id);
  assert.ok(source.includes('const panelChannel = panelChannelOf(guild, interaction, configOverride)'));
  assert.ok(source.includes('const supportRoles = await resolveRoleRefs(guild, staffNames)'));
  assert.ok(source.includes('channel.setParent(wantedParent.id, { lockPermissions: false })'));
  assert.ok(source.includes('channel.setPosition(panelPosition + 1)'));
  console.log('✅ nouveau et ancien parcours utilisent le salon réellement cliqué');

  console.log('\n🎉 Tous les tests v3.21 passent');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
