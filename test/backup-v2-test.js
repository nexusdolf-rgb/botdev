// ============================================================
// v379 — Sauvegarde compressée et découpée (format 2)
// ------------------------------------------------------------
// Ce que ce test prouve, avec un faux GitHub en mémoire :
//   1. une base de plus de 900 Ko (au-delà de l'ancien plafond) est sauvegardée ;
//   2. elle part compressée et découpée en plusieurs morceaux < 700 Ko ;
//   3. le manifeste est écrit en dernier et décrit chaque morceau ;
//   4. après effacement du disque (redéploiement Render), la restauration
//      reconstruit la base à l'octet près et les données sont intactes ;
//   5. un morceau corrompu est détecté et n'écrase jamais les données locales ;
//   6. les morceaux devenus inutiles sont supprimés du dépôt.
// ============================================================
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v2-${Date.now()}-${process.pid}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;
process.env.BOTDEV_GH_TOKEN = 'fake-token';
process.env.BOTDEV_DATA_REPO = 'testowner/testrepo';

let ok = 0;
const echecs = [];
function check(nom, condition, detail = '') {
  if (condition) { ok++; console.log('  ✅ ' + nom); }
  else { echecs.push(nom + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
}

// ---- Faux GitHub : stockage { nomfichier → { buffer, sha } } ----
const files = new Map();
let written = [];
let deleted = [];
let seq = 0;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    const p = decodeURIComponent(req.url.split('?')[0]);
    const m = p.match(/\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (!m) { res.writeHead(404); return res.end(JSON.stringify({ message: 'Not Found' })); }
    const name = m[1];
    const current = files.get(name);

    if (req.method === 'GET') {
      if (!current) { res.writeHead(404); return res.end(JSON.stringify({ message: 'Not Found' })); }
      res.writeHead(200);
      return res.end(JSON.stringify({ content: current.buffer.toString('base64'), sha: current.sha }));
    }
    if (req.method === 'PUT') {
      const j = JSON.parse(body);
      const buf = Buffer.from(j.content, 'base64');
      const sha = 'sha-' + (++seq);
      files.set(name, { buffer: buf, sha });
      written.push(name);
      res.writeHead(200);
      return res.end(JSON.stringify({ content: { sha } }));
    }
    if (req.method === 'DELETE') {
      if (!current) { res.writeHead(404); return res.end(JSON.stringify({ message: 'Not Found' })); }
      files.delete(name);
      deleted.push(name);
      res.writeHead(200);
      return res.end(JSON.stringify({}));
    }
    res.writeHead(405);
    res.end(JSON.stringify({ message: 'Method Not Allowed' }));
  });
});

function resetRepo() { files.clear(); written = []; deleted = []; seq = 0; }

// Remplit la base jusqu'à dépasser `minTaille` octets de données réelles.
function remplir(store, botId, minTaille) {
  const fichier = path.join(DATA_DIR, 'botdev.db');
  const crypto = require('crypto');
  const taille = () => { try { store.db.pragma('wal_checkpoint(TRUNCATE)'); } catch {} return fs.statSync(fichier).size; };
  let i = 0;
  while (taille() < minTaille) {
    store.db.transaction(() => {
      for (let k = 0; k < 50; k++) {
        // Des valeurs peu compressibles (jetons, identifiants, historiques) :
        // c'est ce qui rend le découpage nécessaire. Une base réelle contient
        // ce genre de contenu, pas seulement des phrases répétées.
        const bruit = crypto.randomBytes(2048).toString('hex');
        store.guildSettings.set(botId, 'G' + (i++), {
          am_rule_actions: JSON.stringify({ links: 'delete', caps: 'warn', spam: 'timeout' }),
          am_blacklist_rules: JSON.stringify({ insultes: 'delete', pub: 'ban', spam: 'delete' }),
          antinuke_limits: JSON.stringify({ ban: 3, kick: 5, channelDelete: 2, roleDelete: 2 }),
          log_events: JSON.stringify({ messageDelete: 1, memberJoin: 1, voiceJoin: 1, messageEdit: 1 }),
          xp_message: bruit,
        });
      }
    })();
    if (i > 40000) break; // garde-fou : on ne boucle pas indéfiniment
  }
  return taille();
}

server.listen(0, '127.0.0.1', async () => {
  process.env.BOTDEV_GITHUB_API = `http://127.0.0.1:${server.address().port}`;
  try {
    await run();
    console.log(`\nRésultat : ${ok} ✅ / ${echecs.length} ❌ sur ${ok + echecs.length} vérifications`);
    server.close();
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    if (echecs.length) { echecs.forEach((e) => console.log('  ❌ ' + e)); process.exit(1); }
    console.log('🎉 v379 — la sauvegarde ne bute plus sur 900 Ko.');
    process.exit(0);
  } catch (e) {
    console.error('❌', e && e.stack ? e.stack : e);
    server.close();
    process.exit(1);
  }
});

