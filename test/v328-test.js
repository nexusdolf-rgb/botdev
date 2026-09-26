// v328 — Tickets : panneaux menu extra, chacun avec ses propres types.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v328');
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
const views = racine('public/js/views.js');
const panels = racine('server/discord/panels.js');
const routes = racine('server/routes.js');
const dbSrc = racine('server/db.js');

console.log('— 1. Pins de version v328 —');
check('index.html : ?v=329 ×7', (html.match(/\?v=329/g) || []).length === 7);
check('sw.js : cache botdev-v329', sw.includes("const CACHE = 'botdev-v329';"));
check('index.html : plus aucune ?v=327', !html.includes('?v=327'));

console.log('— 2. Câblage —');
check('table ticket_menus', dbSrc.includes('CREATE TABLE IF NOT EXISTS ticket_menus'));
check('store.ticketMenus', dbSrc.includes('const ticketMenus = {'));
check('custom_id extra bd-ttype:bot:x<id>', panels.includes('bd-ttype:${botId}:x${extra.id}'));
check('envoi sendExtraTicketMenu', panels.includes('async function sendExtraTicketMenu'));
check('routes CRUD + send', routes.includes("/bots/:id/ticket-menus") && routes.includes("/ticket-menus/:id/send"));
check('dashboard : carte Autres panneaux menu', dash.includes('Autres panneaux menu') && dash.includes('openTicketMenuModal'));
check('modale dans views.js', views.includes('BotViews.openTicketMenuModal'));
check('le menu principal n’est pas retiré', dash.includes('📋 Panneau avec menu (liste)') && dash.includes("mode: 'menu'"));
check('prune : extra ≠ menu principal', panels.includes("kind === 'extra'") && panels.includes('bd-ttype:\\d+:x\\d+'));

console.log('— 3. Comportement store —');
const store = require('../server/db');
const bot = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
const G = 'g328';
check('aucun extra par défaut', store.ticketMenus.all(bot, G).length === 0);
const id = store.ticketMenus.create({
  bot_id: bot, guild_id: G, name: 'Recrutement', channel: '#recrut',
  types: [{ label: 'Candidature', emoji: '📝', staff_roles: ['RH'] }, { label: '' }],
});
const saved = store.ticketMenus.get(id);
check('créé avec types nettoyés', saved && saved.name === 'Recrutement' && saved.types.length === 1 && saved.types[0].label === 'Candidature');
store.ticketMenus.update(id, { types: [{ label: 'Candidature' }, { label: 'Partenariat' }] });
check('update types', store.ticketMenus.get(id).types.map((t) => t.label).join(',') === 'Candidature,Partenariat');
store.ticketMenus.remove(id);
check('supprimé', store.ticketMenus.all(bot, G).length === 0);

console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
assert.strictEqual(ko, 0);
console.log('\n✅ v328 : ' + ok + ' vérifications passed.');
process.exit(0);
