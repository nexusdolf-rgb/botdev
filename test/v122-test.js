// Test v3.18 — rendu DOM réel du Control Center Auto-Mod
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w;
global.document = w.document;
global.navigator = w.navigator;
global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + fs.readFileSync('public/js/dashboard.js', 'utf8') + '\nwindow.App=App;window.Dashboard=Dashboard;');

const { App, Dashboard } = w;
App.state = { user: { is_admin: true } };
Dashboard.state = { bot: { id: 1, name: 'Hoxera', online: true, invite_url: '' }, guildId: 'G1', module: 'moderation' };
App.api = async (url) => {
  if (url.includes('/sanctions')) return { sanctions: [] };
  if (url.includes('/permissions')) return { online: true, perms: { manageMessages: true, moderateMembers: true, manageChannels: true, kickMembers: true, banMembers: true, administrator: true } };
  if (url.includes('/warnings')) return { warnings: [], summary: [], config: {} };
  if (url.includes('/automod/summary')) return { total: 0, today: 0, observed: 0, enforced: 0, byRule: [], byAction: [] };
  if (url.includes('/antiraid/state')) return { config: { enabled: false, threshold: 10, window: 30, action: 'lockdown', unlockMin: 0 }, raid: null, lockdown: { locked: false, channels: [] } };
  return { ok: true };
};

const data = {
  settings: {
    am_enabled: 1, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, am_ignore_staff: 1,
    am_mode: 'observe', am_rule_actions: '{}', am_exempt_roles: '[]', am_exempt_channels: '[]', am_exempt_users: '[]',
    am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10,
  },
  blacklist: ['arnaque'],
  channels: [{ id: 'C1', name: 'discussion' }, { id: 'C2', name: 'partenariats' }, { id: 'CAT', name: 'Tickets', category: true }],
  roles: [{ id: 'R1', name: 'Staff' }, { id: 'R2', name: 'VIP' }],
};

(async () => {
  const content = w.document.createElement('div');
  await Dashboard.renderers.moderation(content, data);
  assert.ok(content.querySelector('.am-control-card'));
  assert.strictEqual(content.querySelectorAll('.am-rule-card').length, 5);
  assert.ok(content.querySelector('#am-mode'));
  assert.ok(content.querySelector('#am-draft'));
  assert.ok(content.querySelector('#am-save'));
  assert.ok(content.querySelector('#am-sim-go'));
  assert.ok(content.querySelector('#am-exempt-roles'));
  assert.ok(content.querySelector('#am-exempt-channels'));
  assert.strictEqual(content.querySelectorAll('.am-choice').length, 4);
  assert.ok(content.textContent.includes('Avertissements progressifs'));
  console.log('✅ Control Center Auto-Mod rendu : règles, exceptions, brouillon et simulateur');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
