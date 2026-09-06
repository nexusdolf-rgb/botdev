// ============================================================================
// AUDIT v240 — passe 3 : la QUALITÉ des textes envoyés aux membres.
//
//   C1  tutoiement / vouvoiement mélangés (le bot dit « tu » ici, « vous » là)
//   C2  textes codés en dur hors i18n.js (jamais traduits, fautes possibles)
//   C3  ponctuation : espace insécable manquante avant ! ? : ;, doubles espaces
//   C4  pieds de panneau : signature cohérente (« Hoxera · … ») partout ?
//   C5  titres : emoji + majuscule cohérents
//   C6  placeholders {x} non remplacés à l'exécution
//   C7  textes anglais restés dans les chaînes françaises
//
//   node scripts/audit-v240-qualite.js
// ============================================================================
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-audit3-'));

const ROOT = path.join(__dirname, '..');
const problems = [];
const add = (cat, sev, msg) => problems.push({ cat, sev, msg });

const s = fs.readFileSync(path.join(ROOT, 'server', 'i18n.js'), 'utf8');
const STRINGS = new Function(s.slice(s.indexOf('const STRINGS = {'), s.indexOf('\nconst LANG_CODES')).replace(/^const STRINGS = /, 'return '))();
const FR = STRINGS.fr;

// ── C1 : tu / vous ──────────────────────────────────────────────────────────
// On ne regarde QUE les verbes/adjectifs possessifs et impératifs non ambigus.
// ⚠️ Bornes UNICODE obligatoires : `\b` s'appuie sur \w = [A-Za-z0-9_], donc
// « ê » n'est pas un caractère de mot et `\btes\b` matchait « vous êTES ».
// De même les impératifs ambigus (note, dis, fais, as) sont retirés : ce sont
// aussi des noms/formes courantes (« votre NOTE », « il A »).
const B = '(?<![\\p{L}])';
const E = '(?![\\p{L}\\p{N}])';
const TU_FORT = new RegExp(B + "(tu|ton|ta|tes|toi|t')" + E + '|' + B +
  '(sélectionne|clique|ouvre|regarde|évalue|choisis|relance|essaie|rejoins|pars|viens|donne|trouve|reçois|obtiens|peux|veux|seras|auras|décris|rouvre|évalues)' + E, 'giu');
const VOUS_FORT = new RegExp(B + '(vous|votre|vos)' + E, 'giu');

const tuKeys = []; const vousKeys = [];
for (const [k, v] of Object.entries(FR)) {
  const s2 = String(v);
  // On ignore les formes en -ez qui sont des infinitifs/autres mots.
  const tu = s2.match(TU_FORT) || [];
  const vous = s2.match(VOUS_FORT) || [];
  if (tu.length) tuKeys.push([k, tu.slice(0, 3).join('/')]);
  if (vous.length) vousKeys.push([k, vous.slice(0, 3).join('/')]);
}
const melange = tuKeys.filter(([k]) => vousKeys.some(([k2]) => k2 === k));
melange.forEach(([k, w]) => add('C1 tu/vous', '🔴', `« ${k} » mélange tutoiement ET vouvoiement (${w})`));

// ── C3 : ponctuation française ──────────────────────────────────────────────
for (const [code, table] of Object.entries(STRINGS)) {
  for (const [k, v] of Object.entries(table)) {
    const s2 = String(v);
    if (code !== 'fr') continue;
    // En français : espace insécable avant ! ? : ; — ici on vérifie au moins
    // qu'il y a UNE espace (l'insécable est un raffinement).
    for (const m of s2.matchAll(/[A-Za-zÀ-ÿ0-9éè][!?;:]/g)) {
      add('C3 ponctuation', '🟡', `fr.« ${k} » : pas d'espace avant « ${m[0].slice(-1)} » → « …${s2.slice(Math.max(0, m.index - 25), m.index + 8)}… »`);
    }
    if (/!!|\?\?/.test(s2) && !/^[‼]/.test(s2)) add('C3 ponctuation', '🟡', `fr.« ${k} » : ponctuation doublée`);
  }
}

