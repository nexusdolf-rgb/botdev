// Test v3.3 — Grille serveurs, notifications, connexion théâtrale, ripple, mode clair
const assert = require('assert');
const fs = require('fs');
const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');
const app = fs.readFileSync(__dirname + '/../public/js/app.js', 'utf8');
const routes = fs.readFileSync(__dirname + '/../server/routes.js', 'utf8');
const dcss = fs.readFileSync(__dirname + '/../public/css/dashboard.css', 'utf8');
const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');

// 1. Grille de serveurs + mémorisation
assert.ok(dash.includes('Dashboard.renderServerGrid'), 'grille présente');
assert.ok(dash.includes("localStorage.getItem('hx-guild')") && dash.includes("localStorage.setItem('hx-guild'"), 'dernier serveur mémorisé');
assert.ok(dash.includes('➕ Inviter le bot') && dash.includes('✅ Configurer'), 'badges des cartes');
assert.ok(dcss.includes('.srv-card:hover'), 'survol des cartes');
console.log('✅ grille de cartes serveurs façon MEE6 + retour direct au dernier serveur');

// 2. Centre de notifications
assert.ok(routes.includes('guilds/:guildId/notifications'), 'endpoint notifications');
assert.ok(routes.includes('ne peut pas ÉCRIRE dans') && routes.includes('introuvable (renommé ou supprimé ?)'), 'détection permissions + salons perdus');
assert.ok(routes.includes('AUCUN salon d'), 'détecte le piège live sans salon');
assert.ok(dash.includes('d-bell') && dash.includes('bell-badge'), 'cloche + badge');
console.log('✅ centre de notifications : salons perdus, permissions manquantes, pièges de config');

// 3. Connexion théâtralisée + état de chargement
assert.ok(app.includes('auth-glass') && app.includes('auth-bot-ava'), 'carte en verre + avatar animé');
assert.ok(app.includes('jamais</b> ton mot de passe'), 'réassurance sécurité');
assert.ok(app.includes('Connexion à Discord…') && app.includes('btn-spin'), 'état de chargement du bouton');
assert.ok(app.includes('Se connecter avec Discord'), 'texte intact (tests fumée)');
console.log('✅ page de connexion : verre dépoli, avatar flottant, réassurance, bouton avec spinner');

// 4. Ripple universel
assert.ok(app.includes('hx-ripple') && app.includes('__hxRipple'), 'ripple délégué global');
assert.ok(dcss.includes('@keyframes hxRipple'), 'animation ripple');
console.log('✅ effet ripple Material sur tous les boutons');

// 5. Mode clair complet
assert.ok(dash.includes('hx-light') && dash.includes("localStorage.setItem('hx-theme'"), 'bascule mémorisée');
assert.ok(html.includes('prefers-color-scheme: light'), 'détection du réglage système AVANT rendu');
assert.ok(dcss.includes('html.hx-light {'), 'palette claire complète');
console.log('✅ mode clair : bouton 🌓, détection système, zéro flash au chargement');

// 6. Interrupteurs premium + cohérence de versions
assert.ok(dcss.includes(".switch input:checked + .slider::after { content: '✓'"), 'toggles ✓/✕');
const sw = fs.readFileSync(__dirname + '/../public/sw.js', 'utf8');
const vH = (html.match(/\?v=(\d+)/) || [])[1]; const vS = (sw.match(/botdev-v(\d+)/) || [])[1];
assert.strictEqual(vH, vS, 'versions synchronisées');
assert.ok(parseInt(vH, 10) >= 109, 'v109+');
console.log('✅ toggles premium + versions synchronisées v' + vH + ' (mise à jour auto garantie)');

console.log('\n🎉 Tous les tests v3.3 passent');
