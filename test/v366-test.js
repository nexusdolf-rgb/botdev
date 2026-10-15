// v366 — mobile : sélecteurs, tiroir des modules et feuilles remis d'aplomb.
//
// Demande du fondateur : « va voir tous les modules et les sélecteurs, il y a
// des bugs côté aperçu mobile, et certains trucs n'ont pas ajusté les tailles
// quand on clique sur un module ».
//
// Trois familles de défauts, toutes MESURÉES dans Chromium avant de corriger
// (banc maison test/tools/audit-mobile.js pour les modules, et son nouveau
// jumeau audit-mobile-interactions.js pour le tiroir, la feuille du bas et les
// sélecteurs) :
//
//   1. DEUX CRITÈRES DE « MOBILE ». Le CSS bascule en mobile avec
//      Dashboard.MQ_ECRAN_ETROIT (largeur ≤ 700 px OU tactile ≤ 900 px OU
//      tactile de moins de 800 px de haut — documenté en v253 : « les critères
//      sont EXACTEMENT ceux du CSS »). Le sélecteur, lui, testait
//      « (max-width: 700px) » tout seul. À 812 × 375 (téléphone à l'horizontale)
//      et à 768 × 1024 (tablette) : la page en feuille, le menu en panneau
//      flottant de 336 px — donc 66 px d'options sous le bord de l'écran,
//      inatteignables puisque le panneau est en position fixed.
//   2. TAILLES NON AJUSTÉES. Le 16 px anti-zoom iOS et le 48 px tactile étaient
//      réservées à « max-width: 700px » : à 812 et 768, le champ de recherche
//      restait à 13 px et le déclencheur à 44 px. Onze <select> d'Antinucléaire
//      et de Modération étaient à 12-13 px sur téléphone. Les lignes du tiroir
//      des modules étaient à 38 px — la seule cible sous le plancher de 40 px
//      que v244 s'était fixé, pendant que le menu général du même tiroir est à
//      43 px. Et les trois étiquettes de la fiche de module (« Ce que fait ce
//      module », « Ce que voient les membres », « Aussi réglable sur Discord »)
//      étaient à 9,5 px partout : sous le plancher de lisibilité de v244, qui
//      ignorait le tactile (251 textes sous 12 px à 768 px, 222 à 360 px).
//   3. VALEURS FANTÔMES. Le bloc « audit v199 » écrasait en !important trois
//      tailles du tiroir (boutons 36 px→42, croix 34→40, pastilles 37→42) : le
//      CSS du haut ne gagnait jamais, mais c'est lui que l'on lit. Plus aucun
//      pouce de la feuille du bas et du tiroir ne prenait l'aire de sécurité,
//      alors que le manifeste est en « standalone » et la page en
//      viewport-fit=cover.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const RACINE = path.join(__dirname, '..');
const code = (p) => fs.readFileSync(path.join(RACINE, p), 'utf8');
const CSS = code('public/css/dashboard.css');
const STYLE = code('public/css/style.css');
const DASH = code('public/js/dashboard.js');

let ok = 0;
let ko = 0;
function check(label, cond, info) {
  if (cond) { ok += 1; console.log('  ✅ ' + label); return; }
  ko += 1;
  console.log('  ❌ ' + label + (info ? ' — ' + info : ''));
}

// La requête « mobile » de la maison, telle que Dashboard.MQ_ECRAN_ETROIT la
// définit : un seul endroit où la lire, deux endroits qui doivent l'appliquer.
const MQ = (DASH.match(/MQ_ECRAN_ETROIT = '([^']+)'/) || [, ''])[1];
check('Dashboard.MQ_ECRAN_ETROIT existe et couvre le tactile', /hover: none/.test(MQ) && /pointer: coarse/.test(MQ), MQ.slice(0, 60));
check('le CSS connaît la même requête, mot pour mot', CSS.includes('@media ' + MQ), 'absente de dashboard.css');

// L'index du @media qui englobe une règle : c'est lui qui dit « pour qui ».
function mediaDe(source, index) {
  const debut = source.lastIndexOf('@media', index);
  if (debut < 0 || index - debut > 4000) return '';
  return source.slice(debut, source.indexOf('{', debut));
}
const regle = (source, extra) => {
  const i = source.indexOf(extra);
  return i < 0 ? null : { index: i, media: mediaDe(source, i) };
};

