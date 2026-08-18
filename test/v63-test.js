// ============================================================
// Test Hoxera v63 — Garde-fous anti-catastrophe (base vide)
//  1. restore() refuse une sauvegarde distante sans bot
//  2. upload() refuse d'écraser la bonne sauvegarde par une base vide
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v63-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  // ---------- 1. restore() : base distante vide → refusée ----------
  process.env.BOTDEV_GH_TOKEN = 'fake-token';
  process.env.BOTDEV_DATA_REPO = 'fake/repo';
  const backup = require('../server/backup');

  // Base distante vide (0 bot)
  const Database = require('better-sqlite3');
  const emptyDb = new Database(path.join(process.env.BOTDEV_DATA_DIR, 'empty.db'));
  emptyDb.exec(`CREATE TABLE bots (id INTEGER PRIMARY KEY, name TEXT, token TEXT, client_id TEXT, prefix TEXT, user_id INTEGER, status_text TEXT, status_type TEXT, avatar_url TEXT, bot_username TEXT, enabled INTEGER, last_error TEXT, created_at TEXT)`);
  emptyDb.close();
  const emptyBuf = fs.readFileSync(path.join(process.env.BOTDEV_DATA_DIR, 'empty.db'));

  // Remplace download() par une version qui renvoie la base vide
  const origDownload = backup.download;
  backup.download = async () => emptyBuf;
  const r1 = await backup.restore();
  backup.download = origDownload;
  check('restore : base distante vide → refusée', r1 === false);

  // Base distante saine (1 bot) → acceptée
  const goodDb = new Database(path.join(process.env.BOTDEV_DATA_DIR, 'good.db'));
  goodDb.exec(`CREATE TABLE bots (id INTEGER PRIMARY KEY, name TEXT, token TEXT, client_id TEXT, prefix TEXT, user_id INTEGER, status_text TEXT, status_type TEXT, avatar_url TEXT, bot_username TEXT, enabled INTEGER, last_error TEXT, created_at TEXT);
    INSERT INTO bots (id, name, token, client_id, prefix, user_id, enabled) VALUES (1, 'Hoxera', 't', 'c', '!', 1, 1);`);
  goodDb.close();
  const goodBuf = fs.readFileSync(path.join(process.env.BOTDEV_DATA_DIR, 'good.db'));
  backup.download = async () => goodBuf;
  const r2 = await backup.restore();
  backup.download = origDownload;
  check('restore : base distante saine → acceptée', r2 === true);

  // ---------- 2. upload() : base locale vide → sauvegarde annulée ----------
  const store = require('../server/db');
  // La restauration ci-dessus a écrit la base « bonne » dans le fichier
  // local → on repart d'une base réellement vide pour ce test.
  store.db.prepare('DELETE FROM bots').run();
  let putCalls = 0;
  const origGhJson = backup.ghJson;
  backup.ghJson = async (route, opts = {}) => {
    if (String(route).includes('/contents/')) {
      if (opts.method !== 'PUT') return { sha: 'abc123' }; // GET meta → le fichier distant existe
      putCalls++;
      return { ok: true };
    }
    return {};
  };
  const r3 = await backup.upload(store.db);
  backup.ghJson = origGhJson;
  check('upload : base locale vide → AUCUN écrasement du distant', r3 === false && putCalls === 0);

  // Avec un bot → l'upload passe
  store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
  backup.ghJson = async (route, opts = {}) => {
    if (String(route).includes('/contents/')) {
      if (opts.method !== 'PUT') return { sha: 'abc123' };
      putCalls++;
      return { ok: true };
    }
    return {};
  };
  const r4 = await backup.upload(store.db);
  backup.ghJson = origGhJson;
  check('upload : base avec bot → sauvegarde effectuée', r4 === true && putCalls === 1);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V63 — Garde-fous anti-catastrophe : une base vide ne peut plus rien détruire. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
