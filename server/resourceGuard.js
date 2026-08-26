// ============================================================
// Nexora — Protection des ressources (mémoire)
//
// Ce garde-fou ne tue jamais le processus et ne supprime aucune donnée
// persistante. Il observe la mémoire RSS, vide les caches non essentiels
// lorsque la pression monte et expose un état lisible au centre de santé.
// ============================================================

const MEMORY_LIMIT_MB = Math.max(128, Number(process.env.NEXORA_MEMORY_LIMIT_MB) || 512);
const WATCH_RATIO = 0.70;
const HIGH_RATIO = 0.82;
const CRITICAL_RATIO = 0.92;

let state = 'normal'; // normal | watch | high | critical
let changedAt = Date.now();
let lastCacheClearAt = 0;

function ratioFor(memory) {
  const rss = Number(memory && memory.rss) || 0;
  const heapUsed = Number(memory && memory.heapUsed) || 0;
  const limit = MEMORY_LIMIT_MB * 1024 * 1024;
  // RSS protège aussi les buffers natifs (sharp, SQLite, Discord), tandis que
  // heapUsed protège le tas JavaScript. On retient le signal le plus élevé.
  return Math.max(rss / limit, heapUsed / limit);
}

function labelFor(ratio) {
  if (ratio >= CRITICAL_RATIO) return 'critical';
  if (ratio >= HIGH_RATIO) return 'high';
  if (ratio >= WATCH_RATIO) return 'watch';
  return 'normal';
}

function clearCaches(reason) {
  try {
    const { clearAllCaches } = require('./cache');
    clearAllCaches();
    lastCacheClearAt = Date.now();
    console.warn(`[Hoxera] 🧹 Caches non essentiels vidés (${reason}).`);
  } catch (e) {
    console.error('[Hoxera] Nettoyage des caches impossible :', e.message);
  }
}

function observe(memory = process.memoryUsage()) {
  const next = labelFor(ratioFor(memory));
  if (next !== state) {
    const previous = state;
    state = next;
    changedAt = Date.now();
    if ((next === 'high' || next === 'critical') && next !== previous) clearCaches(next);
    if (next === 'normal' && previous !== 'normal') console.log('[Hoxera] 🟢 Pression mémoire revenue à la normale.');
    if (next === 'watch') console.warn('[Hoxera] 👀 Pression mémoire à surveiller.');
    if (next === 'high') console.warn('[Hoxera] ⚠️ Pression mémoire élevée : les caches sont vidés.');
    if (next === 'critical') console.error('[Hoxera] 🚨 Pression mémoire critique : les caches sont vidés, les tâches lourdes doivent être limitées.');
  }
  return snapshot(memory);
}

function snapshot(memory = process.memoryUsage()) {
  const rss = Number(memory && memory.rss) || 0;
  const heapUsed = Number(memory && memory.heapUsed) || 0;
  const heapTotal = Number(memory && memory.heapTotal) || 0;
  return {
    state,
    limitMb: MEMORY_LIMIT_MB,
    rssMb: Math.round(rss / 1024 / 1024),
    heapUsedMb: Math.round(heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(heapTotal / 1024 / 1024),
    ratio: Number(ratioFor(memory).toFixed(3)),
    changedAt,
    lastCacheClearAt,
  };
}

function isHigh() { return state === 'high' || state === 'critical'; }
function isCritical() { return state === 'critical'; }

function __testReset() {
  state = 'normal';
  changedAt = Date.now();
  lastCacheClearAt = 0;
}

module.exports = { MEMORY_LIMIT_MB, observe, snapshot, isHigh, isCritical, __testReset };
