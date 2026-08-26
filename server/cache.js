// ============================================================
// Nexora — Cache mémoire borné et dédupliqué
//
// Utilisé uniquement pour des données Discord relisibles (catalogues,
// listes de membres). Les données importantes restent en SQLite et le
// cache expire rapidement pour ne jamais devenir une source de vérité.
// ============================================================

const cacheRegistry = new Set();

class TTLCache {
  constructor({ ttlMs = 30000, max = 1000 } = {}) {
    this.ttlMs = Math.max(1, Number(ttlMs) || 30000);
    this.max = Math.max(1, Number(max) || 1000);
    this.items = new Map();
    cacheRegistry.add(this);
  }

  get(key) {
    const item = this.items.get(String(key));
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) {
      this.items.delete(String(key));
      return undefined;
    }
    // LRU léger : les entrées récemment utilisées restent prioritaires.
    this.items.delete(String(key));
    this.items.set(String(key), item);
    return item.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    const k = String(key);
    this.items.delete(k);
    this.items.set(k, { value, expiresAt: Date.now() + Math.max(1, Number(ttlMs) || this.ttlMs) });
    this.prune();
    return value;
  }

  delete(key) {
    return this.items.delete(String(key));
  }

  clear() {
    this.items.clear();
  }

  prune() {
    const now = Date.now();
    for (const [key, item] of this.items) {
      if (item.expiresAt <= now) this.items.delete(key);
    }
    while (this.items.size > this.max) this.items.delete(this.items.keys().next().value);
  }

  get size() {
    this.prune();
    return this.items.size;
  }
}

class AsyncTTLCache extends TTLCache {
  constructor(options = {}) {
    super(options);
    this.pending = new Map();
  }

  async getOrLoad(key, loader, ttlMs = this.ttlMs) {
    const k = String(key);
    const cached = this.get(k);
    if (cached !== undefined) return cached;
    if (this.pending.has(k)) return this.pending.get(k);
    const promise = Promise.resolve().then(loader).then((value) => {
      this.set(k, value, ttlMs);
      return value;
    }).finally(() => this.pending.delete(k));
    this.pending.set(k, promise);
    return promise;
  }

  delete(key) {
    this.pending.delete(String(key));
    return super.delete(key);
  }

  clear() {
    this.pending.clear();
    super.clear();
  }
}

function clearAllCaches() {
  for (const cache of cacheRegistry) {
    try { cache.clear(); } catch {}
  }
}

function cacheStats() {
  let entries = 0;
  let pending = 0;
  for (const cache of cacheRegistry) {
    try { entries += cache.size; } catch {}
    try { pending += cache.pending ? cache.pending.size : 0; } catch {}
  }
  return { caches: cacheRegistry.size, entries, pending };
}

module.exports = { TTLCache, AsyncTTLCache, clearAllCaches, cacheStats };
