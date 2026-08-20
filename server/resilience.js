// ============================================================
// Hoxera — Résilience (brique 4 : mode dégradé intelligent)
// Circuit breaker + retry avec backoff : quand Discord ralentit
// (429, coupures réseau), le bot détecte, ralentit, retente et
// revient à la normale tout seul — sans jamais faire tomber
// une commande.
// ============================================================

const STATS_WINDOW_MS = 60000;    // fenêtre d'analyse : 1 minute
const FAIL_THRESHOLD = 8;         // échecs dans la fenêtre → mode dégradé
const CRITICAL_THRESHOLD = 20;    // → mode critique (réponses « patiente »)
const RECOVERY_MS = 30000;        // 30 s sans échec → retour à la normale
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

let failures = [];      // [{ ts, category }]
let state = 'ok';       // ok | degrade | critique
let since = Date.now(); // début de l'état actuel

function isRateOrNetwork(e) {
  const msg = String((e && e.message) || e).toLowerCase();
  return msg.includes('429') || msg.includes('rate limit') || msg.includes('ratelimit')
    || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('network')
    || msg.includes('socket') || msg.includes('fetch failed') || msg.includes('undici');
}

function recordFailure(category = 'discord') {
  const now = Date.now();
  failures.push({ ts: now, category: String(category).slice(0, 40) });
  failures = failures.filter((f) => f.ts > now - STATS_WINDOW_MS);
  const count = failures.length;
  if (count >= CRITICAL_THRESHOLD) {
    if (state !== 'critique') {
      state = 'critique';
      since = now;
      console.error(`[Hoxera] 📉 Mode CRITIQUE : ${count} échecs en 1 min — réponses « patiente ».`);
    }
  } else if (count >= FAIL_THRESHOLD) {
    if (state === 'ok') {
      state = 'degrade';
      since = now;
      console.error(`[Hoxera] 📉 Mode dégradé : ${count} échecs en 1 min — ralentissement des envois.`);
    }
  }
}

function recordSuccess() {
  const now = Date.now();
  failures = failures.filter((f) => f.ts > now - STATS_WINDOW_MS);
  if (state !== 'ok' && failures.length === 0 && now - since > RECOVERY_MS) {
    console.log('[Hoxera] 🟢 Retour à la normale (plus d\'échec depuis 30 s).');
    state = 'ok';
    since = now;
  }
}

function status() {
  return {
    state,
    failuresInWindow: failures.length,
    since,
    thresholds: { fail: FAIL_THRESHOLD, critical: CRITICAL_THRESHOLD },
  };
}

// Délai de retry (backoff exponentiel : 1 s, 2 s, 4 s…)
function backoffDelay(attempt) {
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Exécute une tâche avec retry automatique sur les erreurs de débit/réseau.
async function retry(task, { category = 'discord', maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY_MS } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await task();
      recordSuccess();
      return res;
    } catch (e) {
      lastErr = e;
      if (!isRateOrNetwork(e) || attempt >= maxRetries) {
        recordFailure(category);
        throw e;
      }
      recordFailure(category);
      await sleep(Math.min(baseDelay * Math.pow(2, attempt), MAX_DELAY_MS));
    }
  }
  throw lastErr;
}

// Le bot doit-il répondre « patiente » aux interactions ? (mode critique)
function shouldDeferReplies() {
  return state === 'critique';
}

// Le bot doit-il ralentir les envois ? (mode dégradé)
function shouldThrottle() {
  return state === 'degrade' || state === 'critique';
}

// ⚙️ Aides de test
function __testReset() {
  failures = [];
  state = 'ok';
  since = Date.now();
}
function __testAgeSince(msAgo) {
  since = Date.now() - msAgo;
}
function __testAgeFailures(msAgo) {
  const target = Date.now() - msAgo;
  failures = failures.map((f) => ({ ...f, ts: target }));
}

module.exports = {
  isRateOrNetwork, recordFailure, recordSuccess, retry, status,
  shouldDeferReplies, shouldThrottle, backoffDelay,
  __testReset, __testAgeSince, __testAgeFailures,
};
