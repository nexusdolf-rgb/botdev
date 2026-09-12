// v286 — IA qui répond toujours + questions sans mention + flux ticket complet.
// Vérifié : plus jamais de silence après « est en train d'écrire… » (le bot
// explique pourquoi), mode answer_questions (détection fr/en, cooldown
// 2 min/salon), ticketIntro pose 2-3 questions, ticketSummary à la prise en
// charge (hook panels), route + dashboard + bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v286');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ai = require('../server/ai/engine');
const extra = require('../server/discord/extra');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const BID = BOT.id;
  const G = 'gV286';

  console.log('— 1. Détection de questions (fr + en) —');
  check('config : answer_questions = false par défaut', ai.DEFAULT_CFG.answer_questions === false);
  check('« Pourquoi le ciel est bleu ? » → question', ai.isQuestion('Pourquoi le ciel est bleu ?') === true);
  check('« comment je crée un ticket » (sans ?) → question', ai.isQuestion('comment je crée un ticket') === true);
  check('« how do I invite the bot » → question', ai.isQuestion('how do I invite the bot') === true);
  check('« salut tout le monde » → pas une question', ai.isQuestion('salut tout le monde') === false);
  check('« merci beaucoup » → pas une question', ai.isQuestion('merci beaucoup') === false);
  check('message très long (> 400) → pas traité en question', ai.isQuestion('a'.repeat(500)) === false);

  console.log('— 2. Plus jamais de silence après « écrit… » —');
  const mk = (over = {}) => {
    const replies = [];
    return {
      replies,
      m: {
        guild: { id: over.g || G }, author: { bot: false, id: 'u1', tag: 'A#1' },
        member: { user: { id: 'u1' }, roles: { cache: new Map() } },
        mentions: { users: { has: () => over.mention !== false } },
        content: over.content !== undefined ? over.content : '<@bot> salut ça va ?',
        channel: { id: over.c || 'c1', sendTyping: async () => {} },
        reply: async (o) => replies.push(o),
        client: { user: { id: 'botid' } },
      },
    };
  };
  // pas de clé → l'ancien comportement se taisait ; maintenant il explique
  ai.saveCfg(G, { enabled: true, limit_per_hour: 50, modules: { chat: true, tickets: true } });
  let t1 = mk();
  await ai.onMessage(BID, t1.m);
  check('mention + IA en veille → message explicatif (au lieu du silence)', t1.replies.length === 1 && t1.replies[0].content.includes('en veille'));
  ai.saveKey(BID, 'gsk_test_1234567890abcdef');
  let fetched = 0;
  global.fetch = async () => { fetched++; return { ok: true, json: async () => ({ choices: [{ message: { content: 'Bonjour ! Je vais bien, et vous ?' } }], usage: { total_tokens: 8 } }) }; };
  let t2 = mk();
  await ai.onMessage(BID, t2.m);
  check('mention + clé OK → réponse normale', t2.replies.length === 1 && t2.replies[0].content.includes('Bonjour'));

  console.log('— 3. Questions SANS mention (option) —');
  ai._test.qCooldown.clear();
  let t3 = mk({ mention: false, content: 'Pourquoi mon rôle ne s affiche pas ?', c: 'cA' });
  await ai.onMessage(BID, t3.m);
  check('option décochée (défaut) → silence sans mention', t3.replies.length === 0 && fetched === 1);
  ai.saveCfg(G, { answer_questions: true });
  ai._test.qCooldown.clear();
  let t4 = mk({ mention: false, content: 'Pourquoi mon rôle ne s affiche pas ?', c: 'cA' });
  await ai.onMessage(BID, t4.m);
  check('option cochée + question → réponse sans mention', t4.replies.length === 1 && t4.replies[0].content.includes('Bonjour'));
  let t5 = mk({ mention: false, content: 'Comment je change mon pseudo ?', c: 'cA' });
  await ai.onMessage(BID, t5.m);
  check('refroidissement : 2e question du même salon < 2 min → silence', t5.replies.length === 0);
  let t6 = mk({ mention: false, content: 'Comment je change mon pseudo ?', c: 'cB' });
  await ai.onMessage(BID, t6.m);
  check('un autre salon a son propre refroidissement', t6.replies.length === 1);
  ai._test.qCooldown.clear();
  let t7 = mk({ mention: false, content: 'salut tout le monde', c: 'cC' });
  await ai.onMessage(BID, t7.m);
  check('message sans question → silence (pas de spam)', t7.replies.length === 0);

  console.log('— 4. Flux ticket : accueil puis résumé staff —');
  check('ticketIntro demande DEUX OU TROIS questions', String(fs.readFileSync(path.join(__dirname, '..', 'server', 'ai', 'engine.js'), 'utf8')).includes('DEUX OU TROIS questions'));
  const summary = await ai.ticketSummary(BID, G, 'Alice : bonjour, je n ai plus accès au salon VIP\nHoxera : quelles informations manque-t-il ?');
  check('ticketSummary → résumé préfixé + passage de relais au staff', summary.startsWith('🤖 **Résumé pour le staff**') && summary.includes('je vous laisse la main'));
  const panels = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');
  check('hook branché dans handleTicketClaim (après le panneau de prise en charge)', panels.includes('aiC.ticketSummary(botId, guild.id, lines)') && panels.includes("modules.tickets"));
  check('hook non bloquant (catch dédié)', panels.includes("l'IA ne doit jamais gêner la prise en charge"));

  console.log('— 5. Route & dashboard —');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('route IA accepte answer_questions', routes.includes("typeof b.answer_questions === 'boolean'"));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('case « Répondre aussi aux questions posées SANS mention »', dash.includes('id="ai-answerq"') && dash.includes('1 réponse max toutes les 2 minutes par salon'));
  check('sauvegarde : answer_questions collecté', dash.includes("answer_questions: cEng.querySelector('#ai-answerq').checked"));

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=287 référencé 7 fois', (index.match(/\?v=287/g) || []).length === 7);
  check('sw.js : cache « botdev-v287 »', sw.includes("const CACHE = 'botdev-v287';"));

  console.log(`\n🎉 v286 — ${ok} vérifications OK : l IA répond toujours, questions sans mention, flux ticket complet.`);
})().catch((e) => { console.error(e); process.exit(1); });
