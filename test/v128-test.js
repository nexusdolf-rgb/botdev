// ============================================================
// Test v3.23 — Accès Nexora réservé au propriétaire ou à
// la permission Discord native « Administrateur ».
// ============================================================
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v128-'));

const permissions = require('../server/discord/permissions');
const { PermissionsBitField } = require('discord.js');

// ---------- La règle centrale ----------
const guild = { id: 'G1', ownerId: 'OWNER' };
const owner = { id: 'OWNER', permissions: { has: () => false } };
const administrator = {
  id: 'ADMIN',
  permissions: { has: (flag) => String(flag) === String(PermissionsBitField.Flags.Administrator) },
};
const manageGuildOnly = {
  id: 'MANAGE',
  permissions: { has: (flag) => String(flag) === String(PermissionsBitField.Flags.ManageGuild) },
};
const roleNamedAdminWithoutPermission = {
  id: 'ROLE_NAME_ONLY',
  permissions: { has: () => false },
};

assert.strictEqual(permissions.canConfigureGuild(guild, owner), true, 'le propriétaire est autorisé');
assert.strictEqual(permissions.canConfigureGuild(guild, administrator), true, 'Administrator est autorisé');
assert.strictEqual(permissions.canConfigureGuild(guild, manageGuildOnly), false, 'Gérer le serveur seul est refusé');
assert.strictEqual(permissions.canConfigureGuild(guild, roleNamedAdminWithoutPermission), false, 'un rôle nommé Admin sans permission est refusé');
assert.strictEqual(permissions.hasAdministratorPermission('8'), true, 'bit Administrator OAuth reconnu');
assert.strictEqual(permissions.hasAdministratorPermission('32'), false, 'bit ManageGuild OAuth non reconnu comme Administrator');
assert.strictEqual(permissions.oauthGuildCanConfigure({ owner: true, permissions: '0' }), true, 'propriétaire OAuth autorisé');
assert.strictEqual(permissions.oauthGuildCanConfigure({ owner: false, permissions: '8' }), true, 'administrateur OAuth autorisé');
assert.strictEqual(permissions.oauthGuildCanConfigure({ owner: false, permissions: '32' }), false, 'ManageGuild OAuth refusé');
console.log('1️⃣  Règle centrale : propriétaire ou permission Administrateur uniquement ✅');

// ---------- Les commandes de configuration ----------
const { CMD_DEFS, buildSlashPayloads } = require('../server/discord/premade');
const extra = require('../server/discord/extra');
assert.strictEqual(String(CMD_DEFS.lang.perms[0]), String(PermissionsBitField.Flags.Administrator));
assert.strictEqual(String(CMD_DEFS.giveaway.perms[0]), String(PermissionsBitField.Flags.Administrator));
assert.strictEqual(String(CMD_DEFS.suggestions.perms[0]), String(PermissionsBitField.Flags.Administrator));
const extraPayloads = extra.buildExtraPayloads();
for (const name of ['lockdown', 'voicetemp', 'apply']) {
  const payload = extraPayloads.find((p) => p.name === name);
  assert(payload && payload.default_member_permissions === String(PermissionsBitField.Flags.Administrator), `${name} réservé à Administrator`);
}
console.log('2️⃣  Commandes de configuration : permission native Administrator enregistrée ✅');

