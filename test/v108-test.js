// Test v3.1 — Panneau premium PAR DÉFAUT + départs blindés + boutons de test
const assert = require('assert');
const fs = require('fs');
const ev = fs.readFileSync(__dirname + '/../server/discord/events.js', 'utf8');
const routes = fs.readFileSync(__dirname + '/../server/routes.js', 'utf8');
const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');

// 1. Premium par défaut : la condition est !cfg.plain (plus de case « embed » à cocher)
assert.ok(ev.includes('if (!cfg.plain) {'), 'panneau premium par défaut');
assert.strictEqual((ev.match(/if \(!cfg\.plain\) \{/g) || []).length, 2, 'arrivée ET départ');
assert.ok(ev.includes("key: 'plain'"), 'case inversée « mode texte simple »');
assert.ok(!ev.includes("key: 'embed'"), 'ancienne case embed retirée des réglages');
console.log('✅ panneau premium PAR DÉFAUT (arrivée + départ) — plus aucune case à cocher');

// 2. Plus AUCUN accès non protégé à member.user dans events.js
const unsafeLines = ev.split('\n').filter((l) =>
  /member\.user\.(tag|username)/.test(l) && !/member\.user\s*&&/.test(l));
assert.deepStrictEqual(unsafeLines, [], `accès non protégés restants : ${unsafeLines.join(' | ')}`);
console.log('✅ membres partiels : plus un seul accès direct à member.user.tag/username');

// 3. Journaux d'étapes (diagnostic en production)
assert.ok(ev.includes('👋 arrivée') && ev.includes('👋 départ'), 'traces arrivée/départ');
assert.ok(ev.includes('INTROUVABLE ❌') && ev.includes('envoyé ✅'), 'chaque étape tracée');
console.log('✅ chaque étape visible dans les logs (salon trouvé ? envoyé ?)');

// 4. Mode test : aucune pollution des stats/anti-raid/auto-rôle
assert.ok(ev.includes('if (!opts.test) {'), 'stats/anti-raid ignorés en test');
assert.ok(ev.includes('!opts.test && state.autorole'), 'auto-rôle ignoré en test');
console.log('✅ mode test propre (pas de fausses statistiques)');

// 5. Boutons 🧪 dans le dashboard + endpoint
assert.ok(routes.includes("events/:type/test"), 'endpoint de test');
assert.ok(routes.includes('runJoinEvent(bot.id, member, { test: true })'), 'test arrivée réel');
assert.ok(dash.includes('🧪 Tester') && dash.includes('/events/${key}/test'), 'boutons dans le module Bienvenue');
console.log('✅ boutons « 🧪 Tester l\'arrivée / le départ » : vérification sans quitter le serveur');

console.log('\n🎉 Tous les tests v3.1 passent');
