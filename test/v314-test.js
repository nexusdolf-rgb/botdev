// v314 — Liste noire de mots : la suppression doit VRAIMENT partir.
// Bug fondateur : ajouter + enregistrer, puis corbeille, puis rafraîchir →
// le mot revenait et le bot continuait de sanctionner. Cause : la corbeille
// ne faisait que modifier l'écran, sans écrire en base.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v314-'));
process.env.BOTDEV_DATA_DIR = TMP;

const store = require('../server/db');
const { runAutomod } = require('../server/discord/automod');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const js = racine('public/js/dashboard.js');
const routes = racine('server/routes.js');
const db = racine('server/db.js');
const html = racine('public/index.html');
const sw = racine('public/sw.js');

console.log('— 1. Pins de version v314 —');
check('index.html : ?v=328 ×7', (html.match(/\?v=328/g) || []).length === 7);
check('sw.js : cache botdev-v328', sw.includes("const CACHE = 'botdev-v328';"));
check('index.html : plus aucune ?v=313', !html.includes('?v=313'));

console.log('— 2. Dashboard : suppression vraiment enregistrée —');
check('plus de superposition brouillon sur la liste noire', !js.includes('automodDraft && Array.isArray(automodDraft.blacklist)'));
check('les mots viennent du serveur (data.blacklist)', js.includes('const blacklist = data.blacklist || [];'));
check('persistBlacklistWords appelle PUT /automod/words', js.includes('/automod/words') && js.includes('persistBlacklistWords'));
check('la corbeille enregistre tout de suite', js.includes('await persistBlacklistWords()'));
check('bouton Enregistrer la liste noire', js.includes('id="bl-save"') && js.includes('Enregistrer la liste noire'));
check('si l’enregistrement échoue, le mot est remis', js.includes('blacklistData.splice(i, 0, removed)'));

console.log('— 3. API + base —');
check('store.blacklist.replace existe', db.includes('replace: (botId, guildId, list)'));
check('route PUT /automod/words', routes.includes("router.put('/bots/:id/guilds/:guildId/automod/words'"));
check('PUT /automod (global) passe par replace', routes.includes('store.blacklist.replace(bot.id, guildId, blacklist)'));

console.log('— 4. Comportement : vider la liste arrête les sanctions —');
(async () => {
  const botId = Number(store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'G314';
  store.guildSettings.set(botId, G, { am_enabled: 1, am_mode: 'enforce', am_ignore_staff: 0 });
  const saved = store.blacklist.replace(botId, G, ['Arnaque', 'a', '  SPAM  ', 'arnaque']);
  check('replace normalise (minuscule, ≥2 lettres, sans doublon)', JSON.stringify(saved) === JSON.stringify(['arnaque', 'spam']), JSON.stringify(saved));

  let deleted = false;
  const msg = {
    author: { id: 'U1', bot: false },
    guild: { id: G, name: 'Serveur', ownerId: 'OWNER', channels: { cache: { get: () => undefined, find: () => undefined } } },
    member: { permissions: { has: () => false } },
    content: 'c’est une arnaque totale',
    deletable: true,
    delete: async () => { deleted = true; },
    channel: { id: 'C9' },
  };
  const before = await runAutomod(botId, msg);
  check('tant que le mot est en base, le message est sanctionné', !!(before && before.acted && deleted), JSON.stringify(before));

  const emptied = store.blacklist.replace(botId, G, []);
  check('replace([]) vide vraiment la table', emptied.length === 0 && store.blacklist.all(botId, G).length === 0, JSON.stringify(emptied));
  deleted = false;
  const after = await runAutomod(botId, { ...msg, delete: async () => { deleted = true; } });
  check('liste vide → plus aucune sanction sur ce mot', !deleted && !(after && after.acted), JSON.stringify(after));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  console.log('\n✅ v314 : ' + ok + ' vérifications passed.');
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
