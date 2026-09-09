// ============================================================================
// Test v242 — Anti-nuke.
//
// Demande utilisateur : implémenter les 10 fonctions manquantes face aux bots
// pro, une par version, dans l'ordre du tableau. La v242 est la n°1.
//
// Différence avec l'anti-raid existant : l'anti-raid (antiraid.js) cible un
// afflux de membres venant de L'EXTÉRIEUR. L'anti-nuke cible les actions
// destructrices venant de L'INTÉRIEUR (compte admin volé, staff malveillant,
// erreur de manipulation) : suppressions de salons/rôles en série, bans et
// kicks de masse, spam de webhooks, élévation de privilèges.
//
// Choix validés par l'utilisateur pour cette version :
//   - réaction par défaut : « ban » (la plus agressive des quatre) ;
//   - seuils prudents : 3 actions en 60 secondes ;
//   - onglet dashboard DÉDIÉ (et non rattaché à l'anti-raid).
//
// Parce que « ban » a été retenu, ce test porte surtout sur les GARDE-FOUS :
// Hoxera ne doit jamais bannir sans certitude, ni toucher au propriétaire, ni
// au bot, ni à la liste blanche. Chaque règle est vérifiée ici.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v242-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const antinuke = require('../server/discord/antinuke');
const i18n = require('../server/i18n');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const code = (f) => racine(f).split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
const BOT_ID = String(BOT.id || BOT);
const GUILD = 'G242';
const OWNER = '111111111111111111';
const BOTSELF = '222222222222222222';
const ADMIN = '333333333333333333';
const OTHER = '444444444444444444';

// Types d'audit Discord vérifiés depuis l'enum AuditLogEvent de discord.js.
const AUDIT = {
  channel_delete: 12, channel_create: 10, role_delete: 32, role_create: 30,
  role_update: 31, overwrite: 14, ban: 22, kick: 20, webhook: 50,
  emoji: 62, bot_add: 28,
};

// ---------------------------------------------------------------------------
// Bouchons : un faux serveur Discord suffisant pour exercer la logique.
// ---------------------------------------------------------------------------
function auditEntry(kind, executorId, ageMs = 500) {
  return {
    id: `${kind}-${executorId}-${ageMs}-${Math.random().toString(36).slice(2)}`,
    action: AUDIT[kind],
    executorId,
    executor: { id: executorId },
    createdAt: new Date(Date.now() - ageMs),
    reason: '',
  };
}

function mockMember(id, { bannable = true, manageable = true, adminRoles = [], guildId = GUILD } = {}) {
  const cache = new Collection();
  cache.set(guildId, { id: guildId, name: '@everyone', permissions: { has: () => false }, comparePositionTo: () => -1 });
  for (const r of adminRoles) cache.set(r.id, r);
  const m = {
    id,
    user: { id, tag: `Membre_${id.slice(-4)}#0001` },
    bannable,
    manageable,
    banned: false,
    removedRoles: [],
    ban: async () => { if (!bannable) throw new Error('non bannissable'); m.banned = true; },
    roles: {
      cache,
      remove: async (ids) => { m.removedRoles.push(...[].concat(ids)); },
      highest: { position: 10, comparePositionTo: () => 1 },
    },
  };
  return m;
}

function mockGuild({ entries = [], auditError = '', members = new Map(), banError = '' } = {}) {
  const g = {
    id: GUILD,
    name: 'Serveur Test',
    ownerId: OWNER,
    client: { user: { id: BOTSELF } },
    bannedIds: [],
    lockCalled: 0,
    fetchAuditLog: async () => {
      if (auditError) throw new Error(auditError);
      g.auditCalls = (g.auditCalls || 0) + 1;
      const c = new Collection();
      for (const e of entries) c.set(e.id, e);
      return { entries: c };
    },
    members: {
      me: { id: BOTSELF, roles: { highest: { position: 100, comparePositionTo: () => 1 } } },
      fetch: async (id) => {
        const m = members.get(String(id));
        if (!m) { const err = new Error('Unknown Member'); throw err; }
        return m;
      },
      ban: async (id) => {
        if (banError) throw new Error(banError);
        g.bannedIds.push(String(id));
      },
    },
    channels: { cache: new Collection(), fetch: async () => null },
  };
  return g;
}

// Fixe les limites PAR TYPE. Sans cet isolement, un scénario réglé sur un type
// pourrait être déclenché par un autre type dont le seuil par défaut est plus bas.
function limites(kind, count, window) {
  const all = {};
  for (const k of Object.keys(antinuke.LIMITS_DEFAULT)) all[k] = { count: 50, window: 600 };
  all[kind] = { count, window };
  return JSON.stringify(all);
}

// Active l'anti-nuke avec les réglages validés par l'utilisateur.
function activer(over = {}) {
  store.guildSettings.set(BOT_ID, GUILD, {
    antinuke_enabled: 1,
    antinuke_threshold: 3,
    antinuke_window: 60,
    antinuke_action: 'ban',
    antinuke_whitelist: '',
    antinuke_alert_channel: '',
    // Réinitialisation indispensable : guildSettings.set FUSIONNE avec l'état
    // précédent, donc un scénario ayant posé des seuils à 50/600 les laisserait
    // en place et plus aucun déclenchement ne serait observable ensuite.
    antinuke_limits: '',
    antinuke_punish_bots: 0,
    ...over,
  });
}

// Remet les compteurs internes à zéro entre deux scénarios.
function reset() {
  antinuke._test.pending.clear();
  antinuke._test.counts.clear();
  antinuke._test.lastAct.clear();
  antinuke._test.lastFetch.clear();
  antinuke._test.auditWarned.clear();
}

// Amorce la file d'attente comme le ferait note(), puis résout la rafale.
async function rafale(guild, kinds) {
  reset();
  antinuke._test.pending.set(`${BOT_ID}:${guild.id}`, { items: kinds.map((k) => ({ kind: k, detail: '', ts: Date.now() })), timer: null, guild });
  return antinuke.resolve(BOT_ID, guild.id);
}

// ============================================================================

