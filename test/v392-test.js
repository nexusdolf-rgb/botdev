#!/usr/bin/env node
// v392 — retour à la palette d'origine + les trois défauts du panneau vocal.
//
// 1) PALETTE. La refonte avait dérivé vers un noir neutre (#0b0b0d / #121214).
//    La palette d'origine, mesurée sur une capture de production d'avant la
//    refonte (prod-v381 : #36393F dominant, panneaux #2B2D31, accent #E07A5F),
//    est restaurée et ne doit plus bouger.
//
// 2) PANNEAU VOCAL. Trois défauts constatés dans le code :
//    a. la légende DESSINÉE n'avait aucun texte alternatif — les dix boutons
//       n'ont pas de libellé (style TempVoice), un lecteur d'écran n'annonçait
//       donc rien d'utile ;
//    b. la légende TEXTE de secours était inatteignable : elle ne servait que
//       si le PNG manquait sur le disque. Si Discord refusait la pièce jointe,
//       la seconde tentative réexpédiait la même image et échouait pareil ;
//    c. aucune réponse différée, et le panneau était supprimé AVANT que le
//       nouveau soit envoyé : au-delà de 3 s ou en cas d'échec d'envoi, le
//       serveur se retrouvait sans panneau.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const lecture = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

const CSS = lecture('public/css/dashboard.css');
const UI = lecture('server/discord/ui.js');
const EXTRA = lecture('server/discord/extra.js');

let ok = 0;
let ko = 0;
function check(titre, condition, detail) {
  if (condition) { ok++; }
  else {
    ko++;
    console.log('  ✗ ' + titre + (detail ? '\n      → ' + detail : ''));
  }
}

// — 1. Palette d'origine ————————————————————————————————————————————————————————
check('sombre : fond #36393f (valeur mesurée sur la production d\'avant refonte)',
  CSS.includes('--ui-bg: #36393f;'));
check('sombre : panneaux #2b2d31',
  CSS.includes('--ui-surface: #2b2d31;'));
check('clair : fond #f2f3f8 (valeur d\'origine --d-bg)',
  CSS.includes('--ui-bg: #f2f3f8;'));
check('clair : panneaux #ffffff',
  CSS.includes('--ui-surface: #ffffff;'));
check('accent terracotta inchangé',
  CSS.includes('--ui-accent: var(--d-accent, #e07a5f);'));
check('aucune trace du noir neutre de la refonte',
  !CSS.includes('#0b0b0d') && !CSS.includes('#121214') && !CSS.includes('#1a1a1d'));
check('la zone principale suit le jeton, sans valeur figée',
  CSS.includes('.dashboard-shell-host .dash-main { background: var(--ui-bg) !important; }'));

// — 2a. Texte alternatif de la légende ——————————————————————————————————————————
check('ui.js : imageDescription acceptée',
  UI.includes('if (options.imageDescription) item.setDescription('));
check('ui.js : description bornée à la limite Discord',
  UI.includes('.slice(0, 1024)'));
check('panneau vocal : les dix noms sont écrits dans le texte alternatif',
  /imageDescription: 'Légende des boutons : NOM, LIMITE, PRIVÉ, PUBLIC, RÉCUPÉRER, AJOUTER, RETIRER, EXPULSER, TRANSFÉRER, SUPPRIMER\.'/.test(EXTRA));

// — 2b. Légende de secours atteignable ————————————————————————————————————————
check('buildVtPanel : option sansLegende',
  EXTRA.includes("!options.sansLegende && fs.existsSync(legendeFichier)"));
// v394 — il n'y a plus de seconde tentative en unicode : la seule raison de
// réessayer est l'image. On repart sans elle, émojis dessinés intacts.
check('seconde tentative : sans image, émojis dessinés conservés',
  EXTRA.includes('buildVtPanel(botId, guild, { sansLegende: true })'));
check('plus aucun repli unicode dans l’envoi',
  !EXTRA.includes('sansEmoji: true, sansLegende: true'));

// — 2c. Envoi avant suppression ————————————————————————————————————————————————
const iSend = EXTRA.indexOf('msg = await channel.send(buildVtPanel(botId, guild));');
const iDel = EXTRA.indexOf('await ancien.delete();');
check('le nouveau panneau part AVANT que l\'ancien soit supprimé',
  iSend > 0 && iDel > iSend, `envoi@${iSend} suppression@${iDel}`);
check('l\'ancien message est récupéré, plus supprimé d\'emblée',
  EXTRA.includes('ancien = await channel.messages.fetch(cfg.panel_message);'));

// — 2d. Réponse différée ————————————————————————————————————————————————————————
check('handleVtInteraction : differe avant les appels Discord',
  EXTRA.includes('await i.deferReply({ ephemeral: true })') && EXTRA.includes('let differe = false;'));
check('la réponse passe par editReply quand c\'est différé',
  EXTRA.includes('if (differe && typeof i.editReply === \'function\')'));
check('les mocks sans deferReply restent compatibles',
  EXTRA.includes("if (typeof i.deferReply !== 'function' || i.deferred || i.replied) return;"));
check('PRIVÉ et PUBLIC diffèrent avant de toucher aux permissions',
  /act === 'lock'\) \{\s*\n\s*await differer\(\);/.test(EXTRA) &&
  /act === 'unlock'\) \{\s*\n\s*await differer\(\);/.test(EXTRA));
check('renommer et limite diffèrent dans la fenêtre, pas avant de l\'ouvrir',
  EXTRA.includes('await differer();\n        await channel.setName(') &&
  EXTRA.includes('await differer();\n        await channel.setUserLimit(') &&
  !/i\.showModal\(modal\);\s*(\n\s*)?\/\/ diff/.test(EXTRA));
check('aucun reply nu ne subsiste dans le gestionnaire du panneau vocal',
  !EXTRA.includes('await i.reply({ ...ui.v2panel({ color: \'#e07a5f\', title: \'🔑'));

console.log('');
if (ko === 0) {
  console.log(`🎉 v392 — ${ok} vérifications OK : palette d'origine restaurée (#36393F / #2B2D31), légende du panneau vocal accessible et secourue, panneau remplacé sans trou, réponses différées.`);
} else {
  console.log(`❌ v392 — ${ko} échec(s) sur ${ok + ko}`);
  process.exitCode = 1;
}
