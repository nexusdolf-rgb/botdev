// Preview v161 — rend la page d'accueil publique dans jsdom et vérifie le DOM
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
  await new Promise((r) => setTimeout(r, 1200)); // routeur + fetchs
  const app = document.querySelector('#app');
  const html = app ? app.innerHTML : '';
  const rot = document.querySelector('#pub-rot');
  return {
    hero: html.includes('pub-hero'),
    rotWord: !!rot,
    rotText: rot ? rot.textContent : null,
    showcases: (html.match(/pub-showcase/g) || []).length,
    ticketMock: html.includes('Ouvrir un ticket'),
    xpMock: html.includes('Niveau 24'),
    modMock: html.includes('anti-raid'),
    kickers: (html.match(/pub-sc-kicker/g) || []).length,
    liveSection: html.includes('id="pub-bots"'),
    supportLink: html.includes('discord.gg/X9hTdr9N3'),
    footer: html.includes('pub-footer'),
    roleMock: html.includes('Choisis tes rôles') && html.includes('Graphiste'),
    statsMock: html.includes('st-chart') && html.includes('Activité du serveur'),
    cta: html.includes('pub-invite-cta') && html.includes('Prêt à faire vibrer ton serveur ?'),
    footerCols: html.includes('pub-footer-grid') && html.includes('Communauté'),
    // Le mot a-t-il tourné après >3s ?
    rotatedLater: await new Promise((res) => setTimeout(() => res(rot ? rot.textContent : null), 3000)),
  };
})();
`;
w.eval(code + '\n;\n' + testSnippet);

setTimeout(async () => {
  const r = await w.__results;
  console.log(JSON.stringify(r, null, 2));
  const ok = r.hero && r.rotWord && r.rotText === 'ton serveur Discord'
    && r.showcases === 5 && r.ticketMock && r.xpMock && r.modMock && r.kickers === 5
    && r.roleMock && r.statsMock && r.cta && r.footerCols
    && r.liveSection && r.supportLink && r.footer
    && r.rotatedLater && r.rotatedLater !== r.rotText;
  console.log(ok ? '✅ LANDING V161 OK (mot rotatif confirmé : ' + r.rotText + ' → ' + r.rotatedLater + ')' : '❌ PROBLÈME');
  process.exit(ok ? 0 : 1);
}, 4600);
