// Test v1.25 : DraftBot-like — boutique, giveaways, suggestions, rôles temporaires, sanctions
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v25-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const giveaway = require('../server/discord/giveaway');
const suggest = require('../server/discord/suggest');
const tasks = require('../server/discord/tasks');
const { buildSlashPayloads } = require('../server/discord/premade');

(async () => {
  // ---------- 1. Boutique : CRUD ----------
  store.shop.replace(1, 'G1', [
    { name: 'VIP', description: 'Rôle VIP', price: 500, role: 'VIP', emoji: '💎' },
    { name: 'Booster', description: 'Rôle booster', price: 200, role: 'Booster', emoji: '🚀' },
  ]);
  assert(store.shop.all(1, 'G1').length === 2);
  assert(store.shop.all(1, 'G1')[0].price === 200, 'trié par prix croissant');
  console.log('1️⃣  Boutique : 2 articles triés par prix ✅');

  // ---------- 2. Giveaway : durée + création + fin ----------
  assert(giveaway.parseDuration('30m') === 30 * 60000);
  assert(giveaway.parseDuration('2h') === 2 * 3600000);
  assert(giveaway.parseDuration('1d') === 86400000);
  assert(giveaway.parseDuration('nimporte') === null);
  console.log('2️⃣  Durées de giveaway ✅ (30m, 2h, 1d)');

  let sentMessage, reaction;
  const fakeChannel = {
    id: 'C1', name: 'général',
    send: async (payload) => { sentMessage = payload; return { id: 'MSG1', react: async (e) => { reaction = e; } }; },
  };
  const interaction = {
    guild: { id: 'G1' }, channel: fakeChannel,
    reply: async (p) => { lastReply = p; },
  };
  let lastReply;
  await giveaway.startGiveaway(1, interaction, 3600000, '🎁 Clé du jeu', 1);
  assert(sentMessage && sentMessage.embeds[0].data.title.includes('Giveaway'), 'titre du giveaway (v209, plus de MAJUSCULES)');
  assert(reaction === '🎉', 'réaction 🎉 ajoutée');
  const g = store.giveaways.active(1, 'G1')[0];
  assert(g && g.prize === '🎁 Clé du jeu' && g.winners === 1);
  console.log('3️⃣  Giveaway créé ✅ (embed + réaction 🎉 + enregistré)');

  // ---------- 3. Suggestions : soumission + votes + statut ----------
  store.guildSettings.set(1, 'G1', { suggestion_channel: '#suggestions' });
  const suggChannel = {
    id: 'SC1', name: 'suggestions',
    send: async (payload) => { suggPayload = payload; return { id: 'SM1' }; },
  };
  let suggPayload;
  const guild = {
    id: 'G1', name: 'Serveur', ownerId: 'OWNER1',
    channels: { cache: { get: () => undefined, find: () => suggChannel } },
  };
  await suggest.submitSuggestion(1, {
    guild, user: { id: 'U1', tag: 'Membre#1' },
    reply: async (p) => { lastReply = p; },
  }, 'Ajouter un salon de jeux !');
  const s = store.suggestions.all(1, 'G1')[0];
  assert(s && s.text.includes('salon de jeux') && s.message_id === 'SM1');
  const res1 = store.suggestions.vote(s.id, 'U2', 'up');
  const res2 = store.suggestions.vote(s.id, 'U3', 'up');
  assert(res1.ok && res2.ok);
  assert(store.suggestions.get(s.id).upvotes === 2);
  store.suggestions.vote(s.id, 'U2', 'down');
  assert(store.suggestions.get(s.id).upvotes === 1 && store.suggestions.get(s.id).downvotes === 1, 'changement de vote');
  store.suggestions.setStatus(s.id, 'approved');
  assert(store.suggestions.get(s.id).status === 'approved');
  console.log('4️⃣  Suggestions : envoi + votes + changement + statut ✅');

  // ---------- 4. Rôle temporaire : durée + expiration ----------
  assert(tasks.parseRoleDuration('2h') === 7200000);
  assert(tasks.parseRoleDuration('1d') === 86400000);
  assert(tasks.parseRoleDuration('30m') === 1800000);
  store.tempRoles.add(1, 'G1', 'U1', 'VIP', Date.now() - 1000); // déjà expiré
  assert(store.tempRoles.due().length === 1, 'rôle expiré détecté');
  console.log('5️⃣  Rôle temporaire : durée + détection d\'expiration ✅');

  // ---------- 5. Sanctions prédéfinies ----------
  store.sanctions.add(1, 'G1', { name: 'spam', action: 'timeout', duration: 10, message: 'Arrête le spam.' });
  store.sanctions.add(1, 'G1', { name: 'insulte', action: 'warn', duration: 0, message: 'Pas d\'insultes.' });
  store.sanctions.add(1, 'G1', { name: 'spam', action: 'timeout', duration: 15, message: 'Spam interdit.' }); // upsert
  const sancs = store.sanctions.all(1, 'G1');
  assert(sancs.length === 2 && sancs.find((x) => x.name === 'spam').duration === 15);
  console.log('6️⃣  Sanctions : ajout + upsert ✅ (', sancs.map((x) => x.name + ':' + x.action).join(', '), ')');

  // ---------- 6. Payloads : nouvelles commandes ----------
  store.modules.set(1, 'utility', true);
  store.modules.set(1, 'economy', true);
  store.modules.set(1, 'community', true);
  const payloads = buildSlashPayloads(1);
  const names = payloads.map((p) => p.name);
  for (const n of ['shop', 'buy', 'pay', 'suggest', 'suggestions', 'giveaway', 'temprole', 'sanction']) {
    assert(names.includes(n), n + ' absent');
  }
  const gv = payloads.find((p) => p.name === 'giveaway');
  assert(gv.options.some((o) => o.name === 'action'), 'action avec choix');
  const tr = payloads.find((p) => p.name === 'temprole');
  assert(tr.options.length === 3 && tr.options[2].name === 'duree');
  console.log('7️⃣  Payloads : 8 nouvelles commandes ✅');

  // ---------- 7. Routes API : boutique + sanctions via HTTP ----------
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
    const res = await fetch(base + p, {
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      ...rest,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };

  // Compte admin créé directement (l'inscription email a été retirée en v193)
  const adminId = store.users.create('admin@botdev.fr', 'x');
  const ck = `botdev_session=${store.sessions.create(adminId)}`;
  const botId = (await fetchJson('/bots', { method: 'POST', headers: { Cookie: ck }, body: JSON.stringify({ name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' }) })).json.id;
  // lien Discord simulé
  const store2 = require('../server/db');
  store2.users.updateDiscord(1, { discord_id: 'D1', discord_username: 'admin', discord_avatar: '', discord_guilds: JSON.stringify([{ id: 'G1', name: 'Serveur', icon: '', owner: true, permissions: '0' }]) });

  const shopPut = await fetchJson(`/bots/${botId}/guilds/G1/shop`, { method: 'PUT', headers: { Cookie: ck }, body: JSON.stringify({ items: [{ name: 'VIP', description: 'x', price: 500, role: 'VIP', emoji: '💎' }] }) });
  assert(shopPut.status === 200 && shopPut.json.items.length === 1, 'boutique via API');
  const shopGet = await fetchJson(`/bots/${botId}/guilds/G1/shop`, { headers: { Cookie: ck } });
  assert(shopGet.json.items.length === 1);
  const sancPut = await fetchJson(`/bots/${botId}/guilds/G1/sanctions`, { method: 'PUT', headers: { Cookie: ck }, body: JSON.stringify({ sanctions: [{ name: 'flood', action: 'kick', duration: 0, message: 'Flood' }] }) });
  assert(sancPut.status === 200 && sancPut.json.sanctions.length === 1, 'sanctions via API');
  const suggGet = await fetchJson(`/bots/${botId}/guilds/G1/suggestions`, { headers: { Cookie: ck } });
  assert(suggGet.status === 200 && Array.isArray(suggGet.json.suggestions));
  const gaGet = await fetchJson(`/bots/${botId}/guilds/G1/giveaways`, { headers: { Cookie: ck } });
  assert(gaGet.status === 200 && Array.isArray(gaGet.json.giveaways));
  console.log('8️⃣  Routes API : boutique, sanctions, suggestions, giveaways ✅');
  server.close();

  console.log('\n🎉 Tous les tests v1.25 passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
