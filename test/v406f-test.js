// ============================================================
// v406f — Cache des fichiers du site : ce que le navigateur reçoit vraiment.
//
// Le défaut corrigé ici ne se voyait pas dans le code : il fallait regarder
// les en-têtes. Un visiteur ayant déjà `dashboard.css?v=406e` l'avait gardé un
// an ; au déploiement suivant il recevait le nouveau JS avec l'ancien CSS, et
// le bandeau d'icônes restait affiché malgré un correctif en production.
//
// Ce test démarre le VRAI serveur et vérifie :
//   1. chaque fichier d'index.html porte l'empreinte de son contenu ;
//   2. cette adresse est servie un an, « immutable » ;
//   3. sans numéro de version, rien n'est gardé plus d'une heure ;
//   4. index.html (5 min) et sw.js (no-cache) redonnent les bonnes adresses ;
//   5. un client sans compression reçoit le MÊME en-tête que les autres ;
//   6. le contenu servi correspond bien à l'empreinte de l'adresse.
// ============================================================
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const racine = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');
let ok = 0;
const echecs = [];
function check(nom, condition, detail) {
  if (condition) { ok++; console.log('  ✅ ' + nom); }
  else { echecs.push(nom); console.log('  ❌ ' + nom + (detail !== undefined ? ' → ' + detail : '')); }
}

const demande = (port, chemin, entetes) => new Promise((res, rej) => {
  const req = http.request({ host: '127.0.0.1', port, path: chemin, method: 'GET', headers: entetes || {} }, (r) => {
    let d = '';
    r.on('data', (c) => { d += c; });
    r.on('end', () => res({ code: r.statusCode, h: r.headers, corps: d }));
  });
  req.on('error', rej);
  req.end();
});

(async () => {
  const sc = require(path.join(racine, 'server', 'staticCompress'));

  // ------------------------------------------------------------------
  console.log('\n— 1. Les adresses signées du HTML —');
  // ------------------------------------------------------------------
  const html = lire('public/index.html');
  const signe = sc.signerIndex(html);
  const adresses = [...signe.matchAll(/(\/(?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))\?v=(406[A-Za-z]?)-([0-9a-f]{16})/g)]
    .map((m) => ({ chemin: m[1], version: m[2], empreinte: m[3] }));
  check('les 10 fichiers versionnés d’index.html portent une empreinte', adresses.length === 10, String(adresses.length));
  check('chaque fichier a une empreinte différente', new Set(adresses.map((a) => a.empreinte)).size === adresses.length);
  check('la version déclarée par le développeur est conservée telle quelle',
    adresses.every((a) => a.version === adresses[0].version), adresses[0] && adresses[0].version);
  const css = adresses.find((a) => /dashboard\.css$/.test(a.chemin));
  const js = adresses.find((a) => /dashboard\.js$/.test(a.chemin));
  check('le CSS et le JS du tableau de bord n’ont pas la même empreinte',
    Boolean(css && js && css.empreinte !== js.empreinte));
  check('l’empreinte est celle du contenu servi', Boolean(css && sc.empreinte(css.chemin) === css.empreinte));

  // ------------------------------------------------------------------
  console.log('\n— 2. Règles d’en-tête (sans réseau) —');
  // ------------------------------------------------------------------
  check('adresse signée → un an, immuable',
    sc.enteteCache('/js/app.js', '/js/app.js?v=406f-1a2b3c').includes('max-age=31536000')
    && sc.enteteCache('/js/app.js', '/js/app.js?v=406f-1a2b3c').includes('immutable'));
  check('fichier sans version → une heure, jamais un an',
    sc.enteteCache('/js/app.js', '/js/app.js') === 'public, max-age=3600');
  check('service worker → no-cache', sc.enteteCache('/sw.js', '/sw.js') === 'no-cache');
  check('index.html → cinq minutes', sc.enteteCache('/index.html', '/').includes('max-age=300'));

  // ------------------------------------------------------------------
  console.log('\n— 3. Serveur réel : ce que le navigateur reçoit —');
  // ------------------------------------------------------------------
  const port = 4200 + Math.floor(Math.random() * 300);
  const serveur = spawn(process.execPath, ['server/index.js'], {
    cwd: racine,
    env: {
      ...process.env,
      PORT: String(port),
      BOTDEV_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'v406f-')),
      NODE_ENV: 'development',
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
    },
    stdio: 'ignore',
  });
  try {
    let pret = false;
    for (let i = 0; i < 80 && !pret; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try { pret = (await demande(port, '/ping')).code === 200; } catch { /* pas encore */ }
    }
    check('le serveur démarre', pret);
    if (!pret) throw new Error('serveur indisponible');

    const page = await demande(port, '/');
    check('la page d’accueil est bien servie', page.code === 200 && /<html/i.test(page.corps), page.code);
    check('la page d’accueil n’est pas figée pour un an', !String(page.h['cache-control'] || '').includes('31536000'), page.h['cache-control']);
    const dansLaPage = [...page.corps.matchAll(/(\/(?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))\?v=(406[A-Za-z]?)-([0-9a-f]{16})/g)].map((m) => `${m[1]}?v=${m[2]}-${m[3]}`);
    check('la page servie donne les adresses signées', dansLaPage.length === 10, String(dansLaPage.length));
    check('la version du CSS et du JS dans la page est la même que dans le fichier source',
      dansLaPage.every((u) => u.includes(`?v=${adresses[0].version}-`)));

    // 1) Le fichier signé : un an, et son contenu correspond à l'empreinte.
    const cssUrl = `/css/dashboard.css?v=${css.version}-${css.empreinte}`;
    for (const [nom, url, entetes] of [
      ['CSS signé, navigateur (br)', cssUrl, { 'accept-encoding': 'br, gzip' }],
      ['CSS signé, client sans compression', cssUrl, {}],
    ]) {
      const r = await demande(port, url, entetes);
      check(`${nom} : 200 + un an immuable`, r.code === 200 && /max-age=31536000, immutable/.test(String(r.h['cache-control'] || '')), `${r.code} ${r.h['cache-control']}`);
      check(`${nom} : ETag = empreinte de l’adresse`, String(r.h.etag || '').includes(css.empreinte), r.h.etag);
    }

    // 2) Sans numéro de version : une heure, pour que rien ne reste figé.
    const sansVersion = await demande(port, '/js/dashboard.js');
    check('JS sans version : une heure', sansVersion.code === 200 && /max-age=3600\b/.test(String(sansVersion.h['cache-control'] || '')), sansVersion.h['cache-control']);

    // 3) sw.js : no-cache, sinon un déploiement ne serait jamais vu.
    const sw = await demande(port, '/sw.js');
    check('sw.js : no-cache', sw.code === 200 && /no-cache/.test(String(sw.h['cache-control'] || '')), sw.h['cache-control']);

    // 4) Le service worker du dépôt suit la version de index.html.
    const versionIndex = adresses[0].version;
    check('sw.js porte la même version que index.html', sw.corps.includes(`hoxera-v${versionIndex}`));
  } finally {
    serveur.kill();
  }

  console.log('');
  if (echecs.length === 0) console.log(`🎉 v406f — ${ok} vérifications OK : un fichier qui change change d’adresse, donc change de cache.`);
  else { console.log(`❌ v406f — ${echecs.length} échec(s) sur ${ok + echecs.length} : ${echecs.join(', ')}`); process.exitCode = 1; }
})();
