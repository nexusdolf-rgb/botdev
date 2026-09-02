// Test v206 — Anti-images cassées + sélecteurs sans cases vides
// --------------------------------------------------------------
// 1. app.js installe le filet global : toute <img> en échec devient une
//    pastille de secours propre (.img-fb) — jamais l'icône cassée.
// 2. Les avatars clés portent data-fb-text (bonne lettre de secours).
// 3. enhanceSelect extrait l'emoji des options en icône de pastille
//    (💬 salon, 🛡️ rôle…) → plus de case vide dans les menus déroulants.
// 4. Les options sans icône reçoivent .no-ico → texte aligné.
// 5. CSS : .img-fb, état sélectionné contrasté.
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const appSource = fs.readFileSync('public/js/app.js', 'utf8');
const dashSource = fs.readFileSync('public/js/dashboard.js', 'utf8');
const css = fs.readFileSync('public/css/dashboard.css', 'utf8');

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, `❌ ${label}`);
  console.log(`  ✅ ${label}`);
};

console.log('▶ v206-test.js');

// ---------- 1. Filet anti-images cassées (app.js) ----------
console.log('— Filet global anti-images cassées —');
check('App.imgFailed défini', appSource.includes('App.imgFailed = (img)'));
check('App.imgFallbackText défini', appSource.includes('App.imgFallbackText'));
check('écoute « error » en capture (img ne bulle pas)', appSource.includes("document.addEventListener('error',"));
check('les onerror locaux sont laissés tranquilles', appSource.includes('if (img.onerror) return;'));
check('remplacement par pastille .img-fb', appSource.includes("className = 'img-fb'"));

// ---------- 2. Avatars clés avec data-fb-text ----------
console.log('— Lettres de secours sur les avatars —');
check('carte grille serveurs (srv-card)', dashSource.includes('data-fb-text="${App.escapeHtml(g.name)}"'));
check('carte picker serveurs (sp-ico)', dashSource.includes('data-fb-text="${App.escapeHtml(g.name)}"'));
check('carte sidebar serveur', dashSource.includes('data-fb-text="${App.escapeHtml(cur.name'));
check('avatar hero serveur', dashSource.includes('data-fb-text="${App.escapeHtml(g.name'));
check('avatar bot (brand mobile)', dashSource.includes('data-fb-text="${App.escapeHtml(bot.name'));

// ---------- 3. enhanceSelect : icônes extraites des options ----------
console.log('— Icônes dans les menus déroulants —');
check('extraction emoji → icône', dashSource.includes('const em = raw.match(/^((?:\\p{Extended_Pictographic}\\uFE0F?)+)(?:\\s+|$)([\\s\\S]*)$/u);'));
check('salon sans emoji → 💬', dashSource.includes("else if (/^#/.test(raw)) icon = '💬';"));
check('pastille absente si aucune icône', dashSource.includes('icoContent ? `<span class="dd-opt-ico">'));
check('classe no-ico pour alignement', dashSource.includes("no-ico'}"));

// ---------- 4. CSS ----------
console.log('— CSS —');
check('.img-fb présent', css.includes('.img-fb {'));
check('variante arrondie .is-round', css.includes('.img-fb.is-round'));
check('contraste .dd-option.is-selected', css.includes('.dd-option.is-selected {'));
check('alignement .no-ico', css.includes('.dd-option.no-ico .dd-opt-txt'));

// ---------- 5. Comportement : App.imgFailed remplace une img cassée ----------
console.log('— Comportement du fallback (jsdom) —');
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

// image cassée ronde → pastille ronde avec la bonne lettre
const img = w.document.createElement('img');
img.src = 'https://cdn.discordapp.com/icons/1/x.png';
img.dataset.fbText = 'CODM';
img.style.width = '40px'; img.style.height = '40px';
img.classList.add('round'); // les avatars ronds portent une classe round / border-radius 50% en CSS
w.document.getElementById('t').appendChild(img);
App.imgFailed(img);
const fb = w.document.querySelector('.img-fb');
check('l’img cassée est remplacée par une pastille', !!fb && !img.isConnected);
check('lettre de secours correcte', fb && fb.textContent === 'C');
check('pastille ronde (classe round détectée)', fb && fb.classList.contains('is-round'));
check('taille conservée', fb && fb.style.width === '40px');
const encore = App.imgFailed(fb); // ne doit pas planter sur un non-IMG
check('idempotent (aucune erreur)', true);

// v207 : une image sans aucune taille connue (conteneur masqué / layout pas
// prêt) ne doit PAS être figée en pastille de 1 px invisible — elle reste en
// attente d'un prochain passage (rAF / visible).
const img2 = w.document.createElement('img');
img2.src = 'https://cdn.discordapp.com/icons/2/y.png';
w.document.getElementById('t').appendChild(img2);
App.imgFailed(img2);
check('image sans taille : pas de pastille 1px immédiate', !img2.dataset.fbSafe && img2.isConnected && img2.parentNode === w.document.getElementById('t'));

console.log(`\n✅ v206-test.js : ${n} vérifications OK`);
process.exit(0);
