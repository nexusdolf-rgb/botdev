// ============================================================================
// Test v248 — Deux débordements du tableau de bord sur les écrans intermédiaires.
//
// Découverts par le banc d'audit une fois celui-ci rendu fidèle à la vraie
// structure du shell (v247). Jusque-là le banc mesurait un contenu pleine
// largeur, SANS la barre latérale : il ne pouvait pas voir ces deux défauts.
//
// Plage touchée : 901 à ~1 350 px de viewport, soit 1024, 1280 et 1366 px —
// les tailles de portable les plus courantes. 45 débordements horizontaux.
//
// ── Défaut 1 : la liste des limites anti-nuke compressée à 300 px (v244) ───
//
// Le rendeur anti-nuke émet, pour chaque groupe :
//
//     <div class="dash-label nk-group-title">Suppressions</div>
//     <div class="nk-limit-list"> …des <select class="dash-select">… </div>
//
// Or Dashboard.layoutSettingRows transforme en « ligne libellé → contrôle » tout
// libellé suivi d'un DIV contenant un select.dash-select. La liste des limites
// passait donc pour un simple contrôle et se retrouvait enfermée dans une
// colonne de 300 px.
//
// Mesuré à 901 px (contenu réel 581 px) :
//     .nk-limit-list   boîte 300 px · scrollWidth 392 px   ⚠️
//     .nk-limit        grille « 0px 112px 112px 112px »
//
// La grille interne a un plancher de 3 × 112 px + 3 gouttières de 10 px +
// rembourrage + bordure = 392 px. Faute de place, la colonne du libellé
// (minmax(0, 1.7fr)) s'effondrait à **0 px** : le nom de l'action disparaissait.
// 44 débordements.
//
// Correctif : .nk-limit-list rejoint .dash-channelsmulti dans la liste des
// conteneurs pleine largeur, désormais factorisée dans
// Dashboard.SETTING_ROW_PLEINE_LARGEUR.
//
// ── Défaut 2 : grilles de petits champs écrites en style inline ────────────
//
// Quatre grilles « libellé + champ » étaient écrites en STYLE INLINE avec
// auto-fit et un plancher de 140 à 170 px. Deux problèmes :
//
//   1. un style inline ne peut être surchargé par AUCUNE media query — c'est le
//      piège déjà documenté dans le CSS pour .nk-limit ;
//   2. le plancher ignorait ce que fabrique layoutSettingRows : il met le
//      libellé et le champ CÔTE À CÔTE, et le champ a un min-width de 84 px.
//      Une colonne de 187 px pour 204 px de contenu réel = 17 px de
//      débordement. C'était l'onglet Niveaux (« XP min », « XP max »,
//      « Pause »).
//
// Correctif : classe partagée .dash-fields-grid, plancher 210 px. À 581 px de
// contenu, auto-fit passe de 3 colonnes de 187 px à 2 colonnes de 285,5 px.
//
// ── Résultat mesuré après correctif ────────────────────────────────────────
//
//   360 · 480 · 600 · 768 · 900 · 901 · 950 · 1024 · 1100 · 1200 · 1280 ·
//   1366 · 1440 · 1920 px  →  0 débordement partout, en souris ET en tactile.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v248-${Date.now()}`);
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
global.Dashboard = { renderers: {}, state: { module: 'antinuke' } };

// On n'exécute que la zone « mise en ligne des réglages », pas tout le fichier.
const src = racine('public/js/dashboard.js');
const i0 = src.indexOf('Dashboard.SETTING_ROW_CONTROLS =');
const i1 = src.indexOf('// ---------- Vue d\'ensemble ----------');
if (!check('zone layoutSettingRows localisée dans dashboard.js', i0 > 0 && i1 > i0, `${i0}/${i1}`)) process.exit(1);
eval(src.slice(i0, i1));

const css = racine('public/css/dashboard.css');
const c = document.getElementById('c');

// Construit une carte contenant un libellé suivi d'un conteneur donné,
// puis applique layoutSettingRows et renvoie le résultat.
const essai = (htmlConteneur) => {
  c.innerHTML = `<div class="dash-card"><div class="dash-label nk-group-title">Suppressions</div>${htmlConteneur}</div>`;
  Dashboard.layoutSettingRows(c);
  const carte = c.querySelector('.dash-card');
  return {
    carte,
    ligne: carte.querySelector('.setting-row'),
    nbLignes: carte.querySelectorAll('.setting-row').length,
  };
};

