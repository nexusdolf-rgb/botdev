// v341 — Captcha à l’arrivée (le bouton « Je suis humain » reste).
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v341');
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
const eventsSrc = racine('server/discord/events.js');
const bm = racine('server/discord/botManager.js');
const i18nSrc = racine('server/i18n.js');
const routes = racine('server/routes.js');

const store = require('../server/db');
const ver = require('../server/discord/verification');
const changelog = require('../server/discord/changelog');

console.log('— 1. Pins v341 —');
check('index.html : ?v=343 ×7', (html.match(/\?v=343/g) || []).length === 7);
check('sw.js : cache botdev-v343', sw.includes("const CACHE = 'botdev-v343';"));
check('index.html : plus aucune ?v=340', !html.includes('?v=340'));
check('VERSION ≥ 341', changelog.VERSION >= 341);
check('journal v341 : au moins 1 nouveauté', Array.isArray(changelog.NOTES.new) && changelog.NOTES.new.length >= 1);

console.log('— 2. Le bouton n’a pas disparu —');
check('sendPanel toujours là', typeof ver.sendPanel === 'function' && verSrc.includes('hxver:'));
check('handleButton toujours là', typeof ver.handleButton === 'function');
check('dashboard : envoyer le panneau', dash.includes('id="ver-send"') && dash.includes('id="ver-title"'));
check('dashboard : carte captcha', dash.includes('id="ver-captcha"') && dash.includes('id="ver-captcha-channel"'));
check('route captcha', routes.includes('patch.captcha') && routes.includes('captcha_channel'));

console.log('— 3. Captcha : code et textes —');
const code = ver.generateCode();
check('code 6 caractères', typeof code === 'string' && code.length === 6);
check('alphabet sans I/L/O/0/1', !/[ILO01]/.test(code) && /^[A-HJ-KM-NP-Z2-9]+$/.test(code));
check('normalizeGuess ignore casse et espaces', ver.normalizeGuess(' ab c ') === 'ABC');
check('SVG contient les lettres', ver.captchaSvg('AB23XY').includes('A') && ver.captchaSvg('AB23XY').includes('Y'));
check('i18n FR + EN', (i18nSrc.match(/verif_captcha_title/g) || []).length === 2 && (i18nSrc.match(/verif_captcha_kick_dm/g) || []).length === 2);
check('2 essais / 2 min', ver.CAPTCHA_MAX_ATTEMPTS === 2 && ver.CAPTCHA_TIMEOUT_MS === 120000);

console.log('— 4. Config + hold bienvenue —');
const G = 'gV341';
ver.saveCfg(G, { enabled: true, captcha: true, channel: 'ch1', role: 'r1' });
const c = ver.cfgOf(G);
check('captcha relu', c.captcha === true && c.channel === 'ch1');
check('sans pending : pas de hold', ver.holdsArrival(G, { id: 'u1' }) === false);
ver.setPending(G, 'u1', { code: 'AB23XY', attempts: 0, channelId: 'ch1', messageId: 'm1', botId: 1, guildId: G, userId: 'u1', expiresAt: Date.now() + 99999 });
check('avec pending : hold', ver.holdsArrival(G, { id: 'u1' }) === true);
check('events.js reporte la bienvenue', eventsSrc.includes('holdsArrival') && eventsSrc.includes('afterVerify'));
check('join attend le captcha', bm.includes('onJoin(botId, member)') && bm.includes('onMessage(botId, m)'));

console.log('— 5. Recopie du code —');
(async () => {
  const added = [];
  const kicks = [];
  const dms = [];
  const deleted = [];
  const sent = [];
  const guild = {
    id: G, name: 'AyAyTR',
    roles: { cache: new Map([['r1', { id: 'r1', name: 'Vérifié' }]]), everyone: { id: 'everyone' } },
    channels: { cache: new Map([['ch1', {
      id: 'ch1',
      send: async (p) => { sent.push(p); return { id: 'botmsg' }; },
      messages: { fetch: async () => ({ delete: async () => deleted.push('botmsg') }) },
      permissionOverwrites: { edit: async () => {}, delete: async () => {} },
    }]]) },
  };
  const member = {
    id: 'u1',
    guild,
    roles: { cache: new Map(), add: async (id) => added.push(id) },
    user: { id: 'u1', tag: 'Alex#0001', username: 'Alex', send: async (t) => dms.push(t) },
    kick: async (r) => kicks.push(r),
  };
  const mkMsg = (content) => ({
    author: { id: 'u1', bot: false },
    guild, member, channelId: 'ch1', channel: guild.channels.cache.get('ch1'),
    content,
    delete: async () => deleted.push(content),
  });

  await ver.onMessage(1, mkMsg('ab23xy'));
  check('bon code → rôle vérifié', added.includes('r1'));
  check('bon code → pas d’expulsion', kicks.length === 0);
  check('pending nettoyé après succès', ver.getPending(G, 'u1') === null);

  ver.setPending(G, 'u1', { code: 'AB23XY', attempts: 0, channelId: 'ch1', messageId: 'm2', botId: 1, guildId: G, userId: 'u1', expiresAt: Date.now() + 99999 });
  added.length = 0; kicks.length = 0; dms.length = 0;
  await ver.onMessage(1, mkMsg('XXXXXX'));
  check('1er essai faux → encore en attente', !!ver.getPending(G, 'u1') && kicks.length === 0);
  await ver.onMessage(1, mkMsg('YYYYYY'));
  check('2e essai faux → expulsion', kicks.length === 1);
  check('MP d’expulsion envoyé', dms.length === 1 && String(dms[0]).includes('captcha'));

  console.log('— 6. Bouton toujours opérationnel —');
  const replies = [];
  const addedBtn = [];
  await ver.handleButton(1, {
    customId: 'hxver:1:human',
    guild,
    member: { roles: { cache: new Map(), add: async (r) => addedBtn.push(r) } },
    user: { id: 'u2', createdAt: new Date(Date.now() - 400 * 86400000), avatar: 'abc', flags: 0 },
    reply: async (o) => replies.push(o),
  });
  check('clic bouton → rôle', addedBtn.includes('r1'));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v341 : ' + ok + ' vérifications passed.');
})().catch((e) => {
  console.error('❌', e.stack || e.message);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
