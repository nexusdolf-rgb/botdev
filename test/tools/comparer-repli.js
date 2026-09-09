// Comparaison des trois états de repli, onglet par onglet.
// Usage : node test/tools/comparer-repli.js
'use strict';
const { execSync } = require('child_process');

const CONFIGS = [
  ['Avant (tout ouvert)', '--tout-ouvert'],
  ['NOUVEAU défaut', ''],
  ['Tout replié', '--tout-plier'],
];

const mesurer = (flag) => {
  const out = execSync(`node ${__dirname}/audit-mobile.js 360 ${flag} 2>&1`, { encoding: 'utf8', maxBuffer: 1e8 });
  const parModule = {};
  out.split('\n').forEach((ligne) => {
    // Les emojis (🟠) cassent une lecture par expression régulière : on les
    // retire, puis on découpe aux espaces et on lit les colonnes.
    const propre = ligne.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
    const p = propre.split(' ');
    if (p.length < 9) return;
    if (!/^[a-z]+$/.test(p[0])) return;
    if (!/^\d+$/.test(p[1])) return;          // DÉBORD
    if (!/^[\d.]+$/.test(p[2])) return;       // ÉCRANS
    parModule[p[0]] = parseFloat(p[2]);
  });
  const total = (out.match(/hauteur cumulée ([\d.]+)/) || [])[1];
  return { parModule, total };
};

const resultats = CONFIGS.map(([nom, flag]) => ({ nom, ...mesurer(flag) }));
const modules = Object.keys(resultats[0].parModule);

console.log('');
console.log('  ONGLET'.padEnd(19) + resultats.map((r) => r.nom.padStart(15)).join('') + '      gain nouveau défaut');
console.log('  ' + '─'.repeat(84));
modules
  .sort((a, b) => (resultats[0].parModule[b] || 0) - (resultats[0].parModule[a] || 0))
  .forEach((k) => {
    const a = resultats[0].parModule[k] || 0;
    const b = resultats[1].parModule[k] || 0;
    const gain = a > 0 ? Math.round((1 - b / a) * 100) : 0;
    console.log('  ' + k.padEnd(19)
      + resultats.map((r) => ((r.parModule[k] || 0) + ' écrans').padStart(15)).join('')
      + ('−' + gain + ' %').padStart(16)
      + (a - b >= 1.5 ? '  ◀ gros gain' : ''));
  });
console.log('  ' + '─'.repeat(84));
console.log('  TOTAL'.padEnd(19)
  + resultats.map((r) => (r.total + ' écrans').padStart(15)).join('')
  + ('−' + Math.round((1 - resultats[1].total / resultats[0].total) * 100) + ' %').padStart(16));
console.log('');
console.log(`  ${modules.length} modules mesurés à 360 px (1 écran = 780 px de scroll).`);
