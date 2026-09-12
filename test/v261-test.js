// v261 — Annonce de live allégée (demande du maître, vue sur Discord mobile) :
//   • pied « {serveur} · Annonces de live » RETIRÉ ;
//   • émoji de plateforme (🎵 TikTok etc.) RETIRÉ du titre et du champ Pseudo ;
//   • texte « … est en live sur TikTok » CONSERVÉ mais en titre « ### » plus
//     petit (le « ## » était trop gros sur mobile) ;
//   • photo de profil en meilleure résolution (avatarLarger d'abord, Twitch
//     en 300 px) : Discord fixe la taille de la vignette, on maximise la netteté.
// L'annonce de FIN de live (v260) reçoit exactement le même traitement.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v261test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const v2 = require('./helpers/v2');
const ui = require('../server/discord/ui');
const store = require('../server/db');
const live = require('../server/discord/liveWatch');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

(async () => {
  console.log('— 1. titleLevel : 3 rend un titre plus petit —');
  const petit = ui.v2panel({ title: 'Petit titre', titleLevel: 3 });
  const grand = ui.v2panel({ title: 'Grand titre' });
  const brutPetit = JSON.stringify(v2.json ? v2.json(petit) : petit);
  const brutGrand = JSON.stringify(v2.json ? v2.json(grand) : grand);
  check('avec titleLevel: 3 → « ### Petit titre »', brutPetit.includes('### Petit titre'));
  check('sans titleLevel → « ## Grand titre » inchangé (les ~70 autres panneaux)',
    brutGrand.includes('## Grand titre') && !brutGrand.includes('### Grand titre'));
  check('le helper de test lit les deux niveaux', v2.title(petit) === 'Petit titre' && v2.title(grand) === 'Grand titre');

  console.log('— 2. Annonce de DÉPART : envoyée pour de vrai dans un faux salon —');
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const guildId = 'g-v261';
  const sent = [];
  const channel = {
    id: 'c1', name: 'annonces-live', type: 0, isTextBased: () => true,
    send: async (payload) => { sent.push(payload); return { id: '1' }; },
  };
  const guild = { id: guildId, name: 'Communauté-CODM', channels: { cache: new Map([[channel.id, channel]]) } };
  const social = { platform: 'tiktok', handle: 'chronique.sn7k', user_id: '42' };
  const result = { name: 'Chronique', avatar: 'https://exemple/avatar.png', liveKey: 'room:a' };
  await live.announce(botId, guild, channel, social, result, { live_ping: 'here' });
  const dep = sent[0];
  const brutDep = JSON.stringify(dep);
  check('titre conservé mais sans l’émoji 🎵 : « 🔴 Chronique est en live sur TikTok »',
    v2.title(dep) === '🔴 Chronique est en live sur TikTok', v2.title(dep));
  check('…rendu en « ### » (plus petit sur mobile)', brutDep.includes('### 🔴 Chronique'));
  check('plus aucun pied « Communauté-CODM · Annonces de live »',
    !brutDep.includes('Annonces de live') && !brutDep.includes('Communauté-CODM'));
  check('émoji musical absent de tout le panneau (titre ET champ Pseudo)',
    !brutDep.includes('🎵') && brutDep.includes('**Pseudo**'));
  check('photo de profil toujours là (vignette de la section)', brutDep.includes('https://exemple/avatar.png'));
  check('ping @here du départ toujours honoré',
    brutDep.includes('@here') && dep.allowedMentions.parse.includes('everyone'));
  check('bouton « Regarder le live » intact', brutDep.includes('Regarder le live'));

  console.log('— 3. Annonce de FIN : même traitement —');
  await live.announceEnd(botId, guild, channel, social, result, { live_ping: 'here' }, Date.now() - 95 * 60000, Date.now());
  const fin = sent[1];
  const brutFin = JSON.stringify(fin);
  check('titre « ⏹️ … a terminé son live sur TikTok » en « ### »',
    v2.title(fin) === '⏹️ Chronique a terminé son live sur TikTok' && brutFin.includes('### ⏹️'));
  check('plus de pied ni d’émoji 🎵', !brutFin.includes('Annonces de live') && !brutFin.includes('🎵'));
  check('durée toujours affichée (1 h 35)', brutFin.includes('1 h 35'));
  check('fin toujours SANS ping', fin.allowedMentions.parse.length === 0);

  console.log('— 4. Résolution des photos —');
  const parsed = live.parseTikTokResponse({ data: {
    user: { status: 2, nickname: 'X', avatarThumb: 'petite', avatarMedium: 'moyenne', avatarLarger: 'grande' },
    liveRoom: { status: 2 },
  } }, 'x');
  check('TikTok : la plus grande résolution d’abord', parsed.avatar === 'grande', parsed.avatar);
  check('Twitch : avatar demandé en 300 px',
    fs.readFileSync(require('path').join(__dirname, '..', 'server/discord/liveWatch.js'), 'utf8')
      .includes('profileImageURL(width: 300)'));

  console.log('— 5. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=277 référencé 7 fois', (index.match(/\?v=277/g) || []).length === 7,
    String((index.match(/\?v=277/g) || []).length));
  check('sw.js : cache « botdev-v277 »', sw.includes("const CACHE = 'botdev-v277';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v261 — ${ok} vérifications OK : annonce de live allégée, titre plus petit, photo plus nette.`);
  else { console.log(`❌ v261 — ${ko} échec(s)`); process.exitCode = 1; }
})();
