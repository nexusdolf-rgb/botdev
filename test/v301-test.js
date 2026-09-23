// v301 — 🛡️ Confidentialité des tickets + garde-fou /help auto-réparant.
// Vérifié : un salon créé volontairement privé (tickets : @everyone refusé)
// n'est JAMAIS dévoilé au rôle vérifié (onChannelCreate), les fuites déjà
// installées sont réparées automatiquement (repairPrivateChannels, branché sur
// le balayage de 30 s), le garde-fou des commandes sans réponse déclenche un
// resync immédiat throtté à 60 s, bump 301.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v301');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ver = require('../server/discord/verification');
const logging = require('../server/discord/logging');
logging.log = async () => {}; // journalisation désactivée pour le test

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const EVERYONE = '@everyone';
const ROLE = 'roleVerifie301';
const B = 301;

function mkChan(id, { type = 0, denyAll = false, leak = false } = {}) {
  const edits = [];
  const ch = {
    id, type, name: 'c-' + id, _edits: edits,
    permissionOverwrites: {
      cache: new Map(),
      edit: async (target, perms) => {
        edits.push({ ch: id, target: String(target), perms });
        // Simule Discord : ViewChannel remis à null → l'autorisation disparaît
        // du cache (sinon le 2e passage de la réparation reverrait la fuite).
        if (perms && perms.ViewChannel === null && ch.permissionOverwrites.cache.has(String(target))) {
          ch.permissionOverwrites.cache.set(String(target), { id: String(target), deny: { has: () => false }, allow: { has: () => false } });
        }
      },
    },
  };
  if (denyAll) ch.permissionOverwrites.cache.set(EVERYONE, { id: EVERYONE, deny: { has: () => true }, allow: { has: () => false } });
  if (leak) ch.permissionOverwrites.cache.set(ROLE, { id: ROLE, deny: { has: () => false }, allow: { has: () => true } });
  return ch;
}

function mkGuild(G, channels) {
  return { id: G, name: 'g301', roles: { everyone: { id: EVERYONE } }, channels: { cache: new Map(channels.map((c) => [c.id, c])) } };
}

// ============================================================
console.log('\n— Section 1 : source verification.js —');
const vsrc = racine('server/discord/verification.js');
const idxOcc = vsrc.indexOf('async function onChannelCreate');
const onCC = vsrc.slice(idxOcc, idxOcc + 1600);
check('onChannelCreate : détection du salon déjà privé (deny @everyone)', onCC.includes('alreadyHidden'));
check('onChannelCreate : skip AVANT tout edit (return si privé)', onCC.indexOf('if (alreadyHidden) return;') > 0
  && onCC.indexOf('if (alreadyHidden) return;') < onCC.indexOf("permissionOverwrites.edit(everyone"));
check('repairPrivateChannels existe dans verification.js', vsrc.includes('async function repairPrivateChannels(botId, entry)'));
check('repairPrivateChannels : retire la fuite via ViewChannel: null', vsrc.includes('{ ViewChannel: null }'));
check('repairPrivateChannels : couvre les tickets classiques (openTickets.allForGuild)', vsrc.includes('store.openTickets.allForGuild(botId, guild.id)'));
check('repairPrivateChannels : couvre les tickets personnalisés (advanced_ticket_channels)', vsrc.includes('FROM advanced_ticket_channels WHERE bot_id = ? AND guild_id = ?'));
check('repairPrivateChannels : retire le salon de isolated_channels', vsrc.includes('if (set.delete(id)) saveCfg(guild.id, { isolated_channels: [...set] })'));
check('export : repairPrivateChannels', vsrc.includes('module.exports') && /module\.exports = \{[^}]*repairPrivateChannels/.test(vsrc));

console.log('\n— Section 2 : branchement balayage 30 s (tasks.js) —');
const tsrc = racine('server/discord/tasks.js');
const idxSweep = tsrc.indexOf('sweepVoicetemp(botId, entry)');
check('tasks.js : repairPrivateChannels appelé dans le sweep', idxSweep > 0 && tsrc.slice(idxSweep, idxSweep + 500).includes("require('./verification').repairPrivateChannels(botId, entry)"));

