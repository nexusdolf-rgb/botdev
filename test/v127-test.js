// Test v3.22 — rendu DOM du composeur d'annonces et toolbar Markdown
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
Dashboard.state = { bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: 'announcements' };
App.api = async (url) => {
  if (url.endsWith('/scheduled')) return { scheduled: [] };
  if (url.endsWith('/announcements/custom')) return { config: { id: 2, name: 'Annonce serveur', title: '📣 Soirée', message: '**Rendez-vous ce soir !**', color: '#57F287', image_url: '', footer: '', channels: ['C1'], ping_roles: ['R1'] } };
  return { ok: true };
};

(async () => {
  const content = w.document.createElement('div');
  const data = { settings: { timezone: 'Europe/Paris' }, channels: [{ id: 'C1', name: 'annonces' }, { id: 'C2', name: 'news' }], roles: [{ id: 'R1', name: 'Annonces' }, { id: 'R2', name: 'Staff' }] };
  await Dashboard.renderers.announcements(content, data);
  assert.ok(content.querySelector('.custom-announcement-card'));
  assert.ok(content.querySelector('#ca-message'));
  assert.strictEqual(content.querySelectorAll('[data-mark]').length, 9);
  assert.strictEqual(content.querySelector('#ca-channels .dd-add-btn')?.tagName, 'BUTTON');
  assert.strictEqual(content.querySelector('#ca-roles .dd-add-btn')?.tagName, 'BUTTON');
  assert.strictEqual(content.querySelectorAll('#ca-channels input[type="checkbox"], #ca-roles input[type="checkbox"]').length, 0);
  assert.ok(content.querySelector('#ca-save') && content.querySelector('#ca-send'));

  const message = content.querySelector('#ca-message');
  message.value = 'Annonce importante';
  message.setSelectionRange(0, message.value.length);
  content.querySelector('[data-mark="0"]').click();
  assert.strictEqual(message.value, '**Annonce importante**');
  assert.ok(content.querySelector('.ca-embed-body').innerHTML.includes('<strong>Annonce importante</strong>'));
  console.log('✅ composeur : salons, rôles, aperçu et formatage Markdown rendus correctement');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
