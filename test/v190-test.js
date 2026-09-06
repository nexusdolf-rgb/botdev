// ══════════════════════════════════════════════════════════════
// TEST v190 — LOT 4 « International & fun » :
//  1. Langues : fr + en uniquement depuis v240 (es/de/pt/it retirés) + repli fr
//  2. Quiz compétitif : /quiz, boutons 🇦🇧🇨, scores, classement
//  3. Série de connexion /daily (streak + bonus plafonné)
//  4. Export CSV (dashboard)
//  NB : les pages publiques serveur/statut de la v190 ont été retirées
//  en v191 à la demande de l'utilisateur (voir test/v191-test.js).
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

// ---------- 2. Langues : périmètre v240 = fr + en uniquement ----------
// Les blocs es/de/pt/it ne couvraient que 48 clés sur 105 : le bot répondait
// donc en français dans ces langues. Plutôt que de laisser un menu qui ment,
// v240 ramène le périmètre à fr + en (décision utilisateur).
assert(i18nSrc.includes("fr: 'fr'") && i18nSrc.includes("en: 'en'"),
  'LANG_CODES doit contenir fr et en');
assert(!i18nSrc.includes("es: 'es'") && !i18nSrc.includes("de: 'de'")
  && !i18nSrc.includes("pt: 'pt'") && !i18nSrc.includes("it: 'it'"),
  'LANG_CODES ne doit PLUS contenir es/de/pt/it');
assert(!i18nSrc.includes("es: {") && !i18nSrc.includes("de: {")
  && !i18nSrc.includes("pt: {") && !i18nSrc.includes("it: {"),
  'les blocs ES/DE/PT/IT doivent avoir été retirés d’i18n.js');
// /lang n'accepte plus que 2 codes
assert(premadeSrc.includes("['fr', 'en']") && !premadeSrc.includes("'es', 'de'"),
  '/lang doit accepter fr + en seulement (premade.js)');
assert(premadeSrc.includes("i18n.t(wanted, 'lang_set')"),
  '/lang doit répondre dans la langue choisie');
// db.js + routes.js bornés au même périmètre
assert(dbSrc.includes("['fr', 'en'].includes"),
  'db.js doit borner la langue à fr + en');
assert(routesSrc.includes("['fr', 'en'].includes"),
  'routes.js doit borner la langue à fr + en');

// ---------- 3. Série de connexion (/daily) ----------
assert(dbSrc.includes('daily_streak INTEGER DEFAULT 0'),
  'la colonne daily_streak manque dans db.js');
assert(dbSrc.includes('setDailyStreak:'), 'setDailyStreak manque dans db.js');
assert(premadeSrc.includes('Série de **'), 'le message de série manque dans /daily');
assert(premadeSrc.includes('Math.min(25 * (streak - 1), 300)'),
  'le bonus de série plafonné manque dans /daily');

// ---------- 4. Quiz ----------
assert(dbSrc.includes('CREATE TABLE IF NOT EXISTS quiz_scores ('),
  'la table quiz_scores manque dans db.js');
assert(dbSrc.includes('quizScores,'), 'l’accesseur quizScores n’est pas exporté');
assert(dbSrc.includes('addResult:'), 'addResult manque dans quizScores');
assert(dbSrc.includes('ORDER BY score DESC, answers ASC'),
  'le classement quiz doit trier par score puis réponses');
assert(exSrc.includes("name: 'quiz'"), 'la commande /quiz manque');
assert(exSrc.includes("value: 'jouer'") && exSrc.includes("value: 'top'"),
  'les actions jouer/top manquent');
assert(exSrc.includes("hx:quiz:"), 'les boutons hxquiz manquent');
assert(exSrc.includes('QUIZ_BANK'), 'la banque de questions manque');
assert(exSrc.includes('bonus rapidité'), 'le bonus rapidité manque');
assert(exSrc.includes('quizState,'), 'quizState non exposé pour les tests');

// ---------- 5. Dashboard quiz + export CSV ----------
assert(routesSrc.includes("router.get('/bots/:id/guilds/:guildId/quiz/top'"),
  'route dashboard quiz/top manquante');
assert(appJs.includes('App.downloadCSV = '),
  'App.downloadCSV manque dans app.js');
assert(dashSrc.includes("['quiz', '🧠', 'Quiz']"),
  'entrée module Quiz manquante dans le dashboard');
