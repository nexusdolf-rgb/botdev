// ============================================================
// Audit des INTERACTIONS mobile du tableau de bord — tiroir des modules,
// feuille du bas, sélecteurs (dd-*), champs de saisie.
//
// Pourquoi un second banc, à côté de test/tools/audit-mobile.js ? Ce dernier
// rend chaque module et mesure les débordements du CONTENU — il ne ouvre
// jamais un tiroir, jamais un menu déroulant, jamais une feuille. Or c'est
// exactement là que la v364 laissait trois bugs, trouvés en mesurant :
//
//   1. à 812 × 375 (téléphone à l'horizontale) et à 768 × 1024 (tablette), le
//      sélecteur restait un panneau flottant de 336 px pendant que toute la
//      page passait en mobile : 66 px d'options sous le bord de l'écran,
//      inatteignables (position fixed) ;
//   2. à ces mêmes largeurs, le champ de recherche du menu était à 13 px et le
//      déclencheur à 44 px — l'iOS zoomant sur tout champ sous 16 px, la page
//      se met à cheval sur la mise à l'échelle au premier tap ;
//   3. onze <select> des modules Antinucléaire et Modération étaient à 12-13 px
//      y compris sur téléphone.
//
// Le banc est un OUTIL de revue, pas une assertion : il lui faut un serveur
// local et Chromium. La CI ne peut pas le lancer ; les contrats qu'il a servis
// sont, eux, écrits noir sur blanc dans test/v366-test.js.
//
//   node test/tools/audit-mobile-interactions.js                → 360 × 780 tactile
//   node test/tools/audit-mobile-interactions.js 812 --tactile  → paysage
//   node test/tools/audit-mobile-interactions.js 1440          → souris
//   … --capture=dossier pour écrire une PNG par vue
//
// Les seuils affichés sont ceux que la maison s'est fixés elle-même :
//   • cible tactile ≥ 40 px (v244 : « Apple et Google recommandent 44 px ; on
//     monte à 40 px ») ;
//   • texte porteur de phrase ≥ 11 px (v244, plancher de lisibilité) ;
//   • champ de saisie à 16 px sur écran tactile (iOS) ;
//   • rien hors de l'écran.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3000';
const LARGEUR = Number((process.argv[2] || '').replace(/--.*/, '') || 360);
const HAUTEUR = Number(process.env.HOX_H || 780);
const TACTILE = !process.argv.includes('--souris');
const CAPTURE = (process.argv.find((a) => a.startsWith('--capture=')) || '').split('=')[1] || '';
if (CAPTURE) fs.mkdirSync(CAPTURE, { recursive: true });

// Des données simulées qui tiennent la route : les rendeurs attendent un
// guild complet, sinon ils sortent avant d'avoir posé le moindre champ.
const guild = {
  id: 'G1', name: 'Serveur de test', icon: '',
  channels: [
    { id: 'C0', name: 'général', category: false, voice: false },
    { id: 'C1', name: 'logs', category: false, voice: false },
    { id: 'C2', name: 'tickets', category: false, voice: false },
    { id: 'C3', name: 'annonces', category: false, voice: false },
  ],
  roles: [
    { id: 'R1', name: 'Administrateur', color: '#ed4245', position: 10, managed: false },
    { id: 'R2', name: 'Modérateur', color: '#fee75c', position: 8, managed: false },
    { id: 'R3', name: 'Membre', color: '#3ba55d', position: 2, managed: false },
  ],
  members: Array.from({ length: 6 }, (_, i) => ({
    id: 'U' + i, username: 'membre_' + i, discriminator: '0001', bot: false, roles: [], avatar: '', joinedAt: Date.now() - i * 86400000,
  })),
  settings: {
    prefix: '!', log_channel: 'C1',
    am_enabled: 1, am_mode: 'enforce', am_links: 1, am_caps: 1, am_mentions: 5, am_spam: 5,
    am_phishing: 1, am_ignore_staff: 1, am_warn_limit: 2, am_warn_action: 'timeout', am_warn_timeout_min: 10,
    am_timeout_min: 5, am_rule_actions: '{}', am_blacklist_rules: '{}', am_blacklist_thresholds: '{}',
    am_blacklist_duration_min: 0, am_blacklist_channel: '', am_native_enabled: 1, am_native_alert_channel: '',
    am_exempt_roles: '[]', am_exempt_channels: '[]', am_exempt_users: '[]', am_escalation: '{"rules":{}}',
    nk_enabled: 1, nk_channels: '[]', nk_roles: '[]',
    xp_enabled: 1, xp_min: 10, xp_max: 25, xp_cooldown: 60, xp_channel: 'C0', xp_message: '',
    eco_currency: 'Pistoles', eco_start: 100, sug_channel: 'C0', sug_max: 3,
    wel_msg: 'Salut {member} !', wel_channel: 'C0', wel_role_mode: 'add', wel_roles: '[]',
    ticket_channel: 'C2', ticket_support: '[]',
  },
};

