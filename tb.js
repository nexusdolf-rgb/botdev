const { chromium } = require('playwright-core');
const CHEMIN = '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
(async () => {
  const b = await chromium.launch({ executablePath: CHEMIN, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setContent('<h1>ok</h1>');
  console.log('lancement OK |', await p.textContent('h1'));
  await b.close();
})().catch(e => { console.log('ÉCHEC:', e.message.split('\n')[0]); process.exit(1); });
