// Test v1.18 : identité du bot par serveur, logs + liste noire, panneau admin
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
// v236 — lecteur de payload Components V2
const v2 = require('./helpers/v2');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v18-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const assets = require('../server/assets');
const { runAutomod } = require('../server/discord/automod');
const { handleProfileCommand } = require('../server/discord/profileCommands');
const { buildSlashPayloads, buildHelpPanel } = require('../server/discord/premade');
const logging = require('../server/discord/logging');

(async () => {
  // ---------- 1. Assets : stockage local ----------
  const pngBuf = await require('sharp')({ create: { width: 1, height: 1, channels: 3, background: { r: 20, g: 40, b: 60 } } }).png().toBuffer();
  const key = await assets.put(pngBuf, 'image/png');
  assert(/^[a-f0-9]{16}\.png$/.test(key), 'clé png attendue');
  const got = await assets.get(key);
  assert(got && got.buffer.equals(pngBuf) && got.mime === 'image/png');
  assert((await require('sharp')(got.buffer).metadata()).format === 'png');
  console.log('1️⃣  Magasin d\'images : écriture + lecture locale ✅ (', key.slice(0, 10) + '… )');

  // ---------- 2. v374 : identité par serveur retirée ----------
  assert(!fs.existsSync(path.join(__dirname, '../server/discord/identity.js')), 'identity.js doit être supprimé');
  assert(!fs.existsSync(path.join(__dirname, '../server/discord/profileWizard.js')), 'profileWizard.js doit être supprimé');
  assert(!('botProfiles' in store), 'API botProfiles retirée du store');
  assert(!('profileAliases' in store) && !('profileState' in store), 'alias et état retirés du store');
  console.log('2️⃣  Identité par serveur absente du code et du store ✅');

  // ---------- 7. /modlogs + /blacklist ----------
  const cmd2 = (name, sub, opts = {}) => ({
    guild: { id: 'G1', ownerId: 'OWNER1' },
    user: { id: opts.userId || 'OWNER1' },
    member: { permissions: { has: () => false } },
    commandName: name,
    options: {
      getSubcommand: () => sub,
      getString: () => opts.word || null,
      getChannel: () => ({ isTextBased: () => true, name: 'logs', toString: () => '<#logs>' }),
    },
    reply: async (p) => { cmdReply = p; },
  });
  await handleProfileCommand(1, cmd2('modlogs', 'set'));
  assert(cmdReply.content.includes('#logs'));
  const gs = store.guildSettings.get(1, 'G1');
  assert(gs.log_channel === '#logs');
  await handleProfileCommand(1, cmd2('blacklist', 'add', { word: 'spam123' }));
  assert(store.blacklist.all(1, 'G1').includes('spam123'));
  await handleProfileCommand(1, cmd2('blacklist', 'list'));
  assert(cmdReply.embeds[0].data.description.includes('spam123'));
  await handleProfileCommand(1, cmd2('blacklist', 'remove', { word: 'spam123' }));
  assert(store.blacklist.all(1, 'G1').length === 0);
  console.log('7️⃣  /modlogs set ✅ /blacklist add/list/remove ✅');

  // ---------- 8. Auto-mod : liste noire + log ----------
  store.blacklist.add(1, 'G1', 'arnaque');
  let logSent = null;
  const logGuild = {
    id: 'G1', name: 'Serveur',
    channels: { cache: { get: () => undefined, find: () => ({ isTextBased: () => true, send: async (p) => { logSent = p; } }) } },
  };
  let deleted = false;
  const msg = {
    author: { id: 'U1', bot: false },
    guild: logGuild,
    member: { permissions: { has: () => false } },
    content: 'c\'est une arnaque totale !',
    deletable: true, delete: async () => { deleted = true; },
    channel: { id: 'C9' },
  };
  store.guildSettings.set(1, 'G1', { log_channel: '#logs', am_enabled: 1 });
  const r = await runAutomod(1, msg);
  assert(r.acted && r.reason.includes('arnaque') && deleted, 'mot interdit supprimé');
  // v236 — le journal (logging.js) est en Components V2 : le titre est porté
  // par le conteneur, plus par un embed.
  assert(logSent && v2.isV2(logSent) && v2.title(logSent).includes('Auto-modération'), 'log envoyé en V2');
  console.log('8️⃣  Liste noire : suppression + log ✅');

  // ---------- 9. Logging : /warn trace dans le salon ----------
  store.blacklist.remove(1, 'G1', 'arnaque');
  console.log('9️⃣  (log modération testé via premade — voir suite)');

  // ---------- 10. Payloads + help ----------
  const payloads = buildSlashPayloads(1);
  for (const n of ['modlogs', 'blacklist']) assert(payloads.some((x) => x.name === n), n + ' absent');
  assert(!payloads.some((x) => x.name === 'botprofile'), '/botprofile doit avoir disparu');
  store.modules.set(1, 'utility', true);
  const clientUser = { user: { username: 'T', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/a.png' } };
  // v262 — le centre d'aide est un panneau Components V2 (plus d'embed).
  const help = buildHelpPanel(1, { prefix: '!' }, clientUser, null, null);
  assert(JSON.stringify(help).includes('Configuration du serveur'));
  console.log('🔟  Payloads /modlogs + /blacklist + /help ✅');

  // ---------- 11. Admin API (simulation via fonctions) ----------
  // On teste isPlatformAdmin indirectement : l'utilisateur 1 est admin par défaut
  const http = require('http');
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const routes = require('../server/routes');
  app.use('/api', routes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const fetchJson = async (p, opts = {}) => {
    const res = await fetch(base + p, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };

  // Compte admin (id 1) + compte lambda (id 2) — création directe : depuis
  // v193 l'inscription par email/mot de passe a été retirée (connexion 100 %
  // OAuth2 Discord), donc on crée comptes + sessions de test ici.
  const adminId = store.users.create('admin@botdev.fr', 'x');
  const user2Id = store.users.create('user2@botdev.fr', 'x');
  const adminCookie = `botdev_session=${store.sessions.create(adminId)}`;
  const user2Cookie = `botdev_session=${store.sessions.create(user2Id)}`;

  const me = await fetchJson('/auth/me', { headers: { Cookie: adminCookie } });
  assert(me.json.user.is_admin === true, 'id 1 = admin');
  const me2 = await fetchJson('/auth/me', { headers: { Cookie: user2Cookie } });
  assert(me2.json.user.is_admin === false, 'id 2 = non admin');

  const stats = await fetchJson('/admin/stats', { headers: { Cookie: adminCookie } });
  assert(stats.status === 200 && stats.json.users === 2, 'stats admin OK');
  const denied = await fetchJson('/admin/stats', { headers: { Cookie: user2Cookie } });
  assert(denied.status === 403, 'non-admin refusé');

  const users = await fetchJson('/admin/users', { headers: { Cookie: adminCookie } });
  assert(users.json.users.length === 2);
  const del = await fetchJson('/admin/users/2', { method: 'DELETE', headers: { Cookie: adminCookie } });
  assert(del.status === 200);
  const delSelf = await fetchJson('/admin/users/1', { method: 'DELETE', headers: { Cookie: adminCookie } });
  assert(delSelf.status === 400, 'auto-suppression interdite');
  server.close();
  console.log('1️⃣1️⃣  Panneau admin API : admin ✅ non-admin refusé ✅ suppression ✅');

  console.log('\n🎉 Tous les tests v1.18 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
