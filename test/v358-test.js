// v358 — texte agrandi, nom blanc vif avec halo bleu discret.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DATA_DIR = path.join(os.tmpdir(), `botdev-v358-${process.pid}-${Date.now()}`);
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
  console.log('— Texte SUPPORT agrandi et nom lumineux —');
  const svg = banner.baseSvg('NOM DU SERVEUR');
  check('dimensions SVG exactes 544×192',
    svg.includes('width="544" height="192" viewBox="0 0 544 192"'));
  check('palette bleu profond, rubis et texte blanc vif',
    svg.includes('#142A46') && svg.includes('#B62F43') && svg.includes('#FFFFFF'));
  check('SUPPORT est agrandi à 14 px et reste blanc',
    svg.includes('id="support-label"') && svg.includes('font-size="14"')
      && svg.includes('fill="#FFFFFF">SUPPORT</text>'));
  check('nom d’exemple agrandi à 29 px, blanc et sans texte codé en dur',
    svg.includes('id="server-name"') && svg.includes('font-size="29"')
      && svg.includes('fill="#FFFFFF" filter="url(#server-name-glow)">NOM DU SERVEUR</text>'));
  check('halo bleu du nom subtil et limité au texte',
    svg.includes('id="server-name-glow"') && svg.includes('stdDeviation="2.5"')
      && svg.includes('flood-color="#A8D3FF"') && svg.includes('flood-opacity=".18"'));
  check('badge casque bleu, contours clairs et panneau rubis conservés',
    svg.includes('M421 7H539V177H367Z') && svg.includes('#193F67')
      && svg.includes('#89AFCF') && svg.includes('#4D749A'));
  check('casque blanc avec coussinets et micro rouges',
    svg.includes('id="support-headset"') && svg.includes('M434 96A30 30')
      && svg.includes('#EF4653') && svg.includes('#FFE3E5'));
  check('absence de nom : aucun faux Hoxera ni placeholder imprimé',
    !banner.baseSvg('').includes('HOXERA') && !banner.baseSvg('').includes('NOM DU SERVEUR')
      && !banner.baseSvg('').includes('id="server-name"'));
  check('ancien préfixe SUPPORT - retiré sans doublon',
    banner.baseSvg('Support - Exemple').includes('>EXEMPLE</text>')
      && !banner.baseSvg('Support - Exemple').includes('SUPPORT - SUPPORT'));
  check('nom du serveur échappé pour le SVG',
    banner.baseSvg('A&B <Test>').includes('A&#38;B &#60;TEST&#62;'));

  console.log('— Nom dynamique, auto-ajustement et PNG réel —');
  const guildId = '358123456789012345';
  store.guildSettings.set(1, guildId, { panel_name: 'SERVEUR MÉMORISÉ' });
  check('nom transmis dans l’URL reste prioritaire',
    routes.__testResolvePanelBannerName({ query: { n: 'NOUVEAU SERVEUR' } }, banner, guildId) === 'NOUVEAU SERVEUR');
  check('ancien Hoxera générique retombe sur le nom mémorisé',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, guildId) === 'SERVEUR MÉMORISÉ');
  check('sans source réelle, aucun nom de remplacement n’est imprimé',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, '358000000000000001') === '');

  const png = await banner.generateBanner('NOM DU SERVEUR');
  const meta = await sharp(png).metadata();
  check('générateur réel produit un PNG 544×192',
    meta.format === 'png' && meta.width === 544 && meta.height === 192);
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let navyPixels = 0, rubyPixels = 0, tilePixels = 0, whitePixels = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r < 50 && g < 70 && b < 100) navyPixels++;
    if (r > 150 && g < 100 && b < 110) rubyPixels++;
    if (r < 50 && g > 40 && g < 90 && b > 80) tilePixels++;
    if (r > 230 && g > 230 && b > 230) whitePixels++;
  }
  check('PNG contient les aplats bleu, rubis, le badge et les textes blancs',
    navyPixels > 25000 && rubyPixels > 5000 && tilePixels > 5000 && whitePixels > 700,
    `bleu=${navyPixels}, rubis=${rubyPixels}, badge=${tilePixels}, blanc=${whitePixels}`);

  const short = Number(banner.baseSvg('RP').match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  const medium = Number(banner.baseSvg('NOM DU SERVEUR').match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  const long = Number(banner.baseSvg('W'.repeat(26)).match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  check('noms courts et moyens gagnent en taille, les longs restent adaptatifs',
    short === 29 && medium === 29 && long >= 12 && long < medium);

  const widePng = await banner.generateBanner('W'.repeat(26));
  const wide = await sharp(widePng).raw().toBuffer({ resolveWithObject: true });
  let minTitleX = wide.info.width, maxTitleX = 0;
  for (let y = 78; y < 116; y++) {
    for (let x = 30; x < 410; x++) {
      const i = (y * wide.info.width + x) * wide.info.channels;
      if (wide.data[i] > 210 && wide.data[i + 1] > 215 && wide.data[i + 2] > 220) {
        minTitleX = Math.min(minTitleX, x);
        maxTitleX = Math.max(maxTitleX, x);
      }
    }
  }
  check('nom de 26 caractères reste dans sa zone malgré la taille augmentée',
    minTitleX >= 35 && maxTitleX < 390, `pixels du nom x=${minTitleX}→${maxTitleX}`);

  const url = panels.__testPanelBannerUrl(guildId, 'NOM DU SERVEUR');
  check('URL v9 invalide le cache Discord et transmet le nom dynamique',
    url.includes(`${guildId}.png?v=9&n=`) && url.includes('NOM%20DU%20SERVEUR'));
  check('journal démarre en v359 et conserve v358',
    changelog.VERSION === 360 && changelog.VERSIONS[0].v === 360
      && changelog.VERSIONS[1].v === 359 && changelog.VERSIONS.some((entry) => entry.v === 356));

  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ v358-test.js : ${ok} vérifications OK`);
  }
}

main().catch((error) => {
  console.error('💥 Erreur fatale du test v358 :', error);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exitCode = 1;
});
