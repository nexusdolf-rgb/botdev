// ============================================================
// Hoxera — Anti-nuke (v242)
// ------------------------------------------------------------
// L'anti-raid (antiraid.js) protège contre un afflux de membres
// venant de L'EXTÉRIEUR. L'anti-nuke protège contre des actions
// destructrices venant de L'INTÉRIEUR : compte administrateur
// volé, membre du staff qui se retourne, script de nuke, erreur
// de manipulation.
//
// ── COMMENT DISTINGUER UN NUKE D'UNE MODÉRATION ORDINAIRE ─────
// C'est le cœur du problème, et la première version de ce module
// se trompait : elle comptait TOUTES les actions dans un seul
// panier. Résultat, un administrateur qui bannit 2 raiders puis
// supprime 1 vieux salon atteignait le seuil de 3 et se faisait
// bannir. Faux positif garanti.
//
// Tous les bots spécialisés (Wick, Security Bot, Firewall,
// VaultCord) appliquent des limites PAR TYPE d'action, chacune
// avec son propre seuil ET sa propre fenêtre :
//   f.setchannelq  N  T   (Firewall)
//   f.setbanq      N  T
//   f.setroleq     N  T
//   f.setemojiq    N  T
// La distinction repose sur deux signaux opposés :
//   • un NUKE est rapide et répété sur UN seul type — les salons
//     partent par dizaines en quelques secondes (« en 2 s un
//     attaquant supprime 10 à 20 salons ») ;
//   • la MODÉRATION humaine est lente et variée — on bannit un
//     raideur, on range un salon, on ajuste un rôle, sur
//     plusieurs minutes.
// D'où des fenêtres courtes (10 s) pour les suppressions et des
// fenêtres longues (60 s) pour les bans/kicks : bannir plusieurs
// raiders à la suite est normal pendant un raid, supprimer 3
// salons en 10 s ne l'est jamais.
//
// Deux règles se déclenchent sur UNE seule action, comme Wick :
// l'élévation de privilèges d'un rôle et l'ajout d'un bot.
//
// ── LES AUTRES BOTS ───────────────────────────────────────────
// Wick et Security Bot exigent de mettre les bots utilitaires en
// liste blanche, sinon le bot de tickets se fait punir dès qu'il
// ouvre trois tickets. Hoxera les exclut d'office : sanctionner
// un autre bot casse le serveur. Une alerte est envoyée à la
// place, et c'est l'HUMAIN qui a ajouté le bot qui est surveillé
// (type « bot_add »).
//
// ── RÈGLE DE SÉCURITÉ ABSOLUE ─────────────────────────────────
// Hoxera ne sanctionne JAMAIS sans avoir identifié l'auteur avec
// certitude via le journal d'audit. Si celui-ci est illisible
// (permission « Voir le journal d'audit » manquante) ou muet, on
// retombe sur l'alerte seule. Le propriétaire, le bot et la liste
// blanche ne sont jamais sanctionnés.
//
// Réglable depuis le dashboard (onglet Anti-nuke).
// ============================================================
const { AuditLogEvent } = require('discord.js');
const store = require('../db');
const logging = require('./logging');
const lockdown = require('./lockdown');
const i18n = require('../i18n');

// Actions destructrices surveillées, mappées vers le journal d'audit.
// Valeurs vérifiées depuis l'enum AuditLogEvent de discord.js.
const WATCHED = {
  channel_delete: { audit: AuditLogEvent.ChannelDelete,         kindKey: 'nuke_kind_channel_delete' },
  channel_create: { audit: AuditLogEvent.ChannelCreate,         kindKey: 'nuke_kind_channel_create' },
  role_delete:    { audit: AuditLogEvent.RoleDelete,            kindKey: 'nuke_kind_role_delete' },
  role_create:    { audit: AuditLogEvent.RoleCreate,            kindKey: 'nuke_kind_role_create' },
  role_update:    { audit: AuditLogEvent.RoleUpdate,            kindKey: 'nuke_kind_role_update' },
  overwrite:      { audit: AuditLogEvent.ChannelOverwriteUpdate, kindKey: 'nuke_kind_overwrite' },
  ban:            { audit: AuditLogEvent.MemberBanAdd,          kindKey: 'nuke_kind_ban' },
  kick:           { audit: AuditLogEvent.MemberKick,            kindKey: 'nuke_kind_kick' },
  webhook:        { audit: AuditLogEvent.WebhookCreate,         kindKey: 'nuke_kind_webhook' },
  emoji:          { audit: AuditLogEvent.EmojiDelete,           kindKey: 'nuke_kind_emoji' },
  bot_add:        { audit: AuditLogEvent.BotAdd,                kindKey: 'nuke_kind_bot_add' },
};

