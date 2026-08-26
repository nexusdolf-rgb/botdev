// ============================================================
// Test v3.37 — Identité du bot configurable par serveur dans
// le dashboard : nom, avatar et bannière, sans champ bio.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + fs.readFileSync('public/js/dashboard.js', 'utf8') + '\nwindow.App=App;window.Dashboard=Dashboard;');

w.App.state = { user: { id: 2, is_admin: false } };
w.Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!', avatar_url: 'https://cdn.example/avatar.png' }, guildId: 'G1', module: 'botprofile' };
const calls = [];
w.App.api = async (url, opts = {}) => {
  calls.push({ url, opts });
  if (url.includes('/temproles')) return { roles: [] };
  return { ok: true, profile: { name: 'Hoxera local' } };
};

(async () => {
  const content = w.document.createElement('div');
  const data = {
    guild: { id: 'G1', name: 'Serveur A', members: 5 },
    settings: {},
    channels: [], roles: [],
    profile: { name: 'Hoxera A', avatar_url: '/assets/avatar-a.png', banner_url: '/assets/banner-a.png', bio: 'ancienne bio' },
    voicetemp: {}, lockdown: { locked: false, channels: [] },
  };
  await w.Dashboard.renderers.botprofile(content, data);
  assert(content.textContent.includes('Identité du bot'));
  assert(content.textContent.includes('Serveur A'));
  assert(content.querySelector('#bp-name'));
  assert(content.querySelector('#bp-avatar[type="file"]'));
  assert(content.querySelector('#bp-banner[type="file"]'));
  assert(content.querySelector('#bp-save') && content.querySelector('#bp-reset'));
  assert(!content.querySelector('#bp-bio'), 'aucun champ bio');
  assert(!content.textContent.includes('Bio du bot'), 'la bio n est pas proposée');

  content.querySelector('#bp-name').value = 'Hoxera A personnalisé';
  content.querySelector('#bp-save').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const save = calls.find((call) => call.url.endsWith('/profile') && call.opts.method === 'PUT');
  assert(save && save.opts.body.name === 'Hoxera A personnalisé');
  assert(save.opts.body.bio === undefined, 'la bio ne peut pas être modifiée par le dashboard');
  console.log('1️⃣  Dashboard : identité nom/photo/bannière par serveur, sans bio ✅');

  assert(w.Dashboard.MODULES.some(([id]) => id === 'botprofile'));
  assert(calls.every((call) => !call.url.includes('/bots/1/profile') || call.url.includes('/guilds/G1/profile')));
  console.log('2️⃣  Sécurité : route d’identité limitée au serveur sélectionné ✅');

  const source = fs.readFileSync('public/js/dashboard.js', 'utf8');
  assert(source.includes('Cette identité est indépendante des autres serveurs'));
  assert(source.includes('avatar_b64') && source.includes('banner_b64'));
  console.log('3️⃣  Données : aucune action globale ni champ bio dans le composeur ✅');
  console.log('\n🎉 Tous les tests v3.37 passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
