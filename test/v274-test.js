// v274 — NOS PROPRES ÉMOJIS PARTOUT : pack « signatures » Hoxera (25 icônes,
// une par module), demandé par le maître : « tout ce qui est émoji dans
// Optimus, on recrée nous-mêmes nos propres émojis pro ».
//
//   • dashboard : les icônes de modules (nav, grille, recherche, mobile)
//     affichent nos PNG terracotta servis par le bot (/emotes/hox_*.png),
//     avec repli automatique sur l'émoji texte si l'image manque ;
//   • Discord : /emotes install ajoute le pack au serveur (tout le monde
//     peut ensuite les utiliser), /emotes view le montre dans un panneau ;
//   • NI les émojis vocaux (pack hox_* du panneau), NI les émojis de tickets
//     personnalisés ne sont touchés.
//
// Vérifié ici : les 25 PNG présents et légers, la carte dashboard + le
// helper d'icône, la commande /emotes, l'installation simulée, le panneau
// de vue avec nos émojis, version 274.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dir = '/tmp/v274test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const extra = require('../server/discord/extra');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

const KEYS = ['vue', 'ticket', 'bienvenue', 'niveaux', 'eco', 'boutique', 'mod', 'antinuke', 'roles', 'suggestion', 'cadeau', 'events', 'quiz', 'vocal', 'communaute', 'annonce', 'embed', 'membres', 'stats', 'journal', 'transcript', 'modmail', 'reglages', 'bot', 'aide'];

(async () => {
  const BOT = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });

  console.log('— 1. Le pack de 25 PNG Hoxera —');
  const assets = path.join(__dirname, '..', 'server', 'assets', 'emotes');
  const pub = path.join(__dirname, '..', 'public', 'emotes');
  check('25 émojis dans les assets du bot', KEYS.every((k) => fs.existsSync(path.join(assets, 'hox_' + k + '.png'))));
  check('…servis au dashboard depuis public/emotes', KEYS.every((k) => fs.existsSync(path.join(pub, 'hox_' + k + '.png'))));
  check('…tous sous la limite Discord (256 Ko)', KEYS.every((k) => fs.statSync(path.join(assets, 'hox_' + k + '.png')).size < 256000));
  check('liste officielle du pack', JSON.stringify(extra.HOX_SIG_EMOTES.slice().sort()) === JSON.stringify(KEYS.slice().sort()));

  console.log('— 2. Dashboard : nos PNG comme icônes de modules —');
  const dash = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard.js'), 'utf8');
  const carte = (dash.match(/Dashboard\.HOX_EMOTES = \{([^}]*)\}/) || [0, ''])[1];
  check('carte module → émoji (25 entrées)', (carte.match(/:/g) || []).length >= 25);
  check('helper moduleIcon avec repli texte', dash.includes('Dashboard.moduleIcon = (id, ico) =>') && dash.includes('onerror="this.replaceWith(document.createTextNode(this.alt))"'));
  check('…utilisé dans la nav, la grille, la recherche et le mobile', (dash.match(/Dashboard\.moduleIcon\(/g) || []).length >= 7);
  check('css .hox-ico présent', fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'dashboard.css'), 'utf8').includes('.hox-ico {'));

  console.log('— 3. Discord : /emotes install & view —');
  const cmd = extra.buildExtraPayloads(BOT).find((p) => p.name === 'emotes');
  check('commande /emotes (install / view)', !!cmd && JSON.stringify(cmd.options).includes('install') && JSON.stringify(cmd.options).includes('view'));
  let seq = 0;
  const made = [];
  const guild = {
    id: 'g1',
    emojis: {
      cache: { get: (id) => made.find((e) => e.id === id) || null, find: (fn) => made.find(fn) || undefined },
      create: async ({ name }) => { const e = { id: String(930000000000000000n + BigInt(++seq)), name, toString() { return `<:${this.name}:${this.id}>`; } }; made.push(e); return e; },
    },
  };
  const created = await extra.installHoxEmotes(BOT, guild);
  check('/emotes install : 25 émojis créés', created.length === 25, String(created.length));
  check('…relancé : aucune duplication', (await extra.installHoxEmotes(BOT, guild)).length === 0);
  check('panneau /emotes view avec NOS émojis', JSON.stringify(extra.hoxEmotesPanel(BOT, guild, created)).includes('<:hox_ticket:'));
  check('vocaux et tickets NON touchés', extra.VT_EMOTES.length === 10 && !extra.HOX_SIG_EMOTES.some((k) => extra.VT_EMOTES.includes(k)));

  console.log('— 4. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=274 référencé 7 fois', (index.match(/\?v=274/g) || []).length === 7);
  check('sw.js : cache « botdev-v274 »', sw.includes("const CACHE = 'botdev-v274';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v274 — ${ok} vérifications OK : nos émojis Hoxera partout.`);
  else { console.log(`❌ v274 — ${ko} échec(s)`); process.exitCode = 1; }
})();
