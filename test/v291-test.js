// v291 — 📨 Récompenses d'invitations + anti fausses invitations.
// Vérifié : colonne « valid » (invite invalidée si départ trop tôt), countBy/top
// filtrés, config paliers + validations, rôle donné au palier atteint, annonce,
// hooks (community/botManager), i18n fr+en, routes, dashboard, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v291');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const inv = require('../server/discord/invites');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const B = Number(store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'gV291';

  console.log('— 1. Base de données : invites valides / invalidées —');
  store.inviteJoins.add(B, G, 'u1', 'inv1', 'CODE1');
  store.inviteJoins.add(B, G, 'u2', 'inv1', 'CODE1');
  check('une invite enregistrée compte (valid par défaut)', store.inviteJoins.countBy(B, G, 'inv1') === 2);
  // u2 a rejoint il y a 3 jours → hors fenêtre 24 h, ne doit PAS être invalidé
  store.db.prepare("UPDATE invite_joins SET joined_at = datetime('now', '-3 days') WHERE bot_id = ? AND guild_id = ? AND user_id = 'u2'").run(B, G);
  let n = store.inviteJoins.invalidateRecent(B, G, 'u2', 24);
  check('invité parti après le délai → invite conservée', n === 0 && store.inviteJoins.countBy(B, G, 'inv1') === 2);
  n = store.inviteJoins.invalidateRecent(B, G, 'u1', 24);
  check('invité parti avant le délai → invite invalidée', n === 1 && store.inviteJoins.countBy(B, G, 'inv1') === 1);
  n = store.inviteJoins.invalidateRecent(B, G, 'u1', 24);
  check('double invalidation ignorée (déjà invalidée)', n === 0);
  store.inviteJoins.add(B, G, 'u3', 'inv2', 'CODE2');
  store.db.prepare("UPDATE invite_joins SET valid = 0 WHERE bot_id = ? AND guild_id = ? AND user_id = 'u3'").run(B, G);
  const top = store.inviteJoins.top(B, G, 10);
  check('le classement des recruteurs ignore les invites invalidées', JSON.stringify(top) === JSON.stringify([{ inviter_id: 'inv1', n: 1 }]), JSON.stringify(top));

  console.log('— 2. Config des récompenses —');
  const d = inv.cfgOf('gNeuf291');
  check('désactivées par défaut, anti-fausses 24 h', d.enabled === false && d.min_hours === 24 && d.channel === '' && d.rewards.length === 0);
  await inv.saveCfg(B, G, { enabled: true, min_hours: 24, channel: 'chAn', rewards: [{ invites: 25, role: 'rAmb' }, { invites: 5, role: 'rFan' }] });
  const c = inv.cfgOf(G);
  check('paliers enregistrés et triés', c.enabled && c.channel === 'chAn' && c.rewards.length === 2 && c.rewards[0].invites === 5 && c.rewards[1].invites === 25);
  let err = '';
  try { await inv.saveCfg(B, G, { min_hours: 13 }); } catch (e) { err = e.message; }
  check('délai farfelu refusé', !!err);
  err = '';
  try { await inv.saveCfg(B, G, { min_hours: 24, rewards: [{ invites: 5, role: 'a' }, { invites: 5, role: 'b' }] }); } catch (e) { err = e.message; }
  check('deux paliers identiques refusés', !!err);
  err = '';
  try { await inv.saveCfg(B, G, { min_hours: 24, rewards: [{ invites: 5, role: '' }] }); } catch (e) { err = e.message; }
  check('palier sans rôle refusé', !!err);
  err = '';
  try { await inv.saveCfg(B, G, { min_hours: 24, rewards: [{ invites: 0, role: 'r' }] }); } catch (e) { err = e.message; }
  check('palier à 0 invitation refusé', !!err);
  await inv.saveCfg(B, G, { enabled: true, min_hours: 24, channel: 'chAn', rewards: Array.from({ length: 14 }, (_, i) => ({ invites: i + 1, role: 'r' + i })) });
  check('plus de 10 paliers → limité à 10', inv.cfgOf(G).rewards.length === 10);
  await inv.saveCfg(B, G, { enabled: true, min_hours: 24, channel: 'chAn', rewards: [{ invites: 3, role: 'rFan' }] });

  console.log('— 3. Palier atteint → rôle + annonce —');
  const sent = [];
  const added = [];
  const memberObj = {
    id: 'inv1', user: { username: 'Alice', tag: 'Alice#0001' }, displayName: 'Alice',
    roles: { cache: { has: () => false }, add: async (rid) => { added.push(rid); } },
  };
  const guild = {
    id: G, name: 'Test',
    members: { fetch: async (id) => { if (String(id) === 'inv1') return memberObj; throw new Error('inconnu'); } },
    roles: { cache: new Map([['rFan', { id: 'rFan', name: 'Fan' }]]) },
    channels: { cache: new Map([['chAn', { id: 'chAn', send: async (m) => { sent.push(m); } }]]) },
  };
  // inv1 a 1 invite valide (u2) → pas de palier à 1
  await inv.onInviteCounted(B, guild, 'inv1');
  check('palier non atteint → rien', added.length === 0 && sent.length === 0);
  store.inviteJoins.add(B, G, 'u4', 'inv1', 'CODE1');
  store.inviteJoins.add(B, G, 'u5', 'inv1', 'CODE1');
  await inv.onInviteCounted(B, guild, 'inv1'); // countBy = 3 = palier
  check('palier atteint → rôle donné à l\'inviteur', added.length === 1 && added[0] === 'rFan');
  check('palier atteint → annonce dans le salon choisi', sent.length === 1 && sent[0].includes('Alice') && sent[0].includes('3') && sent[0].includes('Fan'), String(sent[0]));
  await inv.onInviteCounted(B, guild, 'fantome'); // membre introuvable
  check('inviteur introuvable → silencieux', added.length === 1 && sent.length === 1);
  await inv.saveCfg(B, G, { enabled: false, min_hours: 24, rewards: [{ invites: 4, role: 'rFan' }] });
  store.inviteJoins.add(B, G, 'u6', 'inv1', 'CODE1');
  await inv.onInviteCounted(B, guild, 'inv1');
  check('module désactivé → aucun rôle même au palier', added.length === 1);
  await inv.saveCfg(B, G, { enabled: true, min_hours: 24, channel: 'chAn', rewards: [{ invites: 3, role: 'rFan' }] });

  console.log('— 4. Départ d\'un invité → invite invalidée —');
  store.inviteJoins.add(B, G, 'u7', 'inv9', 'CODE9'); // joined_at = maintenant
  const left = await inv.onMemberLeave(B, guild, { id: 'u7', guild });
  check('départ dans la fenêtre → invite invalidée', left === 1 && store.inviteJoins.countBy(B, G, 'inv9') === 0);
  await inv.saveCfg(B, G, { enabled: true, min_hours: 0, channel: '', rewards: [] });
  store.inviteJoins.add(B, G, 'u8', 'inv9', 'CODE9');
  const left2 = await inv.onMemberLeave(B, guild, { id: 'u8', guild });
  check('détection désactivée (0 h) → rien n\'est invalidé', !left2 && store.inviteJoins.countBy(B, G, 'inv9') === 1);
  await inv.saveCfg(B, G, { enabled: true, min_hours: 24, channel: 'chAn', rewards: [{ invites: 3, role: 'rFan' }] });

  console.log('— 5. Branchements —');
  const community = racine('server/discord/community.js');
  check('community : palier vérifié après attribution d\'une invite', community.includes("require('./invites').onInviteCounted(botId, guild, used.inviter_id)"));
  const bm = racine('server/discord/botManager.js');
  const idxLeave = bm.indexOf("client.on('guildMemberRemove'");
  check('botManager : départ de membre → onMemberLeave', idxLeave > 0 && bm.slice(idxLeave, idxLeave + 900).includes("require('./invites').onMemberLeave(botId, member.guild, member)"));

  console.log('— 6. Textes fr + en —');
  const i18n = require('../server/i18n');
  const fr = i18n.t('fr', 'invite_reward_msg', { inviter: 'Alice', count: '5', role: 'Fan' });
  const en = i18n.t('en', 'invite_reward_msg', { inviter: 'Alice', count: '5', role: 'Fan' });
  check('annonce fr complète', fr.includes('Alice') && fr.includes('5 invitations valides') && fr.includes('Fan'), fr);
  check('annonce en complète', en.includes('Alice') && en.includes('5 valid invites') && en.includes('Fan'), en);

  console.log('— 7. Routes —');
  const routes = racine('server/routes.js');
  check('payload guilde : invite_rewards', routes.includes("invite_rewards: require('./discord/invites').cfgOf(guildId)"));
  check('route PUT invite-rewards enregistrée', routes.includes("router.put('/bots/:id/guilds/:guildId/invite-rewards'"));

  console.log('— 8. Dashboard —');
  const dash = racine('public/js/dashboard.js');
  const iCommunity = dash.indexOf('Dashboard.renderers.community');
  const chunk = dash.slice(iCommunity, iCommunity + 9000);
  check('carte « Récompenses d\'invitations » dans le module Communauté', chunk.includes("Récompenses d\\'invitations") && chunk.includes('irc-save'));
  check('sauvegarde via PUT invite-rewards', chunk.includes('/invite-rewards'));
  check('ligne anti fausses invitations + paliers', chunk.includes('irc-minh') && chunk.includes('irc-add'));

  console.log('— 9. Bump v291 —');
  const index = racine('public/index.html');
  check('index.html : ?v=292 référencé 7 fois', (index.match(/\?v=292/g) || []).length === 7,
    String((index.match(/\?v=292/g) || []).length));
  check('sw.js : cache « botdev-v292 »', racine('public/sw.js').includes("const CACHE = 'botdev-v292';"));

  console.log(`\n🎉 v291 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
