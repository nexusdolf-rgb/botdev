// v297 — ✏️ Textes SÉPARÉS : panneau BOUTON et panneau MENU déroulant.
// Vérifié : colonne menu_panel_texts + préservation + migration des configs
// partagées d'avant v297, sélection des bons textes par panneau
// (effectiveTextsRaw), reset = défauts (pas de repli sur l'autre panneau),
// routes bornées, dashboard : 2 cartes distinctes, système 3 (tickets
// personnalisés) intact, bump v297.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v297');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const panels = require('../server/discord/panels');

let ok = 0;
function check(label, cond, info) {
  assert.ok(cond, 'ÉCHEC : ' + label + (info ? ' (' + info + ')' : ''));
  ok++;
  console.log('  ✅ ' + label);
}
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const json = (x) => JSON.stringify(x.components.map((c) => (c.toJSON ? c.toJSON() : c)));

(async () => {
  const B = Number(store.bots.create({ user_id: 1, name: 'T', token: 'x', client_id: 'c', prefix: '!' }));
  const G = 'gV297';

  console.log('— 1. Base de données : colonne menu_panel_texts —');
  store.tickets.set(B, G, { name: 'Support', channel: '#general', menu_panel_texts: JSON.stringify({ title: '📜 Menu | {server}' }) });
  check('menu_panel_texts enregistré', store.tickets.get(B, G).menu_panel_texts.includes('📜 Menu'));
  store.tickets.set(B, G, { name: 'Support 2' });
  const row = store.tickets.get(B, G);
  check('menu_panel_texts préservé si non renvoyé', row.menu_panel_texts.includes('📜 Menu') && row.name === 'Support 2');
  check('panel_texts reste une colonne distincte', String(row.panel_texts || '') === '');
  store.tickets.set(B, G, { menu_panel_texts: '' });
  check('menu_panel_texts vidé sur demande', store.tickets.get(B, G).menu_panel_texts === '');

  console.log('— 2. Migration des configs partagées (avant v297) —');
  const G2 = 'gV297mig';
  store.tickets.set(B, G2, { panel_texts: JSON.stringify({ title: '🎧 Aide | {server}', menu_placeholder: 'Choisis !' }), menu_panel_texts: '' });
  // Rechargement du module db : la migration idempotente tourne au démarrage.
  const dbPath = require.resolve('../server/db');
  delete require.cache[dbPath];
  const store2 = require(dbPath);
  const mig = store2.tickets.get(B, G2);
  check('les textes partagés sont copiés côté menu au démarrage', mig.menu_panel_texts.includes('🎧 Aide') && mig.menu_panel_texts.includes('Choisis !'));
  check('panel_texts inchangé par la migration', mig.panel_texts.includes('🎧 Aide'));
  // Idempotence : une 2e passe ne doit rien casser.
  delete require.cache[dbPath];
  const store3 = require(dbPath);
  check('migration idempotente (2e démarrage identique)', store3.tickets.get(B, G2).menu_panel_texts === mig.menu_panel_texts);
  // Un reset explicite ({}) ne doit PAS être écrasé par la migration.
  store3.tickets.set(B, G2, { menu_panel_texts: '{}' });
  delete require.cache[dbPath];
  const store4 = require(dbPath);
  check('reset explicite du menu non écrasé par la migration', store4.tickets.get(B, G2).menu_panel_texts === '{}');

  console.log('— 3. Sélection des textes par panneau (effectiveTextsRaw) —');
  check('effectiveTextsRaw exporté', typeof panels.effectiveTextsRaw === 'function');
  const cfg = { panel_texts: '{"title":"B"}', menu_panel_texts: '{"title":"M"}' };
  check('panneau bouton → panel_texts', panels.effectiveTextsRaw(cfg, false) === '{"title":"B"}');
  check('panneau menu → menu_panel_texts', panels.effectiveTextsRaw(cfg, true) === '{"title":"M"}');
  check('menu jamais défini → repli migration (panel_texts)', panels.effectiveTextsRaw({ panel_texts: '{"title":"B"}', menu_panel_texts: '' }, true) === '{"title":"B"}');
  check('menu remis aux défauts ({}) → défauts, PAS le texte du bouton', panels.effectiveTextsRaw({ panel_texts: '{"title":"B"}', menu_panel_texts: '{}' }, true) === '{}');
  check('cfg vide des deux côtés → vide (défauts i18n)', panels.effectiveTextsRaw({ panel_texts: '', menu_panel_texts: '' }, true) === '');

  console.log('— 4. Câblage dans sendTicketPanel —');
  const srcPanels = racine('server/discord/panels.js');
  check('sendTicketPanel choisit les textes selon le panneau', srcPanels.includes('effectiveTextsRaw(cfg, types.length > 0)'));
  check('buildTicketPanel reçoit les textes du bon panneau', srcPanels.includes('panel_texts: effTexts'));
  check('le placeholder + le titre de nettoyage viennent des textes effectifs', srcPanels.includes('JSON.parse(effTexts'));
  check('défaut du placeholder inchangé', srcPanels.includes("|| '🗂️ Choisissez le type de ticket…'"));

  console.log('— 5. Rendu : chaque panneau ses textes, défauts intacts —');
  const pBtn = panels.buildTicketPanel({ message: '', panel_texts: '{"title":"🔧 Bouton | {server}"}' }, null, [], 'Serveur', G, []);
  const jBtn = json(pBtn);
  check('panneau bouton : titre personnalisé', jBtn.includes('🔧 Bouton | Serveur'));
  const pMenuSim = panels.buildTicketPanel({ message: '', panel_texts: panels.effectiveTextsRaw({ panel_texts: '{"title":"🔧 B"}', menu_panel_texts: '{"title":"📜 M | {server}"}' }, true) }, null, [], 'Serveur', G, []);
  check('panneau menu : son propre titre, pas celui du bouton', json(pMenuSim).includes('📜 M | Serveur') && !json(pMenuSim).includes('🔧 B'));
  const pDef = panels.buildTicketPanel({ message: '', panel_texts: '', menu_panel_texts: '' }, null, [], 'Serveur', G, []);
  const jDef = json(pDef);
  check('rien de rempli → textes par défaut exacts (titre + bienvenue)', jDef.includes('👑 Support | Serveur') && jDef.includes('Bienvenue sur le support officiel de'));
  check('menu_panel_texts seul n affecte pas buildTicketPanel directement', !jDef.includes('📜'));

  console.log('— 6. Routes —');
  const routes = racine('server/routes.js');
  check('PUT tickets accepte menu_panel_texts', routes.includes('panel_texts, menu_panel_texts } = req.body') && routes.includes('menu_panel_texts: (() => {'));
  check('menu_panel_texts borné comme panel_texts', (routes.match(/rules: String\(o\.rules \|\| ''\)\.slice\(0, 1000\)/g) || []).length === 2);
  check('texte menu Placeholder borné à 100 (2 cartes)', (routes.match(/menu_placeholder: String\(o\.menu_placeholder \|\| ''\)\.slice\(0, 100\)/g) || []).length === 2);

  console.log('— 7. Dashboard : 2 cartes séparées —');
  const dash = racine('public/js/dashboard.js');
  const iT = dash.indexOf('Dashboard.renderers.tickets');
  const chunk = dash.slice(iT, iT + 60000);
  check('carte « Textes du panneau BOUTON (optionnel) »', chunk.includes('✏️ Textes du panneau BOUTON (optionnel)'));
  check('carte « Textes du panneau MENU déroulant (optionnel) »', chunk.includes('✏️ Textes du panneau MENU déroulant (optionnel)'));
  check('ancienne carte partagée disparue', !dash.includes('✏️ Textes des panneaux (optionnel)'));
  check('champs bouton (5, sans placeholder)', ['tp-title', 'tp-welcome', 'tp-info', 'tp-rules', 'tp-patience'].every((id) => chunk.includes(id)) && !chunk.includes('tp-placeholder'));
  check('champs menu (6, avec placeholder)', ['mp-title', 'mp-welcome', 'mp-placeholder', 'mp-info', 'mp-rules', 'mp-patience'].every((id) => chunk.includes(id)));
  check('bouton enregistre panel_texts, menu enregistre menu_panel_texts', chunk.includes('panel_texts: obj') && chunk.includes('menu_panel_texts: obj'));
  check('2 boutons reset (tp-reset + mp-reset)', chunk.includes('tp-reset') && chunk.includes('mp-reset'));
  check('carte menu affiche les textes effectifs (repli migration)', chunk.includes("String(t.menu_panel_texts || '').trim() || String(t.panel_texts || '')"));
  check('chaque carte précise à quel panneau elle s applique', chunk.includes('UNIQUENT au panneau bouton'.replace('UNIQUENT', 'UNIQUEMENT')) && chunk.includes('UNIQUEMENT au panneau menu'));

  console.log('— 8. Système 3 (tickets personnalisés) : intact et séparé —');
  check('adv-placeholder + adv-footer toujours présents', dash.includes('adv-placeholder') && dash.includes('adv-footer'));
  check('adv-save envoie toujours ses 2 textes', dash.includes('menu_placeholder: c3.querySelector') && dash.includes('footer_text: c3.querySelector'));
  const adv = require('../server/discord/advancedTickets');
  const cfgAdv = (over = {}) => ({ id: 1, bot_id: B, guild_id: G, name: 'Tickets', mode: 'menu', types: [{ id: 't1', label: 'Aide', color: '#e07a5f' }], ...over });
  const jAdv = json(adv.buildPanelPayload(cfgAdv({ menu_placeholder: 'Choisis !', footer_text: 'Pied perso' })));
  check('panneau personnalisé : placeholder + pied personnalisés', jAdv.includes('Choisis !') && jAdv.includes('-# Pied perso'));
  const jAdvDef = json(adv.buildPanelPayload(cfgAdv()));
  check('panneau personnalisé : défauts conservés', jAdvDef.includes('🗂️ Choisissez un type de ticket…') && jAdvDef.includes('Hoxera · Support privé'));

  console.log('— 9. Bump v297 —');
  const index = racine('public/index.html');
  check('index.html : ?v=298 référencé 7 fois', (index.match(/\?v=298/g) || []).length === 7, String((index.match(/\?v=298/g) || []).length));
  check('sw.js : cache « botdev-v298 »', racine('public/sw.js').includes("const CACHE = 'botdev-v298';"));

  console.log(`\n🎉 v297 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
