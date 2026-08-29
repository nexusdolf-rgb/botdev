// ============================================================
// BotDev - Serveur principal
// ============================================================
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const backup = require('./backup');
const security = require('./security');
// 🛡️ Filets de sécurité : le processus ne meurt JAMAIS d'une erreur isolée
require('./safety').install();

const PORT = process.env.PORT || 3000;

async function main() {
  // 1) Restauration des données (sauvegarde GitHub) AVANT d'ouvrir la base
  let restoreStatus = 'inconnu';
  try {
    await backup.restore();
    restoreStatus = backup.getLastRestoreInfo() || 'inconnu';
  } catch (e) {
    restoreStatus = 'erreur:' + String(e.message || e).slice(0, 60);
  }

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
  store.settings.set('boot_restore', restoreStatus);

  // 🧪 Contrôle d'intégrité de la base au démarrage : si la base est
  // corrompue, on le sait tout de suite (au lieu de découvertes en cascade).
  try {
    const check = store.db.prepare('PRAGMA quick_check').get();
    console.log(`[BotDev] 🧪 Intégrité base : ${check && check.quick_check === 'ok' ? 'OK ✅' : String(check && check.quick_check)}`);
  } catch (e) { console.error('[BotDev] 🧪 Contrôle intégrité impossible :', e.message); }

  // 🧹 Maintenance automatique : nettoyage des anciennes données au
  // démarrage puis toutes les 24 h (la base reste légère pour toujours).
  try {
    const maintenance = require('./maintenance');
    maintenance.runDaily(store.db);
    setInterval(() => {
      try { maintenance.runDaily(store.db); } catch (e) { console.error('[Hoxera] maintenance :', e.message); }
    }, 24 * 3600000);
  } catch (e) { console.error('[Hoxera] maintenance indisponible :', e.message); }

  // 🆕 L'URL officielle du dashboard : remplace un éventuel ancien lien
  // mémorisé dans la base restaurée (transcriptions, /help, pieds de page…)
  const officialUrl = 'https://hoxera.is-a.dev';
  const storedUrl = store.settings.get('public_url');
  const oldOfficialUrls = ['https://hoxera.onrender.com', 'https://botdev-kqbd.onrender.com'];
  if (!storedUrl || oldOfficialUrls.some((old) => storedUrl.startsWith(old))) {
    store.settings.set('public_url', officialUrl);
    if (storedUrl) console.log(`[BotDev] 🔗 Lien du dashboard mis à jour : ${storedUrl} → ${officialUrl}`);
  }

  // 🤖 Hoxera doit TOUJOURS être en ligne : on force le drapeau « activé »
  // à chaque démarrage (une déconnexion passagère pouvait le mettre à 0
  // dans la sauvegarde et empêcher toute reconnexion future).
  try { store.db.prepare('UPDATE bots SET enabled = 1').run(); } catch {}

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(security.securityHeaders);
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

  // API : contrôle d'origine avant toutes les routes et permissions métier.
  app.use('/api', security.originGuard, routes);

  // 🏓 Endpoint ultra-léger pour le garde-éveil (aucune base, aucun calcul)
  app.get('/ping', (req, res) => res.type('text').send('pong'));

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

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Hoxera démarré sur http://0.0.0.0:${PORT}`);
    await provisionHoxera();
    startupBots();
  });

  // ⚡ Hoxera (bot unique) : créé automatiquement depuis les variables
  // d'environnement — plus besoin de « créer un bot » depuis le dashboard.
  // HOXERA_TOKEN est le nom recommandé ; les anciens noms restent acceptés
  // (NOXERA_TOKEN, NEXORA_TOKEN) pour ne jamais casser l'existant.
  async function provisionHoxera() {
    const token = process.env.HOXERA_TOKEN || process.env.NOXERA_TOKEN || process.env.NEXORA_TOKEN;
    if (!token) {
      console.log('[BotDev] ⚠️ HOXERA_TOKEN absent — Hoxera n\'est pas branché (ajoute la variable sur Render).');
      return null;
    }
    const clientId = process.env.HOXERA_CLIENT_ID || process.env.NOXERA_CLIENT_ID || process.env.NEXORA_CLIENT_ID || process.env.DISCORD_CLIENT_ID || '';
    let bot = store.db.prepare('SELECT * FROM bots ORDER BY id LIMIT 1').get();
    if (bot) {
      // v174 : le nom du bot vit dans la base (renommable depuis le dashboard).
      // Au démarrage on ne resynchronise que les identifiants techniques.
      store.bots.update(bot.id, { token, client_id: clientId || bot.client_id });
      bot = store.bots.get(bot.id);
    } else {
      const id = store.bots.create({ user_id: 1, name: 'Optimus Prime', token, client_id: clientId, prefix: '!' });
      bot = store.bots.get(id);
    }
    console.log(`⚡ Hoxera provisionné (id ${bot.id}, client_id ${clientId || '?'})`);
    try {
      await botManager.loginBot(bot.id);
      console.log('⚡ Hoxera connecté à Discord 🟢');
    } catch (e) {
      console.log(`⚠️  Hoxera provisionné mais connexion impossible : ${e.message}`);
    }
    return bot;
  }

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

  // 🌙 Garde-éveil (plan gratuit Render) : sans requête entrante pendant
  // ~15 min, Render endort le service → le bot disparaît de Discord et
  // chaque réveil coûte un redémarrage complet + une reconnexion passerelle
  // (risque de refroidissement). On s'auto-visite toutes les 10 min via
  // l'URL publique : la requête traverse l'équilibreur de Render et compte
  // comme du vrai trafic entrant.
  // URL canonique (le domaine Render reste accessible comme secours).
  const selfUrl = officialUrl;
  if (selfUrl) {
    console.log(`[BotDev] 🌙 Garde-éveil activé : auto-visite de ${selfUrl}/ping toutes les 10 min`);
    setInterval(() => { fetch(`${selfUrl}/ping`).catch(() => {}); }, 10 * 60000);
  }

  // 💾 Sauvegarde automatique toutes les 10 minutes
  setInterval(async () => {
    try {
      const saved = await backup.upload(store.db);
      if (saved) store.settings.set('last_backup', new Date().toISOString());
      else console.warn('[BotDev] ⚠️ Sauvegarde non effectuée : la dernière sauvegarde valide est conservée.');
    }
    catch (e) { console.error('[BotDev] Sauvegarde :', e.message); }
  }, 10 * 60000);

  // Chien de garde renforcé : le bot ne reste JAMAIS hors ligne.
  // - toute connexion morte (pas prête depuis 10 min) est détruite
  // - reconnexion avec recul progressif (voir ci-dessous)
  // - TOUS les bots sont surveillés (même si un drapeau interne dit « éteint »)
  // Chien de garde renforcé : le bot ne reste JAMAIS hors ligne.
  // - toute connexion morte (pas prête depuis 10 min) est détruite
  // - reconnexion avec RECUL PROGRESSIF : 1 min, puis 2, 4, 8, 10 min max
  //   (réinitialisé dès qu'une connexion réussit). Sans ce recul : tempête
  //   de reconnexions → Discord/Cloudflare met l'IP en refroidissement et
  //   toutes les connexions restent suspendues.
  // - TOUS les bots sont surveillés (même si un drapeau interne dit « éteint »)
  const retryTracker = new Map(); // id -> { last, fails }
  setInterval(() => {
    const bots = store.db.prepare('SELECT id FROM bots').all();
    for (const { id } of bots) {
      const entry = botManager.clients.get(id);
      const stuck = entry && !entry.client.isReady() && Date.now() - (entry.startedAt || Date.now()) > 10 * 60000;
      if (stuck) {
        console.log(`[watchdog] bot ${id} bloqué — reconnexion forcée`);
        try { entry.client.destroy(); } catch {}
        botManager.clients.delete(id);
      }
      if (botManager.isOnline(id)) { retryTracker.delete(id); continue; }
      // 🕊️ Une tentative de connexion FRAÎCHE est en cours (moins de 6 min) :
      // on la laisse aboutir au lieu de la détruire — le timeout patient de
      // 5 min du login la fera échouer proprement si besoin.
      const inflight = botManager.clients.get(id);
      if (inflight && !inflight.client.isReady() && Date.now() - (inflight.startedAt || 0) < 360000) continue;
      const t = retryTracker.get(id) || { last: 0, fails: 0 };
      const delay = Math.min(60000 * Math.pow(2, t.fails), 10 * 60000);
      if (Date.now() - t.last < delay) continue;
      t.last = Date.now();
      retryTracker.set(id, t);
      botManager.reconnectBot(id)
        .then(() => { retryTracker.delete(id); console.log(`[watchdog] bot ${id} reconnecté`); })
        .catch((e) => {
          t.fails = Math.min(t.fails + 1, 4);
          const next = Math.round(Math.min(60000 * Math.pow(2, t.fails), 600000) / 60000);
          console.log(`[watchdog] bot ${id} (échec n°${t.fails}, prochain essai dans ~${next} min) : ${e.message}`);
        });
    }
  }, 30000);

  // 🔴 Annonces de live : balayage toutes les 60 secondes (TikTok,
  // Twitch, YouTube, Kick). Le premier contrôle part aussi peu après le
  // démarrage : un live déjà en cours n'attend pas trois minutes.
  const runLiveSweep = () => {
    try {
      const liveWatch = require('./discord/liveWatch');
      liveWatch.sweep(botManager).catch((e) => console.error('[Hoxera] live sweep :', e.message));
    } catch (e) { console.error('[Hoxera] liveWatch indisponible :', e.message); }
  };
  setTimeout(runLiveSweep, 10000);
  setInterval(runLiveSweep, 60000);

  // ⏰ Balayage 30 s : giveaways échus + rôles temporaires expirés
  setInterval(async () => {
    for (const [botId, entry] of botManager.clients) {
      if (!entry.client.isReady()) continue;
      try { await require('./discord/tasks').sweep(botId, entry); } catch (e) { console.error('[BotDev] sweep:', e.message); }
    }
  }, 30000);

  // Réparation automatique : toutes les 10 minutes, on re-synchronise les
  // commandes slash (par serveur + le lot global du badge /) et la bio.
  setInterval(async () => {
    for (const [botId, entry] of botManager.clients) {
      if (!entry.client.isReady()) continue;
      for (const guild of entry.client.guilds.cache.values()) {
        try { await botManager.syncSlashCommands(botId, guild.id, true); } catch {}
      }
      try { await botManager.syncGlobalCommands(botId); } catch {}
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
