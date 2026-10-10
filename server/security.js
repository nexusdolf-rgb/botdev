// Protections HTTP du dashboard : origine stricte, quotas et en-têtes.
const crypto = require('node:crypto');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const buckets = new Map();
const PRODUCTION_ORIGIN = 'https://hoxera.is-a.dev';

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 120);
}

function rateLimit({ name = 'http', windowMs = 60000, max = 60, key = clientKey } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const id = `${name}:${String(key(req) || 'unknown').slice(0, 160)}`;
    let bucket = buckets.get(id);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      buckets.set(id, bucket);
    }
    bucket.count += 1;

    // Plafond mémoire, y compris en cas de rotation rapide d'adresses IP.
    if (buckets.size > 10000) {
      for (const [k, value] of buckets) {
        if (now - value.startedAt >= windowMs) buckets.delete(k);
        if (buckets.size <= 9000) break;
      }
    }

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans quelques instants.' });
    }
    return next();
  };
}

function productionMode() {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
}

function configuredOrigin() {
  const raw = String(process.env.PUBLIC_ORIGIN || '').trim();
  if (!raw) return productionMode() ? PRODUCTION_ORIGIN : '';
  try {
    const parsed = new URL(raw);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
    if (productionMode() && parsed.protocol !== 'https:') return '';
    return parsed.origin.toLowerCase();
  } catch {
    return '';
  }
}

function requestProtocol(req) {
  if (req && req.secure === true) return 'https';
  // Express calcule req.protocol en ne tenant compte que des proxys déclarés
  // comme fiables. On ne lit jamais directement X-Forwarded-Proto ici.
  const protocol = String(req && req.protocol || '').replace(/:$/, '').toLowerCase();
  if (protocol === 'http' || protocol === 'https') return protocol;
  return 'http';
}

function requestHost(req) {
  let raw = '';
  try { raw = typeof req.get === 'function' ? req.get('host') : req.headers && req.headers.host; } catch {}
  raw = String(raw || '').trim();
  if (!raw || raw.length > 255 || raw.includes(',') || /[\s/@\\]/.test(raw)) return '';
  try {
    const parsed = new URL(`http://${raw}`);
    if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== '/') return '';
    return parsed.host.toLowerCase();
  } catch {
    return '';
  }
}

function publicOrigin(req) {
  const configured = configuredOrigin();
  if (configured) return configured;
  // En production, une PUBLIC_ORIGIN invalide fait échouer la comparaison :
  // on ne retombe pas sur un Host fourni par le client.
  if (productionMode()) return '';
  const host = requestHost(req);
  return host ? `${requestProtocol(req)}://${host}` : '';
}

function sameOrigin(req, origin) {
  if (typeof origin !== 'string' || !origin || origin.length > 2048 || origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
    const expected = publicOrigin(req);
    return !!expected && parsed.origin.toLowerCase() === expected.toLowerCase();
  } catch {
    return false;
  }
}

function originGuard(req, res, next) {
  if (!MUTATING_METHODS.has(String(req.method || '').toUpperCase())) return next();
  const origin = typeof req.get === 'function' ? req.get('origin') : req.headers?.origin;
  if (!sameOrigin(req, origin)) {
    return res.status(403).json({ error: 'Origine de requête refusée.' });
  }
  // Les navigateurs modernes ajoutent cet en-tête. S'il affirme une origine
  // cross-site, on refuse même lorsque l'en-tête Origin semble correct.
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') return res.status(403).json({ error: 'Origine de requête refusée.' });
  return next();
}

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (String(req.path || '').startsWith('/api')) res.set('Cache-Control', 'no-store');
  if (requestProtocol(req) === 'https' || publicOrigin(req).startsWith('https://')) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function secureCookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: requestProtocol(req) === 'https' || publicOrigin(req).startsWith('https://'),
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  };
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function resetRateLimits() {
  buckets.clear();
}

module.exports = {
  MUTATING_METHODS,
  rateLimit,
  sameOrigin,
  publicOrigin,
  requestProtocol,
  originGuard,
  securityHeaders,
  secureCookieOptions,
  randomToken,
  resetRateLimits,
};
