// v332 — Lives : ajout de compte lisible sur mobile + mention d’un rôle du serveur.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v332');
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
const dash = racine('public/js/dashboard.js');
const css = racine('public/css/dashboard.css');
const dbSrc = racine('server/db.js');
const liveSrc = racine('server/discord/liveWatch.js');
const iC = dash.indexOf("Dashboard.card(root, '🔴 Annonces de live'");
const chunk = dash.slice(iC, dash.indexOf('// ---- Carte Starboard', iC));

console.log('— 1. Pins de version v332 —');
check('index.html : ?v=332 ×7', (html.match(/\?v=332/g) || []).length === 7);
check('sw.js : cache botdev-v332', sw.includes("const CACHE = 'botdev-v332';"));
check('index.html : plus aucune ?v=331', !html.includes('?v=331'));

console.log('— 2. Dashboard (Lives seulement) —');
check('ligne d’ajout classée lv-add-row', chunk.includes('class="lv-add-row"') && chunk.includes('id="lv-link"') && chunk.includes('id="lv-add"'));
check('plus de min-width qui déborde sur mobile', !chunk.includes('min-width:220px') && !chunk.includes('min-width:130px') && !chunk.includes('min-width:160px'));
check('CSS mobile : pile verticale', css.includes('.lv-add-row') && css.includes('flex-direction: column'));
check('mention : rôles du serveur (pas seulement everyone)', chunk.includes('liveRoles') && chunk.includes('livePingOpts') && chunk.includes('Rôle mentionné avec l\'annonce'));
check('@everyone / @here / aucune toujours là', chunk.includes('value="everyone"') && chunk.includes('value="here"') && chunk.includes('value="none"'));
check('ids lv-ping / lv-add / saveLiveSettings', chunk.includes('id="lv-ping"') && chunk.includes("saveLiveSettings"));
check('Suivre enregistre toujours salon + mention', chunk.includes('await saveLiveSettings();'));

console.log('— 3. Sauvegarde + annonce Discord —');
check('db accepte un id de rôle', dbSrc.includes('/^\\d{15,21}$/') && dbSrc.includes("return 'everyone'"));
check('livePingFor exporté', liveSrc.includes('function livePingFor') && liveSrc.includes('livePingFor,'));

const store = require('../server/db');
const live = require('../server/discord/liveWatch');
const bot = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
store.guildSettings.set(bot, 'g1', { live_ping: 'here' });
check('here toujours accepté', store.guildSettings.get(bot, 'g1').live_ping === 'here');
store.guildSettings.set(bot, 'g1', { live_ping: '1513133061489955006' });
check('id de rôle persisté', store.guildSettings.get(bot, 'g1').live_ping === '1513133061489955006');
store.guildSettings.set(bot, 'g1', { live_ping: 'nimporte' });
check('valeur invalide → everyone', store.guildSettings.get(bot, 'g1').live_ping === 'everyone');

const pingRole = live.livePingFor({ live_ping: '1513133061489955006' });
check('annonce : mention <@&rôle>', pingRole.content === '<@&1513133061489955006>' && Array.isArray(pingRole.allowedMentions.roles) && pingRole.allowedMentions.roles[0] === '1513133061489955006');
check('annonce : @everyone inchangé', live.livePingFor({ live_ping: 'everyone' }).content === '@everyone');
check('annonce : none = pas de mention', live.livePingFor({ live_ping: 'none' }).content === '');

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v332 : ' + ok + ' vérifications passed.');
