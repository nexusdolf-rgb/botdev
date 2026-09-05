// Vérification rapide du rendu du panneau « tickets personnalisés » (mode menu)
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.BOTDEV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-adv-'));
const ui = require('../server/discord/ui');
const adv = require('../server/discord/advancedTickets');

const cfg = {
  id: 'P1', bot_id: 'b1', guild_id: 'G1', mode: 'menu', name: 'Centre d’aide', channel: 'C1',
  message: 'Choisis le type qui correspond à ta demande.\n\nNotre équipe te répond rapidement en privé.',
  types: [
    { id: 't1', label: 'Support', emoji: '🎫', description: 'Une question, un problème ?', button_style: '1', color: '#e07a5f', questions: [] },
    { id: 't2', label: 'Plainte', emoji: '⚖️', description: 'Signaler un membre ou un abus.', button_style: '4', color: '#ED4245', questions: [] },
    { id: 't3', label: 'Recrutement', emoji: '📝', description: 'Candidater à l’équipe du serveur.', button_style: '3', color: '#57F287', questions: ['Quel âge as-tu ?'] },
  ],
};

let payload;
try {
  payload = adv.buildPanelPayload(cfg);
  console.log('✅ buildPanelPayload OK');
} catch (e) {
  console.log('❌ buildPanelPayload :', e.message);
  process.exit(1);
}

function collect(node, out) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.content === 'string') out.push(node.content);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => collect(x, out));
    else if (v && typeof v === 'object') collect(v, out);
  }
}
const texts = [];
collect(JSON.parse(JSON.stringify(payload)), texts);

let ok = true;
const expect = (label, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) ok = false;
};

const nbTraits = (s) => (s.split(ui.SEPARATOR).length - 1);
const msgText = texts.find((t) => t.includes('Choisis le type qui correspond'));
expect('message utilisateur structuré en sections', !!msgText && nbTraits(msgText) >= 1);
const typeText = texts.find((t) => t.includes('**Support**') && t.includes('**Plainte**'));
expect('types séparés par le trait (2 traits pour 3 types)', !!typeText && nbTraits(typeText) >= 2);
expect('contenus des types présents', typeText && typeText.includes('Signaler un membre') && typeText.includes('Candidater'));
console.log('\n--- Aperçu de la liste des types ---');
if (typeText) console.log(typeText.slice(0, 500));
console.log(ok ? '\n🎉 Panneau tickets personnalisés : structuré' : '\n❌ à corriger');
process.exit(ok ? 0 : 1);
