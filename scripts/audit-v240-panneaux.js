// ============================================================================
// AUDIT v240 — passe 2 : les PANNEAUX et les MESSAGES.
//
// Objectif : retrouver les bugs de la même famille que ceux de la v237/v239 —
// des messages construits « à la main » hors du système de panneaux, donc
// invisibles pour les migrations, et des pièges V2 documentés.
//
// Vérifications :
//   B1  envoi DIRECT d'un embed construit à la main (send/reply/edit avec
//       `embeds: [new EmbedBuilder()…]`) → hors système de panneaux
//   B2  piège de l'éphémère : `{ ...ui.v2panel(…), ephemeral: true }` écrase
//       `flags` et PERD IsComponentsV2
//   B3  V2 + pièce jointe envoyée par WEBHOOK → 400 (piège n°10)
//   B4  `components: []` sur un message V2 → efface tout le conteneur
//   B5  `content:` / `embeds:` au niveau d'un message V2 → 400
//   B6  relecture de `msg.embeds[0]` sur un message qui peut être V2
//   B7  traits texte ━ dans un payload V2
//   B8  `ui.v2panel(…)` dont les boutons sont passés dans `options.rows`
//       (piège n°19, corrigé mais à surveiller)
//   B9  séparateurs : chaque ui.v2panel avec `description` multiligne produit-il
//       bien des séparateurs (rendu réel, pas statique)
//   B10 budget : 40 composants / 4000 caractères
//
//   node scripts/audit-v240-panneaux.js
// ============================================================================
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-audit2-'));

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server');

const problems = [];
const notes = [];
const add = (cat, sev, msg) => problems.push({ cat, sev, msg });

// Retire les commentaires : ils citent volontairement du code interdit
// (leçon de la v237 — mes propres commentaires explicatifs faisaient échouer
// les garde-fous).
function codeOnly(src) {
  let out = '';
  let inBlock = false;
  for (const line of src.split('\n')) {
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      out += '\n';
      continue;
    }
    const t = line.trimStart();
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; out += '\n'; continue; }
    if (t.startsWith('//') || t.startsWith('*')) { out += '\n'; continue; }
    // retire un commentaire de fin de ligne, sans casser une URL « https:// »
    out += line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1') + '\n';
  }
  return out;
}

const files = fs.readdirSync(path.join(SERVER, 'discord')).filter((f) => f.endsWith('.js'));
const srcs = new Map();
for (const f of files) {
  const raw = fs.readFileSync(path.join(SERVER, 'discord', f), 'utf8');
  srcs.set(f, { raw, code: codeOnly(raw) });
}
const lineOf = (code, idx) => code.slice(0, idx).split('\n').length;

