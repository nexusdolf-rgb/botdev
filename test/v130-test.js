// ============================================================
// Test v3.25 — Espace Administration Nexora : comptes liés,
// déliaison Discord, bannissement/débannissement et suppression.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = '';
process.env.NEXORA_ADMIN_DISCORD_ID = '100000000000000001';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v130-'));

const store = require('../server/db');
const express = require('express');
const cookieParser = require('cookie-parser');

(async () => {
  const adminId = store.users.create('fondateur@nexora.test', 'x', { discord_id: '100000000000000001', discord_username: 'Fondateur' });
  assert.strictEqual(Number(adminId), 1, 'le fondateur est le premier compte');
  const targetId = store.users.create('membre@nexora.test', 'x', { discord_id: '100000000000000002', discord_username: 'Membre Test' });
  store.users.updateDiscord(targetId, {
    discord_id: '100000000000000002',
    discord_username: 'Membre Test',
    discord_avatar: 'avatar',
    discord_guilds: JSON.stringify([{ id: 'G1', name: 'Serveur test', owner: true, permissions: '0' }]),
  });
  store.discordTokens.set(targetId, { access: 'access-test', refresh: 'refresh-test', expires: new Date(Date.now() + 3600000).toISOString() });

  const targetBotId = store.bots.create({ user_id: targetId, name: 'Bot membre', token: 'token-test', client_id: 'client-test', prefix: '!' });
  store.commands.create({ bot_id: targetBotId, name: 'commande_test', description: 'test', trigger_type: 'prefix', trigger_value: 'test', options: '[]', blocks: '[]', cooldown: 0, enabled: 1, sort: 0 });
  store.tickets.set(targetBotId, 'G1', { name: 'Support membre', channel: '#support' });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => resolve(httpServer));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const adminCookie = `botdev_session=${store.sessions.create(adminId)}`;
  const targetCookie = `botdev_session=${store.sessions.create(targetId)}`;
  const fetchJson = async (route, opts = {}) => {
    const res = await fetch(base + route, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  const initial = await fetchJson('/admin/users', { headers: { Cookie: adminCookie } });
  assert.strictEqual(initial.status, 200);
  const initialAudit = await fetchJson('/admin/audit', { headers: { Cookie: adminCookie } });
  assert.strictEqual(initialAudit.status, 200, 'journal admin accessible uniquement au fondateur');
  const listed = initial.json.users.find((u) => Number(u.id) === Number(targetId));
  assert(listed && listed.discord_linked && listed.guild_count === 1 && !listed.banned, 'compte Discord listé avec son serveur');
  const denied = await fetchJson('/admin/users', { headers: { Cookie: targetCookie } });
  assert.strictEqual(denied.status, 403, 'un compte normal ne voit pas l administration');
  console.log('1️⃣  Espace admin : comptes Discord visibles uniquement par le fondateur ✅');

  const unlink = await fetchJson(`/admin/users/${targetId}/unlink-discord`, { method: 'POST', headers: { Cookie: adminCookie } });
  assert.strictEqual(unlink.status, 200);
  assert(store.users.findById(targetId) && !store.users.findById(targetId).discord_id, 'compte Nexora conservé après déliaison');
  assert.strictEqual(store.discordTokens.get(targetId), null, 'jeton Discord supprimé après déliaison');
  console.log('2️⃣  Délier Discord : liaison supprimée, compte Nexora conservé ✅');

  // Relie de nouveau le compte uniquement pour tester le bannissement.
  store.users.updateDiscord(targetId, {
    discord_id: '100000000000000002', discord_username: 'Membre Test', discord_avatar: 'avatar',
    discord_guilds: JSON.stringify([{ id: 'G1', name: 'Serveur test', owner: true, permissions: '0' }]),
  });
  store.sessions.create(targetId);
  const ban = await fetchJson(`/admin/users/${targetId}/ban`, {
    method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ reason: 'Test de modération Nexora' }),
  });
  assert.strictEqual(ban.status, 200);
  assert(store.platformBans.isBanned(targetId), 'bannissement enregistré');
  const bannedSession = await fetchJson('/auth/me', { headers: { Cookie: targetCookie } });
  assert([401, 403].includes(bannedSession.status), 'session d un compte banni refusée');
  console.log('3️⃣  Bannir Nexora : accès bloqué et données conservées ✅');

  const unban = await fetchJson(`/admin/users/${targetId}/ban`, { method: 'DELETE', headers: { Cookie: adminCookie } });
  assert.strictEqual(unban.status, 200);
  assert(!store.platformBans.isBanned(targetId), 'bannissement retiré');
  const freshTargetCookie = `botdev_session=${store.sessions.create(targetId)}`;
  const unbannedMe = await fetchJson('/auth/me', { headers: { Cookie: freshTargetCookie } });
  assert.strictEqual(unbannedMe.status, 200, 'compte débanni reconnectable');
  console.log('4️⃣  Débannir Nexora : reconnexion possible ✅');

  const selfBan = await fetchJson(`/admin/users/${adminId}/ban`, { method: 'POST', headers: { Cookie: adminCookie }, body: JSON.stringify({ reason: 'non' }) });
  const selfDelete = await fetchJson(`/admin/users/${adminId}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
  assert.strictEqual(selfBan.status, 400);
  assert.strictEqual(selfDelete.status, 400);
  console.log('5️⃣  Compte fondateur protégé contre bannissement et suppression ✅');

  const deleted = await fetchJson(`/admin/users/${targetId}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
  assert.strictEqual(deleted.status, 200);
  assert.strictEqual(store.users.findById(targetId), undefined, 'utilisateur supprimé');
  assert.strictEqual(store.bots.get(targetBotId), undefined, 'bot utilisateur supprimé');
  assert.strictEqual(store.db.prepare('SELECT COUNT(*) AS n FROM commands WHERE bot_id = ?').get(targetBotId).n, 0, 'commandes associées supprimées');
  assert.strictEqual(store.db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE bot_id = ?').get(targetBotId).n, 0, 'configuration associée supprimée');
  const audit = await fetchJson('/admin/audit', { headers: { Cookie: adminCookie } });
  assert(audit.json.audit.some((entry) => entry.action === 'unlink_discord'));
  assert(audit.json.audit.some((entry) => entry.action === 'ban_user'));
  assert(audit.json.audit.some((entry) => entry.action === 'unban_user'));
  assert(audit.json.audit.some((entry) => entry.action === 'delete_user'));
  console.log('6️⃣  Suppression complète : compte, bot et données associées supprimés ✅');
  server.close();

  // ---------- Élément de navigation visible par le fondateur uniquement ----------
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', { url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only' });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
  w.fetch = async () => ({ ok: true, json: async () => ({}) });
  w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\n' + fs.readFileSync('public/js/dashboard.js', 'utf8') + '\nwindow.App=App;window.Dashboard=Dashboard;');
  w.App.state = { user: { id: 1, is_admin: true } };
  w.Dashboard.state = { bot: { id: 1, name: 'Hoxera' }, guildId: null, guildData: null, discordGuilds: [] };
  const asideAdmin = w.document.createElement('aside');
  w.Dashboard.renderSide(asideAdmin);
  assert(asideAdmin.textContent.includes('Administrateur global'), 'le fondateur voit le bouton admin');
  w.Dashboard.state.discordGuilds = [{ id: 'G1', name: 'Serveur A' }, { id: 'G2', name: 'Serveur B' }];
  w.Dashboard.state.guildId = 'G2';
  const asideAfterServerChange = w.document.createElement('aside');
  w.Dashboard.renderSide(asideAfterServerChange);
  const sideItems = [...asideAfterServerChange.querySelectorAll('.dash-side-item')];
  const serverIndex = sideItems.findIndex((item) => item.dataset.m === 'server');
  const globalIndex = sideItems.findIndex((item) => item.dataset.platformAdmin === 'true');
  assert(globalIndex > serverIndex, 'le bouton global reste après la gestion du serveur');
  assert(asideAfterServerChange.textContent.includes('Administrateur global'), 'le bouton reste visible après changement de serveur');
  w.App.state.user = { id: 2, is_admin: false };
  const asideUser = w.document.createElement('aside');
  w.Dashboard.renderSide(asideUser);
  assert(!asideUser.textContent.includes('Administrateur global'), 'un utilisateur normal ne voit pas le bouton admin');
  console.log('7️⃣  Dashboard : espace admin visible uniquement par le fondateur ✅');

  console.log('\n🎉 Tous les tests v3.25 passent !');
  process.exit(0);
})().catch((e) => {
  console.error('❌', e.stack || e.message || e);
  process.exit(1);
});
