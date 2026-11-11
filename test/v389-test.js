// v389 — La fiche publique d'un bot s'affiche réellement.
//
// Le 8 novembre, /#/bot/1 restait sur un cercle de chargement : `avatarBot`
// était déclaré DANS App.renderPublicLanding (l. 393, sans indentation) alors
// que App.renderPublicBot, défini au niveau du fichier, l'appelait — donc
// ReferenceError à chaque rendu depuis le 21 octobre. Ces vérifications
// regardent la portée réelle, puis rendent la fiche pour de vrai.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let ok = 0;
let ko = 0;
const echecs = [];
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; echecs.push(nom + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const publicJs = racine('public/js/public.js');
const lignes = publicJs.split('\n');

// ------------------------------------------------------------------
console.log('\n— 1. avatarBot vit au niveau du fichier, avant ses deux appelants —');
// ------------------------------------------------------------------
const definitions = lignes.map((l, i) => ({ l, n: i + 1 })).filter((x) => /const avatarBot\s*=/.test(x.l));
check('défini une seule fois', definitions.length === 1, definitions.map((d) => 'l.' + d.n).join(', '));
const def = definitions[0] || { l: '', n: 0 };
check('déclaration au niveau du fichier (aucune indentation)', /^const avatarBot\s*=/.test(def.l), JSON.stringify(def.l.slice(0, 40)));
const ligneAccueil = lignes.findIndex((l) => /^App\.renderPublicLanding\s*=/.test(l)) + 1;
const ligneFiche = lignes.findIndex((l) => /^App\.renderPublicBot\s*=/.test(l)) + 1;
check('…déclaré AVANT App.renderPublicLanding', def.n > 0 && def.n < ligneAccueil, `avatarBot l.${def.n}, accueil l.${ligneAccueil}`);
check('…et donc visible depuis App.renderPublicBot', def.n > 0 && def.n < ligneFiche, `avatarBot l.${def.n}, fiche l.${ligneFiche}`);
// Le piège d'origine : une déclaration indentée = à l'intérieur d'une fonction.
const dedans = lignes.filter((l, i) => /^\s+const avatarBot\s*=/.test(l) && i + 1 !== def.n);
check('aucune copie déclarée à l\'intérieur d\'une fonction', dedans.length === 0, String(dedans.length));

// ------------------------------------------------------------------
console.log('\n— 2. Rendu réel de /#/bot/1 (jsdom + vm) —');
// ------------------------------------------------------------------
const { JSDOM } = require('jsdom');
const BOT = {
  id: 1,
  name: 'Optimus Prime',
  username: 'Optimus Prime',
  avatar_url: '/api/img?u=https%3A%2F%2Fcdn.discordapp.com%2Favatars%2F1%2Fa.webp',
  online: true,
  servers: 16,
  members: 408,
  ping: 82,
  uptime: 656,
  invite_url: 'https://discord.com/oauth2/authorize?client_id=1',
  public_url: 'https://hoxera.is-a.dev',
  custom: [],
  categories: [
    { key: 'moderation', label: 'Modération', emoji: '🛡️', commands: [{ name: 'ban', desc: 'Bannit un membre' }] },
    { key: 'tickets', label: 'Tickets', emoji: '🎫', commands: [{ name: 'ticket', desc: 'Ouvre un ticket' }] },
  ],
};

const monter = (reponseApi) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'https://hoxera.is-a.dev/#/bot/1',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const appels = [];
  const App = {
    state: { user: null },
    currentPublicTimer: null,
    el: (html) => { const t = window.document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; },
    escapeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    glyphe: () => '<svg class="ico-svg"></svg>',
    fmtNumber: (n) => Number(n).toLocaleString('fr-FR'),
    fmtUptime: (s) => `${s} s`,
    renderPublicNavbar: () => window.document.createElement('nav'),
    loadPublicBotAvatar: () => {},
    openInvite: () => {},
    router: { go: (p) => { window.location.hash = '#' + p; } },
    toast: () => {},
    api: async (url) => { appels.push(url); return reponseApi(); },
  };
  const contexte = {
    App, window, document: window.document, location: window.location, navigator: window.navigator,
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (f) => setTimeout(f, 0),
    encodeURIComponent, decodeURIComponent, URLSearchParams: window.URLSearchParams,
    CustomEvent: window.CustomEvent, Event: window.Event, localStorage: window.localStorage,
    history: window.history, matchMedia: window.matchMedia,
    Date, Math, JSON, Number, String, Array, Object, RegExp, parseInt, parseFloat, isNaN, Promise, Error,
  };
  vm.createContext(contexte);
  vm.runInContext(publicJs, contexte, { filename: 'public.js' });
  return { App, window, appels, contexte };
};

