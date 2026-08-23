// Test v1.91 — Anti-dérive des commandes globales
// Scénario réel du 23/08/2026 : un démarrage sur base vide a écrasé la liste
// globale chez Discord (26 au lieu de 60). Après restauration de la vraie
// base, le hash mémorisé disait « à jour » → plus AUCUNE re-synchronisation,
// les commandes restaient « disparues » pour toujours.
// La correction : quand le hash dit « à jour », on vérifie l'état RÉEL chez
// Discord et on re-pousse si le compte ne correspond pas.
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v91test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const { globalSyncDecision } = require('../server/discord/botManager');

// 1. Liste modifiée → toujours 'sync' (peu importe l'état Discord)
assert.strictEqual(globalSyncDecision('ancienhash', 'nouveauhash', 60, 60), 'sync');
console.log('✅ liste modifiée → sync');

// 2. Hash à jour + Discord cohérent → 'skip' (pas de requête inutile)
assert.strictEqual(globalSyncDecision('h1', 'h1', 60, 60), 'skip');
console.log('✅ tout cohérent → skip (limite de débit respectée)');

// 3. LE BUG DU 23/08 : hash à jour mais Discord n'a que 26 commandes → 'drift'
assert.strictEqual(globalSyncDecision('h1', 'h1', 26, 60), 'drift');
console.log('✅ dérive détectée (26 chez Discord ≠ 60 attendues) → re-synchronisation');

// 4. Dérive inverse (Discord a TROP de commandes, ex: résidus) → 'drift'
assert.strictEqual(globalSyncDecision('h1', 'h1', 90, 60), 'drift');
console.log('✅ dérive inverse détectée → re-synchronisation');

// 5. Lecture Discord impossible (-1) avec hash à jour → 'drift' est déclenché
//    par le compte incohérent — mais dans syncGlobalCommands la lecture qui
//    échoue fait un retour silencieux AVANT la décision (vérifié par lecture
//    du code : le catch renvoie). Ici on vérifie juste la pureté de la fonction.
assert.strictEqual(globalSyncDecision('h1', 'h1', -1, 60), 'drift');
console.log('✅ compte inconnu traité comme dérive (la garde réseau est en amont)');

console.log('\n🎉 Tous les tests v91 passent');
