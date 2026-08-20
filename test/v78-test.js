// ============================================================
// Test Hoxera v78 — Brique 4 « Mode dégradé intelligent »
//  1. Détection des erreurs de débit/réseau (429, timeouts…)
//  2. Circuit breaker : 8 échecs → dégradé, 20 → critique
//  3. Retour automatique à la normale après récupération
//  4. retry() : retentatives avec backoff exponentiel, succès final
//  5. La file d'attente retente les envois (résilience intégrée)
//  6. Le mode critique répond « très sollicité » aux commandes
//  7. La santé expose l'état du circuit breaker
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v78-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const resilience = require('../server/resilience');

  // ---------- 1. Détection ----------
  check('détection : 429 reconnu', resilience.isRateOrNetwork(new Error('429: rate limited')));
  check('détection : timeout réseau reconnu', resilience.isRateOrNetwork(new Error('socket hang up')));
  check('détection : erreur « fetch failed » reconnue', resilience.isRateOrNetwork(new Error('fetch failed')));
  check('détection : erreur classique NON reconnue', !resilience.isRateOrNetwork(new Error('permission refusée')));
  check('détection : erreur non-objet gérée', typeof resilience.isRateOrNetwork('blabla') === 'boolean');

  // ---------- 2. Circuit breaker ----------
  resilience.__testReset();
  check('état initial : ok', resilience.status().state === 'ok');
  for (let i = 0; i < 7; i++) resilience.recordFailure('envoi');
  check('7 échecs : toujours ok', resilience.status().state === 'ok');
  resilience.recordFailure('envoi');
  check('8 échecs : mode dégradé', resilience.status().state === 'degrade');
  check('dégradé : throttle actif', resilience.shouldThrottle() === true);
  check('dégradé : pas encore de réponses « patiente »', resilience.shouldDeferReplies() === false);
  for (let i = 0; i < 12; i++) resilience.recordFailure('envoi');
  check('20 échecs : mode critique', resilience.status().state === 'critique');
  check('critique : réponses « patiente » actives', resilience.shouldDeferReplies() === true);
  check('statut : compteurs exposés', resilience.status().failuresInWindow === 20);

  // ---------- 3. Retour à la normale ----------
  resilience.__testReset();
  for (let i = 0; i < 8; i++) resilience.recordFailure('envoi');
  check('avant récupération : dégradé', resilience.status().state === 'degrade');
  // Scénario réaliste : les échecs sortent de la fenêtre d'analyse (61 s),
  // l'état dégradé dure depuis 31 s, puis un succès confirme la reprise.
  resilience.__testAgeFailures(61000);
  resilience.__testAgeSince(31000);
  resilience.recordSuccess();
  check('après 31 s sans échec : retour à la normale', resilience.status().state === 'ok');

  // ---------- 4. retry() avec backoff ----------
  resilience.__testReset();
  check('backoff : 1 s, 2 s, 4 s, 8 s', resilience.backoffDelay(0) === 1000 && resilience.backoffDelay(1) === 2000 && resilience.backoffDelay(2) === 4000 && resilience.backoffDelay(3) === 8000);
  let attempts = 0;
  const t0 = Date.now();
  const result = await resilience.retry(async () => {
    attempts++;
    if (attempts < 3) { const e = new Error('429: rate limited'); throw e; }
    return 'réussi';
  }, { category: 'test', maxRetries: 3, baseDelay: 100 });
  const elapsed = Date.now() - t0;
  check('retry : réussit après 2 échecs 429', result === 'réussi' && attempts === 3);
  check('retry : a réellement attendu (backoff ≥ 300 ms)', elapsed >= 300);

  // retry : erreur non-réseau → pas de retentative
  let attempts2 = 0;
  let threw = false;
  try {
    await resilience.retry(async () => { attempts2++; throw new Error('permission refusée'); }, { category: 'test', baseDelay: 50 });
  } catch { threw = true; }
  check('retry : erreur non-réseau → échec immédiat (1 tentative)', threw === true && attempts2 === 1);

  // ---------- 5. La file d'attente retente les envois ----------
  const queue = require('../server/queue');
  let sendAttempts = 0;
  const fakeChannel = {
    id: 'C429',
    send: async () => {
      sendAttempts++;
      if (sendAttempts < 2) { const e = new Error('429: rate limited'); throw e; }
      return { id: 'ok' };
    },
  };
  const okSend = await queue.send(fakeChannel, { content: 'test 429' });
  check('file : l\'envoi 429 est retenté puis réussit', okSend === true && sendAttempts === 2);

  // ---------- 6. Mode critique : réponse « très sollicité » ----------
  const botManager = require('../server/discord/botManager');
  resilience.__testReset();
  for (let i = 0; i < 20; i++) resilience.recordFailure('interaction');
  const i = {
    replied: false, deferred: false, replies: [],
    customId: '', commandName: 'ping',
    reply: async function (p) { this.replied = true; this.replies.push(p); return {}; },
    editReply: async function () { return {}; },
    deferReply: async function () { this.deferred = true; },
    deferUpdate: async function () { this.deferred = true; },
    followUp: async function () { return {}; },
    isRepliable: () => true,
    isChatInputCommand: () => true,
    isButton: () => false, isStringSelectMenu: () => false, isRoleSelectMenu: () => false,
    isChannelSelectMenu: () => false, isModalSubmit: () => false,
  };
  await botManager.guardInteraction(1, {}, i, 1000);
  check('critique : la commande reçoit « très sollicité »', i.replied && String(i.replies[0].content).includes('très sollicité'));
  resilience.__testReset();

  // ---------- 7. La santé expose le circuit breaker ----------
  const health = require('../server/health');
  const snap = health.snapshot();
  check('santé : résilience exposée', snap.resilience && typeof snap.resilience.state === 'string' && typeof snap.resilience.failuresInWindow === 'number');

  console.log(failures === 0 ? '\n✅ V78 — Brique 4 « Mode dégradé intelligent » : 100 % fonctionnel. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
