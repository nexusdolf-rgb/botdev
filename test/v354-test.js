// v354 — non-régression de la bannière dynamique et du cache Discord.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DATA_DIR = path.join(os.tmpdir(), `botdev-v354-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const banner = require('../server/banner');
const panels = require('../server/discord/panels');
const changelog = require('../server/discord/changelog');
const sharp = require('sharp');

let ok = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) {
    ok++;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  console.log('— Composition approuvée et nom de serveur dynamique —');
  const svg = banner.baseSvg('Carré RP Officiel');
  check('format SVG 544×192', svg.includes('width="544" height="192" viewBox="0 0 544 192"'));
  check('étiquette SUPPORT séparée du nom du serveur', svg.includes('>SUPPORT</text>') && svg.includes('>CARRÉ RP OFFICIEL</text>'));
  check('nom rendu en graphite sur le fond blanc chaud',
    svg.includes('id="server-name"') && svg.includes('fill="#272D33"') && svg.includes('#FAFAF7'));
  check('casque-micro fin présent dans le panneau rubis',
    svg.includes('id="support-headset"') && svg.includes('M443 96A25 25') && svg.includes('#B62F43'));
  check('ancienne trame glitch RGB retirée', !/glitch|glowPink|#39ff6a|#1aff4d/.test(svg));
  check('nom de serveur encodé contre les caractères XML',
    banner.baseSvg('A&B <Test>').includes('A&#38;B &#60;TEST&#62;'));
  const legacyPrefix = banner.baseSvg('Support - Exemple');
  check('ancien préfixe SUPPORT - accepté sans doublon',
    legacyPrefix.includes('>EXEMPLE</text>') && !legacyPrefix.includes('SUPPORT - SUPPORT'));

  const small = Number(banner.baseSvg('RP').match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  const long = Number(banner.baseSvg('Un Serveur Avec Un Nom Vraiment Tres Long').match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  const wide = Number(banner.baseSvg('W'.repeat(26)).match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  check('taille adaptative : nom court plus grand que nom long', small > long && long >= 12);
  check('nom extrême composé de lettres larges réduit pour rester dans sa zone', wide >= 12 && wide < small);

  console.log('— Rendu PNG réel, URL cache Discord et version —');
  const png = await banner.generateBanner('Carré RP Officiel');
  const metadata = await sharp(png).metadata();
  check('génération PNG réussie en 544×192', !!png && metadata.format === 'png' && metadata.width === 544 && metadata.height === 192);

  const widePng = await banner.generateBanner('W'.repeat(26));
  const { data, info } = await sharp(widePng).raw().toBuffer({ resolveWithObject: true });
  let maxTitleX = 0;
  for (let y = 80; y < 110; y++) {
    for (let x = 30; x < 414; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] < 100 && data[i + 1] < 120 && data[i + 2] < 130) maxTitleX = Math.max(maxTitleX, x);
    }
  }
  check('même 26 lettres très larges ne touchent pas le panneau casque', maxTitleX > 30 && maxTitleX < 390, `dernier pixel du titre x=${maxTitleX}`);

  const url = panels.__testPanelBannerUrl('354123', 'Carré RP Officiel');
  check('URL de bannière versionnée pour recharger le nouveau visuel',
    url.includes('/api/tickets/panel-banner/354123.png?v=7') && url.includes('Carr'));
  check('journal conserve v354 sous la version courante v356',
    changelog.VERSION === 356 && changelog.VERSIONS[0].v === 356 && changelog.VERSIONS[1].v === 355);

  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ v354-test.js : ${ok} vérifications OK`);
  }
}

main().catch((error) => {
  console.error('💥 Erreur fatale du test v354 :', error);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exitCode = 1;
});
