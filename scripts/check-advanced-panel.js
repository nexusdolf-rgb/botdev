// Vérification rapide du panneau « tickets personnalisés » — modes menu ET boutons.
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-adv-'));
const ui = require('../server/discord/ui');
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

function textsInOrder(payload) {
  // Série le payload puis parcourt les nœuds : les contenus textes sortent
  // dans l'ORDRE du document (titre → message → sections → …).
  const out = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') out.push(node.content);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  })(JSON.parse(JSON.stringify(payload)));
  return out;
}

const isTrait = (s) => s === ui.SEPARATOR;
let ok = true;
const expect = (label, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) ok = false;
};

// ---- MENU ----
console.log('1) Mode MENU');
let texts = textsInOrder(adv.buildPanelPayload({ ...base, mode: 'menu' }));
expect('traits présents dans le texte des types', texts.some((t) => t.split(ui.SEPARATOR).length - 1 >= 2));

// ---- BOUTONS ----
console.log('\n2) Mode BOUTONS — un trait EN DESSOUS de chaque bloc bouton');
texts = textsInOrder(adv.buildPanelPayload({ ...base, mode: 'buttons' }));
const traits = texts.filter(isTrait);
expect(`3 types → 2 traits (pas après le dernier)`, traits.length === 2);
// Ordre : bloc Support → trait → bloc Plainte → trait → bloc Recrutement.
const idxSupport = texts.findIndex((t) => t.includes('### 🎫 Support'));
const idxPlainte = texts.findIndex((t) => t.includes('### ⚖️ Plainte'));
const idxRecrut = texts.findIndex((t) => t.includes('### 📝 Recrutement'));
expect('trait entre Support et Plainte', idxSupport !== -1 && idxPlainte > idxSupport && isTrait(texts[idxPlainte - 1]));
expect('trait entre Plainte et Recrutement', idxRecrut > idxPlainte && isTrait(texts[idxRecrut - 1]));
expect('pas de trait orphelin après le dernier bloc', texts.slice(idxRecrut + 1).filter(isTrait).length === 0);
console.log('  (aperçu ordre : ' + ['…', '…', '…'].map((x, i) => {
  const names = texts.filter((t) => t.startsWith('### ')).map((t) => t.slice(4).split('\n')[0]);
  return names[i];
}).join(' | ') + ')');

console.log(ok ? '\n🎉 Mode boutons : trait après chaque bloc ✅' : '\n❌ à corriger');
try { fs.rmSync(process.env.BOTDEV_DATA_DIR, { recursive: true, force: true }); } catch {}
process.exit(ok ? 0 : 1);
