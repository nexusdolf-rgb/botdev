// ============================================================================
// Test v246 — État d'affichage par défaut du tableau de bord.
//
// Contexte. La v245 avait livré les cartes pliables avec TOUT ouvert par
// défaut. Une fois en ligne, la mesure a montré que ce défaut ne rendait pas
// service : le tableau de bord faisait toujours 77 écrans de scroll à 360 px.
// L'utilisateur, à qui trois variantes étaient proposées, a répondu « je sais
// plus quoi faire de mieux » et a laissé trancher.
//
// Décision retenue (variante « fine ») : sur ÉCRAN ÉTROIT, la première carte
// d'un onglet reste ouverte, sauf si elle dépasse 1 500 px ; toutes les
// suivantes sont pliées.
//
// ⚠️ CORRECTION APPORTÉE APRÈS RETOUR DU PROPRIÉTAIRE. La règle s'appliquait
// d'abord à toutes les largeurs. Sur ordinateur, où la place ne manque pas,
// tout plier cachait les réglages et donnait au tableau de bord l'aspect d'une
// liste de barres fermées — le même rendu que sur mobile. Mesuré à 1 440 px :
// Modération passait de 8,4 écrans à 1,9, sans aucun bénéfice.
//
// Le repli automatique est désormais limité aux écrans étroits, avec EXACTEMENT
// les mêmes critères que la bascule mobile du CSS (`.dash-side { display: none }`
// à 900 px, ou écran tactile) : mise en page et repli basculent ensemble. Sur
// ordinateur tout est ouvert, mais le chevron reste cliquable.
//
// Vérifié au passage : la mise en page n'a jamais été cassée. Testée avec la
// structure RÉELLE du shell (`.dash-shell > aside.dash-side + main.dash-main
// + nav.dash-bnav`) de 1 920 à 360 px : sidebar présente dès 901 px, nav basse
// cachée. Le banc d'audit ne construisait qu'un `.dash-content` sans sidebar et
// ne pouvait donc pas le voir.
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

