// v292 — 🎁 Giveaways : conditions de participation + bouton 👥 Participants + rappel 5 min.
// Vérifié : colonne reminded, recherche par message, fenêtre de rappel, réglages
// (rôle requis / niveau / rappel), conditions sur le panneau, exclusion au tirage,
// réaction retirée + MP, bouton participants, hooks, i18n fr+en, routes, dashboard, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v292');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const gw = require('../server/discord/giveaway');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const B = Number(store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'gV292';

  console.log('— 1. Base de données —');
  const id1 = store.giveaways.create({ bot_id: B, guild_id: G, channel_id: 'ch1', message_id: 'm1', prize: 'Nitro', winners: 1, ends_at: Date.now() + 180000 });
  check('colonne « reminded » à 0 par défaut', store.giveaways.get(id1).reminded === 0);
  check('recherche par message', (store.giveaways.byMessage(B, G, 'm1') || {}).id === id1);
  check('message inconnu → null', store.giveaways.byMessage(B, G, 'nope') === null);
  const soon = store.giveaways.dueForReminder(B, Date.now());
  check('giveaway à 3 min de la fin → dans la fenêtre de rappel', soon.length === 1 && soon[0].id === id1);
  store.giveaways.markReminded(id1);
  check('rappel marqué → plus dans la fenêtre', store.giveaways.dueForReminder(B, Date.now()).length === 0);
  const id2 = store.giveaways.create({ bot_id: B, guild_id: G, channel_id: 'ch1', message_id: 'm2', prize: 'Clé', winners: 1, ends_at: Date.now() + 1200000 });
  check('giveaway à 20 min de la fin → hors fenêtre', store.giveaways.dueForReminder(B, Date.now()).length === 0);
  store.giveaways.remove(id2);

  console.log('— 2. Réglages (rôle requis, niveau, rappel) —');
  store.guildSettings.set(B, G, { giveaway_req_role: 'rVIP', giveaway_req_level: 5, giveaway_reminder: 1 });
  let st = store.guildSettings.get(B, G);
  check('réglages enregistrés', st.giveaway_req_role === 'rVIP' && st.giveaway_req_level === 5 && st.giveaway_reminder === 1);
  store.guildSettings.set(B, G, { giveaway_req_level: 99999, giveaway_reminder: true });
  st = store.guildSettings.get(B, G);
  check('niveau farfelu borné à 200, rappel normalisé', st.giveaway_req_level === 200 && st.giveaway_reminder === 1);
  store.guildSettings.set(B, G, { giveaway_req_level: 0, giveaway_reminder: 0, giveaway_req_role: '' });
  check('désactivation propre', store.guildSettings.get(B, G).giveaway_reminder === 0);
  store.guildSettings.set(B, G, { giveaway_req_role: 'rVIP', giveaway_req_level: 5 });

  console.log('— 3. Conditions —');
  check('sans réglage → aucune condition', gw.conditionsOf({}).role === '' && gw.conditionsOf({}).level === 0);
  check('conditions vides → texte vide', gw.conditionsText({}, 'fr') === '');
  store.guildSettings.set(B, G, { giveaway_req_role: '', giveaway_req_level: 5 });
  let settings = store.guildSettings.get(B, G);
  check('niveau seul → texte niveau', gw.conditionsText(settings, 'fr').includes('Niveau 5 minimum'), gw.conditionsText(settings, 'fr'));
  store.guildSettings.set(B, G, { giveaway_req_role: '123456789012345678', giveaway_req_level: 5 });
  settings = store.guildSettings.get(B, G);
  const txt = gw.conditionsText(settings, 'fr');
  check('rôle + niveau → mention et texte combinés', txt.includes('<@&123456789012345678>') && txt.includes('Niveau 5'), txt);
  check('texte anglais', gw.conditionsText(settings, 'en').includes('Level 5 minimum'));
  store.guildSettings.set(B, G, { giveaway_req_role: '', giveaway_req_level: 0 });

  console.log('— 4. Panneau —');
  const panelSans = gw.buildPanel({ prize: 'Nitro', winners: 1, ends_at: Date.now() + 60000 }, {}, '');
  const jsonSans = JSON.stringify(panelSans.components ? panelSans.components.map((c) => c.toJSON()) : []);
  check('panneau sans conditions : pas de ligne Conditions', !JSON.stringify(panelSans).includes('Conditions de participation'));
  store.guildSettings.set(B, G, { giveaway_req_role: 'rVIP', giveaway_req_level: 5 });
  const gs = store.guildSettings.get(B, G);
  const panel = gw.buildPanel({ prize: 'Nitro', winners: 2, ends_at: Date.now() + 60000 }, { color: '#FEE75C', message: '', giveaway_req_role: gs.giveaway_req_role, giveaway_req_level: gs.giveaway_req_level }, '', { botId: B, lang: 'fr' });
  const flat = JSON.stringify(panel.components ? panel.components.map((c) => (c.toJSON ? c.toJSON() : c)) : panel);
  check('panneau avec conditions : ligne 📋 affichée', flat.includes('Conditions de participation') && flat.includes('rVIP'));
  check('bouton 👥 Participants avec customId hxgw:', flat.includes(`hxgw:${B}:participants`) && flat.includes('Participants'));
  check('panneau toujours en Components V2 (footer Hoxera)', flat.includes('Hoxera · Giveaway'));
  store.guildSettings.set(B, G, { giveaway_req_role: '', giveaway_req_level: 0 });

  console.log('— 5. Vérification des conditions (checkConditions) —');
  const mkMember = (roles, level) => ({ roles: { cache: { has: (r) => roles.includes(r) } }, user: { id: 'u', bot: false }, __level: level });
  const guild = {
    id: G,
    roles: { cache: (() => { const m = new Map([['rVIP', { id: 'rVIP', name: 'VIP' }]]); m.find = (fn) => { for (const v of m.values()) if (fn(v)) return v; return undefined; }; return m; })() },
    members: {
      fetch: async (id) => {
        if (id === 'u1') return mkMember(['rVIP'], 8);
        if (id === 'u2') return mkMember([], 8);
        if (id === 'u3') return mkMember(['rVIP'], 1);
        throw new Error('inconnu');
      },
    },
  };
  store.xp.add(B, G, 'u1', 6400, Date.now()); // niveau 8
  store.xp.add(B, G, 'u3', 100, Date.now());  // niveau 1
  store.guildSettings.set(B, G, { giveaway_req_role: 'rVIP', giveaway_req_level: 5 });
  settings = store.guildSettings.get(B, G);
  check('membre avec rôle + niveau → éligible', (await gw.checkConditions(B, guild, 'u1', settings)).ok === true);
  check('membre sans le rôle → refusé (rôle)', (await gw.checkConditions(B, guild, 'u2', settings)).key === 'gw_denied_role');
  check('membre sous le niveau → refusé (niveau)', (await gw.checkConditions(B, guild, 'u3', settings)).key === 'gw_denied_level');
  check('membre introuvable → refus silencieux', (await gw.checkConditions(B, guild, 'ghost', settings)).silent === true);
  store.guildSettings.set(B, G, { giveaway_req_role: '', giveaway_req_level: 0 });
  check('aucune condition → tout le monde éligible', (await gw.checkConditions(B, guild, 'u2', store.guildSettings.get(B, G))).ok === true);

  console.log('— 6. Réaction 🎉 retirée + MP —');
  store.guildSettings.set(B, G, { giveaway_req_role: 'rVIP', giveaway_req_level: 5 });
  const dms = [];
  const removed = [];
  const reaction = {
    emoji: { name: '🎉' },
    message: { id: 'm1', guild },
    users: { remove: async (id) => { removed.push(id); } },
  };
  const mkUser = (id, eligible) => ({
    id, bot: false,
    createDM: async () => ({ send: async (t) => { dms.push(t); } }),
  });
  await gw.onReaction(B, reaction, mkUser('u2'));
  check('réaction du membre non éligible retirée', removed.length === 1 && removed[0] === 'u2');
  check('MP d\'explication envoyé (rôle requis)', dms.length === 1 && dms[0].includes('rôle') && dms[0].includes('Nitro'), dms[0]);
  await gw.onReaction(B, reaction, mkUser('u1'));
  check('membre éligible → réaction conservée, aucun MP', removed.length === 1 && dms.length === 1);
  await gw.onReaction(B, { ...reaction, emoji: { name: '👍' } }, mkUser('u3'));
  check('autre emoji que 🎉 → ignoré', removed.length === 1 && dms.length === 1);
  await gw.onReaction(B, reaction, { id: 'bot1', bot: true, createDM: async () => ({ send: async () => {} }) });
  check('bot → ignoré', removed.length === 1);
  store.guildSettings.set(B, G, { giveaway_req_role: '', giveaway_req_level: 0 });

  console.log('— 7. Bouton 👥 Participants —');
  const usersMap = new Map([['u1', { id: 'u1', username: 'Alice', bot: false }], ['u2', { id: 'u2', username: 'Bob', bot: false }]]);
  const message = { id: 'm1', reactions: { resolve: (e) => (e === '🎉' ? { users: { fetch: async () => usersMap, cache: usersMap } } : null) } };
  const replies = [];
  const itx = {
    guildId: G,
    message,
    channel: { messages: { fetch: async () => message } },
    reply: async (p) => { replies.push(p); },
  };
  const handled = await gw.handleParticipants(B, itx);
  check('bouton traité', handled === true);
  check('liste éphémère avec compteur et noms', replies.length === 1 && replies[0].ephemeral === true && replies[0].content.includes('2 participant') && replies[0].content.includes('Alice') && replies[0].content.includes('Bob'), replies[0].content);
  const replies2 = [];
  await gw.handleParticipants(B, { guildId: G, message: { id: 'inconnu' }, channel: { messages: { fetch: async () => null } }, reply: async (p) => { replies2.push(p); } });
  check('giveaway introuvable → message éphémère dédié', replies2.length === 1 && replies2[0].ephemeral === true && replies2[0].content.includes('introuvable'), replies2[0].content);
  const replies3 = [];
  const vide = { id: 'm1', reactions: { resolve: () => null } };
  await gw.handleParticipants(B, { guildId: G, message: vide, channel: { messages: { fetch: async () => vide } }, reply: async (p) => { replies3.push(p); } });
  check('aucun participant → texte dédié', replies3[0].content.includes('Aucun participant'), replies3[0].content);

  console.log('— 8. Rappel 5 minutes avant la fin —');
  const sends = [];
  const entry = { client: { channels: { fetch: async (id) => (id === 'ch1' ? { id: 'ch1', send: async (t) => { sends.push(t); } } : null) } } };
  const id4 = store.giveaways.create({ bot_id: B, guild_id: G, channel_id: 'ch1', message_id: 'm4', prize: 'Nitro', winners: 1, ends_at: Date.now() + 180000 });
  store.guildSettings.set(B, G, { giveaway_reminder: 1 });
  await gw.sweep(B, entry);
  check('rappel envoyé une fois (giveaway à 3 min de la fin)', sends.length === 1 && sends[0].includes('Nitro') && sends[0].includes('🎉'), String(sends[0]));
  await gw.sweep(B, entry);
  check('pas de deuxième rappel', sends.length === 1);
  check('rappel marqué en base', store.giveaways.get(id4).reminded === 1);
  const id3 = store.giveaways.create({ bot_id: B, guild_id: G, channel_id: 'ch1', message_id: 'm3', prize: 'Clé', winners: 1, ends_at: Date.now() + 120000 });
  store.guildSettings.set(B, G, { giveaway_reminder: 0 });
  await gw.sweep(B, entry);
  check('rappel désactivé → rien n\'est envoyé', sends.length === 1);
  check('giveaway quand même marqué (pas de re-scan)', store.giveaways.get(id3).reminded === 1);
  store.giveaways.remove(id3);

  console.log('— 9. Branchements —');
  const bm = racine('server/discord/botManager.js');
  const idxReact = bm.indexOf("client.on('messageReactionAdd'");
  check('botManager : réaction → giveaway.onReaction', idxReact > 0 && bm.slice(idxReact, idxReact + 500).includes("require('./giveaway').onReaction(botId, reaction, user)"));
  check('botManager : bouton hxgw: → handleParticipants', bm.includes("startsWith('hxgw:')") && bm.includes("require('./giveaway').handleParticipants(botId, i)"));

  console.log('— 10. Textes fr + en —');
  const i18n = require('../server/i18n');
  const keys = ['gw_participants_btn', 'gw_participants_title', 'gw_participants_count', 'gw_participants_none', 'gw_participants_gone', 'gw_cond_role', 'gw_cond_level', 'gw_denied_dm', 'gw_denied_role', 'gw_denied_level', 'gw_reminder'];
  check('les 11 textes existent en français', keys.every((k) => i18n.t('fr', k) !== k), keys.filter((k) => i18n.t('fr', k) === k).join(','));
  check('les 11 textes existent en anglais', keys.every((k) => i18n.t('en', k) !== k), keys.filter((k) => i18n.t('en', k) === k).join(','));
  const dmFr = i18n.t('fr', 'gw_denied_dm', { prize: 'Nitro', reason: i18n.t('fr', 'gw_denied_role', { role: 'VIP' }) });
  check('MP de refus français complet et vouvoyé', dmFr.includes('Nitro') && dmFr.includes('VIP') && dmFr.includes('Votre réaction'), dmFr);
  check('rappel anglais complet', i18n.t('en', 'gw_reminder', { prize: 'Key', time: 'in 5 minutes' }).includes('Key'));

  console.log('— 11. Routes et dashboard —');
  const routes = racine('server/routes.js');
  check('config giveaways : rôle requis, niveau, rappel', routes.includes('giveaway_req_role: String(b.req_role') && routes.includes('giveaway_req_level:') && routes.includes('giveaway_reminder: b.reminder ? 1 : 0'));
  const dash = racine('public/js/dashboard.js');
  const iGw = dash.indexOf('Dashboard.renderers.giveaways');
  const chunk = dash.slice(iGw, iGw + 12000);
  check('dashboard : sélecteurs rôle requis + niveau + case rappel', chunk.includes('gw-req-role') && chunk.includes('gw-req-level') && chunk.includes('gw-reminder'));
  check('dashboard : les 3 réglages sont envoyés', chunk.includes('req_role:') && chunk.includes('req_level:') && chunk.includes('reminder:'));

  console.log('— 12. Bump v292 —');
  const index = racine('public/index.html');
  check('index.html : ?v=293 référencé 7 fois', (index.match(/\?v=293/g) || []).length === 7,
    String((index.match(/\?v=293/g) || []).length));
  check('sw.js : cache « botdev-v293 »', racine('public/sw.js').includes("const CACHE = 'botdev-v293';"));

  console.log(`\n🎉 v292 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
