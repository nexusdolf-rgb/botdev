// Test v169 — correctif Bienvenue : un seul aperçu Discord (fini le doublon), vraies données du serveur
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const dashJs = read('js/dashboard.js');
const index = read('index.html');
const sw = read('sw.js');

// 1. L'ancien aperçu (embed-preview) est bien retiré du module Bienvenue
assert(!dashJs.includes('class="embed-preview"'), 'l\'ancien aperçu embed-preview doit être retiré');

// 2. Le nouvel aperçu Discord couvre l'arrivée ET le départ
assert(dashJs.includes("key === 'member_join' || key === 'member_leave'"), 'l\'aperçu doit couvrir arrivée + départ');
assert(dashJs.includes('class="dc-preview"'), 'l\'aperçu style Discord manquant');

// 3. L'aperçu utilise les VRAIES données du serveur (pas de valeurs codées en dur)
assert(dashJs.includes('const serverName = (data.guild && data.guild.name) ||'), 'nom du serveur réel manquant');
assert(dashJs.includes('const memberCount = String((data.guild && data.guild.members) ||'), 'nombre de membres réel manquant');
assert(!dashJs.includes(".replace('{server}', 'Ton serveur')"), 'le fallback codé en dur « Ton serveur » doit être remplacé');
assert(!dashJs.includes(".replace('{count}', '145')"), 'le compteur codé en dur « 145 » doit être remplacé');

// 4. Version v169 déployée (cache PWA + assets)
assert(!index.includes('?v=168'), 'index.html référence encore v168');
assert.strictEqual((index.match(/\?v=169/g) || []).length, 7, 'index.html doit référencer v169 7 fois');
assert(sw.includes("'botdev-v169'"), 'le cache du service worker n’est pas en v169');

// 5. Rendu réel dans jsdom : UN SEUL aperçu, avec le vrai nom du serveur
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;

w.fetch = async (url) => {
  const p = String(url).split('?')[0];
  const resp = (body) => ({ ok: true, status: 200, json: async () => body });
  if (p.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'a@b.fr', discord_id: 'D1', is_admin: true } });
  if (p.endsWith('/guilds/G1')) return resp({
    guild: { id: 'G1', name: 'Serveur Test', members: 18 },
    channels: [{ id: 'C1', name: 'bienvenue' }],
    roles: [{ id: 'R1', name: 'Membre' }],
    settings: {},
    tickets: { types: [] },
    events: {
      defs: {
        member_join: { emoji: '👋', label: 'Bienvenue', description: 'Message de bienvenue', config: [
          { key: 'channel', label: 'Salon', type: 'channel' },
          { key: 'message', label: 'Message', type: 'multiline', default: 'Bienvenue {user} sur {server} ! Tu es le membre n°{count} 🎉' },
          { key: 'embed', label: 'Embed', type: 'checkbox' },
          { key: 'color', label: 'Couleur', type: 'color', default: '#57F287' },
        ] },
        member_leave: { emoji: '👋', label: 'Au revoir', description: 'Message de départ', config: [
          { key: 'channel', label: 'Salon', type: 'channel' },
          { key: 'message', label: 'Message', type: 'multiline', default: '{user} vient de partir… 👋' },
        ] },
      },
      state: { member_join: { enabled: true, config: {} }, member_leave: { enabled: true, config: {} } },
    },
    role_menus: [], xp_roles: [], profile: {}, blacklist: [],
  });
  return resp({ ok: true });
};

const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
  .map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');

const testSnippet = String.raw`
window.__results = (async () => {
  await new Promise((r) => setTimeout(r, 400));
  const out = {};
  try {
    const host = document.createElement('div');
    Dashboard.state.bot = { id: 1, name: 'Nexora' };
    Dashboard.state.guildId = 'G1';
    const gdata = await App.api('/bots/1/guilds/G1');
    await Dashboard.renderers.welcome(host, gdata);
    await new Promise((r) => setTimeout(r, 200));
    // UN SEUL aperçu par carte
    out.previewsJoin = host.querySelectorAll('.dc-preview').length;
    out.oldPreviews = host.querySelectorAll('.embed-preview').length;
    out.joinText = (host.querySelector('.dc-msg') || {}).textContent || '';
    out.hasServer = out.joinText.includes('Serveur Test');
    out.hasCount = out.joinText.includes('n°18');
    out.hasHardcoded = out.joinText.includes('Ton serveur') || out.joinText.includes('145');
    // La carte « Au revoir » a AUSSI son aperçu
    const cards = [...host.querySelectorAll('.dash-card')];
    const leaveCard = cards.find((c) => c.textContent.includes('Au revoir'));
    out.leavePreview = leaveCard ? !!leaveCard.querySelector('.dc-preview .dc-msg') && leaveCard.querySelector('.dc-msg').textContent.includes('parti') : false;
    // Les libellés « Aperçu sur Discord » : 2 cartes = 2 libellés (pas 3+)
    out.apercuLabels = (host.textContent.match(/Aperçu sur Discord/g) || []).length;
  } catch (e) { out.error = e.message; }
  return out;
})();
`;
w.eval(code + '\n;\n' + testSnippet);

setTimeout(async () => {
  const r = await w.__results;
  console.log(JSON.stringify(r));
  const ok = r.previewsJoin === 2 && r.oldPreviews === 0 && r.hasServer && r.hasCount
    && !r.hasHardcoded && r.leavePreview && r.apercuLabels === 2 && !r.error;
  if (ok) { console.log('✅ v169 : Bienvenue — un seul aperçu Discord par carte, vraies données, départ couvert'); process.exit(0); }
  process.exit(1);
}, 2600);
