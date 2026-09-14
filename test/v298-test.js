// v298 — 🎨 Décorations d'avatar Discord dans le dashboard.
// Vérifié : colonne users.discord_deco (asset) + stockage à la connexion et au
// refresh OAuth, champ `deco` envoyé par les API membres / top actifs,
// superposition de la décoration sur l'avatar (decoWrap) aux 5 endroits où des
// avatars de membres/utilisateurs s'affichent, proxy /api/img compatible avec
// le CDN des décorations, CSS de superposition (125 %), bump v298.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v298');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const imgproxy = require('../server/imgproxy');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  console.log('— 1. Base de données : users.discord_deco —');
  const uid = store.users.create('deco@test.dev', 'hash', {
    discord_id: '123', discord_username: 'Fondateur', discord_avatar: 'abc', discord_deco: 'asset_anneau',
  });
  const u = store.users.findById(uid);
  check('discord_deco enregistré à la création', u && u.discord_deco === 'asset_anneau');
  store.users.updateDiscord(uid, { discord_deco: 'asset_cadre' });
  check('discord_deco mis à jour (allowlist)', store.users.findById(uid).discord_deco === 'asset_cadre');
  store.users.updateDiscord(uid, { discord_username: 'Autre' });
  check('discord_deco préservé si non renvoyé', store.users.findById(uid).discord_deco === 'asset_cadre');
  check('findById renvoie discord_deco (donc /auth/me aussi)', racine('server/db.js').includes('discord_avatar, discord_deco, created_at'));

  console.log('— 2. OAuth : l asset de décoration est capté —');
  const routes = racine('server/routes.js');
  check('connexion Discord stocke avatar_decoration_data.asset (création + update + refresh)',
    (routes.match(/discord_deco: \(me\.avatar_decoration_data && me\.avatar_decoration_data\.asset\) \|\| ''/g) || []).length === 3,
    String((routes.match(/discord_deco: \(me\.avatar_decoration_data/g) || []).length));

  console.log('— 3. API membres + top actifs : champ deco —');
  check('helper avatarDecoUrl (garde-fou try/catch + null si aucune déco)', routes.includes('function avatarDecoUrl(memberOrUser)') && routes.includes("if (!u || typeof u.avatarDecorationURL !== 'function') return '';"));
  check('liste des membres : deco envoyée', routes.includes('deco: avatarDecoUrl(m),'));
  check('top actifs : deco envoyée (en ligne + hors ligne)', routes.includes("deco: avatarDecoUrl(m) };") && routes.includes("tag: t.user_id, avatar: '', deco: ''"));
  check('décoration servie via le proxy /api/img comme les avatars', routes.includes("imgproxy.imgProxy(u.avatarDecorationURL({ size: 160 }) || '')"));

  console.log('— 4. Proxy : le CDN des décorations est autorisé —');
  check('avatar-decoration-presets sur cdn.discordapp.com = accepté',
    imgproxy.isDiscordImageUrl('https://cdn.discordapp.com/avatar-decoration-presets/asset_test.png?size=160'));
  check('imgProxy transforme l URL de décoration en /api/img',
    imgproxy.imgProxy('https://cdn.discordapp.com/avatar-decoration-presets/a.png').startsWith('/api/img?u='));

  console.log('— 5. Dashboard : superposition comme sur Discord —');
  const dash = racine('public/js/dashboard.js');
  check('helpers decoWrap + userDecoUrl définis', dash.includes('Dashboard.decoWrap = (avatarHtml, deco)') && dash.includes('Dashboard.userDecoUrl = (asset)'));
  check('decoWrap : pas de décoration = rendu inchangé', dash.includes(': avatarHtml);'));
  check('userDecoUrl reconstruit l URL CDN via /api/img', dash.includes('https://cdn.discordapp.com/avatar-decoration-presets/') && dash.includes("String(asset).slice(0, 100)"));
  const usages = (dash.match(/Dashboard\.decoWrap\(/g) || []).length;
  check('decoWrap utilisé aux 5 endroits (compte, mobile, membres, top actifs, invitations)', usages === 5, String(usages));
  check('compte dashboard : deco depuis discord_deco', dash.includes('Dashboard.userDecoUrl(acct.discord_deco)'));
  check('mobile : deco depuis discord_deco', dash.includes('Dashboard.userDecoUrl(mobileUser.discord_deco)'));
  check('membres + top actifs + invitations : deco depuis l API', dash.includes('m.deco)}') && dash.includes('t.deco)}'));

  console.log('— 6. CSS : image superposée centrée —');
  const css = racine('public/css/dashboard.css');
  check('.deco-wrap relatif + .deco-img absolue centrée 125 %', css.includes('.deco-wrap { position: relative;') && css.includes('.deco-wrap img.deco-img') && css.includes('width: 125%; height: 125%;') && css.includes('transform: translate(-50%, -50%)'));
  check('décoration non cliquable au-dessus de l avatar', css.includes('pointer-events: none; z-index: 2;'));

  console.log('— 7. Bump v298 —');
  const index = racine('public/index.html');
  check('index.html : ?v=301 référencé 7 fois', (index.match(/\?v=301/g) || []).length === 7, String((index.match(/\?v=301/g) || []).length));
  check('sw.js : cache « botdev-v301 »', racine('public/sw.js').includes("const CACHE = 'botdev-v301';"));

  console.log(`\n🎉 v298 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
