// Test v1.31 : « Bot introuvable » corrigé — Hoxera est un bot unique public.
// N'importe quel utilisateur lié qui peut gérer un serveur doit pouvoir
// configurer Hoxera sur CE serveur, même si son id ≠ user_id du bot.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v31-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

(async () => {
  const store = require('../server/db');

  // Simule l'état réel de Render : un premier utilisateur (id 1) existe déjà
  // (ex : restauration d'une ancienne sauvegarde), et le bot est provisionné
  // avec user_id = 1. L'utilisateur qui se connecte est le n°2.
  store.users.create('ancien@compte.fr', 'x');
  store.bots.create({ user_id: 1, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });

  // L'utilisateur 2 lié à Discord, propriétaire du serveur G1
  store.users.create('moi@discord.fr', 'x', { discord_id: 'D2', discord_username: 'moi' });
  store.users.updateDiscord(2, {
    discord_id: 'D2', discord_username: 'moi', discord_avatar: '',
    discord_guilds: JSON.stringify([{ id: 'G1', name: 'Mon serveur', icon: '', owner: true, permissions: '0' }]),
  });

  // Simule le bot en ligne (client Discord connecté avec le serveur G1)
  const botManager = require('../server/discord/botManager');
  botManager.clients.set(1, {
    client: {
      isReady: () => true,
      guilds: { cache: { get: (id) => (id === 'G1' ? { name: 'Mon serveur', iconURL: () => '', memberCount: 18 } : undefined) } },
    },
  });

  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const fetchJson = async (p, opts = {}) => {
    const { headers, ...rest } = opts;
    const res = await fetch(base + p, { headers: { 'Content-Type': 'application/json', ...(headers || {}) }, ...rest });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };

  // Connexion de l'utilisateur 2 (session directe en base, comme après OAuth)
  const token = store.sessions.create(2);
  const CK = { Cookie: `botdev_session=${token}` };

  // ---------- 1. Le bug : GET /guilds/G1 renvoyait « Bot introuvable » ----------
  const g = await fetchJson('/bots/1/guilds/G1', { headers: CK });
  assert(g.status === 200, 'status attendu 200, obtenu ' + g.status + ' : ' + JSON.stringify(g.json).slice(0, 120));
  assert(g.json.guild && g.json.guild.name === 'Mon serveur', 'config du serveur renvoyée');
  console.log('1️⃣  GET /bots/1/guilds/G1 (utilisateur ≠ propriétaire du bot) → 200 ✅ (avant : « Bot introuvable »)');

  // ---------- 2. Toutes les routes par serveur acceptent l'utilisateur 2 ----------
  const checks = [
    ['GET', '/bots/1/guilds/G1/shop', null],
    ['GET', '/bots/1/guilds/G1/sanctions', null],
    ['GET', '/bots/1/guilds/G1/suggestions', null],
    ['GET', '/bots/1/guilds/G1/giveaways', null],
    ['GET', '/bots/1/guilds/G1/temproles', null],
    ['PUT', '/bots/1/guilds/G1/settings', { prefix: '?' }],
    ['PUT', '/bots/1/guilds/G1/xp', { enabled: true, min: 10, max: 25, cooldown: 60, message: '', channel: '', roles: [] }],
    ['PUT', '/bots/1/guilds/G1/automod', { enabled: 1, links: 1, caps: 1, mentions: 5, spam: 5, blacklist: [] }],
    ['PUT', '/bots/1/guilds/G1/events/member_join', { enabled: true, config: { channel: '#w', message: 'Salut' } }],
    ['PUT', '/bots/1/tickets', { guild_id: 'G1', name: 'Support', types: [] }],
    ['GET', '/bots/1/economy/leaderboard?guild_id=G1', null],
  ];
  let allOk = true;
  for (const [method, route, body] of checks) {
    const r = await fetchJson(route, {
      method,
      headers: CK,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (r.status !== 200) {
      allOk = false;
      console.log('   ❌', method, route, '→', r.status, JSON.stringify(r.json).slice(0, 100));
    }
  }
  assert(allOk, 'toutes les routes par serveur acceptent l\'utilisateur');
  console.log('2️⃣  Les 11 routes par serveur acceptent l\'utilisateur 2 ✅');

  // ---------- 3. Sécurité : serveur sans droits → refusé ----------
  store.users.updateDiscord(2, {
    discord_id: 'D2', discord_username: 'moi', discord_avatar: '',
    discord_guilds: JSON.stringify([{ id: 'G_AUTRE', name: 'Autre serveur', icon: '', owner: false, permissions: '0' }]),
  });
  const denied = await fetchJson('/bots/1/guilds/G_AUTRE', { headers: CK });
  assert(denied.status === 403, '403 attendu, obtenu ' + denied.status);
  console.log('3️⃣  Serveur sans permission → 403 ✅');

  // ---------- 4. isPlatformAdmin : le « propriétaire » du bot (user 1) reste admin ----------
  const me1 = await fetchJson('/auth/me', { headers: { Cookie: `botdev_session=${store.sessions.create(1)}` } });
  assert(me1.json.user.is_admin === true, 'utilisateur 1 = admin');
  console.log('4️⃣  Admin plateforme (utilisateur 1) toujours reconnu ✅');

  server.close();
  console.log('\n🎉 Tous les tests v1.31 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
