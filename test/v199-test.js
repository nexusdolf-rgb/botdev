// Test v199 — Hub Fondateur (espace privé) : stats enrichies, recherche
// comptes, filtre journal, activité globale, réglages plateforme, santé.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v199-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  // ================= 1. Données de test =================
  console.log('\n1️⃣  Préparation');
  const uid1 = store.users.create('discord:199a@discord.botdev', 'x', {});
  const uid2 = store.users.create('discord:199b@discord.botdev', 'x', {});
  store.users.updateDiscord(uid1, { discord_id: '199000000000000001', discord_username: 'fondateur', discord_avatar: '', discord_guilds: JSON.stringify([{ id: 'G1', name: 'Serveur A', icon: '', owner: true, permissions: '0' }]) });
  store.users.updateDiscord(uid2, { discord_id: '199000000000000002', discord_username: 'testeur', discord_avatar: '', discord_guilds: JSON.stringify([{ id: 'G2', name: 'Serveur B', icon: '', owner: true, permissions: '0' }]) });
  const BOT = store.bots.create({ user_id: uid1, name: 'Optimus Prime', token: 'T', client_id: '1', prefix: '!' });
  store.activity.add(BOT, 'G1', '🎫', 'Ticket #1 ouvert');
  store.activity.add(BOT, 'G1', '📢', 'Annonce envoyée');
  store.settings.set('last_backup', new Date().toISOString());
  store.platformAudit.add(uid1, uid2, 'ban_user', 'Test');

  // ================= 2. Routes admin enrichies =================
  console.log('\n2️⃣  Routes admin');
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // Session admin : l'utilisateur #1 est admin par repli (hors production)
  const ck = `botdev_session=${store.sessions.create(uid1)}`;
  const fetchJson = async (p, opts = {}) => {
    const res = await fetch(base + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
  const H = { Cookie: ck };

  // Vérifier que le repli admin s'applique (uid1 === id 1 ? pas forcément en test)
  const me = await fetchJson('/auth/me', { headers: H });
  // On force via env pour le test : le serveur de test ne tourne pas en prod
  const isAdminInTest = me.json.user && (me.json.user.is_admin === true);

  const stats = await fetchJson('/admin/stats', { headers: H });
  check('admin/stats → 200', stats.status === 200);
  check('admin/stats : nouveaux champs présents', stats.json.tickets !== undefined && stats.json.messages24h !== undefined && 'lastBackup' in stats.json);

  const usersAll = await fetchJson('/admin/users', { headers: H });
  check('admin/users → 200 + liste', usersAll.status === 200 && Array.isArray(usersAll.json.users));
  const usersQ = await fetchJson('/admin/users?q=testeur', { headers: H });
  check('admin/users?q= → filtre par nom', usersQ.status === 200 && usersQ.json.users.length === 1 && usersQ.json.users[0].discord_username === 'testeur');

  const auditAll = await fetchJson('/admin/audit', { headers: H });
  check('admin/audit → 200 + liste', auditAll.status === 200 && Array.isArray(auditAll.json.audit));
  const auditBan = await fetchJson('/admin/audit?action=ban_user', { headers: H });
  check('admin/audit?action= → filtre', auditBan.status === 200 && auditBan.json.audit.every((a) => a.action === 'ban_user'));

  const activity = await fetchJson('/admin/activity?limit=10', { headers: H });
  check('admin/activity → 200 + items', activity.status === 200 && Array.isArray(activity.json.items) && activity.json.items.length >= 2);
  check('admin/activity : champs enrichis', activity.json.items.some((i) => i.emoji && i.text));

  const settingsGet = await fetchJson('/admin/settings', { headers: H });
  check('admin/settings GET → 200 + clés', settingsGet.status === 200 && 'public_url' in settingsGet.json && 'last_backup' in settingsGet.json);
  const settingsPut = await fetchJson('/admin/settings', { method: 'PUT', headers: H, body: JSON.stringify({ public_url: 'https://hoxera.onrender.com', profile_banner_url: 'https://example.com/banner.png' }) });
  check('admin/settings PUT → 200', settingsPut.status === 200);
  const settingsGet2 = await fetchJson('/admin/settings', { headers: H });
  check('admin/settings : valeurs enregistrées', settingsGet2.json.public_url === 'https://hoxera.onrender.com' && settingsGet2.json.profile_banner_url === 'https://example.com/banner.png');
  const settingsBad = await fetchJson('/admin/settings', { method: 'PUT', headers: H, body: JSON.stringify({ public_url: 'pas-une-url' }) });
  check('admin/settings PUT invalide → 400', settingsBad.status === 400);

  const system = await fetchJson('/admin/system', { headers: H });
  check('admin/system → 200 + uptime', system.status === 200 && system.json.uptimeMs > 0);

  server.close();

  // ================= 3. Front — Hub fondateur =================
  console.log('\n3️⃣  Front — Hub fondateur');
  const appJs = read('public/js/app.js');
  check('5 onglets définis', ['overview', 'users', 'bots', 'audit', 'settings'].every((t) => appJs.includes(`'${t}'`) || appJs.includes(`["${t}"`)));
  check('renderOverview (stats + santé + activité)', appJs.includes('renderOverview') && appJs.includes('/admin/activity') && appJs.includes('#a-backup-now'));
  check('renderUsers (recherche + gestion)', appJs.includes('renderUsers') && appJs.includes('#a-search') && appJs.includes('unlink-discord'));
  check('renderBots (démarrer/arrêter)', appJs.includes('renderBots') && appJs.includes('/admin/bots') && appJs.includes('/bots/${b.id}/start'));
  check('renderAudit (filtre)', appJs.includes('renderAudit') && appJs.includes('#a-audit-filter'));
  check('renderSettings (réglages + sauvegarde)', appJs.includes('renderSettings') && appJs.includes('#a-public-url') && appJs.includes('/backup/now'));

  const css = read('public/css/dashboard.css');
  check('CSS v199 présent', css.includes('AUDIT UI v199') || css.includes('HUB FONDATEUR'));
  check('CSS : onglets admin', css.includes('.admin-tabs') && css.includes('.admin-tab'));
  check("CSS : flux d'activité", css.includes('.activity-item'));

  console.log(failures === 0
    ? '\n🎉 Tous les tests v1.99 passent — Hub Fondateur opérationnel !'
    : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
