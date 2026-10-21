// Captures d'écran du tableau de bord connecté, module par module.
//   MODULES=overview,logs node test/tools/capture-modules.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3000';
const LARGEURS = (process.env.LARGEURS || '375').split(',').map(Number);
const MODS = (process.env.MODULES || 'overview').split(',');
const THEME = process.env.THEME || 'light';
const OUT = process.env.OUT || '/tmp';

const GUILLDE = {
  guild: { id: 'G1', name: 'SN7K COMMUNITY', members: 336 },
  channels: [{ id: 'C0', name: 'general', type: 0, position: 0 }, { id: 'C1', name: 'logs', type: 0, position: 1 }],
  roles: [{ id: 'R2', name: 'Membre', color: '#5865f2', position: 5 }],
  settings: { prefix: '!', xp_enabled: 1, log_channel: 'C1' }, tickets: { types: [] }, tickets_stats: {},
  verification: {}, rules: {}, polls: { list: [] }, events: { defs: [], state: {} }, scheduled: [],
  shop_items: [], voicetemp: {}, applications: {}, sticky: {}, linkpanel: {}, reaction_roles: [], blacklist: [],
  automod_blacklist: [], xp_roles: [], role_menus: [], ticket_menus: [], log_events: {}, invite_rewards: {},
  checklist: [], lockdown: {},
};

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const w of LARGEURS) {
    const p = await b.newPage({ viewport: { width: w, height: 900 }, colorScheme: THEME });
    await p.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({}); });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.evaluate((guildData) => {
      App.state.loaded = true;
      App.state.user = { discord_id: '1', discord_username: 'nexusdolf', is_admin: true };
      document.body.innerHTML = '<div class="dashboard-shell-host"><div class="dash-shell"><aside class="dash-side" id="dash-side"></aside><main class="dash-main"><div class="dash-topbar" id="dash-topbar"></div><div id="dash-content"></div></main></div></div><div id="toasts"></div>';
      App.api = async (u) => {
        if (/\/guilds\/[^/]+$/.test(u)) return guildData;
        if (u.includes('/stats')) return { activity: [], joins: [], top_active: [] };
        if (u.includes('/modules')) return { modules: [] };
        return {};
      };
      App.toast = () => {};
    }, GUILLDE);
    for (const mod of MODS) {
      await p.evaluate(async ([m, g]) => {
        Dashboard.state = { bot: { id: 1, name: 'Hoxera', online: true }, guildId: 'G1', module: m, moduleHistory: [],
          discordGuilds: [{ id: 'G1', name: 'SN7K COMMUNITY', hasBot: true }], guild: g.guild, settings: g.settings, modules: {} };
        Dashboard.renderSide && Dashboard.renderSide(document.querySelector('#dash-side'), Dashboard.state);
        Dashboard.renderTopbar && Dashboard.renderTopbar(document.querySelector('#dash-topbar'), Dashboard.state.discordGuilds);
        await Dashboard.renderContent(document.querySelector('#dash-content'));
        await new Promise((r) => setTimeout(r, 400));
      }, [mod, GUILLDE]);
      const f = OUT + '/dash-' + mod + '-' + w + '-' + THEME + '.png';
      await p.screenshot({ path: f, fullPage: true });
      console.log(f);
    }
    await p.close();
  }
  await b.close();
})();
