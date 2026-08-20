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
  // 🧠 Surveillance mémoire : alerte avant que l'instance gratuite (512 Mo)
  // ne soit saturée — permet d'agir avant un crash.
  setInterval(() => {
    const mem = process.memoryUsage();
    if (mem.heapUsed > 400 * 1024 * 1024) {
      console.error(`[Hoxera] 🧠 MÉMOIRE HAUTE : ${Math.round(mem.heapUsed / 1024 / 1024)} Mo utilisés — risque de saturation !`);
    }
  }, 5 * 60000).unref();
}

module.exports = { install };
