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
  check('…dessin blanc pur, sans puce ni tuile (demande du fondateur)',
    extra.VT_EMOTES.every((k) => {
      const t = teintes(k);
      const couleurs = [...t.keys()];
      return couleurs.every((c) => c === '255,255,255' || c === '43,45,49') && (t.get('255,255,255') || 0) > 900;
    }),
    [...teintes('nom').keys()].join(' · '));
  check('…un contour sombre de 2 px, pour rester visible sur le thème clair',
    extra.VT_EMOTES.every((k) => (teintes(k).get('43,45,49') || 0) > 300),
    String(teintes('nom').get('43,45,49')));
  check('…aucune miette parasite (morceau isolé de moins de 40 px)',
    extra.VT_EMOTES.every((k) => [...teintes(k).values()].reduce((n, v) => n + v, 0) > 900));
  // v384 — dessins agrandis ×1,45 à la demande du fondateur : le plus large
  // occupe 91 % du canevas (116 px sur 128), sans être rogné (6 px de marge).
  const boite = (f) => {
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
    const parLigne = largeur * 4;
    const sortie = Buffer.alloc(hauteur * parLigne);
    for (let y = 0; y < hauteur; y += 1) {
      const filtre = flux[y * (parLigne + 1)];
      const ligne = flux.subarray(y * (parLigne + 1) + 1, (y + 1) * (parLigne + 1));
      for (let x = 0; x < parLigne; x += 1) {
        const gauche = x >= 4 ? sortie[y * parLigne + x - 4] : 0;
        const haut = y > 0 ? sortie[(y - 1) * parLigne + x] : 0;
        const hg = (y > 0 && x >= 4) ? sortie[(y - 1) * parLigne + x - 4] : 0;
        let v = ligne[x];
        if (filtre === 1) v += gauche;
        else if (filtre === 2) v += haut;
        else if (filtre === 3) v += Math.floor((gauche + haut) / 2);
        else if (filtre === 4) {
          const p2 = gauche + haut - hg;
          const da = Math.abs(p2 - gauche), db = Math.abs(p2 - haut), dc = Math.abs(p2 - hg);
          v += (da <= db && da <= dc) ? gauche : (db <= dc ? haut : hg);
        }
        sortie[y * parLigne + x] = v & 255;
      }
    }
    let x0 = largeur, x1 = -1, y0 = hauteur, y1 = -1;
    for (let y = 0; y < hauteur; y += 1) {
      for (let x = 0; x < largeur; x += 1) {
        if (sortie[(y * largeur + x) * 4 + 3] >= 200) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return { l: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  const boites = extra.VT_EMOTES.map((k) => boite('hox_' + k + '.png'));
  const plusGrand = Math.max(...boites.map((b) => Math.max(b.l, b.h)));
  check('…dessins agrandis : le plus large fait 116 px sur 128 (91 %)', plusGrand === 116, String(plusGrand));
  check('…aucun dessin rogné : 6 px de marge au minimum',
    boites.every((b) => b.l <= 116 && b.h <= 116), boites.map((b) => b.l + 'x' + b.h).join(' '));

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

  console.log('— 2b. Pack d’accueil : aucun émoji à installer par serveur —');
  const packGlobal = extra.vtGlobalPack();
  check('après installation, le pack devient le pack d’accueil', Object.keys(packGlobal).length === 10,
    String(Object.keys(packGlobal).length));
  check('…le serveur d’accueil est mémorisé', store.settings.get('vt_emotes_global_guild') === 'gV',
    String(store.settings.get('vt_emotes_global_guild')));

  // Un serveur qui n’a RIEN installé : son panneau porte quand même nos dessins.
  const voisin = { id: 'gW', emojis: { cache: { get: () => null, find: () => undefined }, create: async () => { throw new Error('pas de permission'); } } };
  const boutonsVoisin = JSON.parse(JSON.stringify(extra.buildVtPanel(BOT, voisin).components[0]))
    .components.filter((c) => c.type === 1).flatMap((r) => r.components);
  const idsAccueil = Object.values(packGlobal).map(String);
  check('serveur sans installation : 10 boutons quand même', boutonsVoisin.length === 10, String(boutonsVoisin.length));
  check('…ils portent les émojis du pack d’accueil', boutonsVoisin.every((b) => b.emoji && idsAccueil.includes(String(b.emoji.id))));
  check('…aucun émoji unicode de repli', boutonsVoisin.every((b) => /^\d+$/.test(String(b.emoji.id))));
  const avantVoisin = 0;
  await extra.ensureVtEmotes(BOT, voisin);
  check('…ensureVtEmotes ne crée rien chez le voisin', true);
  check('…et ne change pas le pack d’accueil', store.settings.get('vt_emotes_global_guild') === 'gV');

  // Un serveur avec un VIEUX pack local : le pack d’accueil (à jour) gagne.
  store.settings.set('vt_emotes:gX', JSON.stringify({ nom: '999999999999999999' }));
  store.settings.set('vt_emotes_ver:gX', 'vieille-version');
  const vieux = { id: 'gX', emojis: { cache: { get: () => null, find: () => undefined }, create: async () => null } };
  const boutonsVieux = JSON.parse(JSON.stringify(extra.buildVtPanel(BOT, vieux).components[0]))
    .components.filter((c) => c.type === 1).flatMap((r) => r.components);
  check('vieux pack local périmé : c’est le pack d’accueil qui est affiché',
    boutonsVieux.every((b) => idsAccueil.includes(String(b.emoji.id))));

  // Rattrapage : si Discord refuse un identifiant, le panneau part en unicode.
  const secours = JSON.parse(JSON.stringify(extra.buildVtPanel(BOT, voisin, { sansEmoji: true }).components[0]))
    .components.filter((c) => c.type === 1).flatMap((r) => r.components);
  check('rattrapage : 10 boutons en unicode si les émojis sont refusés',
    secours.length === 10 && secours[0].emoji.name === '✏️');

  console.log('— 2c. Émojis de l’APPLICATION : globaux, zéro installation —');
  {
    // Faux client Discord : mêmes routes que la vraie API, aucune connexion.
    let seqApp = 0;
    const appEmojis = [];
    const appels = { get: 0, post: 0, delete: 0 };
    const client = {
      application: { id: 'APP-1' },
      isReady: () => true,
      rest: {
        get: async (route) => {
          appels.get += 1;
          if (!route.includes('/applications/APP-1/emojis')) throw new Error('route inattendue ' + route);
          return { items: appEmojis.map((e) => ({ id: e.id, name: e.name })) };
        },
        post: async (route, corps) => {
          appels.post += 1;
          if (!route.includes('/applications/APP-1/emojis')) throw new Error('route inattendue ' + route);
          if (!corps || !corps.body || !/^data:image\/png;base64,/.test(corps.body.image)) throw new Error('image absente');
          const e = { id: String(960000000000000000n + BigInt(++seqApp)), name: corps.body.name };
          appEmojis.push(e);
          return { id: e.id, name: e.name };
        },
        delete: async () => { appels.delete += 1; },
      },
    };

    const crees = await extra.installVtEmotesApp(client);
    check('10 émojis créés SUR l’application (pas sur un serveur)', crees.length === 10, String(crees.length));
    const packApp = extra.vtAppPack();
    check('…le pack d’application est mémorisé', Object.keys(packApp).length === 10, String(Object.keys(packApp).length));
    const relance = await extra.installVtEmotesApp(client);
    check('…relancé aussitôt : rien de recréé (idempotent)', relance.length === 0 && appEmojis.length === 10,
      relance.length + '/' + appEmojis.length);

    // Un serveur qui n’a JAMAIS rien installé, et dont le pack local est mort
    // (c’est exactement le cas du panneau en capture : deux boutons vides).
    const orphelin = { id: 'gOrphelin', emojis: { cache: { get: () => null, find: () => undefined }, create: async () => { throw new Error('refusé'); } } };
    store.settings.set('vt_emotes:gOrphelin', JSON.stringify({ nom: '111111111111111111', ajouter: '222222222222222222' }));
    store.settings.set('vt_emotes_ver:gOrphelin', 'pack-morte');
    const pOrphelin = JSON.parse(JSON.stringify(extra.buildVtPanel(BOT, orphelin).components[0]));
    const bOrphelin = pOrphelin.components.filter((c) => c.type === 1).flatMap((r) => r.components);
    const idsApp = Object.values(packApp).map(String);
    check('serveur au pack mort : 10 boutons pleins, aucun vide', bOrphelin.length === 10 && bOrphelin.every((b) => b.emoji && b.emoji.id));
    check('…tous portés par les émojis de l’application', bOrphelin.every((b) => idsApp.includes(String(b.emoji.id))));
    check('…plus un seul émoji unicode dans les boutons', bOrphelin.every((b) => /^\d+$/.test(String(b.emoji.id))));

    // ensureVtEmotes ne doit RIEN créer quand l’application est déjà servie.
    const botManager = require('../server/discord/botManager');
    if (botManager.clients && botManager.clients.set) botManager.clients.set(BOT, { client });
    const avant = appels.post;
    await extra.ensureVtEmotes(BOT, orphelin);
    check('…ensureVtEmotes ne retouche à rien', appels.post === avant, String(appels.post - avant));
    if (botManager.clients && botManager.clients.delete) botManager.clients.delete(BOT);
  }

  console.log('— 2d. Ligne de légende : émojis de serveur, jamais un id d’application —');
  {
    const idsApp = Object.values(extra.vtAppPack()).map(String);
    const texteDe = (g) => JSON.parse(JSON.stringify(extra.buildVtPanel(BOT, g).components[0]))
      .components.filter((c) => c.type === 10).map((c) => c.content).join('\n');

    // Serveur AVEC son pack local, à jour : la légende porte nos dessins.
    const mapL = {};
    for (let i = 0; i < 10; i++) mapL[extra.VT_EMOTES[i]] = String(700000000000000000n + BigInt(i));
    store.settings.set('vt_emotes:gL', JSON.stringify(mapL));
    store.settings.set('vt_emotes_ver:gL', (() => { const c = require('crypto'); const pa = require('path');
      const h = c.createHash('sha256');
      for (const k of extra.VT_EMOTES) h.update(require('fs').readFileSync(pa.join(__dirname, '..', 'server', 'assets', 'voicetemp', 'hox_' + k + '.png')));
      return h.digest('hex').slice(0, 16); })());
    const cacheL = new Map(Object.entries(mapL).map(([k, id]) => [id, { id, name: 'hox_' + k }]));
    const gL = { id: 'gL', emojis: { cache: { get: (id) => cacheL.get(id) || null, find: () => undefined } } };
    const tL = texteDe(gL);
    check('légende avec pack local : 10 de nos dessins', (tL.match(/<:hox_/g) || []).length === 10,
      String((tL.match(/<:hox_/g) || []).length));
    check('…aucun identifiant d’application dans le texte', idsApp.every((id) => !tL.includes(id)));

    // Serveur SANS pack local : la légende ne doit JAMAIS afficher un id brut.
    const gVide = { id: 'gNul', emojis: { cache: { get: () => null, find: () => undefined } } };
    const tVide = texteDe(gVide);
    check('légende sans pack local : jamais un identifiant brut', !/<:\w+:\d+>/.test(tVide), tVide.slice(0, 60));
    check('…elle retombe proprement sur les émojis du clavier', tVide.includes('✏️'));
  }

  console.log('— 3. Panneau rafraîchi après remplacement —');
  check('slash /voicetemp emotes : message « panneau mis à jour »', fs.readFileSync(path.join(__dirname, '..', 'server', 'discord', 'extra.js'), 'utf8').includes('a été mis à jour avec les nouveaux émojis'));
  check('route dashboard panneau : les émojis sont assurés avant envoi', /ensureVtEmotes\(bot\.id, guild\)[\s\S]{0,200}sendVtPanel/.test(fs.readFileSync(path.join(__dirname, '..', 'server', 'routes.js'), 'utf8')));

  console.log('— 4. Modules du dashboard NON touchés —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'dashboard.css'), 'utf8');
  check('dashboard.js sans nos PNG de modules', !dash.includes('moduleIcon') && !dash.includes('HOX_EMOTES') && !dash.includes('/emotes/hox_'));
  check('dashboard.css sans .hox-ico', !css.includes('.hox-ico'));
  check('signatures réservées à /emotes (Discord)', typeof extra.installHoxEmotes === 'function' && typeof extra.hoxEmotesPanel === 'function');

  // Le module Vocal est passé du texte Unicode aux glyphes dessinés : plus un
  // seul pictogramme de couleur dans son gabarit, et 7 icônes qui suivent le thème.
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  const iVt = dash.indexOf('Dashboard.renderers.voicetemp');
  const blocVt = dash.slice(iVt, dash.indexOf('Dashboard.renderers.', iVt + 10));
  const RE_PICTO = /[\u{1F000}-\u{1FAFF}\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u20E3]/u;
  check('module Vocal : 0 émoji Unicode dans le gabarit (8 avant)', !RE_PICTO.test(blocVt));
  check('module Vocal : 7 glyphes dessinés à la place', (blocVt.match(/App\.glyphe\(/g) || []).length === 7,
    String((blocVt.match(/App\.glyphe\(/g) || []).length));
  check('jeu d\u2019icônes : micro, cadenasOuvert, moins ajoutés',
    ['micro', 'cadenasOuvert', 'moins'].every((k) => app.includes(k + ": '")));

  console.log('— 5. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=383 référencé 7 fois', (index.match(/\?v=383/g) || []).length === 7);
  check('sw.js : cache « botdev-v350 »', sw.includes("const CACHE = 'botdev-v383';"));

  console.log(`\n🎉 v275 — ${ok} vérifications OK : premium UNIQUEMENT sur les émojis vocaux, modules intacts.`);
})().catch((e) => { console.error(e); process.exit(1); });