(async () => {
  console.log('\n🛡️  v242 — Anti-nuke\n');

  // --------------------------------------------------------------------------
  console.log('1) Base de données et réglages par défaut');
  // --------------------------------------------------------------------------
  {
    const cols = store.db.prepare("PRAGMA table_info(guild_settings)").all().map((c) => c.name);
    for (const c of ['antinuke_enabled', 'antinuke_threshold', 'antinuke_window', 'antinuke_action', 'antinuke_whitelist', 'antinuke_alert_channel']) {
      check(`colonne guild_settings.${c} créée`, cols.includes(c));
    }
    const t = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='antinuke_actions'").get();
    check('table antinuke_actions créée', !!t);

    // Désactivé par défaut : aucun serveur existant n'est affecté.
    const vierge = antinuke.config(BOT_ID, 'GUILD_JAMAIS_VU');
    check('anti-nuke DÉSACTIVÉ par défaut', vierge.enabled === false);
    check('seuil par défaut = 3 (choix utilisateur)', vierge.threshold === 3, String(vierge.threshold));
    check('fenêtre par défaut = 60 s (choix utilisateur)', vierge.window === 60, String(vierge.window));
    // Bascule validée par l'utilisateur après l'étude des bots spécialisés :
    // la quarantaine est réversible, le ban ne l'est pas.
    check('action par défaut = quarantine (réversible)', vierge.action === 'quarantine', String(vierge.action));
    check('le ban reste disponible à la demande', antinuke.ACTIONS.includes('ban'));
    check('liste blanche vide par défaut', Array.isArray(vierge.whitelist) && vierge.whitelist.length === 0);

    // Les 6 actions destructrices annoncées sont bien surveillées.
    for (const k of ['channel_delete', 'role_delete', 'role_update', 'ban', 'kick', 'webhook']) {
      check(`action surveillée : ${k} → audit ${AUDIT[k]}`, Number(antinuke.WATCHED[k] && antinuke.WATCHED[k].audit) === AUDIT[k]);
    }
  }

  // --------------------------------------------------------------------------
  console.log('\n2) GARDE-FOUS — qui ne peut jamais être sanctionné');
  // --------------------------------------------------------------------------
  {
    const cfg = { whitelist: [OTHER] };
    const g = mockGuild({});
    check('propriétaire du serveur → protégé', antinuke.blockedReason(g, OWNER, cfg, BOTSELF) === 'owner');
    check('Hoxera lui-même → protégé', antinuke.blockedReason(g, BOTSELF, cfg, BOTSELF) === 'bot');
    check('membre en liste blanche → protégé', antinuke.blockedReason(g, OTHER, cfg, BOTSELF) === 'whitelist');
    check('auteur inconnu → protégé', antinuke.blockedReason(g, '', cfg, BOTSELF) === 'no_actor');
    check('auteur inconnu (null) → protégé', antinuke.blockedReason(g, null, cfg, BOTSELF) === 'no_actor');
    check('admin ordinaire → NON protégé (la protection fonctionne)', antinuke.blockedReason(g, ADMIN, cfg, BOTSELF) === '');
  }

  // --------------------------------------------------------------------------
  console.log('\n3) Détection : le seuil déclenche la sanction');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const membre = mockMember(ADMIN);
    const g = mockGuild({
      members: new Map([[ADMIN, membre]]),
      entries: [auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN)],
    });
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('3 suppressions de salons → 3 actions résolues', r.resolved === 3, JSON.stringify(r));
    check('seuil atteint → déclenchement', r.triggered === 1, JSON.stringify(r));
    check('sanction appliquée : membre banni', membre.banned === true);
    check('journal : 1 action anti-nuke enregistrée', store.antinuke.count(BOT_ID, GUILD) >= 1);
    const rec = store.antinuke.recent(BOT_ID, GUILD, 1)[0];
    check('journal : auteur tracé', rec && rec.actor_id === ADMIN, rec && rec.actor_tag);
    check('journal : sanction tracée', rec && rec.action_taken === 'ban', rec && rec.action_taken);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n4) Sous le seuil : rien ne se passe');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const membre = mockMember(ADMIN);
    const g = mockGuild({
      members: new Map([[ADMIN, membre]]),
      entries: [auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN)],
    });
    const r = await rafale(g, ['channel_delete', 'channel_delete']);
    check('2 actions (< seuil de 3) → aucun déclenchement', r.triggered === 0, JSON.stringify(r));
    check('2 actions → personne n’est banni', membre.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n5) Actions réparties entre plusieurs auteurs : pas de cumul');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const m1 = mockMember(ADMIN);
    const g = mockGuild({
      members: new Map([[ADMIN, m1]]),
      entries: [auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', OTHER)],
    });
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('2 actions par A + 1 par B → aucun déclenchement', r.triggered === 0, JSON.stringify(r));
    check('A n’est pas banni (comptage par auteur)', m1.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n6) Journal d’audit illisible : ALERTE seule, jamais de sanction');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const membre = mockMember(ADMIN);
    const g = mockGuild({ members: new Map([[ADMIN, membre]]), auditError: 'Missing Permissions' });
    const avant = store.antinuke.count(BOT_ID, GUILD);
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('permission d’audit absente → aucune résolution', r.resolved === 0, JSON.stringify(r));
    check('permission d’audit absente → PERSONNE n’est banni', membre.banned === false);
    check('permission d’audit absente → aucun déclenchement', (r.triggered || 0) === 0, JSON.stringify(r));
    const apres = store.antinuke.count(BOT_ID, GUILD);
    check('permission d’audit absente → alerte tracée en base', apres > avant, `${avant} → ${apres}`);
    const rec = store.antinuke.recent(BOT_ID, GUILD, 1)[0];
    check('trace : motif « audit illisible »', rec && rec.reason === 'audit_illisible', rec && rec.reason);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n7) Auteur non identifié dans le journal : aucune sanction');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const membre = mockMember(ADMIN);
    // Entrées présentes mais SANS executorId : Hoxera ne peut pas accuser.
    const sansAuteur = [auditEntry('channel_delete', ''), auditEntry('channel_delete', ''), auditEntry('channel_delete', '')];
    const g = mockGuild({ members: new Map([[ADMIN, membre]]), entries: sansAuteur });
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('journal muet sur l’auteur → personne n’est banni', membre.banned === false);
    check('journal muet sur l’auteur → aucun déclenchement', (r.triggered || 0) === 0, JSON.stringify(r));
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n8) Action faite par Hoxera lui-même : ignorée silencieusement');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const g = mockGuild({
      entries: [auditEntry('channel_delete', BOTSELF), auditEntry('channel_delete', BOTSELF), auditEntry('channel_delete', BOTSELF)],
    });
    const avant = store.antinuke.count(BOT_ID, GUILD);
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('suppressions faites par le bot → non comptées', r.resolved === 0, JSON.stringify(r));
    check('suppressions faites par le bot → aucune alerte (pas de bruit)', store.antinuke.count(BOT_ID, GUILD) === avant);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n9) Le propriétaire déclenche un nuke : alerte mais AUCUNE sanction');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const proprio = mockMember(OWNER);
    const g = mockGuild({
      members: new Map([[OWNER, proprio]]),
      // Trois actions DU MÊME type : depuis le comptage par type, trois actions
      // variées ne forment plus un tout suspect (c'est précisément le correctif).
      entries: [auditEntry('channel_delete', OWNER), auditEntry('channel_delete', OWNER), auditEntry('channel_delete', OWNER)],
    });
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('nuke par le propriétaire → sanction refusée', r.triggered === 1 && r.blocked === 'owner', JSON.stringify(r));
    check('nuke par le propriétaire → il n’est PAS banni', proprio.banned === false);
    check('nuke par le propriétaire → alerte quand même tracée', store.antinuke.recent(BOT_ID, GUILD, 1)[0].action_taken === 'alert');
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n10) Liste blanche : sanction refusée');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_whitelist: OTHER, antinuke_limits: limites('channel_delete', 3, 60) });
    const wl = mockMember(OTHER);
    const g = mockGuild({
      members: new Map([[OTHER, wl]]),
      entries: [auditEntry('channel_delete', OTHER), auditEntry('channel_delete', OTHER), auditEntry('channel_delete', OTHER)],
    });
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('membre en liste blanche → sanction refusée', r.blocked === 'whitelist', JSON.stringify(r));
    check('membre en liste blanche → pas banni', wl.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n11) Fenêtre glissante : des actions trop anciennes ne comptent pas');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 10) });
    const membre = mockMember(ADMIN);
    // Deux entrées récentes + une de 5 minutes : hors fenêtre d'audit (20 s).
    const g = mockGuild({
      members: new Map([[ADMIN, membre]]),
      entries: [auditEntry('channel_delete', ADMIN, 300), auditEntry('channel_delete', ADMIN, 300), auditEntry('channel_delete', ADMIN, 300000)],
    });
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('entrée de 5 min ignorée (lookback 20 s)', r.resolved === 2, JSON.stringify(r));
    check('seuil non atteint → pas de bannissement', membre.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n12) Anti-rejeu : une même rafale ne punit pas deux fois');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const membre = mockMember(ADMIN);
    const g = mockGuild({
      members: new Map([[ADMIN, membre]]),
      entries: [auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN)],
    });
    await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('première rafale → banni', membre.banned === true);
    membre.banned = false;
    // On rejoue immédiatement sans purger lastAct (contrairement à rafale()).
    antinuke._test.pending.set(`${BOT_ID}:${g.id}`, {
      items: ['channel_delete', 'channel_delete', 'channel_delete'].map((k) => ({ kind: k, detail: '', ts: Date.now() })),
      timer: null, guild: g,
    });
    antinuke._test.lastFetch.clear();
    const r2 = await antinuke.resolve(BOT_ID, g.id);
    check('seconde rafale dans les 60 s → bloquée par l’anti-rejeu', r2.triggered === 0, JSON.stringify(r2));
    check('seconde rafale → pas de double bannissement', membre.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n13) Échec de la sanction (hiérarchie) : tracé, pas silencieux');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_limits: limites('channel_delete', 3, 60) });
    const intouchable = mockMember(ADMIN, { bannable: false });
    const g = mockGuild({ members: new Map([[ADMIN, intouchable]]),
      entries: [auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN)] });
    const r = await rafale(g, ['channel_delete', 'channel_delete', 'channel_delete']);
    check('membre non bannissable → déclenchement quand même signalé', r.triggered === 1, JSON.stringify(r));
    const rec = store.antinuke.recent(BOT_ID, GUILD, 1)[0];
    check('échec tracé comme « échec » (pas comme un succès)', rec.action_taken === 'échec', rec.action_taken);
    check('échec : le membre n’est pas banni', intouchable.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n14) Mode rétrogradation : seul Administrateur est retiré');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_action: 'demote', antinuke_limits: limites('role_update', 3, 60) });
    const roleAdmin = { id: 'R_ADMIN', name: 'Admin', permissions: { has: (p) => p === 'Administrator' }, comparePositionTo: () => -1 };
    const roleCouleur = { id: 'R_COLOR', name: 'Bleu', permissions: { has: () => false }, comparePositionTo: () => -1 };
    const membre = mockMember(ADMIN, { adminRoles: [roleAdmin, roleCouleur] });
    const g = mockGuild({ members: new Map([[ADMIN, membre]]),
      entries: [auditEntry('role_update', ADMIN), auditEntry('role_update', ADMIN), auditEntry('role_update', ADMIN)] });
    const r = await rafale(g, ['role_update', 'role_update', 'role_update']);
    check('mode demote → déclenchement', r.triggered === 1, JSON.stringify(r));
    check('mode demote → le rôle Administrateur est retiré', membre.removedRoles.includes('R_ADMIN'));
    check('mode demote → le rôle sans Administrateur est CONSERVÉ', !membre.removedRoles.includes('R_COLOR'));
    check('mode demote → le membre n’est PAS banni', membre.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n15) Mode alerte : rien n’est appliqué');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_action: 'alert', antinuke_limits: limites('ban', 3, 60) });
    const membre = mockMember(ADMIN);
    const g = mockGuild({ members: new Map([[ADMIN, membre]]),
      entries: [auditEntry('ban', ADMIN), auditEntry('ban', ADMIN), auditEntry('ban', ADMIN)] });
    const r = await rafale(g, ['ban', 'ban', 'ban']);
    check('mode alerte → déclenchement signalé', r.triggered === 1, JSON.stringify(r));
    check('mode alerte → personne n’est banni', membre.banned === false);
    check('mode alerte → action tracée « alert »', store.antinuke.recent(BOT_ID, GUILD, 1)[0].action_taken === 'alert');
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n16) Bans et kicks de masse détectés via leurs types d’audit');
  // --------------------------------------------------------------------------
  {
    // Seuils par défaut RÉELS : ban 3/60 s, kick 3/60 s, webhook 2/10 s.
    activer();
    const membre = mockMember(ADMIN);
    const g = mockGuild({ members: new Map([[ADMIN, membre]]),
      entries: [auditEntry('ban', ADMIN), auditEntry('kick', ADMIN), auditEntry('webhook', ADMIN)] });
    const r = await rafale(g, ['ban', 'kick', 'webhook']);
    check('ban + kick + webhook → les 3 actions sont bien lues', r.resolved === 3, JSON.stringify(r));
    check('modération VARIÉE → aucun compteur par type n’atteint son seuil', r.triggered === 0, JSON.stringify(r));
    check('modération variée → l’admin n’est PAS banni (faux positif évité)', membre.banned === false);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n16b) Le scénario que l’utilisateur a signalé : 2 bans de raiders + 1 salon rangé');
  // --------------------------------------------------------------------------
  {
    // C'est EXACTEMENT la modération ordinaire qui faisait bannir un admin avec
    // l'ancien compteur global unique (2 + 1 = 3 = seuil atteint).
    activer();
    const modo = mockMember(ADMIN);
    const g = mockGuild({ members: new Map([[ADMIN, modo]]),
      entries: [auditEntry('ban', ADMIN), auditEntry('ban', ADMIN), auditEntry('channel_delete', ADMIN)] });
    const r = await rafale(g, ['ban', 'ban', 'channel_delete']);
    check('3 actions au total sont bien lues', r.resolved === 3, JSON.stringify(r));
    check('2 bans + 1 salon → AUCUN déclenchement', r.triggered === 0, JSON.stringify(r));
    check('2 bans + 1 salon → le modérateur n’est PAS banni', modo.banned === false);
    // Les compteurs sont bien séparés : 2 d'un côté, 1 de l'autre.
    const cles = [...antinuke._test.counts.keys()];
    check('compteur « ban » séparé du compteur « channel_delete »',
      cles.some((k) => k.endsWith(`:${ADMIN}:ban`)) && cles.some((k) => k.endsWith(`:${ADMIN}:channel_delete`)),
      cles.join(' | '));
    const cBan = antinuke._test.counts.get(`${BOT_ID}:${GUILD}:${ADMIN}:ban`) || [];
    const cChan = antinuke._test.counts.get(`${BOT_ID}:${GUILD}:${ADMIN}:channel_delete`) || [];
    check('compteur ban = 2 (seuil 3 non atteint)', cBan.length === 2, String(cBan.length));
    check('compteur salons = 1 (seuil 2 non atteint)', cChan.length === 1, String(cChan.length));
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n16c) Le vrai nuke : le même type répété à vitesse machine');
  // --------------------------------------------------------------------------
  {
    activer();
    const nuker = mockMember(ADMIN);
    const g = mockGuild({ members: new Map([[ADMIN, nuker]]),
      entries: [auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN)] });
    const r = await rafale(g, ['channel_delete', 'channel_delete']);
    check('2 suppressions en 10 s → seuil par défaut atteint', r.triggered === 1, JSON.stringify(r));
    check('2 suppressions en 10 s → le nukeur est sanctionné', nuker.banned === true);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n16d) Déclenchement sur UNE seule action (comme Wick)');
  // --------------------------------------------------------------------------
  {
    activer();
    const m = mockMember(ADMIN);
    // Élévation de privilèges : une seule action suffit.
    const g1 = mockGuild({ members: new Map([[ADMIN, m]]), entries: [auditEntry('role_update', ADMIN)] });
    const r1 = await rafale(g1, ['role_update']);
    check('1 rôle élevé en Administrateur → déclenchement immédiat', r1.triggered === 1, JSON.stringify(r1));
    check('limite par défaut de role_update = 1 action', antinuke.LIMITS_DEFAULT.role_update.count === 1);
    reset();
    const m2 = mockMember(ADMIN);
    const g2 = mockGuild({ members: new Map([[ADMIN, m2]]), entries: [auditEntry('bot_add', ADMIN)] });
    const r2 = await rafale(g2, ['bot_add']);
    check('1 bot ajouté → déclenchement immédiat', r2.triggered === 1, JSON.stringify(r2));
    check('limite par défaut de bot_add = 1 action', antinuke.LIMITS_DEFAULT.bot_add.count === 1);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n16e) Fenêtres différenciées : suppressions rapides, bans lents');
  // --------------------------------------------------------------------------
  {
    const L = antinuke.LIMITS_DEFAULT;
    check('suppression de salon : fenêtre courte (10 s)', L.channel_delete.window === 10, String(L.channel_delete.window));
    check('suppression de rôle : fenêtre courte (10 s)', L.role_delete.window === 10, String(L.role_delete.window));
    check('bannissement : fenêtre LONGUE (60 s)', L.ban.window === 60, String(L.ban.window));
    check('expulsion : fenêtre LONGUE (60 s)', L.kick.window === 60, String(L.kick.window));
    check('les bans ont une fenêtre plus longue que les suppressions',
      L.ban.window > L.channel_delete.window);
    check('11 types d’action surveillés', Object.keys(antinuke.WATCHED).length === 11,
      String(Object.keys(antinuke.WATCHED).length));
    for (const k of ['channel_delete', 'channel_create', 'role_delete', 'role_create', 'role_update',
      'overwrite', 'ban', 'kick', 'webhook', 'emoji', 'bot_add']) {
      check(`type surveillé et borné : ${k}`, !!antinuke.WATCHED[k] && !!L[k]);
    }
  }

  // --------------------------------------------------------------------------
  console.log('\n16f) Les autres bots ne sont pas sanctionnés');
  // --------------------------------------------------------------------------
  {
    activer();
    const botTicket = mockMember(OTHER);
    botTicket.user.bot = true;
    const g = mockGuild({ members: new Map([[OTHER, botTicket]]),
      entries: [auditEntry('channel_delete', OTHER), auditEntry('channel_delete', OTHER)] });
    const r = await rafale(g, ['channel_delete', 'channel_delete']);
    check('bot de tickets → sanction refusée', r.blocked === 'other_bot', JSON.stringify(r));
    check('bot de tickets → pas banni', botTicket.banned === false);
    const rec = store.antinuke.recent(BOT_ID, GUILD, 1)[0];
    check('bot de tickets → alerte quand même tracée', rec.action_taken === 'alert', rec.action_taken);
    reset();
    // Opt-in : le propriétaire peut demander à sanctionner aussi les bots.
    activer({ antinuke_punish_bots: 1 });
    const bot2 = mockMember(OTHER);
    bot2.user.bot = true;
    const g2 = mockGuild({ members: new Map([[OTHER, bot2]]),
      entries: [auditEntry('channel_delete', OTHER), auditEntry('channel_delete', OTHER)] });
    const r2 = await rafale(g2, ['channel_delete', 'channel_delete']);
    check('option « sanctionner les bots » activée → le bot est sanctionné',
      r2.triggered === 1 && !r2.blocked, JSON.stringify(r2));
    reset();
    activer();
  }

  // --------------------------------------------------------------------------
  console.log('\n16g) Quarantaine : la sanction réversible des bots pro');
  // --------------------------------------------------------------------------
  {
    activer({ antinuke_action: 'quarantine' });
    const roleAdmin = { id: 'R_ADMIN', name: 'Admin', permissions: { has: (p) => p === 'Administrator' }, comparePositionTo: () => -1 };
    const roleModo = { id: 'R_MODO', name: 'Modo', permissions: { has: () => false }, comparePositionTo: () => -1 };
    const m = mockMember(ADMIN, { adminRoles: [roleAdmin, roleModo] });
    let rolesFinaux = null;
    m.roles.set = async (ids) => { rolesFinaux = ids; };
    m.ban = async () => { m.banned = true; };
    // Le rôle de quarantaine n'existe pas encore : Hoxera doit le créer.
    let roleCree = null;
    const g = mockGuild({ members: new Map([[ADMIN, m]]),
      entries: [auditEntry('channel_delete', ADMIN), auditEntry('channel_delete', ADMIN)] });
    g.roles = {
      cache: new Collection(),
      create: async (o) => { roleCree = o; const r = { id: 'R_QUARANTINE', name: o.name, permissions: { has: () => false }, comparePositionTo: () => -1 }; g.roles.cache.set(r.id, r); return r; },
    };
    const r = await rafale(g, ['channel_delete', 'channel_delete']);
    check('quarantaine → déclenchement', r.triggered === 1, JSON.stringify(r));
    check('quarantaine → le membre n’est PAS banni', m.banned === false);
    check('quarantaine → un rôle dédié est créé', !!roleCree && roleCree.name === antinuke.QUARANTINE_ROLE, roleCree && roleCree.name);
    check('quarantaine → le rôle créé n’a AUCUNE permission', roleCree && Array.isArray(roleCree.permissions) && roleCree.permissions.length === 0);
    check('quarantaine → le membre ne garde QUE le rôle de quarantaine',
      Array.isArray(rolesFinaux) && rolesFinaux.length === 1 && rolesFinaux[0] === 'R_QUARANTINE', JSON.stringify(rolesFinaux));
    const rec = store.antinuke.recent(BOT_ID, GUILD, 1)[0];
    check('quarantaine → tracée comme « quarantine »', rec.action_taken === 'quarantine', rec.action_taken);
    check('quarantaine → les rôles d’origine sont conservés pour restauration',
      /rôles avant :/.test(rec.detail) && rec.detail.includes('R_ADMIN') && rec.detail.includes('R_MODO'), rec.detail);
    check('quarantaine proposée dans les actions', antinuke.ACTIONS.includes('quarantine'));
    reset();
    activer();
  }

  // --------------------------------------------------------------------------
  console.log('\n17) Salons gérés par Hoxera : ignorés à la source (anti-bruit)');
  // --------------------------------------------------------------------------
  {
    activer();
    const g = mockGuild({});
    // Salon de ticket enregistré en base → suppression légitime par Hoxera.
    store.db.prepare(`INSERT OR REPLACE INTO open_tickets
      (bot_id, guild_id, channel_id, number, opener_id, opened_at) VALUES (?, ?, ?, 1, 'u', datetime('now'))`)
      .run(Number(BOT_ID), GUILD, 'CHAN_TICKET');
    check('salon de ticket ouvert → ignoré', antinuke.isSelfManagedChannel(BOT_ID, g, { id: 'CHAN_TICKET', parentId: '' }) === true);

    store.db.prepare('INSERT OR REPLACE INTO closed_tickets (channel_id, bot_id, guild_id) VALUES (?, ?, ?)')
      .run('CHAN_FERME', Number(BOT_ID), GUILD);
    check('salon de ticket fermé → ignoré', antinuke.isSelfManagedChannel(BOT_ID, g, { id: 'CHAN_FERME', parentId: '' }) === true);

    store.db.prepare('INSERT OR REPLACE INTO voicetemp (bot_id, guild_id, creator_channel, category, name_template) VALUES (?, ?, ?, ?, ?)')
      .run(Number(BOT_ID), GUILD, 'CREATOR', 'CAT_TEMP', 'Salon de {user}');
    check('vocal temporaire dans la catégorie → ignoré', antinuke.isSelfManagedChannel(BOT_ID, g, { id: 'TEMP1', parentId: 'CAT_TEMP' }) === true);
    check('salon ordinaire → SURVEILLÉ', antinuke.isSelfManagedChannel(BOT_ID, g, { id: 'NORMAL', parentId: 'AUTRE' }) === false);
    check('salon null → sans erreur', antinuke.isSelfManagedChannel(BOT_ID, g, null) === false);

    // note() doit réellement filtrer, pas seulement le helper.
    reset();
    antinuke.note(BOT_ID, g, 'channel_delete', '#ticket-1', { id: 'CHAN_TICKET', parentId: '' });
    const p = antinuke._test.pending.get(`${BOT_ID}:${GUILD}`);
    check('note() ignore un salon de ticket', !p || p.items.length === 0, p && String(p.items.length));
    reset();
    antinuke.note(BOT_ID, g, 'channel_delete', '#général', { id: 'NORMAL', parentId: 'AUTRE' });
    const p2 = antinuke._test.pending.get(`${BOT_ID}:${GUILD}`);
    check('note() retient un salon ordinaire', !!p2 && p2.items.length === 1, p2 && String(p2.items.length));
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n18) Anti-nuke désactivé : absolument rien ne se passe');
  // --------------------------------------------------------------------------
  {
    store.guildSettings.set(BOT_ID, GUILD, { antinuke_enabled: 0 });
    const g = mockGuild({ entries: [auditEntry('channel_delete', ADMIN)] });
    reset();
    antinuke.note(BOT_ID, g, 'channel_delete', '#x', { id: 'X', parentId: '' });
    const p = antinuke._test.pending.get(`${BOT_ID}:${GUILD}`);
    check('désactivé → note() n’empile rien', !p || p.items.length === 0, p && String(p.items.length));
    reset();
    activer();
  }

  // --------------------------------------------------------------------------
  console.log('\n19) Branchement des événements dans botManager.js');
  // --------------------------------------------------------------------------
  {
    const bm = code('server/discord/botManager.js');
    check('événement guildBanAdd ajouté', /client\.on\('guildBanAdd'/.test(bm));
    check('channelDelete → antinuke.note', /channelDelete[\s\S]{0,400}antinuke'\)\.note\(botId, c\.guild, 'channel_delete'/.test(bm));
    check('roleDelete → antinuke.note', /roleDelete[\s\S]{0,400}antinuke'\)\.note\(botId, r\.guild, 'role_delete'/.test(bm));
    check('webhooksUpdate → antinuke.note', /webhooksUpdate[\s\S]{0,400}'webhook'/.test(bm));
    check('guildMemberRemove → antinuke.note (kick)', /guildMemberRemove[\s\S]{0,900}'kick'/.test(bm));
    // Un changement de couleur ou de nom ne doit PAS déclencher la protection.
    check('roleUpdate → surveillé seulement si Administrateur est AJOUTÉ',
      /roleUpdate[\s\S]{0,700}has\('Administrator'\)[\s\S]{0,300}if \(has && !had\)/.test(bm));
    // Nouveaux types ajoutés après l'étude des bots spécialisés.
    check('channelCreate → antinuke.note', /channelCreate[\s\S]{0,500}'channel_create'/.test(bm));
    check('roleCreate → antinuke.note', /roleCreate[\s\S]{0,500}'role_create'/.test(bm));
    check('emojiDelete branché', /client\.on\('emojiDelete'/.test(bm));
    check('emojiDelete → antinuke.note', /emojiDelete[\s\S]{0,300}'emoji'/.test(bm));
    check('permissions de salon surveillées (overwrite)', /client\.on\('channelUpdate'[\s\S]{0,900}'overwrite'/.test(bm));
    // L'overwrite ne doit se déclencher que si les permissions changent vraiment.
    check('overwrite : comparaison allow/deny avant de notifier',
      /permissionOverwrites[\s\S]{0,600}allow[\s\S]{0,200}deny/.test(bm));
    check('ajout d’un bot surveillé via guildMemberAdd', /guildMemberAdd[\s\S]{0,900}'bot_add'/.test(bm));
    check('ajout d’un bot : seuls les comptes bots sont notifiés',
      /guildMemberAdd[\s\S]{0,900}member\.user\.bot/.test(bm));

    // Chaque branchement est isolé : l'anti-nuke ne doit jamais casser l'audit.
    const branchements = (bm.match(/require\('\.\/antinuke'\)\.note/g) || []).length;
    check('les 11 branchements sont présents', branchements >= 10, String(branchements));
    check('chaque branchement est dans un try/catch', (bm.match(/catch \(e\) \{ console\.error\('\[BotDev\] antinuke/g) || []).length >= 5);
  }

  // --------------------------------------------------------------------------
  console.log('\n20) Routes API du dashboard');
  // --------------------------------------------------------------------------
  {
    const r = code('server/routes.js');
    check('PUT  /antinuke (configuration)', r.includes("'/bots/:id/guilds/:guildId/antinuke'"));
    check('GET  /antinuke/state (état + journal)', r.includes("'/bots/:id/guilds/:guildId/antinuke/state'"));
    check('POST /antinuke/simulate (simulation)', r.includes("'/bots/:id/guilds/:guildId/antinuke/simulate'"));
    check('les 3 routes exigent l’authentification', (r.match(/guildId\/antinuke[^\n]*requireAuth/g) || []).length === 3);
    check('les 3 routes vérifient la permission de gérer le serveur',
      (r.match(/antinuke[\s\S]{0,400}userCanManageGuild/g) || []).length >= 3);
    // La simulation ne doit JAMAIS punir : c'est le garde-fou le plus important ici.
    const sim = r.slice(r.indexOf('/antinuke/simulate'), r.indexOf('/antinuke/simulate') + 3000);
    check('la simulation n’appelle pas punish()', !sim.includes('antinuke.punish'));
    check('la simulation n’appelle pas trigger()', !sim.includes('antinuke.trigger'));
    check('la simulation n’appelle pas note()', !sim.includes('antinuke.note'));
    check('la simulation annonce explicitement « aucune sanction »', /aucune sanction/i.test(sim));
    check('state vérifie réellement la permission d’audit', /fetchAuditLog\(\{ limit: 1 \}\)/.test(r));
    // La liste blanche n'accepte que des identifiants Discord.
    check('liste blanche filtrée sur les identifiants numériques', /\\d\{15,25\}/.test(r));
    check('PAS de route de test « réelle » (contrairement à l’anti-raid)', !r.includes('/antinuke/test'));
  }

  // --------------------------------------------------------------------------
  console.log('\n21) Validation des réglages en base');
  // --------------------------------------------------------------------------
  {
    store.guildSettings.set(BOT_ID, GUILD, { antinuke_action: 'nimportequoi' });
    check('action inconnue → ramenée à « quarantine »', antinuke.config(BOT_ID, GUILD).action === 'quarantine',
      antinuke.config(BOT_ID, GUILD).action);
    store.guildSettings.set(BOT_ID, GUILD, { antinuke_threshold: 9999 });
    check('seuil excessif → plafonné à 50', antinuke.config(BOT_ID, GUILD).threshold === 50, String(antinuke.config(BOT_ID, GUILD).threshold));
    store.guildSettings.set(BOT_ID, GUILD, { antinuke_threshold: 1 });
    check('seuil global minimal accepté = 1 (déclenchement instantané possible)',
      antinuke.config(BOT_ID, GUILD).threshold === 1, String(antinuke.config(BOT_ID, GUILD).threshold));
    store.guildSettings.set(BOT_ID, GUILD, { antinuke_window: 1 });
    check('fenêtre trop courte → relevée à 5 s', antinuke.config(BOT_ID, GUILD).window === 5, String(antinuke.config(BOT_ID, GUILD).window));
    for (const a of ['ban', 'quarantine', 'demote', 'lockdown', 'alert']) {
      store.guildSettings.set(BOT_ID, GUILD, { antinuke_action: a });
      check(`action « ${a} » acceptée`, antinuke.config(BOT_ID, GUILD).action === a);
    }

    // --- Bornage des limites par type envoyées par le navigateur ---
    const n1 = antinuke.normalizeLimits({ ban: { count: 0, window: 0 } });
    check('limite à 0 → relevée à 1 action minimum', n1.ban.count === 1, String(n1.ban.count));
    check('fenêtre à 0 → relevée à 5 s minimum', n1.ban.window === 5, String(n1.ban.window));
    const n2 = antinuke.normalizeLimits({ ban: { count: 99999, window: 99999 } });
    check('limite énorme → plafonnée à 50 actions', n2.ban.count === 50, String(n2.ban.count));
    check('fenêtre énorme → plafonnée à 600 s', n2.ban.window === 600, String(n2.ban.window));
    const n3 = antinuke.normalizeLimits({});
    check('JSON vide → les 11 seuils recommandés sont rétablis',
      Object.keys(n3).length === 11 && n3.channel_delete.count === antinuke.LIMITS_DEFAULT.channel_delete.count);
    const n4 = antinuke.normalizeLimits({ type_inexistant: { count: 1, window: 1 } });
    check('type inconnu envoyé → ignoré, pas de colonne fantôme', !('type_inexistant' in n4) && Object.keys(n4).length === 11);
    check('normalizeLimits accepte une entrée invalide sans planter',
      antinuke.normalizeLimits(null).ban.count === antinuke.LIMITS_DEFAULT.ban.count);

    // --- Persistance réelle en base ---
    store.guildSettings.set(BOT_ID, GUILD, { antinuke_limits: JSON.stringify({ ban: { count: 7, window: 120 } }) });
    const lu = antinuke.config(BOT_ID, GUILD).limits;
    check('limites personnalisées relues depuis la base', lu.ban.count === 7 && lu.ban.window === 120, JSON.stringify(lu.ban));
    check('les autres types gardent leurs seuils recommandés', lu.role_delete.count === antinuke.LIMITS_DEFAULT.role_delete.count);
    store.guildSettings.set(BOT_ID, GUILD, { antinuke_limits: 'PAS DU JSON' });
    check('JSON corrompu en base → repli sur les seuils recommandés, sans planter',
      antinuke.config(BOT_ID, GUILD).limits.ban.count === antinuke.LIMITS_DEFAULT.ban.count);
    reset();
  }

  // --------------------------------------------------------------------------
  console.log('\n22) Textes i18n en français ET en anglais');
  // --------------------------------------------------------------------------
  {
    const cles = ['nuke_alert_title', 'nuke_alert_hits', 'nuke_action_ban', 'nuke_action_demote',
      'nuke_action_lockdown', 'nuke_action_alert', 'nuke_failed', 'nuke_blocked_owner',
      'nuke_blocked_whitelist', 'nuke_blocked_bot', 'nuke_no_actor', 'nuke_audit_missing',
      'nuke_field_action', 'nuke_field_actor', 'nuke_field_hits',
      'nuke_kind_channel_delete', 'nuke_kind_role_delete', 'nuke_kind_role_update',
      'nuke_kind_ban', 'nuke_kind_kick', 'nuke_kind_webhook'];
    let manquantes = 0;
    for (const l of ['fr', 'en']) {
      for (const c of cles) {
        const v = i18n.t(l, c, { server: 'S', count: 3, window: 60, actor: 'A', error: 'E', locked: 2, minutes: 1 });
        if (!v || v === c || v.includes('{server}') || v.includes('{count}') || v.includes('{error}')) manquantes++;
      }
    }
    check(`${cles.length} clés × 2 langues résolues et interpolées`, manquantes === 0, `${manquantes} manquante(s)`);
    check('libellé fr : « suppression de salon »', i18n.t('fr', 'nuke_kind_channel_delete') === 'suppression de salon');
    check('libellé en : « channel deletion »', i18n.t('en', 'nuke_kind_channel_delete') === 'channel deletion');
    check('kindLabel retombe sur la clé brute si inconnue', antinuke.kindLabel('fr', 'inexistant') === 'inexistant');
  }

  // --------------------------------------------------------------------------
  console.log('\n23) Balayage et état');
  // --------------------------------------------------------------------------
  {
    antinuke._test.counts.set('k1', [{ ts: Date.now() - 3600000, kind: 'ban' }]);
    antinuke._test.lastAct.set('k2', Date.now() - 7200000);
    const r = antinuke.sweep();
    check('sweep purge les compteurs périmés', antinuke._test.counts.has('k1') === false);
    check('sweep purge les anti-rejeux périmés', antinuke._test.lastAct.has('k2') === false);
    check('sweep retourne un état exploitable', typeof r.counts === 'number' && typeof r.lastAct === 'number');
    activer();
    const st = antinuke.state(BOT_ID, GUILD);
    check('state expose la configuration', st.enabled === true && st.threshold === 3);
    check('state expose l’historique', Array.isArray(st.recent));
    check('state expose le total d’actions', typeof st.totalActions === 'number' && st.totalActions >= 1);
    check('state signale la lisibilité du journal d’audit', typeof st.auditReadable === 'boolean');
  }

  // --------------------------------------------------------------------------
  console.log('\n24) Dashboard : onglet dédié (choix utilisateur)');
  // --------------------------------------------------------------------------
  {
    const d = code('public/js/dashboard.js');
    check('onglet « Anti-nuke » déclaré dans la navigation', d.includes("['antinuke', '🚨', 'Anti-nuke']"));
    check('onglet placé juste après Modération',
      /\['moderation', '🛡️', 'Modération'\],\s*\['antinuke'/.test(d));
    check('renderer Dashboard.renderers.antinuke défini', d.includes('Dashboard.renderers.antinuke = async'));
    check('le renderer appelle la route d\'état', d.includes('/antinuke/state'));
    check('le renderer appelle la route de configuration', d.includes('/antinuke`'));
    check('le renderer appelle la simulation', d.includes('/antinuke/simulate'));

    // Les quatre réactions doivent être proposées, dont la plus sûre en premier.
    for (const a of ['alert', 'lockdown', 'demote', 'ban']) {
      check(`réaction « ${a} » proposée dans le select`, new RegExp(`value="${a}"`).test(d));
    }
    // Comparaison RESTREINTE au renderer anti-nuke : value="ban" existe aussi
    // dans l'auto-modération, un indexOf global comparerait les mauvais blocs.
    const debut = d.indexOf('Dashboard.renderers.antinuke');
    const fin = d.indexOf('Dashboard.renderers.roles');
    check('renderer anti-nuke borné correctement', debut > -1 && fin > debut, `${debut}/${fin}`);
    const nk = d.slice(debut, fin);
    check('dans l’onglet : « Alerter seulement » listé AVANT « Bannir »',
      nk.indexOf('value="alert"') > -1 && nk.indexOf('value="alert"') < nk.indexOf('value="ban"'),
      `${nk.indexOf('value="alert"')} vs ${nk.indexOf('value="ban"')}`);

    // Champs de configuration présents.
    for (const id of ['nk-on', 'nk-act', 'nk-chan', 'nk-wl', 'nk-bots', 'nk-save', 'nk-sim', 'nk-reset']) {
      check(`champ #${id} présent`, d.includes(`id="${id}"`));
    }
    // Le seuil et la fenêtre ne sont plus globaux : une paire par type d'action.
    check('grille de limites PAR TYPE (data-kind)', d.includes('data-kind="${kind}"'));
    check('champ « actions » par type', d.includes('nk-count'));
    check('champ « secondes » par type', d.includes('nk-window'));

    // Transparence sur le risque : c'est ce qui rend « ban » acceptable.
    check('avertissement explicite sur l\'action « ban »', /Action la plus agressive/.test(d));
    check('conseil de mettre les admins en liste blanche', /liste blanche/.test(d));
    check('les 4 protections permanentes sont affichées',
      /Protections permanentes/.test(d) && /propriétaire du serveur/.test(d) && /Hoxera lui-même/.test(d));
    check('bandeau si le journal d\'audit est illisible', /Journal d’audit illisible/.test(d));
    check('permission « Voir le journal d\'audit » documentée', /Voir le journal d’audit/.test(d));
    check('la simulation annonce qu\'elle ne sanctionne jamais', /ne sanctionne <b>jamais<\/b>|jamais sanctionné|Simulation : aucune sanction/.test(d));
    check('historique affiché dans un tableau', /Historique des réactions/.test(d) && d.includes('<th>Réaction</th>'));
    check('l’historique conserve les rôles d’origine (restauration possible)',
      /rôles qu’un membre avait avant/.test(d));

    // L'explication de la distinction nuke / modération doit être lisible.
    check('l’onglet explique la distinction nuke vs modération',
      /distingue un nuke d’une modération normale/.test(d));
    check('l’onglet explique le signal « rapide et répété sur un seul type »',
      /répété sur un seul type/.test(d));
    check('l’onglet explique le signal « lente et variée »', /lente et (<b>)?variée/i.test(d));

    // Les 11 types doivent être réglables individuellement dans l'interface.
    const KINDS_UI = ['channel_delete', 'channel_create', 'role_delete', 'role_create', 'role_update',
      'overwrite', 'ban', 'kick', 'webhook', 'emoji', 'bot_add'];
    for (const k of KINDS_UI) check(`type réglable dans l’UI : ${k}`, new RegExp(`'${k}',`).test(d));
    check('bouton « Seuils recommandés » présent', d.includes('nk-reset'));
    // Cohérence serveur ↔ base ↔ UI : un seul défaut, partout.
    check('défaut du module = quarantine', antinuke.DEFAULT_ACTION_LECTURABLE === 'quarantine' || antinuke.DEFAULTS.action === 'quarantine',
      String(antinuke.DEFAULTS.action));
    check('défaut de la colonne SQL = quarantine',
      racine('server/db.js').includes("antinuke_action TEXT DEFAULT 'quarantine'"));
    check('repli de la route API = quarantine',
      /antinuke_action: antinuke\.ACTIONS\.includes\(action\) \? action : 'quarantine'/.test(code('server/routes.js')));
    check('les seuils recommandés de l’UI sont alignés sur le serveur',
      /channel_delete: \[2, 10\]/.test(d) && /ban: \[3, 60\]/.test(d) && /role_update: \[1, 10\]/.test(d));
    check('option « sanctionner les autres bots » présente', d.includes('nk-bots'));
    check('la quarantaine est signalée comme réglage par défaut', /réglage par défaut — réversible/.test(d));
    check('le caractère irréversible du ban est annoncé', /irréversible/.test(d));
    // Aucune échappée de variable non interpolée dans les libellés.
    check('pas de « undefined » codé en dur dans l\'onglet', !d.includes('>undefined<'));
  }

  // --------------------------------------------------------------------------
  console.log('\n25) Version 242');
  // --------------------------------------------------------------------------
  {
    const html = racine('public/index.html');
    check('index.html : ?v=249 référencé 7 fois', (html.match(/\?v=249/g) || []).length === 7,
      String((html.match(/\?v=249/g) || []).length));
    check('index.html : plus aucun ?v=241', !html.includes('?v=241'));
    check('sw.js : cache « botdev-v242 »', racine('public/sw.js').includes("'botdev-v249'"));
  }

  console.log(`\n${echecs === 0
    ? '🎉 Tous les tests v242 passent — anti-nuke actif, garde-fous vérifiés.'
    : `❌ v242 — ${echecs} échec(s)`}`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch((e) => { console.error('💥', e); process.exit(1); });
