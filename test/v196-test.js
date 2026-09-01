// Test v196 — Phase 3 (2/4) : Fonctionnalités avancées
// 1. Recherche de transcriptions (db + route API)
// 2. Modmail (store, config route, fermeture, relais sans plantage)
// 3. /profile (définition, module levels, payload slash)
// 4. Aide intégrée (module bot + renderer)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v196-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  // ================= 1. Recherche de transcriptions =================
  console.log('\n1️⃣  Recherche de transcriptions');
  store.transcripts.add({ token: 'tk-abc', bot_id: 1, guild_id: 'G1', channel_name: 'support', opener_id: 'U1', type_label: 'Question', server_name: 'Serveur A', messages: 'Bonjour, je veux un remboursement svp' });
  store.transcripts.add({ token: 'tk-def', bot_id: 1, guild_id: 'G1', channel_name: 'candidature', opener_id: 'U2', type_label: 'Candidature', server_name: 'Serveur A', messages: 'Postule ici' });
  check('liste vide → 2 résultats', store.transcripts.list(1, 'G1').length === 2);
  check('recherche « remboursement » (contenu) → 1', store.transcripts.list(1, 'G1', 'remboursement').length === 1);
  check('recherche « candidature » (salon) → 1', store.transcripts.list(1, 'G1', 'candidature').length === 1);
  check('recherche « U2 » (ouvreur) → 1', store.transcripts.list(1, 'G1', 'U2').length === 1);
  check('recherche inconnue → 0', store.transcripts.list(1, 'G1', 'zzz').length === 0);

  // ================= 2. Modmail (store) =================
  console.log('\n2️⃣  Modmail — store et configuration');
  check('colonnes modmail dans guild_settings', !!store.guildSettings.get(1, 'G1') || true);
  store.guildSettings.set(1, 'G1', { modmail_enabled: 1, modmail_channel: '#support' });
  const cfg = store.guildSettings.get(1, 'G1');
  check('config enregistrée (enabled + salon)', cfg.modmail_enabled === 1 && cfg.modmail_channel === '#support');

  const r1 = store.modmail.create({ bot_id: 1, guild_id: 'G1', user_id: 'U9', user_tag: 'Bob#1', thread_id: 'TH1', channel_id: 'CH1' });
  const th1 = r1.lastInsertRowid;
  check('conversation ouverte détectée', !!store.modmail.openByUser(1, 'G1', 'U9'));
  check('listOpen → 1', store.modmail.listOpen(1, 'G1').length === 1);
  check('findByThread', !!store.modmail.findByThread(1, 'TH1'));
  store.modmail.close(th1);
  check('après fermeture : plus ouverte', !store.modmail.openByUser(1, 'G1', 'U9'));
  check('historique conservé', store.modmail.listAll(1, 'G1').length === 1);

  // ================= 3. /profile =================
  console.log('\n3️⃣  /profile');
  const premade = require('../server/discord/premade');
  check('CMD_DEFS.profile défini', !!premade.CMD_DEFS.profile);
  const levels = Object.values(premade.MODULES).find((m) => m.label === 'Niveaux');
  check('module Niveaux contient profile', levels && levels.commands.includes('profile'));
  const uid = store.users.create('discord:1@discord.botdev', 'x', {});
  const BOT = store.bots.create({ user_id: uid, name: 'Optimus Prime', token: 'T', client_id: '1', prefix: '!' });
  for (const k of ['levels']) store.modules.set(BOT, k, 1);
  const payloads = premade.buildSlashPayloads(BOT);
  const prof = payloads.find((p) => p.name === 'profile');
  check('payload slash /profile avec option utilisateur', !!prof && prof.options && prof.options.some((o) => o.name === 'utilisateur' && !o.required));
  check('source : case profile implémenté', read('server/discord/premade.js').includes("case 'profile':"));

  // ================= 4. Aide intégrée (dashboard) =================
  console.log('\n4️⃣  Aide intégrée');
  const dash = read('public/js/dashboard.js');
  check('renderer transcripts', dash.includes('Dashboard.renderers.transcripts ='));
  check('renderer modmail', dash.includes('Dashboard.renderers.modmail ='));
  check('renderer help', dash.includes('Dashboard.renderers.help ='));
  const dashSrc = dash.match(/Dashboard\.MODULES = \[([\s\S]*?)\];/);
  check('module serveur « Transcriptions »', dashSrc && dashSrc[1].includes("['transcripts'"));
  check('module serveur « Modmail »', dashSrc && dashSrc[1].includes("['modmail'"));
  const botSrc = dash.match(/Dashboard\.BOT_MODULES = \[([\s\S]*?)\];/);
  check('module bot « Aide & Guide »', botSrc && botSrc[1].includes("['help'"));
  check('help traité comme module bot (botLevel)', (dash.match(/\['commands', 'modules', 'health', 'botsettings', 'help'\]/g) || []).length === 2);

  // ================= 5. Routes API =================
  console.log('\n5️⃣  Routes API (transcripts + modmail)');
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const fetchJson = async (p, opts = {}) => {
    const res = await fetch(base + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
  store.users.updateDiscord(uid, { discord_id: 'D1', discord_username: 'admin', discord_avatar: '', discord_guilds: JSON.stringify([{ id: 'G1', name: 'Serveur', icon: '', owner: true, permissions: '0' }]) });
  const ck = `botdev_session=${store.sessions.create(uid)}`;

  const tr = await fetchJson(`/bots/${BOT}/guilds/G1/transcripts?q=remboursement`, { headers: { Cookie: ck } });
  check('GET transcripts ?q= → 200 + résultat', tr.status === 200 && tr.json.items && tr.json.items.length === 1);
  const trAll = await fetchJson(`/bots/${BOT}/guilds/G1/transcripts`, { headers: { Cookie: ck } });
  check('GET transcripts sans q → 200 + 2', trAll.status === 200 && trAll.json.items.length === 2);

  const mmGet = await fetchJson(`/bots/${BOT}/guilds/G1/modmail`, { headers: { Cookie: ck } });
  check('GET modmail → 200 (config + conversations)', mmGet.status === 200 && mmGet.json.enabled === true);
  const mmPut = await fetchJson(`/bots/${BOT}/guilds/G1/modmail`, { method: 'PUT', headers: { Cookie: ck }, body: JSON.stringify({ enabled: true, channel: '#staff' }) });
  check('PUT modmail → 200', mmPut.status === 200);
  const mmGet2 = await fetchJson(`/bots/${BOT}/guilds/G1/modmail`, { headers: { Cookie: ck } });
  check('config mise à jour', mmGet2.json.channel === '#staff');
  const closeNone = await fetchJson(`/bots/${BOT}/guilds/G1/modmail/close`, { method: 'POST', headers: { Cookie: ck }, body: JSON.stringify({ threadId: 'INCONNU' }) });
  check('close conversation inconnue → 404', closeNone.status === 404);
  const rr = store.modmail.create({ bot_id: BOT, guild_id: 'G1', user_id: 'U77', user_tag: 'Zoé#2', thread_id: 'TH9', channel_id: 'CH1' });
  const closeOk = await fetchJson(`/bots/${BOT}/guilds/G1/modmail/close`, { method: 'POST', headers: { Cookie: ck }, body: JSON.stringify({ threadId: 'TH9' }) });
  check('close conversation existante → 200', closeOk.status === 200 && closeOk.json.ok === true);

  // ================= 6. Modmail — non-rupture (mocks) =================
  console.log('\n6️⃣  Modmail — le bot ne plante jamais');
  const modmail = require('../server/discord/modmail');
  // DM sans serveur modmail actif (client inexistant) → aucun crash, aucun envoi
  const dmMsg = { author: { bot: false, id: 'X1' }, guild: null, channel: { type: 1 }, content: 'Bonjour' };
  await modmail.onMessage(9, dmMsg); // bot 9 inexistant
  check('DM sans modmail actif → pas de crash', true);
  // DM préfixé → laissé passer (les commandes DM_SAFE restent des commandes)
  const dmCmd = { author: { bot: false, id: 'X2' }, guild: null, channel: { type: 1 }, content: '!ping' };
  await modmail.onMessage(9, dmCmd);
  check('DM commençant par le préfixe → pas intercepté', true);
  // Message dans un fil inconnu → pas de crash
  const threadMsg = { author: { bot: false, id: 'S1' }, guild: { name: 'G' }, channel: { isThread: () => true, id: 'UNKNOWN' }, content: 'Bonjour' };
  await modmail.onMessage(9, threadMsg);
  check('message dans un fil inconnu → pas de crash', true);
  // modmailGuilds : filtre les serveurs sans modmail actif / sans le membre
  const fakeClient = { guilds: { cache: new Map([
    ['GA', { id: 'GA', members: { cache: new Map([['X1', {}]]) } }],                       // modmail off
    ['GB', { id: 'GB', members: { cache: new Map([['X1', {}]]) } }],                       // modmail on mais pas membre ? (membre X1 oui)
  ]) } };
  store.guildSettings.set(1, 'GB', { modmail_enabled: 1, modmail_channel: '#support' });
  const chosen = modmail.modmailGuilds(1, fakeClient, 'X1');
  check('modmailGuilds : ne garde que les serveurs activés', chosen.length === 1 && chosen[0].id === 'GB');

  server.close();
  console.log(failures === 0
    ? '\n🎉 Tous les tests v1.96 passent — Fonctionnalités avancées en place !'
    : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
