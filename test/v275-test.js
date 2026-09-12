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

process.env.BOTDEV_DATA_DIR = process.env.BOTDEV_DATA_DIR || path.join(__dirname, '.tmp-v275');
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

  console.log('— 1. Pack vocal PREMIUM (10 PNG) —');
  const dir = path.join(__dirname, '..', 'server', 'assets', 'voicetemp');
  check('10 émojis vocaux présents', extra.VT_EMOTES.every((k) => fs.existsSync(path.join(dir, 'hox_' + k + '.png'))));
  check('…tous sous la limite Discord (256 Ko)', extra.VT_EMOTES.every((k) => fs.statSync(path.join(dir, 'hox_' + k + '.png')).size < 256000));
  check('…ce sont bien les versions premium (pas les plats)', fs.statSync(path.join(dir, 'hox_nom.png')).size > 1500);

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
  check('index.html : ?v=286 référencé 7 fois', (index.match(/\?v=286/g) || []).length === 7);
  check('sw.js : cache « botdev-v286 »', sw.includes("const CACHE = 'botdev-v286';"));

  console.log(`\n🎉 v275 — ${ok} vérifications OK : premium UNIQUEMENT sur les émojis vocaux, modules intacts.`);
})().catch((e) => { console.error(e); process.exit(1); });
