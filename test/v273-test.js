// v273 — Panneau vocal COMPACT, calibré sur les tailles de TempVoice.
//
// Capture du maître à l'appui : notre panneau était trop grand et « pas
// rangé » — titre en « ## » (20 px), légende en texte normal (16 px), et
// 5 boutons par rangée dont le 5ᵉ retombait tout seul sur mobile (4+1).
// Correctifs, mesurés sur l'interface TempVoice :
//   • titre en « ### » (titleLevel 3) ;
//   • légende en PETIT TEXTE « -# » (12 px) ;
//   • description réduite à une phrase ;
//   • grille 4/4/2 : même disposition sur téléphone et sur PC.
//
// Vérifié ici : ces 4 points + version 273.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dir = '/tmp/v273test-' + Date.now();
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

(async () => {
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  const panel = extra.buildVtPanel(botId, null);
  const txt = v2.texts(panel).join('\n');
  const rows = v2.rows(panel);

  console.log('— 1. Tailles calibrées sur TempVoice —');
  check('titre en « ### » (petit titre, pas « ## »)', txt.includes('### 🎙️ Interface Hoxera'));
  check('légende entière en petit texte « -# » (3 lignes + pied)', (txt.match(/-# /g) || []).length === 4);
  check('description tenue en une phrase', txt.includes('Gérez **votre salon vocal temporaire** — chaque réponse est **personnelle**.'));
  check("pas de gros paragraphe d'intro", !txt.includes('Cette interface sert à gérer'));

  console.log('— 2. Grille rangée partout (mobile compris) —');
  check('rangées 4 / 4 / 2', rows.length === 3 && rows.map((r) => r.components.length).join('') === '442');
  check('aucune rangée de 5 (le 5ᵉ bouton retombait sur mobile)', rows.every((r) => r.components.length <= 4));

  console.log('— 3. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=289 référencé 7 fois', (index.match(/\?v=289/g) || []).length === 7);
  check('sw.js : cache « botdev-v289 »', sw.includes("const CACHE = 'botdev-v289';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v273 — ${ok} vérifications OK : panneau compact et rangé.`);
  else { console.log(`❌ v273 — ${ko} échec(s)`); process.exitCode = 1; }
})();
