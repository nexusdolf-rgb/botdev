// Test v170 — « plus rien de caché » :
// 1. téléphone en paysage → interface mobile (fini la sidebar coupée net)
// 2. indicateur « ▼ La suite des modules » sur les listes défilantes
// 3. mode clair : plus aucun texte invisible (boîtes sombres → texte clair)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const css = read('css/dashboard.css');
const dashJs = read('js/dashboard.js');
const index = read('index.html');
const sw = read('sw.js');

// ---------- 1. Téléphone en paysage → interface mobile ----------
const MQ = '(hover: none) and (pointer: coarse) and (max-height: 800px)';
const nb = (css.match(new RegExp(MQ.replace(/[()]/g, '\\$&'), 'g')) || []).length;
assert(nb >= 20, `la condition tactile-paysage doit étendre les 20+ blocs mobiles (trouvé : ${nb})`);
assert(dashJs.includes("'(max-width: 900px), " + MQ + "'"), 'positionTopbarPopover doit reconnaître le tactile-paysage');

// ---------- 2. Indicateur « la suite continue en dessous » ----------
assert(dashJs.includes('Dashboard.mountScrollHint ='), 'mountScrollHint manquant');
assert(dashJs.includes("Dashboard.mountScrollHint(aside, 'La suite des modules')"), 'la sidebar doit porter l’indicateur');
assert(dashJs.includes("Dashboard.mountScrollHint(moduleList, 'La suite des modules')"), 'le tiroir des modules doit porter l’indicateur');
assert(css.includes('.scroll-hint {'), 'styles .scroll-hint manquants');
assert(css.includes('.scroll-hint.on { display: flex; }'), 'l’indicateur doit s’afficher quand la liste continue');
assert(css.includes('position: sticky; bottom: 0'), 'l’indicateur doit rester collé en bas de la zone visible');

// ---------- 3. Mode clair : plus de texte invisible ----------
assert(css.includes('html.hx-light .dashboard-shell-host .am-control-hero,'), 'correctif boîtes sombres (modération) manquant');
assert(css.includes('html.hx-light .dashboard-shell-host .dash-mobile-brand { color: #23252d; }'), 'correctif bandeau mobile manquant');
assert(css.includes('html.hx-light .dashboard-shell-host .dash-label { color: #5c636b; }'), 'correctif libellés manquant');
assert(css.includes('html.hx-light .dashboard-shell-host .dc-preview { background: #313338 !important;'), 'l’aperçu Discord doit rester sombre en mode clair');
assert(css.includes('html.hx-light .dashboard-shell-host .dash-stat .val { color: #20283a !important;'), 'correctif valeurs statistiques manquant');
assert(css.includes('html.hx-light .navbar .logo-row,'), 'correctif barre publique manquant');

// ---------- 4. Comportement de l'indicateur (jsdom, géométrie simulée) ----------
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
w.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
  .map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');

const testSnippet = String.raw`
window.__results = (async () => {
  const out = {};
  try {
    const host = document.createElement('div');
    document.body.appendChild(host);
    // jsdom n'a pas de moteur de rendu : on simule la géométrie
    Object.defineProperty(host, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 400, configurable: true });
    Dashboard.mountScrollHint(host, 'La suite des modules');
    out.hintAjoute = !!host.querySelector('.scroll-hint');
    out.hintActif = host.querySelector('.scroll-hint').classList.contains('on');
    out.texte = host.querySelector('.scroll-hint').textContent.trim();
    // descendre tout en bas → l'indicateur disparaît
    host.scrollTop = 800;
    host.dispatchEvent(new Event('scroll'));
    out.hintOffEnBas = !host.querySelector('.scroll-hint').classList.contains('on');
  } catch (e) { out.error = e.message; }
  return out;
})();
`;
w.eval(code + '\n;\n' + testSnippet);

setTimeout(() => {
  (async () => {
    const r = await w.__results;
    console.log(JSON.stringify(r));
    assert(!r.error, 'erreur jsdom : ' + r.error);
    assert(r.hintAjoute, 'l’indicateur doit être ajouté à la liste');
    assert(r.hintActif, 'l’indicateur doit être actif quand la liste continue en dessous');
    assert(r.texte.includes('La suite des modules'), 'texte de l’indicateur incorrect');
    assert(r.hintOffEnBas, 'l’indicateur doit disparaître en bas de liste');
    process.exit(0);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}, 800);

// ---------- 5. Version v170 ----------
assert(!index.includes('?v=169'), 'index.html référence encore v169');
assert.strictEqual((index.match(/\?v=170/g) || []).length, 7, 'index.html doit référencer v170 7 fois');
assert(sw.includes("'botdev-v170'"), 'le cache du service worker n’est pas en v170');
