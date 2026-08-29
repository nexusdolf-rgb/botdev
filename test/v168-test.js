// Test v168 — Embed Builder : module dashboard, aperçu Discord en direct, envoi, modèles
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
const dashJs = read('js/dashboard.js');
const dashCss = read('css/dashboard.css');
const routesJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'db.js'), 'utf8');
const panelsJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'panels.js'), 'utf8');
const index = read('index.html');
const sw = read('sw.js');

// 1. Le module est dans la sidebar et le renderer existe
assert(dashJs.includes("['embeds', '🧱', 'Embed Builder']"), 'module Embed Builder manquant dans la sidebar');
assert(dashJs.includes('Dashboard.renderers.embeds'), 'renderer embeds manquant');

// 2. L'éditeur complet
for (const el of ['eb-content', 'eb-author', 'eb-title', 'eb-description', 'eb-color', 'eb-image', 'eb-thumbnail', 'eb-footer', 'eb-btn-add', 'eb-tpl-name', 'eb-tpl-save', 'eb-channel', 'eb-send', 'eb-copy']) {
  assert(dashJs.includes(`"${el}"`) || dashJs.includes(`id="${el}"`), `champ manquant : ${el}`);
}
assert(dashJs.includes('eb-preset'), 'couleurs prédéfinies manquantes');
assert(['#e07a5f', '#57F287', '#5865F2', '#FEE75C', '#ED4245', '#EB459E'].every((c) => dashJs.includes(c)), 'les 6 couleurs prédéfinies manquent');
assert(dashJs.includes('{user}') && dashJs.includes('{server}') && dashJs.includes('{memberCount}'), 'variables {user}/{server}/{memberCount} manquantes');

// 3. L'aperçu Discord en direct
assert(dashJs.includes('updatePreview'), 'mise à jour de l\'aperçu manquante');
for (const cls of ['eb-discord', 'eb-embed', 'eb-e-title', 'eb-e-desc', 'eb-e-img', 'eb-e-thumb', 'eb-e-footer', 'eb-btns', 'eb-mention']) {
  assert(dashJs.includes(cls) || dashCss.includes('.' + cls), `aperçu : ${cls} manquant`);
}
assert(dashCss.includes('.eb-wrap {'), 'grille éditeur/aperçu manquante');
assert(dashCss.includes('background: #313338'), 'fond Discord de l\'aperçu manquant');
assert(dashCss.includes('#00a8fc'), 'couleur des titres d\'embed Discord manquante');
// les 5 styles de boutons Discord
for (const s of ['.eb-btn.s1', '.eb-btn.s2', '.eb-btn.s3', '.eb-btn.s4', '.eb-btn.s5']) {
  assert(dashCss.includes(s), `style de bouton manquant : ${s}`);
}
// limite de 5 boutons
assert(dashJs.includes('length >= 5'), 'limite de 5 boutons manquante');

// 4. Le backend : envoi + modèles + boutons décoratifs
assert(routesJs.includes('/embed/send'), 'endpoint d\'envoi manquant');
assert(routesJs.includes('/embed-templates'), 'endpoints des modèles manquants');
assert(routesJs.includes('sanitizeEmbedPayload'), 'nettoyage des données manquant');
assert(routesJs.includes("ButtonStyle[EMBED_BUTTON_STYLES[b.style]]"), 'construction des boutons manquante');
assert(dbJs.includes('embed_templates'), 'table embed_templates manquante');
assert(dbJs.includes('embedTemplates'), 'store embedTemplates manquant');
assert(panelsJs.includes("cid.startsWith('eb:')"), 'gestionnaire des boutons décoratifs manquant');

// 5. Version v168 déployée (cache PWA + assets)
assert(!index.includes('?v=167'), 'index.html référence encore v167');
assert.strictEqual((index.match(/\?v=168/g) || []).length, 7, 'index.html doit référencer v168 7 fois');
assert(sw.includes("'botdev-v168'"), 'le cache du service worker n’est pas en v168');

// 6. Rendu réel dans jsdom : le module s'affiche et l'aperçu réagit
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;

