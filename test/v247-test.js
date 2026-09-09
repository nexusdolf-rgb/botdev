// ============================================================================
// Test v247 — Le repli automatique des cartes est limité aux écrans étroits.
//
// CORRECTIF d'un défaut introduit par la v246.
//
// La v246 pliait par défaut toutes les cartes sauf la première — à TOUTES les
// largeurs. Sur ordinateur, où la place ne manque pas, le tableau de bord se
// retrouvait donc réduit à une pile de barres fermées, visuellement identique à
// la version mobile. C'est ce qu'a signalé le propriétaire : « l'interface sur
// PC est devenue la même que celle sur mobile ».
//
// Mesuré à 1 440 px, avant/après ce correctif :
//
//     moderation ...... 1,9 écran  →  8,4 écrans   (identique à la v245)
//     tickets ......... 2,5 écrans →  6,8 écrans   (identique à la v245)
//
// Sur mobile, rien ne change : le repli reste actif (moderation 2,2 écrans).
//
// ── Ce que ce test verrouille en priorité ──────────────────────────────────
// L'INVARIANT ENTRE LES DEUX FICHIERS. Le JavaScript décide du repli avec une
// media query, le CSS décide de cacher la barre latérale avec une autre. Si les
// deux divergent, on retombe exactement dans le défaut signalé : une mise en
// page de bureau avec des cartes pliées, ou une mise en page mobile avec tout
// déplié. Le test lit donc le CSS et compare les deux chaînes littéralement.
//
// ── Vérification faite au passage, à ne pas oublier ────────────────────────
// La mise en page n'a JAMAIS été cassée par la v245 ni la v246 : le diff ne
// touchait aucune règle de `.dash-shell`, `.dash-side`, `.dash-main` ou
// `.dash-bnav`. Testée avec la structure RÉELLE du shell (celle de
// `Dashboard.mount`, dashboard.js ligne ~413) de 1 920 à 360 px : sidebar en
// `flex` dès 901 px, cachée à 900 px et en dessous. Le banc d'audit
// (test/tools/audit-mobile.js) ne construit qu'un `.dash-content` sans sidebar
// et ne pouvait donc pas le voir — d'où la mesure dédiée ci-dessous.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v247-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const { JSDOM } = require('jsdom');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const dom = new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.MutationObserver = dom.window.MutationObserver;
global.sessionStorage = dom.window.sessionStorage;
global.requestAnimationFrame = (f) => setTimeout(f, 0);
global.App = {
  el: (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
  escapeHtml: (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  api: async () => ({}),
  toast: () => {},
};
global.Dashboard = { renderers: {}, state: { module: 'moderation' } };

// jsdom n'évalue pas les media queries : on pilote matchMedia à la main.
let etroit = true;
dom.window.matchMedia = (requete) => ({
  matches: etroit, media: requete, onchange: null,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, dispatchEvent() { return false; },
});

const src = racine('public/js/dashboard.js');
const i0 = src.indexOf('Dashboard.PLIABLE_CLASSES =');
const i1 = src.indexOf('Dashboard.SETTING_ROW_CONTROLS =');
if (!check('zone v245/v246/v247 localisée dans dashboard.js', i0 > 0 && i1 > i0, `${i0}/${i1}`)) process.exit(1);
eval(src.slice(i0, i1));

const c = document.getElementById('c');
const hauteur = (carte, h) => {
  carte.getBoundingClientRect = () => ({ height: h, width: 360, top: 0, left: 0, right: 360, bottom: h, x: 0, y: 0 });
  return carte;
};
const carte = (titre, h = 600) => hauteur(
  App.el(`<div class="dash-card" data-dash-card><div class="card-head"><div class="card-heading"><h3>${titre}</h3></div></div><p>contenu</p></div>`), h);

const onglet = (module, hauteurs) => {
  Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
  Dashboard.state.module = module;
  c.innerHTML = '';
  hauteurs.forEach((h, i) => c.appendChild(carte(`${module}-${i}`, h)));
  Dashboard.rendreCartesPliables(c);
  return [...c.querySelectorAll('.dash-card')].map((x) => (x.classList.contains('is-folded') ? 'pliée' : 'ouverte'));
};

(async () => {
  // ==========================================================================
  console.log('\n── A. Invariant JS ⇄ CSS (le point critique) ──');
  // ==========================================================================

  const css = racine('public/css/dashboard.css');
  const mqJS = Dashboard.MQ_ECRAN_ETROIT;

  check('le JS expose sa media query', typeof mqJS === 'string' && mqJS.length > 20, String(mqJS));
  check('cette media query existe littéralement dans le CSS', css.includes(mqJS),
    `introuvable : ${mqJS}`);

  // Le CSS cache la barre latérale dans CETTE media query : c'est la bascule
  // mobile. Le repli doit basculer au même endroit, pas à un autre palier.
  //
  // La media query apparaît plusieurs fois dans le CSS (un bloc par couche de
  // style). On balaie donc TOUTES les occurrences et on retient celle qui porte
  // la règle — chercher seulement la première donnait un faux négatif, le
  // premier bloc ne contenant pas la bascule de la barre latérale.
  const RE_SIDEBAR = /\.dash-side\s*\{\s*display:\s*none/;
  const blocs = [];
  for (let pos = css.indexOf(mqJS); pos !== -1; pos = css.indexOf(mqJS, pos + 1)) {
    blocs.push(css.slice(pos, pos + 6000));
  }
  const avecSidebar = blocs.filter((b) => RE_SIDEBAR.test(b)).length;
  check('la media query est présente en plusieurs blocs dans le CSS', blocs.length >= 5,
    `${blocs.length} blocs`);
  check('l\'un de ces blocs contient la bascule de la barre latérale', avecSidebar === 1,
    `${avecSidebar} bloc(s) sur ${blocs.length}`);
  check('…et le seuil de bascule est 900 px', /max-width:\s*900px/.test(mqJS), mqJS);

  // Garde contre la dérive : compter les media query de bascule dans le CSS et
  // vérifier qu'elles sont toutes identiques. Si quelqu'un en modifie une seule,
  // le JS et le CSS divergent silencieusement.
  const occurrences = css.split(mqJS).length - 1;
  check('la media query de bascule est utilisée de façon homogène dans le CSS',
    occurrences >= 5, `${occurrences} occurrences`);
  const autresPaliers = [...css.matchAll(/\.dash-side\s*\{\s*display:\s*none/g)].length;
  check('la barre latérale n\'est masquée QUE par cette bascule', autresPaliers === 1,
    `${autresPaliers} règles de masquage`);

  // ==========================================================================
  console.log('\n── B. Écran large : plus aucun repli automatique ──');
  // ==========================================================================

  etroit = false;

  check('ecranEtroit() rend false sur écran large', Dashboard.ecranEtroit() === false);
  check('1re carte → ouverte', Dashboard.carteOuverteParDefaut(0, 800) === true);
  check('1re carte immense (4 997 px) → ouverte quand même',
    Dashboard.carteOuverteParDefaut(0, 4997) === true);
  check('2e carte → ouverte', Dashboard.carteOuverteParDefaut(1, 100) === true);

  let etat = onglet('moderation', [4997, 900, 400]);
  check('onglet Modération sur PC → TOUT ouvert (le défaut signalé)',
    etat.every((e) => e === 'ouverte'), etat.join(','));

  etat = onglet('tickets', [600, 900, 400, 300]);
  check('onglet Tickets sur PC → TOUT ouvert', etat.every((e) => e === 'ouverte'), etat.join(','));

  // Le chevron doit rester : seul le DÉFAUT change, la fonctionnalité demeure.
  check('le chevron reste injecté sur PC', c.querySelectorAll('.card-fold').length === 4,
    String(c.querySelectorAll('.card-fold').length));
  const premiere = c.querySelector('.dash-card');
  premiere.querySelector('.card-fold').click();
  check('…et plier à la main fonctionne toujours sur PC', premiere.classList.contains('is-folded'));
  check('…le choix manuel est mémorisé',
    Dashboard.etatCartes[Dashboard.cleCarte(premiere)] === false);
  premiere.querySelector('.card-fold').click();
  check('…et déplier aussi', !premiere.classList.contains('is-folded'));

  // ==========================================================================
  console.log('\n── C. Écran étroit : le repli reste actif ──');
  // ==========================================================================

  etroit = true;

  check('ecranEtroit() rend true sur écran étroit', Dashboard.ecranEtroit() === true);
  etat = onglet('tickets', [600, 900, 400]);
  check('3 cartes courtes → seule la 1re ouverte',
    etat.join(',') === 'ouverte,pliée,pliée', etat.join(','));
  etat = onglet('moderation', [4997, 900, 400]);
  check('1re carte trop haute → tout plié (seuil 1 500 px conservé)',
    etat.every((e) => e === 'pliée'), etat.join(','));
  check('le seuil n\'a pas bougé', Dashboard.HAUTEUR_MAX_PREMIERE === 1500,
    String(Dashboard.HAUTEUR_MAX_PREMIERE));

  // ==========================================================================
  console.log('\n── D. Robustesse de la détection ──');
  // ==========================================================================

  const mm = dom.window.matchMedia;

  dom.window.matchMedia = undefined;
  let leve = null, res = null;
  try { res = Dashboard.ecranEtroit(); } catch (e) { leve = e; }
  check('matchMedia absent → ne lève pas', leve === null, leve && String(leve.message));
  check('…et suppose un écran large, donc ne cache rien', res === false, String(res));

  dom.window.matchMedia = () => { throw new Error('refusée'); };
  leve = null;
  try { res = Dashboard.ecranEtroit(); } catch (e) { leve = e; }
  check('matchMedia qui lève → ne propage pas', leve === null, leve && String(leve.message));
  check('…et retombe sur écran large', res === false, String(res));

  dom.window.matchMedia = () => ({ matches: undefined });
  check('matches non booléen → converti en false (écran large)',
    Dashboard.ecranEtroit() === false);

  dom.window.matchMedia = mm;
  etroit = true;
  check('le comportement normal est rétabli après les cas dégradés',
    Dashboard.ecranEtroit() === true);

  // ==========================================================================
  console.log('\n── E. Version ──');
  // ==========================================================================

  const indexHtml = racine('public/index.html');
  const swSource = racine('public/sw.js');
  const versions = [...indexHtml.matchAll(/\?v=(\d+)/g)].map((m) => `?v=${m[1]}`);
  check('index.html : ?v=253 référencé 7 fois',
    versions.length === 7 && versions.every((v) => v === '?v=253'),
    `${versions.length} refs : ${[...new Set(versions)].join(',')}`);
  check('sw.js : cache « botdev-v253 »', swSource.includes("const CACHE = 'botdev-v253';"));
  check('index.html et sw.js portent la même version',
    swSource.includes('botdev-v253') && versions.every((v) => v === '?v=253'));

  console.log('');
  if (echecs) { console.log(`❌ v247 — ${echecs} échec(s)`); process.exit(1); }
  console.log('🎉 Tous les tests v247 passent — PC tout ouvert, mobile replié, JS et CSS d\'accord.');
})();
