// Test v195 — Home Ultra Pro (Phase 3) : rendu réel de la page d'accueil
// Vérifie dans le DOM : hero, présentation, fonctionnalités, FAQ, CTA, footer,
// ancres de navigation — sans casser la landing (même méthode que smoke.js).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v195-'));
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const html = `<!doctype html><html><body>
  <div id="app"></div><div id="toasts"></div><div id="modal-root"></div>
</body></html>`;
const dom = new JSDOM(html, { url: 'https://hoxera.is-a.dev/#/', runScripts: 'outside-only', pretendToBeVisual: true });
const window = dom.window;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.location = window.location;

const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) window.__fail++;
};
window.__check = check;
window.__fail = 0;
window.__finish = (n) => process.exit(n === 0 ? 0 : 1);
window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

// Lecture stable (comme smoke.js)
function readStable(p) {
  let a = null;
  for (let i = 0; i < 8; i++) {
    const b = fs.readFileSync(p, 'utf8');
    if (a !== null && a === b) return b;
    a = b;
  }
  return a;
}
const scripts = ['app.js', 'public.js']
  .map((f) => readStable(path.join(__dirname, '..', 'public', 'js', f)))
  .join('\n;\n');

const testCode = String.raw`
setTimeout(async () => {
  const check = window.__check;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Rendu explicite de la landing (user non connecté)
  App.state.user = null;
  await App.renderPublicLanding();

  console.log('\n1️⃣  Hero et CTA');
  check('hero rendu', !!$('.pub-hero'));
  check('titre « Le bot qui anime »', !!$('.hero-title') && $('.hero-title').textContent.includes('Le bot qui anime'));
  check('badge shimmer', !!$('.pub-hero-badge.shimmer'));
  check('bouton inviter hero', !!$('#pub-invite-hero'));
  check('stats du hero (3 valeurs)', $$('#pub-stats .val').length === 3);
  check('lien support Discord', !!$('.pub-support-link a[href="https://discord.gg/X9hTdr9N3"]'));

  console.log('\n2️⃣  Navigation par ancres');
  check('navbar avec 4 liens', $$('.navbar-links a').length === 4);
  check('lien FAQ dans la navbar', !!$('.navbar-links a[data-anchor="hp-faq"]'));

  console.log('\n3️⃣  Présentation Hoxera');
  check('section présentation', !!$('#hp-about'));
  check('carte robot', !!$('.hp-about-card .hp-robot'));
  check('4 piliers', $$('.hp-pillar').length === 4);
  check('3 étapes', $$('.hp-step').length === 3);

  console.log('\n4️⃣  Fonctionnalités, stats en direct, aperçu');
  check('10 cartes fonctionnalités', $$('.pub-feature').length === 10);
  check('section « Hoxera en direct »', !!$('#pub-bots'));
  check('aperçu du dashboard', !!$('.pub-mock'));

  console.log('\n5️⃣  FAQ accordéon');
  check('section FAQ', !!$('#hp-faq'));
  check('6 questions FAQ', $$('.hp-faq-item').length === 6);
  check('résumés cliquables', $$('.hp-faq-item summary').length === 6);
  check('première question ouverte', $('.hp-faq-item').open === true);

  console.log('\n6️⃣  CTA final et footer');
  check('CTA final', !!$('#pub-invite-cta'));
  check('footer enrichi (3 colonnes)', $$('.hp-footer-col').length === 3);
  check('lien dashboard du footer', !!$('#pub-foot-dash'));
  check('bas de footer avec année', !!$('.hp-footer-bottom'));

  const n = window.__fail;
  console.log(n === 0 ? '\n🎉 v195 — Home Ultra Pro OK' : '\n⚠️ ' + n + ' échec(s)');
  window.__finish(n);
}, 300);
`;
window.eval(scripts + '\n;\n' + testCode);
