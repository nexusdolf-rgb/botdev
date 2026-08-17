// ============================================================
// Test Hoxera v47 — Interface Android
//  1. Le dashboard a une barre de navigation basse (5 entrées)
//  2. L'onglet actif suit le module courant
//  3. « Plus » ouvre une feuille avec TOUS les modules (et Bot si admin)
//  4. Changer de module depuis la feuille met à jour l'onglet actif
//  5. Le site se rend toujours (pas de régression)
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
    url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;

  w.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body) => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'a@b.fr', discord_id: 'D1', discord_username: 'a', is_admin: true } });
    if (p.endsWith('/api/hoxera')) return resp({ configured: true, bot: { id: 1, name: 'Hoxera', prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: '', bot_username: 'Hoxera#1', guilds: [] } });
    if (p.endsWith('/api/discord/guilds')) return resp({ guilds: [{ id: 'G1', name: 'Serveur Test', owner: true, canManage: true, hasBot: true, icon: '' }] });
    if (p.endsWith('/guilds/G1/stats')) return resp({ activity: [], joins: [], top_active: [] });
    if (p.endsWith('/guilds/G1/temproles')) return resp({ roles: [] });
    if (p.endsWith('/guilds/G1/shop')) return resp({ items: [] });
    if (p.endsWith('/guilds/G1/shop/purchases')) return resp({ purchases: [] });
    if (p.endsWith('/guilds/G1/suggestions')) return resp({ suggestions: [] });
    if (p.endsWith('/guilds/G1/scheduled')) return resp({ scheduled: [] });
    if (p.endsWith('/guilds/G1/giveaways')) return resp({ giveaways: [] });
    if (p.endsWith('/guilds/G1')) return resp({
      guild: { id: 'G1', name: 'Serveur Test', members: 18 },
      channels: [{ id: 'C1', name: 'bienvenue' }],
      roles: [{ id: 'R1', name: 'Membre' }],
      settings: { prefix: '', warn_limit: 0, warn_action: 'none', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '', am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, log_channel: '', suggestion_channel: '', birthday_channel: '', birthday_role: '' },
      tickets: { channel: '#support', types: [] }, tickets_stats: { total: 0, open: 0 },
      events: { defs: {}, state: {} },
      role_menus: [], xp_roles: [], profile: {}, blacklist: [],
      voicetemp: { creator_channel: '', category: '', name_template: '' },
      applications: {}, scheduled: [], shop_items: [], log_events: {},
      lockdown: { locked: false, channels: [] },
      checklist: [],
    });
    return resp({ ok: true });
  };

  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
    .map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');

  const snippet = String.raw`
  window.__r = (async () => {
    await new Promise((r) => setTimeout(r, 1800)); // routeur + fetchs
    const out = {};
    const shell = document.querySelector('#app .bot-shell .dash-shell');
    const bnav = shell ? shell.querySelector('.dash-bnav') : null;
    out.hasShell = !!shell;
    out.hasBnav = !!bnav;
    out.bnavItems = bnav ? bnav.querySelectorAll('.bnav-item').length : 0;
    out.activeHome = bnav && bnav.querySelector('[data-bnav="overview"]') ? bnav.querySelector('[data-bnav="overview"]').classList.contains('active') : false;

    // Changer de module depuis la nav basse
    if (bnav) {
      bnav.querySelector('[data-bnav="tickets"]').click();
      await new Promise((r) => setTimeout(r, 600));
      out.activeTickets = bnav.querySelector('[data-bnav="tickets"]').classList.contains('active');
      out.ticketsContent = shell.textContent.includes('Système de tickets');
      // revenir à l'accueil
      bnav.querySelector('[data-bnav="overview"]').click();
      await new Promise((r) => setTimeout(r, 600));
    }

    // « Plus » → feuille avec tous les modules
    out.sheet = null;
    if (bnav) {
      bnav.querySelector('[data-more]').click();
      await new Promise((r) => setTimeout(r, 200));
      const modal = document.querySelector('.modal');
      out.sheet = {
        open: !!modal,
        items: modal ? modal.querySelectorAll('.sheet-item').length : 0,
        hasServerSection: modal ? modal.textContent.includes('Serveur sélectionné') : false,
        hasBotSection: modal ? modal.textContent.includes('🤖 Bot') : false,
        hasLevels: modal ? modal.textContent.includes('Niveaux') : false,
        hasGiveaways: modal ? modal.textContent.includes('Giveaways') : false,
      };
      if (modal) {
        const levelsBtn = [...modal.querySelectorAll('.sheet-item')].find((b) => b.textContent.includes('Niveaux'));
        if (levelsBtn) {
          levelsBtn.click();
          await new Promise((r) => setTimeout(r, 600));
          out.sheet.closedAfterPick = !document.querySelector('.modal');
          out.moduleAfterPick = Dashboard.state.module;
        }
      }
    }
    return out;
  })();
  `;

  w.eval(code + '\n;\n' + snippet);

  await new Promise((r) => setTimeout(r, 7000));
  const res = await w.__r;
  console.log(JSON.stringify(res, null, 2));

  const ok = res.hasShell && res.hasBnav && res.bnavItems === 5
    && res.activeHome && res.activeTickets && res.ticketsContent
    && res.sheet && res.sheet.open && res.sheet.items >= 15
    && res.sheet.hasServerSection && res.sheet.hasBotSection
    && res.sheet.hasLevels && res.sheet.hasGiveaways
    && res.sheet.closedAfterPick && res.moduleAfterPick === 'levels';

  console.log(ok && failures === 0 ? '\n✅ V47 — Interface Android : navigation basse + feuille « Plus » 100 % fonctionnelles. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(ok && failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
