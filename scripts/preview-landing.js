// Preview v165 — rend la landing clonée de draftbot.fr dans jsdom et vérifie le DOM
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'http://localhost:3000/#/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;

w.fetch = async (url) => {
  const path = String(url).split('?')[0];
  const resp = (body) => ({ ok: true, status: 200, json: async () => body });
  if (path.endsWith('/api/auth/me')) return resp({ user: null });
  if (path.endsWith('/api/public/stats')) return resp({ onlineBots: 1, totalBots: 1, servers: 7, members: 1240 });
  if (path.endsWith('/api/public/bots')) return resp({ bots: [{ id: 1, name: 'Nexora', servers: 7, members: 1240, online: true }] });
  return resp({});
};

const code = ['app.js', 'editor.js', 'views.js', 'public.js']
  .map((f) => fs.readFileSync('public/js/' + f, 'utf8')).join('\n;\n');

const testSnippet = String.raw`
window.__results = (async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const html = document.querySelector('#app') ? document.querySelector('#app').innerHTML : '';
  const rot = document.querySelector('#dh-rot');
  return {
    dhClass: html.includes('id="public-landing" class="dh"'),
    heroLogo: html.includes('dh-logo') && html.includes('/api/public/bot-avatar'),
    title: html.includes('Hoxera, ton bot Discord français multitâche'),
    rotLine: html.includes('Un bot pour'),
    rotText: rot ? rot.textContent : null,
    discordBtn: html.includes('dh-invite') && html.includes('Ajouter à Discord'),
    wave: html.includes('dh-wave'),
    features: (html.match(/dh-feature reveal/g) || []).length,
    f1: html.includes('<h2>Action Réaction</h2>'),
    f2: html.includes('<h2>Niveaux &amp; économie</h2>'),
    f3: html.includes('<h2>Modération</h2>'),
    f4: html.includes('<h2>Statistiques</h2>'),
    liveSection: html.includes('id="pub-bots"'),
    stats: html.includes('id="pub-stats"'),
    mockDash: html.includes('pub-mock'),
    features10: (html.match(/pub-feature /g) || []).length,
    footer: html.includes('dh-footer-content') && html.includes('Communauté') && html.includes('Tous droits réservés'),
    supportLink: html.includes('discord.gg/X9hTdr9N3'),
    rotatedLater: await new Promise((res) => setTimeout(() => res(rot ? rot.textContent : null), 3000)),
  };
})();
`;
w.eval(code + '\n;\n' + testSnippet);

setTimeout(async () => {
  const r = await w.__results;
  console.log(JSON.stringify(r, null, 2));
  const ok = r.dhClass && r.heroLogo && r.title && r.rotLine && r.rotText === 'La Modération'
    && r.discordBtn && r.wave && r.features === 4 && r.f1 && r.f2 && r.f3 && r.f4
    && r.liveSection && r.stats && r.mockDash && r.features10 === 10
    && r.footer && r.supportLink
    && r.rotatedLater && r.rotatedLater !== r.rotText;
  console.log(ok ? '✅ LANDING V165 OK (mot rotatif : ' + r.rotText + ' → ' + r.rotatedLater + ')' : '❌ PROBLÈME');
  process.exit(ok ? 0 : 1);
}, 4600);
