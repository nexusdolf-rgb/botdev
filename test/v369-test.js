// ============================================================
// v369 — retrait du mécanisme d'inactivité des tickets (demande du 17/10) :
// plus de rappel « ticket bientôt fermé », plus de fermeture automatique à 2 h,
// plus de suppression à 24 h. Le ménage utile est conservé (réparation des
// autorisations et du placement, fiches orphelines oubliées).
// ------------------------------------------------------------
// Ce banc vérifie le source ET le rendu du texte du panneau : une promesse
// effacée du code mais encore affichée aux utilisateurs serait le pire résultat.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const RACINE = path.join(__dirname, '..');
const lus = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const i18n = require('../server/i18n');

let echecs = 0, total = 0;
const check = (label, ok, detail) => {
  total++;
  if (ok) { console.log('  ✅ ' + label); return; }
  echecs++;
  console.log('  ❌ ' + label + (detail !== undefined ? ' — ' + String(detail).slice(0, 120) : ''));
};

const VERSION = 372;
const panels = lus('server/discord/panels.js');
const taches = lus('server/discord/tasks.js');
const texte = lus('server/i18n.js');

console.log('— 1. Version —');
const html = lus('public/index.html');
check(`index.html : ?v=${VERSION} référencé 7 fois`, (html.match(/\?v=372/g) || []).length === 7, (html.match(/\?v=372/g) || []).length);
check('le service worker porte la même version de cache', lus('public/sw.js').includes("const CACHE = 'botdev-v372';"));
check('aucun fichier de public/js ne cite une version périmée',
  fs.readdirSync(path.join(RACINE, 'public/js')).filter((f) => f.endsWith('.js'))
    .every((f) => !/\?v=36[0-8]\b/.test(lus('public/js/' + f))), 'public/js');

console.log('— 2. Le mécanisme est bien retiré —');
check('panels.js ne connaît plus la balayeuse d’inactivité',
  !/sweepInactiveTickets|INACTIVE_CLOSE_MIN|INACTIVE_WARN_BEFORE_MIN|CLOSED_DELETE_AFTER_MIN/.test(panels));
check('l’entretien des tickets existe et remplace l’ancien appel',
  /async function sweepTickets\(botId, entry\)/.test(panels)
  && /sweepTickets,/.test(panels)
  && /panels\.sweepTickets\(botId, entry\)/.test(taches)
  && !/sweepInactiveTickets/.test(taches));
check('aucun titre de relance ne subsiste dans les panneaux',
  !/Ticket bientôt fermé|Ticket fermé automatiquement|Ticket supprimé automatiquement/.test(panels));
check('les trois textes i18n sont partis des deux langues',
  ['ticket_auto_warn', 'ticket_auto_closed', 'ticket_auto_deleted']
    .every((k) => !new RegExp('^\\s+' + k + ':', 'm').test(texte)
      && i18n.t('fr', k) === k && i18n.t('en', k) === k));

console.log('— 3. Le panneau ne promet plus ce qui n’existe plus —');
const fr = i18n.panelTexts('fr').rules, en = i18n.panelTexts('en').rules;
check('règles par défaut : trois puces, aucune d’inactivité',
  fr.length === 3 && en.length === 3
  && !fr.concat(en).some((r) => /inactif|inactive|supprim/i.test(r)), fr.join(' | '));
check('le filtre des règles saisies est branché sur l’affichage',
  /const reglesSaisies = rulesCustom/.test(panels)
  && /inactifs\? pendant\|inactifs\? after\|sans activité depuis/.test(panels)
  && /reglesSaisies\.length \? reglesSaisies\.slice\(0, 15\) : P\.rules/.test(panels));
// Le rendu réel plutôt que la lecture du source : c’est le panneau du client qui compte.
const rendu = JSON.stringify(require('../server/discord/panels').buildTicketPanel(
  // `panel_texts` est une carte JSON (cfg « Textes des panneaux » du dashboard).
  { message: '', panel_texts: JSON.stringify({ rules: '• Une règle écrite par le staff\n• Les tickets inactifs pendant 2 heures seront automatiquement fermés puis supprimés.' }) },
  null, [], 'Serveur Test', 'G369', []));
check('un panneau enregistré avant ne promet plus la fermeture automatique',
  !/inactifs pendant 2 heures/.test(rendu) && rendu.includes('Une règle écrite par le staff'));
check('le placeholder du dashboard ne remet pas la 4e puce',
  !lus('public/js/dashboard.js').includes('Les tickets inactifs pendant 2 heures'));

console.log('— 4. Ce qui devait rester est intact —');
check('fermeture manuelle, transcription et note gardent leurs fonctions',
  ['handleTicketDeleteAsk', 'sendTranscriptDm', 'buildTranscriptFromChannel', 'sendRatingDm', 'lockTicketOpenerWrite']
    .every((n) => new RegExp(n + ',').test(panels)), 'exports');
check('la réparation des salons de tickets est toujours appelée',
  /repairTicketChannel\(botId, guild, channel, row\)/.test(panels));
check('le champ d’activité est toujours tenu à jour (utilisé ailleurs)',
  /last_activity/.test(lus('server/db.js')));

console.log('\nRésultat : ' + (total - echecs) + ' ✅ / ' + echecs + ' ❌ sur ' + total + ' vérifications');
if (echecs) { console.log('❌ v369 — ' + echecs + ' échec(s)'); process.exit(1); }
console.log('🎉 v369 — le silence est d’or : aucun ticket ne se fermera plus tout seul.');