(async () => {
  // --- 2a. Le cas qui échouait : la fiche s'affiche ---
  const a = monter(() => ({ bot: BOT }));
  let erreur = null;
  try { await a.App.renderPublicBot(1); } catch (e) { erreur = e; }
  check('aucune exception au rendu', erreur === null, erreur && erreur.message);
  const racinePage = a.window.document.getElementById('app');
  check('le cercle de chargement a disparu', !racinePage.querySelector('.spinner'));
  check('le bloc de la fiche est présent', !!racinePage.querySelector('.pub-bot-hero'));
  check('le nom du bot est affiché', (racinePage.querySelector('h2') || {}).textContent === 'Optimus Prime',
    (racinePage.querySelector('h2') || {}).textContent);
  check('la requête porte sur /public/bots/1', a.appels.includes('/public/bots/1'), a.appels.join(', '));
  check('les statiques sont affichées (16 serveurs)', racinePage.textContent.includes('16'));
  check('les catégories de commandes sont rendues', racinePage.textContent.includes('Modération') && racinePage.textContent.includes('/ban'));

  // --- 2b. Le secours d'avatar tient toujours ---
  const img = racinePage.querySelector('img.pub-avatar');
  check('l\'avatar porte l\'attribut de secours (data-secours)', !!img && img.getAttribute('data-secours') !== null);
  check('aucun gestionnaire en ligne dans le HTML produit',
    !/on(click|error|change|input|submit)=/i.test(racinePage.innerHTML));
  if (a.App.currentPublicTimer) clearInterval(a.App.currentPublicTimer);

  // --- 2c. Le cas d'erreur : message lisible et bouton Retour qui marche ---
  const b = monter(() => { throw new Error('Bot introuvable'); });
  let erreur2 = null;
  try { await b.App.renderPublicBot(99); } catch (e) { erreur2 = e; }
  const page2 = b.window.document.getElementById('app');
  check('une erreur d\'API ne laisse pas la page vide', erreur2 === null && page2.textContent.includes('Bot introuvable'),
    (erreur2 && erreur2.message) || page2.textContent.trim().slice(0, 60));
  const retour = page2.querySelector('[data-retour]');
  check('le bouton Retour existe sans attribut en ligne', !!retour && !retour.hasAttribute('onclick'));
  if (retour) {
    retour.dispatchEvent(new b.window.Event('click'));
    check('…et le clic ramène à l\'accueil', b.window.location.hash === '#/', b.window.location.hash);
  }
  if (b.App.currentPublicTimer) clearInterval(b.App.currentPublicTimer);

  // ------------------------------------------------------------------
  console.log('\n— 3. Le fichier servi par le site est bien celui-ci —');
  // ------------------------------------------------------------------
  const index = racine('public/index.html');
  check('index.html charge public.js en ?v=385', index.includes('/js/public.js?v=385'));

  console.log(`\n${ko === 0 ? '🎉' : '❌'} v389 — ${ok} vérifications, ${ko} échec(s).`);
  if (ko) { echecs.forEach((e) => console.log('   · ' + e)); process.exit(1); }
  process.exit(0);
})();