// jsdom n'évalue PAS les media queries : son matchMedia renvoie toujours
// matches:false. On le pilote à la main pour tester les deux comportements —
// écran étroit (le repli automatique s'applique) et écran large (il ne
// s'applique pas). Sans ce stub, toute la branche « écran étroit » serait
// silencieusement non testée.
let ecranEtroitSimule = true;
let derniereRequete = null;
dom.window.matchMedia = (requete) => {
  derniereRequete = requete;
  return {
    matches: ecranEtroitSimule, media: requete, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  };
};

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

  // --- A1. Détection de l'écran étroit -------------------------------------
  check('ecranEtroit est exposée', typeof Dashboard.ecranEtroit === 'function');
  // v250 : la bascule ne doit plus dépendre de la SEULE largeur. Un PC dont la
  // fenêtre est étroite (ou dont l'échelle d'affichage Windows réduit la largeur
  // CSS) doit rester en disposition PC ; seul un appareil tactile passe en
  // mobile entre 800 et 900 px. On vérifie donc que la constante JS est bien la
  // chaîne réellement écrite dans le CSS, ET qu'elle porte la condition tactile.
  const cssShell = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'dashboard.css'), 'utf8');
  check('la requête média est celle du CSS (même bascule que .dash-side)',
    cssShell.includes('@media ' + Dashboard.MQ_ECRAN_ETROIT), Dashboard.MQ_ECRAN_ETROIT);
  check('…entre 800 et 900 px, seul un appareil TACTILE passe en mobile',
    /\(max-width: 900px\) and \(hover: none\) and \(pointer: coarse\)/.test(Dashboard.MQ_ECRAN_ETROIT));
  check('…plus aucune bascule à 900 px sur la seule largeur (sinon un PC étroit redevient mobile)',
    !/\(max-width: ?900px\),/.test(Dashboard.MQ_ECRAN_ETROIT)
    && !/@media \(max-width: ?900px\), /.test(cssShell));
  check('…sous 800 px tout le monde reste en mobile (fenêtre minuscule comprise)',
    Dashboard.MQ_ECRAN_ETROIT.startsWith('(max-width: 800px)'));
  check('…et elle est bien celle réellement passée à matchMedia',
    (ecranEtroitSimule = true, Dashboard.ecranEtroit(), derniereRequete === Dashboard.MQ_ECRAN_ETROIT), derniereRequete);
  check('écran étroit détecté', Dashboard.ecranEtroit() === true);
  ecranEtroitSimule = false;
  check('écran large détecté', Dashboard.ecranEtroit() === false);

  // Sans matchMedia (vieux navigateur, SSR) : ne doit pas lever, et doit
  // supposer un écran large — donc rien cacher.
  const mm = dom.window.matchMedia;
  dom.window.matchMedia = undefined;
  let leve = null; let repli = null;
  try { repli = Dashboard.ecranEtroit(); } catch (e) { leve = e; }
  dom.window.matchMedia = mm;
  check('matchMedia absent → ne lève pas', leve === null, leve && String(leve.message));
  check('…et suppose un écran large (rien n\'est caché)', repli === false, String(repli));

  // matchMedia qui lève (requête refusée) : pareil.
  dom.window.matchMedia = () => { throw new Error('requête invalide'); };
  leve = null;
  try { repli = Dashboard.ecranEtroit(); } catch (e) { leve = e; }
  dom.window.matchMedia = mm;
  check('matchMedia qui lève → ne propage pas', leve === null, leve && String(leve.message));
  check('…et retombe sur écran large', repli === false, String(repli));

  // --- A2. Écran ÉTROIT : le repli automatique s'applique ------------------
  ecranEtroitSimule = true;
  const S = Dashboard.HAUTEUR_MAX_PREMIERE;
  console.log('    · écran étroit (mobile / tactile)');
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

  // --- A3. Écran LARGE : rien n'est replié automatiquement ------------------
  // C'est la correction demandée par le propriétaire : sur ordinateur, la v246
  // pliait tout et le tableau de bord ressemblait à la version mobile.
  ecranEtroitSimule = false;
  console.log('    · écran large (ordinateur)');
  check('1re carte → ouverte', Dashboard.carteOuverteParDefaut(0, 800) === true);
  check('1re carte immense → ouverte quand même (il y a la place)',
    Dashboard.carteOuverteParDefaut(0, 4997) === true);
  check('2e carte → ouverte', Dashboard.carteOuverteParDefaut(1, 100) === true);
  check('13e carte → ouverte', Dashboard.carteOuverteParDefaut(12, 50) === true);
  check('hauteur inconnue → ouverte', Dashboard.carteOuverteParDefaut(0, undefined) === true);
  ecranEtroitSimule = true;

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

  // Les hauteurs doivent être mesurées AVANT l'application du repli, sinon la
  // carte pliée ne renvoie plus que son en-tête et la décision se fausse.

  // ==========================================================================
  console.log('\n── B2. Même onglet sur écran large (ordinateur) ──');
  // ==========================================================================

  // Correction demandée par le propriétaire : sur PC, la v246 pliait toutes les
  // cartes et le tableau de bord ressemblait à la version mobile. Mesuré à
  // 1 440 px, Modération passait de 8,4 écrans à 1,9 — sans bénéfice, puisqu'il
  // n'y a pas de problème de scroll à régler sur un grand écran.
  ecranEtroitSimule = false;

  etat = onglet('tickets', [600, 900, 400]);
  check('3 cartes → TOUTES ouvertes sur ordinateur',
    etat.join(',') === 'ouverte,ouverte,ouverte', etat.join(','));

  etat = onglet('moderation', [4997, 900, 400]);
  check('1re carte immense → ouverte quand même',
    etat.join(',') === 'ouverte,ouverte,ouverte', etat.join(','));

  // Le chevron doit rester présent : plier soi-même une carte sur ordinateur
  // doit toujours être possible, seul le défaut change.
  const chevrons = c.querySelectorAll('.card-fold').length;
  check('le chevron reste disponible sur ordinateur', chevrons === 3, String(chevrons));
  check('…et il est repliable à la main', (() => {
    const premiere = c.querySelectorAll('.dash-card')[0];
    premiere.querySelector('.card-fold').click();
    const plie = premiere.classList.contains('is-folded');
    premiere.querySelector('.card-fold').click();
    return plie && !premiere.classList.contains('is-folded');
  })());
  check('…et le choix manuel survit au retour sur l\'onglet', (() => {
    const premiere = c.querySelectorAll('.dash-card')[0];
    premiere.querySelector('.card-fold').click();               // on plie à la main
    const cle = Dashboard.cleCarte(premiere);
    Dashboard.state.module = 'health';
    Dashboard.state.module = 'moderation';
    Dashboard.rendreCartesPliables(c);
    const ok = Dashboard.etatCartes[cle] === false;
    premiere.querySelector('.card-fold').click();               // on remet ouvert
    return ok;
  })());

  ecranEtroitSimule = true;

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
  check('index.html : ?v=250 référencé 7 fois', versions.length === 7 && versions.every((v) => v === '?v=250'),
    `${versions.length} refs : ${[...new Set(versions)].join(',')}`);
  check('sw.js : cache « botdev-v250 »', swSource.includes("const CACHE = 'botdev-v250';"));
  check('index.html et sw.js portent la même version',
    swSource.includes("botdev-v250") && versions.every((v) => v === '?v=250'));

  console.log('');
  if (echecs) { console.log(`❌ v246 — ${echecs} échec(s)`); process.exit(1); }
  console.log('🎉 Tous les tests v246 passent — repli auto sur écran étroit seulement, tout ouvert sur PC.');
})();
