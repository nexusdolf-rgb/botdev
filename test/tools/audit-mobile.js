// ============================================================
// Audit mobile réel : charge le VRAI dashboard (CSS + JS) dans
// Chromium à 360 px de large, rend chaque onglet avec des données
// simulées, et mesure ce qui déborde réellement.
//
// Pourquoi piloter les rendeurs directement plutôt que le routeur :
// l'accès aux onglets passe par OAuth Discord + un bot en ligne,
// impossibles à réunir ici. On garde en revanche le vrai CSS et le
// vrai code de rendu, donc la mesure est fidèle.
// ============================================================
'use strict';
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:3000';
const LARGEUR = Number(process.argv[2] || 360);

// Les drapeaux (--textes) ne sont pas des noms de module : sans ce filtre,
// « node audit-mobile.js 360 --textes » cherchait un rendeur nommé --textes.
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const MODULES = ARGS[1]
  ? ARGS[1].split(',')
  : ['overview', 'tickets', 'welcome', 'levels', 'economy', 'shop', 'moderation', 'antinuke',
    'roles', 'suggestions', 'giveaways', 'events', 'quiz', 'community', 'announcements',
    'embeds', 'members', 'stats', 'logs', 'transcripts', 'modmail', 'server', 'botprofile',
    'commands', 'modules', 'health', 'botsettings', 'help'];

// ---------- Données simulées réalistes ----------
const canaux = [];
['général', 'annonces', 'règles', 'bienvenue', 'staff', 'logs', 'tickets', 'partenariats'].forEach((n, i) => {
  canaux.push({ id: 'C' + i, name: n, category: false, voice: false });
});
['Général', 'Administration', 'Tickets'].forEach((n, i) => canaux.push({ id: 'CAT' + i, name: n, category: true, voice: false }));
['Salon vocal 1', 'Salon vocal 2'].forEach((n, i) => canaux.push({ id: 'V' + i, name: n, category: false, voice: true }));

const roles = [
  { id: 'R1', name: 'Administrateur', color: '#ed4245', position: 10, managed: false },
  { id: 'R2', name: 'Modérateur', color: '#fee75c', position: 8, managed: false },
  { id: 'R3', name: 'Membre', color: '#3ba55d', position: 3, managed: false },
  { id: 'R4', name: 'Niveau 10', color: '#5865f2', position: 2, managed: false },
];

const membres = Array.from({ length: 12 }, (_, i) => ({
  id: 'U' + i, username: 'membre_' + i, discriminator: '0001', bot: false,
  avatar: '', roles: i % 3 === 0 ? ['R3'] : [], joinedAt: Date.now() - i * 86400000,
  nick: '', premiumSince: i === 0 ? Date.now() : null,
}));

const settings = {
  prefix: '!', warn_limit: 2, warn_action: 'timeout', warn_timeout_min: 60,
  warn_timeout_limit: 1,
  xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_message: '', xp_channel: 'C0',
  am_enabled: 1, am_phishing: 1, am_phishing_allow: '', am_links: 1, am_caps: 1,
  am_mentions: 5, am_spam: 5, am_mode: 'enforce', am_ignore_staff: 1,
  am_rule_actions: '{}', am_blacklist_rules: '{}', am_blacklist_thresholds: '{}',
  am_blacklist_duration_min: 0, am_blacklist_channel: '', am_timeout_min: 5,
  am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10, am_warn_text: '',
  am_native_enabled: 1, am_native_alert_channel: '',
  am_exempt_roles: '[]', am_exempt_channels: '[]', am_exempt_users: '[]',
  am_escalation: '{"rules":{}}',
  log_channel: 'C5', log_events: '',
  birthday_channel: 'C0', birthday_role: '',
  giveaway_default_duration: 24,
  quiz_points: 10, quiz_bonus: 5, quiz_bonus_window: 8, quiz_channel: 'C0',
  starboard_channel: 'C1', starboard_min: 3, starboard_emoji: '⭐',
  suggestion_channel: 'C1', suggestion_color: '#5865f2', suggestion_ping_role: '',
  suggestion_downvotes: 0, suggestion_approve_channel: '',
  welcome_channel: 'C3', welcome_message: '', welcome_role: '',
  close_dm_message: '', close_dm_image: '',
};

