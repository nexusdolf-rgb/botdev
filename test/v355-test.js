// v355 — non-régression du nom Discord réel et du cache de bannière.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const DATA_DIR = path.join(os.tmpdir(), `botdev-v355-${process.pid}-${Date.now()}`);
fs.rmSync(DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;
process.env.NODE_ENV = 'test';

const store = require('../server/db');
const banner = require('../server/banner');
const panels = require('../server/discord/panels');
const routes = require('../server/routes');
const botManager = require('../server/discord/botManager');
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
  console.log('— Bannière simple bleu profond, blanc et rubis —');
  const svg = banner.baseSvg('CARRÉ RP OFFICIEL');
  check('image 544×192, bleu profond, texte blanc et rouge rubis',
    svg.includes('width="544" height="192"')
      && svg.includes('#142A46') && svg.includes('#B62F43') && svg.includes('#F7FAFF'));
  check('SUPPORT et nom du serveur restent distincts',
    svg.includes('>SUPPORT</text>') && svg.includes('>CARRÉ RP OFFICIEL</text>'));
  check('casque-micro dans un badge bleu, avec accents rouges et lignes blanches',
    svg.includes('id="support-headset"') && svg.includes('#193F67')
      && svg.includes('#89AFCF') && svg.includes('fill="#EF4653"') && svg.includes('#F7FAFF'));
  check('nom absent : aucun faux « HOXERA » n’est imprimé',
    !banner.baseSvg('').includes('HOXERA') && !banner.baseSvg('').includes('id="server-name"'));
  check('nom de serveur échappé pour le SVG',
    banner.baseSvg('A&B <Test>').includes('A&#38;B &#60;TEST&#62;'));

  console.log('— Résolution du nom du serveur —');
  const guildId = '355123456789012345';
  store.guildSettings.set(1, guildId, { panel_name: 'CARRÉ RP OFFICIEL' });
  check('ancienne URL avec n=Hoxera reprend le vrai nom mémorisé',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, guildId) === 'CARRÉ RP OFFICIEL');
  check('nom actuel fourni par le panneau est prioritaire sur une valeur stockée ancienne',
    routes.__testResolvePanelBannerName({ query: { n: 'NOUVEAU NOM' } }, banner, guildId) === 'NOUVEAU NOM');
  check('le constructeur ne remplace pas Hoxera par le nom du serveur en base',
    panels.__testPanelBannerServerName('Hoxera', { guilds: { cache: new Map() } }, guildId) === 'CARRÉ RP OFFICIEL');
  check('sans nom fourni, enregistré ou en cache : ne renvoie pas le faux Hoxera',
    routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, '355000000000000001') === '');

  const cacheKey = 'v355-name-test';
  const oldEntry = botManager.clients.get(cacheKey);
  botManager.clients.set(cacheKey, {
    client: { guilds: { cache: new Map([[guildId, { name: 'NOM DISCORD EN DIRECT' }]]) } },
  });
  try {
    check('le nom Discord en cache est la source la plus récente',
      routes.__testResolvePanelBannerName({ query: { n: 'Hoxera' } }, banner, guildId) === 'NOM DISCORD EN DIRECT');
    check('le constructeur de panneau privilégie le nom Discord en direct',
      panels.__testPanelBannerServerName('Hoxera', botManager.clients.get(cacheKey).client, guildId) === 'NOM DISCORD EN DIRECT');
  } finally {
    botManager.clients.delete(cacheKey);
    if (oldEntry) botManager.clients.set(cacheKey, oldEntry);
  }

  console.log('— PNG produit, auto-ajustement et cache Discord —');
  const png = await banner.generateBanner('CARRÉ RP OFFICIEL');
  const meta = await sharp(png).metadata();
  check('vrai PNG de production généré en 544×192', meta.format === 'png' && meta.width === 544 && meta.height === 192);
  const raw = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let redPixels = 0, whitePixels = 0;
  for (let i = 0; i < raw.data.length; i += raw.info.channels) {
    const r = raw.data[i], g = raw.data[i + 1], b = raw.data[i + 2];
    if (r > 150 && g < 100 && b < 110) redPixels++;
    if (r > 230 && g > 230 && b > 235) whitePixels++;
  }
  check('rendu réel contient des accents rouges et du texte blanc', redPixels > 100 && whitePixels > 500,
    `pixels rouges=${redPixels}, blancs=${whitePixels}`);
  const short = Number(banner.baseSvg('RP').match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  const long = Number(banner.baseSvg('W'.repeat(26)).match(/id="server-name"[^>]*font-size="(\d+)"/)[1]);
  check('long nom large réduit automatiquement pour ne pas toucher le casque', short > long && long >= 12);

  const url = panels.__testPanelBannerUrl(guildId, 'CARRÉ RP OFFICIEL');
  check('URL v8 force Discord à récupérer la nouvelle palette et transmet le nom',
    url.includes(`${guildId}.png?v=8&n=`) && url.includes('CARR'));
  check('journal conserve v355 sous la version courante v357',
    changelog.VERSION === 357 && changelog.VERSIONS[0].v === 357 && changelog.VERSIONS[1].v === 356);

  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  console.log(`\nRésultat : ${ok} ✅ / ${failures.length} ❌ sur ${ok + failures.length} vérifications`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  ❌ ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ v355-test.js : ${ok} vérifications OK`);
  }
}

main().catch((error) => {
  console.error('💥 Erreur fatale du test v355 :', error);
  try { store.db.close(); } catch {}
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  process.exitCode = 1;
});
