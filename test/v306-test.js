// v306 — FINITIONS VISUELLES DEMANDÉES PAR LE FONDATEUR (14/09) :
//  1. Le panneau de tickets n'a plus la ligne ROUGE sur le côté : la couleur
//     d'accent « #ED4245 » donnait un air « en erreur ». Il passe à la
//     couleur Hoxera standard « #e07a5f », comme les autres panneaux.
//  2. La signature « Hoxera · {serveur} » sous les panneaux est RETIRÉE de
//     partout : le moteur ui.v2container n'affiche plus aucun pied commençant
//     par « Hoxera · » (défaut compris). Survivent uniquement :
//       - une DATE explicite (timestamp: new Date) — ex. starboard ;
//       - un pied réellement personnalisé par l'admin (tickets avancés,
//         footer_text ne commençant pas par « Hoxera · »).
//  Les panneaux déjà envoyés sur Discord gardent leur ancienne apparence :
//  renvoyer un panneau (dashboard) applique le nouveau style.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v306');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const ui = require('../server/discord/ui');
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
const brut = (p) => JSON.stringify(p.components ? p.components.map((c) => (c && c.toJSON ? c.toJSON() : c)) : p);

console.log('— 1. Pins de version v306 —');
const html = racine('public/index.html');
check('index.html : ?v=306 ×7', (html.match(/\?v=306/g) || []).length === 7);
check('sw.js : cache botdev-v306', racine('public/sw.js').includes("const CACHE = 'botdev-v306';"));

console.log('— 2. Panneau tickets : plus de rouge, couleur Hoxera —');
const SERVEUR = 'Serveur de Test';
const payload = panels.buildTicketPanel({ message: '' }, {}, [], SERVEUR, 'G306');
const jsonTicket = brut(payload);
check('le rouge #ED4245 a disparu du panneau tickets', !jsonTicket.includes('15548997'));
check('couleur Hoxera standard #e07a5f appliquée', jsonTicket.includes('14711391'));
check('le panneau reste valide (audit Discord)', ui.v2Audit(payload).length === 0, ui.v2Audit(payload).join(' · '));
check('le titre du panneau est conservé', v2.title(payload).includes(SERVEUR), v2.title(payload));

console.log('— 3. Signature « Hoxera · … » retirée de TOUS les panneaux —');
check('pied par défaut : plus aucune signature', v2.footer(ui.v2panel({ title: 'T', description: 'A' })) === '');
check('pied explicite « Hoxera · X » : retiré au rendu',
  v2.footer(ui.v2panel({ title: 'T', description: 'A', footer: 'Hoxera · Mon serveur' })) === '');
check('pied du panneau tickets : retiré', v2.footer(payload) === '', v2.footer(payload));
check('aucun texte discret « -# Hoxera » dans le panneau tickets', !brut(payload).includes('-# Hoxera'));

console.log('— 4. Ce qui doit SURVIVRE —');
{
  const pDate = ui.v2panel({ title: 'T', description: 'A', footer: 'Hoxera · X', timestamp: new Date(2024, 0, 5, 14, 30) });
  const f = v2.footer(pDate);
  check('une Date EXPLICITE reste affichée seule (starboard)', /\d{2}\/\d{2} \d{2}:\d{2}/.test(f) && !f.includes('Hoxera'), f);
  const pPerso = ui.v2panel({ title: 'T', description: 'A', footer: 'Support de MonServeur' });
  check('un pied personnalisé (non signé Hoxera) est CONSERVÉ', v2.footer(pPerso) === 'Support de MonServeur', v2.footer(pPerso));
  check('footer:false : aucun pied non plus', v2.footer(ui.v2panel({ title: 'T', description: 'A', footer: false })) === '');
}

console.log('— 5. Tickets avancés : signature retirée, pied admin conservé —');
{
  const cfgBase = adv.normalizeConfig({ id: 1, bot_id: 1, guild_id: 'G306', name: 'Tickets', mode: 'menu', channel: '#c', message: '', image_url: '', require_reason: 1, types: [{ label: 'Aide', id: 't1' }] });
  const jDef = brut(adv.buildPanelPayload(cfgBase));
  check('pied par défaut : signature « Hoxera · Support privé » retirée', !jDef.includes('Hoxera · Support privé'));
  const cfgPerso = adv.normalizeConfig({ ...cfgBase, footer_text: 'Bienvenue chez nous' });
  const jPerso = brut(adv.buildPanelPayload(cfgPerso));
  check('footer_text admin : affiché', jPerso.includes('-# Bienvenue chez nous'));
  const cfgSigne = adv.normalizeConfig({ ...cfgBase, footer_text: 'Hoxera · Support privé · Choisissez une option pour commencer' });
  check('footer_text qui reproduit la signature : retiré aussi', !brut(adv.buildPanelPayload(cfgSigne)).includes('Hoxera · Support privé'));
}

console.log('— 6. Le reste du panneau tickets est INTACT —');
{
  const textes = v2.texts(payload);
  check('bienvenue conservée', textes.some((t) => t.includes(`Bienvenue sur le support officiel de ${SERVEUR}`)));
  check('rubrique informations conservée', textes.some((t) => t.includes('Informations importantes')));
  check('patience conservée', textes.some((t) => t.includes('Merci de votre patience')));
  check('bannière conservée (MediaGallery)', jsonTicket.includes('/api/tickets/panel-banner/'));
}

console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌ sur ${ok + ko} vérifications`);
if (fails.length) { console.log('Échecs :'); fails.forEach((f) => console.log('  ❌ ' + f)); }
console.log(`\n✅ v306 : ${ok} vérifications passed.`);
process.exit(ko === 0 ? 0 : 1);
