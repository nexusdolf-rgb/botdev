// v293 — 🔒 Vérification : isolation automatique des non-vérifiés.
// Vérifié : config (isolate + salons enregistrés), application (deny @everyone
// + allow rôle vérifié, salon de vérification visible, salons déjà privés
// ignorés, catégories ignorées), retrait ciblé, salon créé pendant l'isolation,
// distribution du rôle aux membres actuels, erreurs (salon/rôle/permission/
// hiérarchie), hooks, routes, dashboard, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v293');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ver = require('../server/discord/verification');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const EVERYONE = '@everyone';

function mkGuild(G, opts = {}) {
  const edits = [];
  const mkChan = (id, { type = 0, denyAll = false } = {}) => ({
    id, type, name: 'c-' + id,
    permissionOverwrites: {
      cache: new Map(denyAll ? [[EVERYONE, { id: EVERYONE, deny: { has: () => true } }]] : []),
      edit: async (target, perms) => { edits.push({ ch: id, target: String(target), perms }); },
    },
  });
  const channels = new Map([
    ['chVerif', mkChan('chVerif')],
    ['general', mkChan('general')],
    ['jeux', mkChan('jeux')],
    ['vocal', mkChan('vocal', { type: 2 })],
    ['staff', mkChan('staff', { denyAll: true })],   // déjà privé
    ['cat1', mkChan('cat1', { type: 4 })],           // catégorie
  ]);
  if (opts.extraChannel) channels.set(opts.extraChannel.id, opts.extraChannel);
  const members = new Map([
    ['m1', { id: 'm1', user: { bot: false }, roles: { cache: { has: () => false }, add: async (rid) => { edits.push({ grant: 'm1', rid }); } } }],
    ['m2', { id: 'm2', user: { bot: false }, roles: { cache: { has: (rid) => rid === 'rVerif' }, add: async () => { edits.push({ grant: 'm2' }); } } }],
    ['b1', { id: 'b1', user: { bot: true }, roles: { cache: { has: () => false }, add: async () => { edits.push({ grant: 'b1' }); } } }],
  ]);
  return {
    id: G, name: 'Test', edits, members,
    roles: {
      everyone: { id: EVERYONE },
      cache: new Map([[EVERYONE, { id: EVERYONE, name: '@everyone', position: 0 }], ['rVerif', { id: 'rVerif', name: 'Membre', position: 1 }]]),
    },
    channels: { cache: channels },
  };
}

