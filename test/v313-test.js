// v313 — Sélecteurs des modules (après choix du serveur) façon DraftBot :
// libellé au-dessus, barre pleine largeur, menu aussi large que le champ.
// Interrupteurs inchangés. Mobile + PC : aucun débordement.
// Ne touche PAS aux pieds Discord (v312) ni à SETTING_ROW_PLEINE_LARGEUR (v248).
'use strict';
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const js = racine('public/js/dashboard.js');
const css = racine('public/css/dashboard.css');
const html = racine('public/index.html');
const sw = racine('public/sw.js');

console.log('— 1. Pins de version v313 —');
check('index.html : ?v=316 ×7', (html.match(/\?v=316/g) || []).length === 7, String((html.match(/\?v=\d+/g) || []).slice(0, 8)));
check('sw.js : cache botdev-v316', sw.includes("const CACHE = 'botdev-v316';"));
check('index.html : plus aucune ?v=312', !html.includes('?v=312'));
check('sw.js : plus de botdev-v312', !sw.includes('botdev-v312'));

console.log('— 2. Menu déroulant : plus de plafond 360 px —');
check('plus de Math.min(width, 360)', !js.includes('Math.min(width, 360)'));
check('le menu suit la largeur du déclencheur (maxW = fenêtre − 20)', js.includes('const maxW = Math.max(236, (window.innerWidth || 1200) - 20)'));
check('commentaire v313 présent dans dropdownMenu', js.includes('v313 — le menu a la MÊME largeur que le sélecteur'));
check('feuille mobile conservée', js.includes("panel.classList.add('is-sheet')") && css.includes('.dd-panel.is-sheet'));

console.log('— 3. CSS v313 : pile + pleine largeur, interrupteurs indemnes —');
check('couche « v313 — Sélecteurs des modules » présente', css.includes('v313 — Sélecteurs des modules (après choix du serveur)'));
check('setting-row empilée SAUF interrupteur', css.includes('.setting-row:not(:has(> label.switch))'));
check('la couche v159 des lignes existe toujours', css.includes('🧷 Lignes de réglage façon Discord/DraftBot (v159)'));
check('repli mobile 700 px conservé', css.includes('@media (max-width: 700px)'));
check('déclencheur ≥ 44 px', css.includes('.dashboard-shell-host .dd-trigger') && css.includes('min-height: 44px'));
check('panneau borné à la fenêtre', css.includes('max-width: calc(100vw - 20px)'));
check('hx-os-pc n\'est pas retiré', css.includes('html.hx-os-pc'));

console.log('— 4. Multi-sélecteur : puces + « ＋ » dans la même barre —');
{
  const iPicker = js.indexOf('discord-multi-picker');
  const slice = iPicker >= 0 ? js.slice(iPicker, iPicker + 280) : '';
  const iVal = slice.indexOf('discord-multi-values');
  const iBtn = slice.indexOf('dd-add-btn');
  check('HTML : valeurs AVANT le bouton ＋', iVal >= 0 && iBtn >= 0 && iVal < iBtn, 'val=' + iVal + ' btn=' + iBtn);
}
{
  const bloc = css.slice(css.indexOf('v313 — Sélecteurs des modules'));
  check('CSS : discord-multi-picker en ligne (flex-direction: row)', /discord-multi-picker \{[\s\S]*flex-direction:\s*row/.test(bloc));
  check('bouton ＋ en pastille (border-radius: 999px) dans la barre', /discord-multi-picker \.dd-add-btn \{[\s\S]*border-radius:\s*999px/.test(bloc));
}

console.log('— 5. Non-régression v248 / v312 —');
check('SETTING_ROW_PLEINE_LARGEUR conserve .dash-channelsmulti', js.includes("SETTING_ROW_PLEINE_LARGEUR = '.dash-channelsmulti, .nk-limit-list'"));
check('SETTING_ROW_PLEINE_LARGEUR conserve .nk-limit-list', js.includes('.nk-limit-list'));
check('layoutSettingRows toujours branché', js.includes('Dashboard.layoutSettingRows'));
check('v312 : le moteur n\'injecte plus footer: DEFAULT_FOOTER', !/footer:\s*DEFAULT_FOOTER/.test(racine('server/discord/ui.js')));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v313 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
