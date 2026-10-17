// ============================================================
// Banc de lisibilite : ce que l'oeil ne voit qu'a l'ecran, mesure dans Chromium.
// ------------------------------------------------------------
// Pourquoi ce banc ? Un contenant d'iccone vide, un contraste insuffisant ou un
// libelle de sortie qui repose sur un caractere Unicode rare ne se lisent dans
// aucune source : il faut rendre la page. Le banc ouvre donc l'accueil aux
// largeurs de reference, dans les deux themes, et releve :
//
//   1. LES CONTENANTS D'ICONE — chacun doit porter un SVG ; un contenant vide
//      rend une tuile sombre (le « carre noir » signale a la revue).
//   2. LE CONTRASTE DE CHAQUE TEXTE — couleur computee, fond recompose a la
//      main (alpha et premier arret des degrares), seuils WCAG AA : 4,5:1, et
//      3:1 au-dela de 18,5 px ou 14 px en gras.
//   3. LES ANCRES — l'ecart laisse entre le bandeau collant et la section
//      demandee. Negatif : le titre est cache. Au-dela de 40 : du vide.
//   4. LES LIENS — href="#", href vides, ressources externes, erreurs console.
//
// Le tableau de bord exige une session Discord : on le monte avec un etat
// de synthese (mêmes feuilles, même code de rendu) pour mesurer la barre
// laterale, le bouton de sortie et les polices heritees.
//
//   node test/tools/audit-lisibilite.js                      # accueil + tableau de bord
//   HOX_BASE=http://127.0.0.1:3011 node test/tools/audit-lisibilite.js --json=/tmp/lis.json
//   node test/tools/audit-lisibilite.js --largeurs=390,1280 --theme=dark
//
// Outil de revue : la CI ne l'execute pas (il exige Chromium).
// ============================================================
const { chromium } = require('playwright-core');
const BASE = process.env.HOX_BASE || 'http://127.0.0.1:3011';
const ARGS = process.argv.slice(2);
const LARGEURS = (ARGS.find((a) => a.startsWith('--largeurs=')) || '').split('=')[1]?.split(',').map(Number) || [360, 390, 768, 1280];
const THEME = (ARGS.find((a) => a.startsWith('--theme=')) || '').split('=')[1];
const JSON_OUT = (ARGS.find((a) => a.startsWith('--json=')) || '').split('=')[1];
const FIXTURE = {
  id: 'G1', name: 'SN7K COMMUNITY', description: '', members: 336, boosts: 2, channelsCount: 14,
  rolesCount: 9, createdAt: Date.now() - 4e8, icon: '', banner: '',
  channels: [{ id: 'C0', name: 'general', type: 0, position: 0 }],
  roles: [{ id: 'R1', name: 'Administrateur', color: '#ed4245', position: 10, managed: false }],
  settings: { prefix: '!', log_channel: 'C1', am_enabled: 1, am_mode: 'enforce' },
};

