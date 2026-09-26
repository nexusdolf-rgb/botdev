// v321 — Découpe des gros modules dashboard (menu uniquement, APIs inchangées).
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

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const dash = racine('public/js/dashboard.js');

console.log('— 1. Pins de version v321 —');
check('index.html : ?v=331 ×7', (html.match(/\?v=331/g) || []).length === 7);
check('sw.js : cache botdev-v331', sw.includes("const CACHE = 'botdev-v331';"));
check('index.html : plus aucune ?v=320', !html.includes('?v=320'));

console.log('— 2. Menu : 8 modules dédiés, plus de « Communauté » —');
const mods = (dash.match(/Dashboard\.MODULES = \[([\s\S]*?)\];/) || [null, ''])[1];
for (const id of ['starboard', 'invites', 'lives', 'antiraid', 'blacklist', 'autoroles', 'birthdays', 'sticky']) {
  check(`MODULES contient « ${id} »`, mods.includes(`['${id}'`));
}
check('MODULES ne contient plus « community »', !mods.includes("['community'"));
check('anti-raid et anti-nuke restent deux modules distincts',
  mods.includes("['antiraid'") && mods.includes("['antinuke'"));
check('alias persisté community → invites',
  dash.includes("MODULE_ALIASES = { community: 'invites' }"));
check('setModule applique l’alias',
  dash.includes('Dashboard.MODULE_ALIASES[next] || next'));

console.log('— 3. Wrappers keep/hide (pas de copie des cartes) —');
check('helpers keepCards / hideCards / retitle',
  dash.includes('Dashboard.keepCards =') && dash.includes('Dashboard.hideCards =') && dash.includes('Dashboard.retitle ='));
check('capture _full avant overwrite',
  dash.includes('Dashboard._full =') && dash.includes('community: Dashboard.renderers.community'));
check('renderer starboard / invites / lives',
  dash.includes('Dashboard.renderers.starboard =') && dash.includes('Dashboard.renderers.invites =') && dash.includes('Dashboard.renderers.lives ='));
check('renderer blacklist / antiraid',
  dash.includes('Dashboard.renderers.blacklist =') && dash.includes('Dashboard.renderers.antiraid ='));
check('renderer autoroles / birthdays / sticky',
  dash.includes('Dashboard.renderers.autoroles =') && dash.includes('Dashboard.renderers.birthdays =') && dash.includes('Dashboard.renderers.sticky ='));

const iCommunity = dash.indexOf('Dashboard.renderers.community');
const chunk = dash.slice(iCommunity, iCommunity + 9000);
check('la fonction pleine « community » est toujours là (v291)',
  iCommunity > 0 && chunk.includes("Récompenses d\\'invitations") && chunk.includes('irc-save'));
check('invites garde Récompenses + Traqueur',
  dash.includes("keepCards(content, ['Récompenses d', 'Traqueur d'])"));
check('modération cache Liste noire + Bouclier',
  dash.includes("hideCards(content, ['Liste noire', 'Bouclier anti-raid'])"));
check('anti-raid = bouclier + lockdown serveur',
  dash.includes("keepCards(content, ['Bouclier anti-raid'])")
  && dash.includes("appendCardsFrom(Dashboard._full.server, content, data, ['Anti-raid'])"));
check('welcome cache Auto-rôle', dash.includes("hideCards(content, ['Auto-rôle'])"));
check('announcements cache sticky', dash.includes("hideCards(content, ['Message épinglé'])"));
check('server cache Anniversaires + Anti-raid',
  dash.includes("hideCards(content, ['Anniversaires', 'Anti-raid'])"));
check('sticky recharge le module courant (pas toujours announcements)',
  dash.includes('(Dashboard.renderers[Dashboard.state.module] || Dashboard.renderers.announcements)'));

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log('\n✅ v321 : ' + ok + ' vérifications passed.');
process.exit(ko === 0 ? 0 : 1);
