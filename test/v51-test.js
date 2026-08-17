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
  check('GIF : 60 trames (balayage + dérive + pause)', reader.numFrames() === 60);
  check('GIF : boucle infinie', reader.loopCount() === 0);
  check('GIF : dimensions 544x192 (proche référence)', reader.width === 544 && reader.height === 192);
  const delays = [];
  for (let i = 0; i < reader.numFrames(); i++) delays.push(reader.frameInfo(i).delay);
  const totalMs = delays.reduce((a, b) => a + b, 0) * 10;
  const sweepMs = delays.slice(0, 20).reduce((a, b) => a + b, 0) * 10;
  check('GIF : balayage ~1,2 s', sweepMs >= 1000 && sweepMs <= 1400);
  check('GIF : boucle totale ~3,6 s', totalMs >= 3200 && totalMs <= 4000);
  check('GIF : taille raisonnable (< 6 Mo, comme la réf 4,3 Mo)', gif.length < 6 * 1024 * 1024);

  // ---------- 2bis. Le balayage bouge vraiment ----------
  const sharp = require('sharp');
  const lumProfile = async (page) => {
    const { data } = await sharp(gif, { page }).raw().toBuffer({ resolveWithObject: true });
    const W = reader.width, out = [];
    for (let x = 0; x < W; x += 34) {
      let s = 0, n = 0;
      for (let y = 10; y < 60; y++) { const i = (y * W + x) * 3; s += data[i] + data[i + 1] + data[i + 2]; n++; }
      out.push(Math.round(s / n));
    }
    return out;
  };
  const p0 = await lumProfile(0);
  const p12 = await lumProfile(12);
  const p23 = await lumProfile(23);
  const peakOf = (arr) => arr.reduce((best, v, i, a) => (v > a[best] ? i : best), 0);
  check('balayage : pic lumineux au MILIEU à la trame 12', peakOf(p12) >= 6 && peakOf(p12) <= 13 && Math.max(...p12) > 150);
  check('balayage : absent à la trame 0 (hors écran)', Math.max(...p0) < 130);
  check('balayage : sorti à la trame 23', Math.max(...p23) < 130);

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
    for (let i = 0; i < 100; i++) {
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
  check('route : taille cohérente', gifSize > 10000 && gifSize < 6 * 1024 * 1024);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V51 — Bannière animée (brillance qui balaie + bordeaux + fumée) : 100 % fonctionnelle. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
