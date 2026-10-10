// Test MANUEL de roundtrip contre un dépôt de TEST uniquement.
// Ne fournis jamais ici le dépôt GitHub de production.
// Usage : BOTDEV_GH_TOKEN=... BOTDEV_DATA_REPO=owner/test-repo node test/github-roundtrip.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-github-roundtrip-'));
const dataDir = path.join(tempRoot, 'data');
const fakePath = path.join(tempRoot, 'fake.db');
const downloadedPath = path.join(tempRoot, 'from-github.db');
process.env.BOTDEV_DATA_DIR = dataDir;
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

(async () => {
  try {
    const seed = new Database(fakePath);
    seed.exec("CREATE TABLE fake (id INTEGER, nom TEXT); INSERT INTO fake VALUES (42, 'test-real'), (7, 'hoxera-test');");
    seed.close();
    fs.copyFileSync(fakePath, path.join(dataDir, 'botdev.db'));

    const store = require('../server/db');
    const backup = require('../server/backup');
    if (!backup.enabled()) throw new Error('Configure un PAT et un dépôt de test privé.');
    const uploaded = await backup.upload(store.db);
    if (!uploaded) throw new Error('Upload refusé par les garde-fous; vérifie que le dépôt de test est vide.');
    console.log('→ upload vers le dépôt de test terminé');

    const buffer = await backup.download();
    if (!buffer) throw new Error('Téléchargement vide.');
    fs.writeFileSync(downloadedPath, buffer, { mode: 0o600 });
    const check = new Database(downloadedPath, { readonly: true, fileMustExist: true });
    const rows = check.prepare('SELECT * FROM fake ORDER BY id').all();
    check.close();
    if (rows.length !== 2 || rows[0].nom !== 'hoxera-test' || rows[1].nom !== 'test-real') {
      throw new Error(`Données de test incorrectes : ${JSON.stringify(rows)}`);
    }
    console.log('✅ Roundtrip GitHub de test validé.');
  } finally {
    try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
  }
})().catch((error) => {
  console.error('❌', error.message);
  process.exit(1);
});