(async () => {
  const store = require('../server/db');
  const botManager = require('../server/discord/botManager');

  store.users.create('plateforme@example.com', 'x');
  store.bots.create({ user_id: 1, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
  store.users.create('admin@example.com', 'x', { discord_id: 'D2', discord_username: 'Admin' });
  store.users.updateDiscord(2, {
    discord_id: 'D2',
    discord_username: 'Admin',
    discord_avatar: '',
    discord_guilds: JSON.stringify([
      { id: 'G_OWNER', name: 'Serveur propriétaire', icon: '', owner: true, permissions: '0' },
      { id: 'G_ADMIN', name: 'Serveur admin', icon: '', owner: false, permissions: '8' },
      { id: 'G_MANAGE', name: 'Serveur manage', icon: '', owner: false, permissions: '32' },
    ]),
  });

  const collection = (map) => ({
    get: (key) => map.get(key),
    find: (fn) => [...map.values()].find(fn),
    values: () => map.values(),
  });
  const discordGuild = (id, name) => ({
    id,
    name,
    memberCount: 3,
    iconURL: () => '',
    channels: { cache: collection(new Map()) },
    roles: { cache: collection(new Map()) },
  });
  const liveGuilds = new Map([['G_ADMIN', discordGuild('G_ADMIN', 'Serveur admin')]]);
  botManager.clients.set(1, {
    client: { isReady: () => true, guilds: { cache: collection(liveGuilds) } },
  });

  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = store.sessions.create(2);
  const headers = { Cookie: `botdev_session=${token}` };
  const fetchJson = async (route) => {
    const res = await fetch(base + route, { headers });
    return { status: res.status, json: await res.json() };
  };

  const guildList = await fetchJson('/discord/guilds');
  assert.strictEqual(guildList.status, 200);
  const byId = Object.fromEntries(guildList.json.guilds.map((g) => [g.id, g]));
  assert.strictEqual(byId.G_OWNER.canManage, true);
  assert.strictEqual(byId.G_OWNER.access, 'owner');
  assert.strictEqual(byId.G_ADMIN.canManage, true);
  assert.strictEqual(byId.G_ADMIN.canConfigure, true);
  assert.strictEqual(byId.G_ADMIN.access, 'administrator');
  assert.strictEqual(byId.G_MANAGE.canManage, false);
  assert.strictEqual(byId.G_MANAGE.access, 'readonly');
  console.log('3️⃣  Dashboard : propriétaire/Administrator configurables, ManageGuild en lecture seule ✅');

  const adminGuild = await fetchJson('/bots/1/guilds/G_ADMIN');
  assert.strictEqual(adminGuild.status, 200, 'Administrator doit ouvrir la configuration');
  const deniedGuild = await fetchJson('/bots/1/guilds/G_MANAGE');
  assert.strictEqual(deniedGuild.status, 403, 'ManageGuild seul doit être refusé');
  assert(deniedGuild.json.error.includes('Administrateur'));
  console.log('4️⃣  API dashboard : accès Administrator ✅ / ManageGuild refusé ✅');
  server.close();

  // ---------- Vérification d'une commande de configuration ----------
  const { handlePanelCommand } = require('../server/discord/panelCommands');
  const commandGuild = { id: 'G_CMD', ownerId: 'OWNER_CMD' };
  function commandInteraction(userId, bit) {
    const replies = [];
    const member = {
      id: userId,
      permissions: { has: (flag) => String(flag) === String(bit) },
      roles: { cache: new Map() },
    };
    return {
      guild: commandGuild,
      user: { id: userId, tag: userId },
      member,
      options: {
        getSubcommand: () => 'config',
        getSubcommandGroup: () => null,
      },
      replies,
      reply: async (payload) => { replies.push(payload); return {}; },
    };
  }

  const manageCommand = commandInteraction('MANAGE_CMD', PermissionsBitField.Flags.ManageGuild);
  await handlePanelCommand(1, { ...manageCommand, commandName: 'ticket' });
  assert(manageCommand.replies[0].content.includes('Administrateur'), 'ManageGuild seul refusé pour /ticket');

  const adminCommand = commandInteraction('ADMIN_CMD', PermissionsBitField.Flags.Administrator);
  await handlePanelCommand(1, { ...adminCommand, commandName: 'ticket' });
  assert(adminCommand.replies[0].embeds && adminCommand.replies[0].embeds.length, 'Administrator peut utiliser /ticket config');

  const ownerCommand = commandInteraction('OWNER_CMD', 0);
  await handlePanelCommand(1, { ...ownerCommand, commandName: 'ticket' });
  assert(ownerCommand.replies[0].embeds && ownerCommand.replies[0].embeds.length, 'propriétaire sans rôle particulier peut utiliser /ticket config');
  console.log('5️⃣  Commandes Discord : Administrator et propriétaire autorisés, ManageGuild refusé ✅');

  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
  assert(dashboardSource.includes('permission Discord « Administrateur »'));
  const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  const swSource = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');
  assert.strictEqual((indexSource.match(/\?v=132/g) || []).length, 7);
  assert(swSource.includes("const CACHE = 'botdev-v132';"));
  assert(buildSlashPayloads(1).some((p) => p.name === 'ticket' && p.default_member_permissions === '8'));
  console.log('6️⃣  Frontend versionné et permissions slash synchronisées ✅');

  console.log('\n🎉 Tous les tests v3.23 passent !');
  process.exit(0);
})().catch((e) => {
  console.error('❌', e.stack || e.message || e);
  process.exit(1);
});
