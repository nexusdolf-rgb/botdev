// ============================================================
// Audit UI automatisé (Puppeteer) — v2, sonde précise
// Détecte les VRAIS débordements (page, éléments, texte), les
// tailles de contrôles, les positions, sur desktop ET mobile.
//
// Usage :
//   TOKEN=<session> node scripts/ui-audit.js
// Produit report.json + screenshots dans ui-audit/report/
// ============================================================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const puppeteer = require('puppeteer');

// /tmp saturé = ERR_INSUFFICIENT_RESOURCES dans Chrome (gel/crash aléatoire).
// On nettoie les répertoires temporaires d'audit + profiles Chrome avant de partir.
try { execSync("rm -rf /tmp/hoxera-v* /tmp/botdev-v* /tmp/botdev-feat* /tmp/puppeteer_dev_chrome_profile-* /tmp/chrome-user-data-*"); } catch (e) {}

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const TOKEN = process.env.TOKEN || '';
const GUILD = process.env.GUILD || '1513133061489955006';
const OUT = path.join(__dirname, '..', '..', 'ui-audit', 'report');

const SERVER_MODULES = ['overview', 'tickets', 'welcome', 'levels', 'economy', 'shop', 'moderation', 'roles', 'suggestions', 'giveaways', 'events', 'quiz', 'community', 'announcements', 'embeds', 'members', 'stats', 'logs', 'transcripts', 'modmail', 'server', 'botprofile'];
const BOT_MODULES = ['commands', 'modules', 'health', 'botsettings', 'help'];
const WAIT = 1500;

