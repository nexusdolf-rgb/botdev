// ============================================================
// Test Hoxera v84 — Auto-mod garanti et visible
//  1. Avertissement MP sur chaque suppression (liens, caps, mentions, mot)
//  2. Traductions FR/EN selon la langue du serveur
//  3. Texte d'avertissement personnalisé ({reason} / {server})
//  4. MP fermés → repli journal + trace dans l'historique (jamais silencieux)
//  5. Message non supprimable → MP explicatif + toujours « acted »
//  6. Anti-spam : messages supprimés + timeout durée réglable + MP
//  7. Mode test forcé (bot = auteur) : pas de MP, résultat correct
//  8. Historique automod_logs enregistré et relu
//  9. getGuildPerms : permissions réelles (online/offline)
// 10. Purge automatique de l'historique (30 jours)
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v84-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const automod = require('../server/discord/automod');
  const { runAutomod } = automod;
  const resetSpam = () => automod._test.spamTracker.clear();
  const BOT = 1, G = 'G1';

  // ---------- Fakes ----------
  const makePerms = (admin, manageMsg) => ({
    has: (flag) => {
      const F = require('discord.js').PermissionsBitField.Flags;
      if (admin && flag === F.Administrator) return true;
      if (manageMsg && flag === F.ManageMessages) return true;
      return false;
    },
  });
  const makeMsg = (content, opts = {}) => {
    const dms = [];
    const msg = {
      content,
      author: {
        bot: !!opts.botAuthor,
        id: opts.uid || 'u1',
        tag: opts.tag || 'Membre#0001',
        username: 'Membre',
        send: async (payload) => {
          if (opts.dm === 'fail') throw new Error('MP fermés');
          dms.push(payload); return { id: 'dm1' };
        },
      },
      guild: {
        id: G,
        name: 'Serveur Test',
        channels: { cache: new Map(), find: null },
      },
      member: opts.noMember ? null : {
        permissions: makePerms(!!opts.admin, !!opts.mod),
        moderatable: opts.moderatable !== false,
        timeout: async () => { msg.timedOut = true; },
      },
      deletable: opts.deletable !== false,
      channel: { id: opts.channelId || 'C1', name: 'général' },
      timedOut: false,
      deleted: false,
      delete: async () => { msg.deleted = true; },
      _dms: dms,
    };
    return msg;
  };

  // Config de base
  store.guildSettings.set(BOT, G, {
    am_enabled: 1, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 0,
    am_ignore_staff: 1, am_warn_text: '', am_timeout_min: 5, log_channel: '',
  });

  // ---------- 1. Avertissement MP sur chaque type ----------
  resetSpam();
  const mLink = makeMsg('viens https://discord.gg/hack');
  const rLink = await runAutomod(BOT, mLink);
  check('link : supprimé + MP envoyé', rLink.acted === true && mLink.deleted === true && mLink._dms.length === 1);
  check('link : le MP contient la raison « lien »', mLink._dms[0].content.includes('lien'));

  resetSpam();
  const mCaps = makeMsg('CE MESSAGE EST EN MAJUSCULES');
  const rCaps = await runAutomod(BOT, mCaps);
  check('caps : supprimé + MP avec « majuscules »', rCaps.acted === true && mCaps.deleted && mCaps._dms[0].content.includes('majuscules'));

  resetSpam();
  const mMen = makeMsg('<@1> <@2> <@3> <@4> <@5> <@6>');
  const rMen = await runAutomod(BOT, mMen);
  check('mentions : supprimé + MP avec « mentions »', rMen.acted === true && mMen.deleted && mMen._dms[0].content.includes('mentions'));

  resetSpam();
  store.blacklist.add(BOT, G, 'salut');
  const mWord = makeMsg('salut');
  const rWord = await runAutomod(BOT, mWord);
  check('mot interdit : supprimé + MP avec le mot', rWord.acted === true && mWord.deleted && mWord._dms[0].content.includes('salut'));
  store.blacklist.remove(BOT, G, 'salut');

  check('MP : contient le nom du serveur', mLink._dms[0].content.includes('Serveur Test'));

  // ---------- 2. Traduction EN ----------
  resetSpam();
  store.guildSettings.set(BOT, G, { lang: 'en' });
  const mEn = makeMsg('check https://discord.gg/en');
  const rEn = await runAutomod(BOT, mEn);
  check('EN : le MP est en anglais (« Reason »)', rEn.acted === true && mEn._dms[0].content.includes('Reason') && mEn._dms[0].content.includes('link'));
  store.guildSettings.set(BOT, G, { lang: 'fr' });

  // ---------- 3. Texte personnalisé ----------
  resetSpam();
  store.guildSettings.set(BOT, G, { am_warn_text: '⚠️ Serveur {server} : message supprimé ({reason}).' });
  const mCust = makeMsg('https://custom.test');
  const rCust = await runAutomod(BOT, mCust);
  check('personnalisé : variables {reason} et {server} remplacées', rCust.acted === true && mCust._dms[0].content.startsWith('⚠️ Serveur Serveur Test : message supprimé (lien non autorisé).') && mCust._dms[0].content.includes('Avertissement'));
  store.guildSettings.set(BOT, G, { am_warn_text: '' });

  // ---------- 4. MP fermés → repli journal + historique ----------
  resetSpam();
  const logSends = [];
  const logChannel = { name: 'logs', isTextBased: () => true, send: async (p) => { logSends.push(p); return { id: 'l1' }; } };
  store.guildSettings.set(BOT, G, { log_channel: '#logs' });
  const mDmFail = makeMsg('https://dm.closed', { dm: 'fail' });
  const gFail = { ...mDmFail.guild };
  const coll = (map) => ({ get: (id) => map.get(id), has: (id) => map.has(id), find: (fn) => [...map.values()].find(fn) || null, values: () => map.values() });
  gFail.channels = { cache: coll(new Map([['LOGS', logChannel]])) };
  mDmFail.guild = gFail;
  const rFail = await runAutomod(BOT, mDmFail);
  check('MP fermés : suppression maintenue', rFail.acted === true && mDmFail.deleted === true);
  check('MP fermés : repli dans le salon de journaux', logSends.length >= 1 && logSends.some((p) => JSON.stringify(p).includes('fermés')));
  const recent = store.automodLogs.recent(BOT, G, 10);
  check('MP fermés : trace dans l\'historique dashboard', recent.length >= 1);
  store.guildSettings.set(BOT, G, { log_channel: '' });

  // ---------- 5. Non supprimable → MP explicatif ----------
  resetSpam();
  const mNoDel = makeMsg('https://nodelete.test', { deletable: false });
  const rNoDel = await runAutomod(BOT, mNoDel);
  check('non supprimable : toujours « acted »', rNoDel.acted === true && rNoDel.deleted === false);
  check('non supprimable : MP explique le problème de permission', mNoDel._dms[0].content.includes('permission'));

  // ---------- 6. Anti-spam complet ----------
  resetSpam();
  store.guildSettings.set(BOT, G, { am_spam: 3, am_timeout_min: 10 });
  const uid = 'u-spam';
  const s1 = makeMsg('spam 1', { uid });
  const s2 = makeMsg('spam 2', { uid });
  await runAutomod(BOT, s1);
  await runAutomod(BOT, s2);
  const s3 = makeMsg('spam 3', { uid });
  const rS = await runAutomod(BOT, s3);
  check('spam : déclenché au 3e message', rS.acted === true && rS.reason === 'spam');
  check('spam : les messages du spammeur sont supprimés', s1.deleted === true && s2.deleted === true && s3.deleted === true);
  check('spam : timeout appliqué', s3.timedOut === true);
  check('spam : MP avec la durée réglée (10 min)', s3._dms[0].content.includes('10'));
  store.guildSettings.set(BOT, G, { am_spam: 0, am_timeout_min: 5 });

  // ---------- 7. Mode test forcé ----------
  resetSpam();
  const mForce = makeMsg('TEST AUTOMOD FORCÉ', { botAuthor: true });
  const rForce = await runAutomod(BOT, mForce, { force: true, noDm: true });
  check('force : message de bot analysé quand forcé', rForce.acted === true && mForce.deleted === true);
  check('force : aucun MP envoyé (noDm)', mForce._dms.length === 0);
  const mBotNorm = makeMsg('TEST BOT NORMAL', { botAuthor: true });
  check('sans force : message de bot ignoré', (await runAutomod(BOT, mBotNorm)).acted === false);

  // ---------- 8. Historique ----------
  const all = store.automodLogs.recent(BOT, G, 50);
  check('historique : des entrées existent avec raison', all.length >= 3 && all[0].reason && all[0].user_tag);

  // ---------- 9. getGuildPerms ----------
  const botManager = require('../server/discord/botManager');
  const F = require('discord.js').PermissionsBitField.Flags;
  const allowed = new Set([F.ManageMessages, F.Administrator]);
  botManager.clients.set(BOT, { client: { isReady: () => true, guilds: { cache: { get: () => ({ members: { me: { permissions: { has: (f) => allowed.has(f) } } } }) } } } });
  const perms = botManager.getGuildPerms(BOT, G);
  check('permissions : ManageMessages détectée', perms.online === true && perms.perms.manageMessages === true && perms.perms.administrator === true);
  check('permissions : ModerateMembers absente détectée', perms.perms.moderateMembers === false);
  botManager.clients.set(BOT, { client: { isReady: () => false } });
  check('permissions : bot hors ligne signalé', botManager.getGuildPerms(BOT, G).online === false);
  botManager.clients.delete(BOT);

  // ---------- 10. Purge de l'historique (30 jours) ----------
  store.db.prepare('INSERT INTO automod_logs (bot_id, guild_id, user_id, reason, content, created_at) VALUES (?,?,?,?,?,?)').run(BOT, G, 'u9', 'ancien', 'vieux', '2026-01-01 00:00:00');
  const maintenance = require('../server/maintenance');
  const report = maintenance.purgeOldData(store.db);
  check('purge : ancienne entrée d\'auto-mod supprimée', (report.automod_logs || 0) >= 1);

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v84 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Erreur fatale du test :', e); process.exit(1); });
