// ============================================================================
// Test v245 — Déclarer le tableau de bord : textes repliés + cartes pliables.
//
// Demande utilisateur : « trop de texte, ça fait peu professionnel ».
//
// Ce qui a été MESURÉ avant de coder (banc test/tools/audit-mobile.js,
// Chromium réel, 360 px, les 28 modules) — c'est ce qui a décidé du chantier :
//
//   Répartition de la hauteur totale (62 282 px) :
//     • cartes, titres, espacements ............ 50 %
//     • contrôles (champs, sélecteurs…) ........ 29 %
//     • textes d'explication ................... 21 %
//
//   Autrement dit : replier les textes seuls ne pouvait PAS raccourcir
//   beaucoup la page. Mesuré : 77 écrans → 75, soit 2,6 %. Les 98 cartes
//   pèsent à elles seules 50 768 px (82 % de la hauteur), et la plus grosse
//   (« 🛡️ Auto-modération ») fait 5 004 px = 6,4 écrans à elle seule.
//
//   D'où les deux volets livrés ici :
//     A. textes d'explication repliés dans un « En savoir plus » natif ;
//     B. cartes pliables — mesuré : 76 écrans → 28 quand tout est replié.
//
// Choix validés par l'utilisateur :
//   • textes : repliés partout (mobile ET ordinateur), seuil 120 caractères,
//     rien n'est supprimé ni raccourci ;
//   • cartes : TOUT reste ouvert par défaut, on plie ce qui gêne, et le choix
//     est mémorisé le temps de la session.
//
// Un défaut de mesure a été corrigé en route, et il change les conclusions :
// le banc appelait les rendeurs SANS les post-traitements que le vrai site
// applique (layoutSettingRows). Il mesurait donc une page que personne ne
// voit. Une fois rendu fidèle, il a révélé 47 boutons de pied de carte à
// 38 px, plus petits que les autres boutons (40 px), à cause d'un sélecteur
// CSS trop spécifique. Corrigé, et verrouillé en section D.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v245-${Date.now()}`);
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
const code = (f) => racine(f).split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// ---------------------------------------------------------------------------
// Environnement DOM. On n'exécute que les fonctions v245, pas tout le fichier.
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

// Depuis la v247, le repli AUTOMATIQUE ne s'applique que sur écran étroit
// (sinon le tableau de bord sur ordinateur ressemblait à la version mobile).
// jsdom n'évalue pas les media queries et renvoie toujours matches:false,
// c'est-à-dire « écran large ». Sans ce stub, toutes les assertions de repli
// ci-dessous échoueraient alors qu'elles décrivent le cas mobile.
dom.window.matchMedia = (requete) => ({
  matches: true, media: requete, onchange: null,
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, dispatchEvent() { return false; },
});

const src = racine('public/js/dashboard.js');
const i0 = src.indexOf('Dashboard.PLIABLE_CLASSES =');
const i1 = src.indexOf('Dashboard.SETTING_ROW_CONTROLS =');
if (!check('fonctions v245 localisées dans dashboard.js', i0 > 0 && i1 > i0, `${i0}/${i1}`)) process.exit(1);
eval(src.slice(i0, i1));

const LONG = "Voici une explication suffisamment longue pour dépasser largement le seuil de repli retenu, afin de vérifier le comportement.";
const COURT = 'Explication courte.';

const carte = (titre, contenu, classe = 'dash-card') => App.el(
  `<div class="${classe}" data-dash-card><div class="card-head"><div class="card-heading"><h3>${titre}</h3></div></div>${contenu}</div>`);

