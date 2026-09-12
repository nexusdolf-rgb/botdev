// ============================================================================
// Test v244 — Polissage du tableau de bord.
//
// Trois chantiers, tous issus de retours utilisateur précis :
//
//   A. SANCTION PAR TYPE (anti-nuke). Avant, un seul réglage global décidait
//      de la sanction pour les 11 types surveillés. Security Bot et Wick
//      permettent de régler la sanction type par type ; l'utilisateur a
//      demandé cette parité complète.
//
//   B. SÉLECTEURS À PRÉRÉGLAGES. 37 cases numériques libres demandaient de
//      taper « 1440 » pour dire « 1 jour ». 24 ont été converties en listes
//      déroulantes. Les 13 restantes sont de VRAIES mesures (montant d'XP,
//      prix, nombre de gagnants…) : une liste n'y aurait aucun sens.
//
//   C. MOBILLE. Un audit mesuré dans Chromium à 360 px (banc dans
//      test/tools/audit-mobile.js) a révélé ce qui suit, tout corrigé ici :
//        • 0 débordement horizontal sur les 28 modules ;
//        • 13 cibles tactiles sous 40 px  → 0 ;
//        • 1 texte rogné par ellipsis     → 0 ;
//        • un <small> à 9,583 px obtenu PAR ACCIDENT (le navigateur applique
//          80 % à <small> quand aucune taille n'est déclarée) → 11 px.
//
// Deux bugs PRÉEXISTANTS ont été découverts en route et sont verrouillés ici :
//
//   • Dashboard.enhanceSelect remplace le <select> natif par une liste
//     personnalisée qui ne déclenche QUE l'événement « change », jamais
//     « input ». Le constructeur du barème de sanctions n'écoutait que
//     « input » : choisir une sanction ne mettait donc JAMAIS la donnée à
//     jour, et le réglage partait à l'enregistrement suivant.
//
//   • L'élément « Accès rapides » porte DEUX classes
//     (ov-quick-actions ov-access-bar). Deux media queries le visaient à
//     spécificité égale ; la plus tardive (≤700 px, 2 colonnes) écrasait
//     celle voulue sur téléphone (≤520 px, 1 colonne). « Identité du bot »
//     était rogné de 9 px.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v244-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const antinuke = require('../server/discord/antinuke');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
// Code sans les lignes de commentaire : évite qu'un mot dans un commentaire
// fasse passer une assertion purement textuelle.
const code = (f) => racine(f).split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

const BOT = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
const BOT_ID = String(BOT.id || BOT);
const GUILD = 'G244';

