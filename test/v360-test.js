// v360 — photos Discord, avatars animés et décorations d’avatar dans
// l’espace fondateur; vraie photo du bot Optimus Prime dans l’en-tête.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAILS = '';
process.env.NEXORA_ADMIN_DISCORD_ID = '100000000000000001';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v360-'));

const store = require('../server/db');
const express = require('express');
const cookieParser = require('cookie-parser');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

(async () => {
  const adminId = store.users.create('fondateur@v360.test', 'x', {
    discord_id: '100000000000000001', discord_username: 'Fondateur',
  });
  const memberId = store.users.create('membre@v360.test', 'x', {
    discord_id: '200000000000000002', discord_username: 'Membre Nitro',
    discord_avatar: 'a_animatedhash123', discord_deco: 'decoration_hash_456',
  });
  store.users.updateDiscord(memberId, {
    discord_id: '200000000000000002',
    discord_username: 'Membre Nitro',
    discord_avatar: 'a_animatedhash123',
    discord_deco: 'decoration_hash_456',
    discord_guilds: '[]',
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => resolve(httpServer));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const cookie = `botdev_session=${store.sessions.create(adminId)}`;
    const fetchJson = async (route, opts = {}) => {
      const res = await fetch(base + route, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) },
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    };

    const listed = await fetchJson('/admin/users');
    assert.strictEqual(listed.status, 200, 'le fondateur voit les comptes');
    const member = listed.json.users.find((u) => Number(u.id) === Number(memberId));
    assert(member && member.discord_avatar === 'a_animatedhash123', 'le hash d’avatar Discord est transmis');
    assert.strictEqual(member.discord_deco, 'decoration_hash_456', 'la décoration Discord est transmise à l’espace fondateur');

    const searched = await fetchJson('/admin/users?q=Nitro');
    assert.strictEqual(searched.status, 200);
    assert.strictEqual(searched.json.users[0].discord_deco, 'decoration_hash_456', 'la recherche conserve aussi la décoration');

    const unlinked = await fetchJson(`/admin/users/${memberId}/unlink-discord`, { method: 'POST' });
    assert.strictEqual(unlinked.status, 200);
    const cleared = store.users.findById(memberId);
    assert.strictEqual(cleared.discord_id, '', 'la déliaison continue de retirer le compte Discord');
    assert.strictEqual(cleared.discord_avatar, '', 'la déliaison efface l’ancien avatar');
    assert.strictEqual(cleared.discord_deco, '', 'la déliaison efface aussi l’ancienne décoration');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const js = read('public/js/app.js');
  const css = read('public/css/dashboard.css');
  const routes = read('server/routes.js');
  const index = read('public/index.html');
  const sw = read('public/sw.js');
  const changelog = require('../server/discord/changelog');

  assert(js.includes('id="a-bot-avatar"') && js.includes('/api/public/bot-avatar?v=360'), 'l’en-tête utilise l’avatar officiel du bot, pas les initiales OP');
  assert(routes.includes("router.get('/public/bot-avatar'"), 'l’avatar Optimus est servi par la route image publique');
  assert(js.includes("hash.startsWith('a_') ? 'gif' : 'png'"), 'les avatars Discord animés restent animés');
  assert(js.includes('https://cdn.discordapp.com/embed/avatars/${index}.png?size=96'), 'un compte sans photo reçoit son avatar Discord par défaut');
  assert(js.includes("return `/api/img?u=${encodeURIComponent(source)}`"), 'les photos Discord passent par le proxy du site');
  assert(js.includes('u.discord_deco') && js.includes('Dashboard.userDecoUrl') && js.includes('Dashboard.decoWrap'), 'les décorations d’avatar sont superposées si le compte en a une');
  assert(routes.includes('discord_deco: u.discord_deco || \'\''), 'l’API fondateur transmet la décoration sauvegardée');
  assert(css.includes('.admin-platform-page .admin-linked-avatar') && css.includes('overflow: visible;'), 'la décoration déborde proprement autour de la photo sans être rognée');
  assert(css.includes('.admin-platform-page .admin-linked-copy b') && css.includes('text-overflow: ellipsis;'), 'les noms longs ne déplacent pas les actions du tableau');
  assert(css.includes('.admin-platform-page .admin-users-table tbody tr {') && css.includes('.admin-platform-page .admin-users-table tbody td:nth-child(5) {'), 'sur mobile, chaque compte devient une carte qui garde toutes ses actions visibles');
  assert(js.includes('data-unlink') && js.includes('data-ban') && js.includes('data-unban') && js.includes('data-delete'), 'les actions de gestion des comptes restent présentes');
  assert((index.match(/\?v=360/g) || []).length === 7 && sw.includes("const CACHE = 'botdev-v360';"), 'les assets et le cache navigateur sont invalidés en v360');
  assert.strictEqual(changelog.VERSION, 360, 'le journal de versions est en v360');
  assert.strictEqual(changelog.VERSIONS[0].v, 360, 'v360 apparaît en tête du journal');
  assert.strictEqual(changelog.VERSIONS[1].v, 359, 'v359 reste la version précédente');

  console.log('✅ v360 : API des comptes, avatars Discord, décoration, bot Optimus et versionnement vérifiés');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