// Tout ce qui suit est evalue DANS la page (d'ou la forme function, pas de closures externes).
function mesureLanding() {
  const parses = (v) => {
    const s = String(v).trim();
    const hex = s.match(/^#([0-9a-f]{3,8})$/i);
    if (hex) { const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1].slice(0, 6); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; }
    const m = s.match(/rgba?\(([^)]*)\)/); if (!m) return null;
    const q = m[1].split(',').map(parseFloat); return { r: q[0], g: q[1], b: q[2], a: q.length > 3 ? q[3] : 1 };
  };
  const lum = (c) => { const f = (x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * f(c.r / 255) + 0.7152 * f(c.g / 255) + 0.0722 * f(c.b / 255); };
  const fondDe = (el) => {
    const pile = []; let n = el;
    while (n) {
      const cs = getComputedStyle(n);
      const c = parses(cs.backgroundColor);
      if (c && c.a > 0.02) pile.push(c);
      else {
        const img = String(cs.backgroundImage || '');
        if (/gradient/.test(img)) { const brut = (img.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i) || [])[0]; const q = brut ? parses(brut) : null; if (q) pile.push(q); }
      }
      n = n.parentElement;
    }
    let out = { r: 8, g: 11, b: 18, a: 1 };
    for (let k = pile.length - 1; k >= 0; k--) {
      const q = pile[k];
      out = q.a >= 0.99 ? q : { r: q.r * q.a + out.r * (1 - q.a), g: q.g * q.a + out.g * (1 - q.a), b: q.b * q.a + out.b * (1 - q.a), a: 1 };
    }
    return out;
  };
  const contenants = Array.from(document.querySelectorAll('.f-ico, .hp-pillar-ico'));
  const bandeau = document.querySelector('#public-landing .navbar') || document.querySelector('.navbar');
  const cible = document.getElementById('hp-features');
  let ecart = null;
  if (cible && bandeau) { cible.scrollIntoView({ block: 'start' }); ecart = Math.round(cible.getBoundingClientRect().top - bandeau.getBoundingClientRect().bottom); }
  const hrefs = Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
  const rates = []; const vus = new Set(); let testes = 0;
  const sel = '.pub-hero *, .hp-pillar *, .pub-feature *, .hp-faq-item *, .hp-footer-col *, .pub-section > *, .hp-cta *, .pub-footer *, .navbar *, .pub-stat, .hp-step';
  for (const el of document.querySelectorAll(sel)) {
    if (!el.offsetParent || vus.has(el)) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 240 || el.children.length) continue;
    vus.add(el); testes++;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.6) continue;
    const bg = fondDe(el);
    const fg0 = parses(cs.color); if (!fg0) continue;
    const fg = fg0.a >= 0.99 ? fg0 : { r: fg0.r * fg0.a + bg.r * (1 - fg0.a), g: fg0.g * fg0.a + bg.g * (1 - fg0.a), b: fg0.b * fg0.a + bg.b * (1 - fg0.a), a: 1 };
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const taille = parseFloat(cs.fontSize), gras = Number(cs.fontWeight) >= 700;
    const seuil = (taille >= 18.5 || (taille >= 14 && gras)) ? 3 : 4.5;
    if (ratio < seuil - 0.05) rates.push({ txt: t.slice(0, 24), px: Math.round(taille * 10) / 10, ratio: Math.round(ratio * 100) / 100, sel: String(el.className || el.tagName).slice(0, 20) });
  }
  // Un glyphe doit etre dessine au trait : un <path> laisse sans remplissage se
  // rend en noir plein, invisible sur fond sombre et criant sur fond clair.
  const traits = [];
  for (const svg of document.querySelectorAll('.ico-svg')) {
    for (const fils of svg.children) {
      const c = getComputedStyle(fils);
      const rempli = c.fill !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(c.fill);
      const noyau = c.fill.replace(/[^\d,]/g, '').split(',').map(Number);
      const sombre = rempli && (noyau[0] + noyau[1] + noyau[2]) / 3 < 90;
      if (sombre || c.stroke === 'none' && !rempli) traits.push((fils.tagName) + ' ' + c.fill + '/' + c.stroke);
    }
  }
  return {
    theme: document.documentElement.className,
    traitsDenonces: traits.slice(0, 5),
    iconeContenants: contenants.length,
    iconeVides: contenants.filter((e) => !e.innerHTML.trim()).length,
    iconeSansSvg: contenants.filter((e) => !e.querySelector('svg')).length,
    ecartAncre: ecart,
    scrollPadding: getComputedStyle(document.documentElement).scrollPaddingTop,
    liensMorts: hrefs.filter((h) => h === '#' || h === '' || /^javascript/.test(h)),
    textesTestes: testes,
    sousAA: rates.sort((a, b) => a.ratio - b.ratio).slice(0, 6),
  };
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const out = { landing: {}, dashboard: {} };
  for (const w of LARGEURS) {
    for (const theme of (THEME ? [THEME] : ['light', 'dark'])) {
      const p = await b.newPage({ viewport: { width: w, height: 900 } });
      const erreurs = [];
      p.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 60)); });
      p.on('pageerror', (e) => erreurs.push('pageerror: ' + String(e.message).slice(0, 70)));
      p.on('requestfailed', (r) => erreurs.push('reseau: ' + r.url().slice(0, 60)));
      await p.emulateMedia({ colorScheme: theme, media: 'screen' });
      await p.goto(BASE + '/', { waitUntil: 'networkidle' });
      await p.waitForTimeout(1300);
      try { out.landing[w + '-' + theme] = await p.evaluate(mesureLanding); } catch (e) { out.landing[w + '-' + theme] = { erreur: String(e.message).slice(0, 140) }; }
      if (erreurs.length) out.landing[w + '-' + theme].erreurs = Array.from(new Set(erreurs)).slice(0, 3);
      if (w === 390 && theme === 'light') await p.screenshot({ path: '/tmp/tir-v368-landing-390-clair.png' });
      if (w === 1280 && theme === 'dark') await p.screenshot({ path: '/tmp/tir-v368-landing-1280.png' });
      if (w === 1280 && theme === 'light') await p.screenshot({ path: '/tmp/tir-v368-landing-1280-clair.png' });
      await p.close();
    }
  }

  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const err = [];
  p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 60)); });
  p.on('pageerror', (e) => err.push('pageerror: ' + String(e.message).slice(0, 110)));
  await p.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({}); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.evaluate(() => {
    App.state.loaded = true;
    App.state.user = { discord_username: 'nexusdolf', is_admin: true };
    document.body.innerHTML = '<div id="modal-root"></div><div id="toasts"></div>'
      + '<div class="dashboard-shell-host"><div class="dash-shell"><aside class="dash-side" id="dash-side"></aside>'
      + '<main class="dash-main"><div class="dash-topbar" id="dash-topbar"></div><div id="dash-content"></div></main></div></div>';
  });
  await p.evaluate(([fixture]) => {
    App.api = async (u) => {
      if (u.includes('/members')) return { members: [] };
      if (u.includes('/roles')) return { roles: fixture.roles };
      if (u.includes('/health')) return { ok: true, uptimeMs: 1000, memoryMb: 100, clients: [{ id: 1, ready: true, startedAt: Date.now() }] };
      if (/\/guilds\/[^/]+$/.test(u)) return fixture;
      return {};
    };
    window.__toasts = [];
    App.toast = (m) => { window.__toasts.push(String(m)); };
    Dashboard.state = {
      bot: { id: 1, name: 'Hoxera', online: true, avatar_url: '' }, guildId: 'G1', module: 'overview', moduleHistory: [],
      discordGuilds: [{ id: 'G1', name: 'SN7K COMMUNITY', icon: '', hasBot: true, canManage: true, members: 336 }],
      guild: fixture, settings: fixture.settings, modules: { moderation: true, antinuke: true },
    };
    Dashboard.renderTopbar(document.querySelector('#dash-topbar'), Dashboard.state.discordGuilds);
    if (Dashboard.renderSide) Dashboard.renderSide(document.querySelector('#dash-side'));
    Dashboard.setModule('overview');
  }, [FIXTURE]);
  await p.waitForTimeout(3000);
  out.dashboard = await p.evaluate(() => {
    const vides = Array.from(document.querySelectorAll('.ov-quick-action span, .am-shield-icon, .dash-side-item .ico, .m-icon'))
      .filter((e) => !e.innerHTML.trim()).map((e) => String(e.className).slice(0, 22)).slice(0, 8);
    const lo = document.querySelector('#d-logout');
    const ico = document.querySelector('.dash-global-admin .ico');
    const chip = document.querySelector('.ov-eyebrow');
    const tiroir = document.querySelector('.dd-list');
    const serif = Array.from(document.querySelectorAll('.dashboard-shell-host *'))
      .filter((e) => !e.children.length && (e.textContent || '').trim())
      .map((e) => ({ t: e.textContent.trim().slice(0, 14), f: getComputedStyle(e).fontFamily.slice(0, 26) }))
      .filter((x) => /^(serif|Times|Georgia)/i.test(x.f));
    return {
      entreesMenu: document.querySelectorAll('.dash-side-item').length,
      tuilesAcces: document.querySelectorAll('.ov-quick-action').length,
      iconeVides: vides,
      logout: lo ? { aria: lo.getAttribute('aria-label'), svg: !!lo.querySelector('svg'), texte: lo.textContent.trim() } : 'absent',
      couronne: ico ? { couleur: getComputedStyle(ico).color, aSvg: !!ico.querySelector('svg') } : 'absente',
      entete: chip ? chip.textContent.trim() : 'absent',
      tiroir: tiroir ? { depassement: tiroir.scrollWidth - tiroir.clientWidth, scrollbarWidth: getComputedStyle(tiroir).scrollbarWidth } : 'absent',
      textesEnSerif: serif.slice(0, 3),
      cadratins: Array.from(document.querySelectorAll('#dash-content p, #dash-content small, #dash-content option, #dash-content label, .dash-side *'))
        .filter((e) => !e.children.length && / — /.test(e.textContent || '')).length,
    };
  });

  out.dashboard.erreursApp = Array.from(new Set(err)).slice(0, 4);
  await b.close();
  const echecs = Object.entries(out.landing).reduce((n, [, v]) => n + ((v && v.sousAA && v.sousAA.length) || 0) + ((v && v.traitsDenonces && v.traitsDenonces.length) || 0), 0);
  if (JSON_OUT) require('fs').writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
  if (!process.env.HOX_JSON) console.log(JSON.stringify(out, null, 1));
  console.log('Échecs relevés sur ' + Object.keys(out.landing).length + ' rendus : ' + echecs
    + ' · icônes vides : ' + Object.values(out.landing).reduce((n, v) => n + ((v && v.iconeVides) || 0), 0)
    + ' · liens morts : ' + Object.values(out.landing).reduce((n, v) => n + (((v && v.liensMorts) || []).length), 0));
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.log('ERR ' + e.message); process.exit(1); });
