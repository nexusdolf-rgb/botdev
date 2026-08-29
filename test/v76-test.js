// ============================================================
// Test Hoxera v76 — Brique 2 « Fiabilité » : centre de santé
//  1. health.recordError journalise (anneau de 100) + filtre 24 h
//  2. snapshot() expose mémoire, plateforme, erreurs, base (sans secret)
//  3. /api/health/bot enrichi : mémoire, erreurs 24 h, dernière sauvegarde
//  4. Dashboard : la page « 🩺 Santé du bot » se rend (stats, mémoire,
//     base, garde-fous, erreurs) et s'actualise
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v76-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  // ---------- 1 & 2. Module health ----------
  const health = require('../server/health');
  health.recordError('test', 'erreur volontaire A');
  health.recordError('interaction', 'erreur volontaire B');
  // erreur « vieille » (hors 24 h)
  health.recordError('vieux', 'ancienne erreur');
  // On force l'âge de la dernière entrée
  const errs = health.errorsSince(0);
  errs[0].ts = Date.now() - 25 * 3600000;

  const last24 = health.errorsLast24h();
  check('health : erreurs récentes filtrées (24 h)', last24.length === 2);
  check('health : ordre (la plus récente en premier)', last24[0].message.includes('B'));
  check('health : source enregistrée', last24[0].source === 'interaction');
  check('health : la vieille erreur est exclue', !last24.some((e) => e.message.includes('ancienne')));

  const snap = health.snapshot();
  check('snapshot : mémoire exposée', snap.memory && typeof snap.memory.heapUsedMb === 'number');
  check('snapshot : plateforme exposée', snap.platform && typeof snap.platform.servers === 'number');
  check('snapshot : erreurs 24 h dans le snapshot', snap.errors24h && snap.errors24h.count >= 0);
  check('snapshot : base exposée', snap.db && typeof snap.db.fileSizeKo === 'number');
  check('snapshot : aucun secret (pas de token)', !JSON.stringify(snap).includes('MTUz') && !JSON.stringify(snap).includes('GhbOFX'));

  // ---------- 3. Route /health/bot enrichie ----------
  const store = require('../server/db');
  store.settings.set('last_backup', '2026-08-20T10:00:00.000Z');
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3195', BOTDEV_DATA_DIR: process.env.BOTDEV_DATA_DIR, BOTDEV_GH_TOKEN: '', BOTDEV_DATA_REPO: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let diag = null;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch('http://localhost:3195/api/health/bot');
        if (r.ok) { diag = await r.json(); break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    check('route : répond', !!diag);
    check('route : mémoire incluse', diag && diag.memory && typeof diag.memory.heapUsedMb === 'number');
    check('route : erreurs 24 h incluses', diag && diag.errors24h && typeof diag.errors24h.count === 'number');
    check('route : dernière sauvegarde exposée', diag && String(diag.lastBackup).includes('2026-08-20'));
    check('route : plateforme incluse', diag && diag.platform && typeof diag.platform.servers === 'number');
    check('route : base incluse', diag && diag.db && typeof diag.db.fileSizeKo === 'number');
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }

  // ---------- 4. Page dashboard « Santé » ----------
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', { url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
  w.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body) => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith('/api/health/bot')) return resp({
      processUptimeMs: 3720000,
      tokenConfigured: true, oauthConfigured: true, botCount: 1,
      bootRestore: 'ok', backupEnabled: true,
      lastBackup: '2026-08-20T10:00:00.000Z',
      db: { fileSizeKo: 252, tables: { bots: 1, tickets: 3, xp: 12 } },
      memory: { heapUsedMb: 78, heapTotalMb: 120, rssMb: 140 },
      errors24h: { count: 1, last: [{ source: 'interaction', message: 'erreur test', at: Date.now() - 60000 }] },
      platform: { servers: 6, members: 146 },
      queue: { waiting: 2, active: 1, processed: 340, failed: 0, refused: 0 },
      bots: [{ id: 1, name: 'Hoxera', enabled: true, last_error: '', username: 'Optimus Prime#2500' }],
      clients: [],
    });
    return resp({ ok: true });
  };
  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');
  w.eval(code + '\n;\n' + String.raw`
  window.__r = (async () => {
    Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!', online: true }, guildId: null, module: 'health' };
    const c = document.createElement('div');
    await Dashboard.renderers.health(c);
    await new Promise((r) => setTimeout(r, 400));
    return {
      online: c.textContent.includes('En ligne'),
      servers: c.textContent.includes('6') && c.textContent.includes('Serveurs'),
      uptime: c.textContent.includes('1h 2m'),
      memory: c.textContent.includes('78 Mo'),
      db: c.textContent.includes('252 Ko'),
      backup: c.textContent.includes('Sauvegarde active'),
      guards: c.textContent.includes('Anti-base-vide') && c.textContent.includes('Reconnexion forcée'),
      errors: c.textContent.includes('1 erreur') || c.textContent.includes('erreur(s)'),
      errorDetail: c.textContent.includes('erreur test'),
      queue: c.textContent.includes('File d\'attente') && c.textContent.includes('340'),
      cards: c.querySelectorAll('.dash-card').length,
    };
  })();
  `);
  await new Promise((r) => setTimeout(r, 2500));
  const res = await w.__r;
  console.log(JSON.stringify(res, null, 2));
  const ok = res.online && res.servers && res.uptime && res.memory && res.db && res.backup && res.guards && res.errors && res.errorDetail && res.cards === 5 && res.queue;

  store.db.close();
  console.log(ok && failures === 0 ? '\n✅ V76 — Brique 2 « Centre de santé » : 100 % fonctionnel. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(ok && failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
