// Preview v163 — rend la page d'accueil publique SIMPLE dans jsdom et vérifie le DOM
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
  if (path.endsWith('/api/public/bots')) return resp({ bots: [{ name: 'Optimus Prime', servers: 7, members: 1240, online: true }] });
  return resp({});
};

const code = ['app.js', 'editor.js', 'views.js', 'public.js']
  .map((f) => fs.readFileSync('public/js/' + f, 'utf8')).join('\n;\n');

const testSnippet = String.raw`
window.__results = (async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const html = document.querySelector('#app') ? document.querySelector('#app').innerHTML : '';
  return {
    hero: html.includes('pub-hero'),
    stats: html.includes('pub-stats'),
    liveSection: html.includes('id="pub-bots"'),
    mockDash: html.includes('pub-mock'),
    features: (html.match(/pub-feature /g) || []).length,
    footer: html.includes('pub-footer-links'),
    supportLink: html.includes('discord.gg/X9hTdr9N3'),
    // Rien des sections retirées
    showcases: (html.match(/pub-showcase/g) || []).length,
    cta: html.includes('pub-cta'),
    footerGrid: html.includes('pub-footer-grid'),
    rotWord: html.includes('pub-rot'),
    fakeNames: html.includes('Léo') || html.includes('Choisis tes rôles'),
  };
})();
`;
w.eval(code + '\n;\n' + testSnippet);

setTimeout(async () => {
  const r = await w.__results;
  console.log(JSON.stringify(r, null, 2));
  const ok = r.hero && r.stats && r.liveSection && r.mockDash && r.features === 10
    && r.footer && r.supportLink
    && r.showcases === 0 && !r.cta && !r.footerGrid && !r.rotWord && !r.fakeNames;
  console.log(ok ? '✅ LANDING SIMPLE OK' : '❌ PROBLÈME');
  process.exit(ok ? 0 : 1);
}, 2400);
