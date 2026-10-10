// v333 — Ticket : bouton « Prendre ce ticket », max caractères par question, ping bienvenue.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(require('node:os').tmpdir(), 'hoxera-v333-' + process.pid + '-' + Date.now());
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const panels = racine('server/discord/panels.js');
const events = racine('server/discord/events.js');
const dash = racine('public/js/dashboard.js');
const dbSrc = racine('server/db.js');

console.log('— 1. Pins de version v333 —');
check('index.html : ?v=360 ×7', (html.match(/\?v=360/g) || []).length === 7);
check('sw.js : cache botdev-v360', sw.includes("const CACHE = 'botdev-v360';"));
check('index.html : plus aucune ?v=332', !html.includes('?v=332'));

console.log('— 2. Prendre ce ticket = bouton, plus dans le menu —');
check('plus d’option claim dans le menu staff', !panels.includes("setValue('claim')"));
check('bouton « Prendre ce ticket »', panels.includes("setLabel('🖐️ Prendre ce ticket')") && panels.includes('bd-tmenu:${botId}:claim'));
check('le bouton disparaît après prise', panels.includes('removeClaimButton') && panels.includes('stripClaimButtonJson'));
check('plus de gros panneau dans le salon (ticket_claim_msg)', !panels.includes('ticket_claim_msg'));
check('prise en charge câblée', panels.includes('handleTicketClaim') && panels.includes('claimed_by'));

console.log('— 3. Caractères max par question —');
const store = require('../server/db');
check('cleanTicketQuestions exporté', typeof store.cleanTicketQuestions === 'function');
const cleaned = store.cleanTicketQuestions(['Ancien texte', { text: 'Nouveau', max: 80 }, { q: 'Alias', maxLength: 9000 }, '']);
check('chaîne → { text, max: 500 }', cleaned[0] && cleaned[0].text === 'Ancien texte' && cleaned[0].max === 500);
check('objet max 80 conservé', cleaned[1] && cleaned[1].text === 'Nouveau' && cleaned[1].max === 80);
check('max plafonné à 4000', cleaned[2] && cleaned[2].max === 4000);
check('vide ignoré', cleaned.length === 3);
check('modale utilise questionMax', panels.includes('setMaxLength(questionMax(q))') || panels.includes('.setMaxLength(questionMax('));
check('dashboard : champ max par question', dash.includes('data-qmax') && dash.includes('Caractères max'));

console.log('— 4. Bienvenue : ping du membre —');
check('panneau V2 : mention en tête', events.includes('content: memberPing') && events.includes('allowedMentions: mentionOpts'));
check('texte simple : ping si absent du message', events.includes('const ping = `<@${member.id}>`'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v333 : ' + ok + ' vérifications passed.');
process.exit(0);
