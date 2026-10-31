// 📉 v386 — Compression et cache des fichiers du site.
//
// Pourquoi : l'hébergeur facture le trafic SORTANT. Une page du tableau de
// bord pesait 4,7 Mo (images) + 1,26 Mo (JS/CSS envoyés en clair) : 5 Go de
// quota partaient en ~2 000 visites. Ici :
//   1. le texte (JS, CSS, HTML, SVG, JSON) part compressé (~4× plus léger) ;
//   2. les fichiers versionnés (« ?v=383 ») sont mis en cache un an par le
//      navigateur : une visite suivante ne les retélécharge pas du tout.
// Rien n'est modifié sur le disque : tout est préparé une fois, en mémoire.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES_TEXTE = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// Chemins dont le contenu peut être gardé très longtemps par le navigateur
// quand l'URL porte un numéro de version (« ?v=… »).
const LONGUE_DUREE = /^\/(js|css|icons|emotes|assets)\//;

let cache = null;

function construire() {
  const map = new Map();
  const parcourir = (dossier) => {
    let entrees = [];
    try { entrees = fs.readdirSync(dossier, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      const complet = path.join(dossier, e.name);
      if (e.isDirectory()) { parcourir(complet); continue; }
      const ext = path.extname(e.name).toLowerCase();
      const type = TYPES_TEXTE[ext];
      if (!type) continue; // images déjà compressées : on n'y touche pas
      let brut;
      try { brut = fs.readFileSync(complet); } catch { continue; }
      if (brut.length < 512) continue; // trop petit pour y gagner
      const rel = '/' + path.relative(PUBLIC, complet).split(path.sep).join('/');
      const gz = zlib.gzipSync(brut, { level: 9 });
      const br = zlib.brotliCompressSync(brut, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 9,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: brut.length,
        },
      });
      map.set(rel, {
        type,
        gz,
        br,
        gzLen: gz.length,
        brLen: br.length,
        etag: '"' + crypto.createHash('sha1').update(brut).digest('hex').slice(0, 16) + '"',
      });
    }
  };
  parcourir(PUBLIC);
  return map;
}

function tout() {
  if (!cache) cache = construire();
  return cache;
}

function accepte(entete, codec) {
  if (!entete) return false;
  return new RegExp('(^|,)\\s*' + codec + '\\s*(;|,|$)').test(String(entete).toLowerCase());
}

function enteteCache(chemin, url) {
  if (LONGUE_DUREE.test(chemin) && /[?&]v=\d+/.test(url || '')) {
    return 'public, max-age=31536000, immutable';
  }
  if (LONGUE_DUREE.test(chemin)) return 'public, max-age=604800';
  return 'public, max-age=300';
}

// Middleware : répond aux fichiers texte compressés, laisse passer le reste
// (images, API, pages dynamiques) vers les gestionnaires suivants.
function middleware(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let chemin = decodeURIComponent(String(req.path || ''));
  if (chemin === '/' || chemin === '') chemin = '/index.html'; // la page d'accueil
  const entree = tout().get(chemin);
  if (!entree) return next();
  const encodage = accepte(req.headers['accept-encoding'], 'br') ? 'br'
    : accepte(req.headers['accept-encoding'], 'gzip') ? 'gz' : '';
  const corps = encodage === 'br' ? entree.br : encodage === 'gz' ? entree.gz : null;
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('ETag', entree.etag);
  res.setHeader('Cache-Control', enteteCache(chemin, req.originalUrl));
  // Le navigateur a déjà cette version : aucune donnée à envoyer.
  if (req.headers['if-none-match'] === entree.etag) {
    res.statusCode = 304;
    return res.end();
  }
  res.setHeader('Content-Type', entree.type);
  if (!corps) return next(); // client sans compression : le fichier part en clair
  res.setHeader('Content-Encoding', encodage === 'br' ? 'br' : 'gzip');
  res.setHeader('Content-Length', corps.length);
  if (req.method === 'HEAD') return res.end();
  return res.end(corps);
}

// État lisible pour le diagnostic (aucune donnée sensible).
function etat() {
  let brut = 0;
  let gz = 0;
  let br = 0;
  for (const [, v] of tout()) {
    gz += v.gzLen;
    br += v.brLen;
  }
  return { fichiers: tout().size, gzip: Math.round(gz / 1024), brotli: Math.round(br / 1024) };
}

module.exports = { middleware, etat, enteteCache, _reset: () => { cache = null; } };
