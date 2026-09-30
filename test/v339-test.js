// v339 — « Prendre ce ticket » : le bouton devient « Responsable : @staff » sur le panneau.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v339');
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
check('index.html : ?v=344 ×7', (html.match(/\?v=344/g) || []).length === 7);
check('sw.js : cache botdev-v344', sw.includes("const CACHE = 'botdev-v344';"));
check('index.html : plus aucune ?v=338', !html.includes('?v=338'));

console.log('— 2. Même panneau, pas un second message —');
check('bouton Prendre ce ticket inchangé', panels.includes("setLabel('🖐️ Prendre ce ticket')"));
check('le bouton disparaît toujours', panels.includes('removeClaimButton') && panels.includes('stripClaimButtonJson'));
check('plus de ligne « s\'occupe de ce ticket »', !panels.includes("s'occupe de ce ticket"));
check('remplace le bouton par un TextDisplay', panels.includes('function replaceClaimButtonJson') && panels.includes('type: 10'));
check('pas d’envoi channel.send après claim', !/removeClaimButton\([\s\S]{0,180}channel\.send/.test(panels));
check('mention sans ping', panels.includes('allowedMentions') && panels.includes('parse: []'));
check('i18n FR court', i18nSrc.includes("ticket_claim_line: 'Responsable : {staff}'"));
check('i18n EN', i18nSrc.includes("ticket_claim_line: 'Handled by {staff}'"));

console.log('— 3. Transformation JSON —');
const { __testReplaceClaimButtonJson: replace } = require('../server/discord/panels');
const claimId = 'bd-tmenu:1:claim';
const tree = [{
  type: 17,
  components: [
    { type: 10, content: 'Ticket ouvert' },
    { type: 1, components: [{ type: 3, custom_id: 'bd-troom:1' }] },
    { type: 1, components: [{ type: 2, custom_id: claimId, label: 'Prendre ce ticket' }] },
  ],
}];
const out = replace(tree, claimId, 'Responsable : <@42>');
const flat = JSON.stringify(out);
check('le bouton a disparu', !flat.includes(claimId));
check('la ligne responsable est à la place', flat.includes('"type":10') && flat.includes('Responsable : <@42>'));
check('le menu staff est intact', flat.includes('bd-troom:1'));

const changelog = require('../server/discord/changelog');
check('VERSION ≥ 339', changelog.VERSION >= 339);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v339 : ' + ok + ' vérifications passed.');
