// v364 — 🏷️ Le flash de la marque en haut à gauche, et trois bugs invisibles
// découverts en fouillant le même chemin de démarrage.
//
// Signalement du fondateur : « côté dashboard, quand on recharge la page, on
// voit le truc de Hoxera tout en haut à gauche et l’image du flash ».
//
// Cause mesurée AVANT de corriger (script de reproduction, puis reproduit ici) :
// App.renderHoxeraDashboard peignait la barre de navigation avec la marque de
// secours (« ⚡ Hoxera ») pendant que /api/hoxera répondait, puis RECONSTRUISAIT
// cette barre avec la vraie identité (« Optimus Prime » + avatar du CDN Discord).
// Deux constructions de navbar par rafraîchissement, à chaque fois, pour
// tout le monde.
//
// Ce fichier vérifie :
//   1. la marque (nom + avatar) est mémorisée entre deux visites → le premier
//      tracé est déjà le bon, et la barre n’est plus remplacée ;
//   2. l’avatar de la barre passe par le proxy local (comme le reste du site) :
//      jamais une URL directe du CDN, jamais d'« image cassée » ;
//   3. une vue dont les données arrivent en retard ne repeint PLUS la page par
//      dessus une navigation plus récente (garde de séquence) ;
//   4. service worker : une réponse d’erreur n’est plus mise en cache, la
//      coquille HTML n’est plus servie à la place d’un .js/.css introuvable,
//      et l’installation ne meurt plus silencieusement si un asset manque ;
//   5. câblage : preload de l’avatar dans index.html, version du cache, assets
//      réellement présents sur disque.
const fs = require('fs');
const path = require('path');

let ok = 0;
let ko = 0;
function check(label, cond, info) {
  if (cond) { ok += 1; console.log('  ✅ ' + label); return; }
  ko += 1;
  console.log('  ❌ ' + label + (info ? ' — ' + info : ''));
}
const RACINE = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const NOM_REEL = 'Optimus Prime';
const AVATAR_CDN = 'https://cdn.discordapp.com/avatars/1537443352281088000/deadbeef.png';
const LENTEUR = 220;               // ms de latence réseau simulée sur /api/hoxera

