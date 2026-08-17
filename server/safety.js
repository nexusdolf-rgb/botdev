// ============================================================
// Hoxera — Filets de sécurité du processus
// Le bot ne doit JAMAIS mourir à cause d'une erreur isolée :
// les erreurs non interceptées sont journalisées et le processus
// continue de tourner (le chien de garde redémarre les bots).
// ============================================================
function install() {
  process.on('uncaughtException', (err) => {
    console.error('[Hoxera] ⚠️ Erreur inattendue (récupérée, le bot continue) :', (err && err.message) || err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Hoxera] ⚠️ Promesse non gérée (récupérée, le bot continue) :', (reason && reason.message) || reason);
  });
}

module.exports = { install };