// ------------------------------------------------------------
// Seuils par défaut, type par type.
//
// Fenêtres COURTES (10 s) pour les suppressions et créations :
// un nuke est exécuté à vitesse machine. Fenêtres LONGUES (60 s)
// pour les bans et expulsions : nettoyer un raid en bannissant
// plusieurs comptes à la suite est un usage normal de modération.
//
// count = 1 signifie « une seule action suffit », comme Wick sur
// l'élévation de privilèges et les bots ajoutés sans autorisation.
// ------------------------------------------------------------
const LIMITS_DEFAULT = {
  channel_delete: { count: 2, window: 10 },
  channel_create: { count: 3, window: 10 },
  role_delete:    { count: 2, window: 10 },
  role_create:    { count: 3, window: 10 },
  role_update:    { count: 1, window: 10 },  // élévation de privilèges
  overwrite:      { count: 4, window: 10 },
  ban:            { count: 3, window: 60 },
  kick:           { count: 3, window: 60 },
  webhook:        { count: 2, window: 10 },
  emoji:          { count: 2, window: 10 },
  bot_add:        { count: 1, window: 10 },  // bot ajouté sans autorisation
};

// Réaction par défaut : QUARANTAINE, comme Wick et Security Bot. Le bannissement
// était le premier choix, mais la documentation de Security Bot est explicite :
// « le ban est le plus sûr mais ne peut pas être annulé facilement ». La
// quarantaine retire tous les rôles et conserve le membre sur le serveur : une
// fausse alerte cesse d'être un drame, et les rôles d'origine sont gardés en
// base pour permettre la restauration. Le ban reste disponible dans le menu.
const DEFAULT_ACTION = 'quarantine';
const AUDIT_DELAY_MS = 1500;    // laisser le journal d'audit se remplir
const AUDIT_LOOKBACK_MS = 20000; // ignorer les entrées trop anciennes
const ACTOR_COOLDOWN_MS = 60000; // pas deux sanctions du même couple auteur/type en 60 s
const AUDIT_MAX = 50;           // plafond Discord sur fetchAuditLog
const AUDIT_MIN_INTERVAL_MS = 2000; // intervalle minimum entre deux lectures
const QUARANTINE_ROLE = '🔒 Hoxera-Quarantaine';
const ACTIONS = ['ban', 'quarantine', 'demote', 'lockdown', 'alert'];

// `${botId}:${guildId}` -> { items, timer, guild }
const pending = new Map();
// `${botId}:${guildId}:${actorId}:${kind}` -> [{ ts, detail }]
const counts = new Map();
// `${botId}:${guildId}:${actorId}:${kind}` -> timestamp de la dernière sanction
const lastAct = new Map();
// guildId -> true quand l'absence de permission d'audit a déjà été signalée
const auditWarned = new Set();
// guildId -> timestamp de la dernière lecture du journal d'audit
const lastFetch = new Map();

// ------------------------------------------------------------
// Bornage d'une limite : seuil entre 1 et 50, fenêtre entre 5 et 600 s.
// ------------------------------------------------------------
function clampLimit(raw, fallback) {
  const fb = fallback || { count: 3, window: 60 };
  const o = raw && typeof raw === 'object' ? raw : {};
  // Nombre.isFinite et non « || » : une valeur explicite de 0 doit être bornée
  // à 1, pas remplacer silencieusement le seuil recommandé par 0 puis 3.
  const cRaw = parseInt(o.count, 10);
  const wRaw = parseInt(o.window, 10);
  const count = Math.min(Math.max(Number.isFinite(cRaw) ? cRaw : fb.count, 1), 50);
  const win = Math.min(Math.max(Number.isFinite(wRaw) ? wRaw : fb.window, 5), 600);
  return { count, window: win };
}

