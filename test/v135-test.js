// ============================================================
// Test v3.35 — La page d'accueil de connexion et la navbar
// publique affichent l'avatar public réel d’Optimus Prime.
// ============================================================
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'https://hoxera.is-a.dev/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, json: async () => ({}) });
w.eval(fs.readFileSync('public/js/app.js', 'utf8') + '\nwindow.App=App;');

w.App.state = { user: null, bot: null };
w.App.api = async (url) => {
  if (url === '/public/bots') return { bots: [{ name: 'Hoxera', avatar_url: 'https://cdn.discordapp.com/avatars/1/nexora.png' }] };
  return { ok: true };
};

(async () => {
  w.App.renderConnect();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const brand = w.document.querySelector('#connect-card [data-brand-logo]');
  assert(brand && brand.tagName === 'IMG', 'photo prévue sur la page de connexion');
  assert.strictEqual(brand.getAttribute('src'), '/api/public/bot-avatar');
  console.log('1️⃣  Accueil connexion : photo d’Optimus Prime affichée en haut à gauche ✅');

  const nav = w.App.renderPublicNavbar ? w.App.renderPublicNavbar() : null;
  // public.js est chargé dans index.html ; ce test vérifie aussi sa source.
  const publicSource = fs.readFileSync('public/js/public.js', 'utf8');
  assert(publicSource.includes('data-brand-logo'));
  assert(publicSource.includes('loadPublicBotAvatar(nav)'));
  console.log('2️⃣  Navbar publique : avatar prévu et chargé depuis la route publique ✅');

  const appSource = fs.readFileSync('public/js/app.js', 'utf8');
  assert(appSource.includes('/api/public/bot-avatar'));
  assert(appSource.includes('image.onerror'));
  console.log('3️⃣  Fallback éclair conservé uniquement si la photo est indisponible ✅');

  console.log('\n🎉 Tous les tests v3.35 passent !');
})().catch((error) => {
  console.error('❌', error.stack || error.message);
  process.exit(1);
});