(async () => {
// ==========================================================================
console.log('\n— 1. Un seul critère « mobile », le JS comme le CSS —');
{
  check('plus aucun « (max-width: 700px) » en dur dans dashboard.js',
    !DASH.includes("matchMedia('(max-width: 700px)')") && !DASH.includes('matchMedia("(max-width: 700px)")'),
    'critère isolé encore employé');
  check('dropdownMenu interroge la requête de la maison',
    /dashboard\.MQ_ECRAN_ETROIT|Dashboard\.MQ_ECRAN_ETROIT/.test(DASH.slice(DASH.indexOf('Dashboard.dropdownMenu ='), DASH.indexOf('Dashboard.dropdownMenu =') + 9000))
    || DASH.includes('window.matchMedia(Dashboard.MQ_ECRAN_ETROIT)'), 'requête introuvable');
}
{
  // Et on le vérifie COMPORTEMENTALEMENT : le vrai code, dans un DOM, avec les
  // deux réponses possibles de matchMedia.
  function essai({ mobile, rect, hauteurFenetre }) {
    // Meme harnais que v362/v363 : runScripts 'outside-only', et App + matchMedia
    // installes DANS le contexte de la page (un eval isole ne voit pas les
    // proprietes posees depuis Node).
    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
      url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window;
    w.__mq = { mobile: !!mobile, requetes: [] };
    if (hauteurFenetre) Object.defineProperty(w, 'innerHeight', { value: hauteurFenetre, configurable: true });
    w.eval(String.raw`
  window.matchMedia = (q) => {
    window.__mq.requetes.push(q);
    return { matches: window.__mq.mobile, media: q, addEventListener() {}, removeEventListener() {} };
  };
  window.App = {
    api: async () => ({}),
    toast: (m) => m,
    state: { user: { is_admin: true } },
    escapeHtml: (t) => String(t),
    el: (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; },
    // v367 — le produit s'appuie desormais sur trois helpers apparus avec la
    // passe decor. Un harnais qui ne les expose pas fait tomber tout un rendu
    // pour une raison qui n'a rien a voir avec ce qu'il est en train de tester.
    glyphe: (nom) => '<svg class="ico-svg" data-glyphe="' + nom + '" aria-hidden="true"></svg>',
    sansPicto: (t) => String(t == null ? '' : t).trim(),
    retourEnregistrement: () => {},
  };
  window.addEventListener('error', (e) => { window.__err = String(e.message); });
`);
    const declencheur = w.document.createElement('button');
    declencheur.className = 'dd-trigger';
    declencheur.innerHTML = '<span class="dd-value">Choisir</span>';
    if (rect) declencheur.getBoundingClientRect = () => rect;
    w.document.body.appendChild(declencheur);
    w.eval(code('public/js/dashboard.js') + String.raw`
(async () => {
  const t = document.querySelector('.dd-trigger');
  Dashboard.dropdownMenu({
    trigger: t, searchable: true,
    getOptions: () => Array.from({ length: 20 }, (_, i) => ({ value: 'C' + i, label: 'salon ' + i })),
    onSelect: () => {},
  });
  t.click();
  await new Promise((r) => setTimeout(r, 60));
  const p = document.querySelector('.dd-panel[data-open="1"]');
  window.__r = {
    trouve: !!p,
    feuille: p ? p.classList.contains('is-sheet') : null,
    bas: p ? p.style.bottom : null,
    left: p ? p.style.left : null,
    largeur: p ? p.style.width : null,
    maxHeight: p ? p.style.maxHeight : null,
    enHaut: p ? p.classList.contains('is-up') : null,
  };
})();`);
    return { w, requetes: w.__mq.requetes };
  }

  const patienter = () => new Promise((r) => setTimeout(r, 260));

  {
    const a = essai({ mobile: true });
    await patienter();
    const r1 = a.w.__r || {};
    check('sur écran étroit : le panneau devient la feuille du bas', r1.trouve && r1.feuille === true, JSON.stringify(r1));
    check('la feuille est collée au bord du bas (et jamais sous le clavier)', r1.bas === '10px', String(r1.bas));
    check('aucune largeur imposée : la feuille prend la place', !r1.largeur && !r1.left, JSON.stringify({ largeur: r1.largeur, left: r1.left }));
    check('c’est BIEN la requête de la maison qui est interrogée',
      a.requetes.includes(MQ), a.requetes.join(' | ').slice(0, 80));

    const b = essai({ mobile: false });
    await patienter();
    const r2 = b.w.__r || {};
    check('sur grand écran : pas de feuille, panneau à côté du champ', r2.trouve && r2.feuille === false, JSON.stringify(r2));
    check('et le plafond de 336 px s’applique quand la place ne manque pas',
      r2.maxHeight === '336px', String(r2.maxHeight));

    // Fenêtre courte, sélecteur en bas : c'est LE cas du téléphone à l'horizontale.
    const c = essai({
      mobile: false, hauteurFenetre: 375,
      rect: { top: 330, bottom: 358, left: 10, right: 400, width: 390, height: 28 },
    });
    await patienter();
    check('le code du sélecteur tourne sans erreur dans la page', !c.w.__err, String(c.w.__err));
    const r3 = c.w.__r || {};
    check('fenêtre de 375 px de haut : le panneau ne dépasse plus jamais l’écran',
      parseInt(r3.maxHeight, 10) <= 375 - 16, `${r3.maxHeight} pour 375 px`);
    check('et il bascule au-dessus du champ quand le bas manque', r3.enHaut === true, JSON.stringify(r3));
  }
}

// ==========================================================================
console.log('\n— 2. Les sélecteurs suivent le mobile partout où le mobile existe —');
{
  const attendus = [
    ['.dd-panel.is-sheet {', 'la feuille du sélecteur'],
    ['.dd-search input { font-size: 16px; min-height: 44px; }', 'le 16 px anti-zoom du champ de recherche'],
    ['.dashboard-shell-host .dd-trigger {\n    min-height: 48px;\n    font-size: 16px;\n  }', 'les 48 px / 16 px du déclencheur'],
    ['.dashboard-shell-host .discord-multi-picker {\n    min-height: 48px;\n  }', 'les 48 px du sélecteur multiple'],
  ];
  for (const [extrait, nom] of attendus) {
    const r = regle(CSS, extrait);
    check(nom + ' : réglé pour le tactile, pas seulement pour <700 px',
      !!r && /hover: none/.test(r.media) && /max-width: 700px/.test(r.media),
      r ? (r.media || '(hors media query — donc aussi sur PC)').slice(0, 70) : 'règle introuvable');
  }
  const panneau = regle(CSS, '.dd-panel {\n  /* v366');
  check('le panneau flottant est plafonné par la hauteur d’écran',
    !!panneau && /max-height:\s*min\(336px,\s*calc\(100dvh - 24px\)\)/.test(CSS), 'plafond absent');
  check('le plafond de 336 px reste écrit AVANT (repli des vieux navigateurs)',
    /max-height:\s*336px;\s*\n\s*max-height:\s*min\(336px/.test(CSS), 'ordre des deux lignes');
  check('la feuille du sélecteur utilise la hauteur visible (dvh), pas vh',
    /max-height:\s*min\(62dvh,\s*calc\(100dvh - 20px\)\)/.test(CSS), 'toujours en vh seul');
}

// ==========================================================================
console.log('\n— 3. Tailles : cibles, libellés, aires de sécurité —');
{
  const item = CSS.match(/\.dash-mobile-module-item \{[^}]*\}/);
  const haut = item ? parseFloat((item[0].match(/min-height:\s*([\d.]+)px/) || [, '0'])[1]) : 0;
  check('les lignes de module du tiroir atteignent la taille des autres lignes du tiroir',
    haut >= 43, haut + 'px (le plancher maison est 40, le menu général est à 43)');
  const libelle = CSS.match(/\.dash-mobile-module-item b \{[^}]*\}/);
  const px = libelle ? parseFloat((libelle[0].match(/font-size:\s*([\d.]+)px/) || [, '0'])[1]) : 0;
  check('le nom du module est lisible (13 px, comme « Serveur sélectionné »)', px >= 13, px + 'px');
  // Une règle « .dash-mobile-* » qui écrirait une taille sous le plancher, alors
  // que le bloc « audit v199 » la reprend en !important 1 300 lignes plus bas :
  // c'EST le piège de ce fichier. On vérifie les deux : plus de petite valeur
  // dans le Haut, et le plancher toujours écrit en Bas.
  // On ne regarde que les SÉLECTEURS qui sont la cible elle-même (le bouton, la
  // ligne, la pastille) : un `button span` de 21 px est une icône dans une cible
  // de 43 px, pas une cible. Et les avatars sont des visuels.
  const cibleSoit = (sel) => sel.split(',').map((u) => u.trim()).some((u) => /(?:^|[\s>])(button|\.dash-mobile-[a-z-]*(close|navbtn|item|link))$/.test(u));
  const cibles = [...CSS.matchAll(/([^{}]+)\{([^}]+)\}/g)]
    .map((m) => ({ sel: m[1].replace(/\s+/g, ' ').trim(), corps: m[2] }))
    .filter((x) => /\.dash-mobile-[a-z-]+/.test(x.sel) && cibleSoit(x.sel)
      && !/avatar/.test(x.sel) && !/display: none/.test(x.corps));
  const sousPlancher = cibles.filter((x) => {
    const nums = [...x.corps.matchAll(/(?:^|[;\s])(?:width|height|min-height):\s*([\d.]+)px/g)].map((n) => parseFloat(n[1]));
    return nums.length > 0 && nums.some((v) => v < 40);
  });
  // Un contrôle sourd vaut zéro : s'assurer qu'il regarde bien quelque chose.
  check('le contrôle des cibles du tiroir est renseigné', cibles.length > 4, cibles.length + ' règles seulement');
  check('toutes les cibles du tiroir mobile atteignent le plancher de 40 px', sousPlancher.length === 0,
    sousPlancher.map((x) => x.sel.slice(-30) + ' ' + (x.corps.match(/(?:width|height|min-height):\s*[\d.]+px/g) || []).join(' ')).join(' / '));
  check('le bloc « audit v199 » garde ses 42/40/42 px en !important',
    /\.dash-mobile-navbtn \{ width: 42px !important; height: 42px !important;/.test(CSS)
    && /\.dash-mobile-close \{ width: 40px !important; height: 40px !important;/.test(CSS)
    && /\.dash-mobile-server-item \{ width: 42px !important; height: 42px !important;/.test(CSS), 'plancher du Bas modifié');
  const tete = regle(CSS, '.dash-mobile-drawer-head {');
  check('la tête du tiroir ménage l’encoche (aire de sécurité haute)',
    !!tete && /padding:\s*calc\(8px \+ env\(safe-area-inset-top\)\)/.test(CSS.slice(tete.index, tete.index + 400)), 'absente');
  // Attention au piège du même nom : la feuille du dashboard est écrite DEUX
  // fois (style.css pour tout le site, dashboard.css pour le shell). C'est
  // dashboard.css qui gagne (chargé après, même spécificité) — mesuré. Donc la
  // correction doit être LÀ, pas seulement dans la feuille partagée.
  const iFeuille = CSS.indexOf('.modal {\n    width: 100vw; max-width: 100vw; max-height: 92dvh;');
  check('la feuille du bas ménage l’indicateur de retour (aire de sécurité basse)',
    iFeuille > 0 && /padding-bottom:\s*env\(safe-area-inset-bottom\)/.test(CSS.slice(iFeuille, iFeuille + 900)), 'absente de dashboard.css');
  check('et elle reste bornée par la hauteur visible (dvh)', iFeuille > 0 && /max-height: 92dvh;/.test(CSS.slice(iFeuille, iFeuille + 120)), 'régression vh');
  check('la feuille du sélecteur et celle du shell sont nées de la même requête',
    mediaDe(CSS, CSS.indexOf('.dd-panel.is-sheet {')).includes(MQ), 'plancher du sélecteur désolidarisé du shell');
}

// ==========================================================================
console.log('\n— 4. Le plancher de lisibilité vaut pour les étiquettes et le tactile —');
{
  const i = CSS.indexOf('.dashboard-shell-host .mg-kicker,');
  const media = i < 0 ? '' : mediaDe(CSS, i);
  check('les étiquettes de la fiche de module entrent dans le plancher de lisibilité',
    i > 0 && /max-width: 700px/.test(media) && /hover: none/.test(media), media.slice(0, 80) || 'introuvable');
  // Le 9,5 px de base est écrit PLUS BAS que le plancher (l.~7257) : ce qui le
  // fait gagner, ce n'est pas l'ordre mais la spécificité. Si quelqu'un préfixe
  // la règle de base, le plancher tombe — d'où la double vérification.
  // Le 9,5 px de base est écrit PLUS BAS que le plancher (l.~7269) : ce n'est pas
  // l'ordre qui fait gagner le plancher, c'est sa spécificité (deux classes
  // contre une). Si quelqu'un préfixe la règle de base, le plancher tombe sans
  // bruit — d'où le contrôle, et la mesure au banc (78 textes à 9,5 px → 0).
  const partsKicker = [...CSS.matchAll(/([^{}]+)\{[^}]*font-size:\s*9\.5px/g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim().split(',').map((u) => u.trim()).filter((u) => u.includes('.mg-kicker')))
    .flat();
  check('la taille de base (9,5 px) reste moins spécifique que le plancher',
    partsKicker.length > 0 && partsKicker.every((sel) => (sel.match(/\./g) || []).length <= 1),
    partsKicker.join(' | ') || 'règle de base introuvable');
  check('le plancher écrit bien 11 px pour ces étiquettes', /font-size:\s*11px/.test(CSS.slice(i, i + 900)), '11px absent du bloc');
  check('la règle de base n’a pas été renforcée entre-temps',
    !/\.dashboard-shell-host \.mg-kicker \{[^}]*font-size: 9\.5px/.test(CSS), 'un préfixe a été ajouté au 9,5 px');
  check('sur grand écran, la fiche garde son 9,5 px (rendu PC inchangé)',
    /\.mg-kicker \{[\s\S]{0,200}font-size: 9\.5px;/.test(CSS), 'taille PC modifiée');
  // Les <select> des cartes de réglages : 16 px sur mobile/tactile, 12-13 px sur
  // PC. On vérifie le bloc lui-même (et pas un index trouvé au petit bonheur).
  const iBloc = CSS.indexOf('v366 — les <select> natifs des cartes de réglages');
  const bloc = iBloc < 0 ? '' : CSS.slice(iBloc, CSS.indexOf('  }\n}', iBloc) + 5);
  for (const sSel of ['.am-rule-action .dash-select', '.am-rule-setting .dash-select', '.am-rule-setting .dash-input',
    '.am-threshold-controls .dash-select', '.am-threshold-controls .dash-input', '.nk-limit-field .dash-select']) {
    check('« ' + sSel + ' » repris dans le bloc mobile', bloc.includes(sSel), 'absent du bloc');
  }
  check('le bloc donne 16 px et 44 px (anti-zoom iOS)',
    /font-size: 16px;\n    min-height: 44px;/.test(bloc.replace(/\s+$/, '')) || /font-size: 16px;\s*\n\s*min-height: 44px;/.test(bloc), bloc.slice(-60));
  check('… et seulement là (le bloc porte la clause tactile)',
    iBloc > 0 && /hover: none/.test(mediaDe(CSS, iBloc)), mediaDe(CSS, iBloc).slice(0, 60) || '(hors media query : ça changerait le rendu PC)');
  check('le 12 px d’origine survit pour le grand écran', /\.am-rule-action \.dash-select[^{]*\{[^}]*font-size: 12px/.test(CSS), 'PC modifié à tort');
}

// ==========================================================================
console.log('\n— 5. Le banc qui a servi, et la version du front —');
{
  const outil = 'test/tools/audit-mobile-interactions.js';
  check('le banc des interactions est dans le dépôt', fs.existsSync(path.join(RACINE, outil)), outil);
  if (fs.existsSync(path.join(RACINE, outil))) {
    const src = code(outil);
    check('il mesure le tiroir des modules, le menu du compte, la feuille et les sélecteurs',
      /\.dash-mobile-module-item/.test(src) && /openMoreSheet/.test(src) && /\.dash-mobile-site-drawer/.test(src) && /\.dd-trigger/.test(src), 'périmètre incomplet');
    check('il mesure les cibles du compte en dur (le 34 px oublié du tiroir)',
      /boutonCompte/.test(src) && /avatarCompte/.test(src), 'rangée du compte non mesurée');
    check('il attend la fin des animations avant de mesurer (sinon on lit la 1re image)',
      /STABLE/.test(src) && /setTimeout\(r, stable\)/.test(src), 'mesure à cru');
    check('il dit combien il a inspecté (un 0 silencieux mentirait)',
      /inspectes/.test(src) && /rendus/.test(src), 'compteurs absents');
    check('il ne casse pas la CI : il sort proprement sans Chromium',
      /Chromium indisponible/.test(src) && /process\.exit\(2\)/.test(src), 'pas de repli');
  }
  const sw = code('public/sw.js');
  const version = (sw.match(/botdev-v(\d+)/) || [])[1] || '';
  const html = code('public/index.html');
  check('index.html : tous les liens versionnés portent la version du service worker (v' + version + ')',
    version !== '' && (html.match(/\?v=\d+/g) || []).length === 7
    && (html.match(/\?v=\d+/g) || []).every((v) => v === '?v=' + version),
    (html.match(/\?v=\d+/g) || []).join(', '));
  check('les fichiers de public/js ne pointent aucune version périmée',
    fs.readdirSync(path.join(RACINE, 'public', 'js')).every((f) =>
      (code('public/js/' + f).match(/\?v=(\d+)/g) || []).every((v) => v === '?v=' + version)),
    fs.readdirSync(path.join(RACINE, 'public', 'js')).map((f) => (code('public/js/' + f).match(/\?v=\d+/g) || []).join('+')).join(' | '));
}

console.log('');
if (ko === 0) console.log(`🎉 v366 — ${ok} vérifications OK : un seul critère mobile, des sélecteurs qui tiennent à l'écran, des tailles qui s'ajustent.`);
else { console.log(`❌ v366 — ${ko} échec(s) sur ${ok + ko}`); process.exitCode = 1; }
})();
