// Test v5.1 — blacklist des membres par serveur après une action Auto-Mod
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-blacklist-'));
process.env.BOTDEV_DATA_DIR = dataDir;

const store = require('../server/db');
const automod = require('../server/discord/automod');
const routes = fs.readFileSync(path.join(__dirname, '..', 'server/routes.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public/css/dashboard.css'), 'utf8');

const BOT = Number(store.bots.create({ user_id: 1, name: 'Hoxera', token: 'test', client_id: 'test', prefix: '!' }));
const GUILD = 'G-BLACKLIST';
const sentPanels = [];
const executionOrder = [];
const sourceChannel = { id: 'C-SOURCE', name: 'discussion', send: async () => ({ id: 'SOURCE-PANEL' }) };
const blacklistChannel = {
  id: 'C-BLACKLIST',
  name: 'journal-blacklist',
  send: async (payload) => {
    executionOrder.push('blacklist-panel');
    sentPanels.push(payload);
    return { id: `PANEL-${sentPanels.length}` };
  },
};
const guild = {
  id: GUILD,
  name: 'Serveur sécurité',
  channels: {
    cache: {
      get: (id) => ({ 'C-SOURCE': sourceChannel, 'C-BLACKLIST': blacklistChannel }[String(id)]),
      find: (fn) => [sourceChannel, blacklistChannel].find(fn),
    },
  },
};

function makeMessage(content = 'viens ici https://example.com', userId = '123456789012345678') {
  let deleted = false;
  const message = {
    id: `M-${Date.now()}-${Math.random()}`,
    url: `https://discord.com/channels/${GUILD}/C-SOURCE/message-1`,
    content,
    deletable: true,
    delete: async () => { deleted = true; },
    author: {
      id: userId,
      tag: 'Membre#0001',
      username: 'Membre',
      bot: false,
      displayAvatarURL: () => 'https://cdn.example/avatar.png',
      send: async () => {},
    },
    member: {
      permissions: { has: () => false },
      roles: { cache: { values: () => [] } },
    },
    guild,
    channel: sourceChannel,
    get wasDeleted() { return deleted; },
  };
  return message;
}

