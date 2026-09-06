// ============================================================================
// AUDIT v240 — passe 1 : les TEXTES (server/i18n.js).
//
// Ce script ne modifie rien : il LISTE les problèmes. Un texte cassé est
// invisible à l'œil dans le code — il n'apparaît que sur le serveur d'un
// utilisateur, au moment où il déclenche la commande.
//
// Vérifications :
//   A1  parité des clés fr ↔ en           (une clé manquante = texte anglais
//                                          qui reste en français, ou l'inverse)
//   A2  parité des variables {x}          (une variable manquante = « {server} »
//                                          affiché tel quel au membre)
//   A3  langues proposées vs langues traduites
//   A4  clés appelées par le code mais ABSENTES de STRINGS
//                                          → t() renvoie la clé brute :
//                                            le membre voit « ticket_add_tip »
//   A5  clés définies mais jamais appelées (poids mort)
//   A6  qualité : doubles espaces, espace avant la ponctuation, apostrophes
//       droites mélangées, « {» orphelins, texte français resté dans le bloc en
//   A7  longueur : un texte qui dépasse le budget Discord de sa cible
//
//   node scripts/audit-v240-textes.js
// ============================================================================
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-audit-'));

const ROOT = path.join(__dirname, '..');
const i18n = require('../server/i18n');

// Récupère la table STRINGS sans avoir à l'exporter.
const i18nSrc = fs.readFileSync(path.join(ROOT, 'server', 'i18n.js'), 'utf8');
const STRINGS = (() => {
  const start = i18nSrc.indexOf('const STRINGS = {');
  const end = i18nSrc.indexOf('\nconst LANG_CODES');
  const body = i18nSrc.slice(start, end).replace(/^const STRINGS = /, 'return ');
  // eslint-disable-next-line no-new-func
  return new Function(body)();
})();

const FR = STRINGS.fr || {};
const EN = STRINGS.en || {};
const frKeys = Object.keys(FR);
const enKeys = Object.keys(EN);

const problems = [];
const add = (cat, sev, msg) => problems.push({ cat, sev, msg });
const VARS = (s) => [...String(s).matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]);

// ── A1 : parité des clés ────────────────────────────────────────────────────
const onlyFr = frKeys.filter((k) => !(k in EN));
const onlyEn = enKeys.filter((k) => !(k in FR));
onlyFr.forEach((k) => add('A1 parité', '🔴', `clé « ${k} » présente en FR mais ABSENTE en EN → un serveur anglais verra du français`));
onlyEn.forEach((k) => add('A1 parité', '🔴', `clé « ${k} » présente en EN mais ABSENTE en FR → repli sur la clé brute ou l'anglais`));

// ── A2 : parité des variables ───────────────────────────────────────────────
frKeys.filter((k) => k in EN).forEach((k) => {
  const vf = VARS(FR[k]); const ve = VARS(EN[k]);
  const manqueEn = vf.filter((v) => !ve.includes(v));
  const manqueFr = ve.filter((v) => !vf.includes(v));
  if (manqueEn.length) add('A2 variables', '🔴', `« ${k} » : {${manqueEn.join(', {')}}} remplacée(s) en FR mais PAS en EN → le membre anglais verra « {${manqueEn[0]}} » en brut`);
  if (manqueFr.length) add('A2 variables', '🔴', `« ${k} » : {${manqueFr.join(', {')}}} remplacée(s) en EN mais PAS en FR → le membre français verra « {${manqueFr[0]}} » en brut`);
});

// ── A3 : langues proposées vs traduites ─────────────────────────────────────
const langCodes = (i18nSrc.match(/const LANG_CODES = \{([^}]*)\}/) || [, ''])[1];
const proposees = [...langCodes.matchAll(/(\w+):/g)].map((m) => m[1]);
const traduites = Object.keys(STRINGS);
proposees.filter((l) => !traduites.includes(l)).forEach((l) =>
  add('A3 langues', '🟠', `langue « ${l} » acceptée par normalize() mais AUCUNE traduction → tombe silencieusement en français`));