(async () => {
  // ==========================================================================
  console.log('\n── A. Repli des textes : ce qui est replié ──');
  // ==========================================================================

  check('seuil = 120 caractères (choix utilisateur)', Dashboard.PLIABLE_SEUIL === 120, String(Dashboard.PLIABLE_SEUIL));
  check('liste blanche de classes d\'explication définie',
    Array.isArray(Dashboard.PLIABLE_CLASSES) && Dashboard.PLIABLE_CLASSES.length >= 5,
    JSON.stringify(Dashboard.PLIABLE_CLASSES));
  check('…et ce sont bien des sélecteurs de classe',
    Dashboard.PLIABLE_CLASSES.every((c) => /^\.[a-z-]+$/i.test(c)), Dashboard.PLIABLE_CLASSES.join(','));

  const c = document.querySelector('#c');
  const r1 = App.el(`<div class="desc">${LONG}</div>`);
  c.innerHTML = ''; c.appendChild(r1);
  const nb = Dashboard.plierTextesLongs(c);
  check('un texte long de classe .desc est replié', nb === 1 && !!c.querySelector('details.dash-details'), String(nb));
  check('…dans un <details> NATIF (pas de JS pour ouvrir)', c.querySelector('details.dash-details') instanceof dom.window.HTMLDetailsElement);
  check('…avec un <summary> « En savoir plus »',
    (c.querySelector('summary') || {}).textContent === 'En savoir plus', (c.querySelector('summary') || {}).textContent);
  // Le point central de la demande : rien ne doit disparaître.
  check('le texte est INTÉGRALEMENT conservé', r1.textContent.includes('vérifier le comportement'), r1.textContent.slice(-40));
  check('…et il reste dans le document (cherchable, lisible)', c.textContent.includes('seuil de repli'));

  // Court → pas replié.
  c.innerHTML = ''; c.appendChild(App.el(`<div class="desc">${COURT}</div>`));
  check('un texte court n\'est PAS replié', Dashboard.plierTextesLongs(c) === 0 && !c.querySelector('details'));

  // Juste sous le seuil, et juste au-dessus.
  const pile = (n) => 'x'.repeat(n);
  c.innerHTML = ''; c.appendChild(App.el(`<div class="desc">${pile(119)}</div>`));
  check('119 caractères : pas replié', Dashboard.plierTextesLongs(c) === 0);
  c.innerHTML = ''; c.appendChild(App.el(`<div class="desc">${pile(120)}</div>`));
  check('120 caractères : replié (seuil inclusif)', Dashboard.plierTextesLongs(c) === 1);

  // Les autres classes de la liste blanche.
  for (const cl of Dashboard.PLIABLE_CLASSES) {
    c.innerHTML = ''; c.appendChild(App.el(`<div class="${cl.slice(1)}">${LONG}</div>`));
    check(`classe ${cl} repliable`, Dashboard.plierTextesLongs(c) === 1);
  }

  // ==========================================================================
  console.log('\n── A2. Ce qui ne doit JAMAIS être replié ──');
  // ==========================================================================

  // Avertissement critique : le masquer pourrait faire rater une désactivation.
  const alertes = [
    `${LONG} ⚠️ les annonces sont désactivées`,
    `🚨 ${LONG}`,
    `Aucun salon choisi — ${LONG}`,
  ];
  alertes.forEach((t, i) => {
    c.innerHTML = ''; c.appendChild(App.el(`<div class="desc">${t}</div>`));
    check(`texte d'alerte n°${i + 1} laissé visible`, Dashboard.plierTextesLongs(c) === 0, t.slice(0, 34));
  });

  // Classes hors liste blanche repérées par l'audit comme à ne PAS replier.
  const nonPliables = ['dash-badge', 'dash-label', 'am-threshold-controls', 'dash-empty', 'dash-card'];
  for (const cl of nonPliables) {
    c.innerHTML = ''; c.appendChild(App.el(`<div class="${cl}">${LONG}</div>`));
    check(`.${cl} jamais replié (liste blanche)`, Dashboard.plierTextesLongs(c) === 0);
  }

  // Un .desc à l'intérieur d'un en-tête de carte : le replier mettrait un
  // « En savoir plus » dans le titre de la carte.
  c.innerHTML = '';
  c.appendChild(App.el(`<div class="card-head"><div class="card-heading"><h3>Titre</h3><div class="desc">${LONG}</div></div></div>`));
  check('.desc d\'un en-tête de carte exclu', Dashboard.plierTextesLongs(c) === 0);

  // Un texte long qui CONTIENT un contrôle : le replier masquerait un champ.
  c.innerHTML = '';
  c.appendChild(App.el(`<div class="desc">${LONG}<input type="text" value="x"></div>`));
  check('texte contenant un champ exclu', Dashboard.plierTextesLongs(c) === 0);
  c.innerHTML = '';
  c.appendChild(App.el(`<div class="desc">${LONG}<button>OK</button></div>`));
  check('texte contenant un bouton exclu', Dashboard.plierTextesLongs(c) === 0);

  // Aperçu de ce que l'utilisateur compose : il doit le voir.
  for (const zone of ['ca-preview', 'eb-preview', 'dash-preview']) {
    c.innerHTML = '';
    c.appendChild(App.el(`<div class="${zone}"><div class="desc">${LONG}</div></div>`));
    check(`aperçu .${zone} exclu`, Dashboard.plierTextesLongs(c) === 0);
  }

  // ==========================================================================
  console.log('\n── A3. Idempotence (appelé par un MutationObserver) ──');
  // ==========================================================================
  // Ces post-traitements modifient le DOM, donc l'observateur les rappelle.
  // Sans garde, boucle infinie.

  c.innerHTML = ''; c.appendChild(App.el(`<div class="desc">${LONG}</div>`));
  Dashboard.plierTextesLongs(c);
  const apres1 = c.innerHTML;
  Dashboard.plierTextesLongs(c);
  Dashboard.plierTextesLongs(c);
  check('rappeler plierTextesLongs ne change plus rien', c.innerHTML === apres1);
  check('…et ne crée pas de <details> imbriqués', c.querySelectorAll('details').length === 1,
    String(c.querySelectorAll('details').length));
  check('garde data-pliable posée', c.querySelector('.desc').dataset.pliable === 'oui');
  check('un texte court déjà vu n\'est pas réexaminé inutilement',
    (() => { c.innerHTML = ''; const d = App.el(`<div class="desc">${COURT}</div>`); c.appendChild(d);
      Dashboard.plierTextesLongs(c); return d.dataset.pliable === 'oui'; })());

  // ==========================================================================
  console.log('\n── B. Cartes pliables ──');
  // ==========================================================================

  // jsdom ne calcule pas la mise en page : getBoundingClientRect().height vaut
  // toujours 0. La règle de hauteur se teste donc comme fonction pure, et le
  // comportement DOM se teste sur la hauteur mesurée à 0 (cas « carte courte »).
  check('règle de défaut : hauteur max de la première carte = 1500 px',
    Dashboard.HAUTEUR_MAX_PREMIERE === 1500, String(Dashboard.HAUTEUR_MAX_PREMIERE));
  check('première carte courte → ouverte', Dashboard.carteOuverteParDefaut(0, 800) === true);
  check('première carte à la limite exacte → ouverte',
    Dashboard.carteOuverteParDefaut(0, Dashboard.HAUTEUR_MAX_PREMIERE) === true);
  check('première carte trop haute → pliée (cas « Auto-modération », 4 997 px)',
    Dashboard.carteOuverteParDefaut(0, 4997) === false);
  check('deuxième carte → pliée même si courte', Dashboard.carteOuverteParDefaut(1, 100) === false);
  check('carte suivante → pliée', Dashboard.carteOuverteParDefaut(7, 50) === false);
  check('hauteur aberrante (NaN) ne lève pas et replie',
    Dashboard.carteOuverteParDefaut(0, NaN) === false);

  c.innerHTML = '';
  const k1 = carte('🛡️ Auto-modération', `<div class="desc">${LONG}</div><input class="dash-input" value="x">`);
  c.appendChild(k1);
  Dashboard.state.module = 'moderation';
  Dashboard.rendreCartesPliables(c);
  check('carte marquée pliable', k1.dataset.cartePliable === 'oui');
  check('un chevron est ajouté', !!k1.querySelector('.card-fold'));
  check('…avec un type="button" (sinon il soumettrait le formulaire)',
    k1.querySelector('.card-fold').type === 'button', k1.querySelector('.card-fold').getAttribute('type'));
  check('…avec une aria-label', (k1.querySelector('.card-fold').getAttribute('aria-label') || '').length > 5);
  check('…et un span décoratif masqué aux lecteurs d\'écran',
    k1.querySelector('.card-fold span').getAttribute('aria-hidden') === 'true');
  check('première carte ouverte par défaut (hauteur 0 en jsdom)', !k1.classList.contains('is-folded'), k1.className);
  check('aria-expanded = true à l\'ouverture',
    k1.querySelector('.card-fold').getAttribute('aria-expanded') === 'true');
  check('en-tête marqué cliquable', k1.querySelector('.card-head').classList.contains('card-head-pliable'));

  // AUCUNE restructuration du DOM : six règles CSS ciblent les enfants DIRECTS
  // d'une carte et casseraient si le contenu était emballé dans un conteneur.
  const nbEnfantsAttendu = 3;   // card-head, .desc, le champ
  check('le contenu n\'est PAS emballé dans un conteneur',
    !k1.querySelector('.card-body') && k1.children.length === nbEnfantsAttendu,
    `${k1.children.length} enfants : ${[...k1.children].map((x) => x.className || x.tagName).join(', ')}`);
  check('l\'en-tête reste enfant direct de la carte',
    k1.querySelector(':scope > .card-head') === k1.children[0]);
  check('le champ reste enfant direct (sélecteurs CSS > préservés)',
    k1.querySelector(':scope > input.dash-input') !== null);

  // Non-régression : la clé ne doit PAS dépendre du chevron injecté.
  // Bug réel trouvé en écrivant ce test — la clé valait « …Auto-modération »
  // avant injection et « …Auto-modération ▾ » après, donc l'état mémorisé
  // devenait introuvable et le choix de l'utilisateur était perdu.
  const cleAvant = 'moderation::' + '🛡️ Auto-modération';
  check('clé stable APRÈS injection du chevron', Dashboard.cleCarte(k1) === cleAvant, Dashboard.cleCarte(k1));
  check('…et ne contient pas le glyphe du chevron', !Dashboard.cleCarte(k1).includes('▾'), Dashboard.cleCarte(k1));
  const kSansHead = App.el('<div class="dash-card"><p>x</p></div>');
  check('clé d\'une carte sans en-tête ne lève pas',
    typeof Dashboard.cleCarte(kSansHead) === 'string' && Dashboard.cleCarte(kSansHead).endsWith('::'),
    Dashboard.cleCarte(kSansHead));

  // Bascule par clic sur le titre.
  k1.querySelector('.card-head').click();
  check('clic sur le titre → repliée', k1.classList.contains('is-folded'), k1.className);
  check('…aria-expanded passe à false', k1.querySelector('.card-fold').getAttribute('aria-expanded') === 'false');
  check('…et le choix explicite est mémorisé',
    Dashboard.etatCartes[Dashboard.cleCarte(k1)] === false, JSON.stringify(Dashboard.etatCartes));
  const brut = JSON.parse(sessionStorage.getItem(Dashboard.ETAT_CARTES_CLE) || '{}');
  check('…dans sessionStorage (pas localStorage)', Object.keys(brut).length === 1, JSON.stringify(brut));
  check('clé = onglet + titre de la carte',
    Object.keys(brut)[0].startsWith('moderation::'), Object.keys(brut)[0]);

  // Clic pour rouvrir : le choix EXPLICITE doit être conservé, sinon une carte
  // repliée par défaut reviendrait pliée au prochain passage sur l'onglet.
  k1.querySelector('.card-fold').click();
  check('clic sur le chevron → rouverte', !k1.classList.contains('is-folded'), k1.className);
  check('…le choix explicite « ouverte » est mémorisé',
    Dashboard.etatCartes[Dashboard.cleCarte(k1)] === true, JSON.stringify(Dashboard.etatCartes));

  // Double bascule impossible : le chevron est DANS l'en-tête, son clic
  // remonterait et basculerait deux fois sans stopPropagation.
  k1.querySelector('.card-fold').click();
  check('un seul clic sur le chevron ne bascule qu\'UNE fois',
    k1.classList.contains('is-folded'), k1.className);
  k1.querySelector('.card-fold').click();

  // ==========================================================================
  console.log('\n── B2. Cartes qui ne doivent PAS devenir pliables ──');
  // ==========================================================================

  c.innerHTML = '';
  const sansHead = App.el(`<div class="dash-card"><p>${LONG}</p></div>`);
  c.appendChild(sansHead);
  Dashboard.rendreCartesPliables(c);
  check('carte sans en-tête ignorée (tuiles de la Vue d\'ensemble)',
    sansHead.dataset.cartePliable === undefined);

  c.innerHTML = '';
  const headInteractif = App.el(`<div class="dash-card"><div class="card-head"><h3>T</h3><label class="switch"><input type="checkbox"></label></div><p>x</p></div>`);
  c.appendChild(headInteractif);
  Dashboard.rendreCartesPliables(c);
  check('carte dont l\'en-tête porte un interrupteur ignorée (onglet Modules)',
    headInteractif.dataset.cartePliable === undefined);
  check('…et aucun chevron n\'y est injecté', headInteractif.querySelectorAll('.card-fold').length === 0);

  // Idempotence : ces post-traitements sont rappelés par un MutationObserver.
  c.innerHTML = ''; c.appendChild(carte('Titre', '<p>x</p>'));
  Dashboard.rendreCartesPliables(c);
  const html1 = c.innerHTML;
  Dashboard.rendreCartesPliables(c);
  Dashboard.rendreCartesPliables(c);
  check('rappeler rendreCartesPliables ne change plus rien', c.innerHTML === html1);
  check('…et n\'ajoute pas deux chevrons', c.querySelectorAll('.card-fold').length === 1,
    String(c.querySelectorAll('.card-fold').length));

  // Le choix mémorisé est relue au passage suivant sur l'onglet.
  Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
  Dashboard.etatCartes['moderation::🛡️ Auto-modération'] = false;
  Dashboard.enregistrerEtatCartes();
  c.innerHTML = '';
  const k2 = carte('🛡️ Auto-modération', `<p>${LONG}</p>`);
  c.appendChild(k2);
  Dashboard.state.module = 'moderation';
  Dashboard.rendreCartesPliables(c);
  check('une carte mémorisée pliée se retrouve pliée', k2.classList.contains('is-folded'), k2.className);
  check('…et annonce aria-expanded=false', k2.querySelector('.card-fold').getAttribute('aria-expanded') === 'false');

  // Un choix explicite « ouverte » doit l'emporter sur le défaut « pliée ».
  Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
  Dashboard.etatCartes['tickets::Configuration'] = true;
  c.innerHTML = '';
  c.appendChild(carte('Autre', '<p>x</p>'));
  c.appendChild(carte('Configuration', '<p>y</p>'));
  Dashboard.state.module = 'tickets';
  Dashboard.rendreCartesPliables(c);
  const kOuv = c.querySelectorAll('.dash-card')[1];
  check('choix explicite « ouverte » respecté sur une carte non-première',
    !kOuv.classList.contains('is-folded'), kOuv.className);

  // Le repli ne doit pas fuiter d'un onglet à l'autre.
  c.innerHTML = '';
  const k3 = carte('🛡️ Auto-modération', '<p>x</p>');
  c.appendChild(k3);
  Dashboard.state.module = 'health';
  Dashboard.rendreCartesPliables(c);
  check('le repli ne fuit pas vers un autre onglet', !k3.classList.contains('is-folded'), k3.className);

  // Mémoire indisponible ou corrompue : quota plein, navigation privée,
  // sessionStorage bloqué, JSON invalide. Rien ne doit lever, sinon le tableau
  // de bord entier resterait blanc.
  const zoneV245 = src.slice(Math.max(0, i0 - 4000), i1);
  check('la lecture de la mémoire est protégée par try/catch',
    /etatCartes = \(\(\) => \{[\s\S]{0,400}?try \{[\s\S]{0,400}?\} catch/.test(zoneV245), 'garde absente à la lecture');
  check('l\'écriture de la mémoire est protégée par try/catch',
    /enregistrerEtatCartes = \(\) => \{[\s\S]{0,300}?try \{[\s\S]{0,300}?\} catch/.test(zoneV245), 'garde absente à l\'écriture');
  check('une valeur non booléenne en mémoire est écartée',
    /typeof brut\[k\] === 'boolean'/.test(zoneV245), 'filtrage absent');

  const sauvegarde = global.sessionStorage;
  let leve = null;
  try {
    Object.defineProperty(dom.window, 'sessionStorage', { value: undefined, configurable: true });
    Dashboard.enregistrerEtatCartes();
  } catch (e) { leve = e; }
  finally { Object.defineProperty(dom.window, 'sessionStorage', { value: sauvegarde, configurable: true }); }
  check('écrire sans sessionStorage disponible ne lève pas', leve === null, leve && String(leve.message));

  Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
  Dashboard.enregistrerEtatCartes();
  Dashboard.state.module = 'moderation';

  // ==========================================================================
  console.log('\n── C. Branchements ──');
  // ==========================================================================

  const dash = code('public/js/dashboard.js');
  const appels = (dash.match(/Dashboard\.rendreCartesPliables\(/g) || []).length;
  check('rendreCartesPliables appelé (passe initiale + observateur + rendu central)',
    appels === 3, String(appels));
  const appelsTextes = (dash.match(/Dashboard\.plierTextesLongs\(/g) || []).length;
  check('plierTextesLongs appelé aux 3 mêmes endroits', appelsTextes === 3, String(appelsTextes));

  // Ordre : la mise en rows crée .card-actions et déplace des éléments. Plier
  // avant produirait un DOM différent de celui que l'utilisateur voit.
  const iRows = dash.indexOf('Dashboard.layoutSettingRows(content)');
  const iTextes = dash.indexOf('Dashboard.plierTextesLongs(content)');
  const iCartes = dash.indexOf('Dashboard.rendreCartesPliables(content)');
  check('ordre au rendu central : rows → textes → cartes',
    iRows > 0 && iRows < iTextes && iTextes < iCartes, `${iRows} / ${iTextes} / ${iCartes}`);

  // ==========================================================================
  console.log('\n── D. Régression corrigée en route : boutons de pied de carte ──');
  // ==========================================================================
  // Le banc ne rejouait pas layoutSettingRows, qui déplace les boutons en fin
  // de carte dans .card-actions. Or .card-actions .dash-btn imposait 38 px,
  // plus petit que les 40 px de tout autre .dash-btn : 47 boutons du
  // tableau de bord étaient sous la cible tactile retenue en v244.

  const css = racine('public/css/dashboard.css');
  const m = css.match(/\.card-actions \.dash-btn \{ min-height:\s*([\d.]+)px;?\s*\}/);
  check('.card-actions .dash-btn : règle présente', !!m, 'introuvable');
  check('.card-actions .dash-btn : 40 px comme les autres boutons',
    m && parseFloat(m[1]) === 40, m ? m[1] : '?');
  check('.dash-btn général : min-height 40 px', /\.dash-btn \{[^}]*min-height:\s*40px/.test(css));

  // Le banc doit désormais rejouer le pipeline RÉEL, sinon il mesure une page
  // que personne ne voit — c'est exactement l'erreur qui a masqué les 38 px.
  const banc = racine('test/tools/audit-mobile.js');
  check('le banc rejoue layoutSettingRows', /Dashboard\.layoutSettingRows\(c\)/.test(banc));
  check('le banc rejoue plierTextesLongs', /Dashboard\.plierTextesLongs\(c/.test(banc));
  check('le banc rejoue rendreCartesPliables', /Dashboard\.rendreCartesPliables\(c\)/.test(banc));
  check('le banc peut mesurer l\'avant/après (--sans-repli)', /--sans-repli/.test(banc));
  check('le banc peut mesurer le gain maximal (--tout-plier)', /--tout-plier/.test(banc));
  check('le banc vérifie le clic réel (--clic)', /--clic/.test(banc));
  check('les drapeaux ne sont pas pris pour des noms de module',
    /filter\(\(a\) => !a\.startsWith\('--'\)\)/.test(banc));

  // ==========================================================================
  console.log('\n── E. CSS ──');
  // ==========================================================================

  check('accolades équilibrées', (css.match(/{/g) || []).length === (css.match(/}/g) || []).length);
  check('règle de repli : masque tout sauf l\'en-tête',
    /\.dash-card\.is-folded > \*:not\(\.card-head\) \{ display: none/.test(css));
  check('…avec !important (des règles existantes imposent display)',
    /\.dash-card\.is-folded > \*:not\(\.card-head\) \{ display: none !important/.test(css));
  check('description d\'en-tête masquée quand replié',
    /\.dash-card\.is-folded \.card-head \.desc \{ display: none/.test(css));
  check('chevron pivoté quand replié', /\.dash-card\.is-folded \.card-fold span \{ transform: rotate/.test(css));
  check('.dash-details stylé', /\.dash-details > summary \{/.test(css));
  check('marqueur natif du <summary> retiré (chevron maison à la place)',
    /summary::-webkit-details-marker \{ display: none/.test(css));
  check('focus visible sur le chevron (clavier)', /\.card-fold:focus-visible/.test(css));
  check('focus visible sur « En savoir plus »', /\.dash-details > summary:focus-visible/.test(css));
  check('thème clair pris en compte', /html\.hx-light \.card-fold/.test(css) && /html\.hx-light \.dash-details/.test(css));

  // Le lien « En savoir plus » ne doit pas être si haut qu'il annule le gain
  // du repli : mesuré, à 40 px chacun, replier 90 blocs ne gagnait qu'un
  // seul écran sur 77.
  const ms = css.match(/\.dash-details > summary \{ min-height:\s*([\d.]+)px/);
  check('lien « En savoir plus » compact sur tactile (≤ 34 px)',
    ms && parseFloat(ms[1]) <= 34, ms ? ms[1] : '?');

  // Les six règles à enfant direct doivent survivre : c'est tout l'intérêt de
  // ne pas avoir restructuré le DOM.
  ['> .card-actions', '> .dash-input', '> .dash-select', '> .dash-btn:last-child'].forEach((sel) => {
    check(`règle à enfant direct « ${sel} » toujours présente`, css.includes(sel));
  });

  // ==========================================================================
  console.log('\n── F. Bump de version ──');
  // ==========================================================================

  const html = racine('public/index.html');
  const sw = racine('public/sw.js');
  const versions = [...new Set(html.match(/\?v=\d+/g) || [])];
  check('index.html : 7 références, toutes identiques',
    (html.match(/\?v=\d+/g) || []).length === 7 && versions.length === 1, versions.join(','));
  check('cette version est la v245', versions[0] === '?v=251', String(versions[0]));
  const cacheAttendu = `'botdev-${versions[0].replace('?v=', 'v')}'`;
  check('sw.js : cache aligné sur index.html', sw.includes(cacheAttendu),
    `${cacheAttendu} attendu, ${(sw.match(/const CACHE = '[^']*'/) || ['?'])[0]} trouvé`);
  check('sw.js : un seul nom de cache', (sw.match(/botdev-v\d+'/g) || []).length === 1);
  const motif = ['botdev-', 'v244', '-${Date.now()}'].join('');
  check('v244-test.js : son dossier de données n\'a pas suivi le bump',
    racine('test/v244-test.js').includes(motif));

  console.log(`\n${echecs === 0
    ? '🎉 Tous les tests v245 passent — textes repliés, cartes pliables, rien de supprimé.'
    : `❌ v245 — ${echecs} échec(s)`}`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch((e) => { console.error('💥', e); process.exit(1); });
