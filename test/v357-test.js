// v357 — composition simple bleu profond / texte blanc / badge casque bleu et rubis.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DATA_DIR = path.join(os.tmpdir(), `botdev-v357-${process.pid}-${Date.now()}`);
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
  console.log('— Aperçu hybride simple bleu/blanc et casque encadré —');
  const svg = banner.baseSvg('NOM DU SERVEUR');
  check('dimensions SVG exactes 544×192',
    svg.includes('width="544" height="192" viewBox="0 0 544 192"'));
  check('palette approuvée : bleu profond, rubis et texte blanc',
    svg.includes('#142A46') && svg.includes('#B62F43') && svg.includes('#F7FAFF'));
  check('panneau rubis à droite et motif discret de séparation',
    svg.includes('M421 7H539V177H367Z') && svg.includes('ruby-dots')
      && svg.includes('clip-path="url(#ruby-panel-clip)"'));
  check('badge casque bleu distinct avec ses deux contours',
    svg.includes('x="407" y="42" width="117" height="108"')
      && svg.includes('#193F67') && svg.includes('#89AFCF') && svg.includes('#4D749A'));
  check('casque blanc avec coussinets et micro rouges',
    svg.includes('id="support-headset"') && svg.includes('M434 96A30 30')
      && svg.includes('#EF4653') && svg.includes('#FFE3E5'));
  check('SUPPORT et nom du serveur sont distincts et en blanc',
    svg.includes('id="support-label"') && svg.includes('>SUPPORT</text>')
      && svg.includes('id="server-name"') && svg.includes('>NOM DU SERVEUR</text>')
      && svg.includes('fill="#F7FAFF"'));
  check('absence de nom : aucun faux Hoxera ni placeholder imprimé',
    !banner.baseSvg('').includes('HOXERA') && !banner.baseSvg('').includes('NOM DU SERVEUR')
      && !banner.baseSvg('').includes('id="server-name"'));
  check('ancien préfixe SUPPORT - retiré sans doublon',
    banner.baseSvg('Support - Exemple').includes('>EXEMPLE</text>')
      && !banner.baseSvg('Support - Exemple').includes('SUPPORT - SUPPORT'));
  check('nom du serveur échappé pour le SVG',
    banner.baseSvg('A&B <Test>').includes('A&#38;B &#60;TEST&#62;'));

  console.log('— Nom du serveur et PNG de production —');
  const guildId = '357123456789012345';
  store.guildSettings.set(1, guildId, { panel_name: 'SERVEUR MÉMORISÉ' });
  check('nom transmis dans l’URL reste prioritaire',
    routes.__testResolvePanelBannerName({ query: { n: 'NOUVEAU SERVEUR' } }, banner, guildId) === 'NOUVEAU SERVEUR');
  check('ancien nom générique Hoxera retombe sur le nom mémorisé',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, guildId) === 'SERVEUR MÉMORISÉ');
  check('sans source réelle, aucun nom de remplacement n’est imprimé',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, '357000000000000001') === '');

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
  check('PNG réel contient les aplats bleu, rubis, le badge bleu et le texte blanc',
    navyPixels > 25000 && rubyPixels > 5000 && tilePixels > 5000 && whitePixels > 500,
    `bleu=${navyPixels}, rubis=${rubyPixels}, badge=${tilePixels}, blanc=${whitePixels}`);

  const short = Number(banner.baseSvg('RP').match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  const long = Number(banner.baseSvg('W'.repeat(26)).match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  check('nom court plus grand que le nom long, qui reste lisible', short > long && long >= 12);

  const widePng = await banner.generateBanner('W'.repeat(26));
  const wide = await sharp(widePng).raw().toBuffer({ resolveWithObject: true });
  let minTitleX = wide.info.width, maxTitleX = 0;
  for (let y = 78; y < 114; y++) {
    for (let x = 30; x < 410; x++) {
      const i = (y * wide.info.width + x) * wide.info.channels;
      if (wide.data[i] > 210 && wide.data[i + 1] > 215 && wide.data[i + 2] > 220) {
        minTitleX = Math.min(minTitleX, x);
        maxTitleX = Math.max(maxTitleX, x);
      }
    }
  }
  check('26 lettres larges restent dans la zone de texte', minTitleX >= 35 && maxTitleX < 390,
    `pixels du titre x=${minTitleX}→${maxTitleX}`);

  const url = panels.__testPanelBannerUrl(guildId, 'NOM DU SERVEUR');
  check('URL v8 invalide le cache Discord et transmet le nom dynamique',
    url.includes(`${guildId}.png?v=8&n=`) && url.includes('NOM%20DU%20SERVEUR'));
  check('journal démarre en v357 et conserve v356',
    changelog.VERSION === 357 && changelog.VERSIONS[0].v === 357
      && changelog.VERSIONS[1].v === 356 && changelog.VERSIONS.some((entry) => entry.v === 355));

  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ v357-test.js : ${ok} vérifications OK`);
  }
}

main().catch((error) => {
  console.error('💥 Erreur fatale du test v357 :', error);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exitCode = 1;
});