w.fetch = async (url, opts) => {
  const p = String(url).split('?')[0];
  const resp = (body) => ({ ok: true, status: 200, json: async () => body });
  if (p.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'a@b.fr', discord_id: 'D1', discord_username: 'a', is_admin: true } });
  if (p.endsWith('/api/nexora') || p.endsWith('/api/hoxera')) return resp({ configured: true, bot: { id: 1, name: 'Nexora', prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: '', bot_username: 'Nexora#1', guilds: [] } });
  if (p.endsWith('/api/discord/guilds')) return resp({ guilds: [{ id: 'G1', name: 'Serveur Test', owner: true, canManage: true, hasBot: true, icon: '' }], discord: { username: 'a', avatar: '' } });
  if (p.endsWith('/embed-templates')) return resp({ templates: [{ id: 7, name: 'Règlement', payload: { title: 'Règlement' }, createdAt: '2026-08-29 10:00:00' }] });
  if (p.endsWith('/guilds/G1')) return resp({
    guild: { id: 'G1', name: 'Serveur Test', members: 18 },
    channels: [{ id: 'C1', name: 'général' }, { id: 'C2', name: 'annonces' }],
    roles: [{ id: 'R1', name: 'Membre' }],
    settings: { prefix: '', warn_limit: 0, warn_action: 'none', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '', am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, log_channel: '', suggestion_channel: '' },
    tickets: { name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket', button_style: '3', require_reason: 1, support_role: 'Staff', category: 'Tickets', types: [] },
    events: { defs: {}, state: {} }, role_menus: [], xp_roles: [], profile: {}, blacklist: [],
  });
  return resp({ ok: true });
};

const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
  .map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');

const testSnippet = String.raw`
window.__results = (async () => {
  await new Promise((r) => setTimeout(r, 1400));
  const out = {};
  try {
    const host = document.createElement('div');
    // Comme le vrai dashboard : state.bot + guildId définis avant le module
    Dashboard.state.bot = { id: 1, name: 'Nexora', prefix: '!' };
    Dashboard.state.guildId = 'G1';
    const gdata = await App.api('/bots/1/guilds/G1');
    await Dashboard.renderers.embeds(host, gdata);
    out.rendered = true;
    out.fields = !!host.querySelector('#eb-title') && !!host.querySelector('#eb-description') && !!host.querySelector('#eb-color');
    out.channelSelect = !!host.querySelector('#eb-channel');
    out.sendBtn = !!host.querySelector('#eb-send');
    out.copyBtn = !!host.querySelector('#eb-copy');
    out.preview = !!host.querySelector('.eb-discord');
    await new Promise((r) => setTimeout(r, 150)); // laisser arriver la liste des modèles
    out.template = host.textContent.includes('Règlement');
    // Interaction : taper un titre → l'aperçu se met à jour
    const title = host.querySelector('#eb-title');
    title.value = '📣 Bienvenue !';
    title.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    out.previewReacts = host.querySelector('#eb-preview').textContent.includes('Bienvenue');
    // Ajouter un bouton → il apparaît dans l'aperçu
    host.querySelector('#eb-btn-add').click();
    await new Promise((r) => setTimeout(r, 50));
    const label = host.querySelector('.eb-b-label');
    if (label) { label.value = 'Site web'; label.dispatchEvent(new window.Event('input', { bubbles: true })); }
    await new Promise((r) => setTimeout(r, 50));
    out.buttonAdded = !!host.querySelector('.eb-btns');
  } catch (e) { out.error = e.message; }
  return out;
})();
`;
w.eval(code + '\n;\n' + testSnippet);

setTimeout(async () => {
  const r = await w.__results;
  console.log(JSON.stringify(r));
  const ok = r.rendered && r.fields && r.channelSelect && r.sendBtn && r.copyBtn && r.preview && r.template && r.previewReacts && r.buttonAdded && !r.error;
  if (ok) { console.log('✅ v168 : Embed Builder — éditeur, aperçu en direct, boutons, modèles, envoi'); process.exit(0); }
  process.exit(1);
}, 3200);