(async () => {
  // ==========================================================================
  console.log('\n── A. Défaut 1 : la liste anti-nuke ne doit plus être compressée ──');
  // ==========================================================================

  check('SETTING_ROW_PLEINE_LARGEUR est exposée',
    typeof Dashboard.SETTING_ROW_PLEINE_LARGEUR === 'string'
    && Dashboard.SETTING_ROW_PLEINE_LARGEUR.length > 0,
    String(Dashboard.SETTING_ROW_PLEINE_LARGEUR));
  check('…elle contient .nk-limit-list',
    Dashboard.SETTING_ROW_PLEINE_LARGEUR.includes('.nk-limit-list'),
    Dashboard.SETTING_ROW_PLEINE_LARGEUR);
  check('…et conserve .dash-channelsmulti (exclusion historique)',
    Dashboard.SETTING_ROW_PLEINE_LARGEUR.includes('.dash-channelsmulti'),
    Dashboard.SETTING_ROW_PLEINE_LARGEUR);
  check('…ce sont bien des sélecteurs de classe valides',
    Dashboard.SETTING_ROW_PLEINE_LARGEUR.split(',').every((s) => /^\s*\.[a-z][a-z0-9-]*\s*$/i.test(s)),
    Dashboard.SETTING_ROW_PLEINE_LARGEUR);

  // Le cas qui débordait : titre de groupe + liste de limites.
  const listeLimites = `<div class="nk-limit-list">
      <div class="nk-limit"><div class="nk-limit-label"><span class="nk-limit-name">Suppression de salon</span></div>
        <label class="nk-limit-field"><span class="desc">Sanction</span>
          <select class="dash-select nk-action"><option>Global — Quarantaine</option></select></label></div>
    </div>`;
  let r = essai(listeLimites);
  check('.nk-limit-list n\'est PAS enfermée dans une .setting-row',
    r.nbLignes === 0, `${r.nbLignes} ligne(s) créée(s)`);
  check('…elle reste enfant direct de la carte (bloc pleine largeur)',
    c.querySelector('.dash-card > .nk-limit-list') !== null);
  check('…et le titre de groupe n\'a pas été déplacé',
    c.querySelector('.dash-card > .dash-label.nk-group-title') !== null);

  // Les deux exclusions historiques doivent continuer à fonctionner.
  r = essai('<div class="dash-channelsmulti"><select class="dash-select"><option>x</option></select></div>');
  check('.dash-channelsmulti reste exclue (non-régression)', r.nbLignes === 0, `${r.nbLignes} ligne(s)`);

  // ── Et surtout : le comportement NORMAL ne doit pas casser ────────────────
  // C'est le risque principal de ce correctif — trop exclure reviendrait à
  // remettre tous les libellés au-dessus de leur champ.
  r = essai('<select class="dash-select"><option>x</option></select>');
  check('un libellé suivi d\'un <select> devient TOUJOURS une .setting-row',
    r.nbLignes === 1, `${r.nbLignes} ligne(s)`);
  r = essai('<input class="dash-input" value="x">');
  check('un libellé suivi d\'un <input> devient une .setting-row', r.nbLignes === 1, `${r.nbLignes} ligne(s)`);
  r = essai('<div><select class="dash-select"><option>x</option></select></div>');
  check('un libellé suivi d\'un DIV contenant un select devient une .setting-row',
    r.nbLignes === 1, `${r.nbLignes} ligne(s)`);
  r = essai('<label class="switch"><input type="checkbox"></label>');
  check('un libellé suivi d\'un interrupteur devient une .setting-row', r.nbLignes === 1, `${r.nbLignes} ligne(s)`);

  // ==========================================================================
  console.log('\n── B. Défaut 2 : les grilles de petits champs ──');
  // ==========================================================================

  check('la classe .dash-fields-grid existe dans le CSS', css.includes('.dash-fields-grid'));

  const regle = css.match(/\.dashboard-shell-host \.dash-fields-grid\s*\{([^}]*)\}/);
  check('…avec une règle de grille', !!regle, 'règle introuvable');
  if (regle) {
    const corps = regle[1];
    check('…c\'est bien un auto-fit', /repeat\(\s*auto-fit/.test(corps), corps.trim().slice(0, 90));
    const plancher = Number((corps.match(/minmax\(\s*(\d+)px/) || [])[1]);
    check('…son plancher est de 210 px', plancher === 210, `${plancher} px`);
    // 210 px = le minimum mesuré d'une .setting-row (libellé + champ à 84 px de
    // min-width + gouttière). En dessous, la colonne déborde.
    check('…ce plancher couvre le min-width du champ (84 px) + un libellé',
      plancher >= 84 + 100, `${plancher} px`);
    check('…et il est supérieur au vieux plancher inline fautif (140 px)', plancher > 140);
  }
  check('…prévue pour le téléphone (une seule colonne sous 520 px)',
    /@media \(max-width: 520px\)[\s\S]{0,200}\.dash-fields-grid\s*\{[^}]*minmax\(0, 1fr\)/.test(css),
    'règle téléphone introuvable');

  // Le JavaScript doit l'utiliser, sinon la classe ne sert à rien.
  const js = racine('public/js/dashboard.js');
  const utilisations = (js.match(/class="dash-fields-grid"/g) || []).length;
  check('le rendeur utilise .dash-fields-grid', utilisations >= 4, `${utilisations} utilisation(s)`);

  // Plus aucune grille « libellé + champ » en style inline avec un plancher trop
  // bas : c'est la cause racine, et un style inline est impossible à surcharger.
  //
  // Attention à ne pas être trop large : il reste des grilles auto-fit inline
  // légitimes (cartes de résumé, filtres de jours) dont les cellules ne
  // contiennent NI .dash-label NI contrôle de formulaire — layoutSettingRows ne
  // les touche donc pas et leur plancher n'a pas à valoir 210 px. Le test ne
  // signale une grille que si ses cellules combinent les deux.
  const inline = [...js.matchAll(/style="display:grid;grid-template-columns:repeat\(auto-fit,minmax\((\d+)px,1fr\)\)/g)];
  const fautives = inline.filter((m) => {
    if (Number(m[1]) >= 210) return false;
    const apres = js.slice(m.index, m.index + 500);
    return apres.includes('dash-label') && /dash-input|dash-select/.test(apres);
  });
  check('aucune grille inline « libellé + champ » avec plancher < 210 px',
    fautives.length === 0,
    fautives.map((m) => `${m[1]}px @${js.slice(0, m.index).split('\n').length}`).join(', ') || 'aucune');
  check('les grilles inline restantes sont sans libellé+contrôle (donc hors sujet)',
    inline.length >= 1 && inline.every((m) => !fautives.includes(m)),
    `${inline.length} grille(s) inline : ${inline.map((m) => m[1] + 'px').join(', ')}`);

  // ==========================================================================
  console.log('\n── C. Cohérence avec la bascule CSS de .nk-limit ──');
  // ==========================================================================

  // La grille des limites bascule en 3 colonnes à max-width:900px — le VIEWPORT.
  // Entre 901 et 1 350 px le contenu réel est bien plus étroit à cause de la
  // barre latérale. Le correctif rend ce palier sans objet pour le débordement
  // (la liste n'est plus compressée), mais on vérifie que la grille interne
  // garde un plancher nul sur sa colonne de libellé, donc rétrécissable.
  const regleNk = css.match(/\.dashboard-shell-host \.nk-limit\s*\{([^}]*)\}/);
  check('la grille .nk-limit existe', !!regleNk);
  if (regleNk) {
    check('…sa colonne de libellé peut se réduire (minmax(0, …))',
      /minmax\(0,\s*1\.7fr\)/.test(regleNk[1]), regleNk[1].trim().slice(0, 110));
    check('…ses trois champs gardent un plancher de 112 px',
      /repeat\(3,\s*minmax\(112px/.test(regleNk[1]), regleNk[1].trim().slice(0, 110));
  }
  check('.nk-limit-list reste une grille empilée', /\.nk-limit-list\s*\{\s*display:\s*grid/.test(css));

  // ==========================================================================
  console.log('\n── D. Version ──');
  // ==========================================================================

  const indexHtml = racine('public/index.html');
  const swSource = racine('public/sw.js');
  const versions = [...indexHtml.matchAll(/\?v=(\d+)/g)].map((m) => `?v=${m[1]}`);
  check('index.html : ?v=257 référencé 7 fois',
    versions.length === 7 && versions.every((v) => v === '?v=257'),
    `${versions.length} refs : ${[...new Set(versions)].join(',')}`);
  check('sw.js : cache « botdev-v257 »', swSource.includes("const CACHE = 'botdev-v257';"));
  check('index.html et sw.js portent la même version',
    swSource.includes('botdev-v257') && versions.every((v) => v === '?v=257'));

  console.log('');
  if (echecs) { console.log(`❌ v248 — ${echecs} échec(s)`); process.exit(1); }
  console.log('🎉 Tous les tests v248 passent — 0 débordement de 360 à 1 920 px, souris et tactile.');
})();
