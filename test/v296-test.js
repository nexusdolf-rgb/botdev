// v296 — ✏️ Textes des panneaux de tickets modifiables (défaut conservé).
// Vérifié : colonne panel_texts (tickets) + menu_placeholder/footer_text
// (tickets personnalisés), textes par défaut intacts quand rien n'est rempli,
// textes personnalisés appliqués (titre, bienvenue, placeholder, bloc infos,
// patience, pied), nettoyage des anciens panneaux avec titre personnalisé,
// routes, dashboard, bump.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-v296');
fs.rmSync(TMP, { recursive: true, force: true });
process.env.BOTDEV_DATA_DIR = TMP;
fs.mkdirSync(TMP, { recursive: true });

const store = require('../server/db');
const panels = require('../server/discord/panels');
const adv = require('../server/discord/advancedTickets');

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
  const G = 'gV296';

  console.log('— 1. Base de données —');
  store.tickets.set(B, G, { name: 'Support', channel: '#general', panel_texts: JSON.stringify({ title: '🎧 Aide | {server}' }) });
  check('panel_texts enregistré', store.tickets.get(B, G).panel_texts.includes('🎧 Aide'));
  store.tickets.set(B, G, { name: 'Support', channel: '#general' });
  check('panel_texts préservé si non renvoyé', store.tickets.get(B, G).panel_texts.includes('🎧 Aide'));
  store.tickets.set(B, G, { panel_texts: '' });
  check('panel_texts vidé sur demande', store.tickets.get(B, G).panel_texts === '');
  store.advancedTickets.set(B, G, { name: 'Tickets', mode: 'menu', types: [{ label: 'Aide' }], menu_placeholder: 'Choisis !', footer_text: 'Mon pied' });
  let at = store.advancedTickets.get(B, G);
  check('menu_placeholder + footer_text enregistrés', at.menu_placeholder === 'Choisis !' && at.footer_text === 'Mon pied');
  store.advancedTickets.set(B, G, { name: 'Tickets', mode: 'menu', types: [{ label: 'Aide' }] });
  at = store.advancedTickets.get(B, G);
  check('les 2 textes sont préservés si non renvoyés', at.menu_placeholder === 'Choisis !' && at.footer_text === 'Mon pied');

  console.log('— 2. Panneau par défaut (rien de rempli) —');
  const def = panels.buildTicketPanel({ message: '', panel_texts: '' }, null, [], 'MonServeur', G, []);
  const jd = json(def);
  check('titre par défaut', jd.includes('👑 Support | MonServeur'));
  check('bienvenue par défaut', jd.includes('Bienvenue sur le support officiel de MonServeur'));
  check('règles par défaut (4 puces)', jd.includes('Soyez clair et précis') && jd.includes('strictement interdit') && jd.includes('mentions inutiles') && jd.includes('inactifs pendant 2 heures'));
  check('patience par défaut', jd.includes('Merci de votre patience'));
  check('titre du bloc infos par défaut', jd.includes('Informations importantes'));

  console.log('— 3. Panneau personnalisé —');
  const custom = panels.buildTicketPanel({
    message: '',
    panel_texts: JSON.stringify({
      title: '🎧 Assistance {server}',
      welcome: 'Salut et bienvenue sur {server} !',
      info_title: '📌 À lire',
      rules: '• Une ligne\n• Deux lignes\n\n• Trois lignes',
      patience: '⏳ On arrive vite !',
    }),
  }, null, [], 'MonServeur', G, []);
  const jc = json(custom);
  check('titre personnalisé + {server} remplacé', jc.includes('🎧 Assistance MonServeur') && !jc.includes('👑 Support |'));
  check('bienvenue personnalisée', jc.includes('Salut et bienvenue sur MonServeur !'));
  check('bloc infos personnalisé', jc.includes('📌 À lire') && !jc.includes('Informations importantes'));
  check('puces personnalisées (lignes vides ignorées)', jc.includes('Une ligne') && jc.includes('Deux lignes') && jc.includes('Trois lignes') && !jc.includes('Soyez clair'));
  check('patience personnalisée', jc.includes('On arrive vite !') && !jc.includes('Merci de votre patience'));
  const partial = panels.buildTicketPanel({ message: '', panel_texts: JSON.stringify({ title: '✨ Titre seul' }) }, null, [], 'S', G, []);
  const jp = json(partial);
  check('champ vide = texte par défaut (mixte)', jp.includes('✨ Titre seul') && jp.includes('Bienvenue sur le support officiel de S') && jp.includes('Merci de votre patience'));
  const broken = panels.buildTicketPanel({ message: '', panel_texts: '{ json cassé' }, null, [], 'S', G, []);
  check('JSON cassé → textes par défaut, aucune erreur', json(broken).includes('👑 Support | S'));

  console.log('— 4. Nettoyage des anciens panneaux —');
  const deleted = [];
  const mkMsg = (id, title) => ({ embeds: [{ title }], components: [], delete: async () => { deleted.push(id); } });
  const channel = { messages: { fetch: async () => new Map([
    ['a', mkMsg('a', '👑 Support | MonServeur')],
    ['b', mkMsg('b', '🎧 Assistance MonServeur')],
    ['c', mkMsg('c', 'Message ordinaire')],
  ]) } };
  await panels.pruneOldPanels(channel, '', '🎧 Assistance ');
  check('titre par défaut ET titre personnalisé supprimés', deleted.length === 2 && deleted.includes('a') && deleted.includes('b'), deleted.join(','));
  check('message ordinaire jamais supprimé', !deleted.includes('c'));
  const deleted2 = [];
  const channel2 = { messages: { fetch: async () => new Map([['b', { embeds: [{ title: '🎧 Assistance X' }], components: [], delete: async () => { deleted2.push('b'); } }]]) } };
  await panels.pruneOldPanels(channel2, '');
  check('sans préfixe personnalisé : seul le titre par défaut est reconnu', deleted2.length === 0);

  console.log('— 5. Panneau « Système de tickets personnalisés » —');
  const cfgAdv = (over = {}) => adv.normalizeConfig({ id: 7, bot_id: B, guild_id: G, name: 'Tickets', mode: 'menu', channel: '#c', message: '', image_url: '', require_reason: 1, types: [{ label: 'Aide', id: 't1' }], ...over });
  const jAdv = json(adv.buildPanelPayload(cfgAdv()));
  check('placeholder par défaut', jAdv.includes('Choisissez un type de ticket…'));
  check('pied par défaut', jAdv.includes('Hoxera · Support privé · Choisissez une option pour commencer'));
  const jAdv2 = json(adv.buildPanelPayload(cfgAdv({ menu_placeholder: 'Choisis !', footer_text: 'Support de MonServeur' })));
  check('placeholder personnalisé', jAdv2.includes('Choisis !') && !jAdv2.includes('Choisissez un type de ticket…'));
  check('pied personnalisé (petit texte conservé)', jAdv2.includes('-# Support de MonServeur') && !jAdv2.includes('Support privé'));
  const jAdv3 = json(adv.buildPanelPayload(cfgAdv({ mode: 'buttons', menu_placeholder: 'Choisis !', footer_text: 'Pied' })));
  check('mode boutons : pied personnalisé aussi', jAdv3.includes('-# Pied'));

  console.log('— 6. Routes —');
  const routes = racine('server/routes.js');
  check('PUT tickets accepte panel_texts', routes.includes('image_url, panel_texts') && routes.includes('panel_texts: (() => {')); // v297 : menu_panel_texts ajouté dans la déstructure
  check('panel_texts borné (titres 100, règles 1000…)', routes.includes("rules: String(o.rules || '').slice(0, 1000)") && routes.includes("title: String(o.title || '').slice(0, 100)"));
  check('PUT advanced-tickets accepte les 2 textes', routes.includes('menu_placeholder: body.menu_placeholder !== undefined') && routes.includes('footer_text: body.footer_text !== undefined'));

  console.log('— 7. Dashboard —');
  const dash = racine('public/js/dashboard.js');
  const iT = dash.indexOf('Dashboard.renderers.tickets');
  const chunk = dash.slice(iT, iT + 40000);
  check('carte « Textes du panneau BOUTON (optionnel) »', chunk.includes("✏️ Textes du panneau BOUTON (optionnel)") && chunk.includes('tp-save')); // v297 : séparée en 2 cartes
  check('5 champs bouton : titre, bienvenue, infos, règles, patience', ['tp-title', 'tp-welcome', 'tp-info', 'tp-rules', 'tp-patience'].every((id) => chunk.includes(id))); // v297 : le placeholder vit dans la carte menu (mp-placeholder)
  check('bouton « Revenir aux textes par défaut »', chunk.includes('tp-reset') && chunk.includes('Revenir aux textes par défaut'));
  check('les placeholders montrent les textes par défaut', chunk.includes('placeholder="👑 Support | {server}"') && chunk.includes('Soyez clair et précis dans votre demande.'));
  check('tickets personnalisés : 2 champs ajoutés + envoyés', dash.includes('adv-placeholder') && dash.includes('adv-footer') && dash.includes('menu_placeholder: c3.querySelector'));

  console.log('— 8. Bump v296 —');
  const index = racine('public/index.html');
  check('index.html : ?v=307 référencé 7 fois', (index.match(/\?v=307/g) || []).length === 7,
    String((index.match(/\?v=307/g) || []).length));
  check('sw.js : cache « botdev-v307 »', racine('public/sw.js').includes("const CACHE = 'botdev-v307';"));

  console.log(`\n🎉 v296 : ${ok} vérifications passées`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