// ---------------------------------------------------------------------------
// Le harnais : le VRAI public/js/app.js est évalué dans une fenêtre jsdom, et
// c’est ce que le navigateur aurait peint qui est mesuré. `code + snippet` est
// évalué d’un bloc, car un `const` de haut niveau d’un eval n’est atteignable
// qu’à l’intérieur de ce même bloc.
// ---------------------------------------------------------------------------
function monteApp({ marqueEnCache = null, nomServeur = NOM_REEL, interrompre = false, lenteur = LENTEUR, sansLocal = false }) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>',
    { url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const w = dom.window;
  if (marqueEnCache) w.localStorage.setItem('hx-brand', JSON.stringify(marqueEnCache));
  if (sansLocal) {
    Object.defineProperty(w, 'localStorage', {
      value: { getItem: () => { throw new Error('accès refusé'); }, setItem: () => { throw new Error('accès refusé'); } },
      configurable: true,
    });
  }
  w.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body, delay = 0) => new Promise((res) => setTimeout(() => res({ ok: true, status: 200, json: async () => body }), delay));
    if (p.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'fondateur@hoxera.fr', discord_id: 'D1', discord_username: 'Fondateur', discord_avatar: '', is_admin: false } });
    if (p.endsWith('/api/hoxera')) return resp({
      configured: true,
      bot: { id: 1, name: nomServeur, prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: AVATAR_CDN, bot_username: `${nomServeur}#0001`, guilds: [] },
    }, lenteur);
    return resp({ ok: true });
  };
  const code = lire('public/js/app.js');
  const snippet = String.raw`
window.__r = (async () => {
  const out = { renders: 0, traces: [], shell: 'AUCUNE', botEnMemoire: null, marque: null };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const decri = (nav) => {
    if (!nav) return { absent: true };
    const logo = nav.querySelector('.logo');
    const brand = nav.querySelector('#nav-logo') || nav.querySelector('.logo-row');
    return {
      texte: (brand ? brand.textContent : '').replace(/\s+/g, ' ').trim(),
      logo: logo ? (logo.tagName === 'IMG' ? 'IMG ' + logo.getAttribute('src') : 'MARQUE « ' + logo.textContent + ' »') : 'aucun',
    };
  };
  const orig = App.renderNavbar;
  App.renderNavbar = function (...a) { out.renders += 1; return orig.apply(this, a); };
  let nav = null;
  for (let t = 0; t < 2500; t += 10) { nav = document.querySelector('.navbar'); if (nav) break; await wait(10); }
  out.traces.push(decri(nav));
  __INTERROMPRE__
  await wait(__LENTEUR__ + 400);
  out.traces.push(decri(document.querySelector('.navbar')));
  const shell = document.querySelector('.bot-shell');
  out.shell = shell ? shell.innerHTML : 'AUCUNE';
  out.botEnMemoire = App.state.bot ? App.state.bot.name : null;
  out.marque = App.brandRead() ? App.brandRead().name : null;
  try {
    // Les mesures ci-dessous tapent dans le meme stockage que l'app : on le
    // rend tel qu'on l'a trouve, pour que les autres cas restent fiables.
    const brut0 = localStorage.getItem('hx-brand');
    const H = {};
    H.vide = App.brandSig(null);
    H.nomSeul = App.brandSig({ name: 'A' });
    H.avecAvatar = App.brandSig({ name: 'A', avatar_url: 'x' });
    H.autre = App.brandSig({ name: 'B', avatar_url: 'x' });
    localStorage.setItem('hx-brand', '{ pas du json');
    H.pourri = App.brandRead() === null;
    App.brandWrite(null);
    App.brandWrite({ avatar_url: 'x' });
    H.sansNom = App.brandRead() === null;
    localStorage.removeItem('hx-brand');
    const b = { name: 'Opti', avatar_url: 'u' };
    App.brandWrite(b);
    H.relus = App.brandRead().name === 'Opti' && App.brandRead().avatar_url === 'u';
    const avant = localStorage.getItem('hx-brand');
    App.brandWrite(b);
    H.inutile = localStorage.getItem('hx-brand') === avant;
    if (brut0 === null) localStorage.removeItem('hx-brand'); else localStorage.setItem('hx-brand', brut0);
    out.helpers = H;
  } catch (e) { out.helpers = { erreur: String((e && e.message) || e) }; }
  return out;
})();
`
    .replace('__INTERROMPRE__', interrompre ? 'App._vueSeq += 1; /* le fondateur est parti ailleurs pendant l\u2019attente */' : '')
    .replace('__LENTEUR__', String(lenteur));
  w.eval(code + '\n;\n' + snippet);
  return w;
}

