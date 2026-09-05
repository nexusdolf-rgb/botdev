// Test v218 — Catalogue rôles/salons resynchronisé via l'API Discord
// --------------------------------------------------
// Bug : un rôle créé sur le serveur n'apparaissait pas dans le dashboard.
// Cause : guildCatalog() lisait UNIQUEMENT le cache local du client Discord
// (dGuild.roles.cache), sans jamais re-synchroniser via l'API quand le cache
// applicatif expirait → si le bot avait raté l'événement roleCreate (hors
// ligne / redémarrage / déploiement), le rôle n'apparaissait jamais.
// Correctif : guildCatalog devient async et appelle roles.fetch() +
// channels.fetch() (REST) à chaque expiration du cache (10 s).
// Le dashboard recharge ce catalogue à chaque navigation d'onglet →
// un rôle créé à l'instant apparaît au plus ~10 s après, sans redémarrer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v218-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const botManager = require('../server/discord/botManager');
let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('\n▶ v218-test.js');

  // ---------- 1. Le correctif est en place (lecture source) ----------
  console.log('— Correctif présent dans routes.js —');
  const routesSrc = fs.readFileSync(path.join(root, 'server/routes.js'), 'utf8');
  const catalogBlock = routesSrc.slice(routesSrc.indexOf('async function guildCatalog'), routesSrc.indexOf('router.get(\'/bots/:id/guilds/:guildId\''));
  check('guildCatalog est async', /async function guildCatalog/.test(catalogBlock));
  check('resync REST des rôles : roles.fetch()', /dGuild\.roles && typeof dGuild\.roles\.fetch === 'function'\s*\)\s*await dGuild\.roles\.fetch\(\)/.test(catalogBlock));
  check('resync REST des salons : channels.fetch()', /dGuild\.channels && typeof dGuild\.channels\.fetch === 'function'\s*\)\s*await dGuild\.channels\.fetch\(\)/.test(catalogBlock));
  check('resync silencieuse en cas d’échec (catch console.error)', /catch \(e\) \{ console\.error\('\[Hoxera\] resync rôles :'/.test(catalogBlock));
  check('route : await guildCatalog(dGuild)', /const \{ channels, roles \} = await guildCatalog\(dGuild\)/.test(routesSrc));
  check('TTL du cache catalogue réduit à 10 s', /guildCatalogCache = new TTLCache\(\{ ttlMs: 10000, max: 500 \}\)/.test(routesSrc));

  // ---------- 2. Scénario fonctionnel : rôle créé pendant que le bot ----------
  // était « hors ligne » (rôle absent du cache local, présent côté API)
  console.log('— Scénario : rôle créé absent du cache local, révélé par la resync —');
  const uid = store.users.create('discord:218@discord.botdev', 'x', {});
  store.users.updateDiscord(uid, {
    discord_id: '218000000000000001', discord_username: 'chef', discord_avatar: '',
    discord_guilds: JSON.stringify([{ id: 'G218', name: 'Serveur 218', icon: '', owner: true, permissions: '0' }]),
  });
  const BOT = store.bots.create({ user_id: uid, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });

  // Guild simulée : le cache local du bot contient les rôles d'avant le
  // redémarrage (SANS le nouveau rôle) ; l'API Discord, elle, le connaît.
  const roleOld = { id: '218001', name: 'Ancien rôle' };
  const roleKeep = { id: '218002', name: 'Membres' };
  const roleEveryone = { id: '218000', name: '@everyone' };
  const roleFresh = { id: '218003', name: 'Rôle tout neuf' };
  let fetchRolesCalls = 0;
  const rolesCache = new Map([['218000', roleEveryone], ['218001', roleOld], ['218002', roleKeep]]);
  const channelsCache = new Map([
    ['218100', { id: '218100', name: 'général', type: 0 }],
    ['218200', { id: '218200', name: 'Vocal', type: 2 }],
  ]);
  const dGuild = {
    id: 'G218',
    name: 'Serveur 218',
    iconURL: () => '',
    bannerURL: () => '',
    memberCount: 42,
    premiumSubscriptionCount: 1,
    createdTimestamp: 1700000000000,
    description: '',
    roles: {
      cache: rolesCache,
      // 📡 L'API connaît le rôle créé « pendant l’indisponibilité » du bot :
      // le fetch REST le fait entrer dans le cache local (comme discord.js).
      fetch: async () => { fetchRolesCalls += 1; rolesCache.set('218003', roleFresh); return rolesCache; },
    },
    channels: {
      cache: channelsCache,
      fetch: async () => {},
    },
  };
  const fakeClient = {
    isReady: () => true,
    guilds: { cache: new Map([['G218', dGuild]]) },
    user: { displayAvatarURL: () => '' },
  };
  botManager.clients.set(BOT, { client: fakeClient, startedAt: Date.now() });

  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const ck = `botdev_session=${store.sessions.create(uid)}`;
  const H = { Cookie: ck };

  // 1er appel : cache applicatif vide → resync REST + catalogue frais
  const r1 = await fetch(base + `/bots/${BOT}/guilds/G218`, { headers: H });
  const p1 = await r1.json();
  check('premier chargement → HTTP 200', r1.status === 200);
  check('la resync REST a été déclenchée (1 appel fetch rôles)', fetchRolesCalls === 1);
  const roleNames1 = (p1.roles || []).map((r) => r.name);
  check('le rôle créé pendant l’indisponibilité apparaît', roleNames1.includes('Rôle tout neuf'));
  check('les rôles connus avant sont conservés', roleNames1.includes('Ancien rôle') && roleNames1.includes('Membres'));
  check('@everyone reste exclu du sélecteur', !roleNames1.includes('@everyone'));
  check('les salons sont toujours présents', (p1.channels || []).some((c) => c.name === 'général') && (p1.channels || []).some((c) => c.name === 'Vocal' && c.voice));

  // 2e appel immédiat : servi par le cache applicatif → AUCUN second fetch REST
  const r2 = await fetch(base + `/bots/${BOT}/guilds/G218`, { headers: H });
  const p2 = await r2.json();
  check('second appel → HTTP 200', r2.status === 200);
  check('cache applicatif servi sans nouveau fetch REST', fetchRolesCalls === 1);
  check('le nouveau rôle est toujours dans la réponse (cache)', (p2.roles || []).some((r) => r.name === 'Rôle tout neuf'));

  server.close();

  console.log(`  → ${n} assertions v218 ✅`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
