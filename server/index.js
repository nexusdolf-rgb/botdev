// ============================================================
// BotDev - Serveur principal
// ============================================================
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const store = require('./db');
const botManager = require('./discord/botManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// API
app.use('/api', routes);

// Fichiers statiques (dashboard)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fallback SPA
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Nettoyage périodique des sessions expirées
setInterval(() => store.sessions.cleanup(), 3600000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 BotDev démarré sur http://0.0.0.0:${PORT}`);
  startupBots();
});

// Reconnecte les bots qui étaient en ligne avant un redémarrage
async function startupBots() {
  const bots = store.db.prepare('SELECT * FROM bots WHERE enabled = 1').all();
  for (const bot of bots) {
    try {
      await botManager.loginBot(bot.id);
      console.log(`🤖 Bot "${bot.name}" (id ${bot.id}) re-démarré`);
    } catch (e) {
      console.log(`⚠️  Impossible de reconnecter le bot "${bot.name}" : ${e.message}`);
    }
  }
}

// Chien de garde : redémarre automatiquement un bot qui se déconnecte
// (coupure réseau, redémarrage de la passerelle Discord, etc.)
const retryTracker = new Map();
setInterval(() => {
  const bots = store.db.prepare('SELECT id FROM bots WHERE enabled = 1').all();
  for (const { id } of bots) {
    if (botManager.isOnline(id)) { retryTracker.delete(id); continue; }
    const last = retryTracker.get(id) || 0;
    if (Date.now() - last < 5 * 60000) continue; // backoff de 5 minutes
    retryTracker.set(id, Date.now());
    botManager.loginBot(id)
      .then(() => console.log(`[watchdog] bot ${id} reconnecté`))
      .catch(() => {});
  }
}, 30000);

process.on('SIGTERM', async () => {
  await botManager.stopAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await botManager.stopAll();
  process.exit(0);
});
