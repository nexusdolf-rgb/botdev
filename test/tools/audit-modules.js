// Balayage des modules du tableau de bord a 375 et 1440 px.
const { chromium } = require('playwright-core');
const BASE = process.env.HOX_BASE || 'https://hoxera.is-a.dev';
const LARGEURS = (process.env.LARGEURS || '375,1440').split(',').map(Number);
const SEULEMENT = (process.env.MODULES || '').split(',').filter(Boolean);

// Charge utile qui reprend la forme exacte de GET /bots/:id/guilds/:guildId.
const GUILD = {
  guild: { id: 'G1', name: 'SN7K COMMUNITY', description: '', members: 336, boosts: 2, channelsCount: 3, rolesCount: 2, createdAt: 1600000000000, icon: '', banner: '' },
  channels: [
    { id: 'C0', name: 'general', type: 0, position: 0, parent_id: null },
    { id: 'C1', name: 'logs', type: 0, position: 1, parent_id: null },
    { id: 'C2', name: 'Vocal', type: 2, position: 2, parent_id: null },
  ],
  roles: [
    { id: 'R1', name: 'Administrateur', color: '#ed4245', position: 10, managed: false },
    { id: 'R2', name: 'Membre', color: '#5865f2', position: 5, managed: false },
  ],
  settings: { prefix: '!', log_channel: 'C1', am_enabled: 1, am_mode: 'enforce', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60 },
  tickets: { name: '', channel: '', message: '', button_label: 'Ouvrir un ticket', button_style: '1', require_reason: 1, support_role: '', category: 'Tickets', types: [] },
  tickets_stats: { total: 0, open: 0 },
  verification: { enabled: 0, channel: '', role: '', mode: 'button', title: '', message: '', isolation: 0 },
  rules: { channel: '', title: '', rules: [] },
  polls: { channel: '', list: [], open: 0 },
  invite_rewards: { enabled: 0, rewards: [] },
  events: { defs: [], state: {} },
  role_menus: [], ticket_menus: [], xp_roles: [], blacklist: [], automod_blacklist: [],
  voicetemp: { creator_channel: '', category: '', name_template: '' },
  applications: { channel: '', questions: '[]', title: 'Candidature', enabled: 0 },
  scheduled: [], shop_items: [], log_events: {},
  sticky: { enabled: 0, channel: '', message: '' },
  linkpanel: { enabled: 0, links: [] },
  reaction_roles: [],
  checklist: [], lockdown: { locked: false, channels: [] },
};

