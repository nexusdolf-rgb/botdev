// ============================================================
// Hoxera — Santé du bot (brique 2 : centre de santé)
// Collecte en mémoire : erreurs récentes (anneau de 100),
// instantané complet pour le dashboard et le diagnostic.
// Aucune donnée sensible n'est exposée.
// (Imports paresseux : ce module est chargé très tôt, AVANT la
// restauration de la base — il ne doit rien ouvrir au chargement.)
// ============================================================

const errors = []; // { ts, source, message }
const ERRORS_MAX = 100;

function recordError(source, message) {
  try {
    errors.unshift({
      ts: Date.now(),
      source: String(source || 'inconnu').slice(0, 60),
      message: String(message || '').slice(0, 200),
    });
    if (errors.length > ERRORS_MAX) errors.pop();
  } catch {}
}

function errorsSince(ts) {
  return errors.filter((e) => e.ts >= ts);
}

function errorsLast24h() {
  return errorsSince(Date.now() - 24 * 3600000);
}

// Instantané complet pour le dashboard / le diagnostic
function snapshot() {
  const botManager = require('./discord/botManager');
  const maintenance = require('./maintenance');
  const store = require('./db');
  const mem = process.memoryUsage();
  const bots = [];
  try { for (const [id, entry] of botManager.clients) bots.push({ id, online: entry.client.isReady() }); } catch {}
  const platform = botManager.platformStats();
  let dbInfo = { fileSizeKo: 0 };
  try { dbInfo = maintenance.dbStats(store.db); } catch {}
  const last24 = errorsLast24h();
  let queueInfo = { waiting: 0, active: 0, processed: 0, failed: 0, refused: 0 };
  try { queueInfo = require('./queue').statsSnapshot(); } catch {}
  let resilienceInfo = { state: 'ok', failuresInWindow: 0 };
  try { resilienceInfo = require('./resilience').status(); } catch {}
  let resources = {};
  try { resources = require('./resourceGuard').observe(mem); } catch {}
  let cache = {};
  try { cache = require('./cache').cacheStats(); } catch {}
  return {
    ts: Date.now(),
    processUptimeS: Math.round(process.uptime()),
    memory: {
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
    },
    resources,
    cache,
    platform,
    botsOnline: bots.filter((b) => b.online).length,
    db: dbInfo,
    queue: queueInfo,
    resilience: resilienceInfo,
    errors24h: {
      count: last24.length,
      last: last24.slice(0, 5).map((e) => ({ source: e.source, message: e.message, at: e.ts })),
    },
  };
}

module.exports = { recordError, errorsSince, errorsLast24h, snapshot };
