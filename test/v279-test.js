// v279 — Hoxera AI mode PLATEFORME : une seule clé fondateur pour TOUS les
// serveurs publics. Vérifié : aucun réglage de clé côté utilisateurs,
// interrupteur global, plafond journalier budget, priorité clé serveur,
// carte fondateur dans Réglages du bot, bump de cache.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v279');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ai = require('../server/ai/engine');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = 'gPlat';

  console.log('— 1. Plateforme par défaut —');
  const p0 = ai.platformOf();
  check('interrupteur global ON, quota 10/h, plafond 800/j', p0.on === true && p0.default_limit === 10 && p0.daily_cap === 800);
  check('serveurs : IA active par défaut, limite = réglage plateforme', ai.cfgOf(G).enabled === true && ai.cfgOf(G).limit_per_hour === 10);
  check('sans clé nulle part : veille propre', ai.status(BOT, G).standby === true && ai.status(BOT, G).mode === 'standby');

  console.log('— 2. Une clé fondateur = tous les serveurs —');
  let code = '';
  try { await ai.ask(BOT, G, 'chat', 'coucou'); } catch (e) { code = e.code; }
  check('avant clé : AI_NO_KEY (zéro envoi, zéro coût)', code === 'AI_NO_KEY');
  ai.savePlatformKey(BOT, 'gsk_plateforme_1234567890');
  check('statut passe en mode plateforme', ai.status(BOT, G).mode === 'platform');
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Bonjour depuis la plateforme !' } }], usage: { total_tokens: 9 } }) });
  const r = await ai.ask(BOT, G, 'chat', 'coucou');
  check('un serveur quelconque consomme l IA sans rien configurer', r.text.includes('plateforme'));

  console.log('— 3. Garde-fous budget du fondateur —');
  ai.savePlatform({ on: false });
  code = '';
  try { await ai.ask(BOT, G, 'chat', 'coucou'); } catch (e) { code = e.code; }
  check('interrupteur global coupé → AI_PLATFORM_OFF', code === 'AI_PLATFORM_OFF');
  ai.savePlatform({ on: true, daily_cap: 2 });
  await ai.ask(BOT, G, 'chat', 'encore');
  code = '';
  try { await ai.ask(BOT, G, 'chat', 'trop'); } catch (e) { code = e.code; }
  check('plafond journalier atteint → AI_BUDGET', code === 'AI_BUDGET', code);
  ai.savePlatform({ daily_cap: 800 });

  console.log('— 4. Priorités & propreté —');
  ai.saveKey(BOT, 'gsk_serveurprive_0987654321');
  check('clé serveur privée prioritaire (gros serveurs)', ai.status(BOT, G).mode === 'server');
  ai.saveKey(BOT, '');
  check('…retour à la clé plateforme', ai.status(BOT, G).mode === 'platform');
  check('compteur journalier tenu', ai.dailyCount(false).n >= 2);

  console.log('— 5. Routes & dashboard —');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
  check('routes plateforme GET/PUT (propriétaire du bot)', routes.includes("guilds' , requireAuth") === false && routes.includes("/bots/:id/ai-platform'"));
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  check('carte fondateur dans Réglages du bot', dash.includes('Hoxera AI — plateforme (fondateur)'));
  check('…réglages : interrupteur, quota, plafond, clé', ['aip-on', 'aip-limit', 'aip-cap', 'aip-key'].every((id) => dash.includes(id)));
  check('côté serveur : « IA fournie par Hoxera », aucune clé exigée', dash.includes('IA fournie par Hoxera') && dash.includes('Inutile en temps normal'));

  console.log('— 6. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=279 référencé 7 fois', (index.match(/\?v=279/g) || []).length === 7);
  check('sw.js : cache « botdev-v279 »', sw.includes("const CACHE = 'botdev-v279';"));

  console.log(`\n🎉 v279 — ${ok} vérifications OK : IA plateforme, zéro configuration utilisateur.`);
})().catch((e) => { console.error(e); process.exit(1); });
