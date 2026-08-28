// Preview v164 — rend la landing façon DraftBot dans jsdom et vérifie le DOM
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
  if (path.endsWith('/api/public/stats')) return resp({ bots: 1, servers: 7, members: 1240 });
  if (path.endsWith('/api/public/bots')) return resp({ bots: [{ name: 'Nexora', servers: 7, members: 1240, online: true }] });
  return resp({});
};

const code = ['app.js', 'editor.js', 'views.js', 'public.js']
  .map((f) => fs.readFileSync('public/js/' + f, 'utf8')).join('\n;\n');

const testSnippet = String.raw`
window.__results = (async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const html = document.querySelector('#app') ? document.querySelector('#app').innerHTML : '';
  const rot = document.querySelector('#pub-rot');
  return {
    heroTitle: html.includes('français multitâche'),
    rotLine: html.includes('Un bot pour'),
    rotText: rot ? rot.textContent : null,
    discordBtn: html.includes('pub-btn-discord') && html.includes('Ajouter à Discord'),
    particles: html.includes('pub-particles'),
    wave: html.includes('pub-wave'),
    showcases: (html.match(/class="db-feature/g) || []).length,
    actionReaction: html.includes('Action Réaction'),
    levels: html.includes('Niveaux &amp; économie'),
    moderation: html.includes('<h2>Modération</h2>'),
    stats: html.includes('<h2>Statistiques</h2>'),
    visualRoles: html.includes('Choisis tes rôles'),
    visualRank: html.includes('Niveau 24'),
    visualMod: html.includes('Sourdine'),
    visualChart: html.includes('dbv-chart'),
    liveSection: html.includes('id="pub-bots"'),
    mockDash: html.includes('pub-mock'),
    features: (html.match(/pub-feature /g) || []).length,
    footerCols: html.includes('pub-footer-grid') && html.includes('Communauté'),
    supportLink: html.includes('discord.gg/X9hTdr9N3'),
    rotatedLater: await new Promise((res) => setTimeout(() => res(rot ? rot.textContent : null), 3000)),
  };
})();
`;
w.eval(code + '\n;\n' + testSnippet);

setTimeout(async () => {
  const r = await w.__results;
  console.log(JSON.stringify(r, null, 2));
  const ok = r.heroTitle && r.rotLine && r.rotText === 'La Modération' && r.discordBtn
    && r.particles && r.wave && r.showcases === 4
    && r.actionReaction && r.levels && r.moderation && r.stats
    && r.visualRoles && r.visualRank && r.visualMod && r.visualChart
    && r.liveSection && r.mockDash && r.features === 10
    && r.footerCols && r.supportLink
    && r.rotatedLater && r.rotatedLater !== r.rotText;
  console.log(ok ? '✅ LANDING V164 OK (mot rotatif confirmé : ' + r.rotText + ' → ' + r.rotatedLater + ')' : '❌ PROBLÈME');
  process.exit(ok ? 0 : 1);
}, 4600);