function normalizeLimits(input) {
  const out = {};
  const src = input && typeof input === 'object' ? input : {};
  for (const kind of Object.keys(LIMITS_DEFAULT)) out[kind] = clampLimit(src[kind], LIMITS_DEFAULT[kind]);
  return out;
}

function config(botId, guildId) {
  const gs = store.guildSettings.get(botId, guildId) || {};
  let limits = {};
  try { limits = JSON.parse(String(gs.antinuke_limits || '') || '{}'); } catch { limits = {}; }
  return {
    enabled: gs.antinuke_enabled === 1,
    // Seuil et fenêtre globaux conservés : ils servent de repli pour un type
    // absent du JSON et restent lus par l'ancien tableau de bord.
    threshold: Math.min(Math.max(parseInt(gs.antinuke_threshold, 10) || 3, 1), 50),
    window: Math.min(Math.max(parseInt(gs.antinuke_window, 10) || 60, 5), 600),
    action: ACTIONS.includes(gs.antinuke_action) ? gs.antinuke_action : DEFAULT_ACTION,
    whitelist: String(gs.antinuke_whitelist || '').split(',').map((s) => s.trim()).filter(Boolean),
    alertChannel: String(gs.antinuke_alert_channel || '').trim(),
    limits: normalizeLimits(limits),
    punishBots: gs.antinuke_punish_bots === 1,
  };
}

function kindLabel(lang, kind) {
  const w = WATCHED[kind];
  return w ? i18n.t(lang, w.kindKey) : kind;
}

// ------------------------------------------------------------
// Garde-fous : pourquoi une sanction est refusée.
// Retourne '' si rien ne s'oppose à la sanction.
// ------------------------------------------------------------
function blockedReason(guild, actorId, cfg, clientUserId, actorIsBot) {
  if (!actorId) return 'no_actor';
  if (guild && guild.ownerId && actorId === guild.ownerId) return 'owner';
  if (clientUserId && actorId === clientUserId) return 'bot';
  if (cfg.whitelist.includes(actorId)) return 'whitelist';
  // Un autre bot (tickets, musique…) n'est pas sanctionné par défaut.
  if (actorIsBot && !cfg.punishBots) return 'other_bot';
  return '';
}

// ------------------------------------------------------------
// Hoxera crée et supprime lui-même certains salons (tickets,
// vocaux temporaires). Les compter produirait du bruit et des
// lectures d'audit inutiles : on les ignore à la source.
// ------------------------------------------------------------
function isSelfManagedChannel(botId, guild, channel) {
  try {
    if (!channel || !channel.id) return false;
    const cid = String(channel.id);
    if (store.db.prepare('SELECT 1 AS x FROM open_tickets WHERE channel_id = ? LIMIT 1').get(cid)) return true;
    if (store.db.prepare('SELECT 1 AS x FROM closed_tickets WHERE channel_id = ? LIMIT 1').get(cid)) return true;
    const vt = store.db.prepare('SELECT category FROM voicetemp WHERE guild_id = ?').get(String(guild.id));
    if (vt && vt.category && String(channel.parentId || '') === String(vt.category)) return true;
    return false;
  } catch (e) { return false; }
}

