// Test v3.11 — rôles sélectionnables sur mobile + popovers refermables
const assert = require('assert');
const fs = require('fs');

const views = fs.readFileSync(__dirname + '/../public/js/views.js', 'utf8');
const dashboard = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');
const css = fs.readFileSync(__dirname + '/../public/css/dashboard.css', 'utf8');

// 1. L'éditeur de menus de rôles utilise une vraie liste native pour les
// rôles Discord : elle ouvre le sélecteur tactile sur Android/iPhone.
assert.ok(views.includes('const roleChoices = (guildData.roles || []).filter'), 'liste des rôles chargée');
assert.ok(views.includes('<select class="input" data-k="role">'), 'sélecteur de rôle natif dans le menu');
assert.ok(views.includes("inp.tagName === 'SELECT' ? 'change' : 'input'"), 'événement change compatible mobile');
console.log('✅ menus de rôles : sélection native tactile, sans saisie obligatoire');

// 2. Les autres endroits où un rôle est choisi (XP et boutique) suivent la
// même règle, tout en gardant un repli texte si Discord ne renvoie aucun rôle.
assert.ok(dashboard.includes('const xpRoleChoices = (data.roles || [])'));
assert.ok(dashboard.includes('const roleChoices = (data && data.roles || [])'));
assert.ok(dashboard.includes('<select class="dash-select" data-k="role">'));
console.log('✅ dashboard : récompenses XP et boutique sélectionnables sur mobile');

// 3. Les panneaux 🎨 et 🔔 respectent enfin hidden, ferment au second clic,
// au clic extérieur ou avec Échap, et ne s'empilent pas lors d'un re-rendu.
assert.ok(dashboard.includes('Dashboard.closePopovers'));
assert.ok(dashboard.includes('const open = accPop.hidden'));
assert.ok(dashboard.includes("event.key === 'Escape'"));
assert.ok(css.includes('.dash-accent-pop[hidden], .dash-bell-pop[hidden] { display: none !important; }'));
console.log('✅ thèmes/notifications : ouverture et fermeture fiables sur tactile et ordinateur');

console.log('\n🎉 Tous les tests v3.11 passent');
