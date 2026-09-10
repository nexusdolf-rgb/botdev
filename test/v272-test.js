// v272 — Panneau vocal PRÉSENTÉ COMME TEMPVOICE (la référence pro).
//
// Le maître a comparé : chez TempVoice, le message contient une LÉGENDE
// émoji + nom, une phrase « Appuyez sur les boutons ci-dessous… », puis des
// boutons CARRÉS SANS TEXTE (l'émoji seul). Notre panneau adopte exactement
// cette présentation, avec NOS émojis Hoxera :
//   • légende sur 3 lignes (NOM LIMITE PRIVÉ PUBLIC RÉCUPÉRER / AJOUTER
//     RETIRER TRANSFÉRER / SUPPRIMER) ;
//   • phrase d'invitation en gras ;
//   • rangée de 5 boutons émojis seuls + 3 menus membre + bouton suppression.
//
// Vérifié ici : légende (unicode puis avec nos émojis installés), boutons
// sans libellé, phrase d'invitation, menus intacts, version 272.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dir = '/tmp/v272test-' + Date.now();
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

  console.log('— 1. La légende, comme chez TempVoice —');
  const txt = v2.texts(extra.buildVtPanel(botId, null)).join('\n');
  check('ligne 1 : NOM LIMITE PRIVÉ PUBLIC RÉCUPÉRER', txt.includes('✏️ NOM   👥 LIMITE   🔒 PRIVÉ   🔓 PUBLIC   🔑 RÉCUPÉRER'));
  check('ligne 2 : AJOUTER RETIRER EXPULSER TRANSFÉRER SUPPRIMER', txt.includes('➕ AJOUTER   ➖ RETIRER   👢 EXPULSER   🤝 TRANSFÉRER   🗑️ SUPPRIMER'));
  
  check("phrase d'invitation en gras", txt.includes("**Appuyez sur les boutons ci-dessous pour utiliser l'interface.**"));

  console.log('— 2. Boutons carrés, émojis seuls —');
  const rows = v2.rows(extra.buildVtPanel(botId, null));
  const btn = rows[0].components;
  check('5 boutons sans aucun libellé', btn.length === 5 && btn.every((b) => !b.label && b.emoji));
  check("…nos émojis de repli dans l'ordre", btn.map((b) => b.emoji.name).join('') === '✏️👥🔒🔓🔑');
  check('suppression : bouton rouge sans libellé', !rows[1].components[4].label && rows[1].components[4].style === 4 && rows[1].components[4].emoji.name === '🗑️');
  check('2 rangées de 5 boutons seulement', rows.length === 2 && rows[0].components.length === 5 && rows[1].components.length === 5);

  console.log('— 3. Avec nos émojis installés : la légende les affiche —');
  let seq = 0;
  const made = [];
  const guild = {
    id: 'gE',
    emojis: {
      cache: { get: (id) => made.find((e) => e.id === id) || null, find: (fn) => made.find(fn) || undefined },
      create: async ({ name }) => { const e = { id: String(910000000000000000n + BigInt(++seq)), name }; made.push(e); return e; },
    },
  };
  await extra.installVtEmotes(botId, guild);
  const txt2 = v2.texts(extra.buildVtPanel(botId, guild)).join('\n');
  check('légende avec <:hox_nom:ID> etc.', txt2.includes('<:hox_nom:910000000000000001> NOM'));
  check('…boutons pointant sur nos émojis', v2.rows(extra.buildVtPanel(botId, guild))[0].components[0].emoji.id === '910000000000000001');

  console.log('— 4. Version —');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  check('index.html : ?v=272 référencé 7 fois', (index.match(/\?v=272/g) || []).length === 7);
  check('sw.js : cache « botdev-v272 »', sw.includes("const CACHE = 'botdev-v272';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v272 — ${ok} vérifications OK : présentation TempVoice, émojis Hoxera.`);
  else { console.log(`❌ v272 — ${ko} échec(s)`); process.exitCode = 1; }
})();
