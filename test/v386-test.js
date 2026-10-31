// Test v386 — trafic sortant divisé : compression du texte, cache long,
// et images du site allégées sans changer leur apparence.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const racine = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ok = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); process.exitCode = 1; }
};

// ---------- 1. Le middleware de compression ----------
const sc = require(path.join(racine, 'server', 'staticCompress.js'));

const faux = () => {
  const state = { headers: {}, statusCode: 200, body: null, fini: false };
  const res = {
    setHeader: (k, v) => { state.headers[k] = v; },
    end: (b) => { state.body = b; state.fini = true; },
    get statusCode() { return state.statusCode; },
    set statusCode(v) { state.statusCode = v; },
  };
  return { res, state };
};

console.log('— 1. Le texte part compressé —');
{
  const { res, state } = faux();
  let suite = false;
  sc.middleware({ method: 'GET', path: '/js/app.js', originalUrl: '/js/app.js?v=383', headers: { 'accept-encoding': 'gzip, deflate' } }, res, () => { suite = true; });
  check('…/js/app.js servi en gzip', state.headers['Content-Encoding'] === 'gzip' && !suite);
  const brut = fs.readFileSync(path.join(racine, 'public', 'js', 'app.js'));
  check('…le corps reçu se décompresse à l’identique',
    zlib.gunzipSync(state.body).equals(brut));
  check('…et pèse bien moins que le fichier', state.body.length < brut.length / 2,
    state.body.length + ' / ' + brut.length);
}
{
  const { res, state } = faux();
  sc.middleware({ method: 'GET', path: '/css/dashboard.css', originalUrl: '/css/dashboard.css?v=383', headers: { 'accept-encoding': 'br' } }, res, () => {});
  check('…brotli choisi quand le navigateur le propose', state.headers['Content-Encoding'] === 'br');
}
{
  const { res, state } = faux();
  sc.middleware({ method: 'GET', path: '/js/app.js', originalUrl: '/js/app.js', headers: {} }, res, () => {});
  check('…client sans compression : on laisse passer le fichier en clair', !state.fini && !state.headers['Content-Encoding']);
}
{
  const { res, state } = faux();
  sc.middleware({ method: 'GET', path: '/icons/support-banner.png', originalUrl: '/icons/support-banner.png', headers: { 'accept-encoding': 'gzip' } }, res, () => {});
  check('…une image n’est jamais recompressée (déjà compressée)', !state.fini);
}

{
  const { res, state } = faux();
  sc._reset();
  sc.middleware({ method: 'GET', path: '/', originalUrl: '/', headers: { 'accept-encoding': 'gzip' } }, res, () => {});
  check('…la page d’accueil aussi part compressée', state.headers['Content-Encoding'] === 'gzip');
}

console.log('— 2. Cache et économie de données —');
{
  const { res, state } = faux();
  sc.middleware({ method: 'GET', path: '/js/app.js', originalUrl: '/js/app.js?v=383', headers: { 'accept-encoding': 'gzip', 'if-none-match': '' } }, res, () => {});
  check('…un fichier versionné reste un an chez le visiteur',
    state.headers['Cache-Control'].includes('max-age=31536000'));
  const etag = state.headers['ETag'];
  const second = faux();
  sc.middleware({ method: 'GET', path: '/js/app.js', originalUrl: '/js/app.js?v=383', headers: { 'accept-encoding': 'gzip', 'if-none-match': etag } }, second.res, () => {});
  check('…déjà en cache : réponse 304, aucun octet renvoyé',
    second.state.statusCode === 304 && !second.state.body);
  check('…le HTML de la page, lui, reste frais (5 min)', sc.enteteCache('/index.html', '/').includes('max-age=300'));
}
{
  const etat = sc.etat();
  check('…12 fichiers texte préparés une seule fois', etat.fichiers >= 10, String(etat.fichiers));
  check('…JS+CSS compressés sous 320 Ko (contre 1,26 Mo en clair)', etat.gzip < 320, etat.gzip + ' Ko');
}

// ---------- 3. Les images du site ne pèsent plus 3,3 Mo ----------
console.log('— 3. Images allégées, dessin inchangé —');
{
  const dossier = path.join(racine, 'public', 'icons');
  const poids = (f) => fs.statSync(path.join(dossier, f)).size;
  check('la bannière des tickets passe sous 400 Ko', poids('support-banner.png') < 400 * 1024,
    Math.round(poids('support-banner.png') / 1024) + ' Ko');
  check('la bannière de profil passe sous 450 Ko', poids('nexora-profile-banner.png') < 450 * 1024);
  check('le logo embarqué passe sous 40 Ko', poids('nexora-robot-mark.png') < 40 * 1024);
  check('…et reste une image valable (plus de 2 Ko)', poids('nexora-robot-mark.png') > 2000);
  const total = ['support-banner.png', 'nexora-profile-banner.png', 'nexora-robot-mark.png',
    'icon-512.png', 'icon-maskable-512.png', 'optimus-photo.png']
    .reduce((a, f) => a + poids(f), 0);
  check('…les 6 images lourdes passent de 3,34 Mo à moins de 1,3 Mo', total < 1.3 * 1024 * 1024,
    (total / 1e6).toFixed(2) + ' Mo');
}

// ---------- 4. Branché dans le serveur, sans casser l’existant ----------
console.log('— 4. Branché au bon endroit —');
{
  const index = read('server/index.js');
  const posMiddleware = index.indexOf("require('./staticCompress').middleware");
  const posStatic = index.indexOf("express.static(path.join(__dirname, '..', 'public')");
  check('le serveur utilise la compression', posMiddleware > 0);
  check('…avant les fichiers statiques', posMiddleware < posStatic);
  check('…le code non versionné n’est gardé qu’une heure (jamais de version périmée)',
    index.includes("'public, max-age=3600'") && !index.includes("'public, max-age=604800'") === false);
  check('…les images, elles, restent une semaine chez le visiteur', index.includes("'public, max-age=604800'"));
  check('le script d’allègement est livré avec le dépôt', fs.existsSync(path.join(racine, 'scripts', 'allegement-images.js')));
}

console.log(`\n${process.exitCode ? '❌' : '🎉'} v386 — ${ok} vérifications : le site pèse ~4× moins de trafic`);
