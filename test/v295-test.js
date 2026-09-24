// v295 — 📣 /suggest et /poll réservés au staff (demande du fondateur).
// Vérifié : permission « Gérer les messages » enregistrée côté Discord
// (commande invisible aux membres), classification staff, centre d'aide
// (bloc staff, retirés des blocs publics), garde d'exécution /poll,
// bouton de vote toujours public, pin v226 adapté, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v295');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const premade = require('../server/discord/premade');
const extra = require('../server/discord/extra');
const { PermissionsBitField } = require('discord.js');

const MM = String(PermissionsBitField.Flags.ManageMessages); // '8192'

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const guild = { id: 'G', ownerId: 'owner1', members: { me: null } };
const mkMember = (has) => ({ id: 'm', permissions: { has: (p) => has } });
const membreSimple = mkMember(false);
const membreStaff = mkMember(true); // Gérer les messages (ou Admin : has() = true)

(async () => {
  const B = Number(store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' }));
  for (const k of ['moderation', 'utility', 'fun', 'economy', 'levels', 'community']) store.modules.set(B, k, 1);

  console.log('— 1. Classification —');
  check('/suggest → staff', premade.commandKind('suggest') === 'staff');
  check('/poll → staff', premade.commandKind('poll') === 'staff');
  check('/ping reste public', premade.commandKind('ping') === 'public');
  check('/kick reste staff, /giveaway reste admin', premade.commandKind('kick') === 'staff' && premade.commandKind('giveaway') === 'admin');

  console.log('— 2. Enregistrement Discord (invisible aux membres) —');
  const defS = premade.CMD_DEFS.suggest;
  check('CMD_DEFS.suggest : perms Gérer les messages', defS.perms && String(defS.perms[0]) === MM);
  check('bits combinés = Gérer les messages', premade.defaultPermissionBitsFor(defS) === BigInt(MM));
  const payloads = premade.buildSlashPayloads(B);
  const pS = payloads.find((p) => p.name === 'suggest');
  check('/suggest enregistré avec default_member_permissions = 8192', !!pS && pS.default_member_permissions === MM, JSON.stringify(pS && pS.default_member_permissions));
  const pP = extra.buildExtraPayloads().find((p) => p.name === 'poll');
  check('/poll enregistré avec default_member_permissions = 8192', !!pP && pP.default_member_permissions === MM, JSON.stringify(pP && pP.default_member_permissions));

  console.log('— 3. Visibilité dans le centre d\'aide —');
  check('/suggest invisible pour un membre simple', premade.canViewCommandName('suggest', guild, membreSimple) === false);
  check('/suggest visible pour le staff', premade.canViewCommandName('suggest', guild, membreStaff) === true);
  check('/poll invisible pour un membre simple', premade.canViewCommandName('poll', guild, membreSimple) === false);
  check('/poll visible pour le staff', premade.canViewCommandName('poll', guild, membreStaff) === true);
  check('sans contexte (dashboard) → tout est visible', premade.canViewCommandName('poll', null, null) === true);
  const staffBlock = premade.HELP_BLOCKS.find((b) => b.title.includes('Suggestions & sondages'));
  check('bloc d\'aide staff dédié (suggest + poll)', !!staffBlock && staffBlock.kind === 'staff' && staffBlock.names.includes('suggest') && staffBlock.names.includes('poll'));
  const orgBlock = premade.HELP_BLOCKS.find((b) => b.title.includes('Organisation & pratique'));
  const comBlock = premade.HELP_BLOCKS.find((b) => b.title === '💡 Communauté');
  check('/poll retiré du bloc Organisation', !!orgBlock && !orgBlock.names.includes('poll'));
  check('/suggest retiré du bloc Communauté', !!comBlock && !comBlock.names.includes('suggest'));

  console.log('— 4. Garde d\'exécution /poll —');
  const extraSrc = racine('server/discord/extra.js');
  const iPoll = extraSrc.indexOf("    case 'poll': {\n      // v295");
  check('garde staff présente dans le handler slash /poll', iPoll > 0 && extraSrc.slice(iPoll, iPoll + 900).includes('réservé au staff (permission « Gérer les messages »)'));
  check('garde : les administrateurs passent (has() inclut Admin)', extraSrc.slice(iPoll, iPoll + 900).includes('interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)'));
  const nGuards = (extraSrc.match(/\/poll est réservé au staff/g) || []).length;
  check('une seule garde : le bouton de vote reste public', nGuards === 1 && extraSrc.includes('Ce sondage est terminé.'));

  console.log('— 5. /suggest passe par la garde premade —');
  check('hasPremadeCommandPermission refuse le membre simple', premade.CMD_DEFS.suggest && !require('../server/discord/premade').canViewCommandName('suggest', guild, membreSimple));
  const suggestSrc = racine('server/discord/suggest.js');
  check('moteur de suggestions intact', suggestSrc.includes('submitSuggestion'));

  console.log('— 6. Pin v226 adapté —');
  const v226 = racine('test/v226-test.js');
  check('v226 : suggest + poll dans STAFF_NAMES', /STAFF_NAMES = \[[^\]]*'suggest', 'poll'\]/.test(v226));
  check('v226 : suggest retiré de PUBLIC_NAMES', !/PUBLIC_NAMES = \[[^\]]*'suggest'/.test(v226));

  console.log('— 7. Bump v295 —');
  const index = racine('public/index.html');
  check('index.html : ?v=317 référencé 7 fois', (index.match(/\?v=317/g) || []).length === 7,
    String((index.match(/\?v=317/g) || []).length));
  check('sw.js : cache « botdev-v317 »', racine('public/sw.js').includes("const CACHE = 'botdev-v317';"));

  console.log(`\n🎉 v295 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
