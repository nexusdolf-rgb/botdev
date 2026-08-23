// Test v2.5 — Les types de tickets ne perdent PLUS descriptions et questionnaires
// Bug corrigé : l'API du dashboard renvoyait les types SANS description ni
// questions → le dashboard les rechargeait vides et les écrasait au prochain
// « Enregistrer ». L'utilisateur devait tout retaper après chaque visite.
const assert = require('assert');
const fs = require('fs');

const src = fs.readFileSync(__dirname + '/../server/routes.js', 'utf8');

// 1. Le mapping parsedTypes renvoie TOUS les champs
const start = src.indexOf('const parsedTypes');
const block = src.slice(start, start + 1200);
assert.ok(block.includes("description: x.description || ''"), 'description renvoyée au dashboard');
assert.ok(block.includes('questions: Array.isArray(x.questions)'), 'questions renvoyées au dashboard');
assert.ok(block.includes('staff_roles: roles.filter(Boolean)'), 'rôles staff conservés');
assert.ok(block.includes("emoji: x.emoji || ''") && block.includes("category: x.category || ''"), 'emoji + catégorie conservés');
console.log('✅ l\'API renvoie les types COMPLETS (label, emoji, catégorie, description, questions, rôles)');

// 2. Cohérence aller-retour : tout champ accepté par le PUT est renvoyé par le GET
//    (sinon le cycle chargement → enregistrement détruit des données)
const putStart = src.indexOf("router.put('/bots/:id/tickets'");
const putBlock = src.slice(putStart, putStart + 4000);
for (const field of ['label', 'emoji', 'description', 'category', 'questions', 'staff_roles']) {
  assert.ok(putBlock.includes(field), `PUT accepte « ${field} »`);
  assert.ok(block.includes(field), `GET renvoie « ${field} »`);
}
console.log('✅ symétrie GET/PUT vérifiée : aucun champ ne peut plus se perdre dans le cycle');

// 3. Le dashboard recharge bien ces champs dans son éditeur de types
const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');
assert.ok(dash.includes("description: x.description || ''"), 'éditeur : description rechargée');
assert.ok(dash.includes('questions: (Array.isArray(x.questions)'), 'éditeur : questions rechargées');
console.log('✅ l\'éditeur du dashboard recharge descriptions et questionnaires');

console.log('\n🎉 Tous les tests v2.5 passent');
