// v290 — ✅ Vérification humaine + Join Gate + filtre anti-bots.
// Vérifié : config, panneau (bouton « Je suis humain »), clic → rôle,
// refus (déjà vérifié / compte trop récent / module off / rôle manquant),
// Join Gate à l'arrivée (MP + kick), bots non approuvés expulsés,
// hooks botManager, routes, i18n fr+en, dashboard, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v290');
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

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = 'gV290';

  console.log('— 1. Config —');
  const d = ver.cfgOf('gNeuf');
  check('désactivée par défaut', d.enabled === false && d.gate_days === 0 && d.bot_filter === false);
  ver.saveCfg(G, { enabled: true, channel: 'ch1', role: 'r1', gate_days: 7, bot_filter: true, approved_bots: ['111222333444555666', 'pas-un-id', ''] });
  const c = ver.cfgOf(G);
  check('enregistrement complet relu correctement', c.enabled && c.channel === 'ch1' && c.role === 'r1' && c.gate_days === 7 && c.bot_filter === true);
  check('identifiants de bots invalides filtrés', c.approved_bots.length === 1 && c.approved_bots[0] === '111222333444555666');
  ver.saveCfg(G, { gate_days: 999 });
  check('âge farfelu → remis à 0 (désactivé)', ver.cfgOf(G).gate_days === 0);
  ver.saveCfg(G, { gate_days: 7 });

  console.log('— 2. Panneau de vérification —');
  const sent = [];
  const guild = {
    id: G, name: 'Test',
    channels: { cache: new Map([['ch1', { id: 'ch1', send: async (p) => sent.push(p) }]]) },
    roles: { cache: new Map([['r1', { id: 'r1', name: 'Membre' }]]) },
  };
  await ver.sendPanel(BOT.id, guild, 'ch1');
  const json = JSON.stringify(sent[0].components[0].toJSON());
  check('panneau envoyé dans le salon choisi', sent.length === 1);
  check('bouton « Je suis humain » avec customId hxver:', json.includes(`hxver:${BOT.id}:human`) && json.includes('Je suis humain'));
  let noChan = '';
  try { await ver.sendPanel(BOT.id, guild, 'inconnu'); } catch (e) { noChan = e.code; }
  check('salon introuvable → erreur NO_CHANNEL (rien d envoyé)', noChan === 'NO_CHANNEL' && sent.length === 1);

  console.log('— 3. Clic sur le bouton —');
  const mkItx = (over = {}) => {
    const replies = []; const added = [];
    return {
      replies, added,
      itx: {
        customId: over.customId || `hxver:${BOT.id}:human`,
        guild: over.guild === undefined ? guild : over.guild,
        member: over.member === undefined ? { roles: { cache: new Map(over.hasRole ? [['r1', { id: 'r1' }]] : []), add: async (r) => added.push(r) } } : over.member,
        user: { id: 'u1', tag: 'Alice', createdAt: over.createdAt || new Date(Date.now() - 400 * 86400000) },
        reply: async (o) => replies.push(o),
      },
    };
  };
  let t = mkItx();
  const handled = await ver.handleButton(BOT.id, t.itx);
  check('clic → rôle vérifié donné + confirmation éphémère', handled === true && t.added.includes('r1') && t.replies[0].ephemeral === true && t.replies[0].content.includes('vérifié'));
  t = mkItx({ hasRole: true });
  await ver.handleButton(BOT.id, t.itx);
  check('déjà vérifié → message dédié, rôle non redonné', t.added.length === 0 && t.replies[0].content.includes('déjà vérifié'));
  t = mkItx({ createdAt: new Date() });
  await ver.handleButton(BOT.id, t.itx);
  check('compte créé aujourd hui + Join Gate 7 j → refus', t.added.length === 0 && t.replies[0].content.includes('trop récent'));
  t = mkItx({ customId: 'autre:bidule' });
  check('autre bouton → ignoré (return false)', (await ver.handleButton(BOT.id, t.itx)) === false);
  t = mkItx({ guild: { ...guild, roles: { cache: new Map() } } });
  await ver.handleButton(BOT.id, t.itx);
  check('rôle mal configuré → prévient l utilisateur', t.added.length === 0 && t.replies[0].content.includes('introuvable'));
  ver.saveCfg(G, { enabled: false });
  t = mkItx();
  await ver.handleButton(BOT.id, t.itx);
  check('module désactivé → pas de rôle + message', t.added.length === 0 && t.replies[0].content.includes('pas activée'));
  ver.saveCfg(G, { enabled: true });

  console.log('— 4. Join Gate & filtre anti-bots à l arrivée —');
  const kicks = []; const dms = [];
  const mkMember = (over = {}) => ({
    guild, id: over.id || 'x1',
    user: { bot: !!over.bot, tag: over.bot ? 'EvilBot' : 'Bob', createdAt: over.createdAt || new Date(Date.now() - 400 * 86400000), send: async () => dms.push(1) },
    kick: async (reason) => kicks.push(reason || 'kick'),
  });
  await ver.onJoin(BOT.id, mkMember({ bot: true, id: '999888777666555444' }));
  check('bot non approuvé + filtre activé → expulsé', kicks.length === 1 && kicks[0].includes('anti-bots'));
  kicks.length = 0;
  await ver.onJoin(BOT.id, mkMember({ bot: true, id: '111222333444555666' }));
  check('bot approuvé → accepté', kicks.length === 0);
  await ver.onJoin(BOT.id, mkMember({ createdAt: new Date() }));
  check('humain avec compte du jour + Join Gate 7 j → MP d explication + refus', kicks.length === 1 && kicks[0].includes('Join Gate') && dms.length === 1);
  kicks.length = 0; dms.length = 0;
  await ver.onJoin(BOT.id, mkMember({}));
  check('humain avec compte ancien → accepté sans rien', kicks.length === 0 && dms.length === 0);
  ver.saveCfg(G, { enabled: false });
  await ver.onJoin(BOT.id, mkMember({ createdAt: new Date() }));
  check('module désactivé → Join Gate inactif', kicks.length === 0);
  ver.saveCfg(G, { enabled: true });

  console.log('— 5. Branchements, i18n, routes, dashboard —');
  const bm = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'botManager.js'), 'utf8');
  check('bouton hxver routé dans interactionCreate', bm.includes("startsWith('hxver:')") && bm.includes("require('./verification').handleButton"));
  check('onJoin branché sur guildMemberAdd', bm.includes("require('./verification').onJoin(botId, member)"));
  const i18n = fs.readFileSync(path.join(__dirname, '..', 'server', 'i18n.js'), 'utf8');
  check('textes fr + en (2 jeux de clés)', (i18n.match(/verif_panel_title/g) || []).length === 2 && (i18n.match(/verif_kick_dm/g) || []).length === 2);
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('routes PUT verification + POST panel + payload dashboard', routes.includes("guildId/verification'") && routes.includes('verification/panel') && routes.includes("verification: require('./discord/verification').cfgOf(guildId)"));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('module ✅ Vérification dans la navigation', dash.includes("['verification', '✅', 'Vérification']"));
  check('renderer verification + champs du formulaire', dash.includes('Dashboard.renderers.verification =') && dash.includes('id="ver-gate"') && dash.includes('id="ver-botfilter"') && dash.includes('id="ver-send"'));

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=294 référencé 7 fois', (index.match(/\?v=294/g) || []).length === 7);
  check('sw.js : cache « botdev-v294 »', sw.includes("const CACHE = 'botdev-v294';"));

  console.log(`\n🎉 v290 — ${ok} vérifications OK : vérification humaine + Join Gate opérationnels.`);
})().catch((e) => { console.error(e); process.exit(1); });
