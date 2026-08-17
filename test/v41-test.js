// ============================================================
// Test Hoxera v41 — Badge « Supports Commands (/) » du bot
// Les commandes par serveur ne déclenchent pas le badge : il faut
// au moins UNE commande enregistrée GLOBALEMENT. Ce test vérifie
// que le lot global (help, invite, ping, botinfo) est bien envoyé
// à la bonne route Discord.
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v41-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const botManager = require('../server/discord/botManager');

  // Bot de test + modules par défaut activés (help/ping/invite/botinfo)
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'app123', prefix: '!' });
  for (const k of ['moderation', 'utility']) store.modules.set(botId, k, 1);

  // Faux client prêt, dont le rest capture l'appel Discord
  const captured = [];
  const fakeEntry = {
    client: {
      isReady: () => true,
      user: { id: 'bot-user-id' },
      rest: {
        put: async (route, opts) => { captured.push({ route, opts }); return {}; },
      },
    },
  };
  botManager.clients.set(botId, fakeEntry);

  await botManager.syncGlobalCommands(botId);

  check('une requête envoyée', captured.length === 1);
  check('route globale (pas par serveur)', captured[0].route === '/applications/app123/commands');
  const names = (captured[0].opts.body || []).map((p) => p.name);
  check('4 commandes globales', names.length === 4);
  ['help', 'invite', 'ping', 'botinfo'].forEach((n) => check(`contient /${n}`, names.includes(n)));
  check('aucune commande de modération dans le lot global', !names.includes('ban') && !names.includes('kick'));

  store.db.close();
  console.log(failures === 0 ? '\n✅ V41 — Commandes globales enregistrées : le badge « Supports Commands (/) » va apparaître. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