function apiStub(url) {
  if (url.includes('/members')) return { members: [{ id: 'U1', username: 'nexusdolf', display_name: 'nexusdolf', tag: 'nexusdolf', avatar: '', joined_at: Date.now() - 1e8, roles: ['R2'] }] };
  if (url.includes('/roles')) return { roles: FIXTURE.roles };
  if (url.includes('/channels')) return { channels: FIXTURE.channels };
  if (url.includes('/health')) return { ok: true, uptimeMs: 1000, memoryMb: 100, clients: [{ id: 1, ready: true, startedAt: Date.now() }] };
  if (/\/guilds\/[^/]+$/.test(url)) return GUILD;
  if (url.includes('/tickets')) return { types: [], panels: [], tickets: [], open: 0, closed: 0 };
  if (url.includes('/economy/leaderboard')) return { top: [] };
  if (url.includes('/stats')) return { activity: [], joins: [], leaves: [], messages: 0, members: 336 };
  if (url.includes('/shop')) return { items: [], balanceField: 'coins' };
  if (url.includes('/warnings')) return { warnings: [], total: 0 };
  if (url.includes('/suggestions')) return { suggestions: [] };
  if (url.includes('/giveaways')) return { giveaways: [] };
  if (url.includes('/events')) return { events: [] };
  if (url.includes('/polls')) return { polls: [] };
  if (url.includes('/announcements')) return { announcements: [] };
  if (url.includes('/scheduled')) return { scheduled: [] };
  if (url.includes('/rules')) return { rules: [] };
  if (url.includes('/quiz/sets')) return { sets: [] };
  if (url.includes('/sanctions')) return { sanctions: [] };
  if (url.includes('/temproles')) return { roles: [] };
  if (url.includes('/xp')) return { top: [], roles: [] };
  if (url.includes('/antiraid')) return { enabled: false, rules: [] };
  if (url.includes('/quiz')) return { sets: [] };
  if (url.includes('/links')) return { links: [] };
  if (url.includes('/invites')) return { invites: [] };
  if (url.includes('/birthdays')) return { birthdays: [] };
  if (url.includes('/logs')) return { logs: [] };
  if (url.includes('/transcripts')) return { transcripts: [] };
  if (url.includes('/modmail')) return { threads: [] };
  if (url.includes('/autoclean')) return { rules: [] };
  if (url.includes('/starboard')) return { enabled: false };
  if (url.includes('/voicetemp')) return { creator_channel: '', rooms: [] };
  if (url.includes('/lives')) return { lives: [] };
  if (url.includes('/sticky')) return { messages: [] };
  if (url.includes('/embeds')) return { templates: [] };
  if (url.includes('/blacklist')) return { entries: [] };
  if (url.includes('/antiraid')) return { enabled: false, rules: [] };
  if (url.includes('/modules')) return { modules: [] };
  if (url.includes('/commands')) return { commands: [], wanted: [], registered: [], missing: [], extra: [], off: [] };
  return {};
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const rapport = {};
  for (const w of LARGEURS) {
    const p = await b.newPage({ viewport: { width: w, height: 820 } });
    const err = [];
    p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 100)); });
    p.on('pageerror', (e) => err.push('pageerror: ' + String(e.message).slice(0, 110)));
    await p.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({}); });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.evaluate(() => {
      App.state.loaded = true;
      App.state.user = { discord_username: 'nexusdolf', discord_id: '1', is_admin: true };
      document.body.innerHTML = '<div id="modal-root"></div><div id="toasts"></div>'
        + '<div class="dashboard-shell-host"><div class="dash-shell"><aside class="dash-side" id="dash-side"></aside>'
        + '<main class="dash-main"><div class="dash-topbar" id="dash-topbar"></div><div id="dash-content"></div></main></div></div>';
    });
    await p.evaluate(([f]) => {
      App.api = async (url) => window.__stub(url);
      App.toast = () => {};
      Dashboard.state = {
        bot: { id: 1, name: 'Hoxera', online: true, avatar_url: '' }, guildId: 'G1', module: 'overview', moduleHistory: [],
        discordGuilds: [{ id: 'G1', name: 'SN7K COMMUNITY', icon: '', hasBot: true, canManage: true, members: 336 }],
        guild: { id: 'G1', name: 'SN7K COMMUNITY', members: 336, icon: '' }, settings: f.settings, modules: {},
      };
      Dashboard.renderTopbar(document.querySelector('#dash-topbar'), Dashboard.state.discordGuilds);
      if (Dashboard.renderSide) Dashboard.renderSide(document.querySelector('#dash-side'));
    }, [GUILD]);
    await p.exposeFunction('__stub', apiStub);

    const modules = SEULEMENT.length ? SEULEMENT : (await p.evaluate(() => Dashboard.MODULES.map((m) => m[0]).concat(Dashboard.BOT_MODULES.map((m) => m[0]))));
    const res = {};
    for (const mod of modules) {
      err.length = 0;
      await p.evaluate(async (m) => {
        Dashboard.state.module = m;
        await Dashboard.renderContent(document.querySelector('#dash-content'));
      }, mod);
      await p.waitForTimeout(400);
      res[mod] = await p.evaluate((vw) => {
        const zone = document.querySelector('#dash-content') || document.body;
        const deborde = [];
        for (const el of zone.querySelectorAll('*')) {
          const b = el.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) continue;
          if (b.right > vw + 1) deborde.push({ c: String(el.className).slice(0, 34), r: Math.round(b.right) });
        }
        const vides = Array.from(zone.querySelectorAll('.ico, .m-icon, .f-ico, .dash-btn .ico'))
          .filter((e) => !e.innerHTML.trim()).map((e) => String(e.className).slice(0, 30));
        const enregistrer = Array.from(zone.querySelectorAll('button')).filter((x) => /^enregistrer/i.test((x.textContent || '').trim())).length;
        const emojis = Array.from(zone.querySelectorAll('h1,h2,h3,h4,label,.dash-label,.card-title'))
          .map((e) => (e.textContent || '').trim())
          .filter((t) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t));
        const majuscules = Array.from(zone.querySelectorAll('h1,h2,h3,h4')).filter((e) => getComputedStyle(e).textTransform === 'uppercase').length;
        const pseudo = Array.from(zone.querySelectorAll('*')).filter((e) => /NouveauMembre|#0001|serveur\(s\)|en direct en direct/i.test(e.textContent || '') && !e.children.length).length;
        return {
          scroll: zone.scrollWidth - zone.clientWidth,
          deborde: deborde.slice(0, 4), nbDeborde: deborde.length,
          iconesVides: vides.slice(0, 4), boutonsEnregistrer: enregistrer,
          emojis: emojis.slice(0, 3), titresMajuscules: majuscules, textesFactices: pseudo,
          texte: zone.textContent.replace(/\s+/g, ' ').trim().slice(0, 200),
        };
      }, w);
      res[mod].erreurs = Array.from(new Set(err)).slice(0, 3);
    }
    rapport[w] = res;
    await p.close();
  }
  await b.close();
  require('fs').writeFileSync('/tmp/audit-modules.json', JSON.stringify(rapport, null, 1));
  for (const w of Object.keys(rapport)) {
    console.log('==== ' + w + 'px ====');
    for (const [m, v] of Object.entries(rapport[w])) {
      const d = v.nbDeborde ? ' DEPASSE:' + v.nbDeborde : '';
      const e = v.erreurs.length ? ' ERR:' + v.erreurs.join('|').slice(0, 90) : '';
      const s = v.scroll > 0 ? ' SCROLL:' + v.scroll : '';
      const b2 = v.boutonsEnregistrer > 1 ? ' SAVE:' + v.boutonsEnregistrer : '';
      const em = v.emojis.length ? ' EMOJI:' + v.emojis.join(',') : '';
      const maj = v.titresMajuscules ? ' MAJ:' + v.titresMajuscules : '';
      const f = v.textesFactices ? ' FACTICE:' + v.textesFactices : '';
      console.log(m.padEnd(14), (v.texte || '(vide)').slice(0, 130) + d + s + b2 + em + maj + f + e);
    }
  }
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
