// Test de roundtrip RÉEL contre GitHub (branche backup, base factice)
// ⚠️ ATTENTION : à lancer UNIQUEMENT avec un dépôt de TEST dans BOTDEV_DATA_REPO,
// jamais le dépôt de production (le garde-fou « base vide » protège, mais ne
// tentez pas le diable). Test MANUEL — exclu de la suite automatique.
// Usage : BOTDEV_DATA_DIR=/tmp/ghbktest/data BOTDEV_GH_TOKEN=... node test/github-roundtrip.js
const fs = require('fs');
const Database = require('better-sqlite3');

(async () => {
  // 0. Nettoyage d'un éventuel passage précédent (sinon « table fake already exists »)
  fs.rmSync('/tmp/ghbktest', { recursive: true, force: true });

  // 1. Base factice (aucun secret)
  const fakePath = '/tmp/ghbktest/fake.db';
  fs.mkdirSync('/tmp/ghbktest/data', { recursive: true });
  const seed = new Database(fakePath);
  seed.exec("CREATE TABLE fake (id INTEGER, nom TEXT); INSERT INTO fake VALUES (42, 'test-real'), (7, 'nexora');");
  seed.close();
  fs.copyFileSync(fakePath, '/tmp/ghbktest/data/botdev.db');

  // 2. Upload réel
  const store = require('../server/db');
  const backup = require('../server/backup');
  await backup.upload(store.db);
  console.log('→ upload vers GitHub OK');

  // 3. Download réel + preuve : la base téléchargée s'ouvre avec les données
  const buf = await backup.download();
  if (!buf) { console.error('❌ download null'); process.exit(1); }
  fs.writeFileSync('/tmp/ghbktest/from-github.db', buf);
  const check = new Database('/tmp/ghbktest/from-github.db', { readonly: true });
  const rows = check.prepare('SELECT * FROM fake ORDER BY id').all();
  check.close();
  if (rows.length === 2 && rows[0].nom === 'nexora' && rows[1].nom === 'test-real') {
    console.log("✅ ROUNDTRIP GITHUB RÉEL VALIDÉ — la base téléchargée s'ouvre et contient :", JSON.stringify(rows));
    process.exit(0);
  }
  console.error('❌ données incorrectes :', rows);
  process.exit(1);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
