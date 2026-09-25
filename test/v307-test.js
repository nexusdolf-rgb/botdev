// v307 — RECTIFICATION DE PORTÉE (demande du fondateur, 14/09) : la v306
// avait retiré la signature « Hoxera · … » de SOUS TOUS les panneaux ; le
// fondateur ne voulait l'enlever QUE du panneau de tickets. La v307 :
//  - GARDE sur le panneau tickets : couleur Hoxera standard #e07a5f (plus de
//    ligne rouge) et AUCUNE signature sous le panneau ;
//  - RÉTABLIT la signature partout ailleurs (suggestions, giveaways, tickets
//    avancés, salon privé, panneaux par défaut…).
// Le moteur ui.v2container est revenu à son comportement historique ; seul
// l'appelant du panneau tickets passe `footer: false`.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v307');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ui = require('../server/discord/ui');
const panels = require('../server/discord/panels');
const suggest = require('../server/discord/suggest');
const adv = require('../server/discord/advancedTickets');
const v2 = require('./helpers/v2');

let ok = 0, ko = 0;
const fails = [];
function check(label, cond, info) {
  if (cond) { ok++; console.log('  ✅ ' + label); }
  else { ko++; fails.push(label + (info ? ' — ' + info : '')); console.log('  ❌ ' + label + (info ? ' — ' + info : '')); }
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const brut = (p) => JSON.stringify(p.components ? p.components.map((c) => (c && c.toJSON ? c.toJSON() : c)) : p);

console.log('— 1. Pins de version v307 —');
const html = racine('public/index.html');
check('index.html : ?v=325 ×7', (html.match(/\?v=325/g) || []).length === 7);
check('sw.js : cache botdev-v325', racine('public/sw.js').includes("const CACHE = 'botdev-v325';"));

console.log('— 2. Panneau tickets : plus de rouge, plus de signature —');
const SERVEUR = 'Serveur de Test';
store.bots.create({ user_id: 1, name: 'B', token: 'x', client_id: 'c', prefix: '!' });
const payload = panels.buildTicketPanel({ message: '' }, {}, [], SERVEUR, 'G307');
const jsonTicket = brut(payload);
check('le rouge #ED4245 a disparu du panneau tickets', !jsonTicket.includes('15548997'));
// v309 — plus AUCUNE ligne colorée sur les panneaux tickets (bordure neutre).
check('aucune ligne colorée sur le panneau tickets (v309)', !jsonTicket.includes('accent_color'));
check('AUCUNE signature sous le panneau tickets', v2.footer(payload) === '' && !jsonTicket.includes('-# Hoxera'), v2.footer(payload));
check('le panneau reste valide (audit Discord)', ui.v2Audit(payload).length === 0, ui.v2Audit(payload).join(' · '));
const textes = v2.texts(payload);
check('titre conservé', v2.title(payload).includes(SERVEUR), v2.title(payload));
check('bienvenue conservée', textes.some((t) => t.includes(`Bienvenue sur le support officiel de ${SERVEUR}`)));
check('patience conservée', textes.some((t) => t.includes('Merci de votre patience')));

console.log('— 3. v312 : plus AUCUNE signature sous les panneaux —');
check('pied par défaut des panneaux : plus de signature',
  !v2.footer(ui.v2panel({ title: 'T', description: 'A' })).includes('Hoxera'), v2.footer(ui.v2panel({ title: 'T', description: 'A' })));
{
  const pSug = suggest.buildPanel({ id: 3, status: 'pending', upvotes: 0, downvotes: 0, bot_id: 1, text: 'Idée' }, 'Toto', {});
  check('suggestions : plus de signature', !String(v2.footer(pSug)).includes('Hoxera'), v2.footer(pSug));
}
{
  const cfg = adv.normalizeConfig({ id: 9, bot_id: 1, guild_id: 'G307', name: 'Tickets', mode: 'menu', channel: '#c', message: '', image_url: '', require_reason: 1, types: [{ label: 'Aide', id: 't1' }] });
  check('tickets avancés : plus de pied par défaut Hoxera',
    !brut(adv.buildPanelPayload(cfg)).includes('Hoxera · Support privé'));
}
{
  const member = { id: 'u1', user: { id: 'u1', username: 'Alice', displayAvatarURL: () => 'https://cdn/a.png' }, toString: () => '@Alice', guild: { name: SERVEUR } };
  const welcome = panels.ticketWelcomePanel(member, { label: 'Support', emoji: '🎫', staff_roles: [], color: '#5865F2' }, '<@&R1>', 'Ma demande', '', [], 'fr', { number: 7 }, {}, { content: '' });
  check('salon privé : plus de signature « Hoxera · Ticket #7 »', !String(v2.footer(welcome)).includes('Hoxera'), v2.footer(welcome));
}

console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log(`\n✅ v307 : ${ok} vérifications passed.`);
process.exit(ko === 0 ? 0 : 1);