// ------------------------------------------------------------
// Réception d'une action destructrice. On empile, on ne lit pas
// le journal d'audit tout de suite : la lecture est groupée.
// ------------------------------------------------------------
function note(botId, guild, kind, detail = '', channel = null) {
  try {
    if (!guild || !guild.id || !WATCHED[kind]) return;
    const cfg = config(botId, guild.id);
    if (!cfg.enabled) return;

    // Salons de tickets et vocaux temporaires : supprimés par Hoxera lui-même.
    if (kind === 'channel_delete' && isSelfManagedChannel(botId, guild, channel)) return;

    const key = `${botId}:${guild.id}`;
    const p = pending.get(key) || { items: [], timer: null, guild };
    p.guild = guild;
    p.items.push({ kind, detail, ts: Date.now() });
    pending.set(key, p);

    if (!p.timer) {
      p.timer = setTimeout(() => {
        p.timer = null;
        resolve(botId, guild.id).catch((e) => {
          console.error('[Hoxera] anti-nuke resolve:', e.message);
        });
      }, AUDIT_DELAY_MS);
      if (p.timer.unref) p.timer.unref();
    }
  } catch (e) {
    console.error('[Hoxera] anti-nuke note:', e.message);
  }
}

// ------------------------------------------------------------
// Résolution d'une rafale : UNE lecture du journal d'audit pour
// tout le lot, puis attribution des actions à leurs auteurs.
// ------------------------------------------------------------
async function resolve(botId, guildId) {
  const key = `${botId}:${guildId}`;
  const p = pending.get(key);
  if (!p || !p.items.length) return { resolved: 0, triggered: 0, blocked: '' };

  const items = p.items.splice(0, p.items.length);
  if (!p.items.length && !p.timer) pending.delete(key);
  const guild = p.guild;
  if (!guild) return { resolved: 0, triggered: 0, blocked: '' };

  const cfg = config(botId, guildId);
  if (!cfg.enabled) return { resolved: 0, triggered: 0, blocked: '' };

  // Lecture unique du journal d'audit pour toute la rafale.
  let entries = [];
  let auditError = '';
  const prevFetch = lastFetch.get(guildId) || 0;
  const wait = prevFetch ? AUDIT_MIN_INTERVAL_MS - (Date.now() - prevFetch) : 0;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch.set(guildId, Date.now());
  try {
    const log = await guild.fetchAuditLog({ limit: Math.min(items.length + 10, AUDIT_MAX) });
    entries = [...(log && log.entries ? log.entries.values() : [])];
  } catch (e) {
    auditError = (e && e.message) || 'erreur inconnue';
  }

  const now = Date.now();
  const used = new Set();
  const hits = [];       // { actorId, kind, detail, actorIsBot }
  let unresolved = 0;

  for (const it of items) {
    const want = WATCHED[it.kind].audit;
    const entry = entries.find((e) => {
      if (used.has(e.id)) return false;
      if (Number(e.action) !== Number(want)) return false;
      const at = e.createdAt ? e.createdAt.getTime() : 0;
      return at && (now - at) <= AUDIT_LOOKBACK_MS;
    });
    if (!entry) { unresolved += 1; continue; }
    used.add(entry.id);
    const actorId = String(entry.executorId || (entry.executor && entry.executor.id) || '');
    if (!actorId) { unresolved += 1; continue; }
    // Action faite par Hoxera lui-même : on ne compte pas, on n'alerte pas.
    const selfId = guild.client && guild.client.user ? String(guild.client.user.id) : '';
    if (selfId && actorId === selfId) continue;
    hits.push({
      actorId,
      kind: it.kind,
      detail: it.detail || entry.reason || '',
      actorIsBot: !!(entry.executor && entry.executor.bot),
    });
  }

  // Journal illisible : on alerte UNE fois, et on ne sanctionne jamais.
  if (auditError && !auditWarned.has(guildId)) {
    auditWarned.add(guildId);
    const lang = i18n.langForGuild(guildId);
    await alert(botId, guild, cfg, {
      title: i18n.t(lang, 'nuke_alert_title', { server: guild.name }),
      description: i18n.t(lang, 'nuke_audit_missing', { error: auditError }),
      fields: [],
      record: { actor_id: '', reason: 'audit_illisible', kind: 'system', action_taken: 'alert', detail: auditError },
    });
  }

  // ----------------------------------------------------------
  // Comptage PAR AUTEUR ET PAR TYPE. C'est ce qui sépare le nuke
  // de la modération ordinaire : deux bans de raiders plus un
  // salon supprimé ne forment plus un tout suspect, ce sont deux
  // compteurs distincts dont aucun n'atteint son seuil.
  // ----------------------------------------------------------
  const byPair = new Map();
  for (const h of hits) {
    const k = `${h.actorId}|${h.kind}`;
    const list = byPair.get(k) || [];
    list.push(h);
    byPair.set(k, list);
  }

  let triggered = 0;
  let blocked = '';
  for (const [pair, list] of byPair) {
    const [actorId, kind] = pair.split('|');
    const lim = cfg.limits[kind] || clampLimit(null, { count: cfg.threshold, window: cfg.window });
    const ckey = `${botId}:${guildId}:${actorId}:${kind}`;
    const prev = (counts.get(ckey) || []).filter((e) => now - e.ts < lim.window * 1000);
    const merged = prev.concat(list.map((h) => ({ ts: now, detail: h.detail })));
    counts.set(ckey, merged);

    if (merged.length < lim.count) continue;

    const last = lastAct.get(ckey) || 0;
    if (now - last < ACTOR_COOLDOWN_MS) continue; // rafale déjà traitée
    lastAct.set(ckey, now);
    counts.set(ckey, []);
    const res = await trigger(botId, guild, {
      actorId,
      kind,
      hits: merged,
      limit: lim,
      actorIsBot: !!(list[0] && list[0].actorIsBot),
      cfg,
    }).catch((e) => {
      console.error('[Hoxera] anti-nuke trigger:', e.message);
      return null;
    });
    if (res && res.triggered) triggered += 1;
    if (res && res.blocked) blocked = res.blocked;
  }

  return { resolved: hits.length, unresolved, triggered, blocked };
}