(async () => {
  const columns = store.db.prepare('PRAGMA table_info(guild_settings)').all().map((column) => column.name);
  for (const column of ['am_blacklist_rules', 'am_blacklist_channel', 'am_blacklist_title', 'am_blacklist_color', 'am_blacklist_footer']) {
    assert(columns.includes(column), `colonne absente : ${column}`);
  }
  const blacklistColumns = store.db.prepare('PRAGMA table_info(automod_member_blacklist)').all().map((column) => column.name);
  for (const column of ['user_id', 'rule', 'action', 'panel_channel_id', 'panel_message_id', 'active']) {
    assert(blacklistColumns.includes(column), `colonne blacklist absente : ${column}`);
  }
  console.log('✅ base : blacklist membre, configuration et panneau disponibles');

  store.guildSettings.set(BOT, GUILD, {
    am_enabled: 1,
    am_links: 1,
    am_caps: 0,
    am_mentions: 0,
    am_spam: 0,
    am_mode: 'enforce',
    am_rule_actions: { links: 'delete' },
    am_blacklist_rules: { links: true },
    am_blacklist_channel: 'C-BLACKLIST',
    am_blacklist_title: '🚫 Alerte sécurité',
    am_blacklist_color: '#AA1122',
    am_blacklist_footer: 'Journal sécurité · Nexora',
  });

  const message = makeMessage();
  const result = await automod.runAutomod(BOT, message);
  assert.strictEqual(result.acted, true);
  assert.strictEqual(result.action, 'delete');
  assert.strictEqual(message.wasDeleted, true);
  assert(result.blacklist && result.blacklist.blacklisted, 'membre blacklisté après la suppression');
  assert.strictEqual(result.blacklist.panelSent, true);

  const active = store.memberBlacklist.active(BOT, GUILD);
  assert.strictEqual(active.length, 1);
  assert.strictEqual(active[0].user_id, '123456789012345678');
  assert.strictEqual(active[0].rule, 'links');
  assert.strictEqual(active[0].action, 'delete');
  assert.strictEqual(active[0].panel_channel_id, 'C-BLACKLIST');
  assert.strictEqual(active[0].panel_message_id, 'PANEL-1');
  assert.strictEqual(sentPanels.length, 1);
  assert.strictEqual(sentPanels[0].content, '<@123456789012345678>');
  assert.strictEqual(sentPanels[0].embeds[0].data.title, '🚫 Alerte sécurité');
  assert.strictEqual(sentPanels[0].embeds[0].data.color, 0xAA1122);
  assert(sentPanels[0].embeds[0].data.fields.some((field) => field.name.includes('Comportement')));
  assert.strictEqual(store.memberBlacklist.active(BOT, 'OTHER-SERVER').length, 0, 'blacklist isolée par serveur');
  console.log('✅ action Auto-Mod → sanction → blacklist serveur → panneau personnalisé dans le salon dédié');

  executionOrder.length = 0;
  store.guildSettings.set(BOT, GUILD, { am_rule_actions: { links: 'timeout' }, am_blacklist_rules: { links: true }, am_timeout_min: 3 });
  const timeoutMessage = makeMessage('encore un lien https://example.com', '123456789012345679');
  timeoutMessage.delete = async () => { executionOrder.push('delete'); };
  timeoutMessage.member = {
    permissions: { has: () => false },
    roles: { cache: { values: () => [] } },
    moderatable: true,
    timeout: async () => { executionOrder.push('timeout'); },
  };
  const timeoutResult = await automod.runAutomod(BOT, timeoutMessage);
  assert.strictEqual(timeoutResult.sanction.applied, true);
  assert.deepStrictEqual(executionOrder.slice(0, 3), ['delete', 'timeout', 'blacklist-panel'], 'ordre sanction puis panneau');
  assert.strictEqual(store.memberBlacklist.active(BOT, GUILD).some((row) => row.user_id === '123456789012345679'), true);
  console.log('✅ ordre garanti : suppression → timeout → panneau blacklist');
  store.memberBlacklist.remove(BOT, GUILD, '123456789012345679', 'test');

  // Le mode « journal seulement » ne doit pas blacklister : aucune sanction
  // n’a été appliquée, même si la case blacklist est restée cochée.
  store.memberBlacklist.remove(BOT, GUILD, '123456789012345678', 'test');
  store.guildSettings.set(BOT, GUILD, { am_rule_actions: { links: 'log' }, am_blacklist_rules: { links: true } });
  const logOnly = await automod.runAutomod(BOT, makeMessage('lien https://example.com', '123456789012345679'));
  assert.strictEqual(logOnly.action, 'log');
  assert.strictEqual(logOnly.blacklist.blacklisted, false);
  assert.strictEqual(store.memberBlacklist.active(BOT, GUILD).length, 0);
  console.log('✅ journal seul : aucune blacklist sans sanction réelle');

  // Les tests forcés du dashboard restent sans effet persistant.
  store.guildSettings.set(BOT, GUILD, { am_rule_actions: { links: 'delete' }, am_blacklist_rules: { links: true } });
  const forced = await automod.runAutomod(BOT, makeMessage(), { force: true, noDm: true });
  assert.strictEqual(forced.blacklist.blacklisted, false);
  assert.strictEqual(store.memberBlacklist.active(BOT, GUILD).length, 0);
  console.log('✅ test forcé : aucune blacklist réelle créée');

  assert(routes.includes("automod/blacklist/:userId"));
  assert(dashboard.includes('data-am-blacklist-rule') && dashboard.includes('am-blacklist-channel'));
  assert(dashboard.includes('am-member-blacklist-card') && dashboard.includes('Retirer de la blacklist'));
  assert(styles.includes('.am-blacklist-config') && styles.includes('.am-member-blacklist-row'));
  console.log('✅ dashboard : cases par comportement, salon dédié, personnalisation et retrait présents');

  store.db.close();
  console.log('\n🎉 Tous les tests v5.1 blacklist passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  try { store.db.close(); } catch {}
  process.exit(1);
});
