// ============================================================
// Test Hoxera v87 — Bouclier anti-raid automatique
//  1. Configuration par défaut + persistance (guild_settings)
//  2. En dessous du seuil → rien ne se passe
//  3. Seuil atteint → verrouillage automatique des salons
//  4. Fenêtre dépassée → les vieilles arrivées sont purgées (pas de faux positif)
//  5. Action « alert » → alerte sans verrouillage
//  6. Réouverture automatique après X minutes (balayage)
//  7. Réouverture manuelle
//  8. Désarmé → aucune détection
//  9. État exposé (dashboard)
// 10. Traductions FR/EN des alertes
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v87-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const store = require('../server/db');
  const antiraid = require('../server/discord/antiraid');
  const i18n = require('../server/i18n');
  const BOT = 1, G = 'G1';

  // ---------- Faux serveur avec 3 salons texte ----------
  const channels = [];
  const everyone = { id: 'EVERYONE' };
  const logs = [];
  const makeChannel = (id, sendAllowed) => {
    const ch = {
      id, name: 'salon-' + id, type: 0, // GuildText
      permissionOverwrites: {
        edit: async (target, opts) => { ch.locked = opts && opts.SendMessages === false; },
        delete: async () => { ch.locked = false; },
      },
      permissionsFor: (who) => ({ has: (f) => sendAllowed }),
      locked: false,
    };
    channels.push(ch);
    return ch;
  };
  makeChannel('C1', true);
  makeChannel('C2', true);
  makeChannel('C3', false); // déjà fermé → ignoré par le verrouillage
  const coll = (map) => ({ get: (id) => map.get(id) || null, has: (id) => map.has(id), find: (fn) => [...map.values()].find(fn) || null, values: () => map.values() });
  const guild = {
    id: G, name: 'Serveur Test',
    roles: { everyone, cache: coll(new Map()) },
    channels: { cache: coll(new Map(channels.map((c) => [c.id, c]))) },
  };
  const clientFake = { guilds: { cache: coll(new Map([[G, guild]])) } };
  const entry = { client: clientFake };

  // ---------- 1. Configuration ----------
  const fresh = antiraid.config(BOT, 'G_NEW');
  check('config : désarmé par défaut (sécurité)', fresh.enabled === false);
  check('config : seuil 10 / fenêtre 30 s par défaut', fresh.threshold === 10 && fresh.window === 30);
  store.guildSettings.set(BOT, 'G_NEW', { antiraid_enabled: 1, antiraid_threshold: 4, antiraid_window: 20, antiraid_action: 'lockdown', antiraid_unlock_min: 5 });
  const cfg2 = antiraid.config(BOT, 'G_NEW');
  check('config : valeurs personnalisées persistées', cfg2.enabled === true && cfg2.threshold === 4 && cfg2.window === 20 && cfg2.unlockMin === 5);
  check('config : action invalide → repli lockdown', (() => { store.guildSettings.set(BOT, 'G_NEW', { antiraid_action: 'exploser' }); return antiraid.config(BOT, 'G_NEW').action === 'lockdown'; })());

  // ---------- 2. En dessous du seuil → rien ----------
  store.guildSettings.set(BOT, G, { antiraid_enabled: 1, antiraid_threshold: 5, antiraid_window: 30, antiraid_action: 'lockdown', antiraid_unlock_min: 0 });
  antiraid._test.joinTracker.clear();
  antiraid._test.setRaidState(G, null);
  for (let i = 0; i < 4; i++) await antiraid.onJoin(BOT, { id: 'u' + i, guild });
  check('détection : 4 arrivées (seuil 5) → rien', antiraid.raidState(G) === null);
  check('détection : aucun salon verrouillé', channels.every((c) => c.locked === false));

  // ---------- 3. Seuil atteint → verrouillage ----------
  await antiraid.onJoin(BOT, { id: 'u5', guild });
  const st = antiraid.raidState(G);
  check('détection : 5e arrivée → raid déclenché', !!st && st.count === 5);
  check('détection : 2 salons verrouillés (le 3e était déjà fermé)', channels.filter((c) => c.locked).length === 2);
  check('détection : action enregistrée', st.action === 'lockdown');
  check('détection : l\'état du lockdown suit', (() => { const lockdown = require('../server/discord/lockdown'); const s = lockdown.state(BOT, guild); return s.locked === true && s.channels.length === 2; })());

  // ---------- 4. Fenêtre expirée → purge (pas de faux positif) ----------
  antiraid._test.setRaidState(G, null);
  require('../server/discord/lockdown').off(BOT, guild, 'test');
  antiraid._test.joinTracker.clear();
  const now = Date.now();
  // 2 arrivées vieilles de 40 s (fenêtre 30) + 1 récente
  antiraid._test.joinTracker.set(`${BOT}:${G}`, [
    { ts: now - 40000, memberId: 'a' },
    { ts: now - 40000, memberId: 'b' },
  ]);
  await antiraid.onJoin(BOT, { id: 'recent', guild });
  check('détection : arrivées hors fenêtre purgées (pas de déclenchement)', antiraid.raidState(G) === null);

  // ---------- 5. Action « alert » ----------
  store.guildSettings.set(BOT, G, { antiraid_enabled: 1, antiraid_threshold: 2, antiraid_window: 30, antiraid_action: 'alert', antiraid_unlock_min: 0 });
  antiraid._test.joinTracker.clear();
  antiraid._test.setRaidState(G, null);
  await antiraid.onJoin(BOT, { id: 'x1', guild });
  await antiraid.onJoin(BOT, { id: 'x2', guild });
  const stAlert = antiraid.raidState(G);
  check('alerte : raid signalé sans verrouillage', !!stAlert && stAlert.action === 'alert' && stAlert.locked === 0);
  check('alerte : aucun salon verrouillé', channels.every((c) => c.locked === false));

  // ---------- 6. Réouverture automatique ----------
  store.guildSettings.set(BOT, G, { antiraid_enabled: 1, antiraid_threshold: 3, antiraid_window: 30, antiraid_action: 'lockdown', antiraid_unlock_min: 5 });
  antiraid._test.joinTracker.clear();
  antiraid._test.setRaidState(G, null);
  for (let i = 0; i < 3; i++) await antiraid.onJoin(BOT, { id: 'y' + i, guild });
  check('auto-unlock : verrouillé après déclenchement', channels.filter((c) => c.locked).length === 2);
  const trig = antiraid.raidState(G);
  check('auto-unlock : réouverture programmée', trig.unlockAt > 0);
  // 6 minutes plus tard → balayage → réouverture
  await antiraid.sweep(BOT, entry, new Date(Date.now() + 6 * 60000));
  check('auto-unlock : salons rouverts après la durée', channels.every((c) => c.locked === false));
  check('auto-unlock : état nettoyé', antiraid.raidState(G) === null);

  // ---------- 7. Réouverture manuelle ----------
  store.guildSettings.set(BOT, G, { antiraid_unlock_min: 0 });
  for (let i = 0; i < 3; i++) await antiraid.onJoin(BOT, { id: 'z' + i, guild });
  check('manuel : verrouillé à nouveau', channels.filter((c) => c.locked).length === 2);
  await antiraid.unlockNow(BOT, guild);
  check('manuel : réouverture immédiate', channels.every((c) => c.locked === false) && antiraid.raidState(G) === null);

  // ---------- 8. Désarmé → rien ----------
  store.guildSettings.set(BOT, G, { antiraid_enabled: 0, antiraid_threshold: 2 });
  antiraid._test.joinTracker.clear();
  for (let i = 0; i < 5; i++) await antiraid.onJoin(BOT, { id: 'd' + i, guild });
  check('désarmé : aucune détection', antiraid.raidState(G) === null && channels.every((c) => c.locked === false));

  // ---------- 9. État exposé ----------
  const stateExport = { config: antiraid.config(BOT, G), raid: antiraid.raidState(G) };
  check('état : config lisible par le dashboard', stateExport.config.enabled === false && stateExport.raid === null);

  // ---------- 10. Traductions ----------
  check('i18n FR : titre du raid', i18n.t('fr', 'raid_alert_title', { server: 'S' }).includes('RAID'));
  check('i18n EN : titre du raid', i18n.t('en', 'raid_alert_title', { server: 'S' }).includes('RAID'));
  check('i18n FR : description avec chiffres', i18n.t('fr', 'raid_alert_desc', { count: 10, window: 30 }).includes('10') && i18n.t('fr', 'raid_alert_desc', { count: 10, window: 30 }).includes('30'));
  check('i18n EN : description avec chiffres', i18n.t('en', 'raid_alert_desc', { count: 10, window: 30 }).includes('10'));

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v87 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Erreur fatale du test :', e); process.exit(1); });
