// Filets de sécurité du processus : les incidents sont tracés, puis le
// processus s'arrête proprement par code non nul. Continuer après une erreur
// non interceptée pourrait laisser la base ou les clients Discord incohérents;
// Render/Docker/PM2 doit redémarrer une instance saine.
function install() {
  const health = require('./health');
  let stopping = false;
  const fatal = (source, error) => {
    if (stopping) return;
    stopping = true;
    const message = (error && error.message) || String(error || 'erreur inconnue');
    health.recordError(source, message);
    console.error(`[Hoxera] 🛑 Erreur fatale (${source}) :`, message);
    process.exit(1);
  };

  process.on('uncaughtException', (err) => fatal('processus', err));
  process.on('unhandledRejection', (reason) => fatal('promesse', reason));
  process.on('warning', (warning) => {
    console.error('[Hoxera] ⚠️ Avertissement Node :', (warning && warning.message) || warning);
  });

  // Surveillance mémoire : les seuils restent visibles dans le centre de santé.
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
