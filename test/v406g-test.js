// ============================================================
// v406g — Diagnostic de sauvegarde, lisible sans connexion.
//
// Le 26 novembre, l'utilisateur a cru que toutes les configurations serveur
// avaient disparu. Elles étaient intactes : c'est la sauvegarde GitHub qui
// n'était plus poussée, et le processus qui avait redémarré. Rien dans
// l'interface ne permettait de faire la différence entre « données perdues »
// et « données plus envoyées ».
//
// /api/health/bot publie désormais des dates et des compteurs (jamais un
// contenu, jamais un nom de serveur) : de quoi trancher en une requête.
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v406g-'));

let ok = 0;
const echecs = [];
const check = (nom, cond, detail) => {
  if (cond) { ok++; console.log('  ✅ ' + nom); }
  else { echecs.push(nom); console.log('  ❌ ' + nom + (detail !== undefined ? ' → ' + detail : '')); }
};

const racine = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(racine, 'server/routes.js'), 'utf8');
const bloc = source.slice(source.indexOf("router.get('/health/bot'"), source.indexOf("// Pages publiques (sans connexion)"));

console.log('\n— 1. La route publique publie le diagnostic —');
check('la route /health/bot existe', source.includes("router.get('/health/bot'"));
check('elle expose un bloc « sauvegarde »', /sauvegarde\s*=/.test(bloc) && /sauvegarde,/.test(bloc));
check('elle donne l’heure de la dernière sauvegarde', /dernierEnvoi: store\.settings\.get\('last_backup'\)/.test(bloc));
check('elle donne l’état de la restauration au démarrage', /bootRestore:/.test(bloc));
check('elle compte les serveurs qui ont des réglages', /guildesAvecReglages:/.test(bloc) && /FROM guild_settings/.test(bloc));
check('elle distingue le dernier envoi de CE processus', /dernierEnvoiReussi:/.test(bloc));

console.log('\n— 2. Elle ne divulgue aucune donnée privée —');
const champs = ['guild_id', 'guild_name', 'SELECT guild_id', 'prefix', 'token', 'discord_id', 'email', 'users'];
for (const champ of champs) {
  check(`aucune fuite de « ${champ} »`, !bloc.includes(champ));
}
check('le bloc est protégé : une erreur de sauvegarde ne casse pas la route',
  /try \{\s*const backup = require\('\.\/backup'\);/.test(bloc) && /catch \{ \/\* diagnostic seulement/.test(bloc));

console.log('\n— 3. La valeur reste lisible pour un humain —');
check('l’état de restauration est tronqué (pas de pavé)', /\.slice\(0, 120\)/.test(bloc));
check('un état absent renvoie « inconnue » et non « undefined »', /'inconnue'/.test(bloc) && /'aucun'/.test(bloc));

console.log('');
if (echecs.length === 0) console.log(`🎉 v406g — ${ok} vérifications OK : on peut dire, en une requête, si les données sont perdues ou seulement plus envoyées.`);
else { console.log(`❌ v406g — ${echecs.length} échec(s) sur ${ok + echecs.length} : ${echecs.join(', ')}`); process.exitCode = 1; }
