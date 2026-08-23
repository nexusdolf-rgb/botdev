// ============================================================
// Test Hoxera 2.0 (v33) :
//  1. Nouvelles tables & stores (mariages, anniversaires, rappels, stats…)
//  2. Module extra.js (commandes slash, durées, aide)
//  3. Dashboard : Membres, Statistiques, Annonces, filtres de journaux
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
// Base de test isolée (ne touche pas botdev.db)
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-test-'));


let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  // ---------- 1. Stores ----------
  const store = require('../server/db');
  const BOT = 999001, G = 'G-TEST-33', U1 = 'u1', U2 = 'u2';

  // Mariages
  store.marriages.set(BOT, G, U1, U2);
  check('marriages : couple retrouvé', !!store.marriages.get(BOT, G, U1));
  check('marriages : compteur = 1', store.marriages.count(BOT, G) === 1);
  store.marriages.remove(BOT, G, U1, U2);
  check('marriages : divorce ok', store.marriages.count(BOT, G) === 0);

  // Anniversaires
  store.birthdays.set(BOT, G, U1, 14, 7);
  check('birthdays : enregistré', !!store.birthdays.get(BOT, G, U1));
  check('birthdays : today()', store.birthdays.today(14, 7).length === 1);
  store.birthdays.remove(BOT, G, U1);
  check('birthdays : supprimé', !store.birthdays.get(BOT, G, U1));

  // Rappels
  store.reminders.add(BOT, G, 'C1', U1, Date.now() - 1000, 'test');
  check('reminders : due()', store.reminders.due(Date.now()).length === 1);
  store.reminders.remove(store.reminders.due(Date.now())[0].id);
  check('reminders : supprimé', store.reminders.due(Date.now()).length === 0);

  // Messages programmés
  const sid = store.scheduled.add(BOT, G, { channel_id: 'C1', hour: 18, minute: 0, days: '1,3,5', text: 'hello' });
  check('scheduled : créé', !!sid);
  check('scheduled : allEnabled', store.scheduled.allEnabled().length >= 1);
  store.scheduled.update(sid, { enabled: 0 });
  check('scheduled : désactivé', store.scheduled.get(sid).enabled === 0);
  store.scheduled.remove(sid);

  // Stats
  const today = new Date().toISOString().slice(0, 10);
  store.msgStats.bump(BOT, G, U1, today);
  store.msgStats.bump(BOT, G, U1, today);
  store.msgStats.bump(BOT, G, U2, today);
  const pd = store.msgStats.perDay(BOT, G, 7);
  check('msgStats : 7 jours', pd.length === 7);
  check('msgStats : 3 messages aujourd\'hui', pd[pd.length - 1].messages === 3);
  const top = store.msgStats.topUsers(BOT, G, 7);
  check('msgStats : top = u1', top.length === 2 && top[0].user_id === U1 && top[0].n === 2);
  store.joinStats.bump(BOT, G, today);
  check('joinStats : 1 aujourd\'hui', store.joinStats.perDay(BOT, G, 7).slice(-1)[0].members === 1);

  // Boutique : achats
  store.shopPurchases.add(BOT, G, U1, 'VIP', 500);
  check('shopPurchases : enregistré', store.shopPurchases.last(BOT, G, 5).length === 1);

  // Candidatures
  store.applications.set(BOT, G, { channel: 'C1', questions: JSON.stringify(['Âge ?', 'Dispo ?']), title: '📝 Recrutement', enabled: 1 });
  const app = store.applications.get(BOT, G);
  check('applications : config ok', app.enabled === 1 && JSON.parse(app.questions).length === 2);

  // Salons vocaux temporaires
  store.voicetemp.set(BOT, G, { creator_channel: 'V1', category: 'CAT1', name_template: '🔊 {name}' });
  check('voicetemp : config ok', store.voicetemp.get(BOT, G).creator_channel === 'V1');
  store.voicetemp.remove(BOT, G);
  check('voicetemp : supprimé', !store.voicetemp.get(BOT, G));

  // Tickets : max_one + stats
  store.tickets.set(BOT, G, { max_one: 1, button_style: '2' });
  check('tickets : max_one stocké', store.tickets.get(BOT, G).max_one === 1);

  // Menus de rôles : mode boutons
  const mid = store.roleMenus.create({ bot_id: BOT, guild_id: G, name: 'Test', options: JSON.stringify([{ label: 'A', role: 'R1' }]), mode: 'buttons' });
  check('roleMenus : mode boutons', store.roleMenus.get(mid).mode === 'buttons');
  store.roleMenus.remove(mid);

  // Réglages serveur : log_events + anniversaires
  store.guildSettings.set(BOT, G, { log_events: JSON.stringify({ tickets: 1, mod: 1 }), birthday_channel: 'C1', birthday_role: 'R1', lockdown_channels: JSON.stringify([{ id: 'X', wasDenied: false }]) });
  const gs = store.guildSettings.get(BOT, G);
  check('guildSettings : log_events', JSON.parse(gs.log_events).tickets === 1);
  check('guildSettings : anniversaire', gs.birthday_channel === 'C1' && gs.birthday_role === 'R1');
  check('guildSettings : lockdown', JSON.parse(gs.lockdown_channels).length === 1);

  // Suggestions : remove
  const sgid = store.suggestions.create({ bot_id: BOT, guild_id: G, author_id: U1, text: 'test', message_id: '', channel_id: '' });
  store.suggestions.remove(sgid);
  check('suggestions : suppression', !store.suggestions.get(sgid));

  // ---------- 2. extra.js ----------
  const extra = require('../server/discord/extra');
  check('extra : parseDuration 2h', extra.parseDuration('2h') === 7200000);
  check('extra : parseDuration 10m', extra.parseDuration('10m') === 600000);
  check('extra : parseDuration invalide', extra.parseDuration('dans 2 heures') === null);
  check('extra : formatDuration', extra.formatDuration(7200000).includes('heure'));
  const payloads = extra.buildExtraPayloads();
  const names = payloads.map((p) => p.name);
  ['marry', 'divorce', 'couple', 'hug', 'kiss', 'slap', 'pat', 'punch', 'rps', 'pendu', 'morpion', 'birthday', 'remind', 'poll', 'snipe', 'work', 'gamble', 'rob', 'lockdown', 'voicetemp', 'apply'].forEach((n) => {
    check(`extra : commande /${n}`, names.includes(n));
  });
  check('extra : aide marry', extra.HELP_EXTRA.marry && extra.HELP_EXTRA.marry.length === 4);
  check('extra : lockdown réservé admin', payloads.find((p) => p.name === 'lockdown').default_member_permissions);

  // ---------- 3. Dashboard (JSDOM) ----------
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', {
    url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;

  w.fetch = async (url, opts) => {
    const p = String(url).split('?')[0];
    const resp = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (p.endsWith('/api/auth/me')) return resp({ user: { id: 1, email: 'a@b.fr', discord_id: 'D1', discord_username: 'a', is_admin: true } });
    if (p.endsWith('/api/hoxera') || p.endsWith('/api/nexora')) return resp({ configured: true, bot: { id: 1, name: 'Hoxera', prefix: '!', online: true, invite_url: 'https://x', status_text: '', avatar_url: '', bot_username: 'Hoxera#1', guilds: [] } });
    if (p.endsWith('/api/discord/guilds')) return resp({ guilds: [{ id: 'G1', name: 'Serveur Test', owner: true, canManage: true, hasBot: true, icon: '' }] });
    if (p.endsWith('/guilds/G1/members')) return resp({ members: [
      { id: 'u1', tag: 'Alice#0001', username: 'Alice', avatar: '', roles: [{ id: 'R1', name: 'Staff', color: '#5865F2' }], coins: 250, xp: 100, level: 2, is_owner: true },
      { id: 'u2', tag: 'Bob#0001', username: 'Bob', avatar: '', roles: [], coins: 50, xp: 20, level: 1, is_owner: false },
    ]});
    if (p.endsWith('/guilds/G1/stats')) return resp({ activity: [{ day: '2026-08-11', messages: 3 }, { day: '2026-08-17', messages: 12 }], joins: [{ day: '2026-08-11', members: 0 }, { day: '2026-08-17', members: 2 }], top_active: [{ user_id: 'u1', messages: 12, tag: 'Alice#0001', avatar: '' }] });
    if (p.endsWith('/guilds/G1/scheduled')) return resp({ scheduled: [{ id: 1, channel_id: 'C1', hour: 18, minute: 0, days: '1,2,3,4,5,6,7', text: 'Annonce test', enabled: 1 }] });
    if (p.endsWith('/guilds/G1/suggestions')) return resp({ suggestions: [{ id: 1, text: 'Un concours ?', upvotes: 3, downvotes: 1, status: 'pending' }] });
    if (p.endsWith('/guilds/G1/shop/purchases')) return resp({ purchases: [{ user_id: 'u1', item: 'VIP', price: 500, ts: '2026-08-17 10:00:00' }] });
    if (p.endsWith('/guilds/G1/shop')) return resp({ items: [] });
    if (p.endsWith('/guilds/G1/temproles')) return resp({ roles: [] });
    if (p.endsWith('/guilds/G1')) return resp({
      guild: { id: 'G1', name: 'Serveur Test', members: 18 },
      channels: [
        { id: 'C1', name: 'bienvenue' }, { id: 'C2', name: 'support' },
        { id: 'V1', name: '➕ Créer un vocal', voice: true },
        { id: 'C3', name: 'Tickets', category: true },
      ],
      roles: [{ id: 'R1', name: 'Membre' }, { id: 'R2', name: 'Staff' }],
      settings: { prefix: '', warn_limit: 0, warn_action: 'none', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '', am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, log_channel: '', suggestion_channel: '', birthday_channel: '', birthday_role: '' },
      tickets: { name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket', button_style: '3', require_reason: 1, support_role: 'Staff', category: 'Tickets', types: [] },
      tickets_stats: { total: 7, open: 2 },
      events: { defs: {}, state: {} },
      role_menus: [{ id: 9, name: 'Rôles', options: [{ label: 'A', role: 'R1' }], mode: 'buttons', placeholder: '', content: '', channel: '' }],
      xp_roles: [], profile: {}, blacklist: [],
      voicetemp: { creator_channel: '', category: '', name_template: '' },
      applications: { channel: '', questions: '[]', title: '📝 Candidature', enabled: 0 },
      scheduled: [],
      log_events: {},
    });
    if (p.endsWith('/api/backup/status')) return resp({ enabled: true, repo: 'test/data', branch: 'main', last_backup: new Date().toISOString() });
    return resp({ ok: true });
  };

  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js']
    .map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');

  const snippet = String.raw`
  window.__results = (async () => {
    const results = {};
    const content = document.createElement('div');
    Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!' }, guildId: 'G1', module: 'overview', discordGuilds: [] };
    const gdata = await App.api('/bots/1/guilds/G1');

    // Membres
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.members(c, gdata);
      await new Promise((r) => setTimeout(r, 300));
      results.members = {
        search: !!c.querySelector('#m-search'),
        rows: c.querySelectorAll('.dash-member').length,
        hasCoins: !!c.querySelector('[data-coins]'),
        hasRole: !!c.querySelector('[data-role]'),
        hasKick: !!c.querySelector('[data-kick]'),
        showsCoins: c.textContent.includes('250 coins'),
      };
    } catch (e) { results.members = { error: e.message, stack: e.stack }; }

    // Statistiques
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.stats(c);
      await new Promise((r) => setTimeout(r, 300));
      results.stats = {
        cards: c.querySelectorAll('.dash-card').length,
        bars: c.querySelectorAll('.bar').length,
        topActive: c.textContent.includes('Alice'),
        messages: c.textContent.includes('12'),
      };
    } catch (e) { results.stats = { error: e.message, stack: e.stack }; }

    // Annonces
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.announcements(c, gdata);
      await new Promise((r) => setTimeout(r, 300));
      results.announcements = {
        list: c.textContent.includes('18h00'),
        days: c.querySelectorAll('[data-day]').length,
        channelSelect: !!c.querySelector('#a-channel'),
        textArea: !!c.querySelector('#a-text'),
      };
    } catch (e) { results.announcements = { error: e.message }; }

    // Tickets : bandeau de stats
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.tickets(c, gdata);
      results.tickets = {
        statsStrip: c.textContent.includes('Ouverts en ce moment') && c.textContent.includes('2'),
        total: c.textContent.includes('7'),
      };
    } catch (e) { results.tickets = { error: e.message }; }

    // Rôles : mode boutons affiché
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.roles(c, gdata);
      results.roles = { buttonsLabel: c.textContent.includes('🔘 Boutons') };
    } catch (e) { results.roles = { error: e.message }; }

    // Suggestions : bouton supprimer
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.suggestions(c, gdata);
      await new Promise((r) => setTimeout(r, 300));
      results.suggestions = { delBtn: !!c.querySelector('[data-del]') };
    } catch (e) { results.suggestions = { error: e.message }; }

    // Journaux : filtres par type
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.logs(c, gdata);
      results.logs = { filters: c.querySelectorAll('[data-ev]').length };
    } catch (e) { results.logs = { error: e.message }; }

    // Boutique : historique
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.shop(c);
      await new Promise((r) => setTimeout(r, 300));
      results.shop = { history: c.textContent.includes('Historique des achats') && c.textContent.includes('VIP') };
    } catch (e) { results.shop = { error: e.message }; }

    // Réglages serveur : anniversaires + vocaux
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.server(c, gdata);
      await new Promise((r) => setTimeout(r, 300));
      results.server = {
        birthday: !!c.querySelector('#bd-channel') && !!c.querySelector('#bd-role'),
        voicetemp: !!c.querySelector('#vt-channel'),
      };
    } catch (e) { results.server = { error: e.message }; }

    // Réglages du bot : bouton sauvegarder maintenant
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.botsettings(c);
      await new Promise((r) => setTimeout(r, 300));
      results.botsettings = { saveNow: c.textContent.includes('Sauvegarder maintenant'), last: c.textContent.includes('Dernière sauvegarde') };
    } catch (e) { results.botsettings = { error: e.message }; }

    return results;
  })();
  `;

  w.eval(code + '\n;\n' + snippet);

  await new Promise((resolve) => setTimeout(resolve, 4500));
  const results = await w.__results;
  console.log(JSON.stringify(results, null, 2));

  const ok = results.members && !results.members.error && results.members.rows === 2 && results.members.hasCoins && results.members.hasRole && results.members.hasKick && results.members.showsCoins
    && results.stats && !results.stats.error && results.stats.cards === 3 && results.stats.bars >= 4 && results.stats.topActive && results.stats.messages
    && results.announcements && !results.announcements.error && results.announcements.list && results.announcements.days === 7 && results.announcements.channelSelect && results.announcements.textArea
    && results.tickets && !results.tickets.error && results.tickets.statsStrip && results.tickets.total
    && results.roles && results.roles.buttonsLabel
    && results.suggestions && results.suggestions.delBtn
    && results.logs && results.logs.filters === 5
    && results.shop && results.shop.history
    && results.server && results.server.birthday && results.server.voicetemp
    && results.botsettings && results.botsettings.saveNow && results.botsettings.last;

  store.db.close();
  console.log(ok && failures === 0 ? '\n✅ HOXERA 2.0 (v33) — TOUT EST FONCTIONNEL 🎉' : '\n❌ Des vérifications ont échoué');
  process.exit(ok && failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
