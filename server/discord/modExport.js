// ============================================================
// Hoxera — 📄 v266 — Export des sanctions (CSV / HTML)
// L'historique de modération (table warnings : date, membre, modérateur,
// origine, action, raison) s'exporte en un fichier :
//   • CSV  : séparateur « ; » + BOM UTF-8 → s'ouvre correctement dans Excel
//     français (accents conservés, une colonne par champ) ;
//   • HTML : tableau autonome et stylé, lisible dans n'importe quel
//     navigateur, pratique pour un recours ou un audit.
// Usage : /modexport format:csv|membre:@X — le fichier part en MP éphémère
// de la commande (seul celui qui exporte le reçoit), et l'export est tracé
// dans le journal du serveur.
// ============================================================
const store = require('../db');

// ------------------------------------------------------------
//  CSV (fonctions PURES)
// ------------------------------------------------------------
function csvCell(value) {
  const s = String(value === null || value === undefined ? '' : value);
  // Guillemets, point-virgule ou retour à ligne → cellule entre guillemets
  // (les guillemets internes sont doublés, norme RFC 4180).
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = ['date', 'membre_id', 'moderateur_id', 'origine', 'action', 'numero', 'raison'];

function buildCsv(rows) {
  const lines = [CSV_HEADER.join(';')];
  for (const r of rows || []) {
    lines.push([
      r.created_at || '', r.user_id || '', r.mod_id || '', r.source || '',
      r.action || '', r.warning_no || '', r.reason || '',
    ].map(csvCell).join(';'));
  }
  // BOM UTF-8 (Excel FR) + fins de ligne CRLF (Excel Windows).
  return `\uFEFF${lines.join('\r\n')}`;
}

// ------------------------------------------------------------
// 🌐 HTML (fonctions PURES)
// ------------------------------------------------------------
function escHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(rows, guildName, botName) {
  const when = new Date().toLocaleString('fr-FR');
  const trs = (rows || []).map((r) => `      <tr>
        <td>${escHtml(r.created_at)}</td>
        <td>${escHtml(r.user_id)}</td>
        <td>${escHtml(r.mod_id)}</td>
        <td>${escHtml(r.source)}</td>
        <td>${escHtml(r.action)}</td>
        <td>${escHtml(r.warning_no)}</td>
        <td>${escHtml(r.reason)}</td>
      </tr>`).join('\n');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Export des sanctions — ${escHtml(guildName)}</title>
<style>
  body { font-family: system-ui, Arial, sans-serif; margin: 32px; color: #1c1e21; }
  h1 { font-size: 22px; } h1 span { color: #e07a5f; }
  p.meta { color: #66707a; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #d7dbe0; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #f2f4f6; }
  tr:nth-child(even) td { background: #fafbfc; }
  td.num { white-space: nowrap; }
</style>
</head>
<body>
<h1>📄 Export des sanctions — <span>${escHtml(guildName)}</span></h1>
<p class="meta">Généré le ${escHtml(when)} par ${escHtml(botName)} (Hoxera) · ${(rows || []).length} ligne(s) · colonnes : date, membre, modérateur, origine, action, n°, raison</p>
<table>
  <thead>
    <tr><th>Date (UTC)</th><th>Membre (ID)</th><th>Modérateur (ID)</th><th>Origine</th><th>Action</th><th>N°</th><th>Raison</th></tr>
  </thead>
  <tbody>
${trs || '      <tr><td colspan="7">Aucune sanction enregistrée.</td></tr>'}
  </tbody>
</table>
</body>
</html>
`;
}

function fileName(guildId, ext) {
  const d = new Date().toISOString().slice(0, 10);
  return `hoxera-sanctions-${String(guildId).slice(0, 20)}-${d}.${ext}`;
}

// ------------------------------------------------------------
// 📦 Préparation de l'export (fonction testable, sans Discord)
// ------------------------------------------------------------
function prepareExport(botId, guildId, format = 'csv', targetUserId = '', guildName = '', botName = 'Hoxera') {
  const rows = store.warnings.history(botId, guildId, targetUserId || '');
  const fmt = String(format || 'csv').toLowerCase() === 'html' ? 'html' : 'csv';
  const content = fmt === 'csv' ? buildCsv(rows) : buildHtml(rows, guildName || String(guildId), botName);
  return { format: fmt, rows: rows.length, name: fileName(guildId, fmt), content };
}

module.exports = { CSV_HEADER, csvCell, buildCsv, escHtml, buildHtml, fileName, prepareExport };
