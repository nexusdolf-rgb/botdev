// v266 — Export des sanctions (CSV / HTML), demande du maître.
//
// Tout l'historique de modération (table warnings) s'exporte en un fichier :
//   • CSV  : séparateur « ; », BOM UTF-8, CRLF → s'ouvre proprement dans
//     Excel français (accents conservés, une colonne par champ) ;
//   • HTML : tableau autonome stylé, lisible dans un navigateur ;
//   • /modexport format:csv|html membre:@X (admin) : le fichier part en
//     message ÉPHÉMÈRE (seul l'exportateur le reçoit) et l'export est tracé
//     au journal du serveur.
//
// Vérifié ici : échappement CSV norme RFC 4180, forme des deux fichiers,
// accesseur d'historique complet, préparation de l'export, enregistrement
// de la commande, envoi éphémère avec pièce jointe.

const assert = require('assert');
const fs = require('fs');
const dir = '/tmp/v266test-' + Date.now();
fs.mkdirSync(dir, { recursive: true });
process.env.BOTDEV_DATA_DIR = dir;

const store = require('../server/db');
const me = require('../server/discord/modExport');
const premade = require('../server/discord/premade');

let ok = 0;
let ko = 0;
const check = (nom, cond, detail) => {
  if (cond) { ok += 1; console.log('  ✅ ' + nom); }
  else { ko += 1; console.log('  ❌ ' + nom + (detail ? ' — ' + detail : '')); }
};

(async () => {
  console.log('— 1. Échappement CSV (RFC 4180) —');
  check('cellule simple inchangée', me.csvCell('warn') === 'warn');
  check('point-virgule → entre guillemets', me.csvCell('a;b') === '"a;b"');
  check('guillemets doublés', me.csvCell('il a dit "ok"') === '"il a dit ""ok"""');
  check('retour à ligne protégé', me.csvCell('ligne1\nligne2').startsWith('"'));

  console.log('— 2. Fichier CSV compatible Excel français —');
  const rows = [
    { created_at: '2026-09-10 12:00:00', user_id: 'U1', mod_id: 'M1', source: 'manual', action: 'warn', warning_no: 1, reason: 'Insultes ; répétés' },
    { created_at: '2026-09-10 13:00:00', user_id: 'U2', mod_id: '', source: 'automod', action: 'timeout', warning_no: 1, reason: 'Spam' },
  ];
  const csv = me.buildCsv(rows);
  check('BOM UTF-8 en tête (accents Excel)', csv.charCodeAt(0) === 0xFEFF);
  check('en-tête : date;membre_id;…;raison', csv.includes('date;membre_id;moderateur_id;origine;action;numero;raison'));
  check('fins de ligne CRLF (Excel Windows)', csv.includes('\r\n'));
  check('raison contenant « ; » correctement citée', csv.includes('"Insultes ; répétés"'));

  console.log('— 3. Fichier HTML autonome —');
  const html = me.buildHtml([{ created_at: 'd', user_id: 'U1', mod_id: 'M1', source: 'manual', action: 'warn', warning_no: 1, reason: '<script>alert(1)</script>' }], 'Mon Serveur', 'Hoxera');
  check('document complet (doctype + charset)', html.startsWith('<!DOCTYPE html>') && html.includes('charset="utf-8"'));
  check('titre avec le nom du serveur', html.includes('Mon Serveur'));
  check('balises dangereuses échappées', html.includes('&lt;script&gt;') && !html.includes('<script>'));
  check('tableau avec en-têtes de colonnes', html.includes('<th>Date (UTC)</th>') && html.includes('<th>Raison</th>'));

  console.log('— 4. Historique complet en base —');
  const botId = store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' });
  store.modules.set(botId, 'moderation', true);
  store.warnings.add(botId, 'g1', 'U1', 'Premier', 'M1', { source: 'manual', action: 'warn' });
  store.warnings.add(botId, 'g1', 'U1', 'Deuxième', 'M1', { source: 'manual', action: 'timeout' });
  store.warnings.add(botId, 'g1', 'U2', 'Troisième', 'M2', { source: 'automod', action: 'warn' });
  const all = store.warnings.history(botId, 'g1');
  check('history() rend les 3 lignes, dans l’ordre ancien → récent',
    all.length === 3 && all[0].reason === 'Premier' && all[2].reason === 'Troisième');
  check('history() filtré par membre', store.warnings.history(botId, 'g1', 'U1').length === 2);

  console.log('— 5. Préparation de l’export —');
  const packCsv = me.prepareExport(botId, 'g1', 'csv', '', 'Mon Serveur', 'Hoxera');
  check('csv : 3 lignes + nom de fichier daté', packCsv.rows === 3 && /^hoxera-sanctions-g1-\d{4}-\d{2}-\d{2}\.csv$/.test(packCsv.name), packCsv.name);
  const packHtml = me.prepareExport(botId, 'g1', 'html', 'U1', 'Mon Serveur', 'Hoxera');
  check('html filtré membre : 2 lignes, extension .html', packHtml.rows === 2 && packHtml.name.endsWith('.html'));
  check('format inconnu → csv par défaut', me.prepareExport(botId, 'g1', 'pdf').format === 'csv');

  console.log('— 6. Commande et envoi —');
  const payloads = premade.buildSlashPayloads(botId);
  const cmd = payloads.find((p) => p.name === 'modexport');
  check('/modexport enregistré (format csv/html + membre)',
    !!cmd && JSON.stringify(cmd.options).includes('csv') && JSON.stringify(cmd.options).includes('membre'));
  check('réservé aux administrateurs', premade.ADMIN_COMMAND_NAMES.has('modexport'));
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'server/discord/premade.js'), 'utf8');
  const modCase = src.slice(src.indexOf("case 'modexport'"), src.indexOf("case 'boostrewards'"));
  check('fichier remis en message éphémère', modCase.includes('MessageFlags.Ephemeral') && modCase.includes('payload.files'));
  check('pièce jointe construite depuis le contenu', modCase.includes('Buffer.from(pack.content'));
  check('export tracé au journal du serveur', modCase.includes("logging.log(botId, guild, { title: '📄 Export des sanctions'"));

  console.log('— 7. Version —');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'public/index.html'), 'utf8');
  const sw = fs.readFileSync(require('path').join(__dirname, '..', 'public/sw.js'), 'utf8');
  check('index.html : ?v=279 référencé 7 fois', (index.match(/\?v=279/g) || []).length === 7,
    String((index.match(/\?v=279/g) || []).length));
  check('sw.js : cache « botdev-v279 »', sw.includes("const CACHE = 'botdev-v279';"));

  console.log('');
  if (ko === 0) console.log(`🎉 v266 — ${ok} vérifications OK : l'historique de modération s'exporte.`);
  else { console.log(`❌ v266 — ${ko} échec(s)`); process.exitCode = 1; }
})();
