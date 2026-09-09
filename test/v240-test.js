// ============================================================================
// Test v240 — audit complet demandé par l'utilisateur, 3 volets :
//
//  1. LANGUES ramenées à fr + en. Les blocs es/de/pt/it ne couvraient que 48
//     clés sur 105 : `/lang es` faisait donc répondre le bot EN FRANÇAIS tout
//     en affirmant « Langue définie sur espagnol ». Un menu qui ment vaut pire
//     qu'un menu plus court → périmètre réduit, et `normalize()` retombe sur fr.
//
//  2. TUTOIEMENT → VOUSVOIEMENT partout. 25 clés i18n + ~300 textes codés en
//     dur (bot ET dashboard) étaient en « tu », mélangés avec du « vous » dans
//     les mêmes panneaux.
//     ⚠️ Le piège : une conversion par mots isolés casse les IDENTIFIANTS.
//        `name: 'divorce', description: 'Divorcer de ton époux…'` devient
//        `name: 'divorcez'` si on remplace sur la ligne entière → sous-commande
//        Discord renommée, donc cassée. Ce test verrouille les identifiants.
//
//  3. BUG « les traits sont courts » sur le modèle « bienvenue pro ».
//     Cause : events.js passait le texte par ui.sectionize(), qui insère des
//     traits TEXTE de 20 caractères (━ x20). Dans un embed classique ces traits
//     s'arrêtent bien avant les bords arrondis — d'où l'aspect cassé.
//     Correctif : une seule branche V2 (séparateurs NATIFS pleine largeur),
//     l'embed classique ne subsiste que quand Discord l'impose (carte image =
//     pièce jointe + profil d'envoi = webhook, et V2 + webhook + files = 400),
//     et dans ce cas on ne met AUCUN trait : les paragraphes respirent.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const v2 = require('./helpers/v2');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v240-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const i18n = require('../server/i18n');
const ui = require('../server/discord/ui');
const events = require('../server/discord/events');
const community = require('../server/discord/community');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Récupère la table STRINGS sans avoir à l'exporter (même technique que
// scripts/audit-v240-textes.js).
const STRINGS = (() => {
  const s = src('server/i18n.js');
  const start = s.indexOf('const STRINGS = {');
  const end = s.indexOf('\nconst LANG_CODES', start);
  return new Function(s.slice(start, end).replace(/^const STRINGS = /, 'return '))();
})();

