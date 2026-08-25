// Test v3.22 — annonces personnalisées : multi-salons, rôles ping et panneau
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v322-'));
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const announcements = require('../server/discord/announcements');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
const routes = fs.readFileSync(path.join(__dirname, '..', 'server/routes.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public/css/dashboard.css'), 'utf8');

function collection(map) {
  return {
    get: (id) => map.get(String(id)),
    find: (fn) => [...map.values()].find(fn),
    values: () => map.values(),
  };
}

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
  store.customAnnouncements.set(botId, 'G1', {
    name: 'Annonce communauté', title: '📣 Grande nouvelle', message: '**Le serveur ouvre !**\n> Rendez-vous ce soir.',
    color: '#57F287', footer: 'Hoxera · Communauté', channels: ['C1', 'C2'], ping_roles: ['R1'],
  });
  const cfg = store.customAnnouncements.get(botId, 'G1');
  assert.deepStrictEqual(cfg.channels, ['C1', 'C2']);
  assert.deepStrictEqual(cfg.ping_roles, ['R1']);
  const payload = announcements.buildPayload(cfg, { name: 'Serveur test' }, ['R1']);
  assert.strictEqual(payload.embeds[0].data.title, '📣 Grande nouvelle');
  assert.ok(payload.embeds[0].data.description.includes('serveur ouvre'));
  assert.strictEqual(payload.content, '<@&R1>');
  assert.deepStrictEqual(payload.allowedMentions.roles, ['R1']);
  assert.deepStrictEqual(payload.allowedMentions.parse, []);
  console.log('✅ configuration : message complet, couleur et rôle ping persistés');

  const sent = [];
  const makeChannel = (id, name) => ({ id, name, isTextBased: () => true, send: async (p) => { sent.push({ id, p }); return { id: `M-${id}` }; } });
  const channels = new Map([['C1', makeChannel('C1', 'annonces')], ['C2', makeChannel('C2', 'news')]]);
  const roles = new Map([['R1', { id: 'R1', name: '🔔 Annonces' }]]);
  const guild = { id: 'G1', name: 'Serveur test', channels: { cache: collection(channels) }, roles: { cache: collection(roles) } };
  const result = await announcements.sendAnnouncement(botId, 'G1', { guilds: { cache: new Map([['G1', guild]]) } });
  assert.strictEqual(result.sent, 2);
  assert.strictEqual(sent.length, 2);
  assert.ok(sent.every((item) => item.p.content === '<@&R1>'));
  assert.ok(sent.every((item) => item.p.embeds[0].data.description.includes('serveur ouvre')));
  console.log('✅ publication : une même annonce envoyée dans plusieurs salons avec le ping contrôlé');

  assert.ok(routes.includes('/announcements/custom') && routes.includes('customAnnouncements'));
  assert.ok(dashboard.includes('ca-message') && dashboard.includes('ca-send') && dashboard.includes('data-mark'));
  assert.ok(styles.includes('.custom-announcement-card') && styles.includes('.ca-toolbar') && styles.includes('.ca-discord-preview'));
  console.log('✅ dashboard : éditeur, toolbar de formatage et aperçu Discord présents');

  console.log('\n🎉 Tous les tests v3.22 passent');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
