// ============================================================
// BotDev - Serveur principal
// ============================================================
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const backup = require('./backup');

const PORT = process.env.PORT || 3000;

async function main() {
  // 1) Restauration des données (sauvegarde GitHub) AVANT d'ouvrir la base
  await backup.restore();

  // 1 bis) Rapatriement des images d'identité (avatars/bannières)
  try {
    const assets = require('./assets');
    const n = await assets.syncFromRemote();
    if (n) console.log(`[BotDev] 🖼️ ${n} image(s) d'identité restaurée(s)`);
  } catch (e) { console.log('[BotDev] assets:', e.message); }

  // 2) Modules internes (chargés après la restauration)
  const store = require('./db');
  const routes = require('./routes');
  const botManager = require('./discord/botManager');

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(cookieParser());

  // Capture automatique de l'URL publique (première visite) :
  // elle sert à afficher le lien dans la bio du bot et dans /help
  app.use((req, res, next) => {
    if (!store.settings.get('public_url')) {
      const host = (req.headers['x-forwarded-host'] || req.get('host') || '');
      const proto = String(req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim();
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        store.settings.set('public_url', `${proto}://${host}`);
      }
    }
    next();
  });

  // API
  app.use('/api', routes);

  // 📄 Page publique d'une transcription de ticket (lien envoyé en MP)
  app.get('/transcript/:token', (req, res) => {
    const t = store.transcripts.get(req.params.token);
    if (!t) return res.status(404).send('<h2 style="font-family:sans-serif;color:#ed4245">Transcription introuvable ou expirée.</h2>');
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const lines = String(t.messages || '').split('\n').map((l) => `<div style="padding:6px 10px;border-bottom:1px solid #222;font-size:13px;white-space:pre-wrap">${esc(l)}</div>`).join('');
    res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Transcription — ${esc(t.channel_name)}</title></head>
<body style="margin:0;background:#0d0d14;color:#e8e8f0;font-family:system-ui,Segoe UI,sans-serif">
<div style="max-width:760px;margin:0 auto;padding:26px 18px 60px">
  <div style="background:linear-gradient(135deg,#5865F2,#8B5CF6);border-radius:14px;padding:20px 22px;margin-bottom:18px">
    <div style="font-size:20px;font-weight:800">🎫 Transcription de ticket</div>
    <div style="opacity:.9;font-size:13px;margin-top:5px">Serveur : <b>${esc(t.server_name)}</b>${t.type_label ? ' · Type : <b>' + esc(t.type_label) + '</b>' : ''} · Salon : <b>#${esc(t.channel_name)}</b></div>
    <div style="opacity:.75;font-size:12px;margin-top:5px">Fermé le ${esc(String(t.created_at).replace('T', ' ').slice(0, 16))} (UTC) · Propulsé par BotDev</div>
  </div>
  <div style="background:#131320;border:1px solid #2a2a40;border-radius:14px;overflow:hidden">${lines}</div>
</div></body></html>`);
  });

  // 🖼️ Images des identités de bot (avatars/bannières par serveur)
  app.get('/assets/:key', async (req, res) => {
    try {
      const assets = require('./assets');
      const got = await assets.get(req.params.key);
      if (!got) return res.status(404).end();
      res.setHeader('Content-Type', got.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(got.buffer);
    } catch {
      res.status(404).end();
    }
  });

  // Fichiers statiques (dashboard)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Fallback SPA
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

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

  // Nettoyage périodique des sessions expirées
  setInterval(() => store.sessions.cleanup(), 3600000);

  // 💾 Sauvegarde automatique toutes les 10 minutes
  setInterval(async () => {
    try { await backup.upload(store.db); }
    catch (e) { console.error('[BotDev] Sauvegarde :', e.message); }
  }, 10 * 60000);

  // Chien de garde : redémarre automatiquement un bot qui se déconnecte
  const retryTracker = new Map();
  setInterval(() => {
    const bots = store.db.prepare('SELECT id FROM bots WHERE enabled = 1').all();
    for (const { id } of bots) {
      if (botManager.isOnline(id)) { retryTracker.delete(id); continue; }
      const last = retryTracker.get(id) || 0;
      if (Date.now() - last < 5 * 60000) continue;
      retryTracker.set(id, Date.now());
      botManager.loginBot(id).then(() => console.log(`[watchdog] bot ${id} reconnecté`)).catch(() => {});
    }
  }, 30000);

  // ⏰ Balayage 30 s : giveaways échus + rôles temporaires expirés
  setInterval(async () => {
    for (const [botId, entry] of botManager.clients) {
      if (!entry.client.isReady()) continue;
      try { await require('./discord/tasks').sweep(botId, entry); } catch (e) { console.error('[BotDev] sweep:', e.message); }
    }
  }, 30000);

  // Réparation automatique : toutes les 10 minutes, on re-synchronise les
  // commandes slash sur tous les serveurs des bots en ligne (au cas où un
  // serveur a été ajouté pendant une coupure) et on met la bio à jour.
  setInterval(async () => {
    for (const [botId, entry] of botManager.clients) {
      if (!entry.client.isReady()) continue;
      for (const guild of entry.client.guilds.cache.values()) {
        try { await botManager.syncSlashCommands(botId, guild.id, true); } catch {}
      }
      try { await botManager.applyBotAbout(botId, entry); } catch {}
    }
  }, 10 * 60000);

  // Arrêt propre : sauvegarde finale + déconnexion des bots
  async function shutdown() {
    try { await backup.upload(store.db); }
    catch (e) { console.error('[BotDev] Sauvegarde finale :', e.message); }
    try { await botManager.stopAll(); } catch {}
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}

main().catch((e) => {
  console.error('[BotDev] Démarrage impossible :', e.message);
  process.exit(1);
});
