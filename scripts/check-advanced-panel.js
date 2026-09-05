// Vérification rapide du panneau « tickets personnalisés » — modes menu ET boutons.
// Depuis v220 : chaque bloc (type) est séparé par un SÉPARATEUR NATIF pleine
// largeur (type 14, divider:true), pas par un trait de texte court.
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-adv-'));
const adv = require('../server/discord/advancedTickets');

const base = {
  id: 'P1', bot_id: 'b1', guild_id: 'G1', name: 'Centre d’aide', channel: 'C1',
  message: 'Choisis le type qui correspond à ta demande.\n\nNotre équipe te répond rapidement en privé.',
  types: [
    { id: 't1', label: 'Support', emoji: '🎫', description: 'Une question, un problème ?', button_style: '1', color: '#e07a5f', questions: [] },
    { id: 't2', label: 'Plainte', emoji: '⚖️', description: 'Signaler un membre ou un abus.', button_style: '4', color: '#ED4245', questions: [] },
    { id: 't3', label: 'Recrutement', emoji: '📝', description: 'Candidater à l’équipe du serveur.', button_style: '3', color: '#57F287', questions: [] },
  ],
};

let ok = true;
const expect = (label, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) ok = false;
};

function containerComponents(payload) {
  // payload.components[0] = ContainerBuilder → sérialisé : { type:17, components:[...] }
  const c = JSON.parse(JSON.stringify(payload)).components[0];
  return c && Array.isArray(c.components) ? c.components : [];
}
const isText = (x) => x && x.type === 10 && typeof x.content === 'string';
const isSection = (x) => x && x.type === 9;
const isNativeSep = (x) => x && x.type === 14;

// ---- BOUTONS ----
console.log('1) Mode BOUTONS — séparateur natif pleine largeur sous chaque bloc');
let comps = containerComponents(adv.buildPanelPayload({ ...base, mode: 'buttons' }));
const sectionsIdx = [];
comps.forEach((x, i) => { if (isSection(x)) sectionsIdx.push(i); });
expect('3 sections de type présentes', sectionsIdx.length === 3);
let nativeBetween = 0;
for (let i = 0; i < sectionsIdx.length - 1; i++) {
  const between = comps.slice(sectionsIdx[i] + 1, sectionsIdx[i + 1]);
  const hasSep = between.length === 1 && isNativeSep(between[0]);
  if (hasSep) nativeBetween++;
  expect(`séparateur natif entre bloc ${i + 1} et ${i + 2}`, hasSep);
}
expect('2 séparateurs natifs entre les 3 blocs', nativeBetween === 2);
const trailingText = comps.slice(sectionsIdx[sectionsIdx.length - 1] + 1);
expect('plus aucun trait-texte court (20×━) dans le panneau', !comps.some((x) => isText(x) && /━{10,}/.test(x.content)));

// ---- MENU ----
console.log('\n2) Mode MENU — mêmes séparateurs natifs pleine largeur');
comps = containerComponents(adv.buildPanelPayload({ ...base, mode: 'menu' }));
const typeTextsIdx = [];
comps.forEach((x, i) => { if (isText(x) && /^\S+ 🎫|^\S+ ⚖️|^\S+ 📝/.test(x.content)) typeTextsIdx.push(i); });
expect('3 blocs texte de types présents', typeTextsIdx.length === 3);
let nativeMenu = 0;
for (let i = 0; i < typeTextsIdx.length - 1; i++) {
  const between = comps.slice(typeTextsIdx[i] + 1, typeTextsIdx[i + 1]);
  if (between.length === 1 && isNativeSep(between[0])) nativeMenu++;
}
expect('2 séparateurs natifs entre les types en menu', nativeMenu === 2);
expect('pas de trait-texte court en mode menu non plus', !comps.some((x) => isText(x) && /━{10,}/.test(x.content)));

// ---- Intro multi-paragraphes (mode boutons) ----
console.log('\n3) Intro multi-paragraphes — séparateurs natifs entre paragraphes');
const cfgIntro = { ...base, mode: 'buttons', message: 'Premier paragraphe d’accueil.\n\nSecond paragraphe avec une consigne.\n\nTroisième paragraphe.' };
comps = containerComponents(adv.buildPanelPayload(cfgIntro));
const introTexts = comps.filter((x) => isText(x) && /paragraphe/.test(x.content));
expect('3 paragraphes d’intro affichés séparément', introTexts.length === 3);
// Entre les paragraphes (indices) il faut des séparateurs natifs.
const idxs = [];
comps.forEach((x, i) => { if (isText(x) && /paragraphe/.test(x.content)) idxs.push(i); });
let sepIntro = 0;
for (let i = 0; i < idxs.length - 1; i++) {
  const between = comps.slice(idxs[i] + 1, idxs[i + 1]);
  if (between.length === 1 && isNativeSep(between[0])) sepIntro++;
}
expect('séparateurs natifs entre chaque paragraphe d’intro', sepIntro === 2);
expect('aucun trait-texte court dans l’intro', !comps.some((x) => isText(x) && /━{10,}/.test(x.content)));

console.log(ok ? '\n🎉 Séparateurs natifs pleine largeur OK (menu + boutons + intro)' : '\n❌ à corriger');
try { fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