(async () => {
  const B = Number(store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'gV293';
  const guild = mkGuild(G);
  guild.members.me = { permissions: { has: () => true }, roles: { highest: { position: 10 } } };
  guild.members.fetch = async () => guild.members;

  console.log('— 1. Config —');
  const d = ver.cfgOf('gNeuf293');
  check('isolation désactivée par défaut', d.isolate === false && Array.isArray(d.isolated_channels) && d.isolated_channels.length === 0);
  ver.saveCfg(G, { enabled: true, channel: 'chVerif', role: 'rVerif', isolate: true, isolated_channels: ['general', 42, ''] });
  const c = ver.cfgOf(G);
  check('isolation + liste enregistrées et normalisées', c.isolate === true && JSON.stringify(c.isolated_channels) === '["general","42"]', JSON.stringify(c.isolated_channels));
  ver.saveCfg(G, { isolate: false, isolated_channels: [] });

  console.log('— 2. Erreurs avant application —');
  ver.saveCfg(G, { channel: '', role: '' });
  let code = '';
  try { ver.assertIsolationReady(guild); } catch (e) { code = e.code; }
  check('salon de vérification manquant → NO_CHANNEL', code === 'NO_CHANNEL');
  ver.saveCfg(G, { enabled: true, channel: 'chVerif', role: '' });
  code = '';
  try { ver.assertIsolationReady(guild); } catch (e) { code = e.code; }
  check('rôle manquant → NO_ROLE', code === 'NO_ROLE');
  ver.saveCfg(G, { enabled: true, channel: 'chVerif', role: 'rVerif' });
  const noPerm = mkGuild(G);
  noPerm.members.me = { permissions: { has: () => false }, roles: { highest: { position: 10 } } };
  code = '';
  try { ver.assertIsolationReady(noPerm); } catch (e) { code = e.code; }
  check('permission « Gérer les salons » manquante → NO_PERM', code === 'NO_PERM');

  console.log('— 3. Application de l\'isolation —');
  guild.edits.length = 0;
  const res = await ver.applyIsolation(B, guild);
  const denies = guild.edits.filter((e) => e.perms && e.perms.ViewChannel === false);
  const allows = guild.edits.filter((e) => e.perms && e.perms.ViewChannel === true);
  check('3 salons publics masqués pour @everyone', res.done === 3 && denies.length === 3 && ['general', 'jeux', 'vocal'].every((id) => denies.some((e) => e.ch === id)), JSON.stringify(denies.map((e) => e.ch)));
  check('rôle vérifié autorisé sur les 3 salons', allows.filter((e) => e.target === 'rVerif').length === 3);
  check('salon de vérification rendu visible à @everyone', allows.some((e) => e.ch === 'chVerif' && e.target === EVERYONE));
  check('salon déjà privé (staff) ignoré', !guild.edits.some((e) => e.ch === 'staff') && res.skipped === 1);
  check('catégorie jamais touchée', !guild.edits.some((e) => e.ch === 'cat1'));
  const cfg3 = ver.cfgOf(G);
  check('isolation active + 3 salons enregistrés', cfg3.isolate === true && cfg3.isolated_channels.length === 3 && !cfg3.isolated_channels.includes('staff'), JSON.stringify(cfg3.isolated_channels));

  console.log('— 4. Salon créé pendant l\'isolation —');
  const nouveau = {
    id: 'nouveau', type: 0, name: 'nouveau', guild,
    permissionOverwrites: { cache: new Map(), edit: async (target, perms) => { guild.edits.push({ ch: 'nouveau', target: String(target), perms }); } },
  };
  guild.channels.cache.set('nouveau', nouveau);
  guild.edits.length = 0;
  await ver.onChannelCreate(B, nouveau);
  check('nouveau salon masqué + rôle autorisé', guild.edits.some((e) => e.ch === 'nouveau' && e.perms.ViewChannel === false) && guild.edits.some((e) => e.ch === 'nouveau' && e.target === 'rVerif' && e.perms.ViewChannel === true));
  check('nouveau salon ajouté à la liste', ver.cfgOf(G).isolated_channels.includes('nouveau'));
  await ver.onChannelCreate(B, { id: 'x', type: 4, guild, permissionOverwrites: { cache: new Map(), edit: async () => { throw new Error('ne doit pas arriver'); } } });
  check('catégorie créée → ignorée', true);
  // isolation désactivée → plus rien
  ver.saveCfg(G, { isolate: false });
  guild.edits.length = 0;
  await ver.onChannelCreate(B, { id: 'y', type: 0, guild, permissionOverwrites: { cache: new Map(), edit: async (t, p) => { guild.edits.push({ ch: 'y', target: String(t), perms: p }); } } });
  check('isolation désactivée → nouveau salon non masqué', guild.edits.length === 0);
  ver.saveCfg(G, { isolate: true });

  console.log('— 5. Retrait (tout rendre visible) —');
  guild.edits.length = 0;
  const r5 = await ver.removeIsolation(B, guild);
  const nulls = guild.edits.filter((e) => e.perms && e.perms.ViewChannel === null);
  check('seuls les salons enregistrés sont rouverts', r5.done === 4 && nulls.length === 8, JSON.stringify(guild.edits.map((e) => e.ch + ':' + e.target)));
  check('salon déjà privé (staff) toujours intact', !guild.edits.some((e) => e.ch === 'staff'));
  const cfg5 = ver.cfgOf(G);
  check('isolation désactivée + liste vidée', cfg5.isolate === false && cfg5.isolated_channels.length === 0);

  console.log('— 6. Distribution du rôle aux membres actuels —');
  ver.saveCfg(G, { role: 'rVerif' });
  guild.edits.length = 0;
  const g6 = await ver.grantRoleToAll(B, guild);
  check('membres sans rôle → reçoivent le rôle', g6.added === 1 && guild.edits.some((e) => e.grant === 'm1' && e.rid === 'rVerif'));
  check('membre déjà vérifié ignoré, bots ignorés', !guild.edits.some((e) => e.grant === 'm2') && !guild.edits.some((e) => e.grant === 'b1'));
  const lowBot = mkGuild(G);
  lowBot.members.me = { permissions: { has: () => true }, roles: { highest: { position: 0 } } };
  lowBot.members.fetch = async () => lowBot.members;
  ver.saveCfg(G, { role: 'rVerif' });
  let code6 = '';
  try { ver.assertGrantReady(lowBot); } catch (e) { code6 = e.code; }
  check('rôle vérifié au-dessus du bot → ROLE_TOO_HIGH', code6 === 'ROLE_TOO_HIGH');

  console.log('— 7. Branchements —');
  const bm = racine('server/discord/botManager.js');
  const idx = bm.indexOf("client.on('channelCreate'");
  check('botManager : channelCreate → verification.onChannelCreate', idx > 0 && bm.slice(idx, idx + 600).includes("require('./verification').onChannelCreate(botId, c)"));

  console.log('— 8. Routes —');
  const routes = racine('server/routes.js');
  check('PUT verification accepte isolate', routes.includes('if (typeof b.isolate === \'boolean\') patch.isolate = b.isolate;'));
  check('route POST isolate enregistrée', routes.includes("router.post('/bots/:id/guilds/:guildId/verification/isolate'"));
  check('route POST grant-role enregistrée', routes.includes("router.post('/bots/:id/guilds/:guildId/verification/grant-role'"));
  check('long travail en arrière-plan (réponse immédiate)', routes.includes('ver.applyIsolation(bot.id, guild).catch(() => {});') && routes.includes('ver.grantRoleToAll(bot.id, guild).catch(() => {});'));

  console.log('— 9. Dashboard —');
  const dash = racine('public/js/dashboard.js');
  const iVer = dash.indexOf('Dashboard.renderers.verification');
  const chunk = dash.slice(iVer, iVer + 14000);
  // v294 : les 3 boutons sont devenus un sélecteur + une case (mêmes routes)
  check('sélecteur d\'isolation (2 choix) + badge actif', chunk.includes('ver-isolate-sel') && chunk.includes('Isolation ACTIVE') && chunk.includes('Désactivée — tous les salons restent visibles'));
  check('case « Donner le rôle aux membres actuels »', chunk.includes('ver-grant-case') && chunk.includes('Donner le rôle vérifié à tous les membres actuels'));
  check('les 3 boutons ont disparu', !chunk.includes('ver-iso-on') && !chunk.includes('ver-iso-off') && !chunk.includes('ver-grant\''));
  check('isolate envoyé avec la sauvegarde (depuis le sélecteur)', chunk.includes("isolate: c1.querySelector('#ver-isolate-sel').value === 'on'"));


  console.log('— 10. Bump v293 —');
  const index = racine('public/index.html');
  check('index.html : ?v=294 référencé 7 fois', (index.match(/\?v=294/g) || []).length === 7,
    String((index.match(/\?v=294/g) || []).length));
  check('sw.js : cache « botdev-v294 »', racine('public/sw.js').includes("const CACHE = 'botdev-v294';"));

  console.log(`\n🎉 v293 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
