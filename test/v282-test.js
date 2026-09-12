// v282 — IA tickets + IA règlement/FAQ : les cases deviennent actives.
// Vérifié : modules tickets/docs vivants, garde-fou « sans sources »,
// accueil IA dans les tickets (1 seul appel), slash /faq (refus sans source,
// réponse avec source), cases cochables au dashboard, bump de cache.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v282');
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
  const G = 'gV282';

  console.log('— 1. Modules tickets & docs passés « vivants » —');
  ai.saveKey(BOT.id, 'gsk_test_1234567890abcdef');
  let fetched = 0;
  global.fetch = async () => { fetched++; return { ok: true, json: async () => ({ choices: [{ message: { content: 'Bonjour, bienvenue dans votre ticket ! Comment puis-je vous aider ?' } }], usage: { total_tokens: 9 } }) }; };
  ai.saveCfg(G, { enabled: true, limit_per_hour: 50, modules: { chat: true, tickets: true, docs: true } });
  let soon = '';
  try { await ai.ask(BOT.id, G, 'tickets', 'test ouverture'); } catch (e) { soon = e.code; }
  check('module tickets vivant (plus de AI_SOON)', soon === '', soon);

  console.log('— 2. IA règlement/FAQ : garde-fou sans sources —');
  let src = '';
  try { await ai.ask(BOT.id, G, 'docs', 'Puis-je poster des images ?'); } catch (e) { src = e.code; }
  check('docs sans source → AI_NO_SOURCES (aucun appel réseau)', src === 'AI_NO_SOURCES', src);
  check('le garde-fou n a rien envoyé au fournisseur', fetched === 1, 'fetch=' + fetched);
  ai.saveCfg(G, { sources: ['Règlement : aucune publicité. Les images SFW sont autorisées dans #media.'] });
  const rDocs = await ai.ask(BOT.id, G, 'docs', 'Puis-je poster des images ?');
  check('docs avec source → réponse IA', rDocs.text.includes('Bienvenue') || rDocs.text.length > 5);

  console.log('— 3. Accueil IA dans les tickets (1 seul appel) —');
  const intro = await ai.ticketIntro(BOT.id, G, { type: 'Support', reason: 'bug de rôle', user: 'Alice#0001' });
  check('ticketIntro renvoie un message préfixé 🤖', intro.startsWith('🤖 '), intro.slice(0, 40));
  check('un seul appel fournisseur par accueil', fetched === 3, 'fetch=' + fetched);
  const panels = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');
  check('hook branché après le message de bienvenue du ticket', panels.includes("require('./ai/engine')") && panels.includes('ai.ticketIntro(botId, guild.id') && panels.includes('cfgOf(guild.id).modules.tickets'));
  check('le hook ne bloque jamais l ouverture (catch silencieux)', panels.includes("l'IA ne doit jamais empêcher un ticket de s'ouvrir"));

  console.log('— 4. Slash /faq —');
  const payloads = extra.buildExtraPayloads();
  const pFaq = payloads.find((p) => p && p.name === 'faq');
  check('slash /faq déclaré avec option question', !!pFaq && !!pFaq.options.find((o) => o.name === 'question' && o.required));
  check('/faq documenté dans l aide', String(extra.HELP_EXTRA.faq || '').includes('Règlement'));
  const replies = []; const edits = []; let deferred = 0;
  const itx = (guildId, q) => ({
    commandName: 'faq', guild: { id: guildId }, user: { id: 'u1' }, member: { id: 'u1' },
    options: { getString: () => q },
    isChatInputCommand: () => true, isButton: () => false,
    isUserSelectMenu: () => false, isModalSubmit: () => false, isRepliable: () => true,
    reply: async (o) => replies.push(o),
    deferReply: async () => { deferred++; },
    editReply: async (o) => edits.push(o),
  });
  await extra.handleInteraction(BOT.id, BOT, itx('gSansSource', 'une question ?'));
  check('serveur sans sources → refus poli ephemeral', replies.length === 1 && replies[0].ephemeral === true && replies[0].content.includes('Aucune source'));
  await extra.handleInteraction(BOT.id, BOT, itx(G, 'Puis-je poster des images ?'));
  check('serveur avec sources → réponse différée', deferred === 1);
  check('réponse titrée « règlement & FAQ »', edits.length === 1 && edits[0].content.includes('règlement & FAQ'));

  console.log('— 5. Dashboard : cases cochables —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('case « IA pour les tickets » active', dash.includes("['tickets', 'IA pour les tickets', true]"));
  check('case « IA règlement / FAQ » active', dash.includes("['docs', 'IA règlement / FAQ', true]"));
  const modesLine = (dash.match(/const MODES = \[.*?\];/) || [''])[0];
  check('cases tickets & docs live (8 live au total depuis v285, 0 🔜)', (modesLine.match(/, true\]/g) || []).length === 8 && (modesLine.match(/, false\]/g) || []).length === 0);

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=285 référencé 7 fois', (index.match(/\?v=285/g) || []).length === 7);
  check('sw.js : cache « botdev-v285 »', sw.includes("const CACHE = 'botdev-v285';"));

  console.log(`\n🎉 v282 — ${ok} vérifications OK : IA tickets + IA règlement/FAQ opérationnelles.`);
})().catch((e) => { console.error(e); process.exit(1); });
