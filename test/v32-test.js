// Test v1.32 : améliorations dashboard — sélecteurs (salons/rôles), couleur du bouton,
// questionnaire d'ouverture, et vérification que toutes les routes de modules fonctionnent.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v32-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const panels = require('../server/discord/panels');

(async () => {
  // ---------- 1. Bot en ligne simulé avec salons + rôles ----------
  const botManager = require('../server/discord/botManager');
  const guildChannels = new Map([
    ['C1', { id: 'C1', name: 'bienvenue', type: 0 }],
    ['C2', { id: 'C2', name: 'support', type: 0 }],
    ['C3', { id: 'C3', name: 'Tickets', type: 4 }],
  ]);
  const guildRoles = new Map([
    ['R1', { id: 'R1', name: 'Membre' }],
    ['R2', { id: 'R2', name: 'Staff' }],
  ]);
  botManager.clients.set(1, {
    client: {
      isReady: () => true,
      guilds: { cache: { get: (id) => (id === 'G1' ? {
        name: 'Serveur Test', iconURL: () => '', memberCount: 42,
        channels: { cache: guildChannels },
        roles: { cache: guildRoles },
      } : undefined) } },
    },
  });

  store.users.create('admin@x.fr', 'x');
  store.bots.create({ user_id: 1, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
  store.users.create('moi@d.fr', 'x', { discord_id: 'D2', discord_username: 'moi' });
  store.users.updateDiscord(2, {
    discord_id: 'D2', discord_username: 'moi', discord_avatar: '',
    discord_guilds: JSON.stringify([{ id: 'G1', name: 'Serveur Test', icon: '', owner: true, permissions: '0' }]),
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

  const CK = { Cookie: `botdev_session=${store.sessions.create(2)}` };

  // ---------- 2. La config serveur inclut les salons et rôles (sélecteurs) ----------
  const g = await fetchJson('/bots/1/guilds/G1', { headers: CK });
  assert(g.status === 200, 'config 200');
  assert(Array.isArray(g.json.channels) && g.json.channels.length === 3, '3 salons renvoyés : ' + g.json.channels.length);
  assert(g.json.channels.some((c) => c.name === 'bienvenue' && !c.category), 'salon textuel');
  assert(g.json.channels.some((c) => c.name === 'Tickets' && c.category), 'catégorie marquée');
  assert(Array.isArray(g.json.roles) && g.json.roles.length === 2, '2 rôles renvoyés');
  console.log('1️⃣  Config serveur : salons (3) + rôles (2) pour les sélecteurs ✅');

  // ---------- 3. Tickets : nouveaux champs (couleur bouton + questionnaire) ----------
  const put = await fetchJson('/bots/1/tickets', {
    method: 'PUT', headers: CK,
    body: JSON.stringify({
      guild_id: 'G1', name: 'Support', channel: '#support', button_label: 'Aide !',
      button_style: '3', require_reason: 0, support_role: 'Staff', category: 'Tickets',
      message: '', types: [],
    }),
  });
  assert(put.status === 200, 'PUT tickets 200 : ' + JSON.stringify(put.json));
  const cfg = store.tickets.get(1, 'G1');
  assert(cfg.button_style === '3' && cfg.require_reason === 0, 'champs persistés : ' + JSON.stringify({ s: cfg.button_style, r: cfg.require_reason }));
  console.log('2️⃣  Tickets : couleur du bouton (vert) + questionnaire désactivé persistés ✅');

  // ---------- 4. Le panneau utilise la couleur choisie ----------
  let sent = null;
  await panels.sendTicketPanel(1, 'G1', { user: { displayAvatarURL: () => 'https://x/a.png' } }, { send: async (p) => { sent = p; } });
  const btn = sent.components[0].components[0];
  assert(btn.data.style === 3, 'style du bouton = 3 (vert), obtenu ' + btn.data.style);
  console.log('3️⃣  Panneau : bouton VERT appliqué ✅');

  // ---------- 5. Questionnaire désactivé → ouverture directe sans modale ----------
  let opened = false;
  const openInt = {
    guild: { id: 'G1', name: 'T', ownerId: 'O', roles: { cache: { get: () => undefined, find: () => undefined } },
      channels: { cache: { get: () => undefined, find: () => undefined },
        create: async () => { opened = true; return { id: 'NC', name: 't-x', send: async () => {}, topic: '' }; } } },
    user: { id: 'U1' },
    member: { user: { id: 'U1', username: 'Membre', tag: 'M#1' }, roles: { cache: { has: () => false } } },
    customId: 'bd-ticket:1', isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
    isChannelSelectMenu: () => false, isRoleSelectMenu: () => false, isModalSubmit: () => false,
    reply: async () => {}, showModal: async () => { opened = 'MODAL'; },
  };
  await panels.dispatchPanels(1, openInt);
  assert(opened === true, 'ticket ouvert DIRECTEMENT (sans modale)');
  console.log('4️⃣  Questionnaire désactivé → ouverture directe ✅');

  // ---------- 6. Questionnaire réactivé → modale obligatoire ----------
  store.tickets.set(1, 'G1', { ...cfg, require_reason: 1 });
  let modalShown = false;
  const openInt2 = { ...openInt, showModal: async () => { modalShown = true; } };
  await panels.dispatchPanels(1, openInt2);
  assert(modalShown === true, 'modale de raison demandée');
  console.log('5️⃣  Questionnaire réactivé → modale de raison ✅');

  // ---------- 7. Bienvenue : config avec sélecteurs (salon + couleur) ----------
  const ev = await fetchJson('/bots/1/guilds/G1/events/member_join', {
    method: 'PUT', headers: CK,
    body: JSON.stringify({ enabled: true, config: { channel: '#bienvenue', message: 'Bienvenue {user} !', embed: true, color: '#ED4245', image: '' } }),
  });
  assert(ev.status === 200, 'événement enregistré : ' + JSON.stringify(ev.json));
  const evState = store.events.all(1, 'G1');
  assert(evState.member_join.config.color === '#ED4245', 'couleur enregistrée');
  console.log('6️⃣  Bienvenue : salon sélectionné + couleur #ED4245 enregistrés ✅');

  // ---------- 8. Autorole : rôle sélectionné ----------
  const ar = await fetchJson('/bots/1/guilds/G1/events/autorole', {
    method: 'PUT', headers: CK,
    body: JSON.stringify({ enabled: true, config: { role: 'Membre' } }),
  });
  assert(ar.status === 200, 'autorole enregistré');
  console.log('7️⃣  Auto-rôle : rôle « Membre » enregistré ✅');

  // ---------- 9. Toutes les routes des modules du dashboard répondent ----------
  const moduleRoutes = [
    ['GET', '/bots/1/guilds/G1/shop', null],
    ['GET', '/bots/1/guilds/G1/sanctions', null],
    ['GET', '/bots/1/guilds/G1/suggestions', null],
    ['GET', '/bots/1/guilds/G1/giveaways', null],
    ['GET', '/bots/1/guilds/G1/temproles', null],
    ['GET', '/bots/1/economy/leaderboard?guild_id=G1', null],
    ['PUT', '/bots/1/guilds/G1/xp', { enabled: 1, min: 10, max: 25, cooldown: 60, message: '', channel: '', roles: [] }],
    ['PUT', '/bots/1/guilds/G1/automod', { enabled: 1, links: 1, caps: 1, mentions: 5, spam: 5, blacklist: [] }],
    ['PUT', '/bots/1/guilds/G1/settings', { prefix: '?', suggestion_channel: '#idees', log_channel: '#logs' }],
    ['PUT', '/bots/1/guilds/G1/shop', { items: [{ name: 'VIP', description: 'x', price: 500, role: 'VIP', emoji: '💎' }] }],
    ['PUT', '/bots/1/guilds/G1/sanctions', { sanctions: [{ name: 'flood', action: 'timeout', duration: 10, message: 'Flood' }] }],
  ];
  let allOk = true;
  for (const [method, route, body] of moduleRoutes) {
    const r = await fetchJson(route, { method, headers: CK, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.status !== 200) { allOk = false; console.log('   ❌', method, route, '→', r.status, JSON.stringify(r.json).slice(0, 90)); }
  }
  assert(allOk, 'toutes les routes des modules répondent 200');
  console.log('8️⃣  Les 11 routes des modules du dashboard répondent toutes ✅');

  server.close();
  console.log('\n🎉 Tous les tests v1.32 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
