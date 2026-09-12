// v287 — Correctif « je n'arrive pas à joindre le service IA » : Groq a retiré
// les modèles Llama le 16/08/2026. Vérifié : nouveau modèle par défaut,
// migration automatique des configs enregistrées, erreurs fournisseur
// traduites (clé refusée / limite gratuite / modèle retiré), repli automatique
// sur le modèle recommandé, messages visibles sur Discord, dashboard à jour.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v287');
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
  const G = 'gV287';
  ai.saveKey(BID, 'gsk_test_1234567890abcdef');
  ai.saveCfg(G, { enabled: true, limit_per_hour: 50, modules: { chat: true, docs: true }, sources: ['règlement'] });

  console.log('— 1. Modèles Groq à jour —');
  check('modèle par défaut = GPT-OSS 120B', ai.DEFAULT_CFG.model === 'openai/gpt-oss-120b');
  const groqModels = ai.PROVIDERS.groq.models.map(([m]) => m);
  check('plus aucun modèle Llama retiré dans la liste Groq', !groqModels.includes('llama-3.3-70b-versatile') && !groqModels.includes('llama-3.1-8b-instant'));
  ai.saveCfg(G, { model: 'llama-3.3-70b-versatile' });
  check('migration auto : ancien modèle enregistré → GPT-OSS 120B', ai.cfgOf(G).model === 'openai/gpt-oss-120b', ai.cfgOf(G).model);
  ai.saveCfg(G, { model: 'llama-3.1-8b-instant' });
  check('migration auto : 8b-instant → GPT-OSS 20B', ai.cfgOf(G).model === 'openai/gpt-oss-20b');
  ai.saveCfg(G, { model: 'openai/gpt-oss-120b' });

  console.log('— 2. Erreurs fournisseur traduites —');
  const fail = (status, message) => { global.fetch = async () => ({ ok: false, status, json: async () => ({ error: { message } }) }); };
  let code = '';
  fail(401, 'invalid api key');
  try { await ai.ask(BID, G, 'chat', 'test'); } catch (e) { code = e.code; }
  check('clé refusée (401) → AI_BAD_KEY', code === 'AI_BAD_KEY', code);
  fail(429, 'rate limit');
  code = ''; try { await ai.ask(BID, G, 'chat', 'test'); } catch (e) { code = e.code; }
  check('limite gratuite (429) → AI_LIMIT', code === 'AI_LIMIT', code);
  fail(404, 'model not found');
  code = ''; try { await ai.ask(BID, G, 'chat', 'test'); } catch (e) { code = e.code; }
  check('modèle retiré (404) → AI_MODEL', code === 'AI_MODEL', code);

  console.log('— 3. Repli automatique sur le modèle recommandé —');
  ai.saveCfg(G, { model: 'qwen/qwen3-32b' });
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    if (calls.length === 1) return { ok: false, status: 400, json: async () => ({ error: { message: 'model qwen/qwen3-32b not available' } }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Bonjour, ici GPT-OSS.' } }], usage: { total_tokens: 7 } }) };
  };
  const r = await ai.ask(BID, G, 'chat', 'salut');
  check('modèle rejeté → 2e essai réussi sans intervention', r.text.includes('GPT-OSS') && calls.length === 2);
  check('le repli utilise bien le modèle recommandé', calls[1].model === ai.FALLBACK_MODEL, calls[1].model);
  ai.saveCfg(G, { model: 'openai/gpt-oss-120b' });
  calls.length = 0;
  global.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return { ok: false, status: 400, json: async () => ({ error: { message: 'x' } }) }; };
  code = ''; try { await ai.ask(BID, G, 'chat', 'test'); } catch (e) { code = e.code; }
  check('déjà sur le modèle recommandé → pas de boucle (1 seul appel)', code === 'AI_MODEL' && calls.length === 1, code + '/' + calls.length);

  console.log('— 4. Sur Discord : des messages clairs, plus de message vague —');
  const replies = [];
  const m = {
    guild: { id: G }, author: { bot: false, id: 'u1' },
    member: { user: { id: 'u1' }, roles: { cache: new Map() } },
    mentions: { users: { has: () => true } },
    content: '<@bot> salut',
    channel: { id: 'c1', sendTyping: async () => {} },
    reply: async (o) => replies.push(o),
    client: { user: { id: 'botid' } },
  };
  fail(401, 'invalid api key');
  await ai.onMessage(BID, m);
  check('mention + clé refusée → l explication s affiche dans le salon', replies.length === 1 && replies[0].content.includes('refusée par le fournisseur'));
  fail(429, 'rate limit');
  await ai.onMessage(BID, m);
  check('mention + limite gratuite → message dédié', replies.length === 2 && replies[1].content.includes('limite gratuite'));
  const itx = {
    commandName: 'faq', guild: { id: G }, user: { id: 'u1' }, member: { id: 'u1' },
    options: { getString: () => 'question ?' },
    isChatInputCommand: () => true, isButton: () => false,
    isUserSelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true,
    reply: async () => {}, deferReply: async () => {},
    editReply: async (o) => replies.push(o),
  };
  fail(404, 'model not found');
  ai.saveCfg(G, { model: 'modele/inconnu-xx' }); // pas groq-fallback : modèle ≠ FALLBACK mais provider groq → fallback rejoué puis AI_MODEL si le 2e échoue
  await extra.handleInteraction(BID, BOT, itx);
  check('/faq + modèle retiré → explique quoi faire', replies.length === 3 && replies[2].content.includes("n existe plus"));

  console.log('— 5. Dashboard & version —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('liste Groq du dashboard à jour (GPT-OSS 120B en tête)', dash.includes("groq: [['openai/gpt-oss-120b'") && !dash.includes('llama-3.3-70b-versatile'));
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=288 référencé 7 fois', (index.match(/\?v=288/g) || []).length === 7);
  check('sw.js : cache « botdev-v288 »', sw.includes("const CACHE = 'botdev-v288';"));

  console.log(`\n🎉 v287 — ${ok} vérifications OK : IA de nouveau joignable avec une clé valide.`);
})().catch((e) => { console.error(e); process.exit(1); });
