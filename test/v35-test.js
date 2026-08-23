// ============================================================
// Test Hoxera v35 — Bio du bot (« À propos de moi »)
//  1. La bio tient dans la limite Discord (190 caractères)
//  2. Elle contient le lien du dashboard + /help + le nom Hoxera
//  3. Le lien par défaut est utilisé si aucun n'est configuré
// ============================================================
const { aboutText } = require('../server/discord/botManager');

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

const bio = aboutText();
console.log('── Bio générée ──');
console.log(bio);
console.log('─────────────────');

check('bio : 190 caractères max (Discord)', bio.length <= 190);
check('bio : contient le NOUVEAU lien du dashboard', bio.includes('https://hoxera.onrender.com'));
check('bio : invite à taper /help', bio.includes('/help'));
check('bio : nom du bot Hoxera', bio.includes('Hoxera'));
check('bio : modules principaux listés', bio.includes('Tickets') && bio.includes('XP') && bio.includes('Coins') && bio.includes('Giveaways') && bio.includes('Jeux'));
check('bio : emojis présents', /[\u{1F300}-\u{1FAFF}]/u.test(bio));
check('bio : aucun ANCIEN lien possible', !bio.includes('botdev-kqbd') && !bio.includes('BotDev'));
check('bio : 4 lignes', bio.split('\n').length === 4);

console.log(failures === 0 ? '\n✅ V35 — Bio du bot prête (belle, lien + /help, dans la limite). 🎉' : `\n❌ ${failures} vérification(s) en échec`);
process.exit(failures === 0 ? 0 : 1);
