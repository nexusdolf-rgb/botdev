// Captures d'écran du tableau de bord connecté, module par module.
//   MODULES=overview,logs node test/tools/capture-modules.js
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3000';
const LARGEURS = (process.env.LARGEURS || '375').split(',').map(Number);
const MODS = (process.env.MODULES || 'overview').split(',');
const THEME = process.env.THEME || 'light';
const OUT = process.env.OUT || '/tmp';

// Miroir d'EVENT_DEFS (server/discord/events.js) — uniquement la forme utile au
// rendu : types de champs et libellés. Éviter un require qui ouvrirait la base.
const DEFS = {
  member_join: { label: 'Message de bienvenue', emoji: '👋', description: 'Envoie un message quand un membre rejoint le serveur.', config: [
    { key: 'channel', label: "Salon d'accueil", type: 'channel', placeholder: '#bienvenue' },
    { key: 'message', label: 'Message ({user}, {server}, {count}…)', type: 'multiline', default: 'Passez un bon moment parmi nous — l’équipe est là pour vous aider ! 🚀' },
    { key: 'card', label: 'Carte de bienvenue en image (avatar et pseudo)', type: 'checkbox', default: false },
    { key: 'plain', label: 'Mode texte simple (désactive le panneau complet)', type: 'checkbox', default: false },
    { key: 'color', label: "Couleur de l'embed", type: 'color', default: '#57F287' },
    { key: 'image', label: "Image de l'embed (URL, optionnel)", type: 'text', placeholder: 'https://…' },
  ] },
  member_leave: { label: 'Message de départ', emoji: '👋', description: 'Envoie un message quand un membre quitte le serveur.', config: [
    { key: 'channel', label: 'Salon des départs', type: 'channel', placeholder: '#au-revoir' },
    { key: 'message', label: 'Message', type: 'multiline', default: 'Merci d’avoir fait partie de {server} 💛' },
    { key: 'plain', label: 'Mode texte simple (désactive le panneau complet)', type: 'checkbox', default: false },
    { key: 'color', label: "Couleur de l'embed", type: 'color', default: '#ED4245' },
  ] },
  autorole: { label: 'Auto-rôle', emoji: '🏷️', description: 'Donne automatiquement un ou PLUSIEURS rôles aux nouveaux membres.', config: [
    { key: 'roles', label: 'Rôles à donner automatiquement (plusieurs possibles)', type: 'rolesmulti', placeholder: 'Membre, Nouveau' },
    { key: 'role', label: 'Ancien réglage (un seul rôle — laisser vide si la liste ci-dessus est utilisée)', type: 'role', placeholder: 'Membre' },
  ] },
};

const GUILLDE = {
  guild: { id: 'G1', name: 'SN7K COMMUNITY', members: 336 },
  channels: [{ id: 'C0', name: 'general', type: 0, position: 0 }, { id: 'C1', name: 'logs', type: 0, position: 1 }],
  roles: [{ id: 'R2', name: 'Membre', color: '#5865f2', position: 5 }],
  settings: { prefix: '!', xp_enabled: 1, log_channel: 'C1' }, tickets: { types: [] }, tickets_stats: {},
  verification: {}, rules: {}, polls: { list: [] }, events: { defs: DEFS, state: {} }, scheduled: [],
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
      // Même forme de réponses que le banc audit-mobile : chaque module
      // déstructure ses champs, un « {} » générique le ferait tomber en erreur
      // et la capture montrerait un défaut du banc, pas du produit.
      const sante = { ok: true, online: true, latency: 24, uptime: '3 j', guilds: 1 };
      const antiNuke = { enabled: false, state: {}, events: [] };
      App.api = async (u) => {
        if (u.includes('/antinuke/state')) return antiNuke;
        if (u.includes('/antinuke')) return { ok: true };
        if (u.includes('/health')) return sante;
        if (u.includes('/sanctions')) return { sanctions: [{ name: 'Spam', action: 'timeout', duration: 10, message: 'Pas de pub.' }] };
        if (u.includes('/members')) return { members: [] };
        if (u.includes('/invites')) return { invites: [] };
        if (u.includes('/economy/leaderboard')) return { top: [{ user_id: 'U1', username: 'membre_1', coins: 1240, rank: 1 }], me: null };
        if (u.includes('/shop')) return { items: [{ id: 1, name: 'Rôle VIP', description: 'Accès au salon privé', price: 500, role: 'R2', emoji: '💎' }], purchases: [] };
        if (u.includes('/quiz/top')) return { top: [] };
        if (u.includes('/quiz/sets')) return { sets: [] };
        if (u.includes('/temproles')) return { roles: [] };
        if (u.includes('/stats')) return { activity: [], joins: [], totals: { messages: 412, joins: 12, leaves: 3, active: 34 }, top_active: [] };
        if (u.includes('/commands')) return { commands: [{ id: 1, name: 'regles', response: 'Lis le salon #règles.', role: '' }] };
        if (u.includes('/modules')) return { modules: [] };
        if (u.includes('/birthdays')) return { birthdays: [] };
        if (u.includes('/warnings')) return { warnings: [] };
        if (u.includes('/lives')) return { lives: [{ id: 1, platform: 'twitch', channel: 'hoxera', enabled: 1 }] };
        if (u.includes('/transcripts')) return { items: [] };
        if (u.includes('/modmail')) return { threads: [] };
        if (u.includes('/logs')) return { logs: [] };
        if (u.includes('/giveaways')) return { giveaways: [] };
        if (u.includes('/suggestions')) return { suggestions: [] };
        if (u.includes('/announcements')) return { announcements: [] };
        if (u.includes('/events')) return { events: [], defs: [], state: {} };
        if (u.includes('/quiz')) return { quiz: [] };
        if (/\/guilds\/[^/]+$/.test(u)) return guildData;
        return { items: [], purchases: [], logs: [], commands: [], modules: [], roles: [], suggestions: [], top: [] };
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
