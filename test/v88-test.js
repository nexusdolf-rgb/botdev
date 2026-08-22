// ============================================================
// Test Hoxera v88 — Logs avancés + stats d'utilisation
//  1. cmd_stats : compteur accumulé par jour, top, total, purge 30 j
//  2. Journal messages supprimés (hors bots, hors auto-mod)
//  3. Journal messages modifiés (texte changé uniquement)
//  4. Journal rôles des membres (ajout/retrait) + pseudo
//  5. Journal salons créés / supprimés / modifiés + threads
//  6. Journal rôles créés / supprimés / modifiés
//  7. Journal serveur modifié + webhooks
//  8. Journal vocal (connexion / déconnexion / déplacement)
//  9. Filtrage par catégorie : catégorie désactivée → pas de log
// 10. Migration : les nouvelles catégories sont activées par défaut
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v88-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const auditLog = require('../server/discord/auditLog');
  const BOT = 1, G = 'G1';

  // ---------- Faux journal (capture les embeds) ----------
  const logged = [];
  const logChannel = { name: 'logs', isTextBased: () => true, send: async (p) => { logged.push(p); return {}; } };
  const coll = (map) => ({ get: (id) => map.get(id) || null, has: (id) => map.has(id), find: (fn) => [...map.values()].find(fn) || null, values: () => map.values(), keys: () => map.keys() });
  const guild = {
    id: G, name: 'Serveur Test',
    channels: { cache: coll(new Map([['LOGS', logChannel]])) },
    roles: { everyone: { id: 'EVERYONE' } },
  };
  store.guildSettings.set(BOT, G, { log_channel: '#logs', log_events: JSON.stringify({ messages: 1, roles: 1, channels: 1, server: 1, voice: 1, security: 1, mod: 1, automod: 1, joinleave: 1, tickets: 1, other: 1 }) });
  const lastLog = () => logged[logged.length - 1];
  const logCount = () => logged.length;

  // ---------- 1. cmd_stats ----------
  store.cmdStats.bump(BOT, G, 'help', '2026-08-22');
  store.cmdStats.bump(BOT, G, 'help', '2026-08-22');
  store.cmdStats.bump(BOT, G, 'ping', '2026-08-22');
  store.cmdStats.bump(BOT, G, 'ping', '2026-08-21');
  check('stats : total = 4', store.cmdStats.total(BOT, G) === 4);
  const top = store.cmdStats.top(BOT, G, 5);
  check('stats : top commandes trié', top[0].command === 'help' && top[0].n === 2 && top[1].command === 'ping');
  const byDay = store.cmdStats.perDay(BOT, G, 7);
  check('stats : par jour sur 7 jours', byDay.length === 7 && byDay.every((d) => d.commands >= 0));
  // purge 30 j
  store.db.prepare('INSERT INTO cmd_stats (bot_id, guild_id, command, day, count) VALUES (?,?,?,?,?) ON CONFLICT(bot_id,guild_id,command,day) DO UPDATE SET count = count + 1').run(BOT, G, 'vieux', '2026-01-01', 3);
  const maintenance = require('../server/maintenance');
  const purge = maintenance.purgeOldData(store.db);
  check('stats : purge des commandes de +30 j', (purge.cmd_stats || 0) >= 1);
  check('stats : les récentes sont conservées', store.cmdStats.total(BOT, G) === 4);

  // ---------- 2. Messages supprimés ----------
  logged.length = 0;
  const mkMsg = (content, opts = {}) => ({
    id: opts.id || 'M1',
    content,
    author: { bot: !!opts.bot, tag: opts.tag || 'Membre#0001' },
    guild,
    channel: { id: 'C1', name: 'général' },
    attachments: opts.atts ? { size: 1 } : { size: 0 },
    createdAt: new Date(),
    deletable: true,
    deleted: false,
    delete: async function () { this.deleted = true; },
  });
  auditLog.onMessageDelete(BOT, mkMsg('message normal'));
  check('messages : suppression journalisée', logCount() === 1 && JSON.stringify(lastLog()).includes('supprimé'));
  auditLog.onMessageDelete(BOT, mkMsg('message de bot', { bot: true }));
  check('messages : les bots sont ignorés', logCount() === 1);
  // auto-mod marqué → non dupliqué dans le journal des messages
  const automod = require('../server/discord/automod');
  const mAm = mkMsg('https://discord.gg/hack', { id: 'AM1' });
  automod._test.spamTracker.clear();
  store.guildSettings.set(BOT, G, { log_channel: '', am_enabled: 1, am_links: 1, am_ignore_staff: 1, am_spam: 0 });
  await automod.runAutomod(BOT, mAm);
  store.guildSettings.set(BOT, G, { log_channel: '#logs' });
  check('automod : suppression effectuée', mAm.deleted === true);
  auditLog.onMessageDelete(BOT, mAm);
  check('messages : suppression de l\'auto-mod non dupliquée', logCount() === 1);

  // ---------- 3. Messages modifiés ----------
  auditLog.onMessageUpdate(BOT, mkMsg('avant', { id: 'E1' }), mkMsg('après', { id: 'E1' }));
  check('messages : modification journalisée', logCount() === 2 && JSON.stringify(lastLog()).includes('modifié'));
  auditLog.onMessageUpdate(BOT, mkMsg('même', { id: 'E2' }), mkMsg('même', { id: 'E2' }));
  check('messages : sans changement de texte → ignoré', logCount() === 2);
  auditLog.onMessageUpdate(BOT, mkMsg('bot edit', { id: 'E3', bot: true }), mkMsg('bot edit 2', { id: 'E3', bot: true }));
  check('messages : édition d\'un bot → ignorée', logCount() === 2);

  // ---------- 4. Rôles des membres ----------
  const mkMember = (roles, nick) => ({
    user: { tag: 'Membre#0001' },
    nickname: nick,
    guild,
    roles: { cache: coll(new Map(roles.map((r) => [r.id, r]))) },
  });
  auditLog.onGuildMemberUpdate(BOT, mkMember([], null), mkMember([{ id: 'R1', name: 'VIP' }], null));
  check('rôles : ajout journalisé', JSON.stringify(lastLog()).includes('VIP'));
  auditLog.onGuildMemberUpdate(BOT, mkMember([], 'vieux'), mkMember([], 'nouveau'));
  check('rôles : pseudo modifié journalisé', JSON.stringify(lastLog()).includes('nouveau'));
  const n = logCount();
  auditLog.onGuildMemberUpdate(BOT, mkMember([], 'x'), mkMember([], 'x'));
  check('rôles : aucun changement → ignoré', logCount() === n);

  // ---------- 5. Salons ----------
  const mkChan = (name, type) => ({ id: 'CH1', name, type, guild });
  auditLog.onChannelCreate(BOT, mkChan('nouveau', 0));
  check('salons : création journalisée', JSON.stringify(lastLog()).includes('créé'));
  auditLog.onChannelDelete(BOT, mkChan('supprimé', 0));
  check('salons : suppression journalisée', JSON.stringify(lastLog()).includes('supprimé'));
  auditLog.onChannelUpdate(BOT, mkChan('avant', 0), mkChan('après', 0));
  check('salons : renommage journalisé', JSON.stringify(lastLog()).includes('après'));
  auditLog.onThreadCreate(BOT, { id: 'T1', name: 'fil test', guild, parent: { id: 'C1' } });
  check('salons : fil créé journalisé', JSON.stringify(lastLog()).includes('fil test'));

  // ---------- 6. Rôles serveur ----------
  const mkRole = (name, color) => ({ id: 'R9', name, hexColor: color, guild, permissions: { bitfield: '1' } });
  auditLog.onRoleCreate(BOT, mkRole('Modo', '#5865F2'));
  check('rôles : création journalisée', JSON.stringify(lastLog()).includes('Modo'));
  auditLog.onRoleDelete(BOT, mkRole('Modo', '#5865F2'));
  check('rôles : suppression journalisée', JSON.stringify(lastLog()).includes('Modo'));
  auditLog.onRoleUpdate(BOT, mkRole('A', '#111111'), mkRole('B', '#222222'));
  check('rôles : modification journalisée', JSON.stringify(lastLog()).includes('B'));

  // ---------- 7. Serveur + webhooks ----------
  auditLog.onGuildUpdate(BOT, { ...guild, name: 'Vieux Nom', icon: '' }, { ...guild, name: 'Nouveau Nom', icon: '' });
  check('serveur : renommage journalisé', JSON.stringify(lastLog()).includes('Nouveau Nom'));
  auditLog.onWebhooksUpdate(BOT, { id: 'C1', guild });
  check('serveur : webhooks journalisés', JSON.stringify(lastLog()).includes('webhook') || JSON.stringify(lastLog()).includes('Webhook'));

  // ---------- 8. Vocal ----------
  const mkVS = (ch) => ({ channel: ch, member: { user: { tag: 'Membre#0001' } }, guild });
  auditLog.onVoiceState(BOT, mkVS(null), mkVS({ id: 'V1', name: 'Général' }));
  check('vocal : connexion journalisée', JSON.stringify(lastLog()).includes('rejoint'));
  auditLog.onVoiceState(BOT, mkVS({ id: 'V1', name: 'Général' }), mkVS(null));
  check('vocal : déconnexion journalisée', JSON.stringify(lastLog()).includes('quitté'));
  auditLog.onVoiceState(BOT, mkVS({ id: 'V1', name: 'Général' }), mkVS({ id: 'V2', name: 'Staff' }));
  check('vocal : déplacement journalisé', JSON.stringify(lastLog()).includes('Staff'));

  // ---------- 9. Filtrage par catégorie ----------
  store.guildSettings.set(BOT, G, { log_events: JSON.stringify({ messages: 0, roles: 0, channels: 0, server: 0, voice: 0, security: 0, mod: 1, automod: 0, joinleave: 0, tickets: 0, other: 0 }) });
  logged.length = 0;
  auditLog.onMessageDelete(BOT, mkMsg('à filtrer'));
  auditLog.onRoleCreate(BOT, mkRole('RôleFiltré', '#000000'));
  auditLog.onVoiceState(BOT, mkVS(null), mkVS({ id: 'V9', name: 'X' }));
  check('filtrage : catégories désactivées → aucun log', logCount() === 0);
  store.guildSettings.set(BOT, G, { log_events: JSON.stringify({ messages: 1, roles: 1, channels: 1, server: 1, voice: 1, security: 1, mod: 1, automod: 1, joinleave: 1, tickets: 1, other: 1 }) });

  // ---------- 10. Migration des nouvelles catégories ----------
  // On insère une configuration « ancienne » (sans les nouvelles clés) puis
  // on relance la migration : les nouvelles catégories doivent être activées.
  store.guildSettings.set(BOT, 'G-LEGACY', { log_events: JSON.stringify({ mod: 1, tickets: 0, joinleave: 1 }) });
  const updated = store.migrateLogCategories(store.db);
  check('migration : des configurations ont été complétées', updated >= 1);
  const migrated = JSON.parse(store.guildSettings.get(BOT, 'G-LEGACY').log_events);
  check('migration : mod/tickets/joinleave conservés', migrated.mod === 1 && migrated.tickets === 0 && migrated.joinleave === 1);
  check('migration : nouvelles catégories activées par défaut', migrated.messages === 1 && migrated.roles === 1 && migrated.channels === 1 && migrated.server === 1 && migrated.voice === 1 && migrated.security === 1);
  // Une deuxième passe ne change rien (idempotent)
  const secondPass = store.migrateLogCategories(store.db);
  check('migration : idempotente (2e passe sans effet)', secondPass === 0);

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v88 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Erreur fatale du test :', e); process.exit(1); });
