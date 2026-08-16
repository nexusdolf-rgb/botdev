// Test d'intégration du dashboard Hoxera v2 : routeur + modules Bienvenue (sélecteurs)
// et Tickets (état + couleur du bouton + questionnaire).
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
  if (path.endsWith('/api/nexora') || path.endsWith('/api/hoxera')) return resp({ configured: true, bot: { id: 1, name: 'Hoxera', prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: '', bot_username: 'Hoxera#1', guilds: [] } });
  if (path.endsWith('/api/discord/guilds')) return resp({ guilds: [{ id: 'G1', name: 'Serveur Test', owner: true, canManage: true, hasBot: true, icon: '' }], discord: { username: 'a', avatar: '' } });
  if (path.endsWith('/guilds/G1')) return resp({
    guild: { id: 'G1', name: 'Serveur Test', members: 18 },
    channels: [
      { id: 'C1', name: 'bienvenue' }, { id: 'C2', name: 'support' },
      { id: 'C3', name: 'Tickets', category: true },
    ],
    roles: [{ id: 'R1', name: 'Membre' }, { id: 'R2', name: 'Staff' }],
    settings: { prefix: '', warn_limit: 0, warn_action: 'none', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '', am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, log_channel: '', suggestion_channel: '' },
    tickets: { name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket', button_style: '3', require_reason: 1, support_role: 'Staff', category: 'Tickets', types: [] },
    events: {
      defs: {
        member_join: { emoji: '👋', label: 'Bienvenue', description: 'x', config: [
          { key: 'channel', label: 'Salon', type: 'channel' },
          { key: 'message', label: 'Message', type: 'multiline', default: 'Bienvenue {user} !' },
          { key: 'embed', label: 'Embed', type: 'checkbox' },
          { key: 'color', label: 'Couleur', type: 'color', default: '#57F287' },
        ] },
        autorole: { emoji: '🏷️', label: 'Auto-rôle', description: 'x', config: [
          { key: 'role', label: 'Rôle', type: 'role' },
        ] },
      },
      state: { member_join: { enabled: true, config: { channel: '#bienvenue', color: '#ED4245' } }, autorole: { enabled: false, config: {} } },
    },
    role_menus: [], xp_roles: [], profile: {}, blacklist: [],
  });
  // Sauvegardes silencieuses
  return resp({ ok: true });
};

const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
  .map((f) => fs.readFileSync('public/js/' + f, 'utf8')).join('\n;\n');

const testSnippet = String.raw`
window.__results = (async () => {
  await new Promise((r) => setTimeout(r, 1200)); // routeur + fetchs
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

    // Module Bienvenue (sélecteurs)
    try {
      const content = document.createElement('div');
      const gdata = await App.api('/bots/1/guilds/G1');
      await Dashboard.renderers.welcome(content, gdata);
      results.welcome = {
        channelSelect: !!content.querySelector('select[data-k="channel"]'),
        colorPicker: !!content.querySelector('input[type=color][data-k="color"]'),
        roleSelect: !!content.querySelector('select[data-k="role"]'),
        cards: content.querySelectorAll('.dash-card').length,
      };
    } catch (e) { results.welcome = { error: e.message }; }

    // Module Tickets (état + couleur bouton + questionnaire)
    try {
      const content2 = document.createElement('div');
      const gdata2 = await App.api('/bots/1/guilds/G1');
      await Dashboard.renderers.tickets(content2, gdata2);
      results.tickets = {
        styleSelect: !!content2.querySelector('#t-style'),
        reasonToggle: !!content2.querySelector('#t-reason'),
        channelSelect: !!content2.querySelector('#t-channel'),
        roleSelect: !!content2.querySelector('#t-role'),
        statusFound: content2.textContent.includes('salon trouvé'),
        sendBtn: !!content2.querySelector('#t-send'),
      };
    } catch (e) { results.tickets = { error: e.message }; }

  return results;
})();
`;

w.eval(code + '\n;\n' + testSnippet);

setTimeout(async () => {
  try {
    const results = await w.__results;
    console.log(JSON.stringify(results, null, 2));
    const ok = results.modules >= 15 && results.header.includes('Vue') && results.guildPick === 'G1'
      && results.botSection && !results.errorShown
      && results.welcome && !results.welcome.error && results.welcome.channelSelect
      && results.welcome.colorPicker && results.welcome.roleSelect && results.welcome.cards >= 2
      && results.tickets && !results.tickets.error && results.tickets.styleSelect
      && results.tickets.reasonToggle && results.tickets.channelSelect
      && results.tickets.roleSelect && results.tickets.statusFound && results.tickets.sendBtn;
    if (ok) { console.log('✅ DASHBOARD HOXERA 100% FONCTIONNEL (bienvenue à sélecteurs + tickets avec état/couleur/questionnaire)'); process.exit(0); }
    process.exit(1);
  } catch (e) { console.error('❌', e.message); process.exit(1); }
}, 6000);
