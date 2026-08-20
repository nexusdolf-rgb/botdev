// ============================================================
// Test Hoxera v83 — Auto-modération fiable à 100 %
//  1. Les admins/modérateurs sont épargnés par défaut (standard pro)
//  2. « Ignorer les admins » désactivable → l'auto-mod s'applique à tous
//  3. Liens supprimés (invitations Discord, http/https)
//  4. MAJUSCULES : long message >70 % supprimé, court tout-caps (« SALUT ») supprimé
//  5. Pas de faux positif : casse mixte, messages courts épargnés
//  6. Mentions au-delà de la limite supprimées, dans la limite épargnées
//  7. Liste noire : mot entier (insensible casse + accents), « salutations » épargné
//  8. Anti-spam : X messages / 5 s → timeout ; en dessous → rien
//  9. Échec de suppression → pas de crash, toujours « acted »
// 10. Messages de bots ignorés ; auto-mod désactivé → aucune action
// 11. La colonne am_ignore_staff existe et se règle
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v83-'));

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

  // ---------- Outils : fausses permissions + faux messages ----------
  const makePerms = (admin, manageMsg) => ({
    has: (flag) => {
      const F = require('discord.js').PermissionsBitField.Flags;
      if (admin && flag === F.Administrator) return true;
      if (manageMsg && flag === F.ManageMessages) return true;
      return false;
    },
  });
  const makeMsg = (content, opts = {}) => {
    const deleted = { done: false, err: null };
    const msg = {
      content,
      author: { bot: false, id: opts.uid || 'u1' },
      guild: { id: G },
      member: opts.noMember ? null : {
        permissions: makePerms(!!opts.admin, !!opts.mod),
        moderatable: opts.moderatable !== false,
        timeout: async () => { msg.timedOut = true; },
      },
      deletable: opts.deletable !== false,
      channel: { id: 'C1' },
      timedOut: false,
      delete: async () => { deleted.done = true; },
      _deleted: deleted,
    };
    return msg;
  };

  // ---------- 11. Colonne am_ignore_staff ----------
  const fresh = store.guildSettings.get(BOT, 'G_NEW') || {};
  check('db : am_ignore_staff absent par défaut → ignorer le staff', fresh.am_ignore_staff === undefined || fresh.am_ignore_staff === 1);
  store.guildSettings.set(BOT, 'G_NEW', { am_ignore_staff: 0 });
  check('db : am_ignore_staff=0 enregistré', store.guildSettings.get(BOT, 'G_NEW').am_ignore_staff === 0);

  // Config par défaut du test
  store.guildSettings.set(BOT, G, {
    am_enabled: 1, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 3,
    am_ignore_staff: 1, log_channel: '',
  });

  // ---------- 1. Staff épargné par défaut ----------
  const mAdminLink = makeMsg('viens ici https://discord.gg/hack', { admin: true });
  check('staff : admin avec lien → épargné', (await runAutomod(BOT, mAdminLink)).acted === false && !mAdminLink._deleted.done);
  const mModLink = makeMsg('viens ici https://discord.gg/hack', { mod: true });
  check('staff : modérateur avec lien → épargné', (await runAutomod(BOT, mModLink)).acted === false && !mModLink._deleted.done);

  // ---------- 2. Ignorer les admins DÉSACTIVÉ → tout le monde est filtré ----------
  store.guildSettings.set(BOT, G, { am_ignore_staff: 0 });
  const mAdminLink2 = makeMsg('viens ici https://discord.gg/hack', { admin: true });
  check('staff : admin avec lien, option désactivée → supprimé', (await runAutomod(BOT, mAdminLink2)).acted === true && mAdminLink2._deleted.done);
  store.guildSettings.set(BOT, G, { am_ignore_staff: 1 });

  // ---------- 3. Liens ----------
  resetSpam();
  store.guildSettings.set(BOT, G, { am_spam: 0 }); // spam testé à part (section 8)
  const mL1 = makeMsg('rejoignez https://discord.gg/abc123');
  check('lien : discord.gg supprimé', (await runAutomod(BOT, mL1)).acted === true && mL1._deleted.done);
  const mL2 = makeMsg('regarde https://exemple.com/page');
  check('lien : https:// supprimé', (await runAutomod(BOT, mL2)).acted === true && mL2._deleted.done);
  const mL3 = makeMsg('pas de lien ici');
  check('lien : message sans lien épargné', (await runAutomod(BOT, mL3)).acted === false);

  // ---------- 4 & 5. MAJUSCULES ----------
  resetSpam();
  const mC1 = makeMsg('CE MESSAGE EST BEAUCOUP TROP LONG ET EN MAJUSCULES');
  check('caps : long message en majuscules supprimé', (await runAutomod(BOT, mC1)).acted === true && mC1._deleted.done);
  const mC2 = makeMsg('SALUT');
  check('caps : court message « SALUT » supprimé', (await runAutomod(BOT, mC2)).acted === true && mC2._deleted.done);
  const mC3 = makeMsg('BONJOUR');
  check('caps : court message « BONJOUR » supprimé', (await runAutomod(BOT, mC3)).acted === true && mC3._deleted.done);
  const mC4 = makeMsg('Salut les amis');
  check('caps : casse normale épargnée', (await runAutomod(BOT, mC4)).acted === false);
  const mC5 = makeMsg('SALUt');
  check('caps : presque tout-caps mais pas 100 % → épargné', (await runAutomod(BOT, mC5)).acted === false);
  const mC6 = makeMsg('LOL');
  check('caps : « LOL » trop court (3 lettres) → épargné', (await runAutomod(BOT, mC6)).acted === false);
  const mC7 = makeMsg('OK');
  check('caps : « OK » trop court → épargné', (await runAutomod(BOT, mC7)).acted === false);
  const mC8 = makeMsg('12345');
  check('caps : chiffres seuls → épargné', (await runAutomod(BOT, mC8)).acted === false);

  // ---------- 6. Mentions ----------
  resetSpam();
  const five = '<@1> <@2> <@3> <@4> <@5>';
  const six = five + ' <@6>';
  const mM1 = makeMsg(six);
  check('mentions : 6 mentions (limite 5) → supprimé', (await runAutomod(BOT, mM1)).acted === true && mM1._deleted.done);
  const mM2 = makeMsg(five);
  check('mentions : 5 mentions (limite 5) → épargné', (await runAutomod(BOT, mM2)).acted === false);
  const mM3 = makeMsg('mention normale <@123>');
  check('mentions : 1 mention → épargné', (await runAutomod(BOT, mM3)).acted === false);

  // ---------- 7. Liste noire ----------
  resetSpam();
  store.blacklist.add(BOT, G, 'salut');
  store.blacklist.add(BOT, G, 'déjà');
  const mB1 = makeMsg('salut');
  check('liste noire : « salut » supprimé', (await runAutomod(BOT, mB1)).acted === true && mB1._deleted.done);
  const mB2 = makeMsg('SALUT !');
  check('liste noire : insensible à la casse', (await runAutomod(BOT, mB2)).acted === true && mB2._deleted.done);
  const mB3 = makeMsg('salutations à tous');
  check('liste noire : « salutations » (mot différent) épargné', (await runAutomod(BOT, mB3)).acted === false);
  const mB4 = makeMsg('il est déjà là');
  check('liste noire : mot accentué « déjà » supprimé', (await runAutomod(BOT, mB4)).acted === true && mB4._deleted.done);
  store.blacklist.remove(BOT, G, 'salut');
  store.blacklist.remove(BOT, G, 'déjà');

  // ---------- 8. Anti-spam ----------
  resetSpam();
  store.guildSettings.set(BOT, G, { am_spam: 3 });
  const spamUid = 'u-spam-1';
  let r1 = await runAutomod(BOT, makeMsg('msg un', { uid: spamUid }));
  let r2 = await runAutomod(BOT, makeMsg('msg deux', { uid: spamUid }));
  check('spam : 2 messages (limite 3) → rien', r1.acted === false && r2.acted === false);
  const mS3 = makeMsg('msg trois', { uid: spamUid });
  const r3 = await runAutomod(BOT, mS3);
  check('spam : 3e message en 5 s → timeout déclenché', r3.acted === true && r3.reason === 'spam' && mS3.timedOut === true);
  const mS4 = makeMsg('msg quatre', { uid: spamUid });
  const r4 = await runAutomod(BOT, mS4);
  check('spam : compteur remis à zéro après timeout', r4.acted === false);
  // autre utilisateur : indépendant
  const other = 'u-spam-2';
  await runAutomod(BOT, makeMsg('a', { uid: other }));
  await runAutomod(BOT, makeMsg('b', { uid: other }));
  const rOther3 = await runAutomod(BOT, makeMsg('c', { uid: other }));
  check('spam : compteur indépendant par membre', rOther3.acted === true);

  // ---------- 9. Échec de suppression → pas de crash ----------
  resetSpam();
  const mD1 = makeMsg('https://discord.gg/xyz', { deletable: false });
  const rD1 = await runAutomod(BOT, mD1);
  check('suppression impossible → pas de crash, toujours « acted »', rD1.acted === true);

  // ---------- 10. Bots ignorés + auto-mod désactivé ----------
  resetSpam();
  const mBot = makeMsg('https://discord.gg/bot');
  mBot.author.bot = true;
  check('message de bot → ignoré', (await runAutomod(BOT, mBot)).acted === false);
  store.guildSettings.set(BOT, G, { am_enabled: 0 });
  check('auto-mod désactivé → aucune action', (await runAutomod(BOT, makeMsg('https://discord.gg/x'))).acted === false);
  store.guildSettings.set(BOT, G, { am_enabled: 1 });

  console.log(failures ? `\n❌ ${failures} échec(s)` : '\n🎉 Tous les tests v83 passent');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('Erreur fatale du test :', e); process.exit(1); });
