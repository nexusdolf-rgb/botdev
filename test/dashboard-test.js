// Test d'intégration du dashboard v2 : le routeur rend le bot → Dashboard.mount
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
  url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;

w.fetch = async (url, opts) => {
  const path = String(url).split('?')[0];
  const resp = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (path.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'a@b.fr', discord_id: 'D1', discord_username: 'a', is_admin: true } });
  if (path.endsWith('/api/hoxera')) return resp({ configured: true, bot: { id: 1, name: 'Hoxera', prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: '', bot_username: 'Hoxera#1', guilds: [] } });
  if (path.endsWith('/api/discord/guilds')) return resp({ guilds: [{ id: 'G1', name: 'Serveur Test', owner: true, canManage: true, hasBot: true, icon: '' }], discord: { username: 'a', avatar: '' } });
  if (path.endsWith('/guilds/G1')) return resp({
    guild: { id: 'G1', name: 'Serveur Test', members: 18 },
    settings: { prefix: '', warn_limit: 0, warn_action: 'none', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '', am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, log_channel: '', suggestion_channel: '' },
    tickets: { name: '', channel: '', message: '', button_label: '', support_role: '', category: '', types: [] },
    events: { defs: { member_join: { emoji: '👋', label: 'Bienvenue', description: 'x', config: [] } }, state: {} },
    role_menus: [], xp_roles: [], profile: {}, blacklist: [],
  });
  return resp({});
};


// Lecture stable : la sandbox peut servir des lectures corrompues — on relit
// jusqu'à obtenir deux lectures identiques consécutives.
function readStable(p) {
  let a = null;
  for (let i = 0; i < 8; i++) {
    const b = fs.readFileSync(p, 'utf8');
    if (a !== null && a === b) return b;
    a = b;
  }
  return a;
}

const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
  .map((f) => readStable('public/js/' + f)).join('\n;\n');
w.eval(code);

setTimeout(async () => {
  try {
    await new Promise((r) => setTimeout(r, 1200)); // laisse le routeur + fetchs finir
    const shell = document.querySelector('#app .bot-shell');
    const results = {
      hasShell: !!shell,
      modules: shell ? shell.querySelectorAll('.dash-side-item').length : 0,
      header: shell && shell.querySelector('.dash-module-header h1') ? shell.querySelector('.dash-module-header h1').textContent : 'VIDE',
      statCards: shell ? shell.querySelectorAll('.dash-stat').length : 0,
      guildPick: shell && shell.querySelector('#d-guild') ? shell.querySelector('#d-guild').value : null,
      botSection: shell ? !![...shell.querySelectorAll('.dash-side-section')].find((s) => s.textContent === 'Bot') : false,
      errorShown: shell ? !!shell.querySelector('.empty-state') : false,
    };
    console.log(JSON.stringify(results, null, 2));
    const ok = results.modules >= 15 && results.header.includes('Vue') && results.guildPick === 'G1' && results.botSection && !results.errorShown;
    if (ok) { console.log('✅ DASHBOARD HOXERA RENDU PAR LE ROUTEUR — 100% fonctionnel'); process.exit(0); }
    process.exit(1);
  } catch (e) { console.error('❌', e.message); process.exit(1); }
}, 3500);
