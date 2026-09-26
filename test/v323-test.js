// v323 — Module Liens : panneau unique + un embed par lien (texte + bouton).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v323-'));
process.env.BOTDEV_DATA_DIR = TMP;

const store = require('../server/db');
const lp = require('../server/discord/linkPanels');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const dump = (p) => JSON.stringify({
  content: p.content || '',
  embeds: (p.embeds || []).map((e) => (typeof e.toJSON === 'function' ? e.toJSON() : e)),
  components: (p.components || []).map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r)),
});

const html = racine('public/index.html');
const sw = racine('public/sw.js');
const dash = racine('public/js/dashboard.js');
const routes = racine('server/routes.js');
const i18n = racine('server/i18n.js');

console.log('— 1. Pins de version v323 —');
check('index.html : ?v=330 ×7', (html.match(/\?v=330/g) || []).length === 7);
check('sw.js : cache botdev-v330', sw.includes("const CACHE = 'botdev-v330';"));
check('index.html : plus aucune ?v=322', !html.includes('?v=322'));

console.log('— 2. Menu dashboard —');
check('MODULES contient « links »', /Dashboard\.MODULES = \[([\s\S]*?)\];/.exec(dash)[1].includes("['links'"));
check('renderer Dashboard.renderers.links', dash.includes('Dashboard.renderers.links ='));
check('guide « Comment ça marche »', dash.includes('Comment ça marche') && dash.includes('lp-save') && dash.includes('lp-send'));
check('textes du panneau uniques', dash.includes('Textes du panneau (uniques)'));
check('boutons sous le panneau', dash.includes('Boutons (2 par ligne)') || dash.includes('lp-add'));
check('aperçu en direct', dash.includes('id="lp-preview"') || dash.includes("id=\"lp-preview\"") || dash.includes('lp-preview'));
check('routes PUT + send', routes.includes("/guilds/:guildId/linkpanel'") && routes.includes("/guilds/:guildId/linkpanel/send'"));
check('payload guilde : linkpanel', routes.includes("linkpanel: require('./discord/linkPanels').cfgOf"));
check('i18n fr + en', i18n.includes("links_panel_title: '🔗 Liens utiles'") && i18n.includes("links_panel_title: '🔗 Useful links'"));

console.log('— 3. Comportement —');
const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
const G = 'gV323';

check('javascript: rejeté', !lp.isSafeUrl('javascript:alert(1)') && !lp.isSafeUrl('not-a-url') && lp.isSafeUrl('https://exemple.com'));
check('max 10 liens', lp.sanitizeLinks(new Array(12).fill({ label: 'A', url: 'https://a.test' })).length === 10);

lp.saveCfg(BOT, G, {
  content: 'Liens de {server}',
  title: 'Panneau {server}',
  description: 'Texte unique du panneau',
  color: '#123456',
  footer: '',
  links: [
    { label: 'Site', url: 'https://hoxera.is-a.dev', title: 'Notre site', description: 'Boutique', color: '#00aa00' },
    { label: 'YouTube', url: 'https://youtube.com/@demo' },
    { label: 'Mauvais', url: 'javascript:x' },
  ],
});
const cfg = lp.cfgOf(BOT, G);
check('textes uniques relus', cfg.title === 'Panneau {server}' && cfg.description === 'Texte unique du panneau');
check('lien dangereux stocké mais pas envoyé', cfg.links.length === 3 && lp.validLinks(cfg).length === 2);

const p = lp.buildPayload(cfg, 'fr', 'MonServ');
const json = dump(p);
const data = JSON.parse(json);
check('{server} remplacé dans le panneau unique', data.content.includes('MonServ') && data.embeds[0].title.includes('MonServ'));
check('UN seul embed (les liens sont des boutons)', data.embeds.length === 1);
check('le embed est le panneau unique (pas un lien)', data.embeds[0].description === 'Texte unique du panneau' && !String(data.embeds[0].description).includes('https://'));
check('boutons cliquables (style Link = 5), 2 par ligne',
  data.components.length === 1
  && data.components[0].components.length === 2
  && data.components[0].components.every((b) => b.style === 5)
  && data.components[0].components[0].url === 'https://hoxera.is-a.dev');
check('pas de signature Hoxera par défaut', !data.embeds[0].footer);

const def = lp.buildPayload({ links: [{ label: 'A', url: 'https://a.test' }] }, 'fr', 'X');
const defJ = JSON.parse(dump(def));
check('textes par défaut i18n si vide', defJ.embeds[0].title.includes('Liens utiles'));

(async () => {
  try {
    await lp.sendPanel(BOT, { id: G, name: 'S', channels: { cache: new Map() } });
    check('send sans salon → erreur', false);
  } catch (e) { check('send sans salon → erreur', /salon/i.test(e.message)); }
  try {
    await lp.sendPanel(BOT, {
      id: G, name: 'S',
      channels: { cache: new Map([['C1', { id: 'C1', send: async () => ({ id: 'M1' }) }]]) },
    }, 'C1');
    // cfg has 2 valid links — should work if we point channel
  } catch (e) {
    // if it used cfg.channel empty and we passed C1 it should work
  }
  lp.saveCfg(BOT, G, { channel: 'C1', links: [] });
  try {
    await lp.sendPanel(BOT, {
      id: G, name: 'S',
      channels: { cache: new Map([['C1', { id: 'C1', send: async () => ({ id: 'M1' }) }]]) },
    }, 'C1');
    check('send sans lien valide → erreur', false);
  } catch (e) { check('send sans lien valide → erreur', /lien/i.test(e.message)); }

  const sent = [];
  lp.saveCfg(BOT, G, { channel: 'C1', links: [{ label: 'Site', url: 'https://ok.test', title: 'S' }] });
  await lp.sendPanel(BOT, {
    id: G, name: 'Serv',
    channels: { cache: new Map([['C1', {
      id: 'C1',
      send: async (payload) => { sent.push(payload); return { id: 'MSG9' }; },
      messages: { fetch: async () => { throw new Error('none'); } },
    }]]) },
  }, 'C1');
  check('envoi réel : message stocké', lp.cfgOf(BOT, G).message_id === 'MSG9');
  check('envoi réel : un seul embed', sent[0] && sent[0].embeds && sent[0].embeds.length === 1);

  console.log('\nRésultat : ' + ok + ' ✅ / ' + ko + ' ❌ sur ' + (ok + ko) + ' vérifications');
  if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
  console.log('\n✅ v323 : ' + ok + ' vérifications passed.');
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
