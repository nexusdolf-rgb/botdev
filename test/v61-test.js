// ============================================================
// Test Hoxera v61 — Reconnexion forcée du bot (le bug « hors ligne
// pour toujours ») + diagnostic public /health/bot
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v61-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const botManager = require('../server/discord/botManager');
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x-invalid', client_id: 'app1', prefix: '!' });

  // ---------- 1. Connexion morte : loginBot nettoie et retente ----------
  let destroyed = false;
  const deadClient = {
    isReady: () => false,
    destroy: () => { destroyed = true; },
  };
  botManager.clients.set(botId, { client: deadClient, startedAt: Date.now() - 15 * 60000 });
  let threw = false;
  try { await botManager.loginBot(botId); } catch (e) { threw = true; }
  check('connexion morte : détruite', destroyed === true);
  check('connexion morte : retirée de la mémoire', !botManager.clients.has(botId));
  check('connexion morte : une nouvelle tentative a eu lieu', threw === true); // token invalide dans le test → échec propre

  // ---------- 2. Connexion saine : on ne casse rien ----------
  let destroyed2 = false;
  botManager.clients.set(botId, {
    client: { isReady: () => true, destroy: () => { destroyed2 = true; } },
    startedAt: Date.now() - 1000,
  });
  const res = await botManager.loginBot(botId);
  check('connexion saine : « déjà connecté », rien de cassé', res.already === true && destroyed2 === false && botManager.clients.has(botId));

  // ---------- 3. reconnectBot : destruction + réactivation + retentative ----------
  destroyed2 = false;
  botManager.clients.set(botId, {
    client: { isReady: () => false, destroy: () => { destroyed2 = true; } },
    startedAt: Date.now() - 99999999,
  });
  store.bots.update(botId, { enabled: 0 });
  let threw3 = false;
  try { await botManager.reconnectBot(botId); } catch (e) { threw3 = true; }
  check('reconnectBot : connexion morte détruite', destroyed2 === true);
  check('reconnectBot : la tentative est passée par connect (erreur enregistrée)', threw3 === true && String(store.bots.get(botId).last_error || '').length > 0);
  check('reconnectBot : tentative de reconnexion lancée', threw3 === true); // token invalide → échec propre

  // ---------- 4. /health/bot : diagnostic public ----------
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3197', BOTDEV_DATA_DIR: process.env.BOTDEV_DATA_DIR, BOTDEV_GH_TOKEN: '', BOTDEV_DATA_REPO: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let diag = null;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch('http://localhost:3197/api/health/bot');
        if (r.ok) { diag = await r.json(); break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    check('health/bot : répond', !!diag);
    check('health/bot : processus en vie (uptime > 0)', diag && diag.processUptimeMs > 0);
    check('health/bot : le bot est listé', diag && Array.isArray(diag.bots) && diag.bots.some((b) => b.name === 'Hoxera'));
    check('health/bot : état des connexions exposé', diag && Array.isArray(diag.clients));
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }

  store.db.close();
  console.log(failures === 0 ? '\n✅ V61 — Reconnexion forcée + diagnostic : le bot ne peut plus rester hors ligne. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
