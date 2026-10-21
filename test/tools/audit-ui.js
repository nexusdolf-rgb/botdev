// Chasse aux défauts visibles : débordements, cibles tactiles, images cassées,
// identifiants en double, textes suspects. À lancer sur la prod ou en local.
const { chromium } = require('playwright-core');
const BASE = process.env.HOX_BASE || 'https://hoxera.is-a.dev';
const LARGEURS = (process.env.LARGEURS || '375,1440').split(',').map(Number);

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const rapport = [];
  for (const w of LARGEURS) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    const err = [];
    p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 80)); });
    p.on('pageerror', (e) => err.push('pageerror: ' + String(e.message).slice(0, 80)));
    await p.addInitScript(() => { if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({}); });
    await p.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    const r = await p.evaluate((vw) => {
      const out = { debordements: [], ciblesTactiles: [], imagesCassees: [], ids: {}, liensVides: [], suspects: [] };
      const texte = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (r.width < 2 || r.height < 2) continue;
        if (r.right > vw + 1 && cs.position !== 'fixed' && cs.position !== 'absolute') {
          out.debordements.push({ c: String(el.className).slice(0, 30), d: Math.round(r.right - vw) });
        }
        // cibles tactiles : boutons et liens interactifs trop petits
        if (el.matches('button, a[href], [role="button"], input[type="checkbox"], select') && vw <= 420) {
          if (r.height < 38 || r.width < 30) out.ciblesTactiles.push({ t: texte(el), w: Math.round(r.width), h: Math.round(r.height) });
        }
        if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) out.imagesCassees.push(el.getAttribute('src')?.slice(0, 60));
        if (el.id) out.ids[el.id] = (out.ids[el.id] || 0) + 1;
        if (el.tagName === 'A' && (el.getAttribute('href') === '#' || el.getAttribute('href') === '')) out.liensVides.push(texte(el));
      }
      const txt = document.body.innerText;
      for (const motif of [/dashboard/gi, /serveur\(s\)/gi, /#\d{4}/g, /Bots? en ligne/gi, /\//]) {}
      const dupliques = Object.entries(out.ids).filter(([, n]) => n > 1).map(([k, n]) => k + '×' + n);
      out.ids = dupliques;
      const suspects = [];
      if (/dashboard/i.test(txt)) suspects.push('franglais : dashboard (' + (txt.match(/dashboard/gi) || []).length + ')');
      if (/#\d{4}\b/.test(txt)) suspects.push('discriminateur Discord : ' + (txt.match(/#\d{4}\b/g) || []).join(', '));
      if (/serveur\(s\)/.test(txt)) suspects.push('serveur(s)');
      if (/\d+\/\d+/.test(txt.match(/\d+\/\d+ Bot/)?.[0] || '')) suspects.push('statistique en fraction');
      out.suspects = suspects;
      // v378 — le bandeau mobile avait le hamburger au milieu, un grand vide à
      // sa droite : `space-between` répartissait l'espace avec un conteneur
      // vide. On mesure l'écart entre le dernier contrôle visible du bandeau et
      // le bord droit ; au-delà de la marge de page, c'est un défaut.
      const barre = document.querySelector('.navbar');
      out.bandeau = null;
      if (barre) {
        const vis = [...barre.children].filter((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          return r.width > 1 && r.height > 1 && cs.display !== 'none';
        });
        if (vis.length) {
          const dernier = vis[vis.length - 1];
          const droites = vis.map((e) => e.getBoundingClientRect().right);
          const plusADroite = Math.max(...droites);
          const marge = parseFloat(getComputedStyle(barre).paddingRight) || 0;
          out.bandeau = {
            dernier: String(dernier.className || dernier.tagName).slice(0, 20),
            ecartDroit: Math.round(vw - plusADroite),
            marge: Math.round(marge),
            hamburger: !!document.querySelector('#pub-burger'),
          };
        }
      }
      out.stats = Array.from(document.querySelectorAll('.pub-stat')).map((s) => s.textContent.trim().replace(/\s+/g, ' '));
      // Le bandeau doit finir au bord : marge de page + 6 px de tolérance.
      if (out.bandeau && out.bandeau.ecartDroit > out.bandeau.marge + 6) {
        out.suspects.push('bandeau : dernier contrôle à ' + out.bandeau.ecartDroit + ' px du bord (marge ' + out.bandeau.marge + ')');
      }
      out.erreurs = [];
      return out;
    }, w);
    r.erreurs = [...new Set(err)].slice(0, 4);
    r.largeur = w;
    rapport.push(r);
    await p.screenshot({ path: '/tmp/audit-' + w + '.png', fullPage: false });
    await p.close();
  }
  await b.close();
  for (const r of rapport) {
    console.log('==== ' + r.largeur + ' px ====');
    console.log(' stats :', JSON.stringify(r.stats));
    console.log(' débordements :', r.debordements.length, r.debordements.slice(0, 4).map((d) => d.c + ' +' + d.d).join(' · '));
    console.log(' cibles tactiles < 38 px :', r.ciblesTactiles.length, JSON.stringify(r.ciblesTactiles.slice(0, 5)));
    console.log(' images cassées :', r.imagesCassees.filter(Boolean).slice(0, 4));
    console.log(' ids en double :', r.ids);
    console.log(' liens vides :', r.liensVides.slice(0, 4));
    console.log(' suspects :', r.suspects);
    console.log(' bandeau :', JSON.stringify(r.bandeau));
    console.log(' console :', r.erreurs);
  }
})().catch((e) => { console.error('ECHEC', e.message); process.exit(1); });
