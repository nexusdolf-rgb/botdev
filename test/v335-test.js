// v335 — /update façon /help : actuelle + précédente, menu des versions, retour 2 min.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v335');
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

console.log('— 1. Pins de version v335 —');
check('index.html : ?v=340 ×7', (html.match(/\?v=340/g) || []).length === 7);
check('sw.js : cache botdev-v340', sw.includes("const CACHE = 'botdev-v340';"));
check('index.html : plus aucune ?v=334', !html.includes('?v=334'));

console.log('— 2. Câblage —');
check('extra route handleUpdate(botId, …)', extra.includes("handleUpdate(botId, interaction)"));
check('extra écoute le menu déroulant', extra.includes("changelog').handleSelect") || extra.includes('handleSelect(botId'));
check('customId hx-upd', clSrc.includes('hx-upd:${botId}') || clSrc.includes('hx-upd:'));

process.env.NEXORA_ADMIN_DISCORD_ID = '1497375017980137534';
const changelog = require('../server/discord/changelog');
const ui = require('../server/discord/ui');

console.log('— 3. Journal —');
check('VERSION numérique ≥ 335', typeof changelog.VERSION === 'number' && changelog.VERSION >= 335);
check('au moins 10 versions', Array.isArray(changelog.VERSIONS) && changelog.VERSIONS.length >= 10);
check('v335 dans le journal', changelog.VERSIONS.some((x) => x.v === 335));
check('retour auto entre 1 et 3 min', changelog.AUTO_REVERT_MS >= 60000 && changelog.AUTO_REVERT_MS <= 180000);
check('fondateur = ID fourni', changelog.isFounder('1497375017980137534') === true);
check('autre id refusé', changelog.isFounder('1') === false);

console.log('— 4. Aperçu actuelle + précédente —');
const home = changelog.buildHomePanel(1);
const homeBlob = JSON.stringify(home);
check('titre aperçu', homeBlob.includes('Mises à jour'));
check('montre actuelle et précédente', homeBlob.includes('v' + changelog.VERSION) && homeBlob.includes('v' + changelog.VERSIONS[1].v));
check('menu Choisir une version', homeBlob.includes('Choisir une version') || clSrc.includes('Choisir une version'));
check('accueil dans le menu', homeBlob.includes('home') || clSrc.includes("value: 'home'"));
check('V2 + pas éphémère', !!(home.flags && (Number(home.flags) & (1 << 15))) && !(Number(home.flags) & (1 << 6)));
check('limites Discord aperçu', ui.v2Audit(home).length === 0, String(ui.v2Audit(home)));

console.log('— 5. Détail d’une version —');
const det = changelog.buildVersionPanel(1, 333);
const detBlob = JSON.stringify(det);
check('détail v333', detBlob.includes('v333') && (detBlob.includes('Prendre') || detBlob.includes('ticket')));
check('limites Discord détail', ui.v2Audit(det).length === 0, String(ui.v2Audit(det)));

console.log('— 6. Menu déroulant (simulation) —');
(async () => {
  const updates = [];
  const sel = {
    isStringSelectMenu: () => true,
    customId: changelog.SELECT_ID(1),
    values: ['333'],
    message: { id: 'msg-upd', edit: async () => {} },
    update: async (p) => { updates.push(p); return p; },
  };
  const handled = await changelog.handleSelect(1, sel);
  check('select géré', handled === true);
  check('update du message', updates.length === 1);
  const u = JSON.stringify(updates[0] || {});
  check('affiche la version choisie', u.includes('v333'));

  const ignored = await changelog.handleSelect(1, { isStringSelectMenu: () => true, customId: 'autre', values: ['1'] });
  check('autre menu ignoré', ignored === false);

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v335 : ' + ok + ' vérifications passed.');
})().catch((e) => { console.error(e); process.exit(1); });