// ── B1 : embed envoyé DIRECTEMENT, hors système de panneaux ─────────────────
// C'est exactement le bug du MP de transcription (v239) : construit à la main,
// jamais vu par les migrations.
for (const [f, { code }] of srcs) {
  for (const m of code.matchAll(/(?:channel|user|member|interaction|msg|message|target|hook|board|chan|author|opener|dm|thread)\s*\.\s*(?:send|reply|edit|update|followUp)\s*\(\s*\{[^}]{0,400}?embeds\s*:/gs)) {
    const line = lineOf(code, m.index);
    add('B1 embed direct', '🟠', `${f}:${line} — envoi direct avec \`embeds:\` (hors ui.v2panel) : ${m[0].replace(/\s+/g, ' ').slice(0, 90)}…`);
  }
  for (const m of code.matchAll(/embeds\s*:\s*\[\s*new EmbedBuilder\(\)/g)) {
    const line = lineOf(code, m.index);
    add('B1 embed direct', '🟠', `${f}:${line} — \`embeds: [new EmbedBuilder()\` inline`);
  }
}

// ── B2 : piège de l'éphémère ────────────────────────────────────────────────
for (const [f, { code }] of srcs) {
  for (const m of code.matchAll(/\{\s*\.\.\.\s*ui\.v2(?:panel|status|contentPanel|edit)\([^)]*\)\s*,\s*ephemeral\s*:\s*true/g)) {
    add('B2 éphémère', '🔴', `${f}:${lineOf(code, m.index)} — \`{ ...ui.v2panel(…), ephemeral: true }\` écrase \`flags\` et PERD IsComponentsV2 → passer \`ephemeral\` DANS les options`);
  }
}

// ── B3 : V2 + pièce jointe + webhook ────────────────────────────────────────
// identity.sendAsProfile() passe par un webhook si un profil personnalisé est
// réglé. V2 + webhook + files = 400.
{
  const ev = srcs.get('events.js');
  if (ev) {
    const hookCalls = [...ev.code.matchAll(/sendAsProfile\([^)]*\)/g)];
    notes.push(`events.js : ${hookCalls.length} appel(s) à identity.sendAsProfile() — chacun doit être sans pièce jointe s'il est en V2`);
  }
  for (const [f, { code }] of srcs) {
    for (const m of code.matchAll(/sendAsProfile\([\s\S]{0,500}?\)/g)) {
      const frag = m[0];
      if (/files/.test(frag) && /v2panel|v2status|v2contentPanel/.test(frag)) {
        add('B3 webhook+files', '🔴', `${f}:${lineOf(code, m.index)} — V2 + pièce jointe via sendAsProfile (webhook) → 400`);
      }
    }
  }
}

// ── B4 : components: [] sur un message V2 ───────────────────────────────────
for (const [f, { code }] of srcs) {
  for (const m of code.matchAll(/components\s*:\s*\[\s*\]/g)) {
    const ctx = code.slice(Math.max(0, m.index - 400), m.index + 200);
    if (/v2panel|v2edit|IsComponentsV2/.test(ctx)) {
      add('B4 components:[]', '🔴', `${f}:${lineOf(code, m.index)} — \`components: []\` à côté d'un payload V2 : en V2 le conteneur EST le composant, donc on efface tout le message`);
    }
  }
}

// ── B5 : content/embeds au niveau d'un message V2 ───────────────────────────
for (const [f, { code }] of srcs) {
  for (const m of code.matchAll(/\.\.\.\s*(?:ui\.v2panel|ui\.v2status|ui\.v2contentPanel|payload|welcomePayload|panel)\b[\s\S]{0,200}?(?:^|[\s,{])(content|embeds)\s*:/gm)) {
    add('B5 V2+content', '🟠', `${f}:${lineOf(code, m.index)} — \`${m[1]}:\` à côté d'un payload V2 → 400 BAD REQUEST`);
  }
}

// ── B6 : relecture de msg.embeds[0] ─────────────────────────────────────────
for (const [f, { code }] of srcs) {
  for (const m of code.matchAll(/\.embeds\[0\]/g)) {
    const line = lineOf(code, m.index);
    const ctx = code.slice(Math.max(0, m.index - 300), m.index + 300);
    const garde = /panelTitleOf|catch|\?\.|if \(/.test(ctx);
    add('B6 embeds[0]', garde ? '🟡' : '🔴', `${f}:${line} — relecture de \`.embeds[0]\`${garde ? ' (gardée)' : ' SANS GARDE'} : sur un conteneur V2 il n'y a plus d'embed`);
  }
}

// ── B7 : traits texte ━ dans un payload V2 ──────────────────────────────────
for (const [f, { raw, code }] of srcs) {
  for (const m of code.matchAll(/\u2501/g)) {
    add('B7 trait texte', '🔴', `${f}:${lineOf(code, m.index)} — caractère ━ dans du code exécuté (interdit dans un panneau V2)`);
  }
  // ui.sectionize() produit ces traits : légitime UNIQUEMENT sur un embed
  // classique (carte de bienvenue, xp.js, wizard types).
  for (const m of code.matchAll(/ui\.sectionize\(/g)) {
    const line = lineOf(code, m.index);
    const apres = code.slice(m.index, m.index + 2500);
    const versV2 = /ui\.v2panel|v2contentPanel|v2status/.test(apres.slice(0, 1200));
    add('B7 trait texte', versV2 ? '🔴' : '🟡', `${f}:${line} — ui.sectionize() (traits texte ━)${versV2 ? ' À CÔTÉ d\u2019un v2panel' : ' — vérifier que la cible est bien un embed classique'}`);
  }
}

// ── B8 : rows dans options ──────────────────────────────────────────────────
for (const [f, { code }] of srcs) {
  for (const m of code.matchAll(/ui\.v2(?:panel|status|contentPanel)\(\s*\{[\s\S]{0,1200}?\brows\s*:/g)) {
    // Légitime depuis la v239 (repli), mais à signaler pour relecture.
    add('B8 rows/options', '🟡', `${f}:${lineOf(code, m.index)} — boutons passés via \`rows:\` DANS les options (ok depuis la v239, mais le 2ᵉ argument reste la convention)`);
  }
}

// ── B9/B10 : rendu réel des panneaux produits par ui.v2panel ────────────────
const ui = require('../server/discord/ui');
const v2 = require('../test/helpers/v2');
const CAS = [
  ['titre seul', { title: 'T', footer: 'F', timestamp: false }],
  ['description 1 paragraphe', { title: 'T', description: 'un seul bloc', footer: 'F', timestamp: false }],
  ['description 3 paragraphes', { title: 'T', description: 'a\n\nb\n\nc', footer: 'F', timestamp: false }],
  ['champs inline x3', { title: 'T', fields: [{ name: 'A', value: '1', inline: true }, { name: 'B', value: '2', inline: true }, { name: 'C', value: '3', inline: true }], footer: 'F', timestamp: false }],
  ['champs hors ligne x4', { title: 'T', fields: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }, { name: 'C', value: '3' }, { name: 'D', value: '4' }], footer: 'F', timestamp: false }],
  ['champ au nom vide', { title: 'T', fields: [{ name: '\u200b', value: 'x' }], footer: 'F', timestamp: false }],
  ['texte très long (12 000)', { title: 'T', description: 'x'.repeat(12000), footer: 'F', timestamp: false }],
  ['100 champs', { title: 'T', fields: Array.from({ length: 100 }, (_, i) => ({ name: `N${i}`, value: `V${i}` })), footer: 'F', timestamp: false }],
  ['image + vignette', { title: 'T', description: 'd', image: 'https://a/b.png', thumbnail: 'https://a/c.png', footer: 'F', timestamp: false }],
  ['footer sans timestamp', { title: 'T', description: 'd', footer: 'Hoxera', timestamp: false }],
  ['footer avec timestamp', { title: 'T', description: 'd', footer: 'Hoxera' }],
  ['sections:false', { title: 'T', description: 'a\n\nb', footer: false, sections: false }],
  ['éphémère', { title: 'T', description: 'd', footer: false, ephemeral: true }],
  ['content + description', { title: 'T', content: 'ligne du haut', description: 'a\n\nb', footer: 'F', timestamp: false }],
  ['fichiers joints', { title: 'T', description: 'd', files: ['a.txt', 'b.pdf'], footer: 'F', timestamp: false }],
  ['rien du tout', { footer: false }],
];
console.log('════════════════════════════════════════════════════════════════');
console.log('  B9/B10 — RENDU RÉEL de ui.v2panel sur 16 cas limites');
console.log('════════════════════════════════════════════════════════════════');
for (const [label, opts] of CAS) {
  let p;
  try { p = ui.v2panel(opts); } catch (e) {
    add('B9 rendu', '🔴', `cas « ${label} » : ui.v2panel() LÈVE ${e.message}`);
    console.log(`  🔴 ${label.padEnd(30)} → EXCEPTION ${e.message}`);
    continue;
  }
  const nComp = v2.componentCount(p);
  const nText = v2.allText(p).length;
  const nSep = v2.dividers(p);
  const isV2 = v2.isV2(p);
  const ephOk = opts.ephemeral ? (p.flags & 64) !== 0 : true;
  const soucis = [];
  if (!isV2) soucis.push('flag IsComponentsV2 ABSENT');
  if (nComp > 40) soucis.push(`${nComp} composants > 40`);
  if (nText > 4000) soucis.push(`${nText} caractères > 4000`);
  if (!ephOk) soucis.push('éphémère posé mais flag Ephemeral absent');
  if (/\u2501/.test(v2.allText(p))) soucis.push('trait texte ━ dans le rendu');
  if (soucis.length) add('B10 budget', '🔴', `cas « ${label} » : ${soucis.join(' · ')}`);
  const etat = soucis.length ? '🔴 ' + soucis.join(' · ') : `✅ ${nComp}/40 comp. · ${nText}/4000 car. · ${nSep} séparateur(s)`;
  console.log(`  ${label.padEnd(30)} ${etat}`);
}
console.log('');

// ── Rapport ─────────────────────────────────────────────────────────────────
const SEV = { '🔴': 0, '🟠': 1, '🟡': 2 };
problems.sort((a, b) => (SEV[a.sev] - SEV[b.sev]) || a.cat.localeCompare(b.cat) || a.msg.localeCompare(b.msg));
const byCat = new Map();
problems.forEach((p) => { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); });
for (const [cat, list] of byCat) {
  console.log(`── ${cat}  (${list.length}) ${'─'.repeat(Math.max(0, 44 - cat.length))}`);
  list.slice(0, 40).forEach((p) => console.log(`   ${p.sev} ${p.msg}`));
  if (list.length > 40) console.log(`   … +${list.length - 40} autre(s)`);
  console.log('');
}
if (notes.length) { console.log('── Notes ──'); notes.forEach((n) => console.log('   ℹ️ ' + n)); console.log(''); }
const nR = problems.filter((p) => p.sev === '🔴').length;
const nO = problems.filter((p) => p.sev === '🟠').length;
const nJ = problems.filter((p) => p.sev === '🟡').length;
console.log('════════════════════════════════════════════════════════════════');
console.log(`  TOTAL : ${problems.length} — 🔴 ${nR} bloquant(s) · 🟠 ${nO} visible(s) · 🟡 ${nJ} à relire`);
console.log('════════════════════════════════════════════════════════════════');

try { require('../server/db').db.close(); } catch {}
fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true });
fs.writeFileSync(path.join(ROOT, '..', 'audit-v240-panneaux.json'), JSON.stringify({ problems, notes }, null, 2));
process.exit(0);
