// v309 — « la petite ligne verticale » des panneaux tickets, ENFIN comprise
// grâce à la capture du fondateur : côté 1 = ligne colorée (à retirer),
// côté 2 = bord neutre (le résultat voulu). La ligne verticale colorée
// (accent du conteneur Components V2) est RETIRÉE de TOUS les panneaux du
// système de tickets : panneau public classique, panneau personnalisé,
// accueil du salon privé, fermé / réouvert / pris en charge / mis en
// attente / fermeture auto, DM transcription et DM évaluation, récap du
// journal. PARTOUT AILLEURS (help, giveaways, vocaux…), les panneaux
// gardent leur ligne colorée : la portée est STRICTE aux tickets.
// Rien d'autre ne change (la signature du panneau tickets était déjà
// retirée en v307 ; les boutons ne bougent pas).
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v309');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const panels = require('../server/discord/panels');
const adv = require('../server/discord/advancedTickets');
const ui = require('../server/discord/ui');
const v2 = require('./helpers/v2');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('— 1. Pins de version v309 —');
const html = racine('public/index.html');
check('index.html : ?v=322 ×7', (html.match(/\?v=322/g) || []).length === 7);
check('sw.js : cache botdev-v322', racine('public/sw.js').includes("const CACHE = 'botdev-v322';"));

console.log('— 2. Panneaux tickets : plus AUCUNE ligne colorée —');
store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' });
{
  const payload = panels.buildTicketPanel({ message: '' }, {}, [], 'Serveur', 'G309');
  check('panneau public : accent absent du JSON', !JSON.stringify(payload.components[0].toJSON()).includes('accent_color'));
  check('panneau public : tout le reste intact (titre, bannière, infos)',
    v2.title(payload).includes('Serveur') && v2.json(payload).includes('/api/tickets/panel-banner/'));
}
{
  const cfg = adv.normalizeConfig({
    id: 1, bot_id: 1, guild_id: 'G309', name: 'Perso', mode: 'buttons', channel: '#c', message: 'x',
    image_url: '', require_reason: 1,
    types: [{ id: 't1', label: 'admin', emoji: '🎫', description: '', questions: [], color: '#f37059', button_style: '4', staff_roles: [] }],
  });
  const p = adv.buildPanelPayload(cfg);
  check('panneau personnalisé : accent absent du JSON', !JSON.stringify(p.components[0].toJSON()).includes('accent_color'));
}
{
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' }, toString: () => '@Alice', guild: { name: 'Serveur' } };
  const welcome = panels.ticketWelcomePanel(member, { label: 'admin', emoji: '🎫', staff_roles: [], color: '#f37059' }, '<@&R1>', 'd', '', [], 'fr', { number: 1 }, {}, { content: '' });
  check('salon privé : accent absent du JSON', !JSON.stringify(welcome.components[0].toJSON()).includes('accent_color'));
}
{
  const src = racine('server/discord/panels.js');
  for (const titre of ['🔒 Ticket fermé', '🔓 Ticket réouvert', '⏸ Ticket mis en attente', '⏰ Ticket fermé automatiquement', '📔 Récapitulatif', '🖐️ Ticket pris en charge']) {
    const i = src.indexOf(`title: '${titre}'`);
    const i2 = src.indexOf('title: `📔 Récapitulatif');
    const pos = i >= 0 ? i : i2;
    const bloc = src.slice(Math.max(0, pos - 320), pos + 40);
    check(`« ${titre} » : aucune ligne colorée`, bloc.includes('accent: false'), bloc.slice(-100));
  }
  const dmi = src.indexOf('transcript_title');
  check('DM transcription : aucune ligne colorée', src.slice(Math.max(0, dmi - 300), dmi).includes('accent: false'));
  const ri = src.indexOf('ticket_rating_title');
  check('DM évaluation : aucune ligne colorée', src.slice(Math.max(0, ri - 300), ri).includes('accent: false'));
  // v310 — le MP de confirmation envoyé au créateur juste après la création
  // (« 🎫 Votre ticket est ouvert ») et le rappel « bientôt fermé ».
  const oi = src.indexOf("title: '🎫 Votre ticket est ouvert'");
  check('DM créateur après création : aucune ligne colorée (v310)', src.slice(Math.max(0, oi - 320), oi).includes('accent: false'));
  const wi = src.indexOf("title: '⚠️ Ticket bientôt fermé'");
  check('rappel « bientôt fermé » : aucune ligne colorée (v310)', src.slice(Math.max(0, wi - 320), wi).includes('accent: false'));
}

console.log('— 3. Portée stricte : les AUTRES panneaux gardent leur ligne —');
{
  const p = ui.v2panel({ title: 'T', description: 'A', color: '#e07a5f' });
  check('panneau ordinaire : la ligne colorée existe toujours', v2.accentColor(p) === 0xE07A5F, String(v2.accentColor(p)));
  const pv = ui.v2panel({ variant: 'warning', title: 'T', description: 'A' });
  check('panneau « warning » ordinaire : ligne conservée', typeof v2.accentColor(pv) === 'number');
}

console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log(`\n✅ v309 : ${ok} vérifications passed.`);
process.exit(ko === 0 ? 0 : 1);
