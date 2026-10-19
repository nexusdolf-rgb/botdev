// ============================================================
// v374 — l'identité par serveur (nom, avatar, bannière, bio) est RETIRÉE.
//
// Le système entier disparaît : commande /botprofile, assistant, table de
// profils, routes du dashboard et onglet de personnalisation. Ce qui reste à
// garantir :
//   1. plus aucune référence vivante au système (fichiers, tables, routes) ;
//   2. les messages du bot continuent de partir, sans webhook d'identité ;
//   3. les joueurs de la suite qui en dépendaient ont été réancrés ;
//   4. /modlogs et /blacklist, qui vivaient dans le même fichier, répondent
//      toujours.
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v374-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const { handleProfileCommand } = require('../server/discord/profileCommands');
const { buildSlashPayloads, buildHelpPanel } = require('../server/discord/premade');

let ok = 0;
const echecs = [];
const check = (label, cond, detail) => {
  if (cond) { ok++; console.log('  ✅ ' + label); return; }
  echecs.push(label);
  console.log('  ❌ ' + label + (detail === undefined ? '' : ' — ' + String(detail).slice(0, 140)));
};

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const existe = (f) => fs.existsSync(path.join(RACINE, f));
const BOT = 1;
const GUILD = '150000000000003374';

async function main() {
  console.log('— 1. Les fichiers du système ont disparu —');
  check('identity.js supprimé', !existe('server/discord/identity.js'));
  check('profileWizard.js supprimé', !existe('server/discord/profileWizard.js'));

  console.log('— 2. Plus de commande, plus de table, plus de route —');
  const payloads = buildSlashPayloads(BOT);
  check('/botprofile absent des payloads', !payloads.some((p) => p.name === 'botprofile'));
  check('/modlogs et /blacklist toujours déclarés',
    payloads.some((p) => p.name === 'modlogs') && payloads.some((p) => p.name === 'blacklist'));
  const premade = lire('server/discord/premade.js');
  check('premade.js ne connaît plus botprofile', !/name: 'botprofile'/.test(premade));
  check('ADMIN_COMMAND_NAMES sans botprofile', !/ADMIN_COMMAND_NAMES[^;]*botprofile/s.test(premade));
  const db = lire('server/db.js');
  check('aucune table bot_profiles', !db.includes('bot_profiles'));
  check('aucune API botProfiles exportée', !/botProfiles,/.test(db));
  const routes = lire('server/routes.js');
  check('aucune route /profiles', !routes.includes("/guilds/:guildId/profiles'"));
  check('aucune route /profile-active', !routes.includes('/profile-active'));
  check('aucun payload profile_*', !/profile_active:|profiles_extra:|profile: store\.botProfiles/.test(routes));
  check('store sans API d’identité', !('botProfiles' in store) && !('profileAliases' in store) && !('profileState' in store));

  console.log('— 3. Le dispatcher et le dashboard ne routent plus l’identité —');
  const panels = lire('server/discord/panels.js');
  check('dispatcher : botprofile retiré', !panels.includes("'botprofile'"));
  check('dispatcher : plus de préfixe bpw', !panels.includes('bpw:'));
  const dash = lire('public/js/dashboard.js');
  check('dashboard : plus de section Identité', !dash.includes("data-go=\"botprofile\""));
  check('dashboard : plus de renderer botprofile', !/Dashboard\.renderers\.botprofile\s*=/.test(dash));
  check('dashboard : plus d’appel aux routes d’identité', !dash.includes('/guilds/${guildId}/profile'));

  console.log('— 4. Les envois ne passent plus par une identité locale —');
  const events = lire('server/discord/events.js');
  const xp = lire('server/discord/xp.js');
  const logging = lire('server/discord/logging.js');
  for (const [nom, src] of [['events.js', events], ['xp.js', xp], ['logging.js', logging], ['panels.js', panels]]) {
    check(`${nom} n’importe plus identity`, !/require\(['"]\.\/identity['"]\)/.test(src) && !/require\(['"]\.\.\/discord\/identity['"]\)/.test(src));
  }
  check('logging.js écrit directement dans le salon', /await channel\.send\(/ui.test(logging));

  console.log('— 5. /modlogs et /blacklist survivent au retrait —');
  store.guildSettings.set(BOT, GUILD, { log_channel: '#logs' });
  let reponse = null;
  const cmd = (name, sub, word) => ({
    guild: { id: GUILD, ownerId: 'OWNER1' },
    user: { id: 'OWNER1' },
    member: { permissions: { has: () => false } },
    commandName: name,
    options: {
      getSubcommand: () => sub,
      getString: () => word || null,
      getChannel: () => ({ isTextBased: () => true, name: 'logs', toString: () => '<#logs>' }),
    },
    reply: async (p) => { reponse = p; },
  });
  await handleProfileCommand(BOT, cmd('modlogs', 'set'));
  check('/modlogs set répond', /#logs/.test(JSON.stringify(reponse)));
  await handleProfileCommand(BOT, cmd('blacklist', 'add', 'spam123'));
  check('/blacklist add enregistre', store.blacklist.all(BOT, GUILD).includes('spam123'));
  await handleProfileCommand(BOT, cmd('blacklist', 'remove', 'spam123'));
  check('/blacklist remove efface', store.blacklist.all(BOT, GUILD).length === 0);

  console.log('— 6. Le centre d’aide ne promet plus une commande disparue —');
  const ui = require('../server/discord/ui');
  const clientUser = { user: { username: 'T', displayAvatarURL: () => 'https://cdn.example/a.png' } };
  const aide = JSON.stringify(buildHelpPanel(BOT, { prefix: '!' }, clientUser, null, null));
  check('/help ne mentionne plus /botprofile', !aide.includes('botprofile'));

  console.log(`\nRésultat : ${ok} ✅ / ${echecs.length} ❌ sur ${ok + echecs.length} vérifications`);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  if (echecs.length) { echecs.forEach((e) => console.log('  ❌ ' + e)); process.exit(1); }
  console.log('🎉 v374 — identité par serveur retirée, le reste intact.');
}

main().catch((e) => { console.error('Erreur fatale du test :', e.message); process.exit(1); });
