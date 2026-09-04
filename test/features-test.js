// Test des fonctionnalités v1.11 : XP (niveaux), auto-modération, réglages par serveur
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-feat-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const xpEngine = require('../server/discord/xp');
const { runAutomod } = require('../server/discord/automod');
const { buildSlashPayloads, buildHelpEmbed } = require('../server/discord/premade');

// ---------------------- XP math ----------------------
assert(xpEngine.xpForLevel(0) === 0);
assert(xpEngine.xpForLevel(1) === 100);
assert(xpEngine.xpForLevel(5) === 2500);
assert(xpEngine.levelFromXp(99) === 0);
assert(xpEngine.levelFromXp(100) === 1);
assert(xpEngine.levelFromXp(399) === 1);
assert(xpEngine.levelFromXp(400) === 2);
console.log('1️⃣  Maths XP validées ✅');

// ---------------------- Flux XP complet ----------------------
(async () => {
  store.modules.set(1, 'utility', true);
  store.modules.set(1, 'levels', true);

  let sent = null;
  const guild = {
    id: 'G1', name: 'Serveur Test',
    roles: { cache: { get: () => undefined, find: () => undefined } },
    channels: { cache: { get: () => undefined, find: () => undefined } },
    members: { me: null },
  };
  const msg = (content = 'salut') => ({
    author: { id: 'U1', bot: false },
    guild,
    member: { roles: { cache: { has: () => false }, add: async () => {} }, permissions: { has: () => false } },
    channel: { send: async (payload) => { sent = payload; } },
    content,
    deletable: true, delete: async () => {},
  });

  // Gain d\'XP simple
  const ok1 = await xpEngine.onMessage(1, msg());
  assert(ok1 === true);
  let row = store.xp.get(1, 'G1', 'U1');
  assert(row && row.xp >= 10 && row.xp <= 25);
  console.log('2️⃣  Gain d\'XP au message ✅ (', row.xp, 'XP)');

  // Cooldown : 2e message immédiat → rien
  const ok2 = await xpEngine.onMessage(1, msg());
  assert(ok2 === false);
  console.log('3️⃣  Cooldown respecté ✅');

  // Montée de niveau + annonce
  store.xp.add(1, 'G1', 'U1', 90, 0); // 100+ XP → niveau 1
  const ok3 = await xpEngine.onMessage(1, msg());
  row = store.xp.get(1, 'G1', 'U1');
  assert(row.level === 1, 'niveau attendu 1, obtenu ' + row.level);
  // v209 : l'annonce de niveau est un embed soigné (couleur de marque + progression)
  const ann = sent && sent.embeds && sent.embeds[0] && sent.embeds[0].data;
  const annText = ann ? String(ann.description || '') : String((sent && sent.content) || sent || '');
  assert(annText.includes('niveau 1'), 'annonce attendue (embed de niveau)');
  assert(ann && ann.color === 0xe07a5f, 'annonce : couleur de marque Hoxera (#e07a5f)');
  assert(ann && ann.footer && ann.footer.text.includes('Hoxera'), 'annonce : footer signé Hoxera');
  console.log('4️⃣  Montée de niveau + annonce en embed ✅ («', annText.slice(0, 40), '… »)');

  // XP désactivé → aucun gain
  store.guildSettings.set(1, 'G1', { xp_enabled: 0 });
  const before = store.xp.get(1, 'G1', 'U1').xp;
  await xpEngine.onMessage(1, msg());
  assert(store.xp.get(1, 'G1', 'U1').xp === before);
  store.guildSettings.set(1, 'G1', { xp_enabled: 1 });
  console.log('5️⃣  XP désactivé respecté ✅');

  // ---------------------- Auto-modération ----------------------
  store.guildSettings.set(1, 'G1', { am_enabled: 1, am_links: 1, am_caps: 1, am_mentions: 2, am_spam: 5 });

  const withDelete = (content) => {
    let deleted = false;
    const m = msg(content);
    m.deletable = true;
    m.delete = async () => { deleted = true; };
    return { m, deleted: () => deleted };
  };

  // Lien
  let t = withDelete('viens sur https://discord.gg/abc !');
  let r = await runAutomod(1, t.m);
  assert(r.acted && t.deleted());
  console.log('6️⃣  Lien supprimé ✅');

  // MAJUSCULES
  t = withDelete('BONJOUR TOUT LE MONDE COMMENT CA VA AUJOURDHUI');
  r = await runAutomod(1, t.m);
  assert(r.acted && t.deleted());
  console.log('7️⃣  MAJUSCULES supprimé ✅');

  // Mentions excessives
  t = withDelete('<@1> <@2> <@3> viens voir');
  r = await runAutomod(1, t.m);
  assert(r.acted && t.deleted());
  console.log('8️⃣  Trop de mentions supprimé ✅');

  // Message normal : rien
  t = withDelete('salut les amis, ça va ?');
  r = await runAutomod(1, t.m);
  assert(!r.acted && !t.deleted());
  console.log('9️⃣  Message normal ignoré ✅');

  // Admin bypass
  let adminBypass = null;
  const adminMsg = msg('https://discord.gg/xyz');
  adminMsg.member.permissions.has = () => true;
  r = await runAutomod(1, adminMsg);
  assert(!r.acted);
  console.log('🔟  Admin ignoré (bypass) ✅');

  // Anti-spam : 5 messages rapides → timeout
  let timedOut = false;
  for (let i = 0; i < 5; i++) {
    const m = msg(`message ${i} ok`);
    m.member.moderatable = true;
    m.member.timeout = async () => { timedOut = true; };
    r = await runAutomod(1, m);
    if (r.acted && r.reason === 'spam') break;
  }
  assert(timedOut, 'timeout attendu');
  console.log('1️⃣1️⃣  Anti-spam → timeout appliqué ✅');

  // ---------------------- Réglages par serveur (roundtrip) ----------------------
  store.guildSettings.set(1, 'G1', {
    prefix: '?', xp_min: 15, xp_max: 30, xp_cooldown: 30,
    xp_message: '{user} niveau {level} !', xp_channel: '#niveaux',
    am_enabled: 1, am_links: 1, am_caps: 0, am_mentions: 3, am_spam: 7,
  });
  const gs = store.guildSettings.get(1, 'G1');
  assert(gs.prefix === '?' && gs.xp_min === 15 && gs.xp_max === 30);
  assert(gs.am_caps === 0 && gs.am_mentions === 3 && gs.am_spam === 7);
  assert(gs.xp_message === '{user} niveau {level} !');
  console.log('1️⃣2️⃣  Réglages XP + auto-mod en base ✅');

  // Rôles de récompense
  store.xpRoles.replace(1, 'G1', [{ level: 3, role: 'Actif' }, { level: 7, role: 'Vétéran' }]);
  assert(store.xpRoles.all(1, 'G1').length === 2);
  assert(store.xpRoles.all(1, 'G1')[1].role === 'Vétéran');
  console.log('1️⃣3️⃣  Rôles de récompense ✅');

  // ---------------------- Payloads & help ----------------------
  const payloads = buildSlashPayloads(1);
  const names = payloads.map((p) => p.name);
  for (const n of ['rank', 'levels', 'invite']) assert(names.includes(n), n + ' absent');
  for (const p of payloads) {
    if (!/^[a-z0-9\-_]{1,32}$/.test(p.name)) throw new Error('nom invalide ' + p.name);
  }
  const rank = payloads.find((p) => p.name === 'rank');
  assert(rank.options.some((o) => o.name === 'utilisateur'));
  console.log('1️⃣4️⃣  /rank, /levels, /invite enregistrés dans les payloads ✅');

  const client = { user: { username: 'TestBot', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/a.png' } };
  const help = buildHelpEmbed(1, { prefix: '!' }, client, null, null);
  assert(help.data.fields.some((f) => f.name.includes('Niveaux')));
  const helpRank = buildHelpEmbed(1, { prefix: '!' }, client, null, 'rank');
  assert(helpRank.data.fields[0].value.includes('/rank'));
  console.log('1️⃣5️⃣  /help contient les niveaux + détail /help rank ✅');

  console.log('\n🎉 Tous les tests des nouvelles fonctionnalités passent !');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
