// ============================================================
// Test Hoxera v67 — Bannière STATIQUE (l'animation a été retirée)
// + nouveaux garde-fous anti-catastrophe
//  1. Bannière : PNG statique avec « SUPPORT - {NOM DU SERVEUR} »
//  2. Aucun code GIF ne subsiste (fonctions supprimées)
//  3. Route .png ET .gif → PNG (les anciens panneaux marchent)
//  4. Sauvegarde : refus si la base dépasse la limite de taille
//  5. Sécurité : install() ne plante pas + surveillance mémoire
// ============================================================
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hoxera-v67-'));

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
};

(async () => {
  const store = require('../server/db');
  const banner = require('../server/banner');
  store.settings.set('public_url', 'http://localhost:3196');
  store.guildSettings.set(1, '111222333', { panel_name: 'Carré RP' });

  // ---------- 1. Bannière statique ----------
  const png = await banner.generateBanner('Carré RP');
  check('bannière : PNG généré', !!png && png.slice(0, 4).toString('hex') === '89504e47');
  check('bannière : texte « SUPPORT - CARRÉ RP »', banner.baseSvg('Carré RP').includes('SUPPORT - CARR'));
  check('bannière : pas de doublon de préfixe', !banner.baseSvg('Support - X').includes('SUPPORT - SUPPORT'));
  check('bannière : nom stocké retrouvé', banner.storedPanelName('111222333') === 'Carré RP');

  // ---------- 1bis. URL de bannière versionnée (casse le cache de Discord) ----------
  const panels = require('../server/discord/panels');
  const url = panels.__testPanelBannerUrl ? panels.__testPanelBannerUrl('111222333', 'Carré RP') : '';
  check('URL bannière : versionnée (?v=3) pour forcer Discord à recharger', !!url && url.includes('.png?v=4') && url.includes('Carr'));

  // ---------- 1ter. Le texte tient TOUJOURS dans la bannière (aucun débordement) ----------
  const sharp = require('sharp');
  for (const nm of ['RP', 'Carré RP', 'OneState CI-ML-SN', '[ ONE | ONE ] CHEAT', 'Un Serveur Avec Un Nom Vraiment Tres Long Pour Tester La Taille Max']) {
    const p = await banner.generateBanner(nm);
    const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels, W = info.width;
    let minX = W, maxX = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * ch;
        if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
      }
    }
    check(`bannière « ${nm.slice(0, 25)} » : texte dans les marges (x ${minX}→${maxX} / ${W})`, minX >= 10 && maxX <= W - 10);
  }
  // Taille adaptative : nom court = plus grand, nom long = réduit mais lisible
  const sizeShort = Number(banner.baseSvg('RP').match(/font-size="(\d+)"/)[1]);
  const sizeLong = Number(banner.baseSvg('Un Serveur Avec Un Nom Vraiment Tres Long').match(/font-size="(\d+)"/)[1]);
  check('bannière : taille adaptée (court = plus grand)', sizeShort > sizeLong && sizeLong >= 12);

  // ---------- 2. Plus aucun code GIF ----------
  check('GIF supprimé : generateBannerGif n\'existe plus', typeof banner.generateBannerGif === 'undefined');
  check('GIF supprimé : warmupGif n\'existe plus', typeof banner.warmupGif === 'undefined');

  // ---------- 3. Routes .png et .gif → PNG statique ----------
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3196', BOTDEV_DATA_DIR: process.env.BOTDEV_DATA_DIR, BOTDEV_GH_TOKEN: '', BOTDEV_DATA_REPO: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const fetchPng = async (ext) => {
      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch(`http://localhost:3196/api/tickets/panel-banner/111222333.${ext}`);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            return { contentType: res.headers.get('content-type') || '', buf };
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    };
    const p = await fetchPng('png');
    check('route .png : PNG servi', !!p && String(p.contentType).includes('image/png') && p.buf.slice(0, 4).toString('hex') === '89504e47');
    const g = await fetchPng('gif');
    check('route .gif (anciens panneaux) : PNG servi aussi', !!g && String(g.contentType).includes('image/png'));
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }

  // ---------- 4. Sauvegarde : garde-fou de taille ----------
  process.env.BOTDEV_GH_TOKEN = 'fake-token';
  process.env.BOTDEV_DATA_REPO = 'fake/repo';
  const backup = require('../server/backup');
  const origSnapshot = backup.snapshot;
  const origGhJson = backup.ghJson;
  backup.snapshot = async () => Buffer.alloc(backup.MAX_BACKUP_BYTES + 1000, 1);
  backup.ghJson = async () => ({ sha: 'x' });
  const rBig = await backup.upload(store.db);
  backup.snapshot = origSnapshot;
  backup.ghJson = origGhJson;
  check('sauvegarde : base trop grosse → refusée (jamais re-dépasser 1 Mo)', rBig === false);

  // ---------- 5. Sécurité ----------
  const safety = require('../server/safety');
  let safetyOk = true;
  try { safety.install(); } catch (e) { safetyOk = false; }
  check('sécurité : install() sans crash (erreurs + mémoire surveillées)', safetyOk);

  store.db.close();
  console.log(failures === 0 ? '\n✅ V67 — Bannière statique propre + garde-fous renforcés : système allégé et blindé. 🎉' : `\n❌ ${failures} vérification(s) en échec`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('❌', e); process.exit(1); });
