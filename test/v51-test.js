// ============================================================
// Test Hoxera v51 — Bannière des tickets ANIMÉE (balayage de lumière)
//  1. GIF généré par serveur : signature, trames, boucle infinie
//  2. Rythme : balayage fluide (~2 s) + pause (~3 s) avant le rebouclage
//  3. PNG statique en repli (toujours fonctionnel)
//  4. Cache mémoire (même nom → même buffer)
//  5. Route HTTP : Content-Type image/gif + GIF valide
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v51-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const banner = require('../server/banner');
  const { GifReader } = require('omggif');
  store.settings.set('public_url', 'http://localhost:3198');
  store.guildSettings.set(1, '111222333', { panel_name: 'Serveur Animé' });

  // ---------- 1 & 2. GIF : structure et rythme ----------
  const gif = await banner.generateBannerGif('Serveur Animé');
  check('GIF : généré', !!gif && gif.length > 10000);
  check('GIF : signature GIF89a', gif.slice(0, 6).toString() === 'GIF89a');
  const reader = new GifReader(gif);
  check('GIF : 26 trames (24 balayage + 2 pause)', reader.numFrames() === 26);
  check('GIF : boucle infinie', reader.loopCount() === 0);
  const delays = [];
  for (let i = 0; i < reader.numFrames(); i++) delays.push(reader.frameInfo(i).delay);
  const sweepMs = delays.slice(0, 24).reduce((a, b) => a + b, 0) * 10;
  const holdMs = delays.slice(24).reduce((a, b) => a + b, 0) * 10;
  check('GIF : balayage fluide (~1,5 à 2,5 s)', sweepMs >= 1500 && sweepMs <= 2500);
  check('GIF : pause (~2,5 à 3,5 s) avant rebouclage', holdMs >= 2500 && holdMs <= 3500);
  check('GIF : taille raisonnable (< 3 Mo)', gif.length < 3 * 1024 * 1024);

  // ---------- 3. PNG statique en repli ----------
  const png = await banner.generateBanner('Serveur Animé');
  check('PNG repli : généré', !!png && png.slice(0, 4).toString('hex') === '89504e47');

  // ---------- 4. Cache ----------
  const gif2 = await banner.generateBannerGif('Serveur Animé');
  check('GIF : cache (même buffer)', gif2 === gif);

  // ---------- 5. Route HTTP ----------
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3198', BOTDEV_DATA_DIR: process.env.BOTDEV_DATA_DIR, BOTDEV_GH_TOKEN: '', BOTDEV_DATA_REPO: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let routeOk = false, contentType = '', gifSize = 0, gifSignature = '';
  try {
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch('http://localhost:3198/api/tickets/panel-banner/111222333.gif');
        if (res.ok) {
          contentType = res.headers.get('content-type') || '';
          const buf = Buffer.from(await res.arrayBuffer());
          gifSize = buf.length;
          gifSignature = buf.slice(0, 6).toString();
          routeOk = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }
  check('route : répond 200 avec un GIF', routeOk);
  check('route : Content-Type image/gif', String(contentType).includes('image/gif'));
  check('route : GIF valide (signature)', gifSignature === 'GIF89a');
  check('route : taille cohérente', gifSize > 10000 && gifSize < 3 * 1024 * 1024);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V51 — Bannière animée (brillance qui balaie + bordeaux + fumée) : 100 % fonctionnelle. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
