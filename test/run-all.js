#!/usr/bin/env node
// Lance la suite dans des processus isolés. Tous les temporaires créés par
// os.tmpdir() sont confinés à un répertoire unique, supprimé à la fin.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MANUAL = new Set(['github-roundtrip.js', 'run-all.js']);
const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter((file) => file.endsWith('.js') && !MANUAL.has(file))
  .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-suite-'));
const childEnv = { ...process.env, TMPDIR: tempRoot };

let pass = 0;
let fail = 0;
const failed = [];
const startedAt = Date.now();

try {
  for (const file of files) {
    const testPath = path.join(dir, file);
    process.stdout.write(`▶ ${file} ... `);
    try {
      execFileSync(process.execPath, [testPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000,
        env: childEnv,
      });
      pass++;
      console.log('✅');
    } catch (error) {
      fail++;
      failed.push(file);
      console.log('❌');
      const output = ((error.stdout || '') + '\n' + (error.stderr || '')).toString().trim().split('\n').slice(-10).join('\n');
      console.log('   └─ dernières lignes :\n' + output.replace(/^/gm, '     '));
    }
  }
} finally {
  try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (error) {
    console.error(`⚠️ Nettoyage du répertoire temporaire impossible (${error.code || 'erreur'}).`);
    fail++;
  }
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log('\n' + '='.repeat(50));
console.log(`Résultat : ${pass} ✅ / ${fail} ❌ (${files.length} tests, ${seconds}s)`);
if (failed.length) console.log('Échecs : ' + failed.join(', '));
if (fail > 0) {
  console.log('🚫 NE PAS DÉPLOYER tant que les échecs ne sont pas corrigés.');
  process.exit(1);
}
console.log('🎉 Suite complète verte. Cela ne remplace pas une revue humaine ni les vérifications de déploiement.');
