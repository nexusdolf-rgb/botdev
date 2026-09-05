// Test v213 — Barème progressif des sanctions Auto-Mod (récidives)
// --------------------------------------------------
// Par règle (caps, liens, mentions, mots, spam) : une échelle de paliers
// montant à chaque récidive dans une fenêtre glissante. Chaque palier a sa
// sanction + sa durée (muet, ban temporaire, définitif) et peut déclencher
// la blacklist du serveur (durée propre) → re-ban automatique au retour.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v228-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const automod = require('../server/discord/automod');
const db = require('fs').readFileSync('server/db.js', 'utf8');
const routes = require('fs').readFileSync('server/routes.js', 'utf8');
const panels = require('fs').readFileSync('server/discord/automod.js', 'utf8');
const tasks = require('fs').readFileSync('server/discord/tasks.js', 'utf8');
const botManager = require('fs').readFileSync('server/discord/botManager.js', 'utf8');
const dash = require('fs').readFileSync('public/js/dashboard.js', 'utf8');
const index = require('fs').readFileSync('public/index.html', 'utf8');
const sw = require('fs').readFileSync('public/sw.js', 'utf8');

let n = 0;
const check = (label, cond) => { n++; assert.ok(cond, `❌ ${label}`); console.log(`  ✅ ${label}`); };

(async () => {
  console.log('▶ v213-test.js');

  // ---------- 1. Stockage ----------
  console.log('— Stockage (config, récidives, bans temporaires) —');
  check('db : colonne am_escalation (ALTER)', /ALTER TABLE guild_settings ADD COLUMN am_escalation TEXT DEFAULT ''/.test(db));
  check('db : am_escalation dans les colonnes', db.includes("'am_blacklist_footer', 'am_escalation', 'am_native_enabled'"));
  check('db : table automod_strikes', db.includes('CREATE TABLE IF NOT EXISTS automod_strikes'));
  check('db : table automod_temp_bans', db.includes('CREATE TABLE IF NOT EXISTS automod_temp_bans'));
  check('db : exports automodStrikes/automodTempBans', /automodStrikes, automodTempBans/.test(db));
  store.guildSettings.set(213, 'G1', { am_escalation: { rules: { caps: { enabled: true, windowMin: 1440, steps: [{ after: 1, action: 'warn' }] } } } });
  check('guild_settings : objet JSON persisté', JSON.parse(store.guildSettings.get(213, 'G1').am_escalation).rules.caps.enabled === true);
  const t1 = store.automodStrikes.touch(213, 'G1', 'U1', 'caps', 1440);
  store.automodStrikes.touch(213, 'G1', 'U1', 'caps', 1440);
  const t3 = store.automodStrikes.touch(213, 'G1', 'U1', 'caps', 1440);
  check('récidives : 3 comptées dans la fenêtre', t3.count === 3 && t1.count === 1);
  store.automodStrikes.resetUser(213, 'G1', 'U1');
  check('récidives : remise à zéro', store.automodStrikes.get(213, 'G1', 'U1', 'caps').count === 0);
  store.automodTempBans.add(213, 'G1', 'U1', 'Toto', Date.now() + 60000, 'ban 1 min');
  check('ban temporaire : prévu pour plus tard (pas encore dû)', store.automodTempBans.due(213, Date.now()).length === 0);
  check('ban temporaire : dû après échéance', store.automodTempBans.due(213, Date.now() + 120000).length === 1);

  // ---------- 2. Helpers du barème ----------
  console.log('— Logique des paliers (pures) —');
  const defs = automod.defaultEscalationSteps();
  check('échelle par défaut : 4 paliers', defs.length === 4);
  check('palier 1 = avertir · palier 2 = muet 1 h', defs[0].action === 'warn' && defs[1].action === 'timeout' && defs[1].minutes === 60);
  check('dernier palier = ban définitif + blacklist', defs[3].action === 'ban' && defs[3].minutes === 0 && defs[3].blacklist === true);
  const esc = automod.escalationForRule({ am_escalation: JSON.stringify({ rules: { caps: { enabled: true, windowMin: 60, steps: [{ after: 1, action: 'warn', minutes: 0 }, { after: 2, action: 'timeout', minutes: 0 }, { after: 3, action: 'ban', minutes: 10080, blacklist: true }] } } }) }, 'caps');
  check('config lue + activée', esc.enabled === true && esc.rule === 'caps' && esc.windowMin === 60 && esc.steps.length === 3);
  check('timeout sans durée forcé à 1 h', esc.steps[1].minutes === 60);
  check('inconnu → null · désactivé → enabled false', automod.escalationForRule({}, 'caps').enabled === false && automod.escalationForRule({}, 'zzz') === null);
  check('choix du palier selon les récidives', automod.pickEscalationStep(defs, 1).after === 1 && automod.pickEscalationStep(defs, 3).after === 3 && automod.pickEscalationStep(defs, 99).after === 4);
  check('simulation non destructive (count+1)', automod.strikeCountFor(213, 'G1', 'U1', 'caps', 1440, true) === 1);

  // ---------- 3. Moteur branché ----------
  console.log('— Moteur (integration) —');
  check('moteur : applyEscalation défini', panels.includes('async function applyEscalation('));
  check('moteur : hook dans applyConfiguredAction', /const escalation = escalationForRule\(gs, detection\.rule\);[\s\S]*?return applyEscalation\(/.test(panels));
  check('moteur : suppression puis palier puis blacklist', panels.includes('sanctionResult = await applyAutoSanction(message, sanction, detection.reason, count)') && panels.includes('applyMemberBlacklist(botId, message, detection'));
  check('moteur : ban temporaire → table automodTempBans', panels.includes("store.automodTempBans.add(botId, guild.id, author.id"));
  check('tasks : levée automatique des bans temporaires', tasks.includes('store.automodTempBans.due(botId, Date.now())'));
  check('botManager : re-ban au retour si blacklist active', /memberBlacklist\.get\(botId, member\.guild\.id, member\.id\)[\s\S]*?member\.ban/.test(botManager));

  // ---------- 4. Routes ----------
  console.log('— Routes & API —');
  check('routes : helper normalizeAutomodEscalation', routes.includes('function normalizeAutomodEscalation(value)'));
  check('routes : PUT /automod accepte escalation', routes.includes("advancedFields.am_escalation = JSON.stringify(normalizeAutomodEscalation(body.escalation));"));
  check('routes : bornes (fenêtre max 525600, actions limitées)', routes.includes('AUTOMOD_ESC_ACTIONS.includes'));

  // ---------- 5. Dashboard ----------
  console.log('— Dashboard : carte « Barème » —');
  check('dash : carte dédiée présente', dash.includes('📈 Barème progressif des sanctions'));
  check('dash : toggle + fenêtre + paliers par règle', dash.includes('data-esc-on') && dash.includes('data-esc-win') && dash.includes('data-esc-steps'));
  check('dash : durées + blacklist + palier supprimable', dash.includes('data-esc-minutes') && dash.includes('data-esc-blmin') && dash.includes('data-esc-del'));
  check('dash : enregistré dans collectAutomodForm', dash.includes('escalation: collectEscalationForm()'));
  check('dash : relecture brouillon (draft.escalation)', dash.includes('automodDraft.escalation'));

  // ---------- 6. Version ----------
  check('site : bump v213 (index)', index.includes('?v=228'));
  check('site : bump v213 (sw)', sw.includes('botdev-v228'));

  console.log(`  ✅ v213 : ${n} vérifications`);
})().catch((e) => { console.error(e); process.exit(1); });
