const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 360, height: 780 } });
  await p.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' }).catch(()=>{});
  const r = await p.evaluate(() => {
    document.body.innerHTML = '<div class="dashboard-shell-host"><div class="dash-content" id="audit"></div></div>';
    const c = document.querySelector('#audit');
    // Trois cas : débordement réel, débordement dans un conteneur scrollable
    // (volontaire, ex. tableau), et élément normal.
    c.innerHTML = `
      <div id="cas1" style="width:600px">déborde vraiment</div>
      <div style="overflow-x:auto"><div id="cas2" style="width:600px">dans un scrollable</div></div>
      <div id="cas3">normal</div>`;
    const conteneur = c.getBoundingClientRect();
    const trouves = [];
    c.querySelectorAll('*').forEach((el) => {
      const bb = el.getBoundingClientRect();
      if (bb.width === 0 && bb.height === 0) return;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      let q = el.parentElement, scrollable = false;
      while (q && q !== c) { const ps = getComputedStyle(q); if (/auto|scroll/.test(ps.overflowX)) { scrollable = true; break; } q = q.parentElement; }
      if (scrollable) return;
      if (bb.right > conteneur.right + 1.5) trouves.push(el.id || el.tagName);
    });
    return { trouves, largeurDoc: document.documentElement.scrollWidth };
  });
  console.log('  éléments détectés :', JSON.stringify(r.trouves));
  console.log('  scrollWidth       :', r.largeurDoc, '(viewport 360)');
  console.log('  → cas1 détecté    :', r.trouves.includes('cas1') ? '✅' : '❌ LE DÉTECTEUR NE FONCTIONNE PAS');
  console.log('  → cas2 ignoré     :', !r.trouves.includes('cas2') ? '✅ (scrollable volontaire)' : '❌');
  console.log('  → cas3 ignoré     :', !r.trouves.includes('cas3') ? '✅' : '❌');
  await b.close();
})();
