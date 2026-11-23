// v398 — en-têtes de sécurité du dashboard, vérifiés sur le fil.
//
// Un test qui relit le source prouve seulement qu'une chaîne est écrite dans
// un fichier. Ici on démarre le vrai serveur et on regarde ce que le
// navigateur reçoit : c'est la seule chose qui protège l'utilisateur.
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

const demande = (port, chemin, entetes) => new Promise((ok2, ko) => {
  const req = http.request({ host: '127.0.0.1', port, path: chemin, method: 'GET', headers: entetes || {} }, (r) => {
    let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => ok2({ code: r.statusCode, h: r.headers, corps: d }));
  });
  req.on('error', ko);
  req.end();
});

(async () => {
  // ------------------------------------------------------------------
  console.log('\n— 1. Source : la politique est lisible et complète —');
  // ------------------------------------------------------------------
  // On interroge le module lui-même : la même valeur que celle envoyée au
  // navigateur, pas une relecture du texte source (les commentaires du bloc
  // contiennent des apostrophes qui trompent une expression régulière).
  const csp = require(path.join(racine, 'server', 'security.js')).CSP;
  check('la politique est déclarée', csp.length > 0);
  check('script-src refuse tout script en ligne', !/script-src[^;]*'unsafe-inline'/.test(csp), csp.slice(0, 90));
  check('script-src ne sort pas de l’origine', /script-src 'self'/.test(csp));
  check('object-src est interdit', /object-src 'none'/.test(csp));
  check('media-src est interdit', /media-src 'none'/.test(csp));
  check('frame-ancestors limite l’encadrement', /frame-ancestors 'self'/.test(csp));
  check('base-uri est verrouillé', /base-uri 'self'/.test(csp));
  check('form-action est verrouillé', /form-action 'self'/.test(csp));
  check('les requêtes http:// sont remontées en https', /upgrade-insecure-requests/.test(csp));
  check('connect-src reste sur l’origine', /connect-src 'self'/.test(csp));
  // Les styles en ligne sont la seule entorse, et elle est assumée : sans
  // elle, les 563 attributs style="..." du dashboard disparaissent.
  check('l’entorse style-src est la seule', (csp.match(/'unsafe-inline'/g) || []).length === 1, csp);

  // ------------------------------------------------------------------
  console.log('\n— 2. Serveur réel : ce que le navigateur reçoit —');
  // ------------------------------------------------------------------
  fs.mkdirSync(path.join(racine, '.cache'), { recursive: true });
  const port = 3600 + Math.floor(Math.random() * 300);
  const serveur = spawn(process.execPath, ['server/index.js'], {
    cwd: racine,
    env: { ...process.env, PORT: String(port), BOTDEV_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'v398-')), NODE_ENV: 'development', PUBLIC_ORIGIN: `http://127.0.0.1:${port}` },
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

    for (const chemin of ['/', '/index.html', '/js/dashboard.js', '/api/route-inexistante', '/robots.txt']) {
      const r = await demande(port, chemin);
      const h = r.h;
      check(`${chemin} : CSP présente`, /default-src 'self'/.test(String(h['content-security-policy'] || '')), h['content-security-policy']);
      check(`${chemin} : nosniff`, h['x-content-type-options'] === 'nosniff');
      check(`${chemin} : Referrer-Policy`, h['referrer-policy'] === 'strict-origin-when-cross-origin');
      check(`${chemin} : X-Frame-Options`, h['x-frame-options'] === 'SAMEORIGIN');
      check(`${chemin} : COOP`, h['cross-origin-opener-policy'] === 'same-origin');
      check(`${chemin} : CORP`, h['cross-origin-resource-policy'] === 'same-origin');
      check(`${chemin} : Permissions-Policy ferme caméra/micro`, /camera=\(\)/.test(String(h['permissions-policy'] || '')));
    }

    // Les 404 passent par le même chemin : une page d'erreur est rendue aussi.
    const inconnu = await demande(port, '/ceci-nexiste-pas');
    check('une page inconnue reçoit quand même la CSP', /default-src/.test(String(inconnu.h['content-security-policy'] || '')));

    // Pas de fuite d'implémentation.
    const racineRep = await demande(port, '/');
    check('le serveur ne s’annonce pas (x-powered-by absent)', !racineRep.h['x-powered-by']);

    // HSTS en clair : ne doit pas être posé (sinon un poste local en http
    // reste bloqué en https pendant un an).
    check('pas de HSTS sur une requête http locale', !racineRep.h['strict-transport-security']);

    // Derrière un proxy TLS, HSTS doit apparaître.
    const derriereProxy = await demande(port, '/', { 'x-forwarded-proto': 'https' });
    check('HSTS posé quand le proxy annonce https', /max-age=31536000/.test(String(derriereProxy.h['strict-transport-security'] || '')));

    // L'API ne se met pas en cache : une réponse d'API gardée une heure
    // montrerait les données d'un autre utilisateur.
    const api = await demande(port, '/api/route-inexistante');
    check('les réponses d’API ne sont pas mises en cache', String(api.h['cache-control'] || '').includes('no-store'));

    // Les images venant d'un utilisateur sont inertes même servies chez nous.
    const up = await demande(port, '/api/uploads/inexistant.png');
    check('uploads : la route refuse un fichier absent', up.code === 404, up.code);
  } finally {
    serveur.kill();
  }

  // ------------------------------------------------------------------
  console.log('\n— 3. Cohérence : le front tient la politique —');
  // ------------------------------------------------------------------
  const index = lire('public/index.html');
  check('aucun script en ligne dans index.html', !/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/.test(index));
  check('aucun gestionnaire en ligne (onclick=…)', !/\son(click|error|load|change)\s*=/.test(index));
  check('aucune iframe dans le dashboard', !/<iframe/i.test(index));
  const front = ['public/js/app.js', 'public/js/dashboard.js', 'public/js/views.js', 'public/js/public.js'].map(lire).join('\n');
  check('le front ne crée pas d’iframe', !/createElement\('iframe'\)/.test(front));
  check('le front ne charge aucun script tiers', !/<script[^>]+src="https?:/.test(front));
  // Les appels réseau du front doivent rester relatifs : une URL absolue
  // serait refusée par connect-src et casserait l'écran sans explication.
  const appels = front.match(/fetch\(\s*[`'"]([^`'"]+)/g) || [];
  const absolus = appels.filter((c) => /fetch\(\s*[`'"]https?:/.test(c));
  check('aucun fetch() vers un hôte tiers', absolus.length === 0, absolus.slice(0, 2).join(' | '));

  if (echecs.length === 0) console.log(`🎉 v398 — ${ok} vérifications OK : le navigateur reçoit une politique stricte sur chaque réponse.`);
  else { console.log(`❌ v398 — ${echecs.length} échec(s) sur ${ok + echecs.length} : ${echecs.join(', ')}`); process.exitCode = 1; }
})();
