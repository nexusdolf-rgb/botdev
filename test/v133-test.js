// ============================================================
// Test v3.33 — Langue du serveur configurable depuis le dashboard.
// Le sélecteur réutilise la même colonne `guild_settings.lang` que /lang.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
delete process.env.NEXORA_ADMIN_DISCORD_ID;
delete process.env.NEXORA_ADMIN_FAIL_CLOSED;
process.env.ADMIN_EMAILS = '';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v133-'));

(async () => {
  const store = require('../server/db');
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const userId = store.users.create('langue@test.local', 'x', { discord_id: 'D_LANG', discord_username: 'Langue' });
  store.users.updateDiscord(userId, {
    discord_id: 'D_LANG',
    discord_username: 'Langue',
    discord_guilds: JSON.stringify([{ id: 'G_LANG', name: 'Serveur langue', owner: true, permissions: '0' }]),
  });
  const botId = store.bots.create({ user_id: 99, name: 'Hoxera', token: 'T', client_id: 'C', prefix: '!' });
  // Le bot peut appartenir à un autre compte dans le modèle Hoxera public.
  const token = store.sessions.create(userId);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => resolve(httpServer));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const res = await fetch(`${base}/bots/${botId}/guilds/G_LANG/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: `botdev_session=${token}` },
    body: JSON.stringify({ lang: 'en' }),
  });
  assert.strictEqual(res.status, 200, 'route settings accepte la langue');
  assert.strictEqual(store.guildSettings.get(botId, 'G_LANG').lang, 'en');
  server.close();
  console.log('1️⃣  API : langue du serveur enregistrée dans guild_settings ✅');

  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
    url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
  w.fetch = async () => ({ ok: true, json: async () => ({}) });
  w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + fs.readFileSync('public/js/dashboard.js', 'utf8') + '\nwindow.App=App;window.Dashboard=Dashboard;');
  w.App.state = { user: { id: 1, is_admin: false } };
  w.Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!' }, guildId: 'G1', module: 'server' };
  const calls = [];
  w.App.api = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes('/temproles')) return { roles: [] };
    return { ok: true };
  };
  const data = {
    guild: { id: 'G1', name: 'Serveur test', members: 5 },
    settings: { prefix: '!', lang: 'en', warn_limit: 0, warn_action: 'none', xp_enabled: 1 },
    channels: [], roles: [], voicetemp: {}, lockdown: { locked: false, channels: [] },
  };
  const content = w.document.createElement('div');
  await w.Dashboard.renderers.server(content, data);
  const lang = content.querySelector('#g-lang');
  assert(lang && lang.tagName === 'SELECT', 'langue rendue comme select');
  assert.strictEqual(lang.value, 'en');
  assert(lang.querySelector('option[value="fr"]') && lang.querySelector('option[value="en"]'));
  lang.value = 'fr';
  content.querySelector('#g-save').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const saveCall = calls.find((call) => call.url.includes('/settings') && call.opts.method === 'PUT');
  assert(saveCall && saveCall.opts.body.lang === 'fr', 'la sélection est envoyée à l API');
  console.log('2️⃣  Dashboard : Français/English sélectionnables par serveur ✅');
  console.log('\n🎉 Tous les tests v3.33 passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