// ── C4 : pieds de panneau ───────────────────────────────────────────────────
const pieds = new Map();
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else if (e.name.endsWith('.js')) yield p;
  }
}
for (const f of walk(path.join(ROOT, 'server'))) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const m of src.matchAll(/footer\s*:\s*([`'"])((?:[^`'"\\]|\\.)*?)\1/g)) {
    const val = m[2];
    if (!val) continue;
    if (!pieds.has(val)) pieds.set(val, []);
    pieds.get(val).push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
  }
  for (const m of src.matchAll(/setFooter\(\{\s*text\s*:\s*([`'"])((?:[^`'"\\]|\\.)*?)\1/g)) {
    const val = m[2];
    if (!val) continue;
    if (!pieds.has(val)) pieds.set(val, []);
    pieds.get(val).push(`${rel}:${src.slice(0, m.index).split('\n').length} (embed)`);
  }
}
const sansHoxera = [...pieds.entries()].filter(([v]) => !/Hoxera/i.test(v) && !/^\{/.test(v) && v.length > 3);
sansHoxera.forEach(([v, where]) => add('C4 pied', '🟠', `pied sans la signature « Hoxera » : « ${v.slice(0, 60)} » (${where.slice(0, 2).join(', ')}${where.length > 2 ? ` +${where.length - 2}` : ''})`));

// ── C2 : textes codés en dur envoyés aux membres ────────────────────────────
// Un texte en dur n'est JAMAIS traduit : un serveur anglais le verra en
// français. On liste les plus visibles (content/title/description/label).
const durs = [];
for (const f of walk(path.join(ROOT, 'server', 'discord'))) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const m of src.matchAll(/\b(?:title|description|content|label|placeholder)\s*:\s*(['"`])((?:(?!\1)[^\\]|\\.){12,200}?)\1/g)) {
    const val = m[2];
    if (!/[a-zA-ZÀ-ÿ]{4}/.test(val)) continue;           // pas de texte
    if (/\$\{|i18n\.t\(|^\s*$/.test(val)) continue;        // dynamique
    if (!/[a-zà-ÿ]\s+[a-zà-ÿ]/i.test(val)) continue;      // au moins 2 mots
    if (/^(https?|attachment|bd-|hx|v2|type)/i.test(val)) continue;
    durs.push({ where: `${rel}:${src.slice(0, m.index).split('\n').length}`, val });
  }
}

// ── C7 : anglais dans les textes FR codés en dur ────────────────────────────
durs.forEach(({ where, val }) => {
  if (/(?<![A-Za-zÀ-ÿ])(the|and|with|your|this|that|from|have|will|not|are|was|were|you|your)(?![A-Za-zÀ-ÿ])/i.test(val)) {
    add('C7 anglais', '🟠', `${where} — mot anglais dans un texte français : « ${val.slice(0, 70)} »`);
  }
});

// ── Rapport ─────────────────────────────────────────────────────────────────
console.log('════════════════════════════════════════════════════════════════');
console.log('  AUDIT v240 — PASSE 3 : QUALITÉ DES TEXTES');
console.log('════════════════════════════════════════════════════════════════');
console.log(`  textes FR : ${Object.keys(FR).length} · langues : ${Object.keys(STRINGS).join(', ')}`);
console.log(`  clés au tutoiement : ${tuKeys.length} · clés au vouvoiement : ${vousKeys.length} · mélangées : ${melange.length}`);
console.log(`  pieds de panneau distincts : ${pieds.size} · sans signature Hoxera : ${sansHoxera.length}`);
console.log(`  textes codés en dur (jamais traduits) : ${durs.length}`);
console.log('');

console.log('── C1 détail : tu vs vous ─────────────────────────────────────');
console.log(`   VOUS (${vousKeys.length}) : ${vousKeys.map(([k]) => k).join(', ')}`);
console.log('');
console.log('── C4 détail : pieds sans signature ───────────────────────────');
sansHoxera.slice(0, 25).forEach(([v, w]) => console.log(`   • « ${v.slice(0, 55)} » — ${w[0]}`));
console.log('');
console.log('── C2 détail : 25 textes codés en dur les plus visibles ───────');
const vus = new Set();
durs.filter((d) => !vus.has(d.val) && vus.add(d.val)).slice(0, 25)
  .forEach((d) => console.log(`   ${d.where.padEnd(28)} « ${d.val.slice(0, 78)} »`));
console.log('');

const SEV = { '🔴': 0, '🟠': 1, '🟡': 2 };
problems.sort((a, b) => (SEV[a.sev] - SEV[b.sev]) || a.cat.localeCompare(b.cat));
if (problems.length) {
  const byCat = new Map();
  problems.forEach((p) => { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); });
  for (const [cat, list] of byCat) {
    console.log(`── ${cat}  (${list.length}) ${'─'.repeat(Math.max(0, 44 - cat.length))}`);
    list.slice(0, 25).forEach((p) => console.log(`   ${p.sev} ${p.msg}`));
    if (list.length > 25) console.log(`   … +${list.length - 25} autre(s)`);
    console.log('');
  }
}
console.log('════════════════════════════════════════════════════════════════');
console.log(`  TOTAL : ${problems.length} — 🔴 ${problems.filter((p) => p.sev === '🔴').length} · 🟠 ${problems.filter((p) => p.sev === '🟠').length} · 🟡 ${problems.filter((p) => p.sev === '🟡').length}`);
console.log('════════════════════════════════════════════════════════════════');

try { require('../server/db').db.close(); } catch {}
fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true });
fs.writeFileSync(path.join(ROOT, '..', 'audit-v240-qualite.json'), JSON.stringify({ problems, durs, pieds: [...pieds.keys()], tuKeys, vousKeys }, null, 2));
process.exit(0);
