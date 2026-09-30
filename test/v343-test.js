// v343 — Captcha privé : salon invisible, fil privé, isolation forcée, tickets masqués.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ChannelType } = require('discord.js');

const TMP = path.join(__dirname, '.tmp-v343');
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
const dash = racine('public/js/dashboard.js');
const verSrc = racine('server/discord/verification.js');
const routes = racine('server/routes.js');
const apercu = racine('docs/apercu-captcha.html');

require('../server/db');
const ver = require('../server/discord/verification');
const changelog = require('../server/discord/changelog');

console.log('— 1. Pins v343 —');
check('index.html : ?v=343 ×7', (html.match(/\?v=343/g) || []).length === 7);
check('sw.js : cache botdev-v343', sw.includes("const CACHE = 'botdev-v343';"));
check('index.html : plus aucune ?v=342', !html.includes('?v=342'));
check('VERSION = 343', changelog.VERSION === 343);
check('journal v343 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);

console.log('— 2. Sources : privé + isolation —');
check('lock : @everyone ViewChannel false', verSrc.includes('ViewChannel: false') && verSrc.includes('lockCaptchaChannel'));
{
  const startFn = verSrc.slice(verSrc.indexOf('async function startCaptcha'), verSrc.indexOf('async function succeedCaptcha'));
  check('startCaptcha n’ouvre pas @everyone', !/edit\(\s*everyone[\s\S]{0,120}ViewChannel:\s*true/.test(startFn));
}
check('fil privé ChannelType.PrivateThread', verSrc.includes('ChannelType.PrivateThread'));
check('restrictMember masque le serveur', verSrc.includes('function restrictMember') && verSrc.includes('captcha : serveur masqué'));
check('tickets jamais View au rôle vérifié', verSrc.includes('isPrivateTicketChannel') && verSrc.includes('isThreadType(ch) || isPrivateTicketChannel(ch)'));
check('PUT force isolate si captcha', routes.includes('if (nextCaptcha) patch.isolate = true'));
check('dashboard : fil privé / isolation', dash.includes('fil privé') && dash.includes('tickets compris'));
check('bouton humain toujours là', dash.includes('id="ver-send"') && verSrc.includes('hxver:'));
check('aperçu : privé', apercu.includes('fil privé') || apercu.includes('Personne d’autre ne voit'));

console.log('— 3. startCaptcha : salon fermé + fil privé —');
(async () => {
  const G = 'g343';
  ver.saveCfg(G, {
    enabled: true, captcha: true, isolate: true,
    channel: 'chCap', captcha_channel: 'chCap', captcha_role: 'rV',
  });
  const edits = [];
  const threads = [];
  const sent = [];
  const memberEdits = [];
  const chCap = {
    id: 'chCap',
    type: 0,
    parentId: 'cat1',
    send: async (p) => { sent.push({ where: 'channel', p }); return { id: 'pub' }; },
    permissionOverwrites: {
      edit: async (id, perms) => { edits.push({ id: String(id), perms }); },
      delete: async () => {},
    },
    threads: {
      create: async (opts) => {
        threads.push(opts);
        return {
          id: 'thPriv',
          members: { add: async () => {} },
          send: async (p) => { sent.push({ where: 'thread', p }); return { id: 'tmsg' }; },
        };
      },
    },
  };
  const cat = {
    id: 'cat1', type: 4, parentId: null,
    permissionOverwrites: { edit: async (id, perms) => { edits.push({ id: String(id), ch: 'cat1', perms }); } },
  };
  const ticket = {
    id: 'tick1', type: 0, parentId: 'cat1', topic: 'Ticket #12 de Alex',
    permissionOverwrites: { edit: async (id, perms) => { edits.push({ id: String(id), ch: 'tick1', perms }); } },
  };
  const general = {
    id: 'gen1', type: 0, parentId: 'cat1',
    permissionOverwrites: { edit: async (id, perms) => { edits.push({ id: String(id), ch: 'gen1', perms }); } },
  };
  const guild = {
    id: G, name: 'AyAyTR',
    roles: { cache: new Map([['rV', { id: 'rV', name: 'Vérifié' }]]), everyone: { id: 'everyone' } },
    channels: { cache: new Map([['chCap', chCap], ['cat1', cat], ['tick1', ticket], ['gen1', general]]) },
    members: { me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } } },
  };
  const member = {
    id: 'uNew', guild,
    roles: { cache: new Map(), add: async () => {}, highest: { position: 1 } },
    user: {
      id: 'uNew', bot: false, username: 'Alex', globalName: 'Alex',
      displayAvatarURL: () => '', send: async () => {},
    },
    permissionsIn: () => ({ has: () => true }),
    edit: async (p) => { memberEdits.push(p); },
    kick: async () => {},
  };
  const okStart = await ver.startCaptcha(1, member);
  check('startCaptcha a réussi', okStart === true);
  const everyoneEdits = edits.filter((e) => e.id === 'everyone');
  check('@everyone n’a jamais ViewChannel true', everyoneEdits.every((e) => e.perms.ViewChannel !== true));
  check('@everyone a ViewChannel false sur le captcha', everyoneEdits.some((e) => e.perms.ViewChannel === false));
  check('fil privé créé', threads.length === 1 && threads[0].type === ChannelType.PrivateThread && threads[0].invitable === false);
  check('message envoyé dans le fil, pas le salon', sent.length === 1 && sent[0].where === 'thread');
  const pending = ver.getPending(G, 'uNew');
  check('pending.threadId = fil', pending && pending.threadId === 'thPriv');
  check('membre n’a pas d’overwrite View sur le ticket', !edits.some((e) => e.id === 'uNew' && e.ch === 'tick1'));
  check('catégorie masquée au nouveau', edits.some((e) => e.id === 'uNew' && e.ch === 'cat1' && e.perms.ViewChannel === false));

  console.log('— 4. Isolation : tickets intouchés —');
  const isoEdits = [];
  const denyEveryone = { has: (f) => false };
  function owCache() {
    return {
      cache: {
        get: () => ({ deny: denyEveryone, allow: { has: () => false } }),
      },
      edit: async (id, perms) => { isoEdits.push({ id: String(id), perms, ch: this.id }); },
    };
  }
  const isoGuild = {
    id: G, name: 'AyAyTR',
    roles: { cache: new Map([['rV', { id: 'rV', name: 'Vérifié', position: 2 }]]), everyone: { id: 'everyone' } },
    members: { me: { permissions: { has: () => true }, roles: { highest: { position: 10 } } }, cache: new Map() },
    channels: { cache: new Map() },
  };
  const mk = (id, extra) => {
    const ch = Object.assign({
      id, type: 0, topic: '',
      permissionOverwrites: null,
    }, extra);
    ch.permissionOverwrites = owCache.call(ch);
    isoGuild.channels.cache.set(id, ch);
    return ch;
  };
  mk('chCap');
  mk('gen2');
  mk('tick2', { topic: 'Ticket #3 de Alex' });
  const iso = await ver.applyIsolation(1, isoGuild);
  check('applyIsolation a masqué au moins un salon public', iso && iso.done >= 1);
  check('ticket : pas de View true pour le rôle vérifié', !isoEdits.some((e) => e.ch === 'tick2' && e.id === 'rV' && e.perms.ViewChannel === true));
  check('captcha locké (View false), pas ouvert', isoEdits.some((e) => e.ch === 'chCap' && e.id === 'everyone' && e.perms.ViewChannel === false));
  check('salon public masqué à @everyone', isoEdits.some((e) => e.ch === 'gen2' && e.id === 'everyone' && e.perms.ViewChannel === false));

  console.log('— 5. Recopie dans le fil —');
  const added = [];
  ver.setPending(G, 'uFil', {
    code: 'ABCDEF', attempts: 0, channelId: 'chCap', threadId: 'thPriv',
    messageId: 'tmsg', botId: 1, guildId: G, userId: 'uFil', expiresAt: Date.now() + 99999, hidden: [],
  });
  const g2 = {
    id: G, name: 'S',
    roles: { cache: new Map([['rV', { id: 'rV', name: 'Vérifié' }]]), everyone: { id: 'everyone' } },
    channels: { cache: new Map([
      ['chCap', { id: 'chCap', messages: { fetch: async () => ({ delete: async () => {} }) }, permissionOverwrites: { edit: async () => {}, delete: async () => {} } }],
      ['thPriv', { id: 'thPriv', delete: async () => {}, messages: { fetch: async () => ({ delete: async () => {} }) } }],
    ]) },
  };
  const mem2 = {
    id: 'uFil', guild: g2,
    roles: { cache: new Map(), add: async (id) => added.push(id) },
    user: { id: 'uFil', send: async () => {} },
    kick: async () => {},
  };
  await ver.onMessage(1, {
    author: { id: 'uFil', bot: false }, guild: g2, member: mem2,
    channelId: 'thPriv',
    channel: { id: 'thPriv', parentId: 'chCap' },
    content: 'abcdef',
    delete: async () => {},
  });
  check('succès dans le fil → rôle', added.includes('rV'));
  check('pending nettoyé', !ver.getPending(G, 'uFil'));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v343 : ' + ok + ' vérifications passed.');
})().catch((e) => {
  console.error('❌', e.stack || e.message);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
