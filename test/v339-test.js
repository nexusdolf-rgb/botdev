// v339 — « Prendre ce ticket » : le bouton devient « Responsable : @staff » sur le panneau.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(require('node:os').tmpdir(), 'hoxera-v339-' + process.pid + '-' + Date.now());
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
const i18nSrc = racine('server/i18n.js');

console.log('— 1. Pins v339 —');
check('index.html : ?v=378 ×7', (html.match(/\?v=378/g) || []).length === 7);
check('sw.js : cache botdev-v378', sw.includes("const CACHE = 'botdev-v378';"));
check('index.html : plus aucune ?v=338', !html.includes('?v=338'));

console.log('— 2. Même panneau, pas un second message —');
// v379 — le bouton est grisé sur place et la ligne « Statut » du panneau est
// réécrite ; l'annonce « s'occupe désormais de ce ticket » est une carte
// demandée par l'utilisateur (captures du 22/10).
check('bouton « Pris en charge » dans la carte', panels.includes("ticket_claim_btn"));
check('le bouton est grisé sur le même message', panels.includes('removeClaimButton') && panels.includes('disabled: true'));
check('la ligne Statut est réécrite sur le même message',
  panels.includes('function replaceClaimButtonJson') && panels.includes('(?:Statut|Status)'));
check('mention sans ping sur l’édition', panels.includes('allowedMentions') && panels.includes('parse: []'));
check('i18n FR de la carte', i18nSrc.includes("ticket_card_status_claimed: 'pris en charge par {staff}'"));
check('i18n EN de la carte', i18nSrc.includes("ticket_card_status_claimed: 'claimed by {staff}'"));

console.log('— 3. Transformation JSON —');
const { __testReplaceClaimButtonJson: replace } = require('../server/discord/panels');
const claimId = 'bd-tmenu:1:claim';
const tree = [{
  type: 17,
  components: [
    { type: 10, content: '👤 **Ouvert par :** <@1>\n⏳ **Statut :** en attente' },
    { type: 1, components: [{ type: 3, custom_id: 'bd-troom:1' }] },
    { type: 1, components: [{ type: 2, custom_id: claimId, label: 'Prendre ce ticket' }] },
  ],
}];
const out = replace(tree, claimId, '⏳ **Statut :** pris en charge par <@42>');
const flat = JSON.stringify(out);
check('le bouton est conservé mais grisé', flat.includes(claimId) && flat.includes('"disabled":true'));
check('la ligne Statut est réécrite', flat.includes('pris en charge par <@42>'));
check('le menu staff est intact', flat.includes('bd-troom:1'));

const changelog = require('../server/discord/changelog');
check('VERSION ≥ 339', changelog.VERSION >= 339);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v339 : ' + ok + ' vérifications passed.');