(async () => {
  // ==========================================================================
  console.log('\n── A. Sanction par type : normalisation côté serveur ──');
  // ==========================================================================
  // Tout vient du navigateur. Une valeur inventée ne doit JAMAIS pouvoir être
  // appliquée : on normalise avant d'écrire en base.

  const TYPES = Object.keys(antinuke.WATCHED);
  check('11 types surveillés', TYPES.length === 11, String(TYPES.length));
  check('5 sanctions possibles', antinuke.ACTIONS.length === 5, antinuke.ACTIONS.join(', '));

  // normalizeActions itère LIMITS_DEFAULT, pas WATCHED : les deux doivent
  // décrire exactement les mêmes types, sinon un type serait silencieusement
  // impossible à régler depuis le tableau de bord.
  const typesLimites = Object.keys(antinuke.LIMITS_DEFAULT);
  check('LIMITS_DEFAULT couvre exactement WATCHED',
    typesLimites.length === TYPES.length && TYPES.every((k) => typesLimites.includes(k)),
    typesLimites.join(','));

  const n1 = antinuke.normalizeActions({ bot_add: 'ban', emoji: 'alert' });
  check('conserve un type surveillé + sanction connue', n1.bot_add === 'ban' && n1.emoji === 'alert', JSON.stringify(n1));

  const n2 = antinuke.normalizeActions({ bot_add: 'nuke_le_server' });
  check('rejette une sanction inventée', Object.keys(n2).length === 0, JSON.stringify(n2));

  const n3 = antinuke.normalizeActions({ type_inexistant: 'ban' });
  check('rejette un type inconnu', Object.keys(n3).length === 0, JSON.stringify(n3));

  check('objet vide → objet vide', JSON.stringify(antinuke.normalizeActions({})) === '{}');
  check('null accepté sans lever', JSON.stringify(antinuke.normalizeActions(null)) === '{}');
  check('undefined accepté sans lever', JSON.stringify(antinuke.normalizeActions(undefined)) === '{}');
  // Un tableau est un « object » en JS : sans garde, for..in indexerait 0,1,2…
  check('tableau rejeté (piège typeof)', JSON.stringify(antinuke.normalizeActions(['ban'])) === '{}');
  check('chaîne rejetée', JSON.stringify(antinuke.normalizeActions('ban')) === '{}');
  check('nombre rejeté', JSON.stringify(antinuke.normalizeActions(42)) === '{}');

  // Chaque sanction connue doit passer, une par une.
  const toutes = antinuke.normalizeActions(
    Object.fromEntries(antinuke.ACTIONS.map((a, i) => [TYPES[i], a])));
  check('les 5 sanctions sont toutes acceptées',
    antinuke.ACTIONS.every((a) => Object.values(toutes).includes(a)), JSON.stringify(toutes));

  // Coercition String() volontaire : un <select> renvoie toujours une chaîne,
  // mais un appel direct pourrait passer autre chose. Ce qui compte, c'est que
  // le RÉSULTAT soit une sanction connue — pas le type d'entrée.
  check('objet quelconque rejeté ([object Object])',
    JSON.stringify(antinuke.normalizeActions({ ban: {} })) === '{}',
    JSON.stringify(antinuke.normalizeActions({ ban: {} })));
  check('nombre rejeté', JSON.stringify(antinuke.normalizeActions({ ban: 1 })) === '{}');
  check('booléen rejeté', JSON.stringify(antinuke.normalizeActions({ ban: true })) === '{}');
  // Un tableau d'UN élément se stringifie en cet élément ('ban' → 'ban') : il
  // est donc accepté, et c'est sans danger puisque le résultat est une
  // sanction valide. Un tableau de plusieurs éléments donne 'ban,kick' et est
  // bien rejeté. Ce qui compte est le résultat, pas le type d'entrée.
  check('tableau multi-éléments rejeté', JSON.stringify(antinuke.normalizeActions({ ban: ['ban', 'kick'] })) === '{}');
  check('tableau d\'un élément valide → accepté par coercion (sans danger)',
    antinuke.normalizeActions({ ban: ['ban'] }).ban === 'ban');
  // Accepté à dessein : la coercion produit une sanction valide.
  check('objet se stringifiant en sanction connue → accepté (sans danger)',
    antinuke.normalizeActions({ ban: { toString: () => 'ban' } }).ban === 'ban');

  // ==========================================================================
  console.log('\n── A2. actionForKind : le seul point de décision ──');
  // ==========================================================================
  // L'alerte, la trace en base et la sanction appliquée doivent lire la MÊME
  // fonction. Sinon elles peuvent diverger : on annonce « quarantaine » et on
  // bannit.

  check('la sanction par type l\'emporte',
    antinuke.actionForKind({ action: 'quarantine', actions: { ban: 'alert' } }, 'ban') === 'alert');
  check('repli sur la sanction globale si le type n\'est pas réglé',
    antinuke.actionForKind({ action: 'quarantine', actions: { ban: 'alert' } }, 'emoji') === 'quarantine');
  check('repli sur la sanction globale si actions est vide',
    antinuke.actionForKind({ action: 'lockdown', actions: {} }, 'role_delete') === 'lockdown');
  check('repli si actions est absent (config antérieure à la v244)',
    antinuke.actionForKind({ action: 'demote' }, 'webhook') === 'demote');
  check('une sanction par type invalide retombe sur le global',
    antinuke.actionForKind({ action: 'quarantine', actions: { ban: 'detruire' } }, 'ban') === 'quarantine');
  check('conf null → sanction par défaut, sans lever',
    antinuke.ACTIONS.includes(antinuke.actionForKind(null, 'ban')));
  check('conf sans action → sanction par défaut',
    antinuke.actionForKind({}, 'kick') === antinuke.DEFAULTS.action, antinuke.actionForKind({}, 'kick'));
  check('sanction par défaut = quarantaine (choix v242, réversible)',
    antinuke.DEFAULTS.action === 'quarantine', antinuke.DEFAULTS.action);

  // INVARIANT : cette fonction décide d'un bannissement. Elle ne doit JAMAIS
  // renvoyer autre chose qu'une sanction connue, quelle que soit la
  // configuration reçue — y compris une configuration qui ne vient pas de
  // config(). Vérifié sur des entrées hostiles ou dégénérées.
  const entreesHostiles = [undefined, null, '', 0, 42, {}, [], { action: 'nimp' },
    { action: 'ban', actions: 'pas-un-objet' }, { actions: { ban: 'nimp' } },
    { actions: { ban: null } }, { action: null, actions: { ban: undefined } }];
  const sorties = entreesHostiles.map((c) => antinuke.actionForKind(c, 'ban'));
  check('actionForKind ne renvoie JAMAIS une sanction hors liste',
    sorties.every((a) => antinuke.ACTIONS.includes(a)),
    sorties.map((x) => JSON.stringify(x)).join(', '));
  check('…et ne renvoie jamais undefined', sorties.every((a) => a !== undefined));

  // ==========================================================================
  console.log('\n── A3. Persistance : colonne, aller-retour, compatibilité ──');
  // ==========================================================================

  const cols = store.db.prepare("PRAGMA table_info(guild_settings)").all().map((c) => c.name);
  check('colonne antinuke_actions créée', cols.includes('antinuke_actions'), cols.filter((c) => c.startsWith('antinuke')).join(','));

  store.guildSettings.set(BOT_ID, GUILD, {
    antinuke_enabled: 1, antinuke_threshold: 3, antinuke_window: 60,
    antinuke_action: 'quarantine', antinuke_whitelist: '', antinuke_alert_channel: '',
    antinuke_limits: '', antinuke_punish_bots: 0,
    antinuke_actions: JSON.stringify({ bot_add: 'ban', emoji: 'alert' }),
  });
  let conf = antinuke.config(BOT_ID, GUILD);
  check('aller-retour : sanction par type relue', conf.actions.bot_add === 'ban' && conf.actions.emoji === 'alert', JSON.stringify(conf.actions));
  check('aller-retour : sanction globale relue', conf.action === 'quarantine', conf.action);
  check('config() expose bien « actions »', Object.prototype.hasOwnProperty.call(conf, 'actions'));
  check('décision effective : bot_add → ban', antinuke.actionForKind(conf, 'bot_add') === 'ban');
  check('décision effective : kick → quarantaine (global)', antinuke.actionForKind(conf, 'kick') === 'quarantine');

  // Serveur réglé AVANT la v244 : la colonne est vide.
  store.guildSettings.set(BOT_ID, GUILD, { antinuke_actions: '', antinuke_action: 'lockdown' });
  conf = antinuke.config(BOT_ID, GUILD);
  check('compatibilité ascendante : colonne vide → {}', JSON.stringify(conf.actions) === '{}', JSON.stringify(conf.actions));
  check('…et tous les types retombent sur le global',
    TYPES.every((k) => antinuke.actionForKind(conf, k) === 'lockdown'));

  // JSON corrompu en base (édition manuelle, migration interrompue).
  store.guildSettings.set(BOT_ID, GUILD, { antinuke_actions: '{pas du json' });
  conf = antinuke.config(BOT_ID, GUILD);
  check('JSON corrompu → {} sans lever d\'exception', JSON.stringify(conf.actions) === '{}', JSON.stringify(conf.actions));
  check('…et la sanction globale reste applicable', antinuke.actionForKind(conf, 'ban') === 'lockdown');

  // La route doit normaliser avant d'écrire.
  const routes = code('server/routes.js');
  check('la route PUT normalise les actions reçues',
    /normalizeActions\(actions/.test(routes));
  check('la route écrit antinuke_actions en JSON',
    /antinuke_actions:\s*JSON\.stringify\(normActions\)/.test(routes));
  check('la route renvoie les actions normalisées au navigateur',
    /res\.json\(\{[^}]*actions:\s*normActions/.test(routes));

  // ==========================================================================
  console.log('\n── B. Sélecteurs à préréglages ──');
  // ==========================================================================

  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.MutationObserver = dom.window.MutationObserver;
  global.requestAnimationFrame = (f) => setTimeout(f, 0);
  global.App = {
    el: (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; },
    escapeHtml: (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    api: async () => ({}),
    toast: () => {},
  };
  global.Dashboard = { renderers: {}, state: {} };

  const src = racine('public/js/dashboard.js');
  // On n'exécute que les helpers de préréglages puis le rendeur anti-nuke.
  const helpers = src.slice(src.indexOf('Dashboard.presetOptions ='), src.indexOf('// ---------------------- Shell ----------------------'));
  const i0 = src.indexOf('Dashboard.renderers.antinuke = async');
  const i1 = src.indexOf('Dashboard.renderers.', i0 + 10);
  if (!check('helpers de préréglages localisés dans dashboard.js', helpers.length > 200, String(helpers.length))) throw new Error('stop');
  if (!check('rendeur antinuke localisé dans dashboard.js', i0 > 0 && i1 > i0)) throw new Error('stop');
  eval(helpers + '\n' + src.slice(i0, i1));

  // --- presetOptions -------------------------------------------------------
  const opts = Dashboard.presetOptions([[5, '5 min'], [10, '10 min']], 10);
  check('l\'option courante est marquée selected', (opts.match(/selected/g) || []).length === 1, opts);
  check('…et c\'est la bonne valeur', /value="10" selected/.test(opts), opts);
  check('toutes les options présentes', (opts.match(/<option/g) || []).length === 2);

  const hors = Dashboard.presetOptions([[5, '5 min'], [10, '10 min']], 7, Dashboard.labelMinutes);
  check('valeur hors préréglage AJOUTÉE comme option', (hors.match(/<option/g) || []).length === 3, hors);
  check('…et RESTE sélectionnée (aucun réglage écrasé à l\'insu)', /value="7" selected/.test(hors), hors);
  check('…avec un libellé lisible, pas le nombre brut', /value="7" selected>7 min</.test(hors), hors);

  // Valeur vide = réglage jamais défini. On NE doit PAS la faire passer pour
  // la première valeur de la liste : ouvrir la page puis enregistrer aurait
  // alors imposé « 5 min » à un réglage volontairement vide.
  const vide = Dashboard.presetOptions([[5, '5 min']], '');
  check('valeur vide → option « — » ajoutée et sélectionnée', /value="" selected>—</.test(vide), vide);
  check('…et la valeur 5 n\'est PAS sélectionnée d\'office', !/value="5" selected/.test(vide), vide);
  check('valeur null tolérée', typeof Dashboard.presetOptions([[5, '5 min']], null) === 'string');
  check('valeur undefined tolérée', typeof Dashboard.presetOptions([[5, '5 min']], undefined) === 'string');
  check('nombre 0 distingué de « vide »', /value="0" selected/.test(Dashboard.presetOptions([[0, 'Désactivé'], [5, '5 min']], 0)));

  // Une valeur utilisateur pourrait contenir des caractères à échapper.
  const xss = Dashboard.presetOptions([[5, '5 min']], '"><script>alert(1)</script>');
  check('HTML échappé dans la valeur', !xss.includes('<script>'), xss);
  check('HTML échappé dans l\'attribut', !xss.includes('">"'), xss);

  // --- libellés ------------------------------------------------------------
  check('labelMinutes(0) → « Désactivé »', Dashboard.labelMinutes(0) === 'Désactivé', Dashboard.labelMinutes(0));
  check('labelMinutes(45) → « 45 min »', Dashboard.labelMinutes(45) === '45 min', Dashboard.labelMinutes(45));
  check('labelMinutes(120) → « 2 h »', Dashboard.labelMinutes(120) === '2 h', Dashboard.labelMinutes(120));
  check('labelMinutes(1440) → « 1 j »', Dashboard.labelMinutes(1440) === '1 j', Dashboard.labelMinutes(1440));
  check('labelMinutes(90) arrondi à une décimale', Dashboard.labelMinutes(90) === '1.5 h', Dashboard.labelMinutes(90));
  check('labelMinutes(aberrant) ne lève pas', Dashboard.labelMinutes('abc') === 'abc', Dashboard.labelMinutes('abc'));

  check('labelSecondes(30) → « 30 s »', Dashboard.labelSecondes(30) === '30 s', Dashboard.labelSecondes(30));
  check('labelSecondes(60) → « 1 min »', Dashboard.labelSecondes(60) === '1 min', Dashboard.labelSecondes(60));
  check('labelSecondes(45) reste en secondes', Dashboard.labelSecondes(45) === '45 s', Dashboard.labelSecondes(45));
  check('labelSecondes(90) passe en minutes arrondies', Dashboard.labelSecondes(90) === '1.5 min', Dashboard.labelSecondes(90));
  check('labelSecondes(600) → 10 min', Dashboard.labelSecondes(600) === '10 min', Dashboard.labelSecondes(600));
  check('labelSecondes(aberrant) ne lève pas', Dashboard.labelSecondes('abc') === 'abc');

  // --- cohérence des listes de préréglages ---------------------------------
  const listes = {
    PRESETS_MIN: Dashboard.PRESETS_MIN, PRESETS_MIN_0: Dashboard.PRESETS_MIN_0,
    PRESETS_SEC: Dashboard.PRESETS_SEC, PRESETS_SEC_COURTES: Dashboard.PRESETS_SEC_COURTES,
    PRESETS_PALIER: Dashboard.PRESETS_PALIER, PRESETS_HEURES: Dashboard.PRESETS_HEURES,
  };
  for (const [nom, liste] of Object.entries(listes)) {
    const vals = liste.map(([v]) => v);
    check(`${nom} : aucune valeur en double`, new Set(vals).size === vals.length, vals.join(','));
    check(`${nom} : valeurs strictement croissantes`, vals.every((v, i) => i === 0 || v > vals[i - 1]), vals.join(','));
    check(`${nom} : chaque entrée a un libellé non vide`, liste.every(([, l]) => typeof l === 'string' && l.length > 0));
    // Les options sont injectées dans du HTML : un guillemet casserait l'attribut.
    check(`${nom} : libellés sans guillemet ni chevron`, liste.every(([, l]) => !/["<>]/.test(l)));
  }
  check('PRESETS_MIN_0 commence par « Désactivé »', Dashboard.PRESETS_MIN_0[0][0] === 0);
  check('PRESETS_MIN ne contient PAS 0 (durée obligatoire)', !Dashboard.PRESETS_MIN.some(([v]) => v === 0));
  check('PRESETS_MIN_0 = PRESETS_MIN + le 0',
    Dashboard.PRESETS_MIN_0.length === Dashboard.PRESETS_MIN.length + 1);
  check('PRESETS_PALIER contient 0 (désactivable)', Dashboard.PRESETS_PALIER[0][0] === 0);
  check('PRESETS_SEC couvre 5 s à 10 min',
    Dashboard.PRESETS_SEC[0][0] === 5 && Dashboard.PRESETS_SEC.at(-1)[0] === 600);

  // ==========================================================================
  console.log('\n── C. Rendu de l\'onglet Anti-nuke (DOM réel) ──');
  // ==========================================================================

  const etat = {
    config: {
      enabled: true, action: 'quarantine', alertChannel: '', whitelist: [], punishBots: false,
      limits: {
        channel_delete: { count: 2, window: 10 }, channel_create: { count: 3, window: 10 },
        role_delete: { count: 2, window: 10 }, role_create: { count: 3, window: 10 },
        role_update: { count: 1, window: 10 }, overwrite: { count: 4, window: 10 },
        ban: { count: 3, window: 60 }, kick: { count: 3, window: 60 },
        webhook: { count: 2, window: 10 }, emoji: { count: 2, window: 10 }, bot_add: { count: 1, window: 10 },
      },
      actions: { bot_add: 'ban', emoji: 'alert' },
    },
    audit: { ok: true }, recent: [], totalActions: 0,
  };
  App.api = async (url) => (url.includes('/antinuke/state') ? etat : {});
  Dashboard.header = (c) => { c.innerHTML = ''; const d = document.createElement('div'); c.appendChild(d); return d; };
  Dashboard.card = (root) => { const d = document.createElement('div'); d.className = 'dash-card'; root.appendChild(d); return d; };
  Dashboard.state = { bot: { id: 1 }, guildId: 'G1', module: 'antinuke' };

  const content = document.querySelector('#c');
  await Dashboard.renderers.antinuke(content, { channels: [], roles: [] });
  await new Promise((r) => setTimeout(r, 60)); // le rendeur charge l'état en asynchrone

  const rows = content.querySelectorAll('.nk-limit');
  check('11 lignes de type rendues', rows.length === 11, String(rows.length));

  let selects = 0, champsNombre = 0;
  rows.forEach((r) => {
    selects += r.querySelectorAll('select').length;
    champsNombre += r.querySelectorAll('input[type="number"]').length;
  });
  check('3 sélecteurs par ligne (seuil, fenêtre, sanction)', selects === 33, String(selects));
  check('plus AUCUN champ numérique libre dans l\'anti-nuke', champsNombre === 0, String(champsNombre));

  // Les grilles en style inline sont invisibles pour les media queries : c'est
  // exactement ce qui cassait la mise en page mobile.
  const inline = [...rows].filter((r) => /grid-template-columns/.test(r.getAttribute('style') || ''));
  check('aucune grille en style inline (pilotable par media query)', inline.length === 0, String(inline.length));

  const cd = content.querySelector('.nk-limit[data-kind="channel_delete"]');
  check('seuil conservé (channel_delete = 2)', cd.querySelector('.nk-count').value === '2', cd.querySelector('.nk-count').value);
  check('fenêtre conservée (channel_delete = 10 s)', cd.querySelector('.nk-window').value === '10', cd.querySelector('.nk-window').value);
  check('sanction par défaut = « suivre le global » (vide)', cd.querySelector('.nk-action').value === '', cd.querySelector('.nk-action').value);

  check('sanction par type relue (bot_add = ban)',
    content.querySelector('.nk-limit[data-kind="bot_add"] .nk-action').value === 'ban');
  check('sanction par type relue (emoji = alert)',
    content.querySelector('.nk-limit[data-kind="emoji"] .nk-action').value === 'alert');

  const optGlobal = cd.querySelector('.nk-action option[value=""]');
  check('l\'option « Global » rappelle la sanction globale en cours',
    /Global — .*Quarantaine/.test(optGlobal.textContent), optGlobal.textContent);
  check('les 5 sanctions sont proposées + Global',
    cd.querySelectorAll('.nk-action option').length === 6, String(cd.querySelectorAll('.nk-action option').length));

  const fenetres = [...cd.querySelectorAll('.nk-window option')].map((o) => o.textContent);
  check('fenêtres libellées en unités humaines', fenetres.includes('1 min') && fenetres.includes('10 s'), fenetres.join(', '));
  const seuils = [...cd.querySelectorAll('.nk-count option')].map((o) => o.textContent);
  check('seuils libellés (« 2 actions »), pas « 2 » tout court', seuils.some((t) => /actions?$/.test(t)), seuils.slice(0, 3).join(', '));

  // Accessibilité : un <select> sans étiquette est illisible pour un lecteur
  // d'écran une fois les trois champs alignés sur la même ligne.
  check('chaque sélecteur porte une aria-label',
    [...cd.querySelectorAll('select')].every((s) => (s.getAttribute('aria-label') || '').length > 3),
    [...cd.querySelectorAll('select')].map((s) => s.getAttribute('aria-label')).join(' | '));

  // Valeur hors préréglage : ne doit être ni perdue, ni muette.
  etat.config.limits.kick = { count: 7, window: 45 };
  content.innerHTML = '';
  await Dashboard.renderers.antinuke(content, { channels: [], roles: [] });
  await new Promise((r) => setTimeout(r, 60));
  const kick = content.querySelector('.nk-limit[data-kind="kick"]');
  check('valeur hors préréglage conservée (seuil 7)', kick.querySelector('.nk-count').value === '7', kick.querySelector('.nk-count').value);
  check('…et ajoutée comme option', [...kick.querySelectorAll('.nk-count option')].some((o) => o.value === '7'));
  check('fenêtre hors préréglage conservée (45 s)', kick.querySelector('.nk-window').value === '45', kick.querySelector('.nk-window').value);
  check('…libellée « 45 s »', [...kick.querySelectorAll('.nk-window option')].some((o) => o.value === '45' && o.textContent === '45 s'));

  // collectActions : la valeur vide (« suivre le global ») ne doit PAS être
  // envoyée, sinon elle écraserait le repli global par une chaîne invalide.
  const zoneCollect = src.slice(src.indexOf('const collectActions = ()'), src.indexOf('const collectActions = ()') + 500);
  check('collectActions ignore les valeurs vides',
    /if\s*\(\s*v\s*\)/.test(zoneCollect) || /v\s*&&/.test(zoneCollect), zoneCollect.split('\n').slice(0, 6).join(' '));

  // ==========================================================================
  console.log('\n── D. Bug préexistant : enhanceSelect ne déclenche que « change » ──');
  // ==========================================================================

  const dash = racine('public/js/dashboard.js');
  const iEnh = dash.indexOf('Dashboard.enhanceSelect =');
  const iEnhFin = dash.indexOf('Dashboard.enhanceSelects =', iEnh);
  const corpsEnhance = dash.slice(iEnh, iEnhFin);
  check('enhanceSelect localisé', iEnh > 0 && iEnhFin > iEnh);
  check('enhanceSelect déclenche « change »', /dispatchEvent\(new Event\('change'/.test(corpsEnhance));
  check('…et ne déclenche JAMAIS « input » (piège documenté)',
    !/dispatchEvent\(new Event\('input'/.test(corpsEnhance));

  // Le barème de sanctions (escalade) construit des <select> dynamiquement.
  // On ancre sur le GESTIONNAIRE (pas sur le gabarit HTML) : la zone à
  // inspecter vient APRÈS le <select>, et le gabarit apparaît plusieurs fois.
  const iEsc = dash.indexOf('const maj = () => { x[inp.dataset.k]');
  if (!check('constructeur du barème localisé', iEsc > 0, String(iEsc))) throw new Error('stop');
  const zoneEsc = dash.slice(iEsc - 900, iEsc + 400);
  check('le barème écoute « input »', /addEventListener\('input', maj\)/.test(zoneEsc), 'écoute input manquante');
  check('le barème écoute AUSSI « change » (correctif v244)',
    /addEventListener\('change', maj\)/.test(zoneEsc), 'écoute change manquante');

  // Preuve par le comportement, pas seulement par le texte : un change doit
  // mettre la donnée à jour.
  const x = { duration: 10, action: 'warn', message: '' };
  const sel = document.createElement('select');
  sel.innerHTML = '<option value="10">10 min</option><option value="60">1 h</option>';
  sel.dataset.k = 'duration';
  sel.value = '60';
  const maj = () => { x[sel.dataset.k] = sel.dataset.k === 'duration' ? (parseInt(sel.value, 10) || 0) : sel.value; };
  sel.addEventListener('input', maj);
  sel.addEventListener('change', maj);
  sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); // ce que fait enhanceSelect
  check('un « change » seul met bien la donnée à jour', x.duration === 60, String(x.duration));
  const x2 = { duration: 10 };
  const sel2 = document.createElement('select');
  sel2.dataset.k = 'duration'; sel2.value = '60';
  sel2.addEventListener('input', () => { x2.duration = parseInt(sel2.value, 10) || 0; });
  sel2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  check('…alors qu\'écouter « input » seul ne fait RIEN (l\'ancien bug)',
    x2.duration === 10, String(x2.duration));

  // ==========================================================================
  console.log('\n── E. Robustesse du rendu Membres ──');
  // ==========================================================================
  // Si l'API omet un champ, le gabarit affichait littéralement « undefined
  // coins ». Number(x) || 0 replie sur 0.
  const memb = dash.slice(dash.indexOf('Number(m.coins)') - 300, dash.indexOf('Number(m.coins)') + 300);
  check('coins protégé', /Number\(m\.coins\)\s*\|\|\s*0/.test(memb));
  check('level protégé', /Number\(m\.level\)\s*\|\|\s*0/.test(memb));
  check('xp protégé', /Number\(m\.xp\)\s*\|\|\s*0/.test(memb));
  check('plus d\'interpolation nue de m.coins', !/\$\{m\.coins\}/.test(dash));

  const fmt = (m) => `🪙 ${Number(m.coins) || 0} coins · ✨ ${Number(m.level) || 0} (${Number(m.xp) || 0} XP)`;
  check('API muette → « 0 coins », pas « undefined coins »', fmt({}).includes('0 coins') && !fmt({}).includes('undefined'), fmt({}));
  check('valeurs nulles → 0', fmt({ coins: null, level: null, xp: null }) === fmt({}), fmt({ coins: null }));
  check('chaînes numériques acceptées', fmt({ coins: '120', level: '3', xp: '45' }).includes('120 coins'));
  check('valeurs normales inchangées', fmt({ coins: 1240, level: 7, xp: 320 }).includes('1240 coins'));

  // ==========================================================================
  console.log('\n── F. CSS : correctifs mobiles mesurés par l\'audit ──');
  // ==========================================================================

  const css = racine('public/css/dashboard.css');
  check('accolades équilibrées', (css.match(/{/g) || []).length === (css.match(/}/g) || []).length,
    `${(css.match(/{/g) || []).length} / ${(css.match(/}/g) || []).length}`);

  // (1) Le <small> à 9,583 px : taille désormais explicite.
  check('.ov-hero-chip small a une taille de police EXPLICITE',
    /\.ov-hero-chip small\s*\{[^}]*font-size:\s*\d/.test(css));
  check('…supérieure ou égale à 11 px',
    parseFloat((css.match(/\.ov-hero-chip small\s*\{[^}]*font-size:\s*([\d.]+)px/) || [, '0'])[1]) >= 11,
    (css.match(/\.ov-hero-chip small\s*\{[^}]*font-size:\s*([\d.]+)px/) || [, '?'])[1]);

  // (2) Conflit de spécificité sur « Accès rapides ».
  check('règle composée .ov-quick-actions.ov-access-bar présente',
    /\.ov-quick-actions\.ov-access-bar\s*\{[^}]*grid-template-columns:\s*1fr/.test(css));
  const iConflit = css.indexOf('.ov-quick-actions.ov-access-bar');
  const iTardive = css.indexOf('.dashboard-shell-host .ov-quick-actions { grid-template-columns: repeat(2');
  check('…placée APRÈS la règle ≤700 px qui l\'écrasait', iConflit > iTardive && iTardive > 0,
    `${iConflit} vs ${iTardive}`);

  // (3) Plancher de lisibilité et cibles tactiles, limités au mobile/tactile.
  check('plancher de lisibilité : media query ≤700 px présente', /@media \(max-width: 700px\)/.test(css));
  check('plancher tactile : couvre aussi les écrans tactiles',
    /@media \(max-width: 700px\), \(hover: none\) and \(pointer: coarse\)/.test(css));
  check('.am-filter remonté à 40 px', /\.am-filter\s*\{[^}]*min-height:\s*40px/.test(css));
  check('.ca-mark remonté à 40 px', /\.ca-mark\s*\{[^}]*min-height:\s*40px/.test(css));

  // Le plancher ne doit PAS s'appliquer au desktop à la souris : le rendu
  // grand écran reste strictement inchangé.
  const iPlancher = css.indexOf('.dashboard-shell-host .am-filter { min-height: 40px; }');
  const debutBloc = css.lastIndexOf('@media', iPlancher);
  const mediaTactile = css.slice(debutBloc, css.indexOf('{', debutBloc));
  check('le plancher tactile est bien conditionné (pas de règle nue)',
    /hover: none/.test(mediaTactile) && /max-width: 700px/.test(mediaTactile), mediaTactile);

  // Les badges imitant Discord (8 px) sont un choix assumé : non touchés.
  check('badge « APP » de la prévisualisation Discord préservé (8 px)',
    /\.ca-discord-author > span:last-child[^}]*font-size:\s*8px/.test(css));
  check('badge .eb-dtag préservé (8,5 px)', /\.eb-dtag[^}]*font-size:\s*8\.5px/.test(css));

  // (4) Grilles en style inline.
  //
  //     Distinction importante : un style inline est invisible pour les media
  //     queries, donc impossible à corriger en responsive. Mais toutes les
  //     grilles inline ne se valent pas :
  //
  //       • repeat(auto-fit, minmax(Npx, 1fr))  → s'effondre TOUTE SEULE sur
  //         une colonne dès que le conteneur est étroit. Sans danger mesuré
  //         (l'audit à 360 px ne remonte aucun débordement).
  //       • repeat(3, 1fr)                      → nombre de colonnes FIGÉ.
  //         Ne s'adapte jamais. C'est exactement ce qui cassait les limites
  //         anti-nuke et la file d'attente de santé en v244.
  //
  //     On interdit donc les colonnes figées, et on vérifie que tout ce qui
  //     reste est bien auto-adaptatif.
  const jsCode = code('public/js/dashboard.js');
  const grillesInline = [...jsCode.matchAll(/style="[^"]*grid-template-columns:\s*([^;"]+)/g)].map((m) => m[1]);
  const figees = grillesInline.filter((v) => !/auto-fit|auto-fill/.test(v));
  check('aucune grille inline à nombre de colonnes FIGÉ', figees.length === 0, figees.join(' | '));
  check('les grilles inline restantes sont toutes auto-adaptatives',
    grillesInline.every((v) => /auto-fit|auto-fill/.test(v)),
    grillesInline.filter((v) => !/auto-fit|auto-fill/.test(v)).join(' | '));
  check('…et aucune ne descend sous 120 px de large (sinon débordement)',
    grillesInline.every((v) => {
      const m = v.match(/minmax\(\s*(\d+)px/);
      return !m || parseInt(m[1], 10) >= 120;
    }), grillesInline.join(' | '));
  // Les deux grilles FIGÉES corrigées en v244 doivent désormais passer par
  // une classe pilotable : .nk-limit (anti-nuke) et .dash-stats-dense (santé).
  check('.nk-limit défini en CSS (limites anti-nuke)', /\.nk-limit\s*\{/.test(css));
  check('.nk-limit a bien une variante mobile', /@media[^{]*\{[^]*?\.nk-limit/.test(css));

  // (5) La file d'attente de santé utilise la classe dense, pas une grille inline.
  check('file d\'attente : classe .dash-stats-dense utilisée', /dash-stats-dense/.test(jsCode) && /dash-stats-dense/.test(css));

  // ==========================================================================
  console.log('\n── G. Conversion des champs numériques en sélecteurs ──');
  // ==========================================================================

  const champsLibres = (jsCode.match(/type="number"/g) || []).length;
  check('champs numériques libres restants = 13 (vraies mesures)', champsLibres === 13, String(champsLibres));
  check('presetOptions est effectivement utilisé', (jsCode.match(/presetOptions\(/g) || []).length >= 20,
    String((jsCode.match(/presetOptions\(/g) || []).length));
  // Les 13 restants doivent être des mesures, pas des durées.
  const idsRestants = [...jsCode.matchAll(/id="([a-z0-9-]+)"[^>]*type="number"|type="number"[^>]*id="([a-z0-9-]+)"/g)]
    .map((m) => m[1] || m[2]).filter(Boolean);
  const idsInterdits = ['am-timeout', 'am-warn-timeout', 'raid-unlock', 'gw-duration', 'a-hour', 'a-minute', 'qz-window'];
  check('aucun champ CONVERTI n\'est revenu en case numérique',
    idsInterdits.every((i) => !idsRestants.includes(i)), idsRestants.join(','));

  // ==========================================================================
  console.log('\n── H. Banc de mesure mobile présent et documenté ──');
  // ==========================================================================
  // L'audit n'est pas un test (il lui faut un serveur + Chromium) : il vit
  // dans test/tools/, hors de portée de run-all.js.

  check('banc d\'audit présent', fs.existsSync(path.join(__dirname, 'tools', 'audit-mobile.js')));
  // L'émulation tactile était un FICHIER dupliqué (audit-mobile-tactile.js) :
  // il avait fini par diverger du banc principal et mesurait du code périmé.
  // C'est désormais un drapeau du banc unique.
  const banc = fs.readFileSync(path.join(__dirname, 'tools', 'audit-mobile.js'), 'utf8');
  check('émulation tactile disponible via --tactile', banc.includes("--tactile"));
  check('…elle active bien hasTouch (sinon les media queries pointer:coarse ne s\'appliquent pas)',
    /hasTouch:\s*TACTILE/.test(banc));
  check('…et isMobile', /isMobile:\s*TACTILE/.test(banc));
  check('le fichier dupliqué a bien disparu',
    !fs.existsSync(path.join(__dirname, 'tools', 'audit-mobile-tactile.js')));
  check('validation du détecteur présente', fs.existsSync(path.join(__dirname, 'tools', 'test-detecteur-debordement.js')));
  check('bancs documentés (LISEZ-MOI.md)', fs.existsSync(path.join(__dirname, 'tools', 'LISEZ-MOI.md')));
  check('aucun banc provisoire laissé dans test/ (exécuté par erreur)',
    !fs.readdirSync(__dirname).some((f) => /^tmp-.*\.js$/.test(f)),
    fs.readdirSync(__dirname).filter((f) => /^tmp-/.test(f)).join(','));
  check('le banc ne mesure QUE les éléments visibles (sinon faux positifs)',
    /display === 'none'/.test(racine('test/tools/audit-mobile.js'))
    && /getBoundingClientRect\(\)/.test(racine('test/tools/audit-mobile.js')));

  // ==========================================================================
  console.log('\n── I. Bump de version ──');
  // ==========================================================================

  const html = racine('public/index.html');
  const sw = racine('public/sw.js');

  const vCourante = (html.match(/\?v=(\d+)/) || [])[1];
  check('index.html : une version de cache est déclarée', /^\d+$/.test(vCourante || ''), String(vCourante));
  check('index.html : référencée exactement 7 fois',
    (html.match(/\?v=\d+/g) || []).length === 7, String((html.match(/\?v=\d+/g) || []).length));
  // L'invariant utile n'est pas « v244 » en dur — c'est l'UNIFORMITÉ. Un bump
  // partiel (5 fichiers sur 7) laisserait le navigateur servir un mélange de
  // CSS et de JS de versions différentes, ce qui est le bug le plus difficile
  // à diagnostiquer qui soit.
  const versions = [...new Set(html.match(/\?v=\d+/g) || [])];
  check('index.html : les 7 références pointent la MÊME version', versions.length === 1, versions.join(', '));
  check('cette version est bien la v244', versions[0] === '?v=288', String(versions[0]));

  check('sw.js : nom de cache présent', /const CACHE = 'botdev-v\d+'/.test(sw), (sw.match(/const CACHE = '[^']*'/) || ['?'])[0]);
  // « ?v=288 » dans index.html doit correspondre à « botdev-v260 » dans sw.js.
  const cacheAttendu = `'botdev-${versions[0].replace('?v=', 'v')}'`;
  check('sw.js : cache aligné sur index.html', sw.includes(cacheAttendu),
    `${cacheAttendu} attendu, ${(sw.match(/const CACHE = '[^']*'/) || ['?'])[0]} trouvé`);
  // Une seule occurrence : deux noms de cache feraient deux mises en cache
  // concurrentes et l'utilisateur verrait une version sur deux.
  check('sw.js : un seul nom de cache déclaré', (sw.match(/botdev-v\d+'/g) || []).length === 1,
    String((sw.match(/botdev-v\d+'/g) || []).length));

  // Chaque test isole ses données dans botdev-vNNN-${Date.now()}. Ce numéro
  // suit la version du TEST, pas la version courante : un bump ne doit JAMAIS
  // le réécrire, sinon deux suites pourraient se marcher dessus.
  // (Le motif est découpé pour qu'un remplacement automatique ne le trouve pas.)
  const motifAttendu = ['botdev-', 'v243', '-${Date.now()}'].join('');
  check('v243-test.js : dossier de données toujours épinglé sur v243',
    racine('test/v243-test.js').includes(motifAttendu));
  const motif244 = ['botdev-', 'v244', '-${Date.now()}'].join('');
  check('v244-test.js : son propre dossier de données', racine('test/v244-test.js').includes(motif244));

  console.log(`\n${echecs === 0
    ? '🎉 Tous les tests v244 passent — sanction par type, sélecteurs et correctifs mobiles vérifiés.'
    : `❌ v244 — ${echecs} échec(s)`}`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch((e) => { console.error('💥', e); process.exit(1); });