// ------------------------------------------------------------
// Sanction + alerte. Toute impossibilité retombe sur l'alerte.
// ------------------------------------------------------------
async function trigger(botId, guild, { actorId, kind, hits, limit, actorIsBot, cfg }) {
  const lang = i18n.langForGuild(guild.id);
  const conf = cfg || config(botId, guild.id);
  const clientUserId = guild.client && guild.client.user ? guild.client.user.id : '';
  const wanted = conf.action;

  let actorTag = `<@${actorId}>`;
  let member = null;
  try {
    member = await guild.members.fetch(actorId).catch(() => null);
    if (member && member.user && member.user.tag) actorTag = `${member.user.tag} (<@${actorId}>)`;
  } catch { /* l'étiquette par défaut suffit */ }
  const isBot = actorIsBot || !!(member && member.user && member.user.bot);

  const blocked = blockedReason(guild, actorId, conf, clientUserId, isBot);
  const lim = limit || conf.limits[kind] || { count: conf.threshold, window: conf.window };
  const detailHits = `${hits.length}× ${kindLabel(lang, kind)} (limite ${lim.count}/${lim.window}s)`;

  // --- Garde-fous : on refuse la sanction, on alerte quand même. ---
  if (blocked) {
    const reasonKey = blocked === 'owner' ? 'nuke_blocked_owner'
      : blocked === 'whitelist' ? 'nuke_blocked_whitelist'
      : blocked === 'bot' ? 'nuke_blocked_bot'
      : blocked === 'other_bot' ? 'nuke_blocked_other_bot' : 'nuke_no_actor';
    await alert(botId, guild, conf, {
      title: i18n.t(lang, 'nuke_alert_title', { server: guild.name }),
      description: `${i18n.t(lang, 'nuke_alert_hits', { count: hits.length, window: lim.window, actor: actorTag })}\n${i18n.t(lang, reasonKey)}`,
      fields: [{ name: i18n.t(lang, 'nuke_field_hits'), value: detailHits }],
      record: {
        actor_id: actorId, actor_tag: actorTag, reason: `bloque:${blocked}`,
        kind: detailHits, action_taken: 'alert', detail: `sanction ${wanted} refusée (${blocked})`,
      },
    });
    return { triggered: true, action: 'alert', blocked };
  }

  // --- Application de la sanction demandée. ---
  const reason = `Hoxera anti-nuke : ${hits.length}× ${kindLabel(lang, kind)} en ${lim.window}s (limite ${lim.count})`;
  const out = await punish(botId, guild, actorId, wanted, reason, member);

  let desc = i18n.t(lang, 'nuke_alert_hits', { count: hits.length, window: lim.window, actor: actorTag });
  let actionTaken = out.action;
  if (out.done) {
    if (out.action === 'ban') desc += `\n${i18n.t(lang, 'nuke_action_ban')}`;
    else if (out.action === 'quarantine') desc += `\n${i18n.t(lang, 'nuke_action_quarantine')}`;
    else if (out.action === 'demote') desc += `\n${i18n.t(lang, 'nuke_action_demote')}`;
    else if (out.action === 'lockdown') desc += `\n${i18n.t(lang, 'nuke_action_lockdown', { locked: out.locked || 0 })}`;
    else desc += `\n${i18n.t(lang, 'nuke_action_alert')}`;
  } else {
    // Échec (hiérarchie, permission) : on ne laisse jamais passer sans trace.
    desc += `\n${i18n.t(lang, 'nuke_failed', { error: out.error || 'raison inconnue' })}`;
    actionTaken = 'échec';
  }

  await alert(botId, guild, conf, {
    title: i18n.t(lang, 'nuke_alert_title', { server: guild.name }),
    description: desc,
    fields: [
      { name: i18n.t(lang, 'nuke_field_actor'), value: actorTag, inline: true },
      { name: i18n.t(lang, 'nuke_field_action'), value: out.done ? wanted : `${wanted} → échec`, inline: true },
      { name: i18n.t(lang, 'nuke_field_hits'), value: detailHits },
    ],
    // Les rôles retirés sont conservés : une quarantaine ou une rétrogradation
    // doit pouvoir être annulée par le propriétaire sans deviner l'état d'avant.
    record: {
      actor_id: actorId, actor_tag: actorTag, reason,
      kind: detailHits, action_taken: actionTaken,
      detail: [out.detail || '', out.error || '', out.roles ? `rôles avant : ${out.roles.join(' ')}` : '']
        .filter(Boolean).join(' | ').slice(0, 1000),
    },
  });

  return { triggered: true, action: out.done ? out.action : 'échec', detail: detailHits };
}

