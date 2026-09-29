// v340 — Après 🔒 Fermer, le créateur voit encore le salon mais ne peut plus écrire.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { PermissionFlagsBits } = require('discord.js');

const TMP = path.join(__dirname, '.tmp-v340');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const panelsSrc = racine('server/discord/panels.js');
const cmdSrc = racine('server/discord/panelCommands.js');

const store = require('../server/db');
const panels = require('../server/discord/panels');
const changelog = require('../server/discord/changelog');

console.log('— 1. Pins v340 —');
check('index.html : ?v=340 ×7', (html.match(/\?v=340/g) || []).length === 7);
check('sw.js : cache botdev-v340', sw.includes("const CACHE = 'botdev-v340';"));
check('index.html : plus aucune ?v=339', !html.includes('?v=339'));
check('VERSION = 340', changelog.VERSION === 340);
check('journal v340 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);
check('journal v340 dans la liste', changelog.VERSIONS.some((x) => x.v === 340));

console.log('— 2. Sources : ouvreur DB + verrou sans cacher —');
check('resolveOpenerId lit openTickets', panelsSrc.includes('store.openTickets.getByChannel') && panelsSrc.includes('function resolveOpenerId'));
check('lockTicketOpenerWrite garde ViewChannel', panelsSrc.includes('ViewChannel: view') && panelsSrc.includes('SendMessages: !!send'));
check('threads et fichiers aussi verrouillés', panelsSrc.includes('CreatePublicThreads: !!send') && panelsSrc.includes('AttachFiles: !!send') && panelsSrc.includes('SendMessagesInThreads: !!send'));
check('fermeture bouton utilise le verrou', /handleTicketClose[\s\S]{0,900}lockTicketOpenerWrite\(channel, openerId, \{ view: true, send: false \}/.test(panelsSrc));
check('fermeture n’enlève plus la vue', !/handleTicketClose[\s\S]{0,1200}ViewChannel:\s*false/.test(panelsSrc));
check('réouverture rend l’écriture', /handleTicketReopen[\s\S]{0,900}lockTicketOpenerWrite\(channel, openerId, \{ view: true, send: true \}/.test(panelsSrc));
check('attente verrouille l’écriture', /handleTicketHold[\s\S]{0,500}lockTicketOpenerWrite\(channel, openerId, \{ view: true, send: false \}/.test(panelsSrc));
check('auto-close verrouille l’écriture', /INACTIVE_CLOSE_MIN[\s\S]{0,400}lockTicketOpenerWrite\(channel, row\.opener_id, \{ view: true, send: false \}/.test(panelsSrc)
  || /Fermeture automatique[\s\S]{0,250}lockTicketOpenerWrite\(channel, row\.opener_id, \{ view: true, send: false \}/.test(panelsSrc));
check('repair fermé : jamais SendMessages true', /if \(row\.closed_at\) \{[\s\S]{0,450}send: false/.test(panelsSrc));
check('repair ouvert : peut encore restaurer', /row\.closed_at[\s\S]{0,700}send: true/.test(panelsSrc));
check('/ticket close utilise le même verrou', cmdSrc.includes('lockTicketOpenerWrite(ch, openerId, { view: true, send: false })'));
check('/ticket close pose closed_at', cmdSrc.includes("closed_at: new Date().toISOString()"));
check('exports publics', typeof panels.resolveOpenerId === 'function' && typeof panels.lockTicketOpenerWrite === 'function' && typeof panels.repairTicketChannel === 'function');
check('claim v339 intact', panelsSrc.includes('function replaceClaimButtonJson') && panelsSrc.includes("setLabel('🖐️ Prendre ce ticket')"));

console.log('— 3. Ouvreur : base d’abord, topic ensuite —');
const dbOpener = '111111111111111111';
const topicOpener = '222222222222222222';
store.openTickets.add(1, 'G1', {
  channel_id: 'ch-db', number: 7, opener_id: dbOpener, opener_tag: 'Bob',
  type_label: 'Aide', open_reason: '',
});
check('DB gagne sur le topic', panels.resolveOpenerId({ id: 'ch-db', topic: `| ${topicOpener} | Aide` }) === dbOpener);
check('sans ligne DB : topic', panels.resolveOpenerId({ id: 'ch-inconnu', topic: `Ticket de Bob | ${topicOpener} | Aide` }) === topicOpener);
check('rien du tout : vide', panels.resolveOpenerId({ id: 'ch-vide', topic: 'bonjour' }) === '');

console.log('— 4. Verrou d’écriture (vue conservée) —');
function makeChannel(openerId, initial) {
  const map = new Map();
  const edits = [];
  if (initial) map.set(String(openerId), initial);
  return {
    id: 'ch-lock',
    topic: `| ${openerId}`,
    permissionOverwrites: {
      cache: { get: (id) => map.get(String(id)) },
      edit: async (id, perms) => {
        edits.push({ id: String(id), perms });
        map.set(String(id), {
          deny: {
            has: (flag) => {
              if (flag === PermissionFlagsBits.SendMessages) return perms.SendMessages === false;
              if (flag === PermissionFlagsBits.ViewChannel) return perms.ViewChannel === false;
              return false;
            },
          },
          allow: {
            has: (flag) => {
              if (flag === PermissionFlagsBits.ViewChannel) return perms.ViewChannel === true;
              if (flag === PermissionFlagsBits.SendMessages) return perms.SendMessages === true;
              return false;
            },
          },
        });
      },
    },
    _edits: edits,
  };
}

(async () => {
  const opener = '333333333333333333';
  const chLock = makeChannel(opener);
  const locked = await panels.lockTicketOpenerWrite(chLock, opener, { view: true, send: false });
  const p = chLock._edits[0] && chLock._edits[0].perms;
  check('lock retourne true', locked === true);
  check('vue laissée', !!(p && p.ViewChannel === true));
  check('écriture coupée', !!(p && p.SendMessages === false));
  check('fichiers coupés', !!(p && p.AttachFiles === false));
  check('fils coupés', !!(p && p.CreatePublicThreads === false && p.SendMessagesInThreads === false));

  const chOpen = makeChannel(opener);
  await panels.lockTicketOpenerWrite(chOpen, opener, { view: true, send: true });
  const p2 = chOpen._edits[0] && chOpen._edits[0].perms;
  check('réouverture : écriture rendue', !!(p2 && p2.SendMessages === true && p2.ViewChannel === true));

  console.log('— 5. Réparation : fermé ≠ restaurer l’écriture —');
  const guild = {
    id: 'G1',
    channels: { cache: { get: () => null } },
    roles: { cache: { get: () => null, find: () => null, values: () => [] } },
  };
  const stillWriting = {
    allow: { has: (f) => f === PermissionFlagsBits.ViewChannel || f === PermissionFlagsBits.SendMessages },
    deny: { has: () => false },
  };
  const chClosed = makeChannel(opener, stillWriting);
  chClosed.id = 'ch-closed';
  const closedRow = {
    bot_id: 1, guild_id: 'G1', channel_id: chClosed.id, number: 8,
    opener_id: opener, type_label: 'Aide', closed_at: '2026-09-29T12:00:00.000Z',
  };
  await panels.repairTicketChannel(1, guild, chClosed, closedRow);
  const closedEdit = chClosed._edits.find((e) => e.id === opener);
  check('ticket fermé : le repair re-verrouille', !!(closedEdit && closedEdit.perms.SendMessages === false && closedEdit.perms.ViewChannel === true));
  check('ticket fermé : n’a pas rendu SendMessages', !chClosed._edits.some((e) => e.id === opener && e.perms.SendMessages === true));

  const alreadyDenied = {
    allow: { has: (f) => f === PermissionFlagsBits.ViewChannel },
    deny: { has: (f) => f === PermissionFlagsBits.SendMessages },
  };
  const chOk = makeChannel(opener, alreadyDenied);
  await panels.repairTicketChannel(1, guild, chOk, closedRow);
  check('déjà verrouillé : pas de second edit', chOk._edits.length === 0);

  const chLive = makeChannel(opener); // pas d’overwrite → vue absente
  chLive.id = 'ch-live';
  const openRow = {
    bot_id: 1, guild_id: 'G1', channel_id: chLive.id, number: 9,
    opener_id: opener, type_label: 'Aide', closed_at: '',
  };
  await panels.repairTicketChannel(1, guild, chLive, openRow);
  const liveEdit = chLive._edits.find((e) => e.id === opener);
  check('ticket ouvert sans vue : restore écriture', !!(liveEdit && liveEdit.perms.SendMessages === true && liveEdit.perms.ViewChannel === true));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v340 : ' + ok + ' vérifications passed.');
})().catch((e) => {
  console.error('❌', e.stack || e.message);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
