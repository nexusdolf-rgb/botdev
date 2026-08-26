// ============================================================
// Hoxera — Filets de sécurité du processus
// Le bot ne doit JAMAIS mourir à cause d'une erreur isolée :
// les erreurs non interceptées sont journalisées et le processus
// continue de tourner (le chien de garde redémarre les bots).
// + Surveillance de la mémoire et des avertissements Node.
// ============================================================
function install() {
  const health = require('./health');
  process.on('uncaughtException', (err) => {
    health.recordError('processus', (err && err.message) || err);
    console.error('[Hoxera] ⚠️ Erreur inattendue (récupérée, le bot continue) :', (err && err.message) || err);
  });
  process.on('unhandledRejection', (reason) => {
    health.recordError('promesse', (reason && reason.message) || reason);
    console.error('[Hoxera] ⚠️ Promesse non gérée (récupérée, le bot continue) :', (reason && reason.message) || reason);
  });
  process.on('warning', (w) => {
    console.error('[Hoxera] ⚠️ Avertissement Node :', (w && w.message) || w);
  });
  // 🧠 Surveillance mémoire : plusieurs seuils, nettoyage des caches non
  // essentiels et état exposé au centre de santé avant un éventuel OOM.
  const resourceGuard = require('./resourceGuard');
  const checkMemory = () => {
    const info = resourceGuard.observe();
    if (info.state === 'watch') console.warn(`[Hoxera] 👀 MÉMOIRE À SURVEILLER : RSS ${info.rssMb} Mo / ${info.limitMb} Mo.`);
    if (info.state === 'high') console.error(`[Hoxera] ⚠️ MÉMOIRE ÉLEVÉE : RSS ${info.rssMb} Mo / ${info.limitMb} Mo.`);
    if (info.state === 'critical') console.error(`[Hoxera] 🚨 MÉMOIRE CRITIQUE : RSS ${info.rssMb} Mo / ${info.limitMb} Mo.`);
  };
  checkMemory();
  setInterval(checkMemory, 60000).unref();
}

module.exports = { install };