const MODULES = ['overview', 'moderation', 'antinuke', 'welcome', 'levels', 'economy', 'roles', 'suggestions',
  'logs', 'members', 'stats', 'tickets', 'announcements', 'embeds', 'server', 'botprofile', 'help'];

const L = (v) => (v == null ? '—' : Math.round(v));

async function monte(page) {
  // Service worker neutralisé : sans ça, une activation en vol recharge la
  // page et détruit le contexte de mesure au milieu de l'évaluation.
  await page.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({});
    // L est utilisé par le code évalué dans la page : addInitScript est le seul
    // endroit où le définir (une fonction ne se sérialise pas dans evaluate).
    window.L = (v) => (v == null ? '—' : Math.round(v));
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    App.state.loaded = true;
    App.state.user = { discord_username: 'admin', is_admin: true };
    document.body.innerHTML = `
      <div id="modal-root"></div><div id="toasts"></div>
      <div class="dashboard-shell-host"><div class="dash-shell">
        <aside class="dash-side" id="dash-side"><div class="dash-side-item">Navigation</div></aside>
        <main class="dash-main">
          <div class="dash-topbar" id="dash-topbar"></div>
          <div id="dash-content"></div>
        </main>
        <nav class="dash-bnav" id="dash-bnav"></nav>
      </div></div>`;
  });
  await page.evaluate(([g]) => {
    App.api = async (u) => {
      if (u.includes('/members')) return { members: guild.members };
      if (u.includes('/roles')) return { roles: guild.roles };
      if (u.includes('/sanctions')) return { sanctions: [] };
      if (u.includes('/temproles')) return { roles: [] };
      if (u.includes('/warnings')) return { warnings: [] };
      if (u.includes('/invites')) return { invites: [] };
      if (u.includes('/modules')) return { modules: [] };
      if (u.includes('/health')) return { ok: true, uptimeMs: 1000, memoryMb: 100, clients: [{ id: 1, ready: true, startedAt: Date.now() }] };
      if (/\/guilds\/[^/]+$/.test(u)) return g;
      return {};
    };
    App.toast = () => {};
    window.__guild = g;
    Dashboard.state = {
      bot: { id: 1, name: 'Optimus Prime', online: true }, guildId: 'G1', module: 'overview',
      moduleHistory: [], discordGuilds: [{ id: 'G1', name: 'Serveur de test', icon: '', hasBot: true, canManage: true }],
    };
    Dashboard.renderTopbar(document.querySelector('#dash-topbar'), Dashboard.state.discordGuilds);
    Dashboard.renderBottomNav(document.querySelector('#dash-bnav'));
  }, [guild]);
}

