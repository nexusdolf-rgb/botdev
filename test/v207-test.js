// Test v207 — Pastilles de secours jamais invisibles + photo du bot vivante
// --------------------------------------------------------------
// 1. app.js : une image en échec SANS taille connue (conteneur masqué,
//    layout pas prêt) n'est JAMAIS figée en pastille de 1 px invisible —
//    elle attend (rAF, puis IntersectionObserver) d'avoir sa vraie taille.
// 2. Le serveur renvoie la photo de profil VIVANTE du bot
//    (client.user.displayAvatarURL) plutôt qu'une URL stockée périmée.
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const appSource = fs.readFileSync('public/js/app.js', 'utf8');
const routesSource = fs.readFileSync('server/routes.js', 'utf8');
const managerSource = fs.readFileSync('server/discord/botManager.js', 'utf8');

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, `❌ ${label}`);
  console.log(`  ✅ ${label}`);
};

console.log('▶ v207-test.js');

// ---------- 1. Filet robuste (app.js) ----------
console.log('— Pastilles jamais invisibles —');
check('mesure de taille dédiée (App.imgSizeOf)', appSource.includes('App.imgSizeOf ='));
check('nouvelle tentative au frame suivant', appSource.includes('requestAnimationFrame(() => App.imgFailed(img))'));
check('attente de visibilité (IntersectionObserver)', appSource.includes('IntersectionObserver'));
check('garde __fbObserveWhenVisible', appSource.includes('function __fbObserveWhenVisible'));
check('pastille garde la classe de l’image', appSource.includes("img.className ? ' ' + String(img.className)"));
check('contexte .dash-bot-chip pour la lettre', appSource.includes('.dash-bot-chip'));

// ---------- 2. Photo du bot vivante (serveur) ----------
console.log('— Photo de profil vivante du bot —');
check('routes.js : botDetail lit displayAvatarURL du client', routesSource.includes("cu.displayAvatarURL({ size: 256, format: 'png' })"));
check('routes.js : avatar_url = vivant en priorité', routesSource.includes('avatar_url: liveAvatar || safeBot.avatar_url ||'));
check('botManager : publicBotInfo lit l’avatar vivant', managerSource.includes('liveAvatar || record.avatar_url ||'));
check('le token Discord n’est toujours pas exposé', routesSource.includes('const { token, ...safeBot }'));

// ---------- 3. Comportement jsdom ----------
console.log('— Comportement —');
const dom = new JSDOM('<!doctype html><html><body><div id="t"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const w = dom.window;
global.window = w;
global.document = w.document;
global.navigator = w.navigator;
w.eval(appSource + '\nwindow.App=App;');
const { App } = w;

// a) image dimensionnée (style CSS) → remplacée immédiatement, taille gardée
const imgA = w.document.createElement('img');
imgA.src = 'https://cdn.discordapp.com/avatars/1/x.png';
imgA.dataset.fbText = 'Optimus Prime';
imgA.style.width = '38px';
imgA.style.height = '38px';
w.document.getElementById('t').appendChild(imgA);
App.imgFailed(imgA);
const fbA = w.document.querySelector('#t .img-fb');
check('dimensionnée → pastille immédiate', !!fbA && !imgA.isConnected);
check('lettre « O » (data-fb-text)', fbA && fbA.textContent === 'O');
check('taille 38px conservée', fbA && fbA.style.width === '38px');

// b) sans taille → pas de pastille invisible, img toujours en place
const imgB = w.document.createElement('img');
imgB.src = 'https://cdn.discordapp.com/avatars/2/y.png';
w.document.getElementById('t').appendChild(imgB);
App.imgFailed(imgB);
check('sans taille → pas de remplacement aveugle', !imgB.dataset.fbSafe && imgB.isConnected);

console.log(`\n✅ v207-test.js : ${n} vérifications OK`);
process.exit(0);
