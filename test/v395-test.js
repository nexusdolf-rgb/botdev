// v395 — Panneau vocal : la légende se range en colonnes, et une phrase s'en va.
//
// Deux demandes du fondateur, capture du 13/11 à l'appui :
//   • « ils sont mal organisés, organise comme il faut les lignes » — la
//     légende dessinée avait des colonnes de largeurs libres (rangées de
//     819 / 1 122 / 637 px sur 1 200) : aucun mot ne tombait sous l'axe de
//     celui de la rangée du dessus. Elle est désormais dessinée sur une
//     grille de 4 colonnes de 258 px — la même que les boutons (4/4/2) —
//     par scripts/gen-legende-vocale.py. Les dix PNG, eux, ne changent pas.
//   • « retire le texte “Chaque réponse est personnelle” » — le panneau va
//     droit à l'invitation.
//
// Vérifié ici : la légende (taille, empreinte, grille du générateur), les
// dix icônes intactes, les deux descriptions du panneau, la version de cache.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const dir = path.join(os.tmpdir(), 'v395test-' + Date.now());
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const v2 = require('./helpers/v2');
const store = require('../server/db');
const extra = require('../server/discord/extra');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f));
const assets = path.join(__dirname, '..', 'server', 'assets', 'voicetemp');

// Les dix icônes telles qu'elles sont livrées depuis v394 : la légende les
// réutilise sans les retoucher une seule fois.
const ICONES = {
  'hox_nom.png': 'd4bae56f8f611575883e5a7d3b528c41e12b18122bfa9dc2d6a8678b7d2d9eb4',
  'hox_limite.png': 'bbc27bb6501cb06aab819c65db97cec48f47b954dfd5d8600c7e6ab06e477192',
  'hox_prive.png': 'cd736a7a424979965c593631986e3d15fb2103cf63b8cefb25042701e61a27a6',
  'hox_public.png': '837275e0df8a2e483e9168f0a95c3719b2ada8b230dd083ce182b045e074f846',
  'hox_recup.png': '29c45d72f370b41436a4c3b4b41c4dc1bcbdc248b9a5dd7edb1ce6bc514e849e',
  'hox_ajouter.png': '508c441187e5668efe0dfc7fa7b53ddd42a161312db1b5d130b4a1c2a46753d8',
  'hox_retirer.png': '41b2149a6f71ca95cf363f7110d031727586d796d42dbc108a071ef52559fced',
  'hox_expulser.png': 'dc44e88a7059e8b55bcce3afa8fc627bcde4ddf0e0bf0d04ef043ab5f76f4b89',
  'hox_transfer.png': '54a5c1b5cbd67cf0f7aad5005449f3ec446b44d79d467356872e719d6434a1f5',
  'hox_suppr.png': '548d2a4b4a9313646ffe5858e31d71bb55038c5d5db25e5bea25dfe0624c0c14',
};

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

console.log('\n— 1. La légende : une grille, pas des colonnes libres —');
const legende = path.join(assets, 'legende-vocale.png');
check('la légende est présente', fs.existsSync(legende));
const png = lire(path.join('server', 'assets', 'voicetemp', 'legende-vocale.png'));
// IHDR : largeur et hauteur en big-endian aux octets 16 et 20.
const largeur = png.readUInt32BE(16);
const hauteur = png.readUInt32BE(20);
check('4 colonnes de 258 px (la grille des boutons)', largeur === 1032, largeur + ' px');
check('3 rangées de 88 px + marges (300 px)', hauteur === 300, hauteur + ' px');
check('l’ancienne version faisait 1 200 × 276 px', largeur !== 1200 && hauteur !== 276);
// L'empreinte fige le rendu : si l'image change, on le sait et on le relit.
check('empreinte du rendu figée', sha(png) === '6d23266101fa9cf673109e3d736994a1616639bb357441328aac143b76b9534c', sha(png));

const generateur = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'gen-legende-vocale.py'), 'utf8');
check('le générateur est versionné avec le dépôt', generateur.includes('Grille retenue'));
check('…il déclare 4 colonnes de 258 px', generateur.includes('COLONNES = 4') && generateur.includes('CELLULE = 258'));
check('…et les trois rangées 4 / 4 / 2',
  /\[\("nom", "NOM"\), \("limite", "LIMITE"\), \("prive", "PRIVÉ"\), \("public", "PUBLIC"\)\]/.test(generateur)
  && /\[\("recup", "RÉCUPÉRER"\), \("ajouter", "AJOUTER"\), \("retirer", "RETIRER"\), \("expulser", "EXPULSER"\)\]/.test(generateur)
  && /\[\("transfer", "TRANSFÉRER"\), \("suppr", "SUPPRIMER"\)\]/.test(generateur));

console.log('\n— 2. Les dix icônes n’ont pas bougé d’un octet —');
for (const [nom, attendu] of Object.entries(ICONES)) {
  const obtenu = sha(fs.readFileSync(path.join(assets, nom)));
  check(nom + ' intact', obtenu === attendu, obtenu.slice(0, 12));
}

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });

  console.log('\n— 3. Le panneau : l’invitation seule, plus de préambule —');
  const panneau = extra.buildVtPanel(botId, null);
  const txt = v2.texts(panneau).join('\n');
  check('plus de « Chaque réponse est personnelle »', !txt.includes('Chaque réponse'));
  check('plus le mot « personnelle » du tout', !/personnelle/i.test(txt));
  check('l’invitation reste, en gras', txt.includes('**Appuyez sur les boutons ci-dessous pour gérer votre salon.**'));
  check('la légende reste l’image jointe',
    JSON.stringify(panneau.components[0].toJSON()).includes('attachment://legende-vocale.png')
    && (panneau.files || []).some((f) => f.name === 'legende-vocale.png'));
  check('grille de boutons inchangée : 4 / 4 / 2',
    v2.rows(panneau).map((r) => r.components.length).join('') === '442');

  console.log('\n— 4. Repli sans image : les mots, et toujours pas de préambule —');
  const sansImage = extra.buildVtPanel(botId, null, { sansLegende: true });
  const txt2 = v2.texts(sansImage).join('\n');
  check('aucun préambule non plus', !txt2.includes('Chaque réponse') && !/personnelle/i.test(txt2));
  check('les trois lignes de mots sont là', (txt2.match(/-# /g) || []).length === 3);
  check('l’invitation ferme le panneau', txt2.includes('**Appuyez sur les boutons ci-dessous pour gérer votre salon.**'));

  console.log('\n— 5. Version de cache —');
  const index = lire('public/index.html').toString('utf8');
  const sw = lire('public/sw.js').toString('utf8');
  check('index.html : ?v=389 dix fois', (index.match(/\?v=389/g) || []).length === 10);
  check('sw.js : cache hoxera-v389', sw.includes("const CACHE = 'hoxera-v389';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v395 — ${ok} vérifications OK : légende rangée, panneau sans préambule.`);
  else { console.log(`❌ v395 — ${ko} échec(s)`); process.exitCode = 1; }
})();