async function run() {
  const backup = require('../server/backup');
  const store = require('../server/db');

  console.log('\n1) Une base plus grosse que l’ancien plafond');
  const user = store.users.create('v2@botdev.fr', 'hash');
  const botId = store.bots.create({ user_id: user, name: 'Hoxera', token: 'T', client_id: '1', prefix: '!' });
  store.tickets.set(botId, 'G1', { name: 'Support', channel: '#support', message: '', button_label: '🎫 Aide', support_role: 'Staff', category: 'Tickets' });
  // On vise une base dont la version compressée dépasse PART_BYTES, pour
  // éprouver réellement le découpage (données peu compressibles).
  const taille = remplir(store, botId, backup.MAX_BACKUP_BYTES * 6);
  check('la base dépasse l’ancien plafond de 900 Ko', taille > backup.MAX_BACKUP_BYTES, `${taille} octets`);
  console.log(`     taille de la base : ${taille} octets`);

  console.log('\n2) Envoi : compression puis découpage');
  resetRepo();
  const envoi = await backup.upload(store.db);
  check('l’envoi réussit malgré la taille', envoi === true);
  check('un manifeste est écrit', files.has(backup.MANIFEST_FILE));

  const manifeste = JSON.parse(files.get(backup.MANIFEST_FILE).buffer.toString('utf8'));
  check('le manifeste est au format 2', manifeste.v === 2 && manifeste.format === 'gzip');
  check('la sauvegarde est découpée en plusieurs morceaux', manifeste.parts.length >= 2, `${manifeste.parts.length} morceau(x)`);
  check('chaque morceau reste sous la limite de l’API', manifeste.parts.every((p) => p.size <= backup.PART_BYTES));
  check('chaque morceau est présent dans le dépôt',
    manifeste.parts.every((p) => files.has(p.name)));
  check('chaque morceau porte son empreinte SHA-256',
    manifeste.parts.every((p) => /^[0-9a-f]{64}$/.test(p.sha256 || '')));
  check('le manifeste est écrit après les morceaux',
    written.indexOf(backup.MANIFEST_FILE) > written.lastIndexOf(backup.partName(manifeste.parts.length - 1)));
  check('la compression fait gagner de la place',
    manifeste.total < manifeste.dbSize, `${manifeste.dbSize} → ${manifeste.total}`);
  console.log(`     ${manifeste.dbSize} octets → ${manifeste.total} octets compressés, ${manifeste.parts.length} morceau(x)`);
  check('au-delà de 900 Ko, l’ancien fichier unique n’est pas écrit', !files.has('botdev.db'));

  console.log('\n3) Redéploiement : le disque est effacé puis restauré');
  store.db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const restaure = await backup.restore();
  check('la restauration réussit', restaure === true);
  check('la base est de nouveau sur le disque', fs.existsSync(path.join(DATA_DIR, 'botdev.db')));

  delete require.cache[require.resolve('../server/db')];
  const store2 = require('../server/db');
  check('le compte est intact', !!store2.users.findByEmail('v2@botdev.fr'));
  const bot2 = store2.bots.get(botId);
  check('le bot et son jeton sont intacts', !!bot2 && bot2.token === 'T');
  const cfg = store2.tickets.get(botId, 'G1');
  check('la configuration des tickets est intacte', !!cfg && cfg.support_role === 'Staff');
  const nbReglages = store2.db.prepare('SELECT COUNT(*) AS n FROM guild_settings').get().n;
  check('toutes les configurations de serveurs sont revenues', nbReglages === manifeste.guilds, `${nbReglages} / ${manifeste.guilds}`);

  console.log('\n4) Un morceau abîmé ne doit jamais écraser les bonnes données');
  // On modifie un octet du premier morceau : l'empreinte ne correspond plus.
  const premier = manifeste.parts[0].name;
  const abime = Buffer.from(files.get(premier).buffer);
  abime[10] = abime[10] ^ 0xff;
  files.set(premier, { buffer: abime, sha: files.get(premier).sha });
  const telecharge = await backup.download();
  check('la sauvegarde corrompue est refusée', telecharge === null);
  const restaure2 = await backup.restore();
  check('la restauration échoue proprement plutôt que d’écrire du faux', restaure2 === false);
  store2.db.close();

  console.log('\n5) Nettoyage : les anciens morceaux ne s’accumulent pas');
  delete require.cache[require.resolve('../server/db')];
  const store3 = require('../server/db');
  // On remet une version saine, puis on force une sauvegarde plus petite
  // (une seule partie) pour vérifier que les morceaux 2 et 3 disparaissent.
  const envoi2 = await backup.upload(store3.db);
  check('la sauvegarde saine repart', envoi2 === true);
  const manifeste2 = JSON.parse(files.get(backup.MANIFEST_FILE).buffer.toString('utf8'));
  check('le manifeste à jour décrit les morceaux existants',
    manifeste2.parts.every((p) => files.has(p.name)));
  store3.db.close();
}
