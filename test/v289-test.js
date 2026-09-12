// v289 — Retrait COMPLET du système IA (demande du fondateur).
// Vérifié : moteur supprimé, plus aucune commande IA, plus aucun hook
// (messages, tickets, automod, balayage), plus de routes IA, plus de module
// 🤖 au dashboard, carte plateforme retirée des Réglages du bot — et tout le
// reste du bot intact (tickets, sauvegarde, reaction roles, sticky…).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v289');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  console.log('— 1. Moteur & fichiers supprimés —');
  check('dossier server/ai supprimé', !fs.existsSync(path.join(__dirname, '..', 'server', 'ai')));
  check('server/discord/aisafety.js supprimé', !fs.existsSync(path.join(__dirname, '..', 'server', 'discord', 'aisafety.js')));
  const refs = [];
  for (const f of ['server/discord/botManager.js', 'server/discord/extra.js', 'server/discord/panels.js', 'server/discord/automod.js', 'server/discord/tasks.js', 'server/routes.js', 'public/js/dashboard.js']) {
    if (/ai\/engine|ai\/images|aisafety/.test(read(f))) refs.push(f);
  }
  check('aucune référence au moteur dans le code', refs.length === 0, refs.join(','));

  console.log('— 2. Commandes Discord supprimées —');
  const extra = require('../server/discord/extra');
  const names = extra.buildExtraPayloads().map((p) => p && p.name);
  for (const cmd of ['ai', 'faq', 'verifier', 'image', 'resume', 'activite', 'traduire', 'annonce']) {
    check(`slash /${cmd} retiré`, !names.includes(cmd));
  }
  const extraSrc = read('server/discord/extra.js');
  check('aucune commande IA dans EXTRA_CMDS', !/'ai'|'faq'|'verifier'|'image'|'resume'|'activite'|'traduire'|'annonce'/.test(extraSrc.match(/const EXTRA_CMDS = new Set\(\[[^\]]*\]\);/)[0]));
  check('HELP purgée des entrées IA', !extraSrc.includes('Hoxera AI'));

  console.log('— 3. Hooks retirés (messages, tickets, automod, balayage) —');
  check('botManager : plus de hook IA sur les messages', !read('server/discord/botManager.js').includes('../ai/engine'));
  check('panels : plus d accueil IA ni de résumé IA dans les tickets', !read('server/discord/panels.js').includes('ticketIntro') && !read('server/discord/panels.js').includes('ticketSummary'));
  check('automod : plus de deuxième avis IA', !read('server/discord/automod.js').includes('review(botId, message, meta)'));
  check('tasks : plus de bulletin hebdomadaire IA', !read('server/discord/tasks.js').includes('bulletinSweep'));

  console.log('— 4. Routes API supprimées —');
  const routes = read('server/routes.js');
  check('routes ai-platform retirées', !routes.includes('ai-platform'));
  check('routes guild …/ai retirées', !/guildId\/ai/.test(routes));
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api', require('../server/routes'));
  check('le montage des routes démarre sans erreur', true);

  console.log('— 5. Dashboard nettoyé —');
  const dash = read('public/js/dashboard.js');
  check('module 🤖 retiré de la navigation', !dash.includes("['ai', '🤖', 'Hoxera AI']"));
  check('renderer IA supprimé', !dash.includes('Dashboard.renderers.ai'));
  check('carte plateforme retirée des Réglages du bot', !dash.includes('aip-key') && !dash.includes('Hoxera AI'));
  check('cases IA (data-aimod) supprimées', !dash.includes('data-aimod'));
  check('bulletin/personnalités/salons images supprimés', !dash.includes('ai-bulletin') && !dash.includes('personaMap') && !dash.includes('ai-image-channels'));

  console.log('— 6. Le reste du bot est intact —');
  check('tickets : ouverture et prise en charge toujours là', read('server/discord/panels.js').includes('async function openTicket') && read('server/discord/panels.js').includes('async function handleTicketClaim'));
  check('sauvegarde de structure v280 conservée', fs.existsSync(path.join(__dirname, '..', 'server', 'discord', 'backup.js')) && dash.includes('bk-create'));
  check('reaction roles v277 conservés', dash.includes('rr-send') && routes.includes('reaction_roles'));
  check('sticky v276 conservé', names.includes('sticky') && fs.existsSync(path.join(__dirname, '..', 'server', 'discord', 'sticky.js')));
  check('commandes fun/économie conservées', ['marry', 'work', 'poll', 'top'].every((c) => names.includes(c)));

  console.log('— 7. Version —');
  const index = read('public/index.html');
  const sw = read('public/sw.js');
  check('index.html : ?v=293 référencé 7 fois', (index.match(/\?v=293/g) || []).length === 7);
  check('sw.js : cache « botdev-v293 »', sw.includes("const CACHE = 'botdev-v293';"));

  console.log(`\n🎉 v289 — ${ok} vérifications OK : système IA retiré partout, bot intact.`);
})().catch((e) => { console.error(e); process.exit(1); });