console.log('\n— Section 3 : comportement onChannelCreate —');
(async () => {
  const G = 'g301a';
  ver.saveCfg(G, { enabled: true, isolate: true, role: ROLE, channel: 'chVerif', isolated_channels: ['general'] });
  const guild = mkGuild(G, []);

  // 3a. Salon de ticket privé (deny @everyone à la création) → AUCUN edit
  const ticket = mkChan('ticket301', { denyAll: true });
  await ver.onChannelCreate(B, { ...ticket, guild });
  check('salon privé (ticket) : aucune permission touchée', ticket._edits.length === 0,
    JSON.stringify(ticket._edits));

  // 3b. Salon public créé pendant l'isolation → isolé normalement
  const nouveau = mkChan('nouveau301');
  await ver.onChannelCreate(B, { ...nouveau, guild });
  const targets = nouveau._edits.map((e) => e.target);
  check('salon public : deny @everyone appliqué', targets.includes(EVERYONE));
  check('salon public : allow rôle vérifié appliqué', targets.includes(ROLE));

  // 3c. Isolation désactivée → rien ne se passe même sur un salon public
  const G2 = 'g301b';
  ver.saveCfg(G2, { enabled: true, isolate: false, role: ROLE });
  const pub2 = mkChan('pub2');
  await ver.onChannelCreate(B, { ...pub2, guild: mkGuild(G2, []) });
  check('isolation OFF : aucun edit', pub2._edits.length === 0);

  // ============================================================
  console.log('\n— Section 4 : repairPrivateChannels —');
  const G3 = 'g301c';
  ver.saveCfg(G3, { enabled: true, isolate: true, role: ROLE, isolated_channels: ['tkFuite', 'general'] });

  const tkFuite = mkChan('tkFuite', { denyAll: true, leak: true });   // ticket fuité par l'ancien bug
  const tkSain = mkChan('tkSain', { denyAll: true });                  // ticket intact
  const general = mkChan('general');                                   // salon public isolé (non-ticket)
  store.openTickets.add(B, G3, { channel_id: 'tkFuite', number: 1, opener_id: 'u1', opener_tag: 'u1', type_label: 'aide', open_reason: '' });
  store.openTickets.add(B, G3, { channel_id: 'tkSain', number: 2, opener_id: 'u2', opener_tag: 'u2', type_label: 'aide', open_reason: '' });
  store.advancedTickets.bindChannel('tkAvance', B, G3, 1, 't1', 'perso', '[]', '#e07a5f');
  const tkAvance = mkChan('tkAvance', { denyAll: true, leak: true });  // ticket personnalisé fuité

  const guild3 = mkGuild(G3, [tkFuite, tkSain, general, tkAvance]);
  const entry = { client: { guilds: { cache: new Map([[G3, guild3]]) } } };
  await ver.repairPrivateChannels(B, entry);

  check('ticket fuité : allow ViewChannel retiré (null)', tkFuite._edits.some((e) => e.target === ROLE && e.perms && e.perms.ViewChannel === null),
    JSON.stringify(tkFuite._edits));
  check('ticket personnalisé fuité : réparé aussi', tkAvance._edits.some((e) => e.target === ROLE && e.perms.ViewChannel === null));
  check('ticket sain : jamais touché', tkSain._edits.length === 0);
  check('salon public isolé (non-ticket) : jamais touché', general._edits.length === 0);
  const cfg3 = ver.cfgOf(G3);
  check('isolated_channels : tkFuite retiré de la liste', !cfg3.isolated_channels.includes('tkFuite'));
  check('isolated_channels : les vrais salons isolés restent', cfg3.isolated_channels.includes('general'));

  // 4b. Idempotence : deuxième passage → plus rien à faire
  tkFuite._edits.length = 0; tkAvance._edits.length = 0;
  await ver.repairPrivateChannels(B, entry);
  check('idempotent : aucun edit au 2e passage', tkFuite._edits.length === 0 && tkAvance._edits.length === 0);

  // 4c. Isolation OFF → la réparation ne touche à rien
  const G4 = 'g301d';
  ver.saveCfg(G4, { enabled: true, isolate: false, role: ROLE });
  const tk4 = mkChan('tk4', { denyAll: true, leak: true });
  store.openTickets.add(B, G4, { channel_id: 'tk4', number: 1, opener_id: 'u', opener_tag: 'u', type_label: '', open_reason: '' });
  await ver.repairPrivateChannels(B, { client: { guilds: { cache: new Map([[G4, mkGuild(G4, [tk4])]]) } } });
  check('isolation OFF : réparation inactive', tk4._edits.length === 0);

  // 4d. Robustesse : entry sans client / guild sans channels → ne plante pas
  await ver.repairPrivateChannels(B, {});
  await ver.repairPrivateChannels(B, { client: { guilds: { cache: new Map() } } });
  check('robustesse : appel sans client/guilds → aucune exception', true);

  // ============================================================
  console.log('\n— Section 5 : garde-fou /help auto-réparant (botManager) —');
  const bsrc = racine('server/discord/botManager.js');
  const idxGuard = bsrc.indexOf('guard_not_ready');
  const guard = bsrc.slice(idxGuard, idxGuard + 1400);
  check('garde-fou : resync global immédiat', guard.includes('syncGlobalCommands(botId)'));
  check('garde-fou : resync du serveur si guildId', guard.includes('syncSlashCommands(botId, i.guildId, true)'));
  check('garde-fou : throttle 60 s par bot (guardResync)', guard.includes('now - last > 60000') && bsrc.includes('const guardResync = new Map();'));
  check('garde-fou : fire-and-forget (aucun await bloquant)', !guard.includes('await syncGlobalCommands'));

  // ============================================================
  console.log('\n— Section 6 : bump v301 —');
  const index = racine('public/index.html');
  const sw = racine('public/sw.js');
  check('index.html : ?v=315 ×7', (index.match(/\?v=315/g) || []).length === 7);
  check('sw.js : CACHE botdev-v315', sw.includes("const CACHE = 'botdev-v315';"));
  check('aucune référence v=300 restante', !index.includes('?v=300') && !sw.includes('botdev-v300'));

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n🎉 v301 : ${ok} vérifications passées`);
})().catch((e) => { console.error(e); process.exit(1); });
