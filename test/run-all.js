#!/usr/bin/env node
// ============================================================
// 🧪 Lanceur de la suite de tests complète — LE garde-fou.
// Usage : node test/run-all.js
// Règle d'or : AUCUN push en production si ce script échoue.
//
// - Exécute tous les tests de test/*.js (ordre alphabétique)
// - Ignore les tests manuels (besoin de secrets/réseau) et lui-même
// - Les tests obsolètes vivent dans test/legacy/ (non exécutés)
// - Code de sortie 0 = tout vert, 1 = au moins un échec
// ============================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Tests manuels : nécessitent des identifiants réels / le réseau.
// À lancer à la main : BOTDEV_GH_TOKEN=... node test/github-roundtrip.js
const MANUAL = new Set(['github-roundtrip.js', 'run-all.js']);

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.js') && !MANUAL.has(f))
  .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

let pass = 0, fail = 0;
const failed = [];
const t0 = Date.now();

for (const f of files) {
  const p = path.join(dir, f);
  process.stdout.write(`▶ ${f} ... `);
  try {
    execFileSync(process.execPath, [p], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    pass++;
    console.log('✅');
  } catch (e) {
    fail++;
    failed.push(f);
    console.log('❌');
    const out = ((e.stdout || '') + '\n' + (e.stderr || '')).toString().trim().split('\n').slice(-8).join('\n');
    console.log('   └─ dernières lignes :\n' + out.replace(/^/gm, '     '));
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n' + '='.repeat(50));
console.log(`Résultat : ${pass} ✅ / ${fail} ❌  (${files.length} tests, ${secs}s)`);
if (fail > 0) {
  console.log('Échecs : ' + failed.join(', '));
  console.log('🚫 NE PAS DÉPLOYER tant que ce n\'est pas corrigé.');
  process.exit(1);
}
console.log('🎉 Suite complète verte — déploiement autorisé.');
