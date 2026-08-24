// Aperçu RÉEL du dashboard rendu (jsdom) — l'œil du développeur.
// Monte la sidebar, la topbar et le module Vue d'ensemble avec des données
// factices, puis imprime la structure pour inspection visuelle.
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="app"></div><div id="toasts"></div><div id="modal-root"></div>
  <div class="bot-shell" id="shell"></div>
</body></html>`, { runScripts: 'outside-only', url: 'https://hoxera.is-a.dev/' });
const { window } = dom;
global.window = window; global.document = window.document;

// Charger app.js + dashboard.js dans le contexte (même portée d'eval)
window.fetch = async () => ({ ok: true, json: async () => ({}) });
const code = fs.readFileSync('public/js/app.js', 'utf8') + '\n' + fs.readFileSync('public/js/dashboard.js', 'utf8') + '\nwindow.App = App; window.Dashboard = Dashboard;';
window.eval(code);
const { App, Dashboard } = window;

// Données factices réalistes
Dashboard.state = {
  bot: { id: 1, name: 'Hoxera', bot_username: 'Nexora', avatar_url: 'https://cdn.discordapp.com/avatars/1/x.png', online: true, prefix: '!', invite_url: '#' },
  guildId: 'g1', module: 'overview',
  discordGuilds: [
    { id: 'g1', name: 'Support Nexora', icon: 'https://cdn.discordapp.com/icons/g1/a.png', hasBot: true, canManage: true },
    { id: 'g2', name: 'Communauté CODM', icon: null, hasBot: true, canManage: true },
    { id: 'g3', name: 'OneState', icon: null, hasBot: false, canManage: true },
  ],
};
window.App.state = { user: { is_admin: true, email: 'a@b.c' } };

const side = document.createElement('aside'); side.className = 'dash-side';
const top = document.createElement('div'); top.className = 'dash-topbar';
Dashboard.renderSide(side);
Dashboard.renderTopbar(top, Dashboard.state.discordGuilds);

const outline = (el, depth = 0) => {
  let out = '';
  for (const child of el.children) {
    const cls = child.className && typeof child.className === 'string' ? '.' + child.className.trim().split(/\s+/).join('.') : '';
    const txt = child.children.length === 0 ? ` "${(child.textContent || '').trim().slice(0, 38)}"` : '';
    out += '  '.repeat(depth) + child.tagName.toLowerCase() + cls + txt + '\n';
    if (depth < 3) out += outline(child, depth + 1);
  }
  return out;
};
console.log('====== TOPBAR ======');
console.log(outline(top));
console.log('====== SIDEBAR (aperçu) ======');
console.log(outline(side).split('\n').slice(0, 28).join('\n'));
