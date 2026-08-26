// ============================================================
// Nexora — protections HTTP du dashboard
//
// Ce module ne donne jamais de permission : il ajoute uniquement des
// garde-fous. En cas de doute (origine inconnue, limite dépassée), la
// requête est refusée — jamais autorisée par défaut.
// ============================================================

const crypto = require('crypto');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const buckets = new Map();

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

    // Plafond mémoire : les adresses abandonnées ne restent pas indéfiniment.
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

function requestProtocol(req) {
  return String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim().toLowerCase();
}

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim().toLowerCase();
}

function configuredOrigins() {
  return (process.env.NEXORA_ALLOWED_ORIGINS || 'https://hoxera.is-a.dev,https://hoxera.onrender.com')
    .split(',').map((origin) => origin.trim().replace(/\/$/, '').toLowerCase()).filter(Boolean);
}

function sameOrigin(req, origin) {
  if (!origin) return true; // les clients non navigateur n'envoient pas Origin
  try {
    const parsed = new URL(origin);
    const external = `${parsed.protocol}//${parsed.host}`.toLowerCase().replace(/\/$/, '');
    const requestExternal = `${requestProtocol(req)}://${requestHost(req)}`.toLowerCase().replace(/\/$/, '');
    if (external === requestExternal) return true;
    return configuredOrigins().includes(external);
  } catch {
    return false;
  }
}

function originGuard(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!sameOrigin(req, origin)) {
    return res.status(403).json({ error: 'Origine de requête refusée.' });
  }
  return next();
}

function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Pas de Cross-Origin-Resource-Policy ici : Discord doit pouvoir charger
  // les bannières et images publiques envoyées dans les embeds.
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  if (requestProtocol(req) === 'https') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function secureCookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: requestProtocol(req) === 'https',
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
  originGuard,
  securityHeaders,
  secureCookieOptions,
  randomToken,
  resetRateLimits,
};
