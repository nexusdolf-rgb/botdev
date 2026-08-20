// ============================================================
// Test Hoxera v77 — Brique 3 « File d'attente intelligente »
//  1. Rafale de 40 tâches → toutes exécutées, ordre préservé
//  2. Concurrence limitée (jamais plus de 3 en simultané)
//  3. Tâche trop lente → abandonnée proprement, ne bloque pas les autres
//  4. File pleine → refus propre (aucune explosion)
//  5. send() helper avec un faux salon
//  6. Les stats sont exposées dans la santé
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v77-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const queue = require('../server/queue');

  // ---------- 1 & 2. Rafale : tout passe, ordre FIFO, concurrence limitée ----------
  const startOrder = [];
  const doneOrder = [];
  let maxActive = 0;
  const tasks = [];
  for (let i = 0; i < 40; i++) {
    tasks.push(queue.enqueue(async () => {
      startOrder.push(i); // ordre de DÉPART (FIFO garanti par la file)
      maxActive = Math.max(maxActive, queue.statsSnapshot().active);
      await sleep(300);   // assez long pour forcer 3 tâches en parallèle
      doneOrder.push(i);
      return true;
    }, 'test-' + i));
  }
  const results = await Promise.all(tasks);
  check('rafale : les 40 tâches exécutées', results.every((r) => r === true));
  check('rafale : ordre de départ préservé (FIFO)', startOrder.length === 40 && startOrder.every((v, i) => v === i));
  check('rafale : toutes terminées', doneOrder.length === 40);
  check('rafale : concurrence max ≤ 3 (limite respectée)', maxActive <= 3);
  check('rafale : la concurrence a réellement monté (≥ 2)', maxActive >= 2);
  check('rafale : 40 traitées dans les stats', queue.statsSnapshot().processed >= 40);

  // ---------- 3. Tâche lente : timeout propre, ne bloque pas ----------
  const t0 = Date.now();
  const slow = queue.enqueue(async () => { await sleep(15000); return true; }, 'tache-lente');
  const fast = queue.enqueue(async () => { await sleep(5); return true; }, 'tache-rapide');
  const [slowRes, fastRes] = await Promise.all([slow, fast]);
  const elapsed = Date.now() - t0;
  check('tâche lente : abandonnée proprement (timeout 10 s)', slowRes === false);
  check('tâche rapide : exécutée malgré la lente', fastRes === true);
  check('tâche lente : timeout ~10 s (pas 15)', elapsed < 14000);

  // ---------- 4. File pleine : refus propre ----------
  // On attend que la file soit vide, puis on bloque la pompe avec une tâche lente
  await sleep(200);
  const queue2 = require('../server/queue');
  queue2.configure({ maxQueue: 5 });
  // Bloque l'exécution : 1 tâche active très lente (mais < timeout)
  const blocker = queue2.enqueue(async () => { await sleep(9000); return true; }, 'bloqueur');
  // Remplit la file au-delà de 5
  const queued = [];
  for (let i = 0; i < 10; i++) queued.push(queue2.enqueue(async () => true, 'remplissage-' + i));
  const qResults = await Promise.all(queued);
  const refused = qResults.filter((r) => r === false).length;
  check('file pleine : refus propre (au moins 5 refusées sur 10)', refused >= 5);
  check('file pleine : les refus sont comptés', queue2.statsSnapshot().refused >= refused);
  // On laisse le bloqueur finir et on remet le plafond normal
  await blocker;
  await sleep(300);
  queue2.configure({ maxQueue: 500 });

  // ---------- 5. send() helper ----------
  const sent = [];
  const fakeChannel = {
    id: 'C123',
    send: async (p) => { sent.push(p); return { id: 'm1' }; },
  };
  const ok1 = await queue.send(fakeChannel, { content: 'coucou' });
  const ok2 = await queue.send(fakeChannel, { embeds: [{ title: 'test' }] });
  check('send : 2 messages passés par la file', ok1 === true && ok2 === true && sent.length === 2);
  check('send : payloads intacts', sent[0].content === 'coucou' && sent[1].embeds[0].title === 'test');
  const badSend = await queue.send(null, { content: 'x' });
  check('send : cible invalide → false propre', badSend === false);

  // ---------- 6. Stats dans la santé ----------
  const health = require('../server/health');
  const snap = health.snapshot();
  check('santé : la file est exposée', snap.queue && typeof snap.queue.processed === 'number' && typeof snap.queue.waiting === 'number');
  check('santé : aucun secret', !JSON.stringify(snap).includes('MTUz'));

  console.log(failures === 0 ? '\n✅ V77 — Brique 3 « File d\'attente intelligente » : 100 % fonctionnelle. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
