// ============================================================
// BotDev - Chemins de fichiers partagés
// ============================================================
const path = require('path');

module.exports = {
  dbPath: process.env.BOTDEV_DATA_DIR
    ? path.join(process.env.BOTDEV_DATA_DIR, 'botdev.db')
    : path.join(__dirname, '..', 'botdev.db'),
};
