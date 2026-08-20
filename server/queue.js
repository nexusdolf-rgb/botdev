// ============================================================
// Hoxera — File d'attente intelligente (brique 3 : anti-limites)
// Tous les envois vers Discord (panneaux, bienvenues, tickets,
// logs identité…) passent par cette file : les rafales sont
// lissées pour ne JAMAIS dépasser les limites de débit de Discord.
//  - concurrence limitée (3 envois simultanés max)
//  - délai minimum entre les départs (lissage)
//  - délai max par tâche (10 s) : une tâche lente n'en bloque
//    jamais d'autres
//  - file bornée : au-delà, refus propre (mode dégradé) au lieu
//    d'une explosion de mémoire
//  - statistiques exposées dans le Centre de santé
// ============================================================

const CONCURRENCY = 3;      // envois simultanés max
const MIN_INTERVAL_MS = 80; // délai minimum entre deux départs
const TASK_TIMEOUT_MS = 10000;
let maxQueue = 500;         // file bornée (configurable pour les tests)

let queue = [];             // [{ task, resolve, reject, key, addedAt }]
let active = 0;
let lastStart = 0;
let processing = false;

const stats = {
  processed: 0,   // tâches terminées (succès)
  failed: 0,      // tâches en erreur
  refused: 0,     // refusées (file pleine)
  waiting: 0,     // actuellement en attente
  active: 0,      // en cours
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function pump() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length && active < CONCURRENCY) {
      // Lissage : on espace les départs
      const sinceLast = Date.now() - lastStart;
      if (sinceLast < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - sinceLast);
      const item = queue.shift();
      stats.waiting = queue.length;
      active++;
      stats.active = active;
      lastStart = Date.now();
      const guard = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), TASK_TIMEOUT_MS));
      Promise.race([item.task(), guard])
        .then((res) => {
          if (res && res.timeout) {
            console.error(`[Hoxera] ⏱️ Tâche en file trop lente (${item.key}) — abandonnée proprement.`);
            stats.failed++;
            item.resolve(false);
          } else {
            stats.processed++;
            item.resolve(true);
          }
        })
        .catch((e) => {
          stats.failed++;
          console.error(`[Hoxera] Tâche en file échouée (${item.key}) :`, (e && e.message) || e);
          item.resolve(false);
        })
        .finally(() => {
          active--;
          stats.active = active;
          stats.waiting = queue.length;
          pump(); // on continue tant qu'il y a du monde
        });
    }
  } finally {
    processing = false;
  }
}

// Enfile une tâche. Retourne true (exécutée/terminée) ou false (refus ou échec).
function enqueue(task, key = 'tache') {
  if (typeof task !== 'function') return Promise.resolve(false);
  if (queue.length >= maxQueue) {
    stats.refused++;
    console.error(`[Hoxera] 🚦 File pleine — tâche refusée proprement (${key}).`);
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    // 🛡️ Résilience : les erreurs de débit/réseau déclenchent des
    // retentatives automatiques (backoff court : 0,8 s puis 1,6 s)
    // avant d'abandonner — et le circuit breaker passe en mode dégradé.
    const resilientTask = () => {
      const resilience = require('./resilience');
      return resilience.retry(task, { category: 'envoi', maxRetries: 2, baseDelay: 800 });
    };
    queue.push({ task: resilientTask, resolve, key: String(key).slice(0, 60), addedAt: Date.now() });
    stats.waiting = queue.length;
    pump();
  });
}

// ⚙️ Limites configurables (tests uniquement)
function configure({ maxQueue: mq } = {}) {
  if (typeof mq === 'number' && mq > 0) maxQueue = mq;
}

// Envoie un message Discord à travers la file (helper standard).
async function send(target, payload) {
  if (!target || typeof target.send !== 'function') return false;
  const key = (target.id ? String(target.id).slice(0, 20) : 'salon') + '/' + (payload && payload.embeds ? 'embed' : 'msg');
  return enqueue(() => target.send(payload).then(() => true), key);
}

function statsSnapshot() {
  return { ...stats };
}

module.exports = { enqueue, send, statsSnapshot, configure, CONCURRENCY, TASK_TIMEOUT_MS };
