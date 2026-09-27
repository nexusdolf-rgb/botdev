// v334 — /update : panneau public de version, fondateur uniquement.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v334');
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
const extra = racine('server/discord/extra.js');
const clSrc = racine('server/discord/changelog.js');

console.log('— 1. Pins de version v334 —');
check('index.html : ?v=335 ×7', (html.match(/\?v=335/g) || []).length === 7);
check('sw.js : cache botdev-v335', sw.includes("const CACHE = 'botdev-v335';"));
check('index.html : plus aucune ?v=333', !html.includes('?v=333'));

console.log('— 2. Commande /update enregistrée —');
check('payload slash name: update', extra.includes("name: 'update'"));
check('description fondateur', extra.includes('fondateur uniquement'));
check('EXTRA_CMDS contient update', extra.includes("'update'") && extra.includes('EXTRA_CMDS'));
check('handleSlash route vers changelog', extra.includes("require('./changelog').handleUpdate"));

console.log('— 3. Réservé au fondateur (ID Render) —');
check('lit NEXORA_ADMIN_DISCORD_ID', clSrc.includes('NEXORA_ADMIN_DISCORD_ID'));
check('refus éphémère', clSrc.includes('réservée au fondateur') && clSrc.includes('ephemeral: true'));
check('succès : reply public (pas éphémère)', clSrc.includes('interaction.reply(payload)'));

process.env.NEXORA_ADMIN_DISCORD_ID = '1513133061489955006';
const changelog = require('../server/discord/changelog');
check('VERSION numérique', typeof changelog.VERSION === 'number' && changelog.VERSION >= 334);
check('isFounder : bon id', changelog.isFounder('1513133061489955006') === true);
check('isFounder : autre id refusé', changelog.isFounder('1') === false);
check('isFounder : vide refusé', changelog.isFounder('') === false);
delete process.env.NEXORA_ADMIN_DISCORD_ID;
check('isFounder : sans env = refusé', changelog.isFounder('1513133061489955006') === false);
process.env.NEXORA_ADMIN_DISCORD_ID = '1513133061489955006';

console.log('— 4. Panneau public —');
const panel = changelog.buildUpdatePanel();
check('Components V2', !!(panel && panel.flags && (Number(panel.flags) & (1 << 15))));
check('pas éphémère', !(Number(panel.flags) & (1 << 6)));
const blob = JSON.stringify(panel);
check('titre de version', blob.includes('Mises à jour') || blob.includes('v334') || blob.includes('v335'));
check('sections nouveautés', blob.includes('Nouveautés'));
check('boutons dashboard + support',
  blob.includes('https://hoxera.is-a.dev') && blob.includes('https://discord.gg/X9hTdr9N3'));
check('pas de signature Hoxera', !blob.includes('Hoxera ·'));
const ui = require('../server/discord/ui');
const violations = ui.v2Audit(panel);
check('limites Discord respectées', Array.isArray(violations) && violations.length === 0, String(violations));

console.log('— 5. Exécution simulée —');
(async () => {
  const replies = [];
  const fake = (id) => ({
    user: { id },
    reply: async (p) => { replies.push(p); return p; },
    fetchReply: async () => ({ id: 'm1', edit: async () => {} }),
  });
  replies.length = 0;
  await changelog.handleUpdate(1, fake('999'));
  check('non-fondateur : 1 réponse éphémère', replies.length === 1 && replies[0].ephemeral === true);

  replies.length = 0;
  await changelog.handleUpdate(1, fake('1513133061489955006'));
  check('fondateur : panneau public', replies.length === 1 && !replies[0].ephemeral && !!(replies[0].flags && (Number(replies[0].flags) & (1 << 15))));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v334 : ' + ok + ' vérifications passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