// ── A4 : clés appelées par le code mais absentes ────────────────────────────
function* walkFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(p);
    else if (/\.(js|html)$/.test(e.name)) yield p;
  }
}
const usedKeys = new Map(); // clé → [fichier:ligne]
const CALL = /\bi18n\.t\(\s*[^,]+,\s*'([a-zA-Z0-9_]+)'/g;
const CALL2 = /\bt\(\s*lang[^,]*,\s*'([a-zA-Z0-9_]+)'/g;
for (const f of walkFiles(path.join(ROOT, 'server'))) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const re of [CALL, CALL2]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      if (!usedKeys.has(m[1])) usedKeys.set(m[1], []);
      usedKeys.get(m[1]).push(`${rel}:${line}`);
    }
  }
}
// Clés construites dynamiquement (t(lang, `x_${y}`)) : à signaler à part.
const dynCalls = [];
for (const f of walkFiles(path.join(ROOT, 'server'))) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const m of src.matchAll(/\bi18n\.t\([^)]*`[^`]*\$\{/g)) {
    dynCalls.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
  }
}
[...usedKeys.entries()].forEach(([k, where]) => {
  if (!(k in FR) && !(k in EN)) {
    add('A4 clé absente', '🔴', `« ${k} » appelée en ${where.length} endroit(s) (${where.slice(0, 3).join(', ')}) mais ABSENTE de STRINGS → le membre verra la clé brute « ${k} »`);
  } else if (!(k in FR)) {
    add('A4 clé absente', '🟠', `« ${k} » appelée (${where[0]}) mais absente du bloc FR`);
  } else if (!(k in EN)) {
    add('A4 clé absente', '🟠', `« ${k} » appelée (${where[0]}) mais absente du bloc EN`);
  }
});

// ── A5 : clés jamais appelées ───────────────────────────────────────────────
const neverUsed = frKeys.filter((k) => !usedKeys.has(k));

// ── A6 : qualité du texte ───────────────────────────────────────────────────
const MOTS_FR = /\b(le|la|les|des|une|vous|votre|est|dans|pour|avec|sur|pas|que|qui|du|au|aux|ce|cette|ton|ta|tes)\b/i;
for (const [code, table] of [['fr', FR], ['en', EN]]) {
  for (const [k, v] of Object.entries(table)) {
    const s = String(v);
    // ⚠️ Faux positifs corrigés :
    //  • « double espace » : un \n\n (saut de paragraphe) devenait 2 espaces
    //    après remplacement → on teste désormais LIGNE PAR LIGNE.
    //  • « espace en fin de ligne » : `\s` inclut \n lui-même, donc tout texte
    //    multiligne finissait par « matcher » → on ne cherche que [ \t].
    //  • « espace en début » : un \n initial est VOLONTAIRE (texte collé à la
    //    suite d'un autre, ex. raid_auto_unlock) → on ne signale que [ \t].
    s.split('\n').forEach((line, i) => {
      if (/  +/.test(line)) add('A6 qualité', '🟡', `${code}.« ${k} » : double espace (ligne ${i + 1}) → « ${line.trim().slice(0, 60)} »`);
      if (/[ \t]+$/.test(line)) add('A6 qualité', '🟡', `${code}.« ${k} » : espace en fin de ligne ${i + 1}`);
    });
    if (/^[ \t]/.test(s)) add('A6 qualité', '🟡', `${code}.« ${k} » : espace en début`);
    const opens = (s.match(/\{/g) || []).length;
    const closes = (s.match(/\}/g) || []).length;
    if (opens !== closes) add('A6 qualité', '🔴', `${code}.« ${k} » : accolades déséquilibrées (${opens} « { » vs ${closes} « } ») → variable jamais remplacée`);
    if (/\{\}/.test(s)) add('A6 qualité', '🔴', `${code}.« ${k} » : « {} » vide`);
    if (/\*\*[^*]*$/.test(s.split('\n').find((l) => ((l.match(/\*\*/g) || []).length % 2) === 1) || '')) {
      add('A6 qualité', '🟡', `${code}.« ${k} » : gras ** non refermé sur une ligne`);
    }
    if (code === 'en' && MOTS_FR.test(s)) {
      add('A6 qualité', '🟠', `${code}.« ${k} » : ressemble à du FRANÇAIS dans le bloc anglais → « ${s.slice(0, 70)} »`);
    }
    // ⚠️ Faux positif corrigé : `\b` s'appuie sur \w = [A-Za-z0-9_], donc « é »
    // n'est PAS un caractère de mot : « noté » déclenchait « not ». On borne
    // avec \p{L}/\p{N} et le flag u.
    if (code === 'fr' && /(?<![\p{L}])(the|and|with|your|this|that|from|have|will|not)(?![\p{L}\p{N}])/iu.test(s)) {
      add('A6 qualité', '🟠', `${code}.« ${k} » : mot ANGLAIS dans le bloc français → « ${s.slice(0, 70)} »`);
    }
  }
}