// Sonde : retourne { issues, metrics }
const PROBE = `(() => {
  const issues = [];
  const metrics = {};
  const vw = window.innerWidth, vh = window.innerHeight;

  // --- A) La page déborde-t-elle horizontalement ? ---
  if (document.documentElement.scrollWidth > vw + 2) {
    issues.push({ type: 'page-overflow-x', detail: document.documentElement.scrollWidth + ' vs ' + vw });
  }

  // Ancêtre scrollable horizontal ?
  const hasScrollXAncestor = (el) => {
    let p = el.parentElement;
    while (p) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
      p = p.parentElement;
    }
    return false;
  };
  const inside = (el, sel) => { let p = el; while (p) { if (p.matches && p.matches(sel)) return true; p = p.parentElement; } return false; };

  const els = document.querySelectorAll('body *');
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 42);
    const cls = (el.className && el.className.toString ? el.className.toString() : '');
    const id = el.id ? '#' + el.id : '';
    const sel = (el.tagName || '').toLowerCase() + id + (cls ? '.' + cls.split(' ').filter(Boolean).join('.') : '');
    const tag = (el.tagName || '').toLowerCase();

    // --- B) Débordement HORIZONTAL de l'écran (hors scrollables voulus) ---
    const clipped = (() => { let p = el.parentElement; while (p) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'clip') return true; p = p.parentElement; } return false; })();
    if ((r.right > vw + 2 || r.left < -2) && !hasScrollXAncestor(el) && !clipped) {
      // ignorer les éléments dans un modal ouvert (position fixed) qui sont volontairement plus larges ? non : un modal hors écran = vrai bug
      issues.push({ type: 'offscreen-x', sel, text, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw });
    }

    // --- C) Texte coupé/débordant (scrollWidth > clientWidth, sans scrollbar X) ---
    const ox = cs.overflowX;
    const isField = tag === 'input' || tag === 'select' || tag === 'textarea';
    const isSwitch = cls.includes('switch');
    const isIconBtn = cls.includes('dash-iconbtn');
    const hasEllipsis = cs.textOverflow === 'ellipsis';
    // Cas volontaires (pas des bugs) : champs avec contenu qui scrolle,
    // interrupteurs à zone tactile étendue, boutons à badge, ellipsis.
    const containsSwitch = el.children && [...el.children].some((c) => c.classList && c.classList.contains('switch'));
    const isShimmer = cls.includes('shimmer');
    // Enfant positionné en absolu qui dépasse volontairement (blob/effet décoratif rogné)
    const absOverflow = el.children && [...el.children].some((c) => {
      const pcs = getComputedStyle(c);
      if (pcs.position !== 'absolute' && pcs.position !== 'fixed') return false;
      const cr = c.getBoundingClientRect();
      return cr.right > r.right + 1 || cr.left < r.left - 1;
    });
    if (!isField && !isSwitch && !isIconBtn && !isShimmer && !hasEllipsis && !containsSwitch && !absOverflow &&
        el.scrollWidth > el.clientWidth + 3 && (ox === 'visible' || ox === 'hidden' || ox === 'clip' || ox === '') && !hasScrollXAncestor(el)) {
      issues.push({ type: 'text-overflow', sel, text, sw: el.scrollWidth, cw: el.clientWidth, ox });
    }

    // --- D) Contrôles interactifs trop petits pour le confort tactile ---
    const interactive = tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' || (tag === 'a' && cls.includes('btn'));
    const isCheckable = (tag === 'input') && (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file');
    if (interactive && r.height > 0 && !isCheckable) {
      if (r.height < 32 || (r.width < 40 && !cls.includes('icn') && !cls.includes('caret'))) {
        issues.push({ type: 'small-control', sel, text, h: Math.round(r.height), w: Math.round(r.width) });
      }
    }
  }

  // --- D2) Chevauchements d'éléments interactifs (boutons/inputs qui se recouvrent) ---
  const visEl = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    return true;
  };
  const isChildOf = (a, b) => { let p = a.parentElement; while (p) { if (p === b) return true; p = p.parentElement; } return false; };
  // Élément situé dans un calque plein écran (modal / tiroir mobile) : il
  // recouvre volontairement le contenu derrière — pas un chevauchement de bug.
  const inOverlay = (el) => { let p = el; while (p && p !== document.body) { if (p.classList && (p.classList.contains('modal-overlay') || p.classList.contains('dash-mobile-layer'))) return true; p = p.parentElement; } return false; };
  const ivEls = [...document.querySelectorAll('body button, body input, body select, body textarea, body a.btn')]
    .filter(visEl)
    .map((el) => ({ el, r: el.getBoundingClientRect(), c: (el.className && el.className.toString) ? el.className.toString() : '' }));
  const ivn = Math.min(ivEls.length, 120);
  for (let i = 0; i < ivn; i++) {
    const A = ivEls[i];
    const ra = A.r;
    for (let j = i + 1; j < ivn; j++) {
      const B = ivEls[j];
      const rb = B.r;
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox <= 0 || oy <= 0) continue;
      if (isChildOf(A.el, B.el) || isChildOf(B.el, A.el)) continue;
      if (inOverlay(A.el) !== inOverlay(B.el)) continue;
      // Élément superposé volontairement (position sticky/fixed/absolute) : badge, hint de scroll…
      const posA = getComputedStyle(A.el).position, posB = getComputedStyle(B.el).position;
      if ((posA === 'sticky' || posA === 'fixed' || posA === 'absolute') && ra.width * ra.height < rb.width * rb.height) continue;
      if ((posB === 'sticky' || posB === 'fixed' || posB === 'absolute') && rb.width * rb.height < ra.width * ra.height) continue;
      const minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (minArea <= 0) continue;
      const ratio = (ox * oy) / minArea;
      if (ratio >= 0.25) {
        const selA = A.el.tagName.toLowerCase() + '.' + A.c.split(' ').filter(Boolean).slice(0, 2).join('.');
        const selB = B.el.tagName.toLowerCase() + '.' + B.c.split(' ').filter(Boolean).slice(0, 2).join('.');
        issues.push({ type: 'overlap', sel: selA + ' + ' + selB, text: Math.round(ratio * 100) + '%', rect: [Math.round(ra.left), Math.round(ra.top), Math.round(ra.width), Math.round(ra.height)] });
      }
    }
  }

  // --- D3) Boutons dont le texte ne tient pas (retour à la ligne / coupure) ---
  document.querySelectorAll('button, a.btn').forEach((b) => {
    if (!visEl(b)) return;
    const txt = (b.textContent || '').trim();
    if (!txt || txt.length < 3) return;
    const c = (b.className && b.className.toString) ? b.className.toString() : '';
    // Badge / enfant en position absolue (ex: cloche + compteur) : débord volontaire.
    const hasAbsChild = b.children && [...b.children].some((ch) => { const pcs = getComputedStyle(ch); return pcs.position === 'absolute' || pcs.position === 'fixed'; });
    if (b.scrollWidth > b.clientWidth + 4 && !hasAbsChild) {
      if (!c.includes('icn')) issues.push({ type: 'btn-clip', sel: b.tagName.toLowerCase() + '.' + c.split(' ').filter(Boolean).slice(0, 2).join('.'), text: txt.slice(0, 30), d: b.scrollWidth - b.clientWidth });
    }
    // Les cartes du sélecteur de serveurs (.sp-card) sont des panneaux de
    // sélection à bannière, pas des boutons d'action : hors champ du check.
    if (b.clientHeight > 64 && !c.includes('multiline') && !c.includes('sp-card') && !c.includes('srv-card')) issues.push({ type: 'btn-tall', sel: b.tagName.toLowerCase(), text: txt.slice(0, 30), h: Math.round(b.clientHeight) });
  });

  // --- D4) Polices trop petites pour être lisibles (< 10px, texte réel) ---
  // TreeWalker sur les textes directs (≥ 8 caractères), plafonné à 2000
  // contrôles pour rester rapide même sur les modules très denses.
  try {
    let tinyChecked = 0;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => { const t = (n.textContent || '').trim(); return t.length >= 8 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; },
    });
    let tnode;
    while ((tnode = tw.nextNode()) && tinyChecked < 2000) {
      tinyChecked++;
      const el = tnode.parentElement;
      if (!el || !el.getClientRects || el.getClientRects().length === 0) continue;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (!(fs > 0 && fs < 10)) continue;
      const c = (el.className && el.className.toString) ? el.className.toString() : '';
      if (c.includes('ico') || c.includes('badge') || c.includes('caret') || c.includes('slider') || c.includes('side-section') || c.includes('hx-')) continue;
      issues.push({ type: 'tiny-font', sel: el.tagName.toLowerCase() + (c ? '.' + c.split(' ').filter(Boolean).slice(0, 2).join('.') : ''), text: (tnode.textContent || '').trim().slice(0, 30), fs });
    }
  } catch {}

  // --- E) Métriques des composants clés ---
  const metric = (key, arr) => { if (arr.length) { const vs = arr.sort((a, b) => a - b); metrics[key] = { min: vs[0], med: vs[Math.floor(vs.length / 2)], max: vs[vs.length - 1], n: vs.length }; } };
  const hOf = (sel) => [...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().height)).filter(h => h > 0);
  const wOf = (sel) => [...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().width)).filter(w => w > 0);
  metric('btn-h', hOf('.dash-btn'));
  metric('input-h', hOf('.dash-input'));
  metric('select-h', hOf('.dash-select, select.dash-select'));
  metric('card-w', wOf('.dash-card'));
  metric('label-h', hOf('.dash-label'));
  const side = document.querySelector('.dash-sidebar, .sidebar, aside');
  if (side) { const sr = side.getBoundingClientRect(); metrics['sidebar-w'] = Math.round(sr.width); }
  const top = document.querySelector('.dash-topbar, .topbar');
  if (top) metrics['topbar-h'] = Math.round(top.getBoundingClientRect().height);

  return { issues, metrics };
})()`;

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  fs.mkdirSync(OUT, { recursive: true });
  const report = { desktop: [], mobile: [], 'landing-desktop': [], 'landing-mobile': [], captures: [] };

  for (const [mode, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    console.log(`\n█████ ${mode.toUpperCase()} (${viewport.width}x${viewport.height}) █████`);
    const page = await browser.newPage();
    await page.setViewport(viewport);
    if (viewport.width <= 500) {
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    }
    await page.setCookie({ name: 'botdev_session', value: TOKEN, domain: '127.0.0.1', path: '/' });
    // Chargement parfois instable (sandbox) : on réessaie jusqu'à 5 fois.
    let loaded = false;
    for (let attempt = 1; attempt <= 5 && !loaded; attempt++) {
      try {
        await page.goto(BASE + '/#/dashboard', { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForFunction('document.querySelector(".dash-shell")', { timeout: 25000 });
        await new Promise(r => setTimeout(r, 2000));
        await page.evaluate(() => 1 + 1);
        loaded = true;
      } catch (e) {
        console.log('  [' + mode + '] chargement instable (tentative ' + attempt + '/5), nouvelle tentative…');
        await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!loaded) {
      console.log('  [' + mode + '] abandon : page injoignable (sandbox instable)');
      await page.close().catch(() => {});
      continue;
    }
    await page.evaluate((g) => {
      Dashboard.state.guildId = g;
      try { localStorage.setItem('hx-guild', g); } catch {}
    }, GUILD).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    // Vue initiale (aucun serveur mémorisé) : la grille de serveurs. On la
    // mesure explicitement, puis on force le re-rendu du module overview.
    try {
      const hasGrid = await page.evaluate(() => !!document.querySelector('.srv-grid'));
      if (hasGrid) {
        const gData = await page.evaluate(PROBE);
        gData.issues = gData.issues || [];
        report[mode].push({ module: 'server-grid', theme: 'dark', issues: gData.issues, metrics: gData.metrics });
        await page.screenshot({ path: `${OUT}/${mode}-server-grid.png`, fullPage: false });
        console.log('  [init] server-grid ' + String(gData.issues.length).padStart(3) + ' pb');
      }
    } catch (e) { console.log('  server-grid ERREUR', e.message.slice(0, 80)); }
    await page.evaluate(() => { Dashboard.setModule('welcome'); Dashboard.setModule('overview'); }).catch(() => {});
    await new Promise(r => setTimeout(r, 700));

    const run = async (mod, theme) => {
      try {
        await page.evaluate((m) => { Dashboard.setModule(m); }, mod);
        await new Promise(r => setTimeout(r, WAIT));
        const data = await page.evaluate(PROBE);
        data.issues = data.issues || [];
        report[mode].push({ module: mod, theme, issues: data.issues, metrics: data.metrics });
        await page.screenshot({ path: `${OUT}/${mode}-${mod}.png`, fullPage: false });
        const top = data.issues.slice(0, 8).map(i => `${i.type}@${i.sel}${i.sw ? '(' + (i.sw - i.cw) + 'px)' : ''}`).join(' · ');
        console.log(`  [${theme.padEnd(5)}] ${mod.padEnd(14)} ${String(data.issues.length).padStart(3)} pb   ${top}`);
      } catch (e) {
        console.log(`  ${mod.padEnd(14)} ERREUR ${e.message.slice(0, 90)}`);
      }
    };

    for (const theme of ['dark', 'light']) {
      console.log(`\n  ▸ thème ${theme.toUpperCase()}`);
      await page.evaluate((t) => { document.documentElement.classList.toggle('hx-light', t === 'light'); }, theme);
      await new Promise(r => setTimeout(r, 300));
      for (const m of SERVER_MODULES) await run(m, theme);
      for (const m of BOT_MODULES) await run(m, theme);

      // Sélecteur de serveurs (pire cas : 53 guildes)
      try {
        await page.evaluate(() => Dashboard.openServerPicker());
        await new Promise(r => setTimeout(r, 800));
        const data = await page.evaluate(PROBE);
        data.issues = data.issues || [];
        report[mode].push({ module: 'server-picker', theme, issues: data.issues, metrics: data.metrics });
        await page.screenshot({ path: `${OUT}/${mode}-${theme}-server-picker.png`, fullPage: false });
        console.log(`  [${theme.padEnd(5)}] server-picker  ${String(data.issues.length).padStart(3)} pb   ${data.issues.slice(0, 8).map(i => i.type + '@' + i.sel).join(' · ')}`);
        await page.evaluate(() => { document.querySelector('#modal-root').innerHTML = ''; document.body.style.overflow = ''; });
      } catch (e) { console.log('  server-picker ERREUR', e.message.slice(0, 90)); }

      // Tiroir de navigation mobile (bouton ▦)
      if (mode === 'mobile') {
        try {
          await page.evaluate(() => { const b = document.querySelector('#d-mobile-modules'); if (b) b.click(); });
          await new Promise(r => setTimeout(r, 600));
          const data = await page.evaluate(PROBE);
          data.issues = data.issues || [];
          report[mode].push({ module: 'mobile-drawer', theme, issues: data.issues, metrics: data.metrics });
          await page.screenshot({ path: `${OUT}/${mode}-${theme}-mobile-drawer.png`, fullPage: false });
          console.log(`  [${theme.padEnd(5)}] mobile-drawer ${String(data.issues.length).padStart(3)} pb   ${data.issues.slice(0, 8).map(i => i.type + '@' + i.sel).join(' · ')}`);
        } catch (e) { console.log('  mobile-drawer ERREUR', e.message.slice(0, 90)); }
      }
    }

    await page.close();
  }

  // ═══ LANDING PUBLIQUE (sans session) : haut + bas de page ═══
  console.log('\n█████ LANDING PUBLIQUE █████');
  for (const [mode, viewport] of [['landing-desktop', { width: 1440, height: 900 }], ['landing-mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    if (viewport.width <= 500) {
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    }
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(e => console.log('goto err', e.message));
    await page.waitForFunction('document.querySelector("#public-landing")', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    for (const zone of ['haut', 'bas']) {
      if (zone === 'bas') await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      const data = await page.evaluate(PROBE);
      data.issues = data.issues || [];
      report[mode].push({ module: 'landing-' + zone, issues: data.issues, metrics: data.metrics });
      await page.screenshot({ path: `${OUT}/${mode}-landing-${zone}.png`, fullPage: false });
      console.log(`  ${mode} ${zone.padEnd(5)} ${String(data.issues.length).padStart(3)} pb   ${data.issues.slice(0, 8).map(i => i.type + '@' + i.sel).join(' · ')}`);
    }
    await page.close();
  }

  // ═══ ESPACE FONDATEUR (#/admin) — si un ADMIN_TOKEN est fourni ═══
  if (process.env.ADMIN_TOKEN) {
    console.log('\n█████ ESPACE FONDATEUR (#/admin) █████');
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCookie({ name: 'botdev_session', value: process.env.ADMIN_TOKEN, domain: '127.0.0.1', path: '/' });
    await page.goto(BASE + '/#/admin', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(e => console.log('goto err', e.message));
    await page.waitForFunction('document.querySelector(".admin-platform-page")', { timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    const tabs = ['overview', 'users', 'bots', 'audit', 'settings'];
    for (const t of tabs) {
      try {
        await page.evaluate((tab) => { App.ADMIN_TAB = tab; const b = document.querySelector('.admin-tab[data-tab="' + tab + '"]'); if (b) b.click(); }, t);
        await new Promise(r => setTimeout(r, 1800));
        const data = await page.evaluate(PROBE);
        data.issues = data.issues || [];
        report['admin-' + t] = data.issues;
        await page.screenshot({ path: `${OUT}/admin-${t}.png`, fullPage: false });
        console.log(`  admin/${t.padEnd(9)} ${String(data.issues.length).padStart(3)} pb   ${data.issues.slice(0, 6).map(i => i.type + '@' + i.sel).join(' · ')}`);
      } catch (e) {
        console.log(`  admin/${t} ERREUR ${e.message.slice(0, 90)}`);
      }
    }
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\n═══════════ SYNTHÈSE ═══════════');
  let total = 0;
  for (const mode of ['desktop', 'mobile']) {
    for (const r of report[mode]) {
      const pageOvf = r.issues.filter(i => i.type === 'page-overflow-x').length;
      const off = r.issues.filter(i => i.type === 'offscreen-x').length;
      const text = r.issues.filter(i => i.type === 'text-overflow').length;
      const small = r.issues.filter(i => i.type === 'small-control').length;
      const overlap = r.issues.filter(i => i.type === 'overlap').length;
      const btn = r.issues.filter(i => i.type === 'btn-clip' || i.type === 'btn-tall').length;
      const tiny = r.issues.filter(i => i.type === 'tiny-font').length;
      total += r.issues.length;
      if (r.issues.length) console.log(`  ${mode.padEnd(8)} ${String(r.theme || '').padEnd(5)} ${r.module.padEnd(15)} page=${pageOvf} horsEcran=${off} texte=${text} petitsCtrl=${small} overlap=${overlap} btn=${btn} tiny=${tiny}`);
    }
  }
  console.log(`Total problèmes (v2) : ${total}`);
  await browser.close();
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
