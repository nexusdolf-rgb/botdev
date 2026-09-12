// v278 — Hoxera AI : moteur centralisé + section dashboard + IA conversationnelle.
// Vérifié : config par serveur, mode veille sans clé, quota horaire, journal &
// stats, slash /ai, hook messages isolé, section dashboard, bump de cache.
// Et surtout : sans clé, RIEN ne part chez un fournisseur (plan gratuit sûr).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v278');
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
  const G = 'gAI';

  console.log('— 1. Moteur & plans gratuits —');
  check('fournisseurs gratuits présents (groq, gemini, openrouter)', !!ai.PROVIDERS.groq && !!ai.PROVIDERS.gemini && !!ai.PROVIDERS.openrouter);
  check('modèle gratuit pro par défaut (GPT-OSS 120B depuis v287)', ai.DEFAULT_CFG.provider === 'groq' && ai.DEFAULT_CFG.model === 'openai/gpt-oss-120b');
  check('8 modules IA déclarés', ai.MODULES.length === 8);
  check('config par serveur : activée par défaut (bot public)', ai.cfgOf(G).enabled === true);

  console.log('— 2. Mode veille : sans clé, rien ne part —');
  check('statut « en veille » sans clé', ai.status(BOT, G).standby === true);
  ai.saveCfg(G, { enabled: true });
  let code = '';
  try { await ai.ask(BOT, G, 'chat', 'coucou'); } catch (e) { code = e.code; }
  check('appel sans clé → AI_NO_KEY (aucun appel réseau)', code === 'AI_NO_KEY', code);

  console.log('— 3. Appel réel simulé (fetch factice) —');
  ai.saveKey(BOT, 'gsk_test_1234567890abcdef');
  let fetched = 0;
  global.fetch = async (url) => { fetched++; String(url); return { ok: true, json: async () => ({ choices: [{ message: { content: 'Bonjour, je suis Hoxera AI !' } }], usage: { total_tokens: 12 } }) }; };
  const r = await ai.ask(BOT, G, 'chat', 'coucou');
  check('réponse IA reçue', r.text.includes('Hoxera AI'), r.text);
  check('un seul appel fournisseur', fetched === 1);
  check('journal alimenté', ai.logsOf(G)[0].ok === true);
  check('statistiques alimentées', (ai.statsOf(G).calls || 0) === 1 && (ai.statsOf(G).tokens || 0) === 12);

  console.log('— 4. Quota horaire par serveur —');
  ai.saveCfg(G, { limit_per_hour: 2 });
  await ai.ask(BOT, G, 'chat', 'encore');
  let qcode = '';
  try { await ai.ask(BOT, G, 'chat', 'trop'); } catch (e) { qcode = e.code; }
  check('3e appel dans l heure → AI_QUOTA', qcode === 'AI_QUOTA', qcode);
  ai.saveCfg(G, { limit_per_hour: 50 });

  console.log('— 5. IA conversationnelle dans Discord —');
  const replies = [];
  const m = {
    guild: { id: G }, author: { bot: false, id: 'u1' },
    member: { user: { id: 'u1' }, roles: { cache: new Map() } },
    mentions: { users: { has: () => true } },
    content: '<@bot> salut toi',
    channel: { id: 'c1', sendTyping: async () => {} },
    reply: async (o) => replies.push(o),
    client: { user: { id: 'botid' } },
  };
  await ai.onMessage(BOT, m);
  check('mention → réponse IA dans le salon', replies.length === 1 && replies[0].content.includes('Hoxera AI'));
  const replies2 = replies.length;
  await ai.onMessage(BOT, { ...m, mentions: { users: { has: () => false } } });
  check('sans mention (mode mention_only) → silence', replies.length === replies2);
  const payloads = extra.buildExtraPayloads();
  check('slash /ai déclaré', !!payloads.find((p) => p && p.name === 'ai'));
  check('hook message branché dans botManager', fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'botManager.js'), 'utf8').includes("require('../ai/engine').onMessage"));

  console.log('— 6. Routes & dashboard —');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('routes config / clé / test / journal', routes.includes("/ai/key'") && routes.includes("/ai/test'") && routes.includes("/ai/logs'") && routes.includes("guilds/:guildId/ai'"));
  check('clé jamais renvoyée au dashboard', routes.includes("key: ''"));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('module dashboard « Hoxera AI »', dash.includes("['ai', '🤖', 'Hoxera AI']"));
  check('renderer Hoxera AI', dash.includes('Dashboard.renderers.ai ='));
  check('…7 réglages demandés présents', ['ai-enabled', 'ai-channels', 'ai-roles', 'ai-limit', 'ai-model', 'ai-sources', 'ai-logs'].every((id) => dash.includes(id)));

  console.log('— 7. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=288 référencé 7 fois', (index.match(/\?v=288/g) || []).length === 7);
  check('sw.js : cache « botdev-v288 »', sw.includes("const CACHE = 'botdev-v288';"));

  console.log(`\n🎉 v278 — ${ok} vérifications OK : Hoxera AI centralisée, plan gratuit, veille sans clé.`);
})().catch((e) => { console.error(e); process.exit(1); });
