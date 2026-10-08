// v356 — bannière support professionnelle, rouge rubis et blanc chaud.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DATA_DIR = path.join(os.tmpdir(), `botdev-v356-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;
process.env.NODE_ENV = 'test';

const store = require('../server/db');
const banner = require('../server/banner');
const panels = require('../server/discord/panels');
const routes = require('../server/routes');
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
  console.log('— Nouvelle composition blanche et rouge rubis —');
  const svg = banner.baseSvg('NOM DU SERVEUR');
  check('format exact 544×192, blanc chaud et rouge rubis',
    svg.includes('width="544" height="192" viewBox="0 0 544 192"')
      && svg.includes('#FAFAF7') && svg.includes('#B62F43'));
  check('design clair, propre et distinct de l’ancien bleu',
    svg.includes('M421 7H539V177H367Z') && svg.includes('#272D33') && !svg.includes('#14355b'));
  check('SUPPORT et nom du serveur sont bien deux textes séparés',
    svg.includes('id="support-label"') && svg.includes('>SUPPORT</text>')
      && svg.includes('id="server-name"') && svg.includes('>NOM DU SERVEUR</text>'));
  check('casque-micro blanc sobre, dans le panneau rubis',
    svg.includes('id="support-headset"') && svg.includes('M443 96A25 25')
      && svg.includes('stroke="#FFFFFF"') && svg.includes('#B62F43'));
  check('nom absent : aucun faux Hoxera ou texte de remplacement',
    !banner.baseSvg('').includes('HOXERA') && !banner.baseSvg('').includes('id="server-name"'));
  check('ancien préfixe SUPPORT - retiré sans doublon',
    banner.baseSvg('Support - Exemple').includes('>EXEMPLE</text>')
      && !banner.baseSvg('Support - Exemple').includes('SUPPORT - SUPPORT'));
  check('nom Discord est échappé avant insertion en SVG',
    banner.baseSvg('A&B <Test>').includes('A&#38;B &#60;TEST&#62;'));

  console.log('— Nom de serveur dynamique et cache Discord —');
  const guildId = '356123456789012345';
  store.guildSettings.set(1, guildId, { panel_name: 'SERVEUR MÉMORISÉ' });
  check('paramètre n avec nom réel transmis est conservé',
    routes.__testResolvePanelBannerName({ query: { n: 'NOUVEAU SERVEUR' } }, banner, guildId) === 'NOUVEAU SERVEUR');
  check('ancienne valeur générique Hoxera retombe sur le nom mémorisé',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, guildId) === 'SERVEUR MÉMORISÉ');
  check('sans aucune source de nom, la bannière reste sans faux nom',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, '356000000000000001') === '');

  console.log('— PNG réel, lisibilité, dimensionnement et cache —');
  const png = await banner.generateBanner('NOM DU SERVEUR');
  const metadata = await sharp(png).metadata();
  check('générateur réel produit un PNG 544×192',
    metadata.format === 'png' && metadata.width === 544 && metadata.height === 192);
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let rubyPixels = 0, whitePixels = 0, inkPixels = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 150 && g < 100 && b < 110) rubyPixels++;
    if (r > 230 && g > 230 && b > 225) whitePixels++;
    if (r < 100 && g < 120 && b < 130) inkPixels++;
  }
  check('rendu contient de larges aplats ruby, blanc et texte graphite',
    rubyPixels > 5000 && whitePixels > 10000 && inkPixels > 200,
    `ruby=${rubyPixels}, blanc=${whitePixels}, graphite=${inkPixels}`);

  const short = Number(banner.baseSvg('RP').match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  const long = Number(banner.baseSvg('W'.repeat(26)).match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  check('noms courts plus grands, noms très larges réduits sans descendre sous 12 px',
    short > long && long >= 12);

  const widePng = await banner.generateBanner('W'.repeat(26));
  const wide = await sharp(widePng).raw().toBuffer({ resolveWithObject: true });
  let maxTitleX = 0;
  for (let y = 80; y < 110; y++) {
    for (let x = 30; x < 410; x++) {
      const i = (y * wide.info.width + x) * wide.info.channels;
      if (wide.data[i] < 100 && wide.data[i + 1] < 120 && wide.data[i + 2] < 130) maxTitleX = Math.max(maxTitleX, x);
    }
  }
  check('26 lettres larges restent avant le panneau casque', maxTitleX > 30 && maxTitleX < 390,
    `dernier pixel graphite x=${maxTitleX}`);

  const url = panels.__testPanelBannerUrl(guildId, 'NOM DU SERVEUR');
  check('URL v7 invalide le cache et transmet le nom dynamique',
    url.includes(`${guildId}.png?v=7&n=`) && url.includes('NOM%20DU%20SERVEUR'));
  check('versions conserve v355 et démarre en v356',
    changelog.VERSION === 356 && changelog.VERSIONS[0].v === 356
      && changelog.VERSIONS[1].v === 355 && changelog.VERSIONS.some((entry) => entry.v === 354));

  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ v356-test.js : ${ok} vérifications OK`);
  }
}

main().catch((error) => {
  console.error('💥 Erreur fatale du test v356 :', error);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exitCode = 1;
});
