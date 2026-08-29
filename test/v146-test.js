// Test v6 — intégration Auto-Mod officiel Discord en mode alerte
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AutoModerationActionType, AutoModerationRuleEventType, AutoModerationRuleTriggerType } = require('discord.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-native-automod-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const native = require('../server/discord/nativeAutomod');
const routes = fs.readFileSync(path.join(__dirname, '..', 'server/routes.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public/css/dashboard.css'), 'utf8');

const BOT = Number(store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' }));
const ALERT = { id: 'C-ALERT', name: 'logs-automod', send: async () => ({}) };
const rules = new Map();
let nextRuleId = 1;
function collection(map) {
  return {
    size: map.size,
    get: (id) => map.get(String(id)),
    find: (fn) => [...map.values()].find(fn),
    values: () => map.values(),
  };
}
function makeRule(id, options) {
  return {
    id,
    creatorId: 'BOT-USER',
    name: options.name,
    eventType: options.eventType,
    triggerType: options.triggerType,
    triggerMetadata: options.triggerMetadata || {},
    actions: options.actions || [],
    enabled: options.enabled !== false,
    edit: async function (next) { Object.assign(this, next); return this; },
    delete: async function () { rules.delete(this.id); },
  };
}
const manager = {
  fetch: async () => collection(rules),
  create: async (options) => {
    const rule = makeRule(`NATIVE-${nextRuleId++}`, options);
    rules.set(rule.id, rule);
    return rule;
  },
};
const guild = {
  id: 'G1',
  name: 'Serveur test',
  channels: { cache: { get: (id) => String(id) === ALERT.id ? ALERT : undefined, find: () => undefined } },
  autoModerationRules: manager,
};
const client = { user: { id: 'BOT-USER' } };

(async () => {
  const columns = store.db.prepare('PRAGMA table_info(guild_settings)').all().map((column) => column.name);
  assert(columns.includes('am_native_enabled'));
  assert(columns.includes('am_native_alert_channel'));
  assert(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='native_automod_rules'").get());
  console.log('✅ base : réglages et correspondance des règles natives disponibles');

  store.blacklist.add(BOT, 'G1', 'arnaque');
  store.guildSettings.set(BOT, 'G1', {
    am_enabled: 1,
    am_native_enabled: 1,
    am_native_alert_channel: ALERT.id,
    am_links: 1,
    am_caps: 1,
    am_mentions: 5,
    am_spam: 5,
  });
  const first = await native.syncGuild(BOT, guild, { client });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.created, 4, 'liens, mots, spam et mentions');
  assert.strictEqual(first.updated, 0);
  assert.strictEqual(rules.size, 4);
  for (const rule of rules.values()) {
    assert.strictEqual(rule.enabled, true);
    assert.strictEqual(rule.eventType, AutoModerationRuleEventType.MessageSend);
    assert.strictEqual(rule.actions[0].type, AutoModerationActionType.SendAlertMessage);
    assert.strictEqual(rule.actions[0].metadata.channel, ALERT);
  }
  assert.strictEqual(store.nativeAutomodRules.all(BOT, 'G1').length, 4);
  console.log('✅ synchronisation : 4 vraies règles Discord créées en alertes, sans double sanction');

  const second = await native.syncGuild(BOT, guild, { client });
  assert.strictEqual(second.created, 0, 'pas de doublons');
  assert.strictEqual(second.updated, 4, 'règles réutilisées');
  const status = await native.status(BOT, guild, client);
  assert.strictEqual(status.nativeRules, 4);
  assert.strictEqual(status.managed, 4);
  assert.strictEqual(status.badgeEligible, false);
  console.log('✅ idempotence : aucune duplication et statut lisible');

  store.guildSettings.set(BOT, 'G1', { am_native_enabled: 0 });
  const disabled = await native.syncGuild(BOT, guild, { client });
  assert.strictEqual(disabled.disabled, 4);
  assert([...rules.values()].every((rule) => rule.enabled === false));
  console.log('✅ désactivation : les règles Optimus Prime sont désactivées sans toucher aux règles externes');

  assert(native.RULE_PREFIX.includes('Optimus Prime'));
  assert(routes.includes('/automod/native'));
  assert(routes.includes('/automod/native/sync'));
  assert(dashboard.includes('am-native-on') && dashboard.includes('am-native-sync'));
  assert(dashboard.includes('Miroir officiel actif'));
  assert(styles.includes('.am-native-card') && styles.includes('.am-native-status'));
  console.log('✅ dashboard : statut, salon d’alertes et synchronisation officielle présents');

  store.db.close();
  console.log('\n🎉 Tous les tests v6 Auto-Mod officiel passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  try { store.db.close(); } catch {}
  process.exit(1);
});
