// ══════════════════════════════════════════════════════════════
// TEST v188 — LOT 1 « Quick wins communauté » :
//  1. /afk — statut AFK persistant + sortie automatique
//  2. /top — classement XP/coins paginé avec boutons ◀ ▶
//  3. Historique des sanctions dans le dashboard (module Membres)
//  4. Rappels récurrents (/remind avec répétition horaire/jour/semaine)
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(root, 'server/db.js'), 'utf8');
const extraSrc = fs.readFileSync(path.join(root, 'server/discord/extra.js'), 'utf8');
const botManagerSrc = fs.readFileSync(path.join(root, 'server/discord/botManager.js'), 'utf8');
const dashSrc = fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8');

// ---------- 1. Pins de version (repris des tests précédents) ----------
assert.strictEqual((index.match(/\?v=188/g) || []).length, 7,
  'index.html doit référencer v188 7 fois');
assert(sw.includes('botdev-v188'), 'le cache du service worker n’est pas en v188');
assert(!index.includes('?v=187') && !index.includes('?v=186'),
  'index.html référence encore une ancienne version');

// ---------- 2. /afk : base + commande + hook message ----------
assert(dbSrc.includes('CREATE TABLE IF NOT EXISTS afk ('),
  'la table afk manque dans db.js');
assert(dbSrc.includes('afk,'), 'l’accesseur afk n’est pas exporté');
assert(extraSrc.includes("'afk', 'top'"), 'afk/top absents de EXTRA_CMDS');
assert(extraSrc.includes("name: 'afk'"), 'la commande /afk manque dans buildExtraPayloads');
assert(extraSrc.includes("case 'afk'"), 'le handler /afk manque dans handleSlash');
assert(extraSrc.includes('async function onMessage(botId, m)'), 'la fonction onMessage manque');
assert(botManagerSrc.includes('extra.onMessage(botId, m)'), 'onMessage non branché dans messageCreate');

// ---------- 3. /top : commande + pagination ----------
assert(extraSrc.includes("name: 'top'"), 'la commande /top manque dans buildExtraPayloads');
assert(extraSrc.includes("case 'top'"), 'le handler /top manque dans handleSlash');
assert(extraSrc.includes('async function renderTop('), 'la fonction renderTop manque');
assert(extraSrc.includes("id.startsWith('hxtop:')"), 'les boutons hxtop: ne sont pas gérés');
assert(dbSrc.includes('count: (botId, guildId) => db.prepare(\'SELECT COUNT(*) AS n FROM xp'),
  'store.xp.count manque');
assert(dbSrc.includes('count: (botId, guildId) => db.prepare(\'SELECT COUNT(*) AS n FROM economy'),
  'store.economy.count manque');

// ---------- 4. Historique sanctions dans le dashboard ----------
assert(dashSrc.includes('Avertissements récents'), 'le panneau historique manque dans le dashboard');
assert(dashSrc.includes('/bots/${bot.id}/guilds/${guildId}/warnings'), 'la route warnings n’est pas appelée');

// ---------- 5. Rappels récurrents ----------
assert(dbSrc.includes("repeat_mode TEXT DEFAULT 'once'"), 'colonne repeat_mode manque dans la table reminders');
assert(dbSrc.includes('ALTER TABLE reminders ADD COLUMN repeat_mode'), 'migration repeat_mode manque');
assert(dbSrc.includes("['once', 'hourly', 'daily', 'weekly'].includes(repeatMode)"),
  'validation repeatMode manquante');
assert(extraSrc.includes("name: 'repeat'"), 'l’option repeat manque dans /remind');
assert(extraSrc.includes('function nextRepeatTs('), 'nextRepeatTs manque');
assert(extraSrc.includes('if (mode !== \'once\')'), 'le rearm des rappels récurrents manque');

// ---------- 6. Logique réelle (db + extra chargés) ----------
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v188-'));
const store = require(path.join(root, 'server/db'));
const extra = require(path.join(root, 'server/discord/extra'));

// 6a. Table AFK : set/get/remove
store.afk.set(1, 'g1', 'u1', 'je mange');
assert(store.afk.get(1, 'g1', 'u1'), 'get AFK devrait retourner l’entrée');
assert.strictEqual(store.afk.get(1, 'g1', 'u1').reason, 'je mange');
assert.strictEqual(store.afk.all(1, 'g1').length, 1);
store.afk.set(1, 'g1', 'u1', 'nouv. raison');
assert.strictEqual(store.afk.get(1, 'g1', 'u1').reason, 'nouv. raison', 'le upsert devrait mettre à jour la raison');
assert.strictEqual(store.afk.all(1, 'g1').length, 1, 'le upsert ne doit pas créer de doublon');
store.afk.remove(1, 'g1', 'u1');
assert.strictEqual(store.afk.get(1, 'g1', 'u1'), null, 'remove AFK devrait supprimer');

// 6b. Rappels récurrents : repeat_mode stocké + nextRepeatTs
store.reminders.add(1, 'g1', 'c1', 'u2', 1000, 'tous les jours', 'daily');
const r = store.reminders.all().find((x) => x.user_id === 'u2');
assert(r, 'le rappel récurrent doit être inséré');
assert.strictEqual(r.repeat_mode, 'daily');
assert.strictEqual(r.text, 'tous les jours');
assert.strictEqual(extra.nextRepeatTs('hourly', 1000), 1000 + 3600000);
assert.strictEqual(extra.nextRepeatTs('daily', 1000), 1000 + 86400000);
assert.strictEqual(extra.nextRepeatTs('weekly', 1000), 1000 + 7 * 86400000);

// 6c. Compteurs pour /top
store.xp.add(1, 'g1', 'a', 100, Date.now());
store.xp.add(1, 'g1', 'b', 50, Date.now());
store.economy.ensure(1, 'g1', 'a');
store.economy.add(1, 'g1', 'a', 500);
assert.strictEqual(store.xp.count(1, 'g1'), 2, 'xp.count doit compter 2');
assert.strictEqual(store.xp.top(1, 'g1', 10).length, 2);
assert.strictEqual(store.economy.count(1, 'g1'), 1, 'economy.count doit compter 1');
assert.strictEqual(store.economy.top(1, 'g1', 10)[0].coins, 500);

// 6d. Les commandes sont bien déclarées dans les payloads slash
const payloads = extra.buildExtraPayloads();
assert(payloads.some((p) => p.name === 'afk'), 'payload /afk absent');
assert(payloads.some((p) => p.name === 'top'), 'payload /top absent');
const remind = payloads.find((p) => p.name === 'remind');
assert(remind && remind.options.some((o) => o.name === 'repeat'), 'option repeat absente de /remind');
const topCmd = payloads.find((p) => p.name === 'top');
assert(topCmd && topCmd.options.some((o) => o.name === 'type'), 'option type absente de /top');

// ---------- 7. Nettoyage ----------
try { store.db.close(); } catch {}
console.log('✅ v188-test : LOT 1 — /afk, /top, historique sanctions, rappels récurrents — 0 problème (logique réelle vérifiée)');
