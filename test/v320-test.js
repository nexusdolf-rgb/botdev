// v320 — Vérification : texte du panneau modifiable + filtres pro réels.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v320-'));
process.env.BOTDEV_DATA_DIR = TMP;

const store = require('../server/db');
const ver = require('../server/discord/verification');

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
const i18n = racine('server/i18n.js');

console.log('— 1. Pins de version v320 —');
check('index.html : ?v=330 ×7', (html.match(/\?v=330/g) || []).length === 7);
check('sw.js : cache botdev-v330', sw.includes("const CACHE = 'botdev-v330';"));
check('index.html : plus aucune ?v=319', !html.includes('?v=319'));

console.log('— 2. Dashboard : texte du panneau + aperçu —');
check('champs titre / message / bouton / couleur', dash.includes('id="ver-title"') && dash.includes('id="ver-desc"') && dash.includes('id="ver-btn"') && dash.includes('id="ver-color"'));
check('aperçu en direct', dash.includes('id="ver-preview"') && dash.includes('paintPreview'));
check('PUT envoie panel_title', dash.includes('panel_title:') && routes.includes('patch.panel_title'));
check('filtres avatar + spammeur', dash.includes('id="ver-avatar"') && dash.includes('id="ver-spammer"'));
check('le dashboard dit clairement ce que Discord ne dit pas', dash.includes('comptes volés') || dash.includes('compte est volé'));

console.log('— 3. Comportement —');
(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const G = 'gV320';
  ver.saveCfg(G, {
    enabled: true, channel: 'ch1', role: 'r1',
    panel_title: 'Bienvenue au QG',
    panel_desc: 'Cliquez pour entrer. Rôle : {role}',
    button_label: 'Entrer',
    panel_color: '#e07a5f',
    require_avatar: true,
    block_spammer: true,
  });
  const c = ver.cfgOf(G);
  check('textes personnalisés relus', c.panel_title === 'Bienvenue au QG' && c.button_label === 'Entrer' && c.require_avatar && c.block_spammer);
  const texts = ver.panelTexts(c, 'fr');
  check('{role} est remplacé dans le message', texts.desc.includes('<@&r1>') && !texts.desc.includes('{role}'));
  check('couleur du panneau respectée', texts.color === '#e07a5f' && texts.button === 'Entrer');

  const sent = [];
  const guild = {
    id: G, name: 'Test',
    channels: { cache: new Map([['ch1', { id: 'ch1', send: async (p) => sent.push(p) }]]) },
    roles: { cache: new Map([['r1', { id: 'r1', name: 'Membre' }]]) },
  };
  await ver.sendPanel(BOT, guild, 'ch1');
  const json = JSON.stringify(sent[0]);
  check('le panneau envoyé contient le titre perso', json.includes('Bienvenue au QG'));
  check('le bouton perso remplace « Je suis humain »', json.includes('Entrer'));

  const mkItx = (over = {}) => {
    const replies = []; const added = [];
    return {
      replies, added,
      itx: {
        customId: `hxver:${BOT}:human`,
        guild,
        member: { roles: { cache: new Map(), add: async (r) => added.push(r) } },
        user: {
          id: 'u1', tag: 'Alice',
          createdAt: new Date(Date.now() - 400 * 86400000),
          avatar: over.avatar === undefined ? 'abc' : over.avatar,
          flags: over.flags || 0,
        },
        reply: async (o) => replies.push(o),
      },
    };
  };
  let t = mkItx({ avatar: null });
  await ver.handleButton(BOT, t.itx);
  check('sans photo de profil → refus, pas de rôle', t.added.length === 0 && String(t.replies[0] && t.replies[0].content).includes('photo'));

  t = mkItx({ flags: 1048576 });
  await ver.handleButton(BOT, t.itx);
  check('flag spammeur Discord → refus', t.added.length === 0 && String(t.replies[0] && t.replies[0].content).toLowerCase().includes('signal'));

  t = mkItx({ avatar: 'ok' });
  await ver.handleButton(BOT, t.itx);
  check('compte normal + photo → rôle donné', t.added.includes('r1'));

  check('i18n fr+en : nouvelles clés', i18n.includes('verif_need_avatar') && i18n.split('verif_need_avatar').length === 3);

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  console.log('\n✅ v320 : ' + ok + ' vérifications passed.');
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
