// v308 — LIGNE VERTICALE DES PANNEAUX TICKETS UNIFIÉE (demande du fondateur,
// 14/09 : « la couleur rouge à côté des panneaux des tickets, les deux côtés
// doivent être pareils, pas de couleur, tous les panneaux du système des
// tickets » — il parle de la petite ligne verticale à côté des panneaux, PAS
// des boutons).
//
// Tous les panneaux du système de tickets portent désormais la MÊME ligne
// verticale, en couleur Hoxera standard #e07a5f (14711391) :
//   - panneau public classique (déjà fait en v306/v307) ;
//   - panneau public personnalisé (advancedTickets — avant : couleur du 1er
//     type, rouge chez le fondateur) ;
//   - panneau d'accueil du salon privé (avant : couleur du type) ;
//   - panneaux fermé / réouvert / pris en charge / mis en attente
//     (avant : rouge / vert / vert / orange).
// Les boutons, menus et couleurs de types configurés ne changent PAS.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v308');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const panels = require('../server/discord/panels');
const adv = require('../server/discord/advancedTickets');
const v2 = require('./helpers/v2');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const HOXERA = 0xE07A5F;

console.log('— 1. Pins de version v308 —');
const html = racine('public/index.html');
check('index.html : ?v=322 ×7', (html.match(/\?v=322/g) || []).length === 7);
check('sw.js : cache botdev-v322', racine('public/sw.js').includes("const CACHE = 'botdev-v322';"));

console.log('— 2. La petite ligne verticale est PARTOUT #e07a5f —');
store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' });

// Panneau public classique
{
  const payload = panels.buildTicketPanel({ message: '' }, {}, [], 'Serveur', 'G308');
  // v309 — plus AUCUNE ligne colorée : bordure neutre (accent absent).
  check('panneau public classique : aucune ligne colorée (v309)', v2.accentColor(payload) === undefined, String(v2.accentColor(payload)));
}

// Panneau public personnalisé — le type a une couleur ROUGE configurée :
// c'est exactement le cas du serveur du fondateur (#f37059).
{
  const cfg = adv.normalizeConfig({
    id: 1, bot_id: 1, guild_id: 'G308', name: 'Tickets personnalisés', mode: 'buttons',
    channel: '#c', message: 'choisis les ticket', image_url: '', require_reason: 1,
    types: [
      { id: 't1', label: 'ticket contre admin', emoji: '🎫', description: '', questions: [], color: '#f37059', button_style: '4', staff_roles: [] },
      { id: 't2', label: 'ticket contre joueur', emoji: '🎫', description: '', questions: [], color: '#0e30dd', button_style: '1', staff_roles: [] },
    ],
  });
  const p = adv.buildPanelPayload(cfg);
  check('panneau personnalisé : la ligne n’est PLUS la couleur du 1er type (rouge)', v2.accentColor(p) !== 0xF37059);
  check('panneau personnalisé : aucune ligne colorée (v309)', v2.accentColor(p) === undefined, String(v2.accentColor(p)));
  // Les boutons personnalisés, eux, ne bougent pas. En mode « boutons » ils
  // sont dans des Sections (accessoire), pas dans des ActionRow classiques :
  // on les cherche donc dans tout le JSON du conteneur.
  const btns = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 2 && node.style) btns.push(node);
    (node.components || []).forEach(walk);
    if (node.accessory) walk(node.accessory);
    (node.items || []).forEach(walk);
  })((p.components[0] && p.components[0].toJSON ? p.components[0].toJSON() : p.components[0]));
  check('boutons personnalisés CONSERVÉS (styles 4 et 1)', btns.some((b) => b.style === 4) && btns.some((b) => b.style === 1),
    JSON.stringify(btns.map((b) => b.style)));
}

// Panneau d'accueil du salon privé — type à couleur rouge
{
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' }, toString: () => '@Alice', guild: { name: 'Serveur' } };
  const chosen = { label: 'ticket contre admin', emoji: '🎫', description: '', staff_roles: [], color: '#f37059' };
  const welcome = panels.ticketWelcomePanel(member, chosen, '<@&R1>', 'Ma demande', '', [], 'fr', { number: 3 }, {}, { content: '' });
  check('salon privé : aucune ligne colorée malgré la couleur rouge du type (v309)', v2.accentColor(welcome) === undefined, String(v2.accentColor(welcome)));
  check('salon privé : titre intact, plus de signature (v312)', (v2.title(welcome) || '').includes('🎫') && !String(v2.footer(welcome)).includes('Hoxera'));
}

// Panneaux de cycle de vie : fermé / réouvert / pris en charge / attente
{
  const src = racine('server/discord/panels.js');
  const bloc = (titre) => {
    const i = src.indexOf(`title: '${titre}'`);
    return i >= 0 ? src.slice(Math.max(0, i - 260), i + 40) : '';
  };
  for (const [titre, ancienne] of [
    ['🔒 Ticket fermé', 'variant: \'danger\''],
    ['🔓 Ticket réouvert', 'variant: \'success\''],
    ['⏸ Ticket mis en attente', 'variant: \'warning\''],
  ]) {
    const b = bloc(titre);
    check(`panneau « ${titre} » : aucune ligne colorée (v309)`,
      b.includes('accent: false') && !b.includes(ancienne), b.slice(-120));
  }
  const claim = src.indexOf('ticket_claim_msg');
  check('panneau « 🖐️ Ticket pris en charge » : aucune ligne colorée (v309)',
    claim >= 0 && src.slice(Math.max(0, claim - 320), claim).includes('accent: false'));
}

console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log(`\n✅ v308 : ${ok} vérifications passed.`);
process.exit(ko === 0 ? 0 : 1);
