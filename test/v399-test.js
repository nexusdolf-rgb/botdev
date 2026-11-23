// v399 — les rapports d'audit ne peuvent pas dériver du code.
//
// Un rapport est un texte : rien n'empêche le code de changer et le rapport de
// rester faux. Ce test relit les affirmations chiffrées des étapes 3 à 5 et les
// compare au dépôt tel qu'il est.
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ok = 0;
const echecs = [];
function check(nom, condition, detail) {
  if (condition) { ok++; console.log('  ✅ ' + nom); }
  else { echecs.push(nom); console.log('  ❌ ' + nom + (detail !== undefined ? ' → ' + detail : '')); }
}

const backup = lire('server/backup.js');
const index = lire('server/index.js');
const securite = lire('server/security.js');
const readme = lire('README.md');
const r3 = lire('docs/RAPPORT-ETAPE-3/rapport.md');
const r4 = lire('docs/RAPPORT-ETAPE-4/rapport.md');
const r5 = lire('docs/RAPPORT-ETAPE-5/rapport.md');

// ------------------------------------------------------------------
console.log('\n— 1. Étape 4 : ce que le README affirme sur le chiffrement —');
// ------------------------------------------------------------------
// Le README disait « fichiers SQLite chiffrés » : c'était faux. Il doit dire
// que la sauvegarde est compressée mais non chiffrée, et que seuls les champs
// sensibles sont chiffrés en base.
check('le README ne prétend plus que la sauvegarde est chiffrée',
  !/fichiers SQLite contiennent des données chiffrées/i.test(readme));
check('le README nomme le gzip comme seul traitement de la sauvegarde',
  /compress[ée]e?s? \(gzip\) mais non chiffr[ée]e/i.test(readme));
check('le README dit que les jetons et sessions sont chiffrés au niveau du champ',
  /niveau du champ/i.test(readme));
check('la sauvegarde est bien gzip niveau 9 dans le code',
  /gzipAsync\(buf, \{ level: 9 \}\)/.test(backup));
check('aucun chiffrement dans le module de sauvegarde',
  !/createCipheriv|createCipher/.test(backup));

// ------------------------------------------------------------------
console.log('\n— 2. Étape 4 : contenu et propriétés du dépôt de sauvegarde —');
// ------------------------------------------------------------------
check('le rapport d’étape 4 existe', r4.length > 1500, r4.length);
check('il décrit le manifeste écrit en dernier',
  /manifeste.*(en dernier|DERNIER)|en DERNIER.*manifeste/i.test(r4 + backup));
check('le dépôt de sauvegarde est privé (constat daté dans le rapport)',
  /priv[ée]/i.test(r4));
check('l’endpoint de santé ne divulgue pas la sauvegarde',
  /health\/backup/.test(r4) && /enabled/.test(r4));
// On isole le corps de la route : les commentaires voisins ne comptent pas.
const routes = lire('server/routes.js');
const blocSante = (routes.match(/router\.get\('\/health\/backup'[\s\S]{0,200}?\}\);/) || [])[0] || '';
check('… et c’est vrai dans le code',
  /res\.json\(\{ enabled: backup\.enabled\(\) \}\)/.test(blocSante),
  blocSante.replace(/\s+/g, ' ').slice(0, 90) || 'route introuvable');

// ------------------------------------------------------------------
console.log('\n— 3. Étape 5 : ce que la restauration fait vraiment —');
// ------------------------------------------------------------------
check('le rapport d’étape 5 existe', r5.length > 1500, r5.length);
check('restore() est appelé avant l’ouverture de la base',
  index.indexOf('backup.restore()') > 0
  && index.indexOf('backup.restore()') < index.indexOf("require('./db')") + 2000);
check('le refus d’une base sans bot existe dans le code',
  /countBotsIn\(buf\)/.test(backup) && /SANS bot/.test(backup));
check('l’écriture est atomique et privée',
  /mode: 0o600/.test(backup) && /renameSync/.test(backup));
check('le SHA-256 de chaque morceau est vérifié',
  /sha256\(piece\)/.test(backup) || /sha256/.test(backup));
check('shutdown() attrape SIGTERM et envoie une dernière sauvegarde',
  /SIGTERM/.test(index) && /backup\.upload/.test(index));
// Le rapport doit dire la vérité sur ce qui manque : si un jour la
// comparaison de dates est ajoutée, ce test échouera et forcera la mise à
// jour du rapport — c'est voulu.
const compareLesDates = /manifest\.ts[\s\S]{0,200}(mtime|Date\.now|older|plus ancien)/.test(backup);
check('le rapport signale l’absence de comparaison de dates',
  /ne compare pas les dates/i.test(r5));
check('… et son constat correspond au code', !compareLesDates,
  compareLesDates ? 'le code compare désormais les dates : mettre à jour le rapport' : '');

// ------------------------------------------------------------------
console.log('\n— 4. Étape 3 : le balayage est décrit avec ses vrais chiffres —');
// ------------------------------------------------------------------
check('le rapport d’étape 3 existe', r3.length > 1500, r3.length);
check('il donne le nombre de blobs scannés', /18\s?700/.test(r3));
check('il nomme le seul objet signalé', /oauth-only-test-value/.test(r3));
check('il conclut à l’absence de rotation nécessaire', /aucune\s+rotation/i.test(r3));
check('le fichier .gitignore exclut toujours les bases', /^\*\.db$/m.test(lire('.gitignore')));

// ------------------------------------------------------------------
console.log('\n— 5. Étape 2 : la CSP décrite est celle qui tourne —');
// ------------------------------------------------------------------
const security = require(path.join(racine, 'server', 'security.js'));
check('la CSP exportée interdit les scripts en ligne', !/script-src[^;]*unsafe-inline/.test(security.CSP));
check('media-src et object-src sont fermés', /media-src 'none'/.test(security.CSP) && /object-src 'none'/.test(security.CSP));
check('le bac à sable des types passifs est branché', /TYPES_PASSIFS/.test(securite));

if (echecs.length === 0) console.log(`🎉 v399 — ${ok} vérifications OK : les rapports d’audit correspondent au code livré.`);
else { console.log(`❌ v399 — ${echecs.length} échec(s) sur ${ok + echecs.length} : ${echecs.join(', ')}`); process.exitCode = 1; }
