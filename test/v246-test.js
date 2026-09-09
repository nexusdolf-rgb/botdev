// ============================================================================
// Test v246 — État d'affichage par défaut du tableau de bord.
//
// Contexte. La v245 avait livré les cartes pliables avec TOUT ouvert par
// défaut. Une fois en ligne, la mesure a montré que ce défaut ne rendait pas
// service : le tableau de bord faisait toujours 77 écrans de scroll à 360 px.
// L'utilisateur, à qui trois variantes étaient proposées, a répondu « je sais
// plus quoi faire de mieux » et a laissé trancher.
//
// Décision retenue (variante « fine ») : la PREMIÈRE carte d'un onglet reste
// ouverte, sauf si elle dépasse 1 500 px ; toutes les suivantes sont pliées.
//
// Pourquoi ce seuil et pas simplement « la première toujours ouverte » :
// l'onglet Modération ouvre sur « 🛡️ Auto-modération », qui mesure 4 997 px,
// soit 6,4 écrans à elle seule. La laisser ouverte annulait l'essentiel du
// gain (50 écrans au lieu de 39). À l'inverse, tout plier d'emblée (29 écrans)
// donne l'impression d'un menu vide et oblige à cliquer pour voir quoi que ce
// soit. Le seuil arbitre entre ces deux excès.
//
// Gain mesuré (banc test/tools/comparer-repli.js, 360 px, 28 modules) :
//
//     tout ouvert (v245) ...... 77 écrans
//     défaut v246 ............. 39 écrans   ← livré ici   (−49 %)
//     tout replié ............. 29 écrans
//
//     moderation ...... 13,9 → 2,2 écrans   (−84 %)
//     tickets .........  9,8 → 1,4 écrans   (−86 %)
//     antinuke ........  7,4 → 1,2 écrans   (−84 %)
//     announcements ...  4,1 → 0,6 écrans   (−85 %)
//
// Rien n'est supprimé : tout le contenu reste atteignable en un clic.
//
// Ce fichier épingle le CONTRAT PAR DÉFAUT. La mécanique des cartes pliables
// (chevron, aria, idempotence, exclusion des en-têtes à interrupteur) est
// couverte par test/v245-test.js.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v246-${Date.now()}`);
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

// ---------------------------------------------------------------------------
// Environnement DOM. jsdom ne calcule PAS la mise en page : sans stub,
// getBoundingClientRect().height vaut 0 et la branche « carte trop haute » ne
// serait jamais exercée. `hauteur()` injecte donc une hauteur réaliste.
// ---------------------------------------------------------------------------
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

const src = racine('public/js/dashboard.js');
const i0 = src.indexOf('Dashboard.PLIABLE_CLASSES =');
const i1 = src.indexOf('Dashboard.SETTING_ROW_CONTROLS =');
if (!check('fonctions v245/v246 localisées dans dashboard.js', i0 > 0 && i1 > i0, `${i0}/${i1}`)) process.exit(1);
eval(src.slice(i0, i1));

const c = document.getElementById('c');

const hauteur = (carte, h) => {
  carte.getBoundingClientRect = () => ({ height: h, width: 360, top: 0, left: 0, right: 360, bottom: h, x: 0, y: 0 });
  return carte;
};
const carte = (titre, h = 600, contenu = '<p>contenu</p>') => hauteur(
  App.el(`<div class="dash-card" data-dash-card><div class="card-head"><div class="card-heading"><h3>${titre}</h3></div></div>${contenu}</div>`), h);

// Construit un onglet de N cartes aux hauteurs données et renvoie l'état réel.
const onglet = (module, hauteurs) => {
  Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
  Dashboard.state.module = module;
  c.innerHTML = '';
  hauteurs.forEach((h, i) => c.appendChild(carte(`${module}-carte-${i}`, h)));
  Dashboard.rendreCartesPliables(c);
  return [...c.querySelectorAll('.dash-card')].map((x) => (x.classList.contains('is-folded') ? 'pliée' : 'ouverte'));
};

