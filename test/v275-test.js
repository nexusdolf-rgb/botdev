// v275 — Les émojis PREMIUM vont UNIQUEMENT au panneau vocal sur Discord.
// 1) les 10 PNG vocaux premium sont présents et valides ;
// 2) installVtEmotes REMPLACE les émojis si nos fichiers changent (et ne
//    touche à rien si rien n'a changé) ;
// 3) le panneau est rafraîchi après remplacement ;
// 4) le dashboard est revenu à ses icônes d'origine (modules non touchés) ;
// 5) bump de cache 275.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.BOTDEV_DATA_DIR = process.env.BOTDEV_DATA_DIR || path.join(require('node:os').tmpdir(), 'hoxera-v275-' + process.pid + '-' + Date.now());
fs.mkdirSync(process.env.BOTDEV_DATA_DIR, { recursive: true });

const store = require('../server/db');
const extra = require('../server/discord/extra');

let ok = 0;
function check(label, cond, extraInfo) {
  assert.ok(cond, 'ÉCHEC : ' + label + (extraInfo ? ' (' + extraInfo + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });

  console.log('— 1. Pack vocal au style du tableau de bord (10 PNG) —');
  const dir = path.join(__dirname, '..', 'server', 'assets', 'voicetemp');
  check('10 émojis vocaux présents', extra.VT_EMOTES.every((k) => fs.existsSync(path.join(dir, 'hox_' + k + '.png'))));
  check('…tous sous la limite Discord (256 Ko)', extra.VT_EMOTES.every((k) => fs.statSync(path.join(dir, 'hox_' + k + '.png')).size < 256000));
  // Le pack vocal suit le style du tableau de bord : une puce sombre #2B2D31
  // et un dessin gris #949BA4. Un dessin GRIS SANS FOND serait invisible sur
  // le thème clair de Discord (2,2:1) et sur le bouton rouge « supprimer »
  // (1,6:1) : c'est la puce qui garantit 4,9:1 sur n'importe quel bouton.
  const pixels = (f) => {
    const brut = fs.readFileSync(path.join(dir, f));
    const zlib = require('zlib');
    let pos = 8, idat = [], largeur = 0, hauteur = 0;
    while (pos < brut.length) {
      const len = brut.readUInt32BE(pos);
      const type = brut.toString('ascii', pos + 4, pos + 8);
      if (type === 'IHDR') { largeur = brut.readUInt32BE(pos + 8); hauteur = brut.readUInt32BE(pos + 12); }
      if (type === 'IDAT') idat.push(brut.subarray(pos + 8, pos + 8 + len));
      pos += 12 + len;
    }
    const flux = zlib.inflateSync(Buffer.concat(idat));
    const octetsParPixel = 4, parLigne = largeur * octetsParPixel;
    const sortie = Buffer.alloc(hauteur * parLigne);
    for (let y = 0; y < hauteur; y += 1) {
      const filtre = flux[y * (parLigne + 1)];
      const ligne = flux.subarray(y * (parLigne + 1) + 1, (y + 1) * (parLigne + 1));
      for (let x = 0; x < parLigne; x += 1) {
        const gauche = x >= octetsParPixel ? sortie[y * parLigne + x - octetsParPixel] : 0;
        const haut = y > 0 ? sortie[(y - 1) * parLigne + x] : 0;
        const hautGauche = (y > 0 && x >= octetsParPixel) ? sortie[(y - 1) * parLigne + x - octetsParPixel] : 0;
        let v = ligne[x];
        if (filtre === 1) v += gauche;
        else if (filtre === 2) v += haut;
        else if (filtre === 3) v += Math.floor((gauche + haut) / 2);
        else if (filtre === 4) {
          const p = gauche + haut - hautGauche;
          const da = Math.abs(p - gauche), db = Math.abs(p - haut), dc = Math.abs(p - hautGauche);
          v += (da <= db && da <= dc) ? gauche : (db <= dc ? haut : hautGauche);
        }
        sortie[y * parLigne + x] = v & 255;
      }
    }
    const compte = new Map();
    for (let i = 0; i < sortie.length; i += 4) {
      if (sortie[i + 3] < 200) continue;
      const cle = sortie[i] + ',' + sortie[i + 1] + ',' + sortie[i + 2];
      compte.set(cle, (compte.get(cle) || 0) + 1);
    }
    return compte;
  };
  const teintes = (k) => pixels('hox_' + k + '.png');
  check('…puce sombre #2B2D31 derrière le dessin (visibilité sur tout bouton)',
    extra.VT_EMOTES.every((k) => (teintes(k).get('43,45,49') || 0) > 8000),
    String(teintes('nom').get('43,45,49')));
  check('…dessin gris #949BA4, le gris exact du tableau de bord',
    extra.VT_EMOTES.every((k) => (teintes(k).get('148,155,164') || 0) > 500),
    String(teintes('nom').get('148,155,164')));
  check('…aucune tuile terracotta brillante ne subsiste',
    extra.VT_EMOTES.every((k) => ![...teintes(k).keys()].some((c) => {
      const [r, g, b] = c.split(',').map(Number);
      return r > 150 && g < 130 && b < 110 && (teintes(k).get(c) || 0) > 2000;
    })));

  console.log('— 2. Remplacement automatique si nos fichiers changent —');
  let seq = 0;
  const made = [];
  let deleted = 0;
  const guild = {
    id: 'gV',
    emojis: {
      cache: { get: (id) => made.find((e) => e.id === id) || null, find: (fn) => made.find(fn) || undefined },
      create: async ({ name }) => { const e = { id: String(940000000000000000n + BigInt(++seq)), name, delete: async () => { deleted++; made.splice(made.indexOf(e), 1); } }; made.push(e); return e; },
    },
  };
  const first = await extra.installVtEmotes(BOT, guild);
  check('première installation : 10 émojis créés', first.length === 10, String(first.length));
  const again = await extra.installVtEmotes(BOT, guild);
  check('…relancé sans changement : rien ne bouge (idempotent)', again.length === 0 && deleted === 0);
  store.settings.set('vt_emotes_ver:gV', 'version-obsolete');
  const upgraded = await extra.installVtEmotes(BOT, guild);
  check('…fichiers changés : les 10 anciens supprimés et recréés', upgraded.length === 10 && deleted === 10, upgraded.length + '/' + deleted);
  const map = JSON.parse(store.settings.get('vt_emotes:gV') || '{}');
  check('…nouveaux ids mémorisés pour le panneau', Object.keys(map).length === 10 && made.length === 10);

  console.log('— 3. Panneau rafraîchi après remplacement —');
  check('slash /voicetemp emotes : message « panneau mis à jour »', fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'extra.js'), 'utf8').includes('a été mis à jour avec les nouveaux émojis'));
  check('route dashboard panneau : installe nos émojis avant envoi', /installVtEmotes\(bot\.id, guild\)[\s\S]{0,200}sendVtPanel/.test(fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8')));

  console.log('— 4. Modules du dashboard NON touchés —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'dashboard.css'), 'utf8');
  check('dashboard.js sans nos PNG de modules', !dash.includes('moduleIcon') && !dash.includes('HOX_EMOTES') && !dash.includes('/emotes/hox_'));
  check('dashboard.css sans .hox-ico', !css.includes('.hox-ico'));
  check('signatures réservées à /emotes (Discord)', typeof extra.installHoxEmotes === 'function' && typeof extra.hoxEmotesPanel === 'function');

  console.log('— 5. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=383 référencé 7 fois', (index.match(/\?v=383/g) || []).length === 7);
  check('sw.js : cache « botdev-v350 »', sw.includes("const CACHE = 'botdev-v383';"));

  console.log(`\n🎉 v275 — ${ok} vérifications OK : premium UNIQUEMENT sur les émojis vocaux, modules intacts.`);
})().catch((e) => { console.error(e); process.exit(1); });
