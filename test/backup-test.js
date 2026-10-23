// ============================================================
// Test du système de sauvegarde/restauration (simulation GitHub)
// Vérifie le cycle complet : données → upload → effacement → restore → données
// ============================================================
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(os.tmpdir(), `botdev-test-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });

process.env.BOTDEV_DATA_DIR = DATA_DIR;
process.env.BOTDEV_GH_TOKEN = 'fake-token';
process.env.BOTDEV_DATA_REPO = 'testowner/testrepo';

// ---- Faux serveur GitHub (stockage en mémoire) ----
// v379 — accepte TOUS les fichiers de sauvegarde (morceaux + manifeste +
// ancien fichier unique), pas seulement `botdev.db`.
const fichiers = new Map(); // nom → { content, sha }
let requests = 0;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    requests += 1;
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const m = urlPath.match(/\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    res.setHeader('Content-Type', 'application/json');
    if (!m) { res.writeHead(404); return res.end(JSON.stringify({ message: 'Not Found' })); }
    const nom = m[1];
    const actuel = fichiers.get(nom);
    if (req.method === 'GET') {
      if (!actuel) { res.writeHead(404); return res.end(JSON.stringify({ message: 'Not Found' })); }
      res.writeHead(200);
      return res.end(JSON.stringify({ content: actuel.content, sha: actuel.sha }));
    }
    if (req.method === 'PUT') {
      const j = JSON.parse(body);
      assert(j.content, 'contenu base64 requis');
      fichiers.set(nom, { content: j.content, sha: 'sha-' + requests });
      res.writeHead(200);
      return res.end(JSON.stringify({ content: { sha: 'sha-' + requests } }));
    }
    if (req.method === 'DELETE') {
      fichiers.delete(nom);
      res.writeHead(200);
      return res.end(JSON.stringify({}));
    }
    res.writeHead(405);
    res.end(JSON.stringify({ message: 'Method Not Allowed' }));
  });
});

server.listen(0, '127.0.0.1', async () => {
  process.env.BOTDEV_GITHUB_API = `http://127.0.0.1:${server.address().port}`;
  try {
    await run();
    console.log('\n🎉 Test de sauvegarde réussi !');
    server.close();
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    process.exit(0);
  } catch (e) {
    console.error('❌', e.message);
    server.close();
    process.exit(1);
  }
});

async function run() {
  const backup = require('../server/backup');
  assert(backup.enabled(), 'sauvegarde doit être activée');
  console.log('1️⃣  Configuration détectée :', backup.repo());

  // ---- Données locales ----
  const store = require('../server/db');
  store.users.create('test@botdev.fr', 'hash');
  const botId = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'TOKEN_SECRET', client_id: '1', prefix: '!' });
  store.commands.create({ bot_id: botId, name: 'bonjour', description: '', trigger_type: 'prefix', trigger_value: 'bonjour', options: '[]', blocks: '[]', cooldown: 0, enabled: 1, sort: 0 });
  store.tickets.set(botId, 'G1', { name: 'Support', channel: '#support', message: '', button_label: '🎫 Aide', support_role: 'Staff', category: 'Tickets' });
  console.log('2️⃣  Données locales créées (compte, bot, commande, tickets)');

  // ---- Upload ----
  const ok = await backup.upload(store.db);
  assert(ok, 'upload réussi');
  assert(fichiers.has('botdev.db'), 'ancien fichier unique toujours écrit (compatibilité)');
  assert(fichiers.has('botdev-backup.json'), 'manifeste de sauvegarde écrit');
  const octets = [...fichiers.values()].reduce((n, f) => n + Math.floor(f.content.length * 0.75), 0);
  console.log('3️⃣  Upload OK (', octets, 'octets côté serveur, ', fichiers.size, 'fichier(s))');

  // ---- Simulation de perte de données (redéploiement Render) ----
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('4️⃣  Disque effacé (simulation redéploiement Render)');

  // ---- Restore ----
  const restored = await backup.restore();
  assert(restored === true, 'restauration réussie');
  assert(fs.existsSync(path.join(DATA_DIR, 'botdev.db')), 'fichier restauré sur disque');
  console.log('5️⃣  Restauration OK — fichier téléchargé');

  // ---- Re-lecture des données ----
  delete require.cache[require.resolve('../server/db')];
  const store2 = require('../server/db');
  assert(store2.users.findByEmail('test@botdev.fr'), 'compte restauré');
  const bot = store2.bots.get(botId);
  assert(bot && bot.name === 'Hoxera' && bot.token === 'TOKEN_SECRET', 'bot restauré avec token');
  assert(store2.commands.all(botId).length === 1, 'commande restaurée');
  const cfg = store2.tickets.get(botId, 'G1');
  assert(cfg && cfg.name === 'Support' && cfg.support_role === 'Staff', 'config tickets restaurée');
  console.log('6️⃣  Données relues après restauration : ✅ compte, ✅ bot (+token), ✅ commande, ✅ tickets');
}