(async () => {
  // ==========================================================================
  console.log('\n── A. La règle de défaut ──');
  // ==========================================================================

  check('le seuil est de 1 500 px', Dashboard.HAUTEUR_MAX_PREMIERE === 1500,
    String(Dashboard.HAUTEUR_MAX_PREMIERE));
  check('carteOuverteParDefaut est bien exposée', typeof Dashboard.carteOuverteParDefaut === 'function');

  const S = Dashboard.HAUTEUR_MAX_PREMIERE;
  check('1re carte de 800 px → ouverte', Dashboard.carteOuverteParDefaut(0, 800) === true);
  check(`1re carte exactement au seuil (${S} px) → ouverte`,
    Dashboard.carteOuverteParDefaut(0, S) === true);
  check(`1re carte à ${S + 1} px → pliée`, Dashboard.carteOuverteParDefaut(0, S + 1) === false);
  check('1re carte de 4 997 px (cas réel « Auto-modération ») → pliée',
    Dashboard.carteOuverteParDefaut(0, 4997) === false);
  check('2e carte courte → pliée quand même', Dashboard.carteOuverteParDefaut(1, 100) === false);
  check('13e carte → pliée', Dashboard.carteOuverteParDefaut(12, 50) === false);
  check('hauteur manquante (undefined) → pliée, sans lever',
    Dashboard.carteOuverteParDefaut(0, undefined) === false);
  check('hauteur non numérique (NaN) → pliée, sans lever',
    Dashboard.carteOuverteParDefaut(0, NaN) === false);
  check('index négatif → pliée', Dashboard.carteOuverteParDefaut(-1, 100) === false);

  // ==========================================================================
  console.log('\n── B. Règle appliquée à un onglet réel ──');
  // ==========================================================================

  let etat = onglet('tickets', [600, 900, 400]);
  check('3 cartes courtes → seule la 1re est ouverte',
    etat.join(',') === 'ouverte,pliée,pliée', etat.join(','));

  etat = onglet('moderation', [4997, 900, 400]);
  check('1re carte trop haute → TOUT est plié',
    etat.join(',') === 'pliée,pliée,pliée', etat.join(','));

  etat = onglet('antinuke', [1499, 3000]);
  check('1re carte juste sous le seuil → ouverte, la haute suivante pliée',
    etat.join(',') === 'ouverte,pliée', etat.join(','));

  etat = onglet('welcome', [120]);
  check('onglet à une seule carte courte → ouverte',
    etat.join(',') === 'ouverte', etat.join(','));

  // Les hauteurs doivent être mesurées AVANT l'application du repli, sinon la
  // carte pliée ne renvoie plus que son en-tête et la décision se fausse.
  const avantRepli = /const hauteurs = pliables\.map\(\(carte\) => carte\.getBoundingClientRect\(\)\.height\);/;
  const zone = src.slice(i0, i1);
  const posMesure = zone.search(avantRepli);
  const posApplique = zone.indexOf('appliquer(ouverte)');
  check('les hauteurs sont mesurées avant tout repli', posMesure > 0 && posMesure < posApplique,
    `mesure @${posMesure} · application @${posApplique}`);

  // ==========================================================================
  console.log('\n── C. Le choix explicite l\'emporte sur le défaut ──');
  // ==========================================================================

  // Sans cette priorité, un utilisateur qui ouvre une carte verrait son choix
  // annulé dès qu'il revient sur l'onglet.
  Dashboard.state.module = 'tickets';
  Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
  Dashboard.etatCartes['tickets::tickets-carte-2'] = true;    // la 3e, ouverte
  Dashboard.etatCartes['tickets::tickets-carte-0'] = false;   // la 1re, pliée
  c.innerHTML = '';
  [600, 900, 400].forEach((h, i) => c.appendChild(carte(`tickets-carte-${i}`, h)));
  Dashboard.rendreCartesPliables(c);
  const cartes = [...c.querySelectorAll('.dash-card')];
  check('une carte mémorisée ouverte s\'ouvre même si elle n\'est pas la 1re',
    !cartes[2].classList.contains('is-folded'), cartes[2].className);
  check('une carte mémorisée pliée reste pliée même si elle est la 1re',
    cartes[0].classList.contains('is-folded'), cartes[0].className);
  check('une carte sans choix explicite garde le défaut',
    cartes[1].classList.contains('is-folded'), cartes[1].className);
  check('aria-expanded reflète le choix explicite (1re carte)',
    cartes[0].querySelector('.card-fold').getAttribute('aria-expanded') === 'false');
  check('aria-expanded reflète le choix explicite (3e carte)',
    cartes[2].querySelector('.card-fold').getAttribute('aria-expanded') === 'true');

  // ==========================================================================
  console.log('\n── D. Persistance et portée ──');
  // ==========================================================================

  check('la clé de stockage est hoxera-cartes-etat',
    Dashboard.ETAT_CARTES_CLE === 'hoxera-cartes-etat', Dashboard.ETAT_CARTES_CLE);
  check('l\'ancienne clé hoxera-cartes-pliees n\'est plus lue nulle part',
    !src.includes('hoxera-cartes-pliees'), 'référence résiduelle');
  check('l\'ancien état cartesPliees a bien disparu',
    !src.includes('cartesPliees'), 'référence résiduelle');

  // Le clic doit écrire en mémoire : sinon rien ne survit au changement d'onglet.
  onglet('tickets', [600, 900, 400]);
  cartes.length = 0;
  cartes.push(...c.querySelectorAll('.dash-card'));
  cartes[1].querySelector('.card-head').click();
  const brut = JSON.parse(sessionStorage.getItem(Dashboard.ETAT_CARTES_CLE) || '{}');
  check('un clic écrit le choix en sessionStorage',
    Object.keys(brut).length === 1, JSON.stringify(brut));
  check('…sous une clé préfixée par l\'onglet',
    Object.keys(brut)[0] === 'tickets::tickets-carte-1', Object.keys(brut)[0]);
  check('…et la valeur est un booléen (pas une chaîne)',
    typeof Object.values(brut)[0] === 'boolean', typeof Object.values(brut)[0]);

  // Revenir sur l'onglet doit restaurer le choix.
  Dashboard.state.module = 'health';
  c.innerHTML = ''; c.appendChild(carte('autre-onglet', 500));
  Dashboard.rendreCartesPliables(c);
  Dashboard.state.module = 'tickets';
  c.innerHTML = '';
  [600, 900, 400].forEach((h, i) => c.appendChild(carte(`tickets-carte-${i}`, h)));
  Dashboard.rendreCartesPliables(c);
  check('au retour sur l\'onglet, la carte ouverte par clic est toujours ouverte',
    !c.querySelectorAll('.dash-card')[1].classList.contains('is-folded'),
    c.querySelectorAll('.dash-card')[1].className);

  // Le repli d'un onglet ne doit pas déborder sur un autre.
  check('un autre onglet n\'hérite pas du repli',
    Dashboard.etatCartes['health::autre-onglet'] === undefined,
    JSON.stringify(Dashboard.etatCartes));

  // ==========================================================================
  console.log('\n── E. Intégrité du contenu ──');
  // ==========================================================================

  // Le repli est visuel : le DOM doit rester intact, sinon on perd des données
  // au premier affichage.
  onglet('moderation', [4997, 900]);
  const pliee = c.querySelector('.dash-card.is-folded');
  check('une carte pliée CONSERVE son contenu dans le DOM',
    pliee.querySelectorAll('p').length === 1, String(pliee.querySelectorAll('p').length));
  check('…et son texte n\'est pas vidé', (pliee.textContent || '').includes('contenu'));
  check('le repli est porté par une classe CSS, pas par display:none en dur',
    pliee.getAttribute('style') === null, pliee.getAttribute('style'));
  check('la classe de repli est bien is-folded', pliee.classList.contains('is-folded'));

  const css = racine('public/css/dashboard.css');
  check('le CSS masque le contenu de .is-folded', /\.is-folded/.test(css));
  check('…sans toucher à la structure (règle sur les enfants de la carte)',
    /\.dash-card\.is-folded > \*:not\(\.card-head\)/.test(css)
    || /\.is-folded > \*:not\(\.card-head\)/.test(css),
    'sélecteur de masquage introuvable');

  // ==========================================================================
  console.log('\n── F. Version ──');
  // ==========================================================================

  const indexHtml = racine('public/index.html');
  const swSource = racine('public/sw.js');
  const versions = [...indexHtml.matchAll(/\?v=(\d+)/g)].map((m) => `?v=${m[1]}`);
  check('index.html : ?v=246 référencé 7 fois', versions.length === 7 && versions.every((v) => v === '?v=246'),
    `${versions.length} refs : ${[...new Set(versions)].join(',')}`);
  check('sw.js : cache « botdev-v246 »', swSource.includes("const CACHE = 'botdev-v246';"));
  check('index.html et sw.js portent la même version',
    swSource.includes("botdev-v246") && versions.every((v) => v === '?v=246'));

  console.log('');
  if (echecs) { console.log(`❌ v246 — ${echecs} échec(s)`); process.exit(1); }
  console.log('🎉 Tous les tests v246 passent — défaut d\'affichage : 77 → 39 écrans, rien de supprimé.');
})();
