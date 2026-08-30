// ══════════════════════════════════════════════════════════════
// TEST v191 — RETRAIT des pages publiques (demande utilisateur) :
//  1. Pins de version v191 (cache front invalidé)
//  2. Les pages publiques serveur (#/g/<id>) et statut (#/status)
//     sont SUPPRIMÉES (aucune trace dans le code)
//  3. Le reste du LOT 4 reste intact : 6 langues, quiz, série,
//     export CSV, événements (/event), table quiz_scores
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const i18nSrc = fs.readFileSync(path.join(root, 'server/i18n.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(root, 'server/db.js'), 'utf8');
const exSrc = fs.readFileSync(path.join(root, 'server/discord/extra.js'), 'utf8');
const bmSrc = fs.readFileSync(path.join(root, 'server/discord/botManager.js'), 'utf8');
const routesSrc = fs.readFileSync(path.join(root, 'server/routes.js'), 'utf8');
const premadeSrc = fs.readFileSync(path.join(root, 'server/discord/premade.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
const pubJs = fs.readFileSync(path.join(root, 'public/js/public.js'), 'utf8');
const dashSrc = fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8');

// ---------- 1. Pins de version ----------
assert.strictEqual((index.match(/\?v=191/g) || []).length, 7,
  'index.html doit référencer v191 7 fois');
assert(sw.includes('botdev-v191'), 'le cache du service worker n’est pas en v191');
assert(!index.includes('?v=190'), 'index.html référence encore v190');

// ---------- 2. Pages publiques serveur + statut RETIRÉES ----------
// Backend
assert(!routesSrc.includes("router.get('/public/guilds/"),
  'la route /public/guilds/:guildId doit avoir disparu');
assert(!routesSrc.includes('public_guilds'),
  'public_guilds doit avoir disparu de /public/bots/:id');
assert(!bmSrc.includes('guildPublicInfo'), 'guildPublicInfo doit avoir disparu');
assert(!bmSrc.includes('botPublicGuilds'), 'botPublicGuilds doit avoir disparu');
assert(!dbSrc.includes('upcomingByGuild:'), 'upcomingByGuild doit avoir disparu');
// Front
assert(!appJs.includes("parts[0] === 'g'"), 'la routeur #/g doit avoir disparu');
assert(!appJs.includes("parts[0] === 'status'"), 'le routeur #/status doit avoir disparu');
assert(!pubJs.includes('App.renderPublicGuild'), 'renderPublicGuild doit avoir disparu');
assert(!pubJs.includes('App.renderPublicStatus'), 'renderPublicStatus doit avoir disparu');
assert(!pubJs.includes('data-guild'), 'la section serveurs publics doit avoir disparu');
assert(!pubJs.includes('data-foot-status'), 'le lien Statut du footer doit avoir disparu');
assert(!pubJs.includes('Serveurs publics'), 'la mention « Serveurs publics » doit avoir disparu');
// Les pages publiques existantes restent (page du bot + landing) : rien à retirer là.

// ---------- 3. Le reste du LOT 4 reste INTACT ----------
// 3a. 6 langues
assert(i18nSrc.includes("es: 'es'") && i18nSrc.includes("de: 'de'")
  && i18nSrc.includes("pt: 'pt'") && i18nSrc.includes("it: 'it'"),
  'les 6 langues doivent rester dans i18n');
assert(premadeSrc.includes("['fr', 'en', 'es', 'de', 'pt', 'it']"),
  '/lang doit continuer d’accepter les 6 langues');
// 3b. Quiz
assert(dbSrc.includes('CREATE TABLE IF NOT EXISTS quiz_scores ('),
  'la table quiz_scores doit rester');
assert(dbSrc.includes('quizScores,'), 'l’accesseur quizScores doit rester exporté');
assert(exSrc.includes("name: 'quiz'"), 'la commande /quiz doit rester');
assert(exSrc.includes('hxquiz:'), 'les boutons hxquiz doivent rester');
assert(routesSrc.includes("router.get('/bots/:id/guilds/:guildId/quiz/top'"),
  'la route dashboard quiz/top doit rester');
assert(dashSrc.includes("['quiz', '🧠', 'Quiz']"),
  'le module Quiz du dashboard doit rester');
// 3c. Série de connexion
assert(dbSrc.includes('daily_streak INTEGER DEFAULT 0'),
  'la colonne daily_streak doit rester');
assert(premadeSrc.includes('Math.min(25 * (streak - 1), 300)'),
  'le bonus de série doit rester');
// 3d. Export CSV
assert(appJs.includes('App.downloadCSV = '), 'App.downloadCSV doit rester');
assert(dashSrc.includes('id="quiz-exp-csv"'), 'l’export CSV quiz doit rester');
assert(dashSrc.includes('id="exp-csv"'), 'l’export CSV économie doit rester');
// 3e. Événements v189 intacts
assert(dbSrc.includes('CREATE TABLE IF NOT EXISTS guild_events ('),
  'la table guild_events doit rester');
assert(routesSrc.includes("router.post('/bots/:id/guilds/:guildId/events'"),
  'les routes événements doivent rester');

// ---------- 4. Logique réelle (db + i18n + extra chargés) ----------
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v191-'));
const store = require(path.join(root, 'server/db'));
const i18n = require(path.join(root, 'server/i18n'));
const extra = require(path.join(root, 'server/discord/extra'));

// 4a. i18n toujours fonctionnel
for (const l of ['fr', 'en', 'es', 'de', 'pt', 'it']) {
  const s = i18n.t(l, 'lang_set');
  assert(s && s.length > 3, `lang_set(${l}) invalide`);
}
assert.strictEqual(i18n.normalize('zz'), 'fr', 'langue inconnue → fr');

// 4b. Quiz toujours fonctionnel (table créée)
store.quizScores.addResult(1, 'g1', 'u1', 10);
store.quizScores.addResult(1, 'g1', 'u1', 15);
const qtop = store.quizScores.top(1, 'g1', 10);
assert.strictEqual(qtop.length, 1, '1 joueur classé');
assert.strictEqual(qtop[0].score, 25, '25 points cumulés');

// 4c. Série de connexion toujours fonctionnelle
store.economy.ensure(1, 'g1', 'u9');
store.economy.setDailyStreak(1, 'g1', 'u9', 3);
assert.strictEqual(store.economy.get(1, 'g1', 'u9').daily_streak, 3, 'série persistée');

// 4d. /quiz toujours dans les payloads
const payloads = extra.buildExtraPayloads();
assert(payloads.some((p) => p.name === 'quiz'), 'payload /quiz absent');

// 4e. Nettoyage
try { store.db.close(); } catch {}

console.log('✅ v191-test : pages publiques serveur/statut retirées, LOT 4 conservé (6 langues, quiz, série, CSV, événements) — 0 problème');
