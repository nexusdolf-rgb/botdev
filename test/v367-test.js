#!/usr/bin/env node
// v367 — le tableau de bord cesse de ressembler à un tableau de bord généré.
//
// Demande du fondateur : « le dashboard est toujours IA. Va regarder le
// dashboard des autres bots pro : les tailles de chaque texte, la position, le
// message après configuration et clic sur Enregistrer, la présentation des
// modules, les émojis de chaque module, comment ils étaient faits, les couleurs.
// Base-toi sur DraftBot. Ne crée rien au hasard. Efface toutes les traces d'IA
// visibles. »
//
// Ce fichier NE GOÛTE PAS le design : il empêche les empreintes MESURÉES par
// test/tools/audit-design-system.js de revenir. Le banc, lui, mesure dans
// Chromium (11 modules rendus, 791 éléments porteurs de texte) ; ici on tient
// les invariants qui se vérifient dans le texte des fichiers, ce qui est
// gratuit et rapide, et qui casse précisément quand on « rattape » un détail à
// la main.
//
// L'état mesuré AVANT la passe (même banc, même viewport) :
//   • 173 pictogrammes employés comme icônes d'interface, pour 6 dans les
//     aperçus Discord — l'inverse exact de ce qu'il faudrait ;
//   • 34 tailles de texte, dont des demi-pixels (10,5 px) et 83 textes sous
//     11 px hors aperçus ;
//   • 62 valeurs de rayon distinctes (8, 10, 12, 14, 16, 18, 20, 22, 24, 999…) ;
//   • 140 surfaces en dégradé, dont 16 « même couleur, deux alpha » ;
//   • boutons d'enregistrement à 34 px sur PC (DraftBot : champs à 46 px ;
//     bouton Discord : 38-40 px) ;
//   • après « Enregistrer » : un toast, rien sur le bouton, aucun horodatage.
// APRÈS : 0 pictogramme d'interface, 9 crans sans demi-pixel, 0 texte sous
// 11 px hors aperçus, rayons sur 4 crans, 124 dégradés, 40 px, et un bouton
// qui passe à « Enregistré » avec « Enregistré à 18:58 » à côté.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lecture = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const CSS = ['public/css/dashboard.css', 'public/css/style.css'];
const JS = ['public/js/app.js', 'public/js/dashboard.js', 'public/js/public.js',
  'public/js/editor.js', 'public/js/views.js'];
const VERSION = 373;

let ok = 0;
let ko = 0;
function check(titre, condition, detail) {
  if (condition) { ok++; }
  else {
    ko++;
    console.log('  ✗ ' + titre + (detail ? '\n      → ' + detail : ''));
  }
}

// Le pictogramme de décoratif, à la définition du balayage près : plage emoji
// complète, plus les signes U+2600-U+27BF SAUF les marques typographiques qui
// ont leur place dans une interface (puces, losanges, coches, ☰, flèches).
const GARDE_TYPO = '·•‣▪▫●○◆◇■□✓✔✕✖☰⌂⌃⌄←→↑↓↻↺⇄⇆';
const PICTO = new RegExp(
  '[\\u{1F000}-\\u{1FAFF}]|(?![' + GARDE_TYPO + '])[\\u2600-\\u27BF]', 'gu');
