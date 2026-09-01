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
const puppeteer = require('puppeteer');

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
    const isCheckable = (tag === 'input') && (el.type === 'checkbox' || el.type === 'radio');
    if (interactive && r.height > 0 && !isCheckable) {
      if (r.height < 32 || (r.width < 40 && !cls.includes('icn') && !cls.includes('caret'))) {
        issues.push({ type: 'small-control', sel, text, h: Math.round(r.height), w: Math.round(r.width) });
      }
    }
  }

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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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
    await page.goto(BASE + '/#/dashboard', { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(e => console.log('goto err', e.message));
    await page.waitForFunction('window.Dashboard && window.Dashboard.state && !document.querySelector("#public-landing")', { timeout: 25000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate((g) => {
      Dashboard.state.guildId = g;
      try { localStorage.setItem('hx-guild', g); } catch {}
    }, GUILD).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    const run = async (mod) => {
      try {
        await page.evaluate((m) => { Dashboard.setModule(m); }, mod);
        await new Promise(r => setTimeout(r, WAIT));
        const data = await page.evaluate(PROBE);
        data.issues = data.issues || [];
        report[mode].push({ module: mod, issues: data.issues, metrics: data.metrics });
        await page.screenshot({ path: `${OUT}/${mode}-${mod}.png`, fullPage: false });
        const top = data.issues.slice(0, 8).map(i => `${i.type}@${i.sel}${i.sw ? '(' + (i.sw - i.cw) + 'px)' : ''}`).join(' · ');
        console.log(`  ${mod.padEnd(14)} ${String(data.issues.length).padStart(3)} pb   ${top}`);
      } catch (e) {
        console.log(`  ${mod.padEnd(14)} ERREUR ${e.message.slice(0, 90)}`);
      }
    };

    for (const m of SERVER_MODULES) await run(m);
    for (const m of BOT_MODULES) await run(m);

    // Sélecteur de serveurs (pire cas : 53 guildes)
    try {
      await page.evaluate(() => Dashboard.openServerPicker());
      await new Promise(r => setTimeout(r, 800));
      const data = await page.evaluate(PROBE);
      data.issues = data.issues || [];
      report[mode].push({ module: 'server-picker', issues: data.issues, metrics: data.metrics });
      await page.screenshot({ path: `${OUT}/${mode}-server-picker.png`, fullPage: false });
      console.log(`  server-picker  ${String(data.issues.length).padStart(3)} pb   ${data.issues.slice(0, 8).map(i => i.type + '@' + i.sel).join(' · ')}`);
      await page.evaluate(() => { document.querySelector('#modal-root').innerHTML = ''; document.body.style.overflow = ''; });
    } catch (e) { console.log('  server-picker ERREUR', e.message.slice(0, 90)); }

    // Tiroir de navigation mobile (bouton ▦)
    if (mode === 'mobile') {
      try {
        await page.evaluate(() => { const b = document.querySelector('#d-mobile-modules'); if (b) b.click(); });
        await new Promise(r => setTimeout(r, 600));
        const data = await page.evaluate(PROBE);
        data.issues = data.issues || [];
        report[mode].push({ module: 'mobile-drawer', issues: data.issues, metrics: data.metrics });
        await page.screenshot({ path: `${OUT}/${mode}-mobile-drawer.png`, fullPage: false });
        console.log(`  mobile-drawer  ${String(data.issues.length).padStart(3)} pb   ${data.issues.slice(0, 8).map(i => i.type + '@' + i.sel).join(' · ')}`);
      } catch (e) { console.log('  mobile-drawer ERREUR', e.message.slice(0, 90)); }
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

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('\n═══════════ SYNTHÈSE ═══════════');
  let total = 0;
  for (const mode of ['desktop', 'mobile']) {
    for (const r of report[mode]) {
      const pageOvf = r.issues.filter(i => i.type === 'page-overflow-x').length;
      const off = r.issues.filter(i => i.type === 'offscreen-x').length;
      const text = r.issues.filter(i => i.type === 'text-overflow').length;
      const small = r.issues.filter(i => i.type === 'small-control').length;
      total += r.issues.length;
      if (r.issues.length) console.log(`  ${mode.padEnd(8)} ${r.module.padEnd(15)} page=${pageOvf} horsEcran=${off} texte=${text} petitsCtrl=${small}`);
    }
  }
  console.log(`Total problèmes (v2) : ${total}`);
  await browser.close();
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
