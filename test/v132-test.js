// ============================================================
// Test v3.30 — Cache borné/dédupliqué et protection mémoire.
// ============================================================
const assert = require('assert');
const { TTLCache, AsyncTTLCache, clearAllCaches, cacheStats } = require('../server/cache');
const resourceGuard = require('../server/resourceGuard');

(async () => {
  const cache = new TTLCache({ ttlMs: 20, max: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  assert.strictEqual(cache.get('a'), 1);
  cache.set('c', 3);
  assert.strictEqual(cache.get('b'), undefined, 'LRU borné');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.strictEqual(cache.get('a'), undefined, 'TTL respecté');
  console.log('1️⃣  Cache : TTL et plafond LRU respectés ✅');

  const asyncCache = new AsyncTTLCache({ ttlMs: 1000, max: 10 });
  let loads = 0;
  const loader = () => new Promise((resolve) => setTimeout(() => { loads += 1; resolve({ ok: true }); }, 10));
  const values = await Promise.all([asyncCache.getOrLoad('same', loader), asyncCache.getOrLoad('same', loader), asyncCache.getOrLoad('same', loader)]);
  assert.strictEqual(loads, 1, 'une seule lecture simultanée');
  assert(values.every((value) => value.ok));
  assert.strictEqual((await asyncCache.getOrLoad('same', loader)).ok, true);
  assert.strictEqual(loads, 1, 'lecture servie par le cache');
  console.log('2️⃣  Cache : requêtes identiques regroupées en une seule ✅');

  const guarded = new TTLCache({ ttlMs: 10000, max: 10 });
  guarded.set('important-read-cache', 'value');
  resourceGuard.__testReset();
  const limit = resourceGuard.MEMORY_LIMIT_MB * 1024 * 1024;
  resourceGuard.observe({ rss: Math.round(limit * 0.85), heapUsed: 0, heapTotal: 0 });
  assert.strictEqual(resourceGuard.isHigh(), true);
  assert.strictEqual(guarded.get('important-read-cache'), undefined, 'caches nettoyés sous pression');
  resourceGuard.observe({ rss: Math.round(limit * 0.95), heapUsed: 0, heapTotal: 0 });
  assert.strictEqual(resourceGuard.isCritical(), true);
  resourceGuard.observe({ rss: 1, heapUsed: 1, heapTotal: 1 });
  assert.strictEqual(resourceGuard.isCritical(), false);
  clearAllCaches();
  console.log('3️⃣  Mémoire : caches vidés automatiquement en pression haute/critique ✅');

  const stats = cacheStats();
  assert(stats && typeof stats.caches === 'number' && typeof stats.entries === 'number');
  console.log('4️⃣  Santé : nombre d’entrées de cache exposé sans donnée sensible ✅');
  console.log('\n🎉 Tous les tests v3.30 passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
