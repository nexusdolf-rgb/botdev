// ============================================================
// Test v3.28 — Garde-fous HTTP : en-têtes, origine, limitation
// de débit et mode fondateur fail-closed.
// ============================================================
const assert = require('assert');
const security = require('../server/security');

function request(overrides = {}) {
  const headers = Object.fromEntries(Object.entries(overrides.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method: overrides.method || 'GET',
    ip: overrides.ip || '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers,
    get(name) { return this.headers[String(name).toLowerCase()]; },
    path: overrides.path || '/api/test',
    secure: !!overrides.secure,
  };
}

function response() {
  return {
    values: {}, statusCode: 200, body: null,
    set(key, value) { this.values[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

// ---------- En-têtes ----------
const headerRes = response();
let nextCalled = false;
security.securityHeaders(request({ secure: true }), headerRes, () => { nextCalled = true; });
assert(nextCalled);
assert.strictEqual(headerRes.values['X-Content-Type-Options'], 'nosniff');
assert.strictEqual(headerRes.values['Referrer-Policy'], 'strict-origin-when-cross-origin');
assert.strictEqual(headerRes.values['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
assert.strictEqual(headerRes.values['Cache-Control'], 'no-store');
assert(headerRes.values['Strict-Transport-Security'].includes('max-age=31536000'));
console.log('1️⃣  En-têtes HTTP de sécurité appliqués ✅');

// ---------- Origine ----------
let originNext = false;
security.originGuard(request({ method: 'POST', headers: { origin: 'https://hoxera.is-a.dev', host: 'hoxera.is-a.dev', 'x-forwarded-proto': 'https' } }), response(), () => { originNext = true; });
assert(originNext, 'origine officielle autorisée');
const originDenied = response();
security.originGuard(request({ method: 'POST', headers: { origin: 'https://site-pirate.example', host: 'hoxera.is-a.dev', 'x-forwarded-proto': 'https' } }), originDenied, () => {});
assert.strictEqual(originDenied.statusCode, 403);
assert(!originDenied.body.error.includes('secret'));
console.log('2️⃣  Origines externes refusées pour les requêtes d’écriture ✅');

// ---------- Limitation de débit ----------
security.resetRateLimits();
const limited = security.rateLimit({ name: 'test-v131', windowMs: 60000, max: 2 });
let allowed = 0;
for (let i = 0; i < 3; i++) {
  const res = response();
  limited(request({ ip: '10.0.0.1' }), res, () => { allowed += 1; });
  if (i === 2) {
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(res.values['Retry-After'] !== undefined, true);
  }
}
assert.strictEqual(allowed, 2);
console.log('3️⃣  Limitation anti-brute-force et Retry-After actifs ✅');

// ---------- Cookies sécurisés ----------
const cookie = security.secureCookieOptions(request({ secure: true }), 1234);
assert.strictEqual(cookie.httpOnly, true);
assert.strictEqual(cookie.sameSite, 'lax');
assert.strictEqual(cookie.secure, true);
assert.strictEqual(cookie.path, '/');
assert.strictEqual(cookie.maxAge, 1234);
console.log('4️⃣  Cookies de session sécurisés en HTTPS ✅');

console.log('\n🎉 Tous les tests v3.28 passent !');
