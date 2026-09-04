// Test v193 — Phase 1 : sécurité, nettoyage et corrections urgentes
// 1. Rebranding (BotDev / NEXORA → Hoxera)
// 2. /say protégé (admin uniquement, refus propre, masqué à l'enregistrement)
// 3. /meme robuste (timeout, erreurs HTTP, données invalides)
// 4. Routes email mortes supprimées (/auth/register, /auth/login)
// 5. Env vars obsolètes nettoyées (HOXERA_TOKEN uniquement)
// 6. Anciens domaines retirés (security, messages visibles)
// 7. Sécurité : token Discord jamais renvoyé par l'API, entropie transcription
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v211-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const premade = require('../server/discord/premade');
const routes = require('../server/routes');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};

(async () => {
  // ================= 1. Rebranding =================
  console.log('\n1️⃣  Rebranding : BotDev / NEXORA → Hoxera');
  check('db.js : statut par défaut HOXERA', read('server/db.js').includes("status_text TEXT DEFAULT 'HOXERA'"));
  check('banner.js : défaut HOXERA (plus de NEXORA)', !read('server/banner.js').includes("|| 'NEXORA'") && read('server/banner.js').includes("|| 'HOXERA'"));
  check('routes.js : panneau par défaut HOXERA', read('server/routes.js').includes("|| 'HOXERA'"));
  check('premade.js : boutique « dashboard Hoxera »', read('server/discord/premade.js').includes('dashboard Hoxera'));
  check('index.js : transcription « Propulsé par Hoxera »', read('server/index.js').includes('Propulsé par Hoxera'));
  check('app.js : aide « HOXERA_TOKEN »', read('public/js/app.js').includes('<b>HOXERA_TOKEN</b>'));
  const indexHtml = read('public/index.html');
  const swSource = read('public/sw.js');
  check('index.html : version v193 référencée 7 fois', (indexHtml.match(/\?v=211/g) || []).length === 7);
  check('index.html : plus aucune référence v192', !indexHtml.includes('?v=192'));
  check('sw.js : cache v193', swSource.includes("const CACHE = 'botdev-v211';"));

  // ================= 2. /say protégé =================
  console.log('\n2️⃣  /say : réservé aux administrateurs');
  const ADMIN_BIT = String(1n << 3n); // Administrateur (bit 3) → '8'
  check('CMD_DEFS.say : permission Administrateur', String(premade.CMD_DEFS.say.perms || []) === ADMIN_BIT);

  const uid = store.users.create('discord:1@discord.botdev', 'x', {}); // id 1
  const BOT = store.bots.create({ user_id: uid, name: 'Optimus Prime', token: 'TOPSECRET', client_id: '1', prefix: '!' });
  for (const k of ['moderation', 'utility', 'fun', 'economy', 'levels', 'community']) store.modules.set(BOT, k, 1);
  const entry = { client: {} };
  const guild = { id: 'G1', ownerId: 'OWNER' };
  const sent = [];
  const mkMsg = (member) => ({
    guild,
    channel: { send: async (p) => { sent.push(p); return {}; } },
    member,
    author: { id: member.id, tag: 'X#0', username: 'X' },
    args: '',
  });
  const normalMember = { id: 'u2', user: { id: 'u2' }, permissions: { has: () => false } };
  const adminMember = { id: 'u3', user: { id: 'u3' }, permissions: { has: (b) => String(b) === ADMIN_BIT } };
  const ownerMember = { id: 'OWNER', user: { id: 'OWNER' }, permissions: { has: () => false } };

  sent.length = 0;
  await premade.handlePremadePrefix(BOT, entry, mkMsg(normalMember), 'say', 'coucou');
  const txtOf = (p) => (typeof p === 'string' ? p : (p && p.content) || '');
  check('/say : membre normal → refus propre', sent.length === 1 && txtOf(sent[0]).includes('réservée au propriétaire'));

  sent.length = 0;
  await premade.handlePremadePrefix(BOT, entry, mkMsg(ownerMember), 'say', 'bonjour');
  check('/say : propriétaire du serveur → autorisé', sent.length === 1 && String(sent[0].content || '') === 'bonjour');

  sent.length = 0;
  await premade.handlePremadePrefix(BOT, entry, mkMsg(adminMember), 'say', 'salut');
  check('/say : administrateur → autorisé', sent.length === 1 && String(sent[0].content || '') === 'salut');

  const payloads = premade.buildSlashPayloads(BOT);
  const sayPayload = payloads.find((p) => p.name === 'say');
  check('/say : masqué aux non-admins à l\'enregistrement', !!sayPayload && sayPayload.default_member_permissions === ADMIN_BIT);
  const ballPayload = payloads.find((p) => p.name === '8ball');
  check('/8ball : reste public (aucune permission requise)', !!ballPayload && !ballPayload.default_member_permissions);

  // ================= 3. /meme robuste =================
  console.log('\n3️⃣  /meme : API externe gérée proprement');
  const realFetch = global.fetch;
  try {
    sent.length = 0;
    global.fetch = async () => { throw new Error('API down'); };
    await premade.handlePremadePrefix(BOT, entry, mkMsg(adminMember), 'meme', '');
    check('/meme : panne réseau → message propre', sent.length === 1 && String(sent[0].content || '').includes('😢 Impossible'));

    sent.length = 0;
    const abortErr = new Error('aborted'); abortErr.name = 'AbortError';
    global.fetch = async () => { throw abortErr; };
    await premade.handlePremadePrefix(BOT, entry, mkMsg(adminMember), 'meme', '');
    check('/meme : timeout → message propre', sent.length === 1 && String(sent[0].content || '').includes('⏱️'));

    sent.length = 0;
    global.fetch = async () => ({ ok: false, status: 500 });
    await premade.handlePremadePrefix(BOT, entry, mkMsg(adminMember), 'meme', '');
    check('/meme : HTTP 500 → message propre', sent.length === 1 && String(sent[0].content || '').includes('😢 Impossible'));

    sent.length = 0;
    global.fetch = async () => ({ ok: true, json: async () => ({ title: 'Sans image' }) });
    await premade.handlePremadePrefix(BOT, entry, mkMsg(adminMember), 'meme', '');
    check('/meme : données invalides (pas d\'image) → message propre', sent.length === 1 && String(sent[0].content || '').includes('😢 Impossible'));

    sent.length = 0;
    global.fetch = async () => ({ ok: true, json: async () => ({ title: 'Bon meme', url: 'https://i.redd.it/x.png', subreddit: 'memes' }) });
    await premade.handlePremadePrefix(BOT, entry, mkMsg(adminMember), 'meme', '');
    const memeEmb = sent[0] && sent[0].embeds && sent[0].embeds[0];
    check('/meme : données valides → embed titre + image', !!memeEmb && memeEmb.data.title === 'Bon meme' && memeEmb.data.image && memeEmb.data.image.url === 'https://i.redd.it/x.png');
  } finally {
    global.fetch = realFetch;
  }

  // ================= 4. Routes email supprimées ; sessions intactes =================
  console.log('\n4️⃣  Routes /auth/register + /auth/login supprimées');
  const http = require('http');
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', routes);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const fetchJson = async (p, opts = {}) => {
    const res = await fetch(base + p, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, ...opts });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };

  const reg = await fetchJson('/auth/register', { method: 'POST', body: JSON.stringify({ email: 'a@b.fr', password: 'xxxxxx' }) });
  check('/auth/register → 404', reg.status === 404);
  const login = await fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.fr', password: 'xxxxxx' }) });
  check('/auth/login → 404', login.status === 404);

  const ck = `botdev_session=${store.sessions.create(uid)}`;
  const me = await fetchJson('/auth/me', { headers: { Cookie: ck } });
  check('connexion/sessions : /auth/me fonctionne toujours', me.status === 200 && me.json.user && me.json.user.id === uid);
  const out = await fetchJson('/auth/logout', { method: 'POST', headers: { Cookie: ck } });
  check('connexion/sessions : /auth/logout fonctionne toujours', out.status === 200 && out.json.ok === true);

  // ================= 5. Token Discord jamais renvoyé à l'API =================
  console.log('\n5️⃣  Sécurité : token masqué côté API');
  // Session neuve (le /auth/logout ci-dessus a détruit la précédente)
  const ck2 = `botdev_session=${store.sessions.create(uid)}`;
  const hx = await fetchJson('/hoxera', { headers: { Cookie: ck2 } });
  check('/hoxera : bot renvoyé', hx.status === 200 && hx.json.bot && hx.json.bot.id === BOT);
  check('/hoxera : token absent de la réponse', hx.json.bot && !('token' in hx.json.bot));
  const det = await fetchJson(`/bots/${BOT}`, { headers: { Cookie: ck2 } });
  check('/bots/:id : token absent de la réponse', det.status === 200 && det.json.bot && !('token' in det.json.bot));

  // ================= 6. Env vars + domaines =================
  console.log('\n6️⃣  Env vars obsolètes et anciens domaines');
  check('routes.js : tokenConfigured = HOXERA_TOKEN uniquement', read('server/routes.js').includes('tokenConfigured: !!(process.env.HOXERA_TOKEN)'));
  check('index.js : provision = HOXERA_TOKEN uniquement (aucun ancien fallback)', read('server/index.js').includes('const token = process.env.HOXERA_TOKEN;') && !read('server/index.js').includes('process.env.NEXORA_TOKEN') && !read('server/index.js').includes('process.env.NOXERA_TOKEN'));
  check('security.js : origine morte retirée (domaine officiel seul)', read('server/security.js').includes("'https://hoxera.is-a.dev'") && !read('server/security.js').includes('hoxera.onrender.com'));
  check('index.js : footer transcription sans BotDev', !read('server/index.js').includes('Propulsé par BotDev'));

  // ================= 7. Entropie des transcriptions =================
  console.log('\n7️⃣  Transcription : token 128 bits');
  const panels = read('server/discord/panels.js');
  check('panels.js : token 16 octets (128 bits)', !panels.includes("randomBytes(8).toString('hex')") && panels.includes("randomBytes(16).toString('hex')"));

  server.close();
  if (failures === 0) {
    console.log('\n🎉 Tous les tests v1.93 passent !');
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures} vérification(s) en échec`);
    process.exit(1);
  }
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
