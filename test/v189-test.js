// ══════════════════════════════════════════════════════════════
// TEST v189 — LOT 2 « Gaming & stream » :
//  1. /event — création, liste, suppression (admins)
//  2. Boutons « 🎮 Participer » / « ❌ Se désister »
//  3. Rappels automatiques 24 h / 1 h avant (sweep)
//  4. Module dashboard « Événements »
//  NB : les lives TikTok/Twitch/YouTube/Kick existaient déjà (liveWatch).
// ══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(root, 'server/db.js'), 'utf8');
const evSrc = fs.readFileSync(path.join(root, 'server/discord/guildEvents.js'), 'utf8');
const bmSrc = fs.readFileSync(path.join(root, 'server/discord/botManager.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
const routesSrc = fs.readFileSync(path.join(root, 'server/routes.js'), 'utf8');
const dashSrc = fs.readFileSync(path.join(root, 'public/js/dashboard.js'), 'utf8');
const premadeSrc = fs.readFileSync(path.join(root, 'server/discord/premade.js'), 'utf8');

// ---------- 1. Pins de version (repris des tests précédents) ----------
assert.strictEqual((index.match(/\?v=189/g) || []).length, 7,
  'index.html doit référencer v189 7 fois');
assert(sw.includes('botdev-v189'), 'le cache du service worker n’est pas en v189');
assert(!index.includes('?v=188'), 'index.html référence encore v188');

// ---------- 2. Base de données ----------
assert(dbSrc.includes('CREATE TABLE IF NOT EXISTS guild_events ('),
  'la table guild_events manque dans db.js');
assert(dbSrc.includes('guildEvents,'), 'l’accesseur guildEvents n’est pas exporté');
assert(dbSrc.includes('toggleParticipant:'), 'toggleParticipant manque');
assert(dbSrc.includes('allUpcoming:'), 'allUpcoming manque');

// ---------- 3. Module guildEvents.js ----------
assert(evSrc.includes("name: 'event'"), 'la commande /event manque dans buildEventPayloads');
assert(evSrc.includes("value: 'create'"), 'l’action create manque');
assert(evSrc.includes("value: 'list'"), 'l’action list manque');
assert(evSrc.includes("value: 'delete'"), 'l’action delete manque');
assert(evSrc.includes('hxev:join'), 'le bouton hxev:join manque');
assert(evSrc.includes('hxev:leave'), 'le bouton hxev:leave manque');
assert(evSrc.includes('async function sweepGuildEvents('), 'sweepGuildEvents manque');
assert(evSrc.includes('reminded_24h'), 'rappel 24h manquant');
assert(evSrc.includes('reminded_1h'), 'rappel 1h manquant');
assert(evSrc.includes('function parseWhen('), 'parseWhen manque');

// ---------- 4. Branchements ----------
assert(bmSrc.includes("require('./guildEvents')"), 'guildEvents non branché dans botManager');
assert(bmSrc.includes('handleGuildEvents'), 'handler guildEvents non branché');
assert(idxSrc.includes('runGuildEventSweep'), 'sweep non branché dans index.js');

// ---------- 5. Routes + dashboard + help ----------
assert(routesSrc.includes("router.get('/bots/:id/guilds/:guildId/events'"), 'route GET /events manquante');
assert(routesSrc.includes("router.post('/bots/:id/guilds/:guildId/events'"), 'route POST /events manquante');
assert(routesSrc.includes("router.delete('/bots/:id/guilds/:guildId/events/:eid'"), 'route DELETE /events/:eid manquante');
assert(dashSrc.includes("['events', '🎮', 'Événements']"), 'entrée module Événements manquante');
assert(dashSrc.includes('Dashboard.renderers.events = '), 'renderer events manquant');
assert(dashSrc.includes('id="ev-create"'), 'formulaire de création manquant');
assert(premadeSrc.includes('🎮 Événements & tournois (admins)'), 'section help manquante');
assert(premadeSrc.includes('HELP_EVENTS'), 'HELP_EVENTS non fusionné');

// ---------- 6. Logique réelle (db + guildEvents chargés) ----------
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v189-'));
const store = require(path.join(root, 'server/db'));
const guildEvents = require(path.join(root, 'server/discord/guildEvents'));

// 6a. Création + lecture
const id = store.guildEvents.add(1, 'g1', {
  title: 'Tournoi CODM', description: '1v1 — winner stays',
  starts_at: Date.now() + 2 * 86400000, channel_id: 'c1', ping_role: 'Joueurs', created_by: 'u9',
});
assert(id > 0, 'l’ajout doit retourner un id');
const ev = store.guildEvents.get(id);
assert(ev, 'l’événement doit être lisible');
assert.strictEqual(ev.title, 'Tournoi CODM');
assert.strictEqual(ev.ping_role, 'Joueurs');
assert.strictEqual(store.guildEvents.all(1, 'g1').length, 1);
assert.strictEqual(store.guildEvents.upcoming(1, 'g1').length, 1);

// 6b. Participants
let res = store.guildEvents.toggleParticipant(id, 'u1');
assert(res.joined === true && res.participants.length === 1, 'l’inscription doit ajouter');
res = store.guildEvents.toggleParticipant(id, 'u2');
assert(res.participants.length === 2, '2e inscription');
res = store.guildEvents.toggleParticipant(id, 'u1');
assert(res.joined === false && res.participants.length === 1, 'la désinscription doit retirer');
assert.strictEqual(store.guildEvents.participants(id).length, 1);

// 6c. parseWhen
const tz = 'Europe/Paris';
const ts = guildEvents.parseWhen('25/08 20:00', tz);
assert(ts && ts > Date.now(), 'parseWhen doit donner un futur pour cette année');
const ts2 = guildEvents.parseWhen('31/12 23:59', tz);
assert(ts2 && ts2 > Date.now(), 'parseWhen 31/12');
assert.strictEqual(guildEvents.parseWhen('zzz', tz), null, 'parseWhen invalide → null');
assert.strictEqual(guildEvents.parseWhen('32/13 99:99', tz), null, 'dates impossibles → null');

// 6d. Le payload slash contient les options attendues
const payloads = guildEvents.buildEventPayloads();
assert(payloads.some((p) => p.name === 'event'), 'payload /event absent');
const evCmd = payloads.find((p) => p.name === 'event');
const optNames = (evCmd.options || []).map((o) => o.name);
for (const wanted of ['action', 'titre', 'description', 'quand', 'salon', 'role']) {
  assert(optNames.includes(wanted), `option ${wanted} absente de /event`);
}

// 6e. Nettoyage
store.guildEvents.remove(id);
assert.strictEqual(store.guildEvents.get(id), null, 'la suppression doit fonctionner');
try { store.db.close(); } catch {}

console.log('✅ v189-test : LOT 2 — /event (créer/liste/supprimer), boutons Participer, rappels 24h/1h, module dashboard — 0 problème (logique réelle vérifiée)');