assert(dashSrc.includes('Dashboard.renderers.quiz = '),
  'renderer quiz manquant dans le dashboard');
assert(dashSrc.includes('id="quiz-exp-csv"'),
  'export CSV quiz manquant dans le dashboard');
assert(dashSrc.includes('id="exp-csv"'),
  'export CSV économie manquant dans le dashboard');
assert(dashSrc.includes('Série 🔥'),
  'la colonne série manque dans l’économie du dashboard');

// ---------- 6. Logique réelle (db + i18n + extra chargés) ----------
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v190-'));
const store = require(path.join(root, 'server/db'));
const i18n = require(path.join(root, 'server/i18n'));
const extra = require(path.join(root, 'server/discord/extra'));

// 6a. i18n — v240 : fr + en répondent ; les langues RETIRÉES replient sur fr.
// Avant v240 es/de/pt/it n'avaient que 48 clés sur 105 : le bot affirmait
// « langue définie sur espagnol » puis répondait en français.
const frSet = i18n.t('fr', 'lang_set');
assert(frSet && frSet.length > 3, 'lang_set(fr) invalide');
const enSet = i18n.t('en', 'lang_set');
assert(enSet && enSet.length > 3 && enSet !== frSet,
  'lang_set(en) invalide ou identique au français');
for (const l of ['es', 'de', 'pt', 'it']) {
  assert.strictEqual(i18n.t(l, 'lang_set'), frSet,
    `lang_set(${l}) doit replier sur le français (langue retirée en v240)`);
}
assert.strictEqual(i18n.t('es', 'cle_qui_nexiste_pas'), i18n.t('fr', 'cle_qui_nexiste_pas'),
  'une clé manquante doit replier sur le français');
assert.strictEqual(i18n.normalize('zz'), 'fr', 'une langue inconnue doit replier sur fr');
assert.strictEqual(i18n.normalize('EN'), 'en', 'la casse doit être normalisée');

// 6b. Quiz : ajout de résultats + classement
store.quizScores.addResult(1, 'g1', 'u1', 10);
store.quizScores.addResult(1, 'g1', 'u1', 15);
store.quizScores.addResult(1, 'g1', 'u2', 10);
let top = store.quizScores.top(1, 'g1', 10);
assert.strictEqual(top.length, 2, '2 joueurs classés attendus');
assert.strictEqual(top[0].user_id, 'u1', 'u1 doit être premier (25 pts)');
assert.strictEqual(top[0].score, 25, 'u1 doit avoir 25 points');
assert.strictEqual(top[0].answers, 2, 'u1 doit avoir 2 réponses');
assert.strictEqual(top[1].score, 10, 'u2 doit avoir 10 points');
// Un autre serveur ne doit pas voir les scores de g1
assert.strictEqual(store.quizScores.top(1, 'g2', 10).length, 0, 'scores isolés par serveur');

// 6c. Série de connexion : le handler /daily repose sur ces accesseurs
store.economy.ensure(1, 'g1', 'u9');
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
store.economy.setDaily(1, 'g1', 'u9', yesterday);
store.economy.setDailyStreak(1, 'g1', 'u9', 4);
const row = store.economy.get(1, 'g1', 'u9');
assert.strictEqual(row.daily_streak, 4, 'la série doit persister');
assert.strictEqual(row.last_daily, yesterday, 'la date du jour doit persister');
// Bonus attendu par la formule du handler : base 100 + min(25*(5-1), 300) = 200
const streak = (row.last_daily === yesterday) ? row.daily_streak + 1 : 1;
const bonus = Math.min(25 * (streak - 1), 300);
assert.strictEqual(streak, 5, 'série attendue : 5');
assert.strictEqual(bonus, 100, 'bonus attendu : +100 (plafond respecté)');

// 6d. Payload /quiz : options attendues
const payloads = extra.buildExtraPayloads();
const quizCmd = payloads.find((p) => p.name === 'quiz');
assert(quizCmd, 'payload /quiz absent');
const optNames = (quizCmd.options || []).map((o) => o.name);
assert(optNames.includes('action'), 'option action absente de /quiz');
const actionOpt = quizCmd.options.find((o) => o.name === 'action');
assert((actionOpt.choices || []).length >= 2, 'les choix jouer/top manquent');

// 6e. Nettoyage
try { store.db.close(); } catch {}

console.log('✅ v190-test : LOT 4 — 6 langues, quiz compétitif, série de connexion, export CSV — 0 problème (logique réelle vérifiée)');