async function punish(botId, guild, actorId, action, reason, preloaded) {
  try {
    if (action === 'alert') return { done: true, action: 'alert' };

    if (action === 'lockdown') {
      const r = await lockdown.on(botId, guild, '🛡️ Hoxera — anti-nuke');
      return { done: true, action: 'lockdown', locked: (r && r.channels) || 0 };
    }

    const member = preloaded || await guild.members.fetch(actorId).catch(() => null);

    if (action === 'ban') {
      if (member) {
        if (!member.bannable) return { done: false, action: 'ban', error: 'membre non bannissable (hiérarchie ou permission)' };
        await member.ban({ reason, deleteMessageSeconds: 0 });
      } else {
        // Membre déjà parti : on bannit quand même par identifiant.
        await guild.members.ban(actorId, { reason, deleteMessageSeconds: 0 });
      }
      return { done: true, action: 'ban', detail: reason };
    }

    if (action === 'demote' || action === 'quarantine') {
      if (!member) return { done: false, action, error: 'membre introuvable' };
      if (!member.manageable) return { done: false, action, error: 'membre non gérable (hiérarchie : placez le rôle de Hoxera tout en haut)' };

      const me = guild.members.me;
      const top = me && me.roles ? me.roles.highest : null;
      const before = member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);

      if (action === 'demote') {
        const adminRoles = member.roles.cache.filter((r) => r.id !== guild.id
          && r.permissions && r.permissions.has('Administrator')
          && (!top || r.comparePositionTo(top) < 0));
        if (!adminRoles.size) return { done: false, action: 'demote', error: 'aucun rôle Administrateur retirable' };
        await member.roles.remove([...adminRoles.keys()], reason);
        return { done: true, action: 'demote', detail: `${adminRoles.size} rôle(s) retiré(s)`, roles: before };
      }

      // --- Quarantaine : le standard Wick/Security Bot. Réversible, contrairement
      // --- au bannissement : le membre reste sur le serveur pour enquête.
      let qRole = guild.roles.cache.find((r) => r.name === QUARANTINE_ROLE);
      if (!qRole) {
        qRole = await guild.roles.create({
          name: QUARANTINE_ROLE, permissions: [], color: 0xED4245,
          reason: 'Hoxera anti-nuke — rôle de quarantaine', mentionable: false,
        });
        // Sans interdiction explicite, le membre verrait encore les salons
        // ouverts à @everyone. Chaque salon est donc verrouillé pour ce rôle.
        const chans = guild.channels.cache ? [...guild.channels.cache.values()] : [];
        for (const ch of chans) {
          try {
            if (ch.permissionOverwrites && ch.permissionOverwrites.edit) {
              await ch.permissionOverwrites.edit(qRole, { ViewChannel: false, SendMessages: false, Connect: false });
            }
          } catch { /* un salon récalcitrant ne bloque pas la quarantaine */ }
        }
      }
      await member.roles.set([qRole.id], reason);
      return { done: true, action: 'quarantine', detail: `rôle ${QUARANTINE_ROLE} appliqué`, roles: before };
    }

    return { done: true, action: 'alert' };
  } catch (e) {
    return { done: false, action, error: (e && e.message) || 'erreur inconnue' };
  }
}

