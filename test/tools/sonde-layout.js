// Sonde de mise en page : debordements, elements fixes qui recouvrent, menus.
const { chromium } = require('playwright-core');
const BASE = process.env.HOX_BASE || 'https://hoxera.is-a.dev';
const LARGEURS = (process.env.LARGEURS || '375,1440').split(',').map(Number);

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const w of LARGEURS) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    const err = [];
    p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 90)); });
    p.on('pageerror', (e) => err.push('pageerror: ' + String(e.message).slice(0, 90)));
    const res = [];
    p.on('response', (r) => { if (r.status() >= 400) res.push(r.status() + ' ' + r.url().slice(0, 90)); });
    await p.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({}); });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    const r = await p.evaluate((vw) => {
      const depasse = [];
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right > vw + 1 || b.left < -1) {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.position === 'sticky') continue;
          depasse.push({ t: (el.textContent || '').trim().slice(0, 26), c: String(el.className).slice(0, 40), right: Math.round(b.right), left: Math.round(b.left) });
        }
      }
      const fixes = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        const b = el.getBoundingClientRect();
        if (b.width < 8 || b.height < 8) continue;
        fixes.push({ c: String(el.className).slice(0, 40), z: cs.zIndex, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) });
      }
      const liens = Array.from(document.querySelectorAll('.navbar-links a')).filter((a) => a.getBoundingClientRect().width > 0).length;
      const majuscules = Array.from(document.querySelectorAll('h1,h2,h3,.hp-kicker,.pub-sub')).filter((e) => getComputedStyle(e).textTransform === 'uppercase').map((e) => e.textContent.trim().slice(0, 30));
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        depasse: depasse.slice(0, 12),
        nbDepasse: depasse.length,
        fixes,
        liensNavVisibles: liens,
        majuscules: majuscules.slice(0, 6),
      };
    }, w);
    console.log('=== ' + w + 'px ===');
    console.log(JSON.stringify(r, null, 1));
    console.log('erreurs console:', err.slice(0, 5));
    console.log('requetes >=400:', res.slice(0, 5));
    await p.screenshot({ path: '/tmp/sonde-' + w + '.png', fullPage: false });
    await p.close();
  }
  await b.close();
})();
