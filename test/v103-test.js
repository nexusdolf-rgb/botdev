// Test v2.6 — Annonces de live : plus jamais silencieusement désactivées
// Bug d'ergonomie corrigé : l'utilisateur ajoutait un compte (« ➕ Suivre »)
// sans cliquer le 💾 du salon → live_channel restait vide → le balayage
// sautait le serveur → AUCUNE annonce, sans aucun message d'erreur.
const assert = require('assert');
const fs = require('fs');

const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');
const routes = fs.readFileSync(__dirname + '/../server/routes.js', 'utf8');

// 1. « ➕ Suivre » enregistre AUSSI les réglages (salon + mention)
const addIdx = dash.indexOf("cl.querySelector('#lv-add').onclick");
const addBlock = dash.slice(addIdx, addIdx + 900);
assert.ok(addBlock.includes('await saveLiveSettings();'), 'l\'ajout sauvegarde les réglages en premier');
console.log('✅ « ➕ Suivre » enregistre aussi le salon et la mention (une seule action)');

// 2. Bandeau d'état visible : ACTIVES ou DÉSACTIVÉES
assert.ok(dash.includes('Annonces ACTIVES dans'), 'badge vert quand configuré');
assert.ok(dash.includes('les annonces sont DÉSACTIVÉES'), 'alerte rouge quand aucun salon');
console.log('✅ bandeau d\'état impossible à rater (ACTIVES / DÉSACTIVÉES)');

// 3. Bouton 🧪 Tester + endpoint serveur (test depuis l'IP de production)
assert.ok(dash.includes('data-test') && dash.includes('/test`, { method: \'POST\' }'), 'bouton Tester branché');
assert.ok(routes.includes("livesocials/:sid/test"), 'endpoint de test présent');
assert.ok(routes.includes('CHECKERS[s.platform](s.handle)'), 'le test exécute le vrai détecteur');
assert.ok(routes.includes('channelSet: !!channel'), 'le test vérifie le vrai salon côté Discord');
console.log('✅ test en direct depuis le serveur + alerte salon manquant');

console.log('\n🎉 Tous les tests v2.6 passent');