// ── A7 : longueur vs budget Discord ─────────────────────────────────────────
for (const [code, table] of [['fr', FR], ['en', EN]]) {
  for (const [k, v] of Object.entries(table)) {
    const len = String(v).length;
    if (len > 4096) add('A7 longueur', '🔴', `${code}.« ${k} » : ${len} caractères > 4096 (description d'embed)`);
    else if (len > 1024) add('A7 longueur', '🟡', `${code}.« ${k} » : ${len} caractères (> 1024 = valeur de champ impossible)`);
  }
}

// ── Rapport ─────────────────────────────────────────────────────────────────
const SEV = { '🔴': 0, '🟠': 1, '🟡': 2 };
problems.sort((a, b) => (SEV[a.sev] - SEV[b.sev]) || a.cat.localeCompare(b.cat));

console.log('════════════════════════════════════════════════════════════════');
console.log('  AUDIT v240 — PASSE 1 : LES TEXTES (server/i18n.js)');
console.log('════════════════════════════════════════════════════════════════');
console.log(`  clés FR : ${frKeys.length}   clés EN : ${enKeys.length}   langues traduites : ${traduites.join(', ')}`);
console.log(`  langues acceptées par normalize() : ${proposees.join(', ')}`);
console.log(`  clés appelées par le code : ${usedKeys.size}   appels dynamiques : ${dynCalls.length}`);
console.log('');

const byCat = new Map();
problems.forEach((p) => { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); });
for (const [cat, list] of byCat) {
  console.log(`── ${cat}  (${list.length}) ${'─'.repeat(Math.max(0, 44 - cat.length))}`);
  list.forEach((p) => console.log(`   ${p.sev} ${p.msg}`));
  console.log('');
}
const nR = problems.filter((p) => p.sev === '🔴').length;
const nO = problems.filter((p) => p.sev === '🟠').length;
const nJ = problems.filter((p) => p.sev === '🟡').length;
console.log('════════════════════════════════════════════════════════════════');
console.log(`  TOTAL : ${problems.length} problème(s) — 🔴 ${nR} bloquant(s) · 🟠 ${nO} visible(s) · 🟡 ${nJ} cosmétique(s)`);
console.log(`  Clés jamais appelées (poids mort, non bloquant) : ${neverUsed.length}`);
if (neverUsed.length) console.log('    ' + neverUsed.slice(0, 40).join(', ') + (neverUsed.length > 40 ? ` … +${neverUsed.length - 40}` : ''));
console.log('════════════════════════════════════════════════════════════════');

try { require('../server/db').db.close(); } catch {}
fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true });
fs.writeFileSync(path.join(ROOT, '..', 'audit-v240-textes.json'), JSON.stringify({ problems, neverUsed }, null, 2));
process.exit(0);
