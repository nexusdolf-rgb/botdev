#!/usr/bin/env node
// Allègement des images du site — même dessin, moins d'octets.
//
// Pourquoi : le plan gratuit de l'hébergeur accorde 5 Go de trafic par mois.
// Six images pesaient 3,34 Mo à elles seules (dont une bannière de 1,25 Mo),
// soit l'essentiel d'un mois de visites. On les ré-encode SANS changer leur
// apparence : même cadrage, mêmes couleurs visibles à l'œil, mais taille
// d'affichage réelle et palette de 256 couleurs (un dessin, pas une photo).
//
// Usage : node scripts/allegement-images.js [--essai]
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DOSSIER = path.join(__dirname, '..', 'public', 'icons');

// nom : { largeur max, palette }
// `palette` = réduction à 256 couleurs : invisible sur un dessin aux aplats
// (l'emblème), visible sur un dégradé (les bannières, le portrait). Mesuré
// à la taille d'affichage : les bannières restent donc en couleurs pleines.
const CIBLES = {
  'support-banner': { largeur: 1200, palette: false },
  'nexora-profile-banner': { largeur: 1200, palette: false },
  'nexora-robot-mark': { largeur: 192, palette: true, couleurs: 256 },
  'icon-512': { largeur: 512, palette: true, couleurs: 256 },
  'icon-maskable-512': { largeur: 512, palette: true, couleurs: 256 },
  'optimus-photo': { largeur: 256, palette: false },
};

const essai = process.argv.includes('--essai');

(async () => {
  let avant = 0;
  let apres = 0;
  console.log('image'.padEnd(24) + 'avant'.padStart(10) + 'après'.padStart(10) + '   gain');
  for (const [nom, regle] of Object.entries(CIBLES)) {
    const fichier = path.join(DOSSIER, nom + '.png');
    if (!fs.existsSync(fichier)) { console.log(`${nom.padEnd(24)}absent — ignoré`); continue; }
    const tailleAvant = fs.statSync(fichier).size;
    const meta = await sharp(fichier).metadata();
    const largeur = Math.min(regle.largeur, meta.width);
    let tube = sharp(fichier);
    if (largeur < meta.width) tube = tube.resize({ width: largeur, kernel: 'lanczos3' });
    const options = { compressionLevel: 9, effort: 10, adaptiveFiltering: true };
    if (regle.palette) {
      options.palette = true;
      options.colours = regle.couleurs || 256;
      options.dither = 0.7;
    }
    const sortie = await tube.png(options).toBuffer();
    avant += tailleAvant;
    apres += sortie.length;
    const gain = (tailleAvant / sortie.length).toFixed(1);
    console.log(
      nom.padEnd(24)
      + `${Math.round(tailleAvant / 1024)} Ko`.padStart(10)
      + `${Math.round(sortie.length / 1024)} Ko`.padStart(10)
      + `   ${gain}× (${meta.width}→${largeur} px)`,
    );
    if (!essai) fs.writeFileSync(fichier, sortie);
  }
  console.log(`\nTotal : ${(avant / 1e6).toFixed(2)} Mo → ${(apres / 1e6).toFixed(2)} Mo`
    + ` (${(avant / apres).toFixed(1)}× plus léger)` + (essai ? '  [essai : rien écrit]' : ''));
})().catch((e) => { console.error('échec :', e.message); process.exit(1); });
