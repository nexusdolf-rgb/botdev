// Test v3.9 — avertissements auto-mod publics + sanction au 2e palier
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v39-'));
process.env.BOTDEV_DATA_DIR = dir;
process.env.NODE_ENV = 'test';

const store = require('../server/db');
const automod = require('../server/discord/automod');
const community = require('../server/discord/community');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '..', 'server/routes.js'), 'utf8');

(async () => {
  assert.ok(dashboard.includes('Avertissements progressifs') && dashboard.includes('Centre des avertissements'));
  assert.ok(dashboard.includes('am-warn-limit') && dashboard.includes('/warnings'));
  assert.ok(!dashboard.includes('`/warn`'), 'un texte /warn ne doit pas fermer le template JavaScript');
  assert.ok(routes.includes("guilds/:guildId/warnings") && routes.includes("warnings/:userId"));
  console.log('✅ dashboard : configuration des paliers + centre historique branchés');
  const botId = 1;
  const guildId = 'G-WARN';
  store.guildSettings.set(botId, guildId, {
    am_enabled: 1,
    am_links: 0,
    am_caps: 1,
    am_mentions: 0,
    am_spam: 0,
    am_ignore_staff: 1,
    am_warn_limit: 2,
    am_warn_action: 'timeout',
    am_warn_timeout_min: 10,
    am_timeout_min: 5,
    log_channel: '',
  });

  const channelMessages = [];
  let timeoutCalls = 0;
  let nextId = 1;
  const makeMessage = (uid = 'U-WARN') => {
    const msg = {
      id: `msg-${nextId++}`,
      content: 'BONJOUR TOUT LE MONDE EN MAJUSCULES',
      author: {
        bot: false,
        id: uid,
        tag: 'Membre#0001',
        username: 'Membre',
        send: async () => ({ id: 'dm' }),
      },
      guild: {
        id: guildId,
        name: 'Serveur avertissements',
        channels: { cache: new Map() },
      },
      member: {
        permissions: { has: () => false },
        moderatable: true,
        timeout: async () => { timeoutCalls++; },
        kickable: true,
        bannable: true,
        kick: async () => {},
        ban: async () => {},
      },
      channel: {
        id: 'C-CAPS',
        name: 'general',
        send: async (payload) => {
          const sent = { id: `warning-${channelMessages.length + 1}`, ...payload, delete: async () => {} };
          channelMessages.push(sent);
          return sent;
        },
      },
      deletable: true,
      delete: async () => { msg.deleted = true; },
      deleted: false,
    };
    return msg;
  };

  // 1. Les décisions de palier sont explicites et sans sanction au 1er.
  assert.strictEqual(community.autoModSanctionForWarning(1, { am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10 }), null);
  assert.deepStrictEqual(community.autoModSanctionForWarning(2, { am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10 }), { action: 'timeout', minutes: 10, threshold: 2 });
  assert.strictEqual(community.autoModSanctionForWarning(3, { am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10 }), null);
  console.log('✅ palier : 1er avertissement, sanction au 2e, pas de sanction répétée au 3e');

  // 2. Première infraction caps : suppression + avertissement dans le même salon.
  const first = makeMessage();
  const r1 = await automod.runAutomod(botId, first);
  assert.strictEqual(r1.acted, true);
  assert.strictEqual(first.deleted, true);
  assert.strictEqual(r1.warningCount, 1);
  assert.strictEqual(r1.publicWarning, true);
  assert.strictEqual(timeoutCalls, 0);
  assert.strictEqual(channelMessages.length, 1);
  assert.ok(channelMessages[0].content.includes('<@U-WARN>'));
  assert.ok(channelMessages[0].embeds[0].data.title.includes('1/2'));
  assert.ok(JSON.stringify(channelMessages[0].embeds[0].data).includes('majuscules'));
  console.log('✅ 1er avertissement : message supprimé + avertissement public 1/2 dans #general');

  // 3. Deuxième infraction : avertissement public 2/2 + timeout automatique.
  const second = makeMessage();
  const r2 = await automod.runAutomod(botId, second);
  assert.strictEqual(r2.warningCount, 2);
  assert.strictEqual(r2.sanction.applied, true);
  assert.strictEqual(r2.sanction.action, 'timeout');
  assert.strictEqual(r2.sanction.minutes, 10);
  assert.strictEqual(timeoutCalls, 1);
  assert.strictEqual(channelMessages.length, 2);
  assert.ok(channelMessages[1].embeds[0].data.title.includes('2/2'));
  assert.ok(JSON.stringify(channelMessages[1].embeds[0].data).includes('Timeout'));
  console.log('✅ 2e avertissement : panneau public 2/2 + timeout automatique 10 min');

  // 4. Le panneau dashboard dispose des deux entrées persistées, avec la
  // raison et le salon d'origine.
  const rows = store.warnings.recent(botId, guildId, 10);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].source, 'automod');
  assert.strictEqual(rows[0].warning_no, 2);
  assert.strictEqual(rows[0].action, 'timeout');
  assert.strictEqual(rows[0].channel_id, 'C-CAPS');
  assert.strictEqual(rows[1].warning_no, 1);
  assert.strictEqual(store.warnings.summary(botId, guildId, 10)[0].count, 2);
  console.log('✅ dashboard : 1er et 2e avertissements conservés avec raison, salon et sanction');

  // 5. Le 3e avertissement reste visible mais ne répète pas immédiatement le
  // timeout : prochain palier à 4.
  const third = makeMessage();
  const r3 = await automod.runAutomod(botId, third);
  assert.strictEqual(r3.warningCount, 3);
  assert.strictEqual(r3.sanction.applied, false);
  assert.strictEqual(timeoutCalls, 1);
  assert.strictEqual(channelMessages.length, 3);
  assert.ok(channelMessages[2].embeds[0].data.title.includes('3/2'));
  console.log('✅ 3e avertissement : affiché dans l\'historique sans sanction répétitive');

  // 6. Les tests forcés du dashboard restent sans avertissement réel.
  const forced = makeMessage('U-TEST');
  forced.author.bot = true;
  const rf = await automod.runAutomod(botId, forced, { force: true, noDm: true });
  assert.strictEqual(rf.acted, true);
  assert.strictEqual(rf.warningCount, 0);
  assert.strictEqual(channelMessages.length, 3);
  assert.strictEqual(store.warnings.count(botId, guildId, 'U-TEST'), 0);
  console.log('✅ test dashboard : ne pollue ni le panneau ni les avertissements');

  console.log('\n🎉 Tous les tests v3.9 passent');
})().catch((e) => { console.error('❌', e.stack || e.message); process.exit(1); });
