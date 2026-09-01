// Test v198 — « Tout est configurable » : Giveaways, Suggestions, panneau
// tickets (image), MP de fermeture, quiz personnalisés.
// 1. Store : quiz_sets (CRUD + pool), nouveaux champs guild_settings avec défauts
// 2. Routes : uploads d'image, config giveaways/suggestions/quiz/DM, quiz sets CRUD
// 3. Bot : buildEmbed giveaways (couleur/message), suggest (couleur/👎/ping),
//    quiz pool personnalisé, panel image + DM personnalisé (vide = défaut)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v198-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
let failures = 0;
const check = (label, ok) => {
  if (ok) console.log('  ✅ ' + label);
  else { failures++; console.error('  ❌ ' + label); }
};
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  // ================= 1. quiz_sets (store) =================
  console.log('\n1️⃣  Quiz personnalisés — store');
  const uid = store.users.create('discord:198@discord.botdev', 'x', {});
  const BOT = store.bots.create({ user_id: uid, name: 'Optimus Prime', token: 'T', client_id: '1', prefix: '!' });
  const setId = store.quizSets.create(BOT, 'G198', { name: 'Culture générale', channel: '#quiz', questions: [
    { q: 'Capitale du Japon ?', correct: 'Tokyo', wrong: ['Osaka', 'Kyoto'] },
    { q: 'Plus grand océan ?', correct: 'Pacifique', wrong: ['Atlantique', 'Indien'] },
  ]});
  check('create → id numérique', Number.isInteger(setId));
  const sets = store.quizSets.all(BOT, 'G198');
  check('all → 1 set avec 2 questions', sets.length === 1 && sets[0].questions.length === 2);
  store.quizSets.update(setId, { name: 'Culture G', enabled: 0 });
  const updated = store.quizSets.get(setId);
  check('update → nom + désactivé', updated.name === 'Culture G' && updated.enabled === 0);
  store.quizSets.update(setId, { enabled: 1 });
  const pool = store.quizSets.pool(BOT, 'G198');
  check('pool → 2 questions quand activé', pool.length === 2);
  store.quizSets.update(setId, { enabled: 0 });
  check('pool → 0 quand désactivé', store.quizSets.pool(BOT, 'G198').length === 0);
  store.quizSets.remove(setId);
  check('remove → 0 set', store.quizSets.all(BOT, 'G198').length === 0);

  // ================= 2. guild_settings — nouveaux champs + défauts =================
  console.log('\n2️⃣  Réglages — nouveaux champs avec défauts sûrs');
  store.guildSettings.set(BOT, 'G198', {
    giveaway_channel: '#giveaways', giveaway_default_duration: 24, giveaway_default_winners: 3,
    giveaway_ping_role: '@everyone', giveaway_color: '#00FFAA', giveaway_message: 'Tentez votre chance !',
    suggestion_color: '#FF8800', suggestion_ping_role: '@Staff', suggestion_downvotes: 0,
    suggestion_approve_channel: '#approuvees',
    close_dm_message: 'Merci {server} !', close_dm_image: '/api/uploads/x.png',
    quiz_channel: '#quiz', quiz_points: 20, quiz_bonus: 10, quiz_bonus_window: 15,
  });
  const gs = store.guildSettings.get(BOT, 'G198');
  check('giveaway config enregistrée', gs.giveaway_channel === '#giveaways' && gs.giveaway_default_duration === 24 && gs.giveaway_default_winners === 3);
  check('giveaway couleur/message enregistrés', gs.giveaway_color === '#00FFAA' && gs.giveaway_message.includes('Tentez'));
  check('suggestion config enregistrée', gs.suggestion_color === '#FF8800' && gs.suggestion_ping_role === '@Staff' && gs.suggestion_downvotes === 0 && gs.suggestion_approve_channel === '#approuvees');
  check('close DM enregistré', gs.close_dm_message.includes('{server}') && gs.close_dm_image === '/api/uploads/x.png');
  check('quiz config enregistrée', gs.quiz_channel === '#quiz' && gs.quiz_points === 20 && gs.quiz_bonus === 10 && gs.quiz_bonus_window === 15);
  // Défauts : serveur sans config → valeurs par défaut (aucun plantage)
  const empty = store.guildSettings.get(BOT, 'GEMPTY');
  check('serveur sans config → null (pas de plantage)', empty === null);

  // ================= 3. Tickets : image_url dans le store =================
  console.log('\n3️⃣  Tickets — image du panneau');
  store.tickets.set(BOT, 'G198', { channel: '#support', message: 'Bonjour !', image_url: '/api/uploads/panel.png' });
  const tcfg = store.tickets.get(BOT, 'G198');
  check('image_url conservée', tcfg && tcfg.image_url === '/api/uploads/panel.png');
  store.tickets.set(BOT, 'G198', { channel: '#support' });
  const tcfg2 = store.tickets.get(BOT, 'G198');
  check('image_url préservée quand non envoyée', tcfg2 && tcfg2.image_url === '/api/uploads/panel.png');

  // ================= 4. Routes API =================
  console.log('\n4️⃣  Routes API');
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use(cookieParser());
  app.use('/api', require('../server/routes'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  store.users.updateDiscord(uid, { discord_id: 'D198', discord_username: 'admin', discord_avatar: '', discord_guilds: JSON.stringify([{ id: 'G198', name: 'Test', icon: '', owner: true, permissions: '0' }]) });
  const ck = `botdev_session=${store.sessions.create(uid)}`;
  const fetchJson = async (p, opts = {}) => {
    const res = await fetch(base + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
  const H = { Cookie: ck };

  // quiz sets via HTTP
  const qCreate = await fetchJson(`/bots/${BOT}/guilds/G198/quiz/sets`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Jeux', questions: [{ q: 'Minecraft ?', correct: 'Craft', wrong: ['A', 'B'] }] }) });
  check('POST quiz/sets → 200 + id', qCreate.status === 200 && qCreate.json.id);
  const qList = await fetchJson(`/bots/${BOT}/guilds/G198/quiz/sets`, { headers: H });
  check('GET quiz/sets → 1 set', qList.status === 200 && qList.json.sets.length === 1);
  const qPut = await fetchJson(`/bots/${BOT}/guilds/G198/quiz/sets/${qCreate.json.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ enabled: 0 }) });
  check('PUT quiz/sets → 200', qPut.status === 200);
  const qDel = await fetchJson(`/bots/${BOT}/guilds/G198/quiz/sets/${qCreate.json.id}`, { method: 'DELETE', headers: H });
  check('DELETE quiz/sets → 200', qDel.status === 200);

  // config quiz
  const qCfg = await fetchJson(`/bots/${BOT}/guilds/G198/quiz/config`, { method: 'PUT', headers: H, body: JSON.stringify({ channel: '#quiz', points: 25, bonus: 12, bonus_window: 20 }) });
  check('PUT quiz/config → 200', qCfg.status === 200);

  // config giveaways
  const gwCfg = await fetchJson(`/bots/${BOT}/guilds/G198/giveaways/config`, { method: 'PUT', headers: H, body: JSON.stringify({ channel: '#gw', default_duration: 12, default_winners: 2, ping_role: '', color: '#ABCDEF', message: 'Lancez-vous !' }) });
  check('PUT giveaways/config → 200', gwCfg.status === 200);

  // config suggestions
  const sgCfg = await fetchJson(`/bots/${BOT}/guilds/G198/suggestions/config`, { method: 'PUT', headers: H, body: JSON.stringify({ channel: '#sug', color: '#123456', ping_role: '@staff', downvotes: 0, approve_channel: '#ok' }) });
  check('PUT suggestions/config → 200', sgCfg.status === 200);

  // tickets DM
  const dmCfg = await fetchJson(`/bots/${BOT}/guilds/G198/tickets/dm`, { method: 'PUT', headers: H, body: JSON.stringify({ message: 'Merci {server} !', image: '/api/uploads/dm.png' }) });
  check('PUT tickets/dm → 200', dmCfg.status === 200);
  const gs2 = store.guildSettings.get(BOT, 'G198');
  check('close_dm stocké via route', gs2.close_dm_message === 'Merci {server} !' && gs2.close_dm_image === '/api/uploads/dm.png');

  // uploads : PNG valide (1×1)
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await fetchJson(`/bots/${BOT}/guilds/G198/uploads`, { method: 'POST', headers: H, body: JSON.stringify({ data: `data:image/png;base64,${pngB64}` }) });
  check('POST uploads (PNG valide) → 200 + url', up.status === 200 && /\/api\/uploads\/.+\.png$/.test(up.json.url || ''));
  if (up.json.url) {
    const url = 'http://127.0.0.1:' + server.address().port + up.json.url;
    const imgRes = await fetch(url);
    check('GET upload → 200 + image/png', imgRes.status === 200 && imgRes.headers.get('content-type').includes('image/png'));
  }
  const badUp = await fetchJson(`/bots/${BOT}/guilds/G198/uploads`, { method: 'POST', headers: H, body: JSON.stringify({ data: 'data:image/png;base64,AAAA' }) });
  check('POST uploads (invalide) → 400', badUp.status === 400);
  const txtUp = await fetchJson(`/bots/${BOT}/guilds/G198/uploads`, { method: 'POST', headers: H, body: JSON.stringify({ data: 'data:text/plain;base64,aGVsbG8=' }) });
  check('POST uploads (mauvais type) → 400', txtUp.status === 400);

  // tickets PUT avec image_url
  const tkPut = await fetchJson(`/bots/${BOT}/tickets`, { method: 'PUT', headers: H, body: JSON.stringify({ guild_id: 'G198', channel: '#support', image_url: '/api/uploads/panel2.png' }) });
  check('PUT tickets (image_url) → 200', tkPut.status === 200);
  check('image_url appliquée', store.tickets.get(BOT, 'G198').image_url === '/api/uploads/panel2.png');

  server.close();

  // ================= 5. Bot : modules enrichis =================
  console.log('\n5️⃣  Bot — giveaways / suggestions / quiz / panneaux');
  const giveaway = require('../server/discord/giveaway');
  const { EmbedBuilder } = require('discord.js');
  // buildEmbed : couleur + message personnalisés, défaut sinon
  const embCustom = giveaway.buildEmbed({ prize: 'Test', winners: 1, ends_at: Date.now() + 60000 }, { color: '#FF00FF', message: 'Custom message' });
  check('giveaway buildEmbed : couleur personnalisée', embCustom.data.color === 0xFF00FF);
  check('giveaway buildEmbed : message personnalisé', embCustom.data.description.includes('Custom message'));
  const embDefault = giveaway.buildEmbed({ prize: 'Test', winners: 1, ends_at: Date.now() + 60000 }, {});
  check('giveaway buildEmbed : couleur par défaut', embDefault.data.color === 0xFEE75C);
  check('giveaway buildEmbed : texte par défaut', embDefault.data.description.includes('Réagis avec 🎉'));

  // suggest : buildEmbed couleur + buildComponents 👎
  const suggest = require('../server/discord/suggest');
  const sRow = store.suggestions.create({ bot_id: BOT, guild_id: 'G198', author_id: 'U1', text: 'Test suggestion', message_id: '', channel_id: 'C1' });
  const embSug = suggest.buildEmbed(store.suggestions.get(sRow), 'Toto', { suggestion_color: '#123456' });
  check('suggest buildEmbed : couleur configurée', embSug.data.color === 0x123456);
  const compsOff = suggest.buildComponents(store.suggestions.get(sRow), { suggestion_downvotes: 0 });
  check('suggest buildComponents : 👎 masqué', !JSON.stringify(compsOff).includes('down'));
  const compsOn = suggest.buildComponents(store.suggestions.get(sRow), { suggestion_downvotes: 1 });
  check('suggest buildComponents : 👎 présent', JSON.stringify(compsOn).includes('down'));

  // quiz : la commande utilise le pool personnalisé (fonction interne vérifiée via le store)
  const quizSetId = store.quizSets.create(BOT, 'G198', { name: 'Perso', questions: [{ q: 'Q1', correct: 'A', wrong: ['B', 'C'] }] });
  check('pool personnalisé prioritaire (1 question)', store.quizSets.pool(BOT, 'G198').length === 1);
  store.quizSets.remove(quizSetId);

  // panels : code source contient les personnalisations
  const panelsSrc = read('server/discord/panels.js');
  check('panels : image personnalisée prioritaire', panelsSrc.includes("setImage(String(cfg.image_url || '').trim() || panelBannerUrl(guildId, name))"));
  check('panels : close_dm_message utilisé', panelsSrc.includes('close_dm_message'));
  check('panels : close_dm_image utilisé', panelsSrc.includes('close_dm_image'));

  // ================= 6. Dashboard : les renderers existent =================
  console.log('\n6️⃣  Dashboard');
  const dash = read('public/js/dashboard.js');
  check('renderer giveaways : configuration complète', dash.includes('giveaways/config') && dash.includes('Lancer un giveaway'));
  check('renderer suggestions : couleur + ping + 👎 + salon approuvées', dash.includes('suggestions/config') && dash.includes('s-downvotes') && dash.includes('s-approve'));
  check('renderer tickets : image du panneau + MP fermeture', dash.includes('tickets/dm') && dash.includes('data-panel-img') && dash.includes('Message privé après fermeture'));
  check('renderer quiz : création + édition + activation', dash.includes('quiz/sets') && dash.includes('📚 Mes quiz') && dash.includes('qze-add'));
  check('helper import d\'image présent', dash.includes('Dashboard.uploadImage') && dash.includes('Dashboard.imageField'));

  console.log(failures === 0
    ? '\n🎉 Tous les tests v1.98 passent — tout est configurable, défauts conservés !'
    : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