const guildData = {
  guild: {
    id: 'G1', name: 'Serveur de test Hoxera', icon: '', banner: '',
    members: 1284, boosts: 7, channelsCount: canaux.length, rolesCount: roles.length,
    createdAt: Date.now() - 400 * 86400000, description: '',
  },
  channels: canaux,
  roles,
  members: membres,
  settings,
  tickets: { name: '', channel: '', message: '', button_label: '🎫 Ouvrir un ticket', button_style: '1', require_reason: 1, support_role: '', category: 'CAT2', types: [] },
  tickets_stats: { open: 3, total: 42, today: 1 },
  events: { defs: [], state: {} },
  role_menus: [],
  xp_roles: [],
  profile: { name: '', avatar_url: '', banner_url: '', bio: '', color: '#e07a5f' },
  profiles_extra: [],
  profile_active: '',
  blacklist: [],
  automod_blacklist: [],
  voicetemp: { creator_channel: '', category: '', name_template: '' },
  applications: { channel: '', questions: '[]', title: '📝 Candidature', enabled: 0 },
  scheduled: [],
  shop_items: [],
  log_events: [],
  checklist: { items: [], done: 0, total: 0 },
  lockdown: { locked: false, channels: [] },
};

const antinukeState = {
  config: {
    enabled: true, action: 'quarantine', threshold: 3, window: 60, alertChannel: '',
    whitelist: [], punishBots: false,
    limits: {
      channel_delete: { count: 2, window: 10 }, channel_create: { count: 3, window: 10 },
      role_delete: { count: 2, window: 10 }, role_create: { count: 3, window: 10 },
      role_update: { count: 1, window: 10 }, overwrite: { count: 4, window: 10 },
      ban: { count: 3, window: 60 }, kick: { count: 3, window: 60 },
      webhook: { count: 2, window: 10 }, emoji: { count: 2, window: 10 }, bot_add: { count: 1, window: 10 },
    },
    actions: { bot_add: 'ban' },
  },
  audit: { ok: true },
  recent: [],
  totalActions: 0,
};

const botHealth = {
  processUptimeMs: 100000, tokenConfigured: true, oauthConfigured: true, botCount: 1,
  bootRestore: 'ok', backupEnabled: true, lastBackup: new Date().toISOString(),
  db: { fileSizeBytes: 700000, fileSizeKo: 680, tables: { users: 6, bots: 1 } },
  memory: { heapUsedMb: 27, heapTotalMb: 29, rssMb: 105 },
  resources: { state: 'normal', limitMb: 512, rssMb: 105, heapUsedMb: 27, heapTotalMb: 29, ratio: 0.2 },
  cache: { caches: 6, entries: 0, pending: 0 },
  errors24h: { count: 0, last: [] },
  platform: { onlineBots: 1, servers: 8, members: 190 },
  queue: { processed: 12, failed: 0, refused: 0, waiting: 1, active: 0 },
  resilience: { state: 'ok', failuresInWindow: 0, since: Date.now(), thresholds: { fail: 8, critical: 20 } },
  bots: [{ id: 1, name: 'Optimus Prime', enabled: true, last_error: '', username: 'Optimus Prime#2512' }],
  clients: [{ id: 1, ready: true, startedAt: Date.now(), ageMs: 1000 }],
};

// Réponses simulées, par motif d'URL.
function repondre(url) {
  if (url.includes('/antinuke/state')) return antinukeState;
  if (url.includes('/health')) return botHealth;
  if (url.includes('/shop')) return { items: [] };
  if (/\/guilds\/[^/]+$/.test(url)) return guildData;
  return {};
}

