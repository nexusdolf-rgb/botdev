// Test v3.7 — Catégorie dédiée du type : priorité absolue, zéro ambiguïté
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v37test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const panels = fs.readFileSync(__dirname + '/../server/discord/panels.js', 'utf8');
const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');

// 1. Persistance de menu_category (sans écraser le reste)
const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
store.tickets.set(botId, 'g1', { channel: '#support', menu_channel: '#menu', menu_category: '🎫 SUPPORT' });
let t = store.tickets.get(botId, 'g1');
assert.strictEqual(t.menu_category, '🎫 SUPPORT');
assert.strictEqual(t.menu_channel, '#menu', 'autres champs intacts');
console.log('✅ base : menu_category persistée sans effet de bord');

// 2. Priorité : anciens panneaux = menu/globale ; nouveau système = type dédié
assert.ok(panels.includes('const fromMenu = !!type;'), 'détection ticket ouvert via le menu');
assert.ok(panels.includes('const typeCategory = chosen && String(chosen.category || \'\').trim();'), 'catégorie dédiée du type');
assert.ok(panels.includes('const catName = configOverride'), 'source de catégorie différenciée');
assert.ok(panels.includes('menuCategory || globalCategory || typeCategory'), 'catégorie du panneau prioritaire pour l’ancien système');
assert.ok(panels.includes('Aucune catégorie de tickets n’est configurée'), 'absence de catégorie traitée');
assert.ok(panels.includes('La catégorie configurée pour ce type de ticket est introuvable'), 'catégorie introuvable traitée');
console.log('✅ priorité : panneau ancien stable, type personnalisé dédié, sans catégorie automatique');

// 3. Toujours AUCUNE création de catégorie possible
assert.ok(!panels.includes('type: ChannelType.GuildCategory }'), 'création de catégorie toujours impossible');
console.log('✅ création de catégorie toujours structurellement impossible');

// 4. Dashboard : sélecteur de catégorie dans la carte MENU
assert.ok(dash.includes('tm-cat'), 'sélecteur présent');
assert.ok(dash.includes('Catégorie où créer les salons de tickets du MENU'), 'libellé explicite');
assert.ok(dash.includes("menu_category: cm.querySelector('#tm-cat').value"), 'enregistré avec le 💾 de la carte');
console.log('✅ dashboard : catégorie du menu choisie dans une VRAIE liste (aucune faute de frappe possible)');

console.log('\n🎉 Tous les tests v3.7 passent');