// L'animation d'entrée (`mobileDrawerIn`, `sheetUp`) déplace l'élément de
// 12 px / 60 px sur sa première image : mesurer sans attendre, c'est lire une
// position qui n'existe jamais à l'œil.
const STABLE = 420;

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.log('⚠️  Chromium indisponible (' + String(e.message).slice(0, 90) + ').');
    console.log('   Ce banc est un outil de revue : la CI ne l’exécute pas.');
    console.log('   Pour le lancer : npx playwright install chromium');
    process.exit(2);
  }
  const ctx = await browser.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR },
    hasTouch: TACTILE,
    isMobile: TACTILE,
    userAgent: TACTILE
      ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
      : undefined,
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 120)));
  await monte(page);

  const vue = `viewport ${LARGEUR}×${HAUTEUR} · ${TACTILE ? 'écran tactile' : 'souris'}`;
  console.log('═══ AUDIT INTERACTIONS MOBILES ═══ ' + vue);

  // 1 — Tiroir « Serveurs et modules »
  const tiroir = await page.evaluate(async (stable) => {
    document.querySelector('#d-mobile-modules')?.click();
    await new Promise((r) => setTimeout(r, stable));
    const draw = document.querySelector('.dash-mobile-modules-drawer');
    if (!draw) return { indisponible: true };
    const rd = draw.getBoundingClientRect();
    const rows = [...document.querySelectorAll('.dash-mobile-module-item')];
    const rail = document.querySelector('.dash-mobile-server-item');
    const un = (sel) => {
      const el = document.querySelector(sel);
      if (!el || !el.offsetParent) return '—';
      const r = el.getBoundingClientRect();
      return Math.round(r.width) + '×' + Math.round(r.height) + ' px';
    };
    const liste = document.querySelector('.dash-mobile-module-list');
    const cs = (el) => (el ? getComputedStyle(el) : {});
    return {
      tiroirX: L(rd.x), tiroirLargeur: L(rd.width), rogne: L(Math.max(0, -rd.x)),
      horsBas: L(Math.max(0, rd.bottom - window.innerHeight)),
      lignes: rows.length,
      hauteurLigne: rows.length ? L(rows[0].getBoundingClientRect().height) : '—',
      tailleLibelle: rows.length ? cs(rows[0].querySelector('b')).fontSize : '—',
      pastille: rail ? L(rail.getBoundingClientRect().height) : '—',
      listeDepasse: liste ? liste.scrollHeight - Math.round(liste.getBoundingClientRect().height) : '—',
      paddingHautTiroir: cs(document.querySelector('.dash-mobile-drawer-head')).paddingTop,
    };
  }, STABLE);
  console.log('\n── Tiroir des modules');
  for (const [k, v] of Object.entries(tiroir)) console.log(`   ${k.padEnd(19)} ${v}`);
  if (CAPTURE) await page.screenshot({ path: path.join(CAPTURE, `tiroir-${LARGEUR}.png`) });

  // 1bis — Le menu général : le tiroir du compte. C'est la même famille de
  // règles que le tiroir des modules, et ses cibles n'avaient pas toutes suivi.
  const menu = await page.evaluate(async (stable) => {
    const q = (x) => document.querySelector(x);
    const haut = (el) => (el ? Math.round(el.getBoundingClientRect().height) : -1);
    (q('#d-mobile-modules-close') || q('.dash-mobile-close'))?.click();
    await new Promise((r) => setTimeout(r, 260));
    const bouton = q('.dash-mobile-navbtn');
    if (!bouton || !bouton.offsetParent) return { indisponible: true };
    bouton.click();
    await new Promise((r) => setTimeout(r, stable));
    const draw = q('.dash-mobile-site-drawer');
    if (!draw) return { indisponible: true };
    const r = draw.getBoundingClientRect();
    const liens = [...draw.querySelectorAll('.dash-mobile-site-links button')];
    return {
      largeur: L(r.width), rogne: L(Math.max(0, -r.x)), horsBas: L(Math.max(0, r.bottom - window.innerHeight)),
      fermeture: haut(draw.querySelector('.dash-mobile-close')) + 'px',
      lignesMenu: liens.length,
      hauteurLigne: (liens.length ? haut(liens[0]) : -1) + 'px',
      boutonCompte: haut(draw.querySelector('.dash-mobile-drawer-account button')) + 'px',
      avatarCompte: haut(draw.querySelector('.dash-mobile-account-avatar')) + 'px',
      paddingHautTete: getComputedStyle(draw.querySelector('.dash-mobile-drawer-head')).paddingTop,
    };
  }, STABLE);
  console.log('\n── Menu général (tiroir du compte)');
  for (const [k, v] of Object.entries(menu)) console.log(`   ${k.padEnd(19)} ${v}`);

  // 2 — Cliquer un module depuis le tiroir
  const clic = await page.evaluate(() => {
    const item = document.querySelector('.dash-mobile-module-item');
    if (!item) return {};
    item.click();
    return {
      tiroirFerme: !!document.querySelector('.dash-mobile-modules-drawer')?.hidden,
      scrollBloque: document.body.classList.contains('dash-mobile-drawer-open'),
      positionHaut: Math.round(window.scrollY),
      module: Dashboard.state.module,
    };
  });
  console.log('\n── Clic sur un module : ' + JSON.stringify(clic));

  // 3 — Sélecteurs : le panneau tient-il à l'écran, et à quelle taille ?
  const selecteurs = await page.evaluate(async (mods) => {
    const c = document.querySelector('#dash-content');
    const sortis = [];
    const tailles = {};
    let inspectes = 0, rendus = 0, textes = 0, horsCadre = 0;
    for (const m of mods) {
      c.innerHTML = '';
      Object.keys(Dashboard.etatCartes || {}).forEach((k) => { Dashboard.etatCartes[k] = true; });
      try {
        await Dashboard.renderers[m](c, window.__guild);
        Dashboard.layoutSettingRows(c);
        Dashboard.rendreCartesPliables(c);
      } catch { continue; }
      c.querySelectorAll('.dash-card.is-folded').forEach((x) => x.classList.remove('is-folded'));
      for (const t of [...c.querySelectorAll('.dd-trigger')].filter((x) => x.offsetParent !== null).slice(0, 2)) {
        t.click();
        await new Promise((r) => setTimeout(r, 240));
        const p = document.querySelector('.dd-panel[data-open="1"]');
        if (!p) { Dashboard.ddCloseAll(); continue; }
        const r = p.getBoundingClientRect();
        const inp = p.querySelector('.dd-search input');
        sortis.push({
          module: m,
          feuille: p.classList.contains('is-sheet'),
          hauteur: L(r.height),
          sousLeBord: L(Math.max(0, r.bottom - window.innerHeight)),
          horsDroite: L(Math.max(0, r.right - window.innerWidth)),
          declencheur: L(t.getBoundingClientRect().height) + 'px · ' + getComputedStyle(t).fontSize,
          recherche: inp ? getComputedStyle(inp).fontSize : '—',
        });
        Dashboard.ddCloseAll();
      }
      // Champs de saisie trop petits (iOS zoome sous 16 px).
      const petits = [];
      [...c.querySelectorAll('input, textarea, select')].filter((el) => el.offsetParent !== null).forEach((el) => {
        const type = String(el.type || el.tagName).toLowerCase();
        if (['checkbox', 'radio', 'color', 'range', 'submit', 'button', 'file', 'hidden'].includes(type)) return;
        if (parseFloat(getComputedStyle(el).fontSize) >= 16) return;
        petits.push(`${type}·${(el.className || el.id || '?').split(' ')[0]} ${getComputedStyle(el).fontSize}`);
      });
      if (petits.length) sortis.push({ module: m, champsSous16: [...new Set(petits)].slice(0, 4) });
      inspectes += c.querySelectorAll('input, textarea, select').length;
      rendus++;
      // Histogramme des tailles de texte : le compteur « < 12 px » du banc
      // melange les choix assumés (badges 8 px, étiquettes 10,5 px) et les
      // accidents. On compte donc taille par taille.
      for (const el of c.querySelectorAll('*')) {
        if (!el.offsetParent) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
        tailles[px] = (tailles[px] || 0) + 1;
        textes++;
        if (el.getBoundingClientRect().right > window.innerWidth + 1) horsCadre++;
      }
    }
    // Aucun module ne présente de sélecteur ouvert (les réglages fins sont
    // derriere un « voir plus ») : on pose le composant lui-meme, sinon le banc
    // afficherait un 0 qui ressemble a « tout va bien » au lieu de « rien vu ».
    if (!sortis.some((x) => x.feuille !== undefined)) {
      c.innerHTML = '';
      const host = document.createElement('div');
      host.className = 'setting-row';
      host.innerHTML = '<label>Salon des logs</label><div class="dd-host"><button type="button" class="dd-trigger" style="width:100%">'
        + '<span class="dd-value">Choisir…</span><span class="dd-caret">⌄</span></button></div>';
      c.appendChild(host);
      const trig = host.querySelector('.dd-trigger');
      Dashboard.dropdownMenu({
        trigger: trig, searchable: true,
        getOptions: () => Array.from({ length: 24 }, (_, i) => ({ value: 'C' + i, label: 'salon-numero-' + i })),
        onSelect: () => {},
      });
      trig.click();
      await new Promise((r) => setTimeout(r, 240));
      const p = document.querySelector('.dd-panel[data-open="1"]');
      if (p) {
        const r = p.getBoundingClientRect();
        const inp = p.querySelector('.dd-search input');
        sortis.push({
          module: '⚙ composant (banc)', feuille: p.classList.contains('is-sheet'),
          hauteur: L(r.height), sousLeBord: L(Math.max(0, r.bottom - window.innerHeight)),
          horsDroite: L(Math.max(0, r.right - window.innerWidth)),
          declencheur: L(trig.getBoundingClientRect().height) + 'px · ' + getComputedStyle(trig).fontSize,
          recherche: inp ? getComputedStyle(inp).fontSize : '—',
        });
        Dashboard.ddCloseAll();
      }
    }
    const petites = Object.keys(tailles).filter((k) => parseFloat(k) < 11).sort((x, y) => x - y)
      .map((k) => k + 'px:' + tailles[k]).join(' ') || 'aucune sous 11 px';
    return { sortis, rendus, inspectes, textes, horsCadre, petites };
  }, MODULES);
  const sel = selecteurs.sortis || [];
  console.log('\n── Sélecteurs et champs — ' + selecteurs.rendus + ' modules rendus, '
    + selecteurs.inspectes + ' champs inspectés, ' + sel.length + ' relevés');
  console.log('   textes ' + selecteurs.textes + ' · hors du cadre ' + selecteurs.horsCadre
    + ' · tailles sous 11 px : ' + selecteurs.petites);
  sel.forEach((s) => {
    if (s.champsSous16) console.log('   ' + s.module.padEnd(12) + ' ⚠️ sous 16 px : ' + s.champsSous16.join(', '));
    else console.log('   ' + s.module.padEnd(12) + ' feuille:' + (s.feuille ? 'oui' : 'NON ')
      + ' · haut ' + s.hauteur + 'px · sous le bord ' + s.sousLeBord
      + 'px · hors droite ' + s.horsDroite + 'px · déclencheur ' + s.declencheur + ' · recherche ' + s.recherche);
  });

  // 4 — La feuille du bas : elle doit finir AU bord, pas au-delà.
  const feuille = await page.evaluate(async (stable) => {
    Dashboard.openMoreSheet();
    await new Promise((r) => setTimeout(r, stable));
    const m = document.querySelector('.modal');
    if (!m) return { absente: true };
    const rm = m.getBoundingClientRect();
    const items = [...document.querySelectorAll('.sheet-item')];
    const cs = getComputedStyle(m);
    const res = {
      haut: L(rm.height), y: L(rm.y), auDelaDuBord: L(Math.max(0, rm.bottom - window.innerHeight)),
      maxHeight: cs.maxHeight, paddingBas: cs.paddingBottom, rayon: cs.borderRadius,
      hauteurLigne: items.length ? L(items[0].getBoundingClientRect().height) : '—',
      lignes: items.length,
      atteignable: items.length ? items[items.length - 1].getBoundingClientRect().bottom <= window.innerHeight + 1 : '—',
    };
    App.closeModal();
    return res;
  }, STABLE);
  console.log('\n── Feuille « Modules » du bas : ' + JSON.stringify(feuille));
  if (CAPTURE) {
    await page.evaluate(() => Dashboard.openMoreSheet());
    await page.waitForTimeout(STABLE);
    await page.screenshot({ path: path.join(CAPTURE, `feuille-${LARGEUR}.png`) });
  }

  // 5 — Fiche du module : ce que l'on voit juste après le clic
  const aide = await page.evaluate(async () => {
    const c = document.querySelector('#dash-content');
    c.innerHTML = '';
    Dashboard.state.module = 'moderation';
    try { await Dashboard.renderers.moderation(c, window.__guild); } catch {}
    const g = document.querySelector('.mod-guide');
    if (!g) return { absente: true };
    const k = g.querySelector('.mg-kicker');
    const r = g.getBoundingClientRect();
    return {
      kicker: k ? getComputedStyle(k).fontSize : '—',
      texte: g.querySelector('.mg-col p') ? getComputedStyle(g.querySelector('.mg-col p')).fontSize : '—',
      padding: getComputedStyle(g).padding,
      horsDroite: L(Math.max(0, r.right - window.innerWidth)),
    };
  });
  console.log('\n── Fiche du module : ' + JSON.stringify(aide));

  console.log('\n── Erreurs de page : ' + (erreurs.length ? erreurs.join(' | ') : 'aucune'));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('💥', String(e && e.stack || e).slice(0, 400)); process.exit(1); });
