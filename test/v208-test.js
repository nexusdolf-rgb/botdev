// Test v208 — Photos réelles via proxy serveur + nom du bot partout
// --------------------------------------------------------------
// 1. Les images Discord (avatar du bot, icônes de serveurs, avatars de
//    membres, photo du compte lié) sont servies par NOTRE domaine
//    (/api/img?u=…) : le navigateur du client n'appelle plus jamais
//    cdn.discordapp.com directement (réseaux mobiles, bloqueurs…).
// 2. Allowlist stricte → aucune ouverture (pas de SSRF).
// 3. Le navbar affiche le NOM réel du bot (« Optimus Prime »), plus jamais
//    le nom générique « Hoxera » une fois le bot chargé.
const assert = require('assert');
const fs = require('fs');

const proxySource = fs.readFileSync('server/imgproxy.js', 'utf8');
const routesSource = fs.readFileSync('server/routes.js', 'utf8');
const managerSource = fs.readFileSync('server/discord/botManager.js', 'utf8');
const appSource = fs.readFileSync('public/js/app.js', 'utf8');
const dashSource = fs.readFileSync('public/js/dashboard.js', 'utf8');

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, `❌ ${label}`);
  console.log(`  ✅ ${label}`);
};

console.log('▶ v208-test.js');

// ---------- 1. Module proxy ----------
console.log('— Proxy d’images (imgproxy.js) —');
const imgproxy = require('../server/imgproxy');
check('transforme une URL CDN en /api/img', imgproxy.imgProxy('https://cdn.discordapp.com/avatars/1/x.png?size=64') === '/api/img?u=' + encodeURIComponent('https://cdn.discordapp.com/avatars/1/x.png?size=64'));
check('laisse les autres URLs intactes', imgproxy.imgProxy('/icons/nexora-robot-mark.svg') === '/icons/nexora-robot-mark.svg');
check('refuse http (pas https)', imgproxy.isDiscordImageUrl('http://cdn.discordapp.com/x.png') === false);
check('refuse localhost / SSRF', imgproxy.isDiscordImageUrl('https://localhost/x.png') === false && imgproxy.isDiscordImageUrl('https://127.0.0.1/x.png') === false);
check('refuse un domaine tiers', imgproxy.isDiscordImageUrl('https://evil.com/x.png') === false);
check('accepte cdn.discordapp.com', imgproxy.isDiscordImageUrl('https://cdn.discordapp.com/avatars/1/x.png') === true);
check('accepte media.discordapp.net', imgproxy.isDiscordImageUrl('https://media.discordapp.net/attachments/1/2/x.png') === true);
// fetch d'une URL interdite → null (vérification réelle, attendue)
(async () => {
  const res = await imgproxy.fetchDiscordImage('https://evil.com/x.png');
  check('fetch d’une URL interdite → null', res === null);
  console.log(`\n✅ v208-test.js : ${n} vérifications OK`);
  process.exit(0);
})();

// ---------- 2. Serveur : URLs proxyées ----------
console.log('— Serveur : les URLs Discord sont proxyées —');
check('route /img déclarée', routesSource.includes("router.get('/img'"));
check('imgproxy requis par routes.js', routesSource.includes("require('./imgproxy')"));
check('botDetail : avatar proxé', routesSource.includes("avatar_url: imgproxy.imgProxy(liveAvatar || safeBot.avatar_url"));
check('botDetail : icônes de guildes proxées', routesSource.includes("icon: imgproxy.imgProxy(g.iconURL"));
check('payload serveur : icon proxé', routesSource.includes("icon: imgproxy.imgProxy(dGuild.iconURL"));
check('route /discord/guilds : icon proxé', routesSource.includes("icon: imgproxy.imgProxy(g.icon"));
check('publicBotInfo : avatar proxé', managerSource.includes("imgproxy.imgProxy(liveAvatar || record.avatar_url"));

// ---------- 3. Navbar : nom du bot + compte lié ----------
console.log('— Navbar : nom réel + photo du compte —');
check('navbar : nom du bot affiché (plus « Hoxera » en dur)', appSource.includes("(bot && bot.name) || 'Hoxera'"));
check('navbar : avatar du compte via proxy', appSource.includes('src="/api/img?u=${encodeURIComponent(`https://cdn.discordapp.com/avatars/${user.discord_id}/${user.discord_avatar}.png?size=64`)}"'));
check('lettre de secours sur l’avatar du compte', appSource.includes('data-fb-text'));
check('drawer mobile : photo du compte lié', dashSource.includes('src="/api/img?u=${encodeURIComponent(`https://cdn.discordapp.com/avatars/${mobileUser.discord_id}'));

