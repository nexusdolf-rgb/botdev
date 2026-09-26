// v311 — DEMANDE DU FONDATEUR (14/09) : retirer la signature ET la ligne
// colorée de DEUX panneaux de plus :
//   1. le panneau de MENU DES RÔLES — plus de pied « Hoxera · N rôle(s)
//      disponible(s) », plus de ligne verticale colorée ;
//   2. le panneau « 🎙️ Interface Hoxera — vocaux temporaires » — plus de
//      signature, plus de ligne verticale colorée.
// Rien d'autre ne change : boutons, légende, contenus intacts ; les autres
// panneaux gardent leur apparence.
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v311');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const panels = require('../server/discord/panels');
const extra = require('../server/discord/extra');
const v2 = require('./helpers/v2');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('— 1. Pins de version v311 —');
const html = racine('public/index.html');
check('index.html : ?v=331 ×7', (html.match(/\?v=331/g) || []).length === 7);
check('sw.js : cache botdev-v331', racine('public/sw.js').includes("const CACHE = 'botdev-v331';"));

console.log('— 2. Panneau menu des rôles —');
store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' });
{
  const menu = {
    name: 'Rôles du serveur', mode: 'menu', content: 'Choisis tes rôles ci-dessous.',
    options: [{ label: '🎮 Gamer', role: 'R1' }, { label: '🎨 Créatif', role: 'R2' }],
  };
  const p = panels.roleMenuPayload(1, menu);
  const j = JSON.stringify(p.components[0].toJSON());
  check('signature « Hoxera · N rôle(s) » retirée', v2.footer(p) === '' && !j.includes('-# Hoxera'), v2.footer(p));
  check('ligne verticale colorée retirée', !j.includes('accent_color'));
  check('contenu intact (titre, aide, menu)', v2.title(p).includes('Rôles du serveur')
    && v2.texts(p).some((t) => t.includes('Comment ça marche ?')) && j.includes('bd-menu:'));
}

console.log('— 3. Panneau interface vocaux temporaires —');
{
  const p = extra.buildVtPanel(1, null);
  const j = JSON.stringify(p.components[0].toJSON());
  check('signature retirée', v2.footer(p) === '' && !j.includes('-# Hoxera'), v2.footer(p));
  check('ligne verticale colorée retirée', !j.includes('accent_color'));
  check('légende émojis intacte (NOM…SUPPRIMER)', v2.texts(p).join(' ').includes('NOM') && v2.texts(p).join(' ').includes('SUPPRIMER'));
  check('les 10 boutons intacts', (v2.rows(p) || []).flatMap((r) => r.components || []).filter((c) => c.type === 2).length === 10);
}

console.log('— 4. Portée stricte : les autres panneaux ne changent pas —');
{
  const src = racine('server/discord/panels.js');
  check('panneaux tickets : toujours sans ligne ni signature publique',
    src.includes('accent: false'));
  const d = require('../server/discord/ui').v2panel({ title: 'T', description: 'A' });
  check('panneau ordinaire : plus de signature par défaut (v312)', !v2.footer(d).includes('Hoxera'));
}

console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log(`\n✅ v311 : ${ok} vérifications passed.`);
process.exit(ko === 0 ? 0 : 1);
