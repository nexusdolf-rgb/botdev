// v342 — Captcha complet : rôle, textes du panneau, code unique à chaque fois.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TMP = path.join(__dirname, '.tmp-v342');
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
const routes = racine('server/routes.js');

const store = require('../server/db');
const ver = require('../server/discord/verification');
const changelog = require('../server/discord/changelog');

console.log('— 1. Pins v342 —');
check('index.html : ?v=346 ×7', (html.match(/\?v=346/g) || []).length === 7);
check('sw.js : cache botdev-v346', sw.includes("const CACHE = 'botdev-v346';"));
check('index.html : plus aucune ?v=341', !html.includes('?v=341'));
check('VERSION ≥ 342', changelog.VERSION >= 342);

console.log('— 2. Dashboard captcha complet —');
check('sélecteur de rôle captcha', dash.includes('id="ver-captcha-role"'));
check('titre et texte du panneau captcha', dash.includes('id="ver-captcha-title"') && dash.includes('id="ver-captcha-desc"'));
check('couleur + aperçu captcha', dash.includes('id="ver-captcha-color"') && dash.includes('id="ver-captcha-preview"'));
check('bouton enregistrer le captcha', dash.includes('id="ver-cap-save"'));
check('routes captcha_role / titre / texte', routes.includes('captcha_role') && routes.includes('captcha_title') && routes.includes('captcha_desc'));
check('bouton humain toujours là', dash.includes('id="ver-send"') && dash.includes('id="ver-btn"'));

console.log('— 3. Textes perso + rôle —');
ver.saveCfg('g1', {
  enabled: true, captcha: true, channel: 'ch1', captcha_role: 'rCap', role: '',
  captcha_title: 'Hello {server}',
  captcha_desc: 'Recopie, {user}. Rôle : {role}',
  captcha_color: '#123456',
});
const c = ver.cfgOf('g1');
check('captcha_role relu', c.captcha_role === 'rCap');
check('verifiedRoleId préfère captcha_role', ver.verifiedRoleId(c) === 'rCap');
const texts = ver.captchaTexts(c, 'fr', { server: 'MonServ', user: '@Alex' });
check('titre perso avec {server}', texts.title === 'Hello MonServ');
check('texte perso avec {user} et {role}', texts.desc.includes('@Alex') && texts.desc.includes('<@&rCap>'));
check('couleur perso', texts.color === '#123456');

console.log('— 4. Jamais le même code / le même dessin —');
const codes = new Set();
for (let i = 0; i < 24; i++) codes.add(ver.generateCode());
check('24 codes : plus d’un distinct', codes.size >= 2);
check('longueur 6', [...codes][0].length === 6);
const svgA = ver.captchaSvg('ABCDEF');
const svgB = ver.captchaSvg('ABCDEF');
check('même lettres, dessin différent', svgA !== svgB);
check('les lettres restent lisibles dans le SVG', svgA.includes('A') && svgA.includes('F') && svgB.includes('B'));

console.log('— 5. Le rôle captcha est bien donné —');
(async () => {
  const added = [];
  const G = 'g1';
  ver.setPending(G, 'u9', {
    code: 'ZZZZZZ', attempts: 0, channelId: 'ch1', messageId: 'm9',
    botId: 1, guildId: G, userId: 'u9', expiresAt: Date.now() + 99999,
  });
  const guild = {
    id: G, name: 'S',
    roles: { cache: new Map([['rCap', { id: 'rCap', name: 'Vérifié' }]]), everyone: { id: 'everyone' } },
    channels: { cache: new Map([['ch1', {
      id: 'ch1', send: async () => ({ id: 'x' }),
      messages: { fetch: async () => ({ delete: async () => {} }) },
      permissionOverwrites: { edit: async () => {}, delete: async () => {} },
    }]]) },
  };
  const member = {
    id: 'u9', guild,
    roles: { cache: new Map(), add: async (id) => added.push(id) },
    user: { id: 'u9', send: async () => {} },
    kick: async () => {},
  };
  await ver.onMessage(1, {
    author: { id: 'u9', bot: false }, guild, member, channelId: 'ch1',
    channel: guild.channels.cache.get('ch1'), content: 'zzzzzz',
    delete: async () => {},
  });
  check('succès → rôle du captcha', added.includes('rCap'));

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) fails.forEach((f) => console.log('  ❌ ' + f));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  assert.strictEqual(ko, 0);
  console.log('\n✅ v342 : ' + ok + ' vérifications passed.');
})().catch((e) => {
  console.error('❌', e.stack || e.message);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