(async () => {
  // =========================================================================
  console.log('\n— 1. Le flash, mesuré dans un vrai DOM —');
  {
    // Le cas du fondateur : il revient sur un dashboard qu’il a déjà ouvert.
    const w = monteApp({ marqueEnCache: { name: NOM_REEL, avatar_url: AVATAR_CDN } });
    const r = await w.__r;
    check('au premier tracé, le nom déjà connu est affiché (pas le nom de secours)',
      r.traces[0].texte === NOM_REEL, JSON.stringify(r.traces[0]));
    check('au premier tracé, c’est la vraie photo du bot (proxy local), pas l\u2019éclair de secours',
      r.traces[0].logo === 'IMG /api/public/bot-avatar', r.traces[0].logo);
    check('aucune marque « ⚡ » n’est peinte en haut à gauche',
      !/⚡/.test(JSON.stringify(r.traces[0])), JSON.stringify(r.traces[0]));
    check('la barre n\u2019est CONSTRUITE QU\u2019UNE FOIS : plus de remplacement, donc plus de flash',
      r.renders === 1, 'barres construites : ' + r.renders);
    check('après /hoxera, la barre est toujours la même (aucun clignotement résiduel)',
      r.traces[1].texte === NOM_REEL && r.traces[1].logo === r.traces[0].logo, JSON.stringify(r.traces[1]));
  }
  {
    // Première visite absolue : le nom ne peut pas être connu avant la réponse
    // du serveur — mais il ne doit plus y avoir d’image cassée ni de trou.
    const w = monteApp({});
    const r = await w.__r;
    check('première visite : le site est nommé dès le premier tracé (aucun blanc)',
      r.traces[0].texte === 'Hoxera' && r.traces[0].logo === 'IMG /api/public/bot-avatar', JSON.stringify(r.traces[0]));
    check('première visite : la vraie identité prend le relais dès la réponse',
      r.traces[1].texte === NOM_REEL, JSON.stringify(r.traces[1]));
    check('première visite : la marque est alors mémorisée pour le prochain rafraîchissement',
      r.marque === NOM_REEL && JSON.parse(w.localStorage.getItem('hx-brand') || '{}').name === NOM_REEL,
      w.localStorage.getItem('hx-brand'));
  }
  {
    // Le bot est renommé depuis la dernière visite : là, il FAUT repeindre.
    const w = monteApp({ marqueEnCache: { name: 'Vieux Nom', avatar_url: '' }, nomServeur: NOM_REEL });
    const r = await w.__r;
    check('si l\u2019identité a vraiment changé, la barre est reconstruite (le cache ne fige rien)',
      r.renders === 2 && r.traces[1].texte === NOM_REEL, r.renders + ' / ' + JSON.stringify(r.traces[1]));
    check('le cache est mis à jour après le renommage',
      r.marque === NOM_REEL, String(r.marque));
  }
  {
    // Le stockage local est inaccessible (navigation privée, cookies bloqués) :
    // rien ne doit casser pour autant.
    const w = monteApp({ sansLocal: true });
    const r = await w.__r;
    check('localStorage indisponible : le démarrage passe quand même',
      r.traces[0].texte === 'Hoxera' && r.traces[1].texte === NOM_REEL, JSON.stringify(r.traces));
  }

  // =========================================================================
  console.log('\n— 2. Les helpers de marque —');
  {
    // Un `const` de haut niveau d'un eval n'est pas atteignable depuis Node :
    // les mesures sont donc prises dans le snippet, et relues ici.
    const w = monteApp({});
    const h = (await w.__r).helpers || {};
    check('aucune erreur de harnais dans les mesures', !h.erreur, h.erreur);
    check('signature vide quand on ne sait rien', h.vide === '', JSON.stringify(h.vide));
    check('signature sensible au nom ET à l\u2019avatar', h.nomSeul !== h.avecAvatar && h.avecAvatar !== h.autre, JSON.stringify(h));
    check('un JSON stocké illisible est ignoré (jamais d\u2019exception au démarrage)', h.pourri === true, String(h.pourri));
    check('écrire une marque sans nom ne stocke rien', h.sansNom === true, String(h.sansNom));
    check('relire la marque écrite rend nom ET avatar', h.relus === true, String(h.relus));
    check('réécrire la même marque ne touche pas le stockage', h.inutile === true, String(h.inutile));
  }

  // =========================================================================
  console.log('\n— 3. Garde de navigation (la vue en retard ne repeint pas) —');
  {
    const w = monteApp({ marqueEnCache: { name: NOM_REEL, avatar_url: AVATAR_CDN } });
    await w.__r;
    // Le montage complet du tableau de bord vit dans dashboard.js, absent de ce
    // harnais : ce qu’on mesure est l’ÉCRITURE dans le DOM, pas le contenu du
    // dashboard.
    check('sans navigation concurrente, la vue écrite atteint bien le DOM',
      /empty-state|bot-shell/.test((await w.document.querySelector('.bot-shell')) ? w.document.querySelector('.bot-shell').innerHTML : ''),
      'shell non écrit');
  }
  {
    // Volontairement sans marque en cache : si la vue en retard avait ecrit,
    // on lirait un nom dans App.state.bot ET dans le stockage local.
    const w = monteApp({ interrompre: true });
    const r = await w.__r;
    check('navigation pendant l\u2019attente : rien n\u2019est repeint par la vue en retard',
      /spinner/.test(r.shell) && !/empty-state/.test(r.shell), r.shell.slice(0, 90));
    check('navigation pendant l\u2019attente : l\u2019état de session n\u2019est pas modifié par la vue en retard',
      r.botEnMemoire === null && r.marque === null, JSON.stringify({ b: r.botEnMemoire, m: r.marque }));
    check('la barre n\u2019a pas été remplacée par la vue en retard', r.renders === 1, 'rendus : ' + r.renders);
  }

  // =========================================================================
  console.log('\n— 4. Le proxy d\u2019avatar remplace le CDN Discord direct —');
  {
    const app = lire('public/js/app.js');
    const publicJs = lire('public/js/public.js');
    check('la barre du dashboard demande /api/public/bot-avatar (image jamais cassée)',
      app.includes('src="/api/public/bot-avatar"'), 'URL introuvable');
    check('le CDN Discord n\u2019est plus jamais la source directe d\u2019un <img>',
      !/<img[^>]*src="https:\/\/cdn\.discordapp\.com/.test(app + publicJs + lire('public/js/dashboard.js') + lire('public/js/views.js')),
      'un <img> pointe encore le CDN en dur');
    check('le filet « image cassée » de la barre est conservé (repli sur l\u2019éclair)',
      // v367 : le repli n'est plus le caractere « ⚡ » mais le meme eclair
      // dessine en SVG (ico-svg) — meme forme, meme garde-fou, plus d'emoji.
      /brandImage\.onerror = \(\) => brandImage\.replaceWith\(App\.el\('<span class="logo"><svg class="ico-svg"[^>]*><path d="M13\.4 2\.6/.test(app), 'onerror disparu');
    check('l\u2019avatar de la navbar publique porte la même initiale de secours',
      publicJs.includes('data-fb-text='), 'data-fb-text absent de public.js');
    check('la route servie répond bien avec une image (proxy + fichier de secours)',
      lire('server/routes.js').includes("router.get('/public/bot-avatar'"), 'route absente');
    check('le fichier de secours de cette route existe sur le disque',
      fs.existsSync(path.join(RACINE, 'public', 'icons', 'icon-512.png')), 'public/icons/icon-512.png manquant');
  }

  // =========================================================================
  console.log('\n— 5. index.html : l\u2019avatar part en parallèle du JavaScript —');
  {
    const html = lire('public/index.html');
    check('l\u2019avatar du bot est préchargé dès le HTML',
      /<link rel="preload" href="\/api\/public\/bot-avatar" as="image" \/>/.test(html), 'preload absent');
    check('le preload est une image (sinon le navigateur ignore la ressource)',
      html.includes('as="image"'), 'as="image" absent');
    check('index.html versionné ?v=373 (7 liens)', (html.match(/\?v=373/g) || []).length === 7,
      String((html.match(/\?v=373/g) || []).length));
    check('aucun ancien ?v=363 n\u2019est resté dans public/',
      !fs.readdirSync(path.join(RACINE, 'public', 'js')).some((f) => /bot-avatar\?v=363/.test(lire('public/js/' + f))),
      'version périmée dans un js');
    const csp = lire('server/security.js');
    check('la CSP autorise cette image de meme origine (img-src \u2018self\u2019)',
      /img-src[^;]*'self'/.test(csp), 'img-src introuvable dans server/security.js');
    check('la CSP autorise le script inline qui regle theme et couleur de barre',
      /script-src[^;]*'unsafe-inline'/.test(csp), 'unsafe-inline absent : le script ne tournerait pas');
    // v364 — la couleur de la barre du navigateur doit suivre le theme : le
    // meta etait fige sur #0e0f15, qui ne correspond au fond d'aucun theme.
    check('le meta theme-color porte le fond reel du theme sombre',
      /<meta name="theme-color" content="#080b12" \/>/.test(html), html.match(/theme-color[^>]*/)[0]);
    check('le script anti-flash regle la couleur de la barre selon le theme',
      html.includes("meta.setAttribute('content', clair ? '#f2f3f8' : '#080b12')"), 'reglage absent');
    check('les deux couleurs viennent du CSS (rien d\u2019invente)',
      lire('public/css/style.css').includes('html.hx-light body { background: #f2f3f8; color: #1c1e26; }')
      && /:root \{\n  --bg: #080b12;/.test(lire('public/css/style.css')), 'valeur CSS introuvable');
    check('le bouton clair/sombre du dashboard resynchronise la barre',
      /localStorage\.setItem\('hx-theme'[^\n]*\n.*App\.syncThemeColor\(\)/.test(lire('public/js/dashboard.js')), 'appel absent de dashboard.js');
    check('le helper est appele au demarrage de l\u2019application',
      /App\.syncThemeColor\(\);\nwindow\.addEventListener\('hashchange'/.test(lire('public/js/app.js')), 'appel absent de app.js');
  }

  // =========================================================================
  console.log('\n— 6. Service worker : trois pièges fermés —');
  {
    const src = lire('public/sw.js');
    check('le nom du cache suit la version', src.includes("const CACHE = 'botdev-v373';"), 'CACHE périmé');
    check('installation tolérante (Promise.allSettled)', /Promise\.allSettled\(ASSETS\.map/.test(src), 'addAll toujours présent');
    check('seules les réponses valides sont mises en cache', /if \(resp && resp\.ok\)/.test(src), 'garde resp.ok absente');
    check('la coquille HTML n\u2019est servie que pour une navigation', /mode === 'navigate'/.test(src), 'garde de mode absente');
    check('les requêtes /api ne sont jamais interceptées', src.includes("if (url.pathname.startsWith('/api')) return;"), 'protection API absente');
    const blocAssets = src.slice(src.indexOf('const ASSETS'), src.indexOf('];', src.indexOf('const ASSETS')));
    const assets = [...blocAssets.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((x) => x.startsWith('/'));
    const chemin = (a) => path.join(RACINE, 'public', a === '/' ? 'index.html' : a.replace(/^\//, ''));
    const manquants = assets.filter((a) => !fs.existsSync(chemin(a)));
    check('tous les assets listés pour le cache existent vraiment sur disque',
      manquants.length === 0 && assets.length >= 5, 'manquants : ' + (manquants.join(', ') || 'aucun') + ' / liste : ' + assets.join(', '));
    check('le cache promet la coquille du site elle-m\u00eame', assets.includes('/'), assets.join(', '));
    const manifest = JSON.parse(lire('public/manifest.webmanifest'));
    const icoManquantes = (manifest.icons || []).filter((i) => !fs.existsSync(path.join(RACINE, 'public', i.src.replace(/^\//, ''))));
    check('le manifeste ne promet aucune icône absente', icoManquantes.length === 0, JSON.stringify(icoManquantes));
  }

  // =========================================================================
  console.log('\n— 7. Le service worker est EXÉCUTÉ, pas copié —');
  {
    const swSource = lire('public/sw.js');
    function monteSw({ cacheOk = {}, fetchImpl } = {}) {
      const handlers = {};
      const puts = [];
      const deletes = [];
      let skipWaiting = 0;
      let claim = 0;
      const cache = {
        add: async (u) => { if (String(u).includes('manquant')) throw new Error('404 ' + u); return undefined; },
        put: async (req, resp) => { puts.push({ url: (req && req.url) || req, status: resp && resp.status }); },
        match: async (req) => {
          const u = typeof req === 'string' ? req : req.url;
          const hit = cacheOk[u.replace(/^https?:\/\/[^/]+/, '')];
          return hit ? { ok: true, status: 200, body: hit, clone: () => ({}) } : undefined;
        },
      };
      const self = {
        addEventListener: (t, fn) => { handlers[t] = fn; },
        skipWaiting: async () => { skipWaiting += 1; },
        clients: { claim: async () => { claim += 1; } },
      };
      // `caches.match(...)` est une m\u00e9thode de CacheStorage (distincte de
      // cache.match) : le vrai service worker s'en sert, le harnais la doit avoir.
      const cachesObj = {
        open: async () => cache,
        match: (req) => cache.match(req),
        keys: async () => ['botdev-v373', 'botdev-v1'],
        delete: async (k) => { deletes.push(k); return true; },
      };
      const location = { origin: 'http://localhost:3000' };
      /* eslint-disable no-new-func */
      new Function('self', 'caches', 'fetch', 'location', swSource)(self, cachesObj, fetchImpl, location);
      return {
        handlers, puts, deletes,
        nbSkip: () => skipWaiting, nbClaim: () => claim,
        // Un événement fetch renvoie la réponse promise à respondWith (ou null).
        async fetche(request) {
          let pris = null;
          handlers.fetch({ request, respondWith: (p) => { pris = p; } });
          if (!pris) return { repondu: false };
          try { return { repondu: true, valeur: await pris }; } catch (e) { return { repondu: true, erreur: String((e && e.message) || e) }; }
        },
        async installe() { const w = []; handlers.install({ waitUntil: (p) => w.push(p) }); await Promise.all(w); return true; },
        async active() { const w = []; handlers.activate({ waitUntil: (p) => w.push(p) }); await Promise.all(w); return true; },
      };
    }
    const H = (u) => ({ url: u, method: 'GET', mode: 'no-cors' });
    const NAV = (u) => ({ url: u, method: 'GET', mode: 'navigate' });
    const R = (ok, status, body) => ({ ok, status, clone: () => ({ body }), body });

    {
      // Install : un asset qui 404 ne doit plus faire échouer l’installation.
      const sw = monteSw({ fetchImpl: async (r) => R(true, 200, 'x') });
      let leve = null;
      try { await sw.installe(); } catch (e) { leve = String(e.message || e); }
      check('install : un asset manquant ne fait plus échouer l\u2019installation', leve === null, leve);
      check('install : skipWaiting est bien appelé (mise à jour immédiate)', sw.nbSkip() === 1, 'nb ' + sw.nbSkip());
      check('activate : les anciens caches sont supprimés', (await sw.active(), sw.deletes.includes('botdev-v1')), sw.deletes.join(','));
    }
    {
      // Réseau OK sur un JS : mis en cache.
      const vus = [];
      const sw = monteSw({ fetchImpl: async (r) => { vus.push(String(r.url)); return R(true, 200, 'code'); } });
      const out = await sw.fetche(H('http://localhost:3000/js/dashboard.js?v=373'));
      await wait(10);
      check('js valide : passé au navigateur ET mis en cache',
        out.repondu && out.valeur && out.valeur.ok && sw.puts.some((p) => /dashboard\.js/.test(p.url)), JSON.stringify(out.valeur && { ok: out.valeur.ok }) + ' puts=' + sw.puts.length);
      check('js valide : la requête réseau est partie une seule fois', vus.length === 1, String(vus.length));
    }
    {
      // 404 sur un CSS : avalé, mais SURTOUT pas stocké.
      const sw = monteSw({ fetchImpl: async () => R(false, 404, 'pas trouve') });
      const out = await sw.fetche(H('http://localhost:3000/css/dashboard.css?v=373'));
      await wait(10);
      check('réponse d\u2019erreur : transmise telle quelle, jamais stockée',
        out.repondu && out.valeur.status === 404 && sw.puts.length === 0, 'puts=' + JSON.stringify(sw.puts));
    }
    {
      // Réseau en panne sur un JS non cache : PAS de coquille HTML.
      const sw = monteSw({ fetchImpl: async () => { throw new Error('réseau'); } });
      const out = await sw.fetche(H('http://localhost:3000/js/dashboard.js?v=373'));
      check('js introuvable hors ligne : le HTML n\u2019est plus servi en guise de script',
        out.repondu && !!out.erreur && !out.valeur, JSON.stringify(out));
      check('le refus est net (message « hors ligne »), pas une page blanche muette',
        /hors ligne|network|réseau/i.test(out.erreur || ''), out.erreur);
    }
    {
      // Réseau en panne sur une NAVIGATION : la coquille, cette fois, oui.
      const sw = monteSw({
        cacheOk: { '/': 'shell html' },
        fetchImpl: async () => { throw new Error('réseau'); },
      });
      const out = await sw.fetche(NAV('http://localhost:3000/'));
      check('navigation hors ligne : la coquille en cache reprend la main',
        out.repondu && out.valeur && out.valeur.body === 'shell html', JSON.stringify(out.valeur));
    }
    {
      // Une requête d’image déjà en cache ne repart pas sur le réseau.
      let appels = 0;
      const sw = monteSw({
        cacheOk: { '/icons/nexora-robot-mark.png': 'png cache' },
        fetchImpl: async () => { appels += 1; return R(true, 200, 'reseau'); },
      });
      const out = await sw.fetche(H('http://localhost:3000/icons/nexora-robot-mark.png'));
      check('image déjà en cache : servie sans rappeler le réseau',
        out.valeur && out.valeur.body === 'png cache' && appels === 0, 'appels réseau : ' + appels);
    }
    {
      // /api : le service worker ne doit jamais s’en mêler.
      let appels = 0;
      const sw = monteSw({ fetchImpl: async () => { appels += 1; return R(true, 200, 'x'); } });
      const out = await sw.fetche(H('http://localhost:3000/api/public/bot-avatar'));
      check('/api : aucune interception (le cache ne peut pas figer les données)',
        out.repondu === false && appels === 0, JSON.stringify(out));
    }
  }

  // =========================================================================
  console.log('\n— 8. Le flash n\u2019est pas un problème de serveur : le proxy répond —');
  {
    const app = lire('public/js/app.js');
    check('le routeur prend un numéro de vue à chaque navigation',
      /App\._vueSeq = \(App\._vueSeq \|\| 0\) \+ 1;/.test(lire('public/js/app.js').includes('_vueSeq') ? app : ''), 'compteur absent');
    check('la vue du dashboard vérifie ce numéro avant d\u2019écrire',
      app.includes('if (App._vueSeq !== seq) return;'), 'garde absente');
    check('la marque est écrite dès que /hoxera a répondu', app.includes('App.brandWrite(bot);'), 'brandWrite non appelé');
    check('la barre est comparée à la marque connue avant remplacement',
      app.includes('currentNav.dataset.brandSig !== App.brandSig(bot)'), 'comparaison absente');
    check('le nom de secours reste « Hoxera » (jamais vide, jamais « undefined »)',
      app.includes("(bot && bot.name) || 'Hoxera'"), 'secours introuvable');
  }

  console.log('');
  if (ko === 0) console.log(`🎉 v364 — ${ok} vérifications OK : plus de flash de marque au rafraîchissement, et le service worker ne ment plus sur ce qu’il cache.`);
  else { console.log(`❌ v364 — ${ko} échec(s) sur ${ok + ko}`); process.exitCode = 1; }
})().catch((e) => { console.error('💥', (e && e.stack) || e); process.exitCode = 1; });
