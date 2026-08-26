// Test v3.18 — Auto-Mod Control Center : observation, actions et exceptions
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v318-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const automod = require('../server/discord/automod');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public/css/dashboard.css'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '..', 'server/routes.js'), 'utf8');

function message(overrides = {}) {
  let deleted = 0;
  const m = {
    id: `M${Date.now()}${Math.random()}`,
    content: 'https://example.com',
    deletable: true,
    delete: async () => { deleted++; },
    author: { id: 'U1', tag: 'Membre#0001', username: 'Membre', bot: false, send: async () => {} },
    member: { permissions: { has: () => false }, roles: { cache: { values: () => [] } }, moderatable: false },
    guild: { id: 'G1', name: 'Serveur test' },
    channel: { id: 'C1', name: 'discussion', send: async () => ({ id: `W${Date.now()}`, delete: async () => {} }) },
    get deleted() { return deleted; },
    ...overrides,
  };
  return m;
}

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
  const columns = store.db.prepare('PRAGMA table_info(guild_settings)').all().map((column) => column.name);
  for (const column of ['am_mode', 'am_rule_actions', 'am_exempt_roles', 'am_exempt_channels', 'am_exempt_users']) {
    assert.ok(columns.includes(column), `colonne absente : ${column}`);
  }
  const logColumns = store.db.prepare('PRAGMA table_info(automod_logs)').all().map((column) => column.name);
  for (const column of ['rule', 'action', 'observed']) assert.ok(logColumns.includes(column), `métadonnée absente : ${column}`);
  console.log('✅ base : mode, actions par règle, exceptions et métadonnées disponibles');

  store.guildSettings.set(botId, 'G1', {
    am_enabled: 1, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 0,
    am_mode: 'observe', am_rule_actions: { links: 'ban' },
    am_exempt_roles: ['R-VIP'], am_exempt_channels: ['C-SAFE'], am_exempt_users: ['U-SAFE'],
  });
  const gs = store.guildSettings.get(botId, 'G1');
  assert.strictEqual(gs.am_mode, 'observe');
  assert.deepStrictEqual(JSON.parse(gs.am_rule_actions), { links: 'ban' });
  assert.deepStrictEqual(JSON.parse(gs.am_exempt_roles), ['R-VIP']);
  assert.deepStrictEqual(JSON.parse(gs.am_exempt_channels), ['C-SAFE']);
  assert.deepStrictEqual(JSON.parse(gs.am_exempt_users), ['U-SAFE']);

  const observation = automod.analyzeContent(botId, 'G1', 'https://example.com');
  assert.strictEqual(observation.matched, true);
  assert.strictEqual(observation.rule, 'links');
  assert.strictEqual(observation.action, 'observe');
  assert.strictEqual(observation.wouldDelete, false);
  const observedMessage = message();
  const observedRun = await automod.runAutomod(botId, observedMessage);
  assert.strictEqual(observedRun.observed, true);
  assert.strictEqual(observedMessage.deleted, 0);
  assert.strictEqual(store.warnings.recent(botId, 'G1', 20).length, 0);
  console.log('✅ mode observation : détecte et journalise sans supprimer ni sanctionner');

  // Les trois types d'exceptions sont évalués avant les règles.
  store.guildSettings.set(botId, 'G1', { am_mode: 'enforce', am_rule_actions: {}, am_exempt_channels: ['C-SAFE'] });
  const exemptChannel = message({ channel: { id: 'C-SAFE', name: 'partenariats', send: async () => ({}) } });
  const exemptChannelRun = await automod.runAutomod(botId, exemptChannel);
  assert.strictEqual(exemptChannelRun.exempt, true);
  assert.strictEqual(exemptChannel.deleted, 0);
  store.guildSettings.set(botId, 'G1', { am_exempt_channels: [], am_exempt_roles: ['R-VIP'] });
  const exemptRole = message({ member: { permissions: { has: () => false }, roles: { cache: { values: () => [{ id: 'R-VIP', name: 'VIP' }] } } } });
  assert.strictEqual((await automod.runAutomod(botId, exemptRole)).exempt, true);
  store.guildSettings.set(botId, 'G1', { am_exempt_roles: [], am_exempt_users: ['U-SAFE'] });
  const exemptUser = message({ author: { id: 'U-SAFE', tag: 'Safe#0001', username: 'Safe', bot: false, send: async () => {} } });
  assert.strictEqual((await automod.runAutomod(botId, exemptUser)).exempt, true);
  console.log('✅ exceptions : rôle, salon et membre sont ignorés avant la détection');

  // Une action personnalisée remplace seulement le comportement de la règle
  // concernée ; les réglages historiques restent disponibles avec inherit.
  store.guildSettings.set(botId, 'G1', { am_exempt_users: [], am_rule_actions: { links: 'log' } });
  const logged = message();
  const logRun = await automod.runAutomod(botId, logged);
  assert.strictEqual(logRun.action, 'log');
  assert.strictEqual(logRun.deleted, false);
  store.guildSettings.set(botId, 'G1', { am_rule_actions: { links: 'delete' } });
  const deleted = message();
  const deleteRun = await automod.runAutomod(botId, deleted);
  assert.strictEqual(deleteRun.action, 'delete');
  assert.strictEqual(deleteRun.deleted, true);
  assert.strictEqual(store.warnings.recent(botId, 'G1', 20).length, 0);
  console.log('✅ actions par règle : journal seul et suppression seule fonctionnent');

  store.guildSettings.set(botId, 'G1', { am_rule_actions: { links: 'warn' }, am_warn_limit: 2 });
  const warned = message();
  const warnRun = await automod.runAutomod(botId, warned);
  assert.strictEqual(warnRun.action, 'warn');
  assert.strictEqual(warnRun.warningCount, 1);
  assert.strictEqual(store.warnings.recent(botId, 'G1', 20).length, 1);
  const summary = store.automodLogs.summary(botId, 'G1');
  assert.ok(summary.total >= 4);
  assert.ok(summary.byRule.some((row) => row.rule === 'links'));
  assert.ok(summary.byAction.some((row) => row.action === 'warn'));
  console.log('✅ avertissement personnalisé et statistiques Auto-Mod enregistrés');

  assert.ok(routes.includes('/automod/summary') && routes.includes('/automod/simulate'));
  assert.ok(dashboard.includes('am-mode') && dashboard.includes('am-sim-go') && dashboard.includes('am-exempt-roles'));
  assert.ok(dashboard.includes('am-draft') && dashboard.includes('am-clear-draft') && dashboard.includes('warning-filter'));
  assert.ok(styles.includes('.am-control-card') && styles.includes('.am-rule-card') && styles.includes('.am-result'));
  const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');
  assert.strictEqual((index.match(/\\?v=133/g) || []).length, 7);
  assert.ok(sw.includes("const CACHE = 'botdev-v133';"));
  console.log('✅ dashboard : Control Center, simulateur sans risque, règles et exceptions présents');

  console.log('\n🎉 Tous les tests v3.18 passent');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