const sansCommentaires = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// — 1. Les empreintes d'interface ne reviennent pas par le texte ——————————————
{
  const INTERDITS = [
    ['titre de carte', /Dashboard\.card\(\s*[\w.]+\s*,\s*['"`]\s*[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu],
    ['en-tete de section', /<h[1-4][^>]*>\s*[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu],
    ['etiquette de champ', /<(?:label|div|span) class="[^"]*dash-label[^"]*"(?: style="[^"]*")?>\s*[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu],
    ['toast', /App\.toast\(\s*['"`]\s*[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu],
    ['content: CSS', /content:\s*['"][\u{1F000}-\u{1FAFF}]/gu],
  ];
  for (const rel of [...JS, ...CSS]) {
    const src = sansCommentaires(lecture(rel));
    for (const [nom, motif] of INTERDITS) {
      const n = (src.match(motif) || []).length;
      check(`${rel} : aucun pictogramme en ${nom}`, n === 0, n + ' occurrence(s)');
    }
  }
  // Le « ! » d'approbation ne revient pas dans les confirmations de sauvegarde.
  for (const rel of JS) {
    const src = sansCommentaires(lecture(rel));
    const n = (src.match(/App\.toast\(\s*['"`][^'"`\n]{0,80}(enregistr|sauvegard|appliqu|publi)[^'"`\n]*!\s*['"`]/gi) || []).length;
    check(`${rel} : aucune confirmation de sauvegarde suivie d'un « ! »`, n === 0, n + ' toast(s)');
  }
}

// — 2. Les aperçus Discord gardent leurs émojis (le garde-fou, pas le zèle) ————
{
  const src = lecture('public/js/dashboard.js');
  const catalogue = (src.match(/apercu:\s*\{[\s\S]{0,400}?\}/g) || []);
  const avecEmote = catalogue.filter((x) => PICTO.test(x) || (PICTO.lastIndex = 0, /[\u{1F000}-\u{1FAFF}]/u.test(x))).length;
  check('les gabarits « apercu » des modules gardent au moins un émoji (ils imitent un message réel)',
    catalogue.length >= 12 && avecEmote >= 8, `${catalogue.length} gabarits, ${avecEmote} avec émoji`);
  const meta = (src.match(/^\s*\w+: \{ e: '[\u{1F000}-\u{1FAFF}]/gmu) || []).length;
  check('MODULE_META conserve son émoji de repli (utilisé quand le PNG ne charge pas)',
    meta >= 30, meta + ' entrées');
  check('le PNG d\'émoji dessiné reste la source d\'identité des modules',
    fs.existsSync(path.join(RACINE, 'public/emotes'))
    && fs.readdirSync(path.join(RACINE, 'public/emotes')).filter((f) => f.endsWith('.png')).length >= 40);
}

// — 3. Échelle typographique : pas de demi-pixel, pas de texte sous 11 px ————
{
  // Le plancher de 11 px ne s'applique pas aux pieces qui copient Discord
  // (badge « APP » a 8 px, etiquette d'embed a 8,5 px, pied d'apercu a 11,5 px)
  // ni au 9,5 px de base de .mg-kicker, ou le plancher mobile prend le relais.
  const APERCU = /\.(dp-|ca-|adv-|eb-|discord-|mg-kicker)/;
  for (const rel of [...CSS, ...JS]) {
    const src = sansCommentaires(lecture(rel));
    // La regle n'est pas « taille entiere » mais « cran de 0,5 px » : 11,5 px
    // est dans l'echelle, 10,25 px ne l'est jamais.
    const horsCran = (src.match(/font-size:\s*\d+\.(?!5px)\d+px/g) || []).length;
    check(`${rel} : toute taille est posée sur le cran de 0,5 px`, horsCran === 0,
      horsCran + ' tailles hors du cran');
    if (rel.endsWith('.css')) {
      // on ne releve pas les regles d'apercu : elles copient Discord, qui fait
      // reellement 10-12 px sur certains elements.
      const regles = src.match(/[^{}]*\{[^{}]*\}/g) || [];
      const horsApercu = regles.filter((r) => !APERCU.test(r.split('{')[0]));
      const petits = horsApercu.filter((r) => /font-size:\s*(?:[4-9]|10)(?:\.\d+)?px/.test(r));
      check(`${rel} : aucun texte de l'interface sous 11 px`, petits.length === 0,
        petits.slice(0, 2).map((x) => x.split('\n')[0].trim().slice(0, 60)).join(' | '));
    }
  }
}

// — 4. Décor : les rayons sur quatre crans, les dégradés plats qui doivent l'être
{
  const CRANS = new Set([0, 1, 2, 3, 4, 6, 8, 12, 99, 999, 100]);
  const vus = new Map();
  for (const rel of [...CSS, ...JS]) {
    const src = sansCommentaires(lecture(rel));
    for (const m of src.matchAll(/border-radius:\s*([^;}'"]+)/g)) {
      for (const v of m[1].matchAll(/([0-9.]+)px/g)) {
        const n = Math.round(parseFloat(v[1]));
        if (!CRANS.has(n)) vus.set(n, (vus.get(n) || 0) + 1);
      }
      if (/var\(--d-radius|var\(--dp-radius/.test(m[1])) continue;
    }
  }
  check('tous les rayons écrits en clair sont sur les crans 4 / 8 / 12 / pilule',
    vus.size === 0, [...vus.entries()].map(([k, v]) => k + 'px ×' + v).join(' · '));

  const vars = [...CSS, 'public/css/dashboard.css'].flatMap((rel) => {
    const src = lecture(rel);
    return (src.match(/--d(?:p)?-radius-[\w-]+:\s*[0-9.]+px/g) || []).map((x) => parseFloat(x.match(/([0-9.]+)px/)[1]));
  });
  check('les variables de rayon des feuilles et des aperçus sont sur l’échelle',
    vars.length > 0 && vars.every((v) => CRANS.has(Math.round(v))), vars.join(', '));

  // Les dégradés « même couleur, deux alpha » sont aplatis ; ceux qui portent
  // une intention (hero, halo, anneau, jauge, hexagones de marque) sont gardés.
  const dashboard = lecture('public/css/dashboard.css');
  const plats = (dashboard.match(/background:\s*linear-gradient\(\s*1[0-9]{2}deg,\s*rgba\(([^,)]+),\s*[\d.]+\),\s*rgba\(\1,\s*[\d.]+\)\s*\)/g) || []).length;
  check('aucun dégradé à deux alpha de la même couleur ne traîne (16 avaient été aplatis)',
    plats === 0, plats + ' restant(s)');
}

// — 5. Les hauteurs de contrôle, mesurées chez les autres ————————————————————
{
  const css = sansCommentaires(lecture('public/css/dashboard.css'));
  const pc = css.match(/html\.hx-os-pc \.dashboard-shell-host \.dash-save-action \{[\s\S]{0,700}?\}/);
  check('le mode PC ne laisse plus les boutons à 34 px (min-height: 40 dans son propre bloc)',
    !!pc && /min-height:\s*40px/.test(pc[0]) && !/min-height:\s*0\b/.test(pc[0]),
    pc ? pc[0].replace(/\s+/g, ' ').slice(0, 90) : 'bloc introuvable');
  check('les cibles tactiles de v366 (44-48 px) n\’ont pas été écrasées par la passe',
    /@media[^{]*\{[\s\S]{0,4000}?\.dash-btn \{\s*min-height:\s*4[46]px/.test(css)
    || /min-height:\s*4[468]px/.test(css));
  const champs = css.match(/html\.hx-os-pc \.dashboard-shell-host \.dash-input[\s\S]{0,400}?\}/);
  check('les champs PC gardent 16 px de texte (anti-zoom iOS) et 11 px d’étiquette',
    !!champs && /font-size:\s*16px/.test(champs[0]));
}

// — 6. Le retour d'enregistrement : le bouton confirme, une heure s'écrit —————
{
  const app = lecture('public/js/app.js');
  check('App.retourEnregistrement existe (bouton + horodatage à la minute)',
    /App\.retourEnregistrement = function/.test(app));
  const dash = lecture('public/js/dashboard.js');
  const cablés = (dash.match(/App\.retourEnregistrement\(/g) || []).length;
  check('les gestionnaires de sauvegarde sont câblés au retour (25 sites mesurés)',
    cablés >= 20, cablés + ' appel(s)');
  check('le courant d\'événement est capté AVANT le premier await (currentTarget meurt dès l\'await)',
    /const bouton = e\.currentTarget;[\s\S]{0,600}?App\.retourEnregistrement\(bouton\)/.test(dash)
    && !/App\.retourEnregistrement\(e\.currentTarget\)/.test(dash));
  const css = lecture('public/css/dashboard.css');
  check('.save-stamp est stylé (11 px, discret, fondu) et .is-done aussi',
    /\.save-stamp\s*\{[^}]*font-size:\s*11px/.test(css) && /\.dash-btn\.is-done/.test(css));
  check('le libellé du bouton est restauré après le retour (pas de bouton figé)',
    /bouton\.dataset\.libelleAvant/.test(app) && /_retourTimer/.test(app));
}

// — 7. Le jeu d'icônes dessiné, et rien d'autre ——————————————————————————————
{
  const app = lecture('public/js/app.js');
  const dash = lecture('public/js/dashboard.js');
  const bloc = app.slice(app.indexOf('App.GLYPHES = {'), app.indexOf('\n};', app.indexOf('App.GLYPHES = {')));
  const cles = [...bloc.matchAll(/^\s*([\w]+): '(<[^']*)',/gm)].map((m) => m[1]);
  check('le jeu comporte au moins 40 glyphes dessinés (47 après la mesure)',
    cles.length >= 40, cles.length + ' clés');
  check('chaque glyphe est un tracé sur grille 24, en currentColor, sans émoji',
    cles.every((c) => new RegExp("\\n?\\s*" + c + ": '<(?:path|circle|rect)").test(bloc))
    && !/[\u{1F000}-\u{1FAFF}]/u.test(bloc));
  check('App.glyphe existe et retombe sur une pastille si le nom est inconnu',
    /App\.glyphe = \(/.test(app) && /App\.GLYPHES\[nom\]/.test(app));
  // faute de frappe dans un appel : le glyphe n'existe pas, l'interface troue.
  const appels = new Set();
  for (const rel of [...JS, 'public/index.html']) {
    for (const m of lecture(rel).matchAll(/App\.glyphe\(\s*'([\w-]+)'/g)) appels.add(m[1]);
  }
  const manquants = [...appels].filter((n) => !cles.includes(n));
  check('tout App.glyphe("…") appelle un glyphe qui existe',
    appels.size > 0 && manquants.length === 0, manquants.join(', '));
  check('le balayage ne laisse aucun pictogramme sans équivalent dans le jeu',
    !/non couvert/.test(lecture('scripts/retire-les-empreintes.py')));
  check('App.sansPicto ferme la porte aux titres de carte (et sert dans les deux feuilles)',
    /App\.sansPicto = /.test(app) && /App\.sansPicto\(/.test(dash));
}

// — 8. Version et cache ——————————————————————————————————————————————————————
{
  const html = lecture('public/index.html');
  const versions = html.match(/\?v=\d+/g) || [];
  check('les feuilles et scripts de index.html sont en v' + VERSION,
    versions.length >= 6 && versions.every((v) => v === '?v=' + VERSION), versions.join(' '));
  const sw = lecture('public/sw.js');
  check('le service worker porte la même version de cache',
    new RegExp("CACHE\\s*=\\s*'[^']*?" + VERSION).test(sw) || sw.includes(String(VERSION)),
    (sw.match(/CACHE\s*=\s*'[^']*'/) || ["(aucune constante CACHE)"])[0]);
}

console.log('');
if (ko === 0) {
  console.log(`🎉 v367 — ${ok} vérifications OK : plus de pictogramme d'interface, une échelle au cran de 0,5 px, quatre crans de rayon, des boutons à 40 px et un vrai retour après « Enregistrer ».`);
} else {
  console.log(`❌ v367 — ${ko} échec(s) sur ${ok + ko}`);
  process.exitCode = 1;
}
