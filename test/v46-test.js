// ============================================================
// Test Hoxera v46 — Dashboard « confort » (chantier 3)
//  1. Checklist de configuration (calcul + pourcentage)
//  2. Anti-raid partagé (lockdown on/off/état) — bot + dashboard
//  3. Dashboard : checklist, stats en bref, aperçu d'embed bienvenue,
//     carte anti-raid — tout se rend sans erreur
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v46-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const routes = require('../server/routes');
  const lockdown = require('../server/discord/lockdown');
  const BOT = 1, G = 'G1';

  // ---------- 1. Checklist ----------
  const basePayload = {
    settings: { xp_enabled: 1, am_enabled: 0, log_channel: '', suggestion_channel: '', birthday_channel: '' },
    tickets: { channel: '' },
    events: { state: { member_join: { enabled: false }, autorole: { enabled: false } } },
    shop_items: [], scheduled: [],
    voicetemp: { creator_channel: '' }, profile: {},
  };
  const empty = routes.guildChecklist(basePayload);
  check('checklist : 12 éléments', empty.length === 12);
  check('checklist : serveur vierge → presque tout à faire', empty.filter((i) => !i.done).length >= 10);
  check('checklist : les niveaux comptent comme faits (activés par défaut)', empty.find((i) => i.key === 'levels').done === true);

  const full = routes.guildChecklist({
    settings: { xp_enabled: 1, am_enabled: 1, log_channel: '#logs', suggestion_channel: '#suggestions', birthday_channel: 'C1' },
    tickets: { channel: '#support' },
    events: { state: { member_join: { enabled: true }, autorole: { enabled: true } } },
    shop_items: [{ name: 'VIP' }], scheduled: [{ id: 1 }],
    voicetemp: { creator_channel: 'V1' }, profile: { name: 'Hoxera' },
  });
  check('checklist : serveur configuré → 100 %', full.every((i) => i.done) === true);

  // ---------- 2. Anti-raid partagé ----------
  const channels = new Map();
  const mkCh = (id, name, type) => {
    const c = {
      id, name, type,
      isTextBased: () => type === 0,
      permissionOverwrites: { edit: async () => ({}), delete: async () => ({}) },
      permissionsFor: () => ({ has: () => true, ViewChannel: true, SendMessages: true }),
    };
    channels.set(id, c);
    return c;
  };
  mkCh('C1', 'general', 0); mkCh('C2', 'annonces', 0); mkCh('V1', 'Vocal', 2);
  const guild = {
    id: G, name: 'S',
    channels: { cache: { get: (k) => channels.get(k), values: () => channels.values() } },
    roles: { everyone: { id: G } },
  };

  let s = lockdown.state(BOT, guild);
  check('lockdown : état initial ouvert', s.locked === false);
  const r1 = await lockdown.on(BOT, guild, 'Test');
  check('lockdown : verrouillage → 2 salons texte', r1.channels === 2);
  s = lockdown.state(BOT, guild);
  check('lockdown : état verrouillé', s.locked === true && s.channels.length === 2);
  check('lockdown : noms des salons dans l\'état', s.channels.some((c) => c.name === 'general'));
  const r2 = await lockdown.on(BOT, guild, 'Test');
  check('lockdown : double verrouillage impossible', r2.already === true);
  const r3 = await lockdown.off(BOT, guild, 'Test');
  check('lockdown : réouverture → 2 salons rouverts', r3.reopened === 2);
  s = lockdown.state(BOT, guild);
  check('lockdown : état rouvert', s.locked === false);

  // ---------- 3. Dashboard (jsdom) ----------
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="toasts"></div><div id="modal-root"></div></body></html>', { url: 'http://localhost:3000/#/dashboard', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  global.window = w; global.document = w.document; global.navigator = w.navigator; global.location = w.location;
  w.fetch = async (url) => {
    const p = String(url).split('?')[0];
    const resp = (body) => ({ ok: true, status: 200, json: async () => body });
    if (p.endsWith('/guilds/G1/stats')) return resp({ activity: [{ day: '2026-08-11', messages: 5 }, { day: '2026-08-17', messages: 15 }], joins: [{ day: '2026-08-17', members: 2 }], top_active: [{ user_id: 'u1', messages: 15, tag: 'Alice#0001', avatar: '' }] });
    if (p.endsWith('/guilds/G1/temproles')) return resp({ roles: [] });
    if (p.endsWith('/guilds/G1')) {
      const payload = {
        guild: { id: 'G1', name: 'Serveur Test', members: 18 },
        channels: [{ id: 'C1', name: 'bienvenue' }, { id: 'C2', name: 'support' }],
        roles: [{ id: 'R1', name: 'Membre' }],
        settings: { prefix: '', warn_limit: 0, warn_action: 'none', xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: '', am_enabled: 0, am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5, log_channel: '', suggestion_channel: '', birthday_channel: '', birthday_role: '' },
        tickets: { name: 'Support', channel: '#support', message: '', button_label: '🎫 Ouvrir un ticket', button_style: '1', require_reason: 1, support_role: '', category: 'Tickets', types: [] },
        tickets_stats: { total: 3, open: 1 },
        events: {
          defs: {
            member_join: { emoji: '👋', label: 'Bienvenue', description: 'x', config: [
              { key: 'channel', label: 'Salon', type: 'channel' },
              { key: 'message', label: 'Message', type: 'multiline', default: 'Bienvenue {user} !' },
              { key: 'embed', label: 'Embed', type: 'checkbox' },
              { key: 'color', label: 'Couleur', type: 'color', default: '#57F287' },
              { key: 'image', label: 'Image', type: 'text' },
            ] },
            autorole: { emoji: '🏷️', label: 'Auto-rôle', description: 'x', config: [{ key: 'role', label: 'Rôle', type: 'role' }] },
          },
          state: { member_join: { enabled: true, config: { channel: '#bienvenue' } }, autorole: { enabled: false, config: {} } },
        },
        role_menus: [], xp_roles: [], profile: {}, blacklist: [],
        voicetemp: { creator_channel: '', category: '', name_template: '' },
        applications: { channel: '', questions: '[]', title: '', enabled: 0 },
        scheduled: [], shop_items: [], log_events: {},
        lockdown: { locked: false, channels: [] },
      };
      payload.checklist = routes.guildChecklist(payload);
      return resp(payload);
    }
    return resp({ ok: true });
  };
  const code = ['app.js', 'editor.js', 'views.js', 'public.js', 'dashboard.js'].map((f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8')).join('\n;\n');
  w.eval(code + '\n;\n' + String.raw`
  window.__r = (async () => {
    Dashboard.state = { bot: { id: 1, name: 'Hoxera', prefix: '!' }, guildId: 'G1', module: 'overview' };
    const gdata = await App.api('/bots/1/guilds/G1');
    const out = {};

    // Vue d'ensemble : checklist + stats en bref
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.overview(c, gdata);
      await new Promise((r) => setTimeout(r, 400));
      out.overview = {
        checklist: c.querySelectorAll('.check-item').length,
        progress: c.textContent.includes('%'),
        brief: c.textContent.includes('Ton serveur en bref'),
        msgs: c.textContent.includes('20 messages'),
        top: c.textContent.includes('Alice'),
        jump: c.querySelector('.check-item') ? c.querySelector('.check-item').textContent.includes('Configurer') : false,
      };
    } catch (e) { out.overview = { error: e.message }; }

    // Bienvenue : aperçu d'embed en direct
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.welcome(c, gdata);
      out.welcome = {
        preview: !!c.querySelector('.embed-box'),
        previewText: c.querySelector('.embed-box') ? c.querySelector('.embed-box').textContent : '',
        colorPicker: !!c.querySelector('input[type=color][data-k="color"]'),
      };
    } catch (e) { out.welcome = { error: e.message }; }

    // Réglages serveur : carte anti-raid
    try {
      const c = document.createElement('div');
      await Dashboard.renderers.server(c, gdata);
      await new Promise((r) => setTimeout(r, 300));
      out.server = {
        lockdownCard: c.textContent.includes('Anti-raid'),
        lockBtn: !!c.querySelector('#ld-on'),
        unlockBtn: !!c.querySelector('#ld-off'),
        stateOk: c.textContent.includes('Serveur ouvert'),
      };
    } catch (e) { out.server = { error: e.message }; }

    return out;
  })();
  `);
  await new Promise((r) => setTimeout(r, 4000));
  const res = await w.__r;
  console.log(JSON.stringify(res, null, 2));

  const ok = res.overview && !res.overview.error && res.overview.checklist === 12 && res.overview.progress && res.overview.brief && res.overview.msgs && res.overview.top
    && res.welcome && !res.welcome.error && res.welcome.preview && res.welcome.previewText.includes('NouveauMembre') && res.welcome.colorPicker
    && res.server && !res.server.error && res.server.lockdownCard && res.server.lockBtn && res.server.unlockBtn && res.server.stateOk;

  store.db.close();
  console.log(ok && failures === 0 ? '\n✅ V46 — Dashboard confort : checklist + stats + aperçu d\'embed + anti-raid. 100 % fonctionnel. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(ok && failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
