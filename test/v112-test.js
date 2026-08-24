// Test v3.5 — Panneaux bouton et menu SÉPARÉS (config, envoi, cohabitation)
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v35test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const panels = fs.readFileSync(__dirname + '/../server/discord/panels.js', 'utf8');
const routes = fs.readFileSync(__dirname + '/../server/routes.js', 'utf8');
const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');

// 1. Base : les réglages du panneau menu sont persistés SANS écraser le reste
const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
store.tickets.set(botId, 'g1', { channel: '#support', message: 'Bouton !', button_label: '🎫 Ouvrir', menu_channel: '#tickets-menu', menu_message: 'Choisis ton type !' });
let t = store.tickets.get(botId, 'g1');
assert.strictEqual(t.menu_channel, '#tickets-menu');
assert.strictEqual(t.menu_message, 'Choisis ton type !');
assert.strictEqual(t.channel, '#support', 'panneau bouton intact');
console.log('✅ base : salon + message du panneau menu persistés, panneau bouton intact');

// 2. sendTicketPanel : les 3 modes
assert.ok(panels.includes("sendTicketPanel(botId, guildId, client, channel, mode = 'auto')"), 'paramètre mode');
assert.ok(panels.includes("if (mode === 'button') types = [];"), 'mode bouton = bouton même avec des types');
assert.ok(panels.includes("if (mode === 'menu' && !types.length) throw"), 'mode menu exige des types');
assert.ok(panels.includes('cfg.menu_message'), 'message dédié du menu utilisé');
console.log('✅ envoi : mode bouton (toujours un bouton), mode menu (types requis), message dédié');

// 3. Cohabitation : le nettoyage ne supprime QUE les panneaux du même genre
assert.ok(panels.includes("pruneOldPanels(channel, types.length ? 'menu' : 'button')"), 'nettoyage ciblé');
assert.ok(panels.includes("ids.includes('bd-ttype')"), 'distinction bouton/menu par composants');
console.log('✅ cohabitation : envoyer le panneau menu ne détruit plus le panneau bouton (et inversement)');

// 4. API : mode transmis + salon du menu avec repli
assert.ok(routes.includes("['button', 'menu'].includes(mode)"), 'mode validé');
assert.ok(routes.includes('cfg.menu_channel || cfg.channel'), 'repli sur le salon du bouton');
assert.ok(routes.includes('menu_channel: String(menu_channel !== undefined'), 'PUT sans écrasement');
console.log('✅ API : mode validé, salon du menu avec repli, mise à jour partielle sûre');

// 5. Dashboard : deux cartes, chacune 💾 + 📨
assert.ok(dash.includes('tm-save') && dash.includes('tm-send'), 'boutons dédiés du panneau menu');
assert.ok(dash.includes("mode: 'button'") && dash.includes("mode: 'menu'"), 'chaque 📨 envoie SON panneau');
assert.ok(dash.includes('Panneau MENU déroulant'), 'carte dédiée visible');
console.log('✅ dashboard : carte « Panneau MENU déroulant » avec ses propres 💾 Enregistrer et 📨 Envoyer');

console.log('\n🎉 Tous les tests v3.5 passent');
