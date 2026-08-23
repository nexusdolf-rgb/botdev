// Test v2.7 — Flux d'activité + barre de sauvegarde + première visite + aperçus
const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v27test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const dash = fs.readFileSync(__dirname + '/../public/js/dashboard.js', 'utf8');
const routes = fs.readFileSync(__dirname + '/../server/routes.js', 'utf8');

// ---- 1. 📰 Flux d'activité : base ----
const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
store.activity.add(botId, 'g1', '🎫', 'Ticket #1 ouvert par Testeur');
store.activity.add(botId, 'g1', '🔴', 'Live annoncé');
const items = store.activity.recent(botId, 'g1');
assert.strictEqual(items.length, 2);
assert.strictEqual(items[0].emoji, '🔴', 'plus récent en premier');
console.log('✅ flux : ajout + lecture (plus récent en premier)');

// rétention 200
for (let i = 0; i < 230; i++) store.activity.add(botId, 'g2', '•', 'evt ' + i);
assert.strictEqual(store.activity.recent(botId, 'g2', 100).length, 100);
const total = store.db.prepare("SELECT COUNT(*) n FROM activity WHERE guild_id = 'g2'").get().n;
assert.strictEqual(total, 200, 'purge automatique à 200');
console.log('✅ flux : rétention 200 entrées par serveur');

// ---- 2. Points de collecte branchés ----
const sources = ['panels.js', 'liveWatch.js', 'community.js', 'premade.js'];
let hooks = 0;
for (const f of sources) {
  const s = fs.readFileSync(__dirname + '/../server/discord/' + f, 'utf8');
  hooks += (s.match(/store\.activity\.add\(/g) || []).length;
}
assert.ok(hooks >= 6, `au moins 6 points de collecte (trouvés : ${hooks})`);
assert.ok(routes.includes("guilds/:guildId/activity"), 'endpoint API du flux');
console.log(`✅ ${hooks} points de collecte (tickets, claim, suppression, live, starboard, warn) + API`);

// ---- 3. 💾 Barre de sauvegarde intelligente ----
assert.ok(dash.includes('dash-savebar'), 'barre présente');
assert.ok(dash.includes('Dashboard.watchDirty'), 'détection des modifications');
assert.ok(dash.includes('Tout enregistrer'), 'action globale');
assert.ok(dash.includes("(b.textContent || '')"), 'déclenche tous les boutons 💾 du module');
assert.ok(dash.includes('Dashboard.hideSaveBar();') && dash.includes('dirtyWatched'), 'reset au changement de module');
console.log('✅ barre de sauvegarde : détection, action globale, récap unique');

// ---- 4. 👋 Première visite ----
assert.ok(dash.includes('dash-hero') && dash.includes('pct < 25'), 'héros affiché quand config < 25 %');
assert.ok(dash.includes('data-go="tickets"') && dash.includes('data-go="welcome"') && dash.includes('data-go="community"'), '3 étapes cliquables');
console.log('✅ première visite : héros de bienvenue avec 3 étapes guidées');

// ---- 5. 👀 Aperçus Discord ----
assert.ok(dash.includes('👀 Aperçu sur Discord'), 'aperçu bienvenue');
assert.ok(dash.includes('Carte de bienvenue (avatar + pseudo)'), 'aperçu de la carte image');
assert.ok(dash.includes("👀 Aperçu de l'annonce"), 'aperçu annonce de live');
console.log('✅ aperçus en direct : bienvenue (+ carte) et annonce de live');

console.log('\n🎉 Tous les tests v2.7 passent');