// ------------------------------------------------------------
// Alerte : salon dédié si configuré, sinon le journal habituel.
// ------------------------------------------------------------
async function alert(botId, guild, cfg, payload) {
  try { store.antinuke.log(botId, guild.id, payload.record || {}); } catch { /* le journal ne casse jamais la protection */ }
  const body = { title: payload.title, description: payload.description, color: '#ED4245', fields: payload.fields || [], type: 'security' };
  if (cfg.alertChannel) {
    try {
      const chan = await guild.channels.fetch(cfg.alertChannel).catch(() => null);
      if (chan && chan.send) {
        const { EmbedBuilder } = require('discord.js');
        const eb = new EmbedBuilder().setTitle(body.title).setColor(0xED4245);
        if (body.description) eb.setDescription(body.description);
        for (const f of body.fields) eb.addFields({ name: f.name, value: String(f.value || '').slice(0, 1024), inline: !!f.inline });
        await chan.send({ embeds: [eb] });
        return;
      }
    } catch { /* on retombe sur le journal */ }
  }
  try { await logging.log(botId, guild, body); } catch { /* jamais bloquant */ }
}

// Purge des compteurs anciens (appelée par le balayage périodique).
function sweep(now = Date.now()) {
  for (const [k, list] of counts) {
    const fresh = list.filter((e) => now - e.ts < 600000);
    if (fresh.length) counts.set(k, fresh); else counts.delete(k);
  }
  for (const [k, ts] of lastAct) if (now - ts > 3600000) lastAct.delete(k);
  return { counts: counts.size, lastAct: lastAct.size };
}

// État affiché dans le dashboard.
function state(botId, guildId) {
  const cfg = config(botId, guildId);
  return {
    ...cfg,
    auditReadable: !auditWarned.has(guildId),
    totalActions: store.antinuke.count(botId, guildId),
    recent: store.antinuke.recent(botId, guildId, 10),
  };
}

module.exports = {
  note, resolve, trigger, punish, sweep, state, config, blockedReason, kindLabel,
  isSelfManagedChannel, normalizeLimits, clampLimit,
  WATCHED, LIMITS_DEFAULT, ACTIONS, QUARANTINE_ROLE,
  DEFAULTS: { threshold: 3, window: 60, action: DEFAULT_ACTION, limits: LIMITS_DEFAULT },
  _test: { pending, counts, lastAct, auditWarned, lastFetch, AUDIT_DELAY_MS, ACTOR_COOLDOWN_MS, AUDIT_MIN_INTERVAL_MS },
};