(async () => {
  const browser = await chromium.launch();
  // --tactile : émule un écran tactile (hasTouch + isMobile), ce qui active
  // dans Chromium les media queries (hover: none) and (pointer: coarse).
  // Indispensable pour vérifier les planchers tactiles : sans ça, un iPad en
  // mode paysage passait pour un poste à souris.
  const TACTILE = process.argv.includes('--tactile');
  const page = await browser.newPage({
    viewport: { width: LARGEUR, height: 780 },
    deviceScaleFactor: 1,
    hasTouch: TACTILE,
    isMobile: TACTILE,
  });

  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 160)));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
  const SANS_REPLI = process.argv.includes('--sans-repli');
  const argSeuil = (process.argv.find((a) => a.startsWith('--seuil=')) || '').split('=')[1];
  const argClasses = (process.argv.find((a) => a.startsWith('--classes=')) || '').split('=')[1];
  // Le comportement PRODUIT est désormais « première carte ouverte, sauf si
  // elle dépasse 1 500 px ». Ces deux drapeaux servent à mesurer les extrêmes.
  const TOUT_PLIER = process.argv.includes('--tout-plier');
  const TOUT_OUVERT = process.argv.includes('--tout-ouvert');
  await page.evaluate(([sr, se, cl, tp, to]) => {
    window.__sansRepli = sr;
    if (se) Dashboard.PLIABLE_SEUIL = Number(se);
    if (cl) Dashboard.PLIABLE_CLASSES = cl.split(',').map((x) => '.' + x.trim());
    window.__toutPlier = tp;
    window.__toutOuvert = to;
  }, [SANS_REPLI, argSeuil, argClasses, TOUT_PLIER, TOUT_OUVERT]);

  // Le shell d'authentification n'est pas atteint : on construit nous-mêmes la
  // zone de rendu, avec le vrai CSS déjà chargé par la page.
  await page.evaluate(() => {
    document.body.innerHTML = '<div class="dashboard-shell-host"><div class="dash-content" id="audit"></div></div>';
  });

  await page.evaluate(([guild, sante, antiNuke]) => {
    // App.api simulé : renvoie les données selon l'URL demandée.
    window.__guild = null;
    App.api = async (url) => {
      if (url.includes('/antinuke/state')) return antiNuke;
      if (url.includes('/antinuke')) return { ok: true };
      if (url.includes('/health')) return sante;
      // Sous-endpoints appelés en parallèle par plusieurs rendeurs. Chacun a sa
      // forme propre : un « {} » par défaut casse ceux qui déstructurent.
      if (url.includes('/sanctions')) return { sanctions: [{ name: 'Spam', action: 'timeout', duration: 10, message: 'Pas de pub.' }, { name: 'Insultes', action: 'warn', duration: 0, message: '' }] };
      if (url.includes('/members')) return { members: guild.members || [] };
      if (url.includes('/invites')) return { invites: [] };
      if (url.includes('/economy/leaderboard')) return { top: [{ user_id: 'U1', username: 'membre_1', coins: 1240, rank: 1 }, { user_id: 'U2', username: 'membre_2', coins: 880, rank: 2 }], me: null };
      if (url.includes('/shop')) return { items: [{ id: 1, name: 'Rôle VIP', description: 'Accès au salon privé', price: 500, role: 'R4', emoji: '💎' }] };
      if (url.includes('/quiz/top')) return { top: [{ user_id: 'U1', username: 'membre_1', score: 42 }] };
      if (url.includes('/quiz/sets')) return { sets: [] };
      if (url.includes('/temproles')) return { roles: [{ member_id: 'U1', username: 'membre_1', role_id: 'R4', role_name: 'Niveau 10', expires_at: Date.now() + 3600000 }] };
      // Le renderer stats lit s.top_active.length : sans ce champ il levait
      // « reading 'length' ». Défaut du banc de test, pas du produit.
      if (url.includes('/stats')) return { activity: Array.from({ length: 7 }, (_, i) => ({ day: '2026-09-0' + (i + 1), messages: 40 + i * 13, joins: i, leaves: 0 })), joins: Array.from({ length: 7 }, (_, i) => ({ day: '2026-09-0' + (i + 1), members: i % 4 })), totals: { messages: 412, joins: 12, leaves: 3, active: 34 }, top_active: [{ tag: 'alice', avatar: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', messages: 320 }, { tag: 'bob', avatar: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', messages: 180 }] };
      if (url.includes('/commands')) return { commands: [{ id: 1, name: 'regles', response: 'Lis le salon #règles.', role: '' }] };
      if (url.includes('/modules')) return { modules: [{ id: 'tickets', enabled: true }, { id: 'welcome', enabled: true }, { id: 'levels', enabled: false }] };
      if (url.includes('/birthdays')) return { birthdays: [] };
      if (url.includes('/warnings')) return { warnings: [] };
      if (url.includes('/lives')) return { lives: [] };
      if (url.includes('/transcripts')) return { transcripts: [] };
      if (url.includes('/modmail')) return { threads: [] };
      if (url.includes('/logs')) return { logs: [] };
      if (url.includes('/giveaways')) return { giveaways: [] };
      if (url.includes('/suggestions')) return { suggestions: [] };
      if (url.includes('/announcements')) return { announcements: [] };
      if (url.includes('/events')) return { events: [] };
      if (url.includes('/quiz')) return { quiz: [] };
      if (/\/guilds\/[^/]+$/.test(url)) return guild;
      return {};
    };
    App.toast = () => {};
    Dashboard.state = { bot: { id: 1, name: 'Optimus Prime', online: true }, guildId: 'G1', module: 'overview', moduleHistory: [], discordGuilds: [] };
    __guild = guild;
  }, [guildData, botHealth, antinukeState]);

  const resultats = [];
  for (const mod of MODULES) {
    erreurs.length = 0;
    const r = await page.evaluate(async (m) => {
      const c = document.querySelector('#audit');
      c.innerHTML = '';
      Dashboard.state.module = m;
      if (window.__toutOuvert || window.__toutPlier) {
        Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
        sessionStorage.removeItem('hoxera-cartes-pliees');
      }
      let erreur = '';
      try {
        await Dashboard.renderers[m](c, window.__guild || null);
        // ⚠️ Fidélité au pipeline RÉEL. Dashboard.renderContent ne se contente
        // pas d'appeler le rendeur : il enchaîne sur layoutSettingRows puis
        // plierTextesLongs. Sans ces deux appels le banc mesurait une page que
        // personne ne voit. --sans-repli permet de mesurer l'avant/après v245.
        Dashboard.layoutSettingRows(c);
        if (!window.__sansRepli) Dashboard.plierTextesLongs(c, Dashboard.PLIABLE_SEUIL);
        Dashboard.rendreCartesPliables(c);
        // Mesure des deux extrêmes, pour situer le comportement produit.
        if (window.__toutOuvert || window.__toutPlier) {
          const ouvert = !!window.__toutOuvert;
          c.querySelectorAll('.dash-card[data-carte-pliable="oui"]').forEach((carte) => {
            carte.classList.toggle('is-folded', !ouvert);
            const b = carte.querySelector('.card-fold');
            if (b) b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
          });
        }
      } catch (e) {
        // La pile est indispensable : sans elle on ne sait pas quel champ
        // manque dans les données simulées.
        erreur = String(e && e.message || e).slice(0, 60) + ' @ ' +
          String((e && e.stack || '').split('\n').find((l) => /dashboard\.js/.test(l)) || '').replace(/^\s*at\s*/, '').slice(0, 130);
      }
      await new Promise((res) => setTimeout(res, 260));

      // ⚠️ Ne mesurer QUE ce qui est réellement visible. Sans ce filtre, le
      // banc remontait .ov-stat-note à 9,5 px alors qu'il est déjà masqué sous
      // 520 px — un faux positif qui aurait fait « corriger » du code mort.
      const visible = (el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      };
      const largeurDoc = document.documentElement.scrollWidth;
      const conteneur = c.getBoundingClientRect();
      // Éléments qui dépassent réellement du conteneur.
      const debordements = [];
      c.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) return;
        if (!visible(el)) return;
        // Un ancêtre scrollable assume volontairement le débordement (tableaux).
        let p = el.parentElement, scrollable = false;
        while (p && p !== c) {
          const ps = getComputedStyle(p);
          if (/auto|scroll/.test(ps.overflowX)) { scrollable = true; break; }
          p = p.parentElement;
        }
        if (scrollable) return;
        if (b.right > conteneur.right + 1.5) {
          debordements.push({
            sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
            droite: Math.round(b.right - conteneur.right),
            texte: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 52),
          });
        }
      });
      // Volume de texte réellement affiché.
      const texte = (c.textContent || '').replace(/\s+/g, ' ').trim().length;
      const blocs = c.querySelectorAll('.desc').length;

      // Hauteur de la page : c'est LA mesure du « trop de texte » sur mobile.
      // Un onglet qui fait 15 écrans de scroll est illisible au téléphone.
      const hauteur = Math.round(c.getBoundingClientRect().height);
      const ecrans = Math.round((hauteur / window.innerHeight) * 10) / 10;

      // Polices trop petites pour être lues confortablement au téléphone.
      const minuscules = [];
      c.querySelectorAll('*').forEach((el) => {
        if (el.children.length || !visible(el)) return;
        if ((el.textContent || '').trim().length > 12) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < 12) minuscules.push({ fs: Math.round(fs * 100) / 100, t: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) });
        }
      });

      // Cibles tactiles : Apple et Google recommandent 44 px minimum.
      const tactiles = [];
      c.querySelectorAll('button, [role="button"], .dash-iconbtn, .dash-btn').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || !visible(el)) return;
        if (b.height < 40) tactiles.push({ h: Math.round(b.height), t: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26) });
      });

      // Textes tronqués par ellipsis alors qu'ils sont importants.
      const listeTronques = [];
      c.querySelectorAll('*').forEach((el) => {
        if (visible(el) && el.scrollWidth > el.clientWidth + 2 && /ellipsis/.test(getComputedStyle(el).textOverflow)) {
          listeTronques.push({
            sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
            perdu: el.scrollWidth - el.clientWidth,
            t: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44),
          });
        }
      });
      const tronques = listeTronques.length;

      // v245 — Pavés d'explication. On ne retient que du TEXTE en prose :
      // une phrase courte n'est pas un pavé, et le contenu d'un champ de
      // saisie (textarea, input) n'a pas à être replié.
      const paves = [];
      c.querySelectorAll('*').forEach((el) => {
        if (el.children.length || !visible(el)) return;
        if (el.closest('textarea, input, select, code, pre')) return;
        const tag = el.tagName.toLowerCase();
        if (tag === 'option' || tag === 'title') return;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length < 70) return;
        let cls = '';
        let a = el;
        for (let k = 0; k < 4 && a; k++) {
          if (a.className && typeof a.className === 'string' && a.className.trim()) { cls = a.className.trim().split(/\s+/)[0]; break; }
          a = a.parentElement;
        }
        paves.push({ t, cls: cls || tag, h: Math.round(el.getBoundingClientRect().height) });
      });

      // v245 — efficacité du repli : combien de blocs ont été pliés, et
      // combien de blocs d'explication restent visibles malgré tout.
      const plies = c.querySelectorAll('details.dash-details').length;
      const candidats = [...c.querySelectorAll(Dashboard.PLIABLE_CLASSES.join(','))].filter((el) => {
        if (el.closest('details')) return false;
        if (Dashboard.PLIABLE_EXCLUS && el.closest(Dashboard.PLIABLE_EXCLUS)) return false;
        if (el.querySelector('input, select, textarea, button')) return false;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return t.length >= Dashboard.PLIABLE_SEUIL && !Dashboard.PLIABLE_ALERTE.test(t);
      }).length;

      // Répartition de la hauteur par nature d'élément : permet de savoir si
      // ce sont les textes d'explication ou les CONTRÔLES qui allongent la page.
      const repartition = { cartes: 0, controles: 0, textes: 0, tableaux: 0, autre: 0 };
      c.querySelectorAll(':scope > * , .dash-card').forEach(() => {});
      const deja = new Set();
      const ajoute = (el, cle) => {
        if (deja.has(el)) return;
        deja.add(el);
        repartition[cle] += el.getBoundingClientRect().height;
      };
      c.querySelectorAll('input, select, textarea, .switch, .dd-host, button, .discord-multi-host').forEach((el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || el.getBoundingClientRect().height === 0) return;
        ajoute(el, 'controles');
      });
      c.querySelectorAll('table, .dash-table').forEach((el) => ajoute(el, 'tableaux'));
      c.querySelectorAll(Dashboard.PLIABLE_CLASSES.join(',')).forEach((el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none') return;
        ajoute(el, 'textes');
      });
      const total = c.getBoundingClientRect().height;
      repartition.autre = Math.max(0, Math.round(total - repartition.controles - repartition.tableaux - repartition.textes));
      ['cartes', 'controles', 'tableaux', 'textes', 'autre'].forEach((k) => repartition[k] = Math.round(repartition[k]));

      // Cartes : c'est le vrai levier de hauteur (50 % de la page est du
      // « chrome » : cartes, titres, espacements). On mesure leur répartition
      // pour savoir ce que rapporterait un repli par SECTION.
      const cartes = [...c.querySelectorAll('.dash-card')].map((el) => {
        const b = el.getBoundingClientRect();
        const t = el.querySelector('.card-head, .dash-card-title, h2, h3, b');
        return { h: Math.round(b.height), titre: t ? (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '(sans titre)' };
      }).filter((x) => x.h > 0);
      const nbCartes = cartes.length;
      const hCartes = cartes.reduce((a, x) => a + x.h, 0);
      // Combien sont réellement devenues pliables, et quelle part de hauteur
      // représente la PREMIÈRE (celle qui reste ouverte dans la variante
      // « première carte ouverte »). Un module à 0 % de gain s'explique ici :
      // soit aucune carte pliable, soit la première carte fait presque tout.
      const pliables = [...c.querySelectorAll('.dash-card[data-carte-pliable="oui"]')];
      const nbPliables = pliables.length;
      const hPliables = pliables.reduce((a, el) => a + Math.round(el.getBoundingClientRect().height), 0);
      const hPremiere = pliables.length ? Math.round(pliables[0].getBoundingClientRect().height) : 0;

      return { largeurDoc, erreur, plies, candidatsNonPlies: candidats, repartition, nbCartes, hCartes, cartes,
        nbPliables, hPliables, hPremiere, debordements: debordements.slice(0, 6), nbDebordements: debordements.length,
        texte, blocs, hauteur, ecrans, minuscules: minuscules.slice(0, 4), nbMinuscules: minuscules.length,
        tactiles: tactiles.slice(0, 4), nbTactiles: tactiles.length, tronques, listeTronques: listeTronques.slice(0, 10),
        paves };
    }, mod);

    resultats.push({ mod, ...r, erreurs: erreurs.slice(0, 2) });
  }

  // ---------- Mode --clic : vérifie le repli de bout en bout ----------
  if (process.argv.includes('--clic')) {
    const r = await page.evaluate(async () => {
      const c = document.querySelector('#audit');
      c.innerHTML = '';
      Dashboard.state.module = 'moderation';
      Object.keys(Dashboard.etatCartes).forEach((k) => delete Dashboard.etatCartes[k]);
      await Dashboard.renderers.moderation(c, window.__guild || null);
      await new Promise((x) => setTimeout(x, 300));
      Dashboard.layoutSettingRows(c);
      Dashboard.plierTextesLongs(c);
      Dashboard.rendreCartesPliables(c);
      const cartes = [...c.querySelectorAll('.dash-card[data-carte-pliable="oui"]')];
      if (!cartes.length) return { erreur: 'aucune carte rendue pliable' };
      const carte = cartes[0];
      const cle = Dashboard.cleCarte(carte);
      const h = () => Math.round(carte.getBoundingClientRect().height);
      const etapes = [];
      // Depuis la v245 la première carte n'est ouverte que si elle ne dépasse
      // pas 1 500 px. Ici elle en fait ~5 000 : elle démarre DONC pliée.
      etapes.push({ q: 'état initial (1re carte, 4 997 px)', v: h(), classe: carte.className, cle });
      carte.querySelector('.card-head').click();
      await new Promise((x) => setTimeout(x, 60));
      etapes.push({ q: 'après 1 clic sur le titre', v: h(), classe: carte.className });
      const mem = JSON.parse(sessionStorage.getItem(Dashboard.ETAT_CARTES_CLE) || '{}');
      etapes.push({ q: 'mémorisé dans sessionStorage', v: Object.keys(mem).length, contient: mem[cle] });
      carte.querySelector('.card-fold').click();
      await new Promise((x) => setTimeout(x, 60));
      etapes.push({ q: 'après clic sur le chevron', v: h(), classe: carte.className });
      etapes.push({ q: 'aria-expanded après 2e clic', v: carte.querySelector('.card-fold').getAttribute('aria-expanded') });
      // Un clic sur un contrôle à l'intérieur ne doit PAS replier.
      const controle = carte.querySelector('input, select, .switch');
      etapes.push({ q: 'contrôle trouvé dans la carte', v: !!controle });
      const nbTotal = c.querySelectorAll('.dash-card').length;
      const nbPliables = cartes.length;
      return { etapes, nbTotal, nbPliables, cle };
    });
    console.log('\n═══ TEST DE CLIC RÉEL (module moderation) ═══');
    if (r.erreur) console.log('  ❌ ' + r.erreur);
    else {
      console.log(`  cartes dans le module : ${r.nbTotal} · rendues pliables : ${r.nbPliables}`);
      console.log(`  clé de mémorisation   : « ${r.cle.slice(0, 58)} »`);
      r.etapes.forEach((e) => console.log('  · ' + e.q.padEnd(34) + JSON.stringify(e.v) + (e.classe ? '   [' + e.classe + ']' : '') + (e.contient !== undefined ? '   contient la clé : ' + e.contient : '')));
    }
    await browser.close();
    return;
  }

  // ---------- Rapport « textes » (préparation v245) ----------
  if (process.argv.includes('--textes')) {
    const tout = [];
    resultats.forEach((r) => (r.paves || []).forEach((b) => tout.push({ mod: r.mod, ...b })));
    const parMod = {};
    tout.forEach((b) => { (parMod[b.mod] = parMod[b.mod] || []).push(b); });
    const ordre = Object.entries(parMod)
      .sort((a, b) => b[1].reduce((s, x) => s + x.h, 0) - a[1].reduce((s, x) => s + x.h, 0));
    console.log(`\n═══ PAVÉS D'EXPLICATION — viewport ${LARGEUR} px ═══\n`);
    console.log('  MODULE            pavés  caractères  hauteur  écrans');
    console.log('  ' + '─'.repeat(56));
    let tp = 0, tc = 0, th = 0;
    for (const [m, bs] of ordre) {
      const c2 = bs.reduce((s, x) => s + x.t.length, 0), h = bs.reduce((s, x) => s + x.h, 0);
      tp += bs.length; tc += c2; th += h;
      console.log('  ' + m.padEnd(18) + String(bs.length).padStart(5) + String(c2).padStart(11)
        + (h + ' px').padStart(10) + (Math.round((h / 780) * 10) / 10).toFixed(1).padStart(7));
    }
    console.log('  ' + '─'.repeat(56));
    console.log('  TOTAL'.padEnd(19) + String(tp).padStart(5) + String(tc).padStart(11)
      + (th + ' px').padStart(10) + (Math.round((th / 780) * 10) / 10).toFixed(1).padStart(7));
    // Répartition par classe : sert à décider quoi EXCLURE du repli
    // (aperçus Discord, états vides, messages d'erreur…).
    const parClasse = {};
    tout.forEach((x) => { const k = x.cls; (parClasse[k] = parClasse[k] || []).push(x); });
    console.log('\n  ═══ répartition par classe ═══');
    Object.entries(parClasse).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => {
      console.log('  ' + String(v.length).padStart(4) + ' ×  .' + k.padEnd(24)
        + String(v.reduce((s2, x) => s2 + x.h, 0)).padStart(6) + ' px   ex. « '
        + v[0].t.slice(0, 46) + '… »');
    });

    console.log('\n  ═══ 25 pavés les plus hauts (candidats au repli) ═══');
    tout.sort((a, b) => b.h - a.h).slice(0, 25).forEach((b, i) => {
      console.log('  ' + String(i + 1).padStart(2) + '. ' + String(b.h).padStart(4) + ' px  '
        + b.mod.padEnd(13) + '.' + b.cls.padEnd(21)
        + '« ' + b.t.slice(0, 58) + (b.t.length > 58 ? '…' : '') + ' » (' + b.t.length + ' c)');
    });
    await browser.close();
    return;
  }

  // ---------- Rapport ----------
  console.log(`\n═══ AUDIT MOBILE — viewport ${LARGEUR} px${TACTILE ? ' · ÉMULATION TACTILE' : ' · souris'} ═══\n`);
  console.log('ONGLET'.padEnd(14), 'DÉBORD'.padStart(7), 'ÉCRANS'.padStart(7), 'TEXTE'.padStart(7), 'desc'.padStart(5), '<12px'.padStart(6), 'tactile'.padStart(8), 'tronq'.padStart(6), 'pliés'.padStart(6), 'restés'.padStart(7), '  ERREUR');
  console.log('-'.repeat(104));
  let totalDeb = 0, modulesCasses = 0, totalEcrans = 0, totalMin = 0, totalTac = 0, totalPlies = 0, totalRestes = 0;
  for (const r of resultats) {
    totalDeb += r.nbDebordements; totalEcrans += r.ecrans; totalMin += r.nbMinuscules; totalTac += r.nbTactiles;
    totalPlies += (r.plies || 0); totalRestes += (r.candidatsNonPlies || 0);
    if (r.erreur || r.erreurs.length) modulesCasses++;
    const drapeau = r.nbDebordements > 0 ? '🔴' : (r.ecrans > 12 ? '🟠' : '  ');
    console.log(drapeau + r.mod.padEnd(12), String(r.nbDebordements).padStart(7), String(r.ecrans).padStart(7),
      String(r.texte).padStart(7), String(r.blocs).padStart(5), String(r.nbMinuscules).padStart(6),
      String(r.nbTactiles).padStart(8), String(r.tronques).padStart(6),
      String(r.plies || 0).padStart(6), String(r.candidatsNonPlies || 0).padStart(7),
      '  ' + (r.erreur || r.erreurs[0] || '').slice(0, 46));
  }
  console.log('-'.repeat(104));
  console.log(`  débordements ${totalDeb} | hauteur cumulée ${Math.round(totalEcrans)} écrans | polices < 12 px ${totalMin} | cibles tactiles < 40 px ${totalTac} | modules en erreur ${modulesCasses}`);
  console.log(`  v245 repli : ${totalPlies} blocs pliés | ${totalRestes} candidat(s) encore déplié(s) — doit rester à 0`);
  if (process.argv.includes('--pliables')) {
    console.log('\n  ═══ cartes PLIABLES par module ═══');
    console.log('  MODULE              cartes  pliables  h. totale  h. 1re  reste à plier');
    resultats.forEach((r) => {
      if (!r.nbCartes) return;
      const reste = (r.hPliables || 0) - (r.hPremiere || 0);
      console.log('  ' + r.mod.padEnd(20) + String(r.nbCartes).padStart(5) + String(r.nbPliables).padStart(9)
        + (r.hPliables + ' px').padStart(11) + (r.hPremiere + ' px').padStart(9)
        + (reste + ' px').padStart(14) + (reste < 200 ? '   ← rien à gagner' : ''));
    });
  }

  if (process.argv.includes('--cartes')) {
    const toutes = [];
    resultats.forEach((r) => (r.cartes || []).forEach((c2) => toutes.push({ mod: r.mod, ...c2 })));
    console.log('\n  ═══ CARTES par module (le vrai levier de hauteur) ═══');
    console.log('  MODULE             cartes  hauteur   % du module');
    resultats.forEach((r) => {
      if (!r.nbCartes) return;
      console.log('  ' + r.mod.padEnd(19) + String(r.nbCartes).padStart(5) + (r.hCartes + ' px').padStart(10)
        + (Math.round((r.hCartes / Math.max(1, r.hauteur)) * 100) + ' %').padStart(11));
    });
    console.log('  ' + '─'.repeat(48));
    console.log('  TOTAL'.padEnd(20) + String(toutes.length).padStart(5)
      + (toutes.reduce((a, x) => a + x.h, 0) + ' px').padStart(10));
    console.log('\n  ═══ 20 cartes les plus hautes ═══');
    toutes.sort((a, b) => b.h - a.h).slice(0, 20).forEach((x, i) => {
      console.log('  ' + String(i + 1).padStart(2) + '. ' + String(x.h).padStart(5) + ' px  ' + x.mod.padEnd(14) + '« ' + x.titre + ' »');
    });
  }

  if (process.argv.includes('--repartition')) {
    console.log('\n  ═══ de quoi est faite la hauteur (360 px) ═══');
    console.log('  MODULE            contrôles  textes  tableaux   autre    total');
    const tot = { controles: 0, textes: 0, tableaux: 0, autre: 0 };
    resultats.forEach((r) => {
      const p = r.repartition || {};
      ['controles', 'textes', 'tableaux', 'autre'].forEach((k) => { tot[k] += (p[k] || 0); });
      const tt = (p.controles || 0) + (p.textes || 0) + (p.tableaux || 0) + (p.autre || 0);
      console.log('  ' + r.mod.padEnd(18) + String(p.controles || 0).padStart(9) + String(p.textes || 0).padStart(8)
        + String(p.tableaux || 0).padStart(9) + String(p.autre || 0).padStart(8) + (tt + ' px').padStart(9));
    });
    const gt = tot.controles + tot.textes + tot.tableaux + tot.autre;
    console.log('  ' + '─'.repeat(60));
    console.log('  TOTAL'.padEnd(19) + String(tot.controles).padStart(9) + String(tot.textes).padStart(8)
      + String(tot.tableaux).padStart(9) + String(tot.autre).padStart(8) + (gt + ' px').padStart(9));
    console.log('  en %'.padEnd(19) + (Math.round(tot.controles / gt * 100) + ' %').padStart(9)
      + (Math.round(tot.textes / gt * 100) + ' %').padStart(8) + (Math.round(tot.tableaux / gt * 100) + ' %').padStart(9)
      + (Math.round(tot.autre / gt * 100) + ' %').padStart(8));
  }

  console.log('\n═══ DÉTAIL DES DÉBORDEMENTS ═══');
  let aucuns = true;
  for (const r of resultats) {
    if (!r.debordements.length) continue;
    aucuns = false;
    console.log(`\n  ${r.mod} :`);
    for (const d of r.debordements) {
      console.log(`     +${String(d.droite).padStart(4)} px  ${d.sel.slice(0, 44).padEnd(46)} « ${d.texte} »`);
    }
  }
  if (aucuns) console.log('  ✅ aucun débordement horizontal');

  console.log('\n═══ TEXTES TRONQUÉS PAR ELLIPSIS (contenu perdu) ═══');
  let vuTr = 0;
  for (const r of resultats) {
    if (!r.listeTronques || !r.listeTronques.length) continue;
    vuTr++;
    console.log(`  ${r.mod} (${r.tronques}) :`);
    r.listeTronques.forEach((x) => console.log(`     −${String(x.perdu).padStart(4)} px  ${x.sel.slice(0, 32).padEnd(34)} « ${x.t} »`));
  }
  if (!vuTr) console.log('  ✅ aucun');

  console.log('\n═══ POLICES TROP PETITES (< 12 px sur un texte long) ═══');
  let vuMin = 0;
  for (const r of resultats) {
    if (!r.minuscules.length) continue;
    vuMin++;
    console.log(`  ${r.mod} (${r.nbMinuscules}) :`);
    r.minuscules.forEach((m) => console.log(`     ${m.fs}px  « ${m.t} »`));
  }
  if (!vuMin) console.log('  ✅ aucune');

  console.log('\n═══ CIBLES TACTILES TROP PETITES (< 40 px de haut) ═══');
  const parHauteur = {};
  for (const r of resultats) r.tactiles.forEach((t) => { parHauteur[t.h] = (parHauteur[t.h] || 0) + 1; });
  if (Object.keys(parHauteur).length) {
    Object.entries(parHauteur).sort((a, b) => a[0] - b[0]).forEach(([h, c]) => console.log(`  ${h} px de haut : ${c} bouton(s)`));
    const ex = resultats.flatMap((r) => r.tactiles.map((t) => r.mod + ' → « ' + t.t + ' » (' + t.h + ' px)'));
    console.log('  exemples : ' + ex.slice(0, 8).join('\n             '));
  } else console.log('  ✅ aucune');

  console.log('\n═══ ONGLETS LES PLUS LONGS (en écrans de scroll mobile) ═══');
  resultats.slice().sort((a, b) => b.ecrans - a.ecrans).slice(0, 10)
    .forEach((r) => console.log('  ' + String(r.ecrans).padStart(6) + ' écrans  ' + r.mod.padEnd(15) + String(r.texte).padStart(7) + ' caractères'));

  await browser.close();
})().catch((e) => { console.error('💥', e); process.exit(1); });