// Bornes UNICODE obligatoires : `\b` s'appuie sur \w = [A-Za-z0-9_], donc « ê »
// n'est pas un caractère de mot et `\btes\b` matchait « vous êTES ». Les noms
// ambigus (« note » = l'évaluation, « divorce » = la rupture) sont exclus.
const B = '(?<![\\p{L}])';
const E = '(?![\\p{L}\\p{N}])';
// `te` inclus : sans lui, « l'équipe te répond » et « je te propose » étaient
// passées à travers la première conversion i18n.
// ⚠️ DEUX apostrophes coexistent dans le dépôt : la droite `'` et la
// typographique `’` (U+2019), majoritaire dans les textes français. De plus
// `t'` est TOUJOURS suivi d'une voyelle (élision : « t’est », « t’a ») : le
// lookahead `(?![\p{L}])` le rejetait donc systématiquement. D'où cette
// seconde regex dédiée, sans lookahead.
const TU = new RegExp(B + "(tu|ton|ta|tes|toi|te)" + E, 'iu');
const TU_ELISION = /(?<![\p{L}])t['’](?=[aàâäeéèêëiîïoôöuùûühy])/iu;

async function main() {
  // -----------------------------------------------------------------------
  console.log('\n1) Langues — périmètre ramené à fr + en');
  // -----------------------------------------------------------------------
  const i18nSrc = src('server/i18n.js');
  check('i18n : LANG_CODES contient fr et en',
    i18nSrc.includes("fr: 'fr'") && i18nSrc.includes("en: 'en'"));
  check('i18n : les blocs es/de/pt/it ont disparu',
    !i18nSrc.includes('es: {') && !i18nSrc.includes('de: {')
    && !i18nSrc.includes('pt: {') && !i18nSrc.includes('it: {'));
  check('i18n : STRINGS ne contient plus que fr et en',
    Object.keys(STRINGS).sort().join(',') === 'en,fr',
    Object.keys(STRINGS).join(','));
  check('i18n : fr et en ont exactement les mêmes clés',
    JSON.stringify(Object.keys(STRINGS.fr).sort()) === JSON.stringify(Object.keys(STRINGS.en).sort()),
    `fr=${Object.keys(STRINGS.fr).length} en=${Object.keys(STRINGS.en).length}`);
  check('i18n : les 2 blocs sont complets (>= 100 clés chacun)',
    Object.keys(STRINGS.fr).length >= 100 && Object.keys(STRINGS.en).length >= 100,
    `fr=${Object.keys(STRINGS.fr).length} en=${Object.keys(STRINGS.en).length}`);
  check('normalize : fr et en passent tels quels',
    i18n.normalize('fr') === 'fr' && i18n.normalize('en') === 'en');
  check('normalize : une langue retirée retombe sur le français',
    ['es', 'de', 'pt', 'it'].every((l) => i18n.normalize(l) === 'fr'),
    ['es', 'de', 'pt', 'it'].map((l) => `${l}→${i18n.normalize(l)}`).join(' '));
  check('normalize : une langue inconnue retombe sur le français',
    i18n.normalize('zz') === 'fr' && i18n.normalize('') === 'fr');
  check('t : une clé fonctionne dans les 2 langues',
    i18n.t('fr', 'transcript_title').includes('clôturé')
    && i18n.t('en', 'transcript_title').length > 5);
  // Le menu /lang ne doit plus proposer ce que le bot ne sait pas traduire.
  const premadeSrc = src('server/discord/premade.js');
  check('/lang : choices limités à fr + en',
    premadeSrc.includes("['fr', 'en']") && !premadeSrc.includes("'es', 'de'"));
  // Le commentaire qui explique la décision mentionne forcément ces langues ;
  // ce qui compte c'est qu'aucune ne soit encore PROPOSÉE dans le code.
  const premadeCode = premadeSrc.split('\n').filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l)).join('\n');
  check('/lang : plus aucune langue retirée proposée dans le code',
    !/espagnol|allemand|portugais|italien/i.test(premadeCode));
  check('db.js : écriture bornée à fr + en', src('server/db.js').includes("['fr', 'en'].includes"));
  check('routes.js : API bornée à fr + en', src('server/routes.js').includes("['fr', 'en'].includes"));
  // Une langue retirée en base ne doit pas casser le rendu.
  check('t : une langue retirée en base rend quand même du français',
    i18n.t('es', 'ticket_confirm').length > 5
    && i18n.t('es', 'ticket_confirm') === i18n.t('fr', 'ticket_confirm'));

  // -----------------------------------------------------------------------
  console.log('\n2) Vouvoiement — bloc i18n français');
  // -----------------------------------------------------------------------
  const frTutoie = Object.entries(STRINGS.fr).filter(([, v]) => TU.test(String(v)));
  check('i18n fr : aucune clé ne tutoie', frTutoie.length === 0,
    frTutoie.map(([k]) => k).join(', '));
  const enTutoie = Object.entries(STRINGS.en)
    .filter(([, v]) => /\b(thy|thine)\b/i.test(String(v)));
  check('i18n en : aucune forme archaïque', enTutoie.length === 0);
  // Repères : quelques clés visibles doivent être au « vous ».
  for (const [cle, attendu] of [
    ['transcript_title', 'Votre ticket'],
    ['ticket_confirm', 'Votre ticket'],
    ['ticket_rating_desc', 'Votre ticket'],
  ]) {
    check(`i18n fr : ${cle} au vouvoiement`, String(STRINGS.fr[cle]).includes(attendu),
      String(STRINGS.fr[cle]).slice(0, 70));
  }

  // -----------------------------------------------------------------------
  console.log('\n3) Vouvoiement — textes codés en dur (bot)');
  // -----------------------------------------------------------------------
  // Le parseur de scripts/v240-passage-vous.js est réutilisé : il ne lit QUE
  // l'intérieur des littéraux de chaîne, en protégeant les interpolations.
  const scriptSrc = src('scripts/v240-passage-vous.js');
  const head = scriptSrc.slice(0, scriptSrc.indexOf('let total = 0;'));
  const parseur = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname',
    head + '\nmodule.exports={segments,IDENTIFIANT,CLES_INTERDITES};')(
    parseur, parseur.exports, require, path.join(__dirname, '..', 'scripts'));
  const { segments, IDENTIFIANT, CLES_INTERDITES } = parseur.exports;

  /** Littéraux « prose » d'un fichier : ni identifiant, ni clé technique. */
  // Chaînes qui DOIVENT rester au tutoiement : ce sont les CLÉS de la
  // migration de données v240 (`UPDATE … WHERE placeholder = ?`). Sans
  // l'ancienne valeur exacte, la migration ne peut rien retrouver. Elles ne
  // sont jamais affichées à un utilisateur.
  const CLES_MIGRATION = new Set([
    'Choisis tes rôles…',
    "🎫 Besoin d'aide ? Clique sur le bouton pour ouvrir un ticket !",
  ]);

  const prose = (fichier) => {
    const out = [];
    for (const s of segments(src(fichier))) {
      if (s.kind !== 'str' || !s.ferme) continue;
      const brut = s.body.replace(/\\'/g, "'").replace(/\\`/g, '`');
      if (IDENTIFIANT.test(brut.trim())) continue;
      if (brut.length < 12) continue;
      // Le SQL n'est pas de la prose : `LEFT JOIN users tu ON tu.id = …` utilise
      // `tu` comme ALIAS de « target user ». Ce n'est pas du français.
      if (/\b(SELECT|INSERT|UPDATE|DELETE|LEFT JOIN|INNER JOIN|WHERE|ALTER TABLE)\b/i.test(brut)) continue;
      if (CLES_MIGRATION.has(brut)) continue;
      out.push({ ligne: s.ligne, texte: brut });
    }
    return out;
  };

  // Pronoms de 2ᵉ personne singulière, sans faux positif possible.
  const fichiersBot = fs.readdirSync(path.join(__dirname, '..', 'server', 'discord'))
    .filter((x) => x.endsWith('.js')).map((x) => 'server/discord/' + x);
  const restes = [];
  for (const f of fichiersBot) {
    for (const { ligne, texte } of prose(f)) {
      // Les interpolations ${…} sont du code : `.replace('T', ' ')` y ferait
      // matcher `t'`. On ne teste que le texte.
      const propre = texte.replace(/\$\{[^}]*\}/g, ' ');
      const m = propre.match(TU) || propre.match(TU_ELISION);
      if (m) restes.push(`${f}:${ligne} « ${texte.slice(0, 60)} »`);
    }
  }
  check('bot : plus aucun pronom de tutoiement dans les textes', restes.length === 0,
    restes.slice(0, 5).join(' | '));

  // La conversion ne doit JAMAIS avoir touché du code : gardez-fous ciblés sur
  // les identifiants réellement cassés pendant le chantier.
  const extraSrc = src('server/discord/extra.js');
  check('identifiants : la sous-commande « divorce » est intacte',
    extraSrc.includes("name: 'divorce'") && !extraSrc.includes("name: 'divorcez'"));
  check('identifiants : l\u2019exemple d\u2019aide pointe toujours vers `/divorce`',
    extraSrc.includes('`/divorce`') && !extraSrc.includes('`/divorcez`'));
  check('identifiants : « Divorce enregistré » reste un NOM (titre)',
    extraSrc.includes("title: '💔 Divorce enregistré'"));
  // 1ʳᵉ personne : « je sais » ne doit pas devenir « je savez ».
  check('concordance : « je sais » préservé (1ʳᵉ personne)',
    src('server/discord/premade.js').includes('tout ce que je sais faire'));
  // 3ᵉ personne : « le bot continue de tourner », « la galerie s'ouvre ».
  const dashSrc = src('public/js/dashboard.js');
  check('concordance : « le bot continue de tourner » préservé (3ᵉ personne)',
    dashSrc.includes('le bot continue de tourner'));
  check('concordance : « la galerie s\u2019ouvre » préservé (réfléchi)',
    /galerie s\\?'ouvre automatiquement/.test(src('server/discord/premade.js')));
  check('concordance : « Blacklist active » préservé (adjectif)',
    src('server/discord/automod.js').includes('Blacklist active sur ce serveur'));
  check('concordance : « un membre quitte le serveur » préservé (3ᵉ personne)',
    src('server/discord/events.js').includes('quand un membre quitte le serveur')
    && !src('server/discord/events.js').includes('un membre quittez'));
  check('concordance : « si vous ratez, vous lui payez » bien accordé',
    src('server/discord/extra.js').includes('Si vous ratez, vous lui payez une amende'));

  // Repères de conversion effective côté bot.
  for (const [fichier, attendu] of [
    ['server/discord/panels.js', "'🎫 Votre ticket est ouvert'"],
    ['server/discord/panels.js', 'Ouvrez votre ticket et répondez aux messages du staff.'],
    ['server/discord/panels.js', 'Rejoignez-le ici : ${channel}'],
    ['server/discord/premade.js', 'Ajoutez-moi à votre serveur'],
    ['server/discord/premade.js', 'Votre solde : ${solde} coins'],
    ['server/discord/premade.js', '⬅️ vous'],
    // v241 — l'ancien texte par défaut « Vous êtes le membre n°{count} » a été
    // retiré (le compteur est porté par la rubrique « 👥 Membre n° »). On épingle
    // le nouveau texte par défaut, qui contient toujours un « vous ».
    ['server/discord/events.js', "l'équipe est là pour vous aider"],
    ['server/discord/ui.js', 'Assistant de votre serveur'],
  ]) {
    check(`bot : ${path.basename(fichier)} → « ${attendu.slice(0, 42)} »`,
      src(fichier).includes(attendu));
  }

  // -----------------------------------------------------------------------
  console.log('\n4) Vouvoiement — dashboard');
  // -----------------------------------------------------------------------
  // Le premier passage ne couvrait QUE `server/discord/*` + `dashboard.js`.
  // Quatre fichiers visibles par l'utilisateur passaient à travers, plus les
  // messages d'erreur de l'API (affichés en toast) et les valeurs PAR DÉFAUT
  // écrites en base. Tous sont couverts ici depuis `v240-complements.js`.
  const FRONT = ['public/js/dashboard.js', 'public/js/app.js', 'public/js/views.js',
    'public/js/editor.js', 'public/js/public.js'];
  const BACK = ['server/routes.js', 'server/db.js', 'server/index.js', 'server/i18n.js'];
  for (const fichier of [...FRONT, ...BACK]) {
    const restes = prose(fichier)
      .filter(({ texte }) => { const t = texte.replace(/\$\{[^}]*\}/g, ' '); return TU.test(t) || TU_ELISION.test(t); })
      .map(({ ligne, texte }) => `${ligne} « ${texte.slice(0, 55)} »`);
    check(`${path.basename(fichier)} : plus aucun pronom de tutoiement`,
      restes.length === 0, restes.slice(0, 4).join(' | '));
  }
  const dashSrc2 = src('public/js/dashboard.js');
  void dashSrc2;
  const dashRestes = prose('public/js/dashboard.js')
    .filter(({ texte }) => { const t = texte.replace(/\$\{[^}]*\}/g, ' '); return TU.test(t) || TU_ELISION.test(t); })
    .map(({ ligne, texte }) => `${ligne} « ${texte.slice(0, 55)} »`);
  check('dashboard : plus aucun pronom de tutoiement', dashRestes.length === 0,
    dashRestes.slice(0, 5).join(' | '));

  // Textes réellement vus par l'utilisateur, hors dashboard.
  for (const [fichier, attendu] of [
    ['server/routes.js', 'Vous devez être propriétaire du serveur'],
    ['server/routes.js', "Vous n\\'êtes pas membre de ce serveur."],
    ['server/routes.js', 'Choisissez un salon (ou configurez le salon par défaut).'],
    ['server/routes.js', 'Ajoutez au moins un rôle au menu.'],
    ['server/routes.js', 'Activez les intents "MESSAGE CONTENT"'],
    ['server/db.js', 'Choisissez vos rôles…'],
    ['server/db.js', 'Cliquez sur le bouton pour ouvrir un ticket !'],
    ['public/js/app.js', 'Configurez votre serveur<br/>'],
    ['public/js/app.js', 'Connectez-vous avec Discord'],
    ['public/js/app.js', 'votre pseudo, votre avatar et votre liste de serveurs'],
    ['public/js/views.js', 'Choisissez vos rôles…'],
    ['public/js/editor.js', 'Donnez un nom à votre commande.'],
  ]) {
    check(`${path.basename(fichier)} : « ${attendu.slice(0, 44)} »`,
      src(fichier).includes(attendu.replace(/\\\\/g, '\\')));
  }

  // ── Landing page (public.js) : zone « FINALE, ne plus retoucher » ────────
  // L'interdiction porte sur le DESIGN et la STRUCTURE (v167). Le passage au
  // « vous » a été validé explicitement par l'utilisateur le 06/09 : index.html
  // disait déjà « Le bot de VOTRE serveur » tandis que le H1 rendu disait
  // encore « TON serveur ». On verrouille ici les DEUX aspects : le texte, et
  // l'intégrité de la structure HTML.
  const pubSrc = src('public/js/public.js');
  for (const attendu of [
    '<span class="grad grad-anim">votre serveur Discord</span></h1>',
    'Ajoutez Hoxera à votre serveur, puis configurez tout depuis le dashboard',
    '➕ Ajouter Hoxera à votre serveur</button>',
    '<b>Ajoutez le bot</b>',
    '<b>Connectez-vous</b>',
    '<b>Configurez</b>',
    'Vous ne payez que si vous voulez un jour soutenir le projet',
    '<h2>Prêt à donner vie à votre serveur ?</h2>',
  ]) {
    check(`landing : « ${attendu.slice(0, 44)} »`, pubSrc.includes(attendu));
  }
  // Faux positifs assumés : ces deux chaînes NE doivent PAS être converties.
  check('landing : « jours et heures choisis » préservé (participe passé)',
    pubSrc.includes('jours et heures choisis'));
  check('landing : la classe CSS « mock-item active » est intacte',
    pubSrc.includes('mock-item active'));
  // Aucune structure HTML touchée : le design v167 est protégé.
  const compteBalises = (t) => ({
    balises: (t.match(/<[a-zA-Z/!]/g) || []).length,
    classes: (t.match(/class=/g) || []).length,
    ids: (t.match(/id=/g) || []).length,
    divs: (t.match(/<div/g) || []).length,
    boutons: (t.match(/<button/g) || []).length,
    interpolations: (t.match(/\$\{/g) || []).length,
  });
  const attenduPub = { balises: 572, classes: 188, ids: 22, divs: 151, boutons: 14, interpolations: 55 };
  const reelPub = compteBalises(pubSrc);
  for (const cle of Object.keys(attenduPub)) {
    check(`landing : structure intacte (${cle} = ${attenduPub[cle]})`,
      reelPub[cle] === attenduPub[cle], `${cle} = ${reelPub[cle]}`);
  }

  // ── Impératifs isolés (aucun pronom à proximité → invisibles au scan) ────
  for (const [fichier, attendu] of [
    ['server/discord/panelCommands.js', 'utilisez un vrai emoji'],
    ['server/discord/panelCommands.js', 'Utilisez cette commande dans un salon de ticket'],
    ['server/discord/panelCommands.js', 'Re-envoyez le panneau avec'],
    ['server/discord/premade.js', 'Utilisez la commande slash'],
    ['server/discord/premade.js', 'ou retirez-les, supprimez-le avec confirmation'],
    ['server/discord/extra.js', 'Jouez au morpion (tic-tac-toe)'],
    ['server/discord/extra.js', 'Misez un montant positif'],
    ['server/discord/profileCommands.js', 'Activez : `/modlogs set #salon`'],
    ['server/discord/roleWizard.js', 'Envoyez-le ensuite avec `/roles send'],
    ['server/i18n.js', '— tapez `@` puis le début du pseudo'],
    ['public/js/dashboard.js', 'connectez votre compte Discord'],
  ]) {
    check(`impératif : ${path.basename(fichier)} → « ${attendu.slice(0, 38)} »`,
      src(fichier).includes(attendu));
  }
  for (const attendu of [
    'Bienvenue dans votre espace de gestion',
    'Choisissez un serveur',
    'Votre serveur en bref',
    'Vous êtes le membre',
    'Passez un bon moment parmi nous',
  ]) {
    check(`dashboard : « ${attendu} »`, dashSrc.includes(attendu));
  }
  check('index.html : titre au vouvoiement',
    src('public/index.html').includes('Le bot de votre serveur Discord'));

  // ── Migration de DONNÉES : un `DEFAULT` de `CREATE TABLE IF NOT EXISTS` ne
  //    change rien à une base déjà créée. La base de production (restaurée
  //    depuis la sauvegarde GitHub au boot, piège n°2) contenait réellement
  //    3 `role_menus` et 2 `tickets` avec l'ancien texte. Chaque UPDATE ne
  //    matche que la valeur par défaut EXACTE : un texte personnalisé par
  //    l'utilisateur n'est jamais écrasé.
  const dbSrc = src('server/db.js');
  check('db.js : migration v240 présente (role_menus.placeholder)',
    dbSrc.includes('UPDATE role_menus SET placeholder')
    && dbSrc.includes("'Choisis tes rôles…'"));
  check('db.js : migration v240 présente (tickets.message)',
    dbSrc.includes('UPDATE tickets SET message')
    && dbSrc.includes('Clique sur le bouton pour ouvrir un ticket'));
  check('db.js : la migration est idempotente (WHERE sur la valeur exacte)',
    (dbSrc.match(/WHERE (placeholder|message) = \?/g) || []).length === 2);
  check('db.js : le DEFAULT des CREATE TABLE est bien au vouvoiement',
    dbSrc.includes("placeholder TEXT DEFAULT 'Choisissez vos rôles…'")
    && dbSrc.includes('Cliquez sur le bouton pour ouvrir un ticket'));

  // -----------------------------------------------------------------------
  console.log('\n5) Bug « les traits sont courts » — bienvenue pro');
  // -----------------------------------------------------------------------
  const evSrc = src('server/discord/events.js');
  const appelsSectionize = evSrc.split('\n')
    .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && l.includes('ui.sectionize(')).length;
  check('events.js : PLUS AUCUN appel ui.sectionize hors commentaire',
    appelsSectionize === 0, `${appelsSectionize} appel(s)`);
  check('events.js : le webhook est détecté via le profil d\u2019envoi',
    evSrc.includes('const viaWebhook = !!((identity.effectiveProfile(botId, member.guild.id) || {}).name);'));
  check('events.js : la carte ne force l\u2019embed classique QUE si webhook',
    evSrc.includes('const carteV2 = files.length && !viaWebhook;')
    && evSrc.includes('if (!files.length || carteV2) {'));
  check('events.js : la carte passe en MediaGallery attachment://',
    evSrc.includes("image: carteV2 ? 'attachment://bienvenue.png'"));
  check('events.js : le rendu classique n\u2019a AUCUN trait texte',
    evSrc.includes('.setDescription(ui.text(text, 4096))')
    && !/setDescription\([^)]*SEPARATOR/.test(evSrc));

  // ---- Rendu réel, sans carte : V2 + séparateurs natifs -------------------
  // Un vrai bot en base : runJoinEvent lit store.bots.get(botId), et render()
  // accède à botRecord.prefix. Sans cette ligne le rendu plante.
  const botRow = store.bots.create({ user_id: 1, name: 'Hoxera', token: 'x', client_id: 'c', prefix: '!' });
  const BOT = String(botRow.id || botRow); const GUILD = 'G240';
  let sentPayloads = [];
  const member = () => ({
    id: 'U9', partial: false,
    user: { id: 'U9', tag: 'Alice#0001', username: 'Alice', bot: false, createdTimestamp: Date.now() - 30 * 86400000, displayAvatarURL: () => 'https://cdn.discordapp.com/a.png' },
    guild: {
      id: GUILD, name: 'Serveur test', memberCount: 42, iconURL: () => null,
      channels: { cache: { get: () => undefined, find: () => ({ id: 'CEV', name: 'accueil', isTextBased: () => true, send: async (p) => { sentPayloads.push(p); return { id: 'M' }; } }) } },
      roles: { cache: { find: () => null } },
    },
    roles: { cache: [] },
    joinedTimestamp: Date.now() - 86400000,
  });

  store.events.set(BOT, GUILD, 'member_join', true, {
    channel: 'accueil', plain: false, card: false,
    message: 'Bienvenue Alice !\n\nLisez le règlement.\n\nPassez un bon moment.',
  });
  sentPayloads = [];
  await events.runJoinEvent(BOT, member(), { test: true });
  let welcome = sentPayloads.find((p) => v2.json(p).includes('Bienvenue sur'));
  check('sans carte : panneau Components V2', welcome && v2.isV2(welcome));
  check('sans carte : séparateurs NATIFS entre les 3 paragraphes',
    welcome && v2.dividers(welcome) >= 2, welcome ? `${v2.dividers(welcome)} séparateur(s)` : 'aucun payload');
  check('sans carte : aucun trait texte ━ (le bug signalé)',
    welcome && !v2.json(welcome).includes('━'));

  // ---- Rendu réel, AVEC carte et SANS webhook : V2 + MediaGallery ----------
  // welcomeCard est bouchonné pour ne pas dépendre de sharp/polices en CI.
  const welcomeCardReel = community.welcomeCard;
  community.welcomeCard = async () => Buffer.from('89504e470d0a1a0a', 'hex');
  try {
    store.events.set(BOT, GUILD, 'member_join', true, {
      channel: 'accueil', plain: false, card: true,
      message: 'Bienvenue Alice !\n\nLisez le règlement.',
    });
    sentPayloads = [];
    await events.runJoinEvent(BOT, member(), { test: true });
    const carte = sentPayloads.find((p) => (p.files && p.files.length) || v2.json(p).includes('attachment://bienvenue.png'));
    check('carte sans webhook : la pièce jointe est bien produite',
      !!carte && !!carte.files && carte.files.length === 1, carte ? JSON.stringify(Object.keys(carte)) : 'aucun payload');
    check('carte sans webhook : rendu Components V2 (plus d\u2019embed classique)',
      carte && v2.isV2(carte));
    check('carte sans webhook : la carte est référencée en attachment:// (sinon invisible)',
      carte && v2.json(carte).includes('attachment://bienvenue.png'));
    check('carte sans webhook : séparateurs natifs, AUCUN trait texte ━',
      carte && v2.dividers(carte) >= 1 && !v2.json(carte).includes('━'));

    // ---- AVEC carte ET webhook (profil d'envoi) : embed classique obligatoire
    store.botProfiles.set(BOT, GUILD, { name: 'Hoxera Support' });
    check('le profil d\u2019envoi est bien vu comme un chemin webhook',
      !!require('../server/discord/identity').effectiveProfile(BOT, GUILD));
    sentPayloads = [];
    await events.runJoinEvent(BOT, member(), { test: true });
    // ⚠️ L'arrivée écrit AUSSI une ligne dans le journal (logging.js) et le
    // salon mocké est le même : on cible l'embed de BIENVENUE, pas le premier.
    const classique = sentPayloads.find((p) => p && Array.isArray(p.embeds) && p.embeds.length
      && JSON.stringify(p.embeds).includes('Bienvenue sur'));
    check('carte + webhook : embed classique conservé (V2 + webhook + files = 400)',
      !!classique && !!classique.files && classique.files.length === 1);
    const descEmbed = classique
      ? String((classique.embeds[0].toJSON ? classique.embeds[0].toJSON() : classique.embeds[0]).description || '')
      : '';
    check('carte + webhook : AUCUN trait texte ━ dans la description',
      classique && !descEmbed.includes('━'));
    check('carte + webhook : les paragraphes respirent (saut de ligne conservé)',
      classique && descEmbed.includes('\n\n'), JSON.stringify(descEmbed.slice(0, 70)));
    store.botProfiles.remove(BOT, GUILD);
  } finally {
    community.welcomeCard = welcomeCardReel;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  console.log('\n5b) Migration de données v240 — exécution RÉELLE');
  // -----------------------------------------------------------------------
  // On ne peut pas la tester dans ce processus : la migration tourne au
  // CHARGEMENT de `server/db.js`. On écrit donc l'ancien texte dans une base
  // temporaire, puis on recharge db.js dans un SOUS-PROCESSUS qui rejoue la
  // migration sur cette base — exactement ce qui se passe au boot en production
  // (la base est restaurée depuis la sauvegarde GitHub, piège n°2).
  {
    const { execFileSync } = require('node:child_process');
    const MIG_DIR = path.join(os.tmpdir(), `botdev-v240-mig-${Date.now()}`);
    fs.mkdirSync(MIG_DIR, { recursive: true });
    const ANCIEN_MENU = 'Choisis tes rôles…';
    const ANCIEN_TICKET = "🎫 Besoin d\'aide ? Clique sur le bouton pour ouvrir un ticket !";
    const script = `
      const store = require(${JSON.stringify(path.join(__dirname, '..', 'server', 'db.js'))});
      const db = store.db;
      if (process.argv[2] === 'seed') {
        db.prepare("INSERT INTO role_menus (bot_id,guild_id,name,content,placeholder,channel,options) VALUES (1,'g1','defaut','c',?,'#x','[]')").run('Choisis tes rôles…');
        db.prepare("INSERT INTO role_menus (bot_id,guild_id,name,content,placeholder,channel,options) VALUES (1,'g2','perso','c',?,'#x','[]')").run('Choisis ce que tu veux !');
        db.prepare("INSERT INTO tickets (bot_id,guild_id,name,channel,message) VALUES (1,'g1','t1','#y',?)").run("🎫 Besoin d'aide ? Clique sur le bouton pour ouvrir un ticket !");
        db.prepare("INSERT INTO tickets (bot_id,guild_id,name,channel,message) VALUES (1,'g2','t2','#y',?)").run('🎫 Mon texte perso : clique ici !');
      } else {
        const out = [];
        for (const r of db.prepare('SELECT name, placeholder v FROM role_menus').all()) out.push('M|' + r.name + '|' + r.v);
        for (const r of db.prepare('SELECT name, message v FROM tickets').all()) out.push('T|' + r.name + '|' + r.v);
        console.log('@@' + out.join('@@') + '@@');
      }
      try { db.close(); } catch {}
    `;
    const fichier = path.join(MIG_DIR, 'mig.js');
    fs.writeFileSync(fichier, script, 'utf8');
    const env = { ...process.env, BOTDEV_DATA_DIR: MIG_DIR };
    const run = (mode) => execFileSync(process.execPath, [fichier, mode],
      { env, encoding: 'utf8', cwd: path.join(__dirname, '..') });

    run('seed');                       // base « avant v240 »
    const apres = run('migrate');      // rechargement → migration appliquée
    const lignes = apres.split('@@').map((x) => x.replace(/^\n|\n$/g, '')).filter((x) => x.trim());
    const valeur = (p) => (lignes.find((l) => l.startsWith(p)) || '').split('|').slice(2).join('|');

    check('migration réelle : role_menus par défaut converti',
      valeur('M|defaut') === 'Choisissez vos rôles…', `obtenu « ${valeur('M|defaut')} »`);
    check('migration réelle : role_menus PERSONNALISÉ intact',
      valeur('M|perso') === 'Choisis ce que tu veux !', `obtenu « ${valeur('M|perso')} »`);
    check('migration réelle : message de ticket par défaut converti',
      valeur('T|t1').includes('Cliquez sur le bouton pour ouvrir un ticket'),
      `obtenu « ${valeur('T|t1').slice(0, 50)} »`);
    check('migration réelle : message de ticket PERSONNALISÉ intact',
      valeur('T|t2') === '🎫 Mon texte perso : clique ici !',
      `obtenu ${JSON.stringify(valeur('T|t2'))}`);
    fs.rmSync(MIG_DIR, { recursive: true, force: true });
  }

  console.log('\n6) Aucun secret ajouté + versionnage front v240');
  // -----------------------------------------------------------------------
  const modifies = (() => {
    try {
      return require('node:child_process')
        .execSync('git diff --name-only HEAD', { cwd: path.join(__dirname, '..') })
        .toString().trim().split('\n').filter(Boolean);
    } catch { return []; }
  })();
  const SECRETS = /(github_pat_[A-Za-z0-9_]{20,}|rnd_[A-Za-z0-9]{20,}|x-access-token:[A-Za-z0-9_]{20,})/;
  const fuites = modifies.filter((f) => {
    try { return SECRETS.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')); } catch { return false; }
  });
  check('aucun token en dur dans les fichiers modifiés', fuites.length === 0, fuites.join(', '));

  const index = src('public/index.html');
  const sw = src('public/sw.js');
  check('index.html : ?v=249 référencé 7 fois', (index.match(/\?v=249/g) || []).length === 7,
    `trouvé ${(index.match(/\?v=249/g) || []).length}`);
  check("sw.js : cache 'botdev-v249'", sw.includes("const CACHE = 'botdev-v249';"));
  check('index.html : plus aucun ?v=239', !/\?v=239/.test(index));
}

main().then(() => {
  try { store.db.close(); } catch {}
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`\n${echecs === 0 ? '🎉' : '❌'} V240 — ${echecs} échec(s)`);
  process.exit(echecs === 0 ? 0 : 1);
}).catch((e) => { console.error('💥 Erreur fatale du test :', e); process.exit(1); });
