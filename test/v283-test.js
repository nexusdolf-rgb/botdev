// v283 — IA de modération + détection spam & abus (deuxième avis IA).
// Philosophie « bot pro » vérifiée : les règles (automod) sanctionnent seules,
// l'IA n'arrive qu'APRÈS, en avis consultatif dans les logs, avec garde-fous
// (1 avis/heure/membre, module désactivable, jamais bloquant) + /verifier staff.
// Vérifié aussi : BUG de sauvegarde des cases IA corrigé (toutes les cases
// live sont enregistrées, plus seulement « chat ») et modules regroupés.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v283');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ai = require('../server/ai/engine');
const extra = require('../server/discord/extra');
const logging = require('../server/discord/logging');
const safety = require('../server/discord/aisafety');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const BID = BOT.id;
  const G = 'gV283';

  console.log('— 1. Modules mod & antispam passés « vivants » —');
  ai.saveKey(BID, 'gsk_test_1234567890abcdef');
  let fetched = 0;
  global.fetch = async () => { fetched++; return { ok: true, json: async () => ({ choices: [{ message: { content: 'Verdict : publicité non sollicitée. Recommandation : avertissement.' } }], usage: { total_tokens: 8 } }) }; };
  ai.saveCfg(G, { enabled: true, limit_per_hour: 50, modules: { chat: true, tickets: true, docs: true, mod: true, antispam: true }, sources: ['règlement'] });
  let c1 = ''; try { await ai.ask(BID, G, 'mod', 'test'); } catch (e) { c1 = e.code; }
  check('module mod vivant (plus de AI_SOON)', c1 === '', c1);
  let c2 = ''; try { await ai.ask(BID, G, 'antispam', 'test'); } catch (e) { c2 = e.code; }
  check('module antispam vivant (plus de AI_SOON)', c2 === '', c2);

  console.log('— 2. Deuxième avis IA après détection automod —');
  const logs = [];
  logging.log = async (botId, guild, o) => { logs.push(o); };
  const msg = (uid, gid, content) => ({ guild: { id: gid }, author: { id: uid, tag: 'Spam#0001', bot: false }, content });
  safety._test.lastReview.clear();
  ai.saveCfg(G, { modules: { antispam: false } });
  await safety.review(BID, msg('u1', G, 'achetez mes followers'), { rule: 'links' });
  check('module antispam décoché → aucun appel IA', fetched === 2, 'fetch=' + fetched);
  ai.saveCfg(G, { modules: { antispam: true } });
  await safety.review(BID, msg('u1', G, 'achetez mes followers pas cher http://x'), { rule: 'links' });
  check('détection automod + module coché → 1 avis IA', fetched === 3, 'fetch=' + fetched);
  check('avis publié dans le journal (titre dédié)', logs.length === 1 && logs[0].title.includes('Deuxième avis IA') && logs[0].description.includes('règle « links »'));
  await safety.review(BID, msg('u1', G, 'encore du spam'), { rule: 'spam' });
  check('refroidissement : 2e détection du même membre sous 1 h → silence', fetched === 3, 'fetch=' + fetched);
  await safety.review(BID, msg('u2', G, 'autre membre'), { rule: 'spam' });
  check('un autre membre reçoit bien son propre avis', fetched === 4, 'fetch=' + fetched);
  const before = fetched;
  await safety.review(BID, msg('u3', G, 'clic test dashboard'), { rule: 'spam', observed: 1 });
  check('test forcé du dashboard (observed) → aucun appel IA', fetched === before, 'fetch=' + fetched);
  const automod = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'automod.js'), 'utf8');
  check('hook branché dans recordAction (jamais bloquant)', automod.includes("require('./aisafety').review(botId, message, meta)"));

  console.log('— 3. Slash /verifier (réservé staff) —');
  const payloads = extra.buildExtraPayloads();
  const pV = payloads.find((p) => p && p.name === 'verifier');
  check('slash /verifier déclaré avec option message requise', !!pV && !!pV.options.find((o) => o.name === 'message' && o.required));
  check('/verifier documenté dans l aide', String(extra.HELP_EXTRA.verifier || '').includes('staff'));
  const replies = []; const edits = [];
  const itx = (permsOk, q) => ({
    commandName: 'verifier', guild: { id: G }, user: { id: 'u1' }, member: { id: 'u1' },
    options: { getString: () => q },
    memberPermissions: { has: (p) => permsOk && p === 'ManageMessages' },
    isChatInputCommand: () => true, isButton: () => false,
    isUserSelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true,
    reply: async (o) => replies.push(o),
    deferReply: async () => {},
    editReply: async (o) => edits.push(o),
  });
  await extra.handleInteraction(BID, BOT, itx(false, 'un message douteux'));
  check('membre sans « Gérer les messages » → refus éphémère', replies.length === 1 && replies[0].ephemeral === true && replies[0].content.includes('réservé au staff'));
  ai.saveCfg(G, { modules: { mod: false } });
  await extra.handleInteraction(BID, BOT, itx(true, 'un message douteux'));
  check('module mod décoché → invitation à l activer', replies.length === 2 && replies[1].content.includes('IA de modération'));
  ai.saveCfg(G, { modules: { mod: true } });
  await extra.handleInteraction(BID, BOT, itx(true, 'achetez mes followers pas cher'));
  check('staff + module coché → second avis IA (éphémère)', edits.length === 1 && edits[0].content.includes('Second avis IA'));

  console.log('— 4. Dashboard : organisation & bug de sauvegarde corrigé —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  const modesLine = (dash.match(/const MODES = \[.*?\];/) || [''])[0];
  check('cases mod & antispam live (6 live au total depuis v284, 2 🔜)', (modesLine.match(/, true\]/g) || []).length === 6 && (modesLine.match(/, false\]/g) || []).length === 2);
  check('modules regroupés par usage (Conversation & support / Sécurité & modération / Prochaines versions)', dash.includes('💬 Conversation & support') && dash.includes('🛡️ Sécurité & modération') && dash.includes('🔜 Prochaines versions'));
  check('chaque case live a une phrase d explication', dash.includes('const MODE_HELP = {') && dash.includes("antispam: 'Après une détection"));
  check('BUG corrigé : TOUTES les cases live sont sauvegardées (plus seulement chat)', dash.includes('modules: Object.fromEntries(MODES.map(([id, , live]) => [id, live ?') && !dash.includes("id === 'chat' ? cMod.querySelector"));
  check('carte Sources à jour (/faq existe, plus « version suivante »)', dash.includes('la commande /faq répond uniquement à partir de ces textes'));

  console.log('— 5. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=284 référencé 7 fois', (index.match(/\?v=284/g) || []).length === 7);
  check('sw.js : cache « botdev-v284 »', sw.includes("const CACHE = 'botdev-v284';"));

  console.log(`\n🎉 v283 — ${ok} vérifications OK : IA modération + spam/abus en second avis, dashboard réorganisé.`);
})().catch((e) => { console.error(e); process.exit(1); });
