// v260 — Annonce automatique de FIN de live.
//
// Demande du maître : quand un compte suivi lance un live, le bot l'annonce
// déjà ; quand le live se TERMINE, rien ne partait. Désormais la fin est
// annoncée dans le même salon : panneau V2 « ⏹️ … a terminé son live sur … »
// avec la durée, SANS ping (on ne dérange pas tout le serveur pour une fin).
//
// Règles produit vérifiées ici :
//   • un seul contrôle hors ligne ne suffit toujours pas (anti faux négatif) :
//     c'est la SORTIE CONFIRMÉE (2 contrôles) qui déclenche l'annonce de fin ;
//   • l'annonce de fin ne part qu'UNE fois par session (statut repassé à off) ;
//   • un redémarrage après la fin est de nouveau annoncé (départ + fin) ;
//   • la durée est calculée depuis l'annonce de départ ;
//   • les textes du dashboard mentionnent la fin automatique.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v260test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const v2 = require('./helpers/v2');
const store = require('../server/db');
const live = require('../server/discord/liveWatch');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

(async () => {
  console.log('— 1. Décision de transition : la fin confirmée devient « ended » —');
  const oneOff = live.liveTransition(
    { last_status: 'live', live_key: 'room:a', last_announce_ts: 1000, offline_streak: 0 },
    { live: false }, 4000,
  );
  check('un seul hors ligne : aucune annonce, session conservée',
    oneOff.action === 'none' && oneOff.status === 'live' && oneOff.offlineStreak === 1);
  const confirmed = live.liveTransition(
    { last_status: 'live', live_key: 'room:a', last_announce_ts: 1000, offline_streak: 1 },
    { live: false }, 5000,
  );
  check('deuxième hors ligne : action « ended », statut « off »',
    confirmed.action === 'ended' && confirmed.status === 'off');
  const afterEnd = live.liveTransition(
    { last_status: 'off', live_key: '', last_announce_ts: 1000, offline_streak: 0 },
    { live: false }, 6000,
  );
  check('déjà hors ligne : plus aucune annonce de fin (une seule par session)',
    afterEnd.action === 'none');
  const restart = live.liveTransition(
    { last_status: 'off', live_key: '', last_announce_ts: 1000, offline_streak: 0 },
    { live: true, liveKey: 'room:b' }, 7000,
  );
  check('redémarrage après la fin : nouvelle annonce de départ',
    restart.action === 'announce');

  console.log('— 2. Format de la durée —');
  check('moins d’une minute : pas de durée affichée', live.formatDuration(45000) === '');
  check('45 minutes', live.formatDuration(45 * 60000) === '45 min');
  check('2 h 30', live.formatDuration(150 * 60000) === '2 h 30');
  check('3 h pile', live.formatDuration(180 * 60000) === '3 h');

  console.log('— 3. Cycle complet simulé : départ, fin, départ, fin —');
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const guildId = 'g-v260';
  store.guildSettings.set(botId, guildId, { live_channel: '#annonces-live', live_ping: 'everyone' });
  store.liveSocials.add(botId, guildId, '', 'tiktok', 'streamer');
  const sent = [];
  const channel = {
    id: 'c-live', name: 'annonces-live', type: 0, isTextBased: () => true,
    send: async (payload) => { sent.push(payload); return { id: String(sent.length) }; },
  };
  const guild = { id: guildId, name: 'Serveur test', channels: { cache: new Map([[channel.id, channel]]) } };
  const botManager = { clients: new Map([[botId, { client: { isReady: () => true, guilds: { cache: new Map([[guildId, guild]]) } } }]]) };
  const originalChecker = live.CHECKERS.tiktok;
  const observations = [
    { live: true, name: 'Streamer', avatar: '', liveKey: 'room:a' },
    { live: false, name: 'Streamer', avatar: '', liveKey: '' },
    { live: false, name: 'Streamer', avatar: '', liveKey: '' },
    { live: true, name: 'Streamer', avatar: '', liveKey: 'room:b' },
    { live: false, name: 'Streamer', avatar: '', liveKey: '' },
    { live: false, name: 'Streamer', avatar: '', liveKey: '' },
  ];
  live.CHECKERS.tiktok = async () => observations.shift();
  try {
    await live.sweep(botManager);
    // On vieillit l'annonce de départ de 2 h 30 pour vérifier la durée.
    const rowId = store.liveSocials.all(botId, guildId)[0].id;
    const st = store.liveSocials.all(botId, guildId)[0];
    store.liveSocials.saveState(botId, guildId, rowId, {
      status: 'live', liveKey: st.live_key, offlineStreak: 0,
      announceTs: Date.now() - 150 * 60000, lastCheckedAt: Date.now(), lastError: '',
    });
    for (let i = 0; i < 5; i += 1) await live.sweep(botManager);
  } finally {
    live.CHECKERS.tiktok = originalChecker;
  }

  check('quatre messages au total : départ, fin, départ, fin', sent.length === 4, String(sent.length));
  check('le 2e message est l’annonce de fin, en Components V2',
    !!sent[1] && v2.isV2(sent[1]) && JSON.stringify(sent[1]).includes('a terminé son live sur TikTok'));
  check('…avec la durée du live (2 h 30)', JSON.stringify(sent[1]).includes('2 h 30'));
  check('…SANS ping : allowedMentions vide même si live_ping = everyone',
    !!sent[1] && Array.isArray(sent[1].allowedMentions && sent[1].allowedMentions.parse) && sent[1].allowedMentions.parse.length === 0);
  check('…bouton « Voir la chaîne » dans le conteneur',
    !!sent[1] && v2.rows(sent[1]).length === 1 && JSON.stringify(sent[1]).includes('Voir la chaîne'));
  check('le 1er message (départ) garde son ping everyone',
    !!sent[0] && sent[0].allowedMentions.parse.includes('everyone'));
  const row = store.liveSocials.all(botId, guildId)[0];
  check('état final en base : hors ligne, compteur remis à zéro',
    row.last_status === 'off' && Number(row.offline_streak) === 0);

  console.log('— 4. Textes du dashboard —');
  const dash = fs.readFileSync(require('path').join(__dirname, '..', 'public/js/dashboard.js'), 'utf8');
  check('la carte Communauté & Lives annonce la fin automatique',
    dash.includes('annonce aussi la fin du live'));

  console.log('— 5. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=285 référencé 7 fois', (index.match(/\?v=285/g) || []).length === 7,
    String((index.match(/\?v=285/g) || []).length));
  check('sw.js : cache « botdev-v285 »', sw.includes("const CACHE = 'botdev-v285';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v260 — ${ok} vérifications OK : la fin du live est annoncée automatiquement.`);
  else { console.log(`❌ v260 — ${ko} échec(s)`); process.exitCode = 1; }
})();
