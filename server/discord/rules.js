// ============================================================
// v362 — 📜 RÈGLES : panneau de règles + bouton d'acceptation + rôle.
// ------------------------------------------------------------
// Le module fait trois choses, dans l'ordre :
//   1. il envoie (ou met à jour) un panneau de règles soigné dans le salon
//      choisi — panneau en Components V2, comme le reste d'Hoxera, avec un
//      séparateur pleine largeur entre chaque partie ;
//   2. il pose dessous un bouton « J'accepte les règles » ;
//   3. au clic, il donne le rôle choisi, note l'acceptation en base et la
//      journalise.
// Le texte des règles est du MARKDOWN DISCORD réel : **gras**, *italique*,
// __souligné__, ~~barré~~, `code`, ```bloc```, > citation, - liste,
// ||spoiler||, <a:nom:id> et <:nom:id>. Les dix modèles livrés respectent ces
// balises et les plafonds de l'API (voir server/discord/ui.js :
// V2_TEXT_BUDGET = 4000 caractères et 40 composants par panneau).
//
// v363 — trois corrections de fond demandées par le terrain :
//   • le bouton ne peut plus disparaître : le budget de composants est réservé
//     en amont (voir ui.v2container) et plan() annonce à l'avance ce que le
//     panneau contiendra ;
//   • les traits « ━ » tapés à la main dans le texte sont RETIRÉS : Discord
//     pose déjà un vrai séparateur entre chaque bloc, le caractère dupliquait
//     la ligne et gaspillait deux composants par trait ;
//   • le panneau est envoyé avec `allowedMentions: { parse: [] }` : sans ça,
//     un « @everyone » écrit dans les règles (ou le marqueur {role} remplacé
//     par @NomDuRole) pingAIT TOUT LE SERVEUR à la publication.
// Le panneau publié est SUIVI : cfg.panel_message permet de le mettre à jour
// au lieu d'en empiler un deuxième.
// ============================================================
const store = require('../db');
const ui = require('./ui');
const i18n = require('../i18n');
const logging = require('./logging');
const {
  ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionsBitField,
  SectionBuilder, TextDisplayBuilder,
} = require('discord.js');

const F = PermissionsBitField.Flags;

const TITLE_MAX = 120;
const BODY_MAX = 3000;      // marge sous le budget V2 (4000) titre + pied inclus
const BUTTON_MAX = 80;
const FOOTER_MAX = 300;
const HISTORY_CAP = 400;    // acceptations conservées pour le tableau de bord

const COLOR_DEFAULT = '#5865F2';

// Deux façons de poser le bouton, au choix dans le tableau de bord :
//   • 'ligne' (défaut) — une ActionRow pleine largeur sous le panneau ;
//   • 'carte'          — le bouton en accessoire d'une Section, la disposition
//     employée par le mode boutons des tickets (celle qui n'a jamais posé de
//     souci de rendu chez les membres).
const BUTTON_PLACEMENTS = { ligne: 'ligne', carte: 'carte' };
const PLACEMENT_DEFAULT = 'ligne';

// Un panneau de 40 composants maximum : 1 conteneur + 1 titre + (2n - 1) pour
// n blocs de corps (chaque bloc est suivi d'un séparateur) + 2 pour le pied
// (séparateur + texte) + 2 pour la ligne de bouton (rangée + bouton).
// Au-delà de MAX_BLOCKS, ui.v2container fusionne les blocs deux par deux : le
// panneau reste complet et le bouton ne saute plus.
const MAX_BLOCKS = Math.floor((ui.V2_COMPONENT_CAP - 5) / 2);

// Lignes qui ne sont QU'UN trait de séparation tapé à la main : « ━ », « ━━━ »,
// « ---- ». Discord pose déjà un VRAI séparateur entre chaque bloc ; garder ces
// lignes doublait le trait et coûtait deux composants par trait (20 composants
// gaspillés sur un panneau de 40). Un caractère suffit : les modèles et les
// copiés-collés d'administrateurs écrivent le trait seul sur sa ligne.
// SAFES : une ligne de liste (« - un ») ou du texte ne correspondent jamais.
const FAKE_SEPARATOR = /^[\s\u2501\u2500\u2502\u2503\u2504\u2505\u2506\u2507\u254c\u254d\u25ac\u2014\u2013\-=~\u00b7\u2022]+$/;

const RULES_STYLES = {
  vert: ButtonStyle.Success,
  gris: ButtonStyle.Secondary,
  rouge: ButtonStyle.Danger,
  bleu: ButtonStyle.Primary,
};

// ------------------------------------------------------------
// Modèles livrés : dix panneaux écrits avec la grammaire Discord réelle.
// Règle d'or d'écriture (tenue par le test v362) : UNE RÈGLE = UN BLOC.
// Le titre de la règle est la première ligne du bloc, son développement est
// la ligne suivante, sans ligne vide entre les deux — chaque ligne vide crée
// un bloc, donc un composant et un séparateur ; dix règles mal groupées
// suffisaient à saturer les 40 composants autorisés.
// « {serveur} » est remplacé par le nom du serveur ; « @everyone » est écrit
// entre accents graves pour ne JAMAIS déclencher de notification.
// ------------------------------------------------------------
const PRESETS = {
  essentiel: {
    label: 'L’essentiel — 5 règles courtes',
    hint: 'Le plus lu : dix secondes de lecture, zéro ambiguïté.',
    text: [
      '> **{serveur} — le minimum pour que ça reste agréable.**',
      '**1.** Restez courtois : pas d’insulte, pas de harcèlement, pas de propos haineux.',
      '**2.** Gardez le serveur propre : pas de spam, pas de publicité, pas de liens douteux.',
      '**3.** Rien de choquant : pas de contenu adulte, violent ou illégal, nulle part.',
      '**4.** Écrivez dans le bon salon ; une question = un ticket, jamais dix messages.',
      '**5.** Les décisions du staff sont appliquées avec calme et sans débat public.',
      '*Refuser ces règles, c’est quitter le serveur. En acceptant, vous vous engagez à les lire vraiment.*',
    ].join('\n\n'),
  },
  classique: {
    label: 'Classique — communauté générale',
    hint: 'Polyvalent : discutions, salon vocal, événements.',
    text: [
      '> **Bienvenue sur {serveur}.** Ces règles sont là pour que tout le monde puisse discuter tranquillement. En restant ici, vous les acceptez.',
      '**1. Respect avant tout**\nAucune insulte, moquerie, harcèlement ou provocation. Un désaccord se règle en **message privé avec le staff**, jamais en public. __Les propos racistes, sexistes, homophobes ou transphobes entraînent un bannissement immédiat.__',
      '**2. Pas de spam ni de publicité**\nPas de flood, pas de messages en MAJUSCULES, pas de `@everyone` non autorisé, pas de promotion d’un autre serveur sans accord du staff. Les liens raccourcis sont interdits.',
      '**3. Contenu réservé aux adultes**\nEst interdit : contenu pornographique, gore ou choquant, apologie du crime ou de la drogue, ainsi que toute information personnelle (adresse, téléphone, nom complet) publiée sur quelqu’un.',
      '**4. Un salon pour chaque sujet**\nÉcrivez dans le bon salon. Les demandes de support passent par les **tickets** ; les bugs et les suggestions ont leur salon dédié.',
      '**5. Pseudos et identités**\nPseudo lisible, sans lien ni caractères rendant la modération impossible. Usurper l’identité d’un membre ou du staff, c’est une exclusion définitive.',
      '**6. Les sanctions ne se discutent pas en public**\nUne décision peut être contestée **en ticket**, avec des faits. Contester dans un salon public vaut un avertissement de plus.',
      '*Ce règlement peut évoluer. La version publiée ici est la seule qui compte : {membres} acceptation(s) enregistrée(s).*',
    ].join('\n\n'),
  },
  gaming: {
    label: 'Gaming — serveur de jeu',
    hint: 'Files d’attente, squad, triche et language VOIP.',
    text: [
      '> **{serveur} — on joue ensemble, on reste corrects.** Le salon vocal est aussi important que le chat : il défend l’ambiance.',
      '**1. Triche, exploit et script**\nTout logiciel tiers, macro matérielle ou abus de bug est **interdit** : exclusion définitive du serveur et des tournois, sans appel si la preuve est là.',
      '**2. Vocal : la règle des trois**\nPas de musique par-dessus la discussion, pas de micro qui sert de haut-parleur, pas de cris dans le canal général. Un `@everyone` pour appeler une partie : on évite, ça réveille tout le serveur.',
      '**3. Recrutement et équipes**\nLes demandes de squad passent par le salon **🎮 recherche-de-team**. Le démarchage en MP non sollicité est interdit, même entre joueurs du serveur.',
      '**4. Propos et conduites**\nAucune insulte, aucune discrimination, aucun harcèlement, y compris en jeu. Un joueur muet par vote est respecté : on ne le force pas à parler.',
      '**5. Événements et tournois**\nInscrivez-vous dans le salon dédié. Tout abandon sans prévenir perturbe les autres équipes : prévenez le staff **avant** le début.',
      '**6. Pas de revente ni de compte partagé**\nComptes, skins, classements et services achetés ou vendus entre membres : hors de question, et le serveur ne peut garantir aucune transaction.',
      '*Le staff peut couper un micro ou éjecter d’une file d’attente sur-le-champ si l’ambiance devient toxique.*',
    ].join('\n\n'),
  },
  roleplay: {
    label: 'Roleplay — serveur RP',
    hint: 'Immersion, hors-RP, interactions et-sanction RP.',
    text: [
      '> **{serveur} — l’histoire passe avant le joueur.** Le hors-RP se dit en parenthèses, jamais dans la scène.',
      '**1. Un personnage, une fiche**\nChaque personnage est déclaré dans **📝 fiches** avec un passé cohérent avec l’univers. Aucun pouvoir, aucun argent, aucun objet hors barème sans validation du staff.',
      '**2. Immersion obligatoire**\nPas de métajeu : ne pas utiliser d’information obtenue hors scène. Le *powergaming* (imposer une action sans laisser de réponse) est sanctionné.',
      '**3. Thèmes lourds**\nViolence, emprise, dépendances : **🔞** en début de scène, jamais dans un salon ouvert à tous. Un thème refusé par un joueur est écarté, sans discussion.',
      '**4. Consentement en scène**\nToute interaction entre personnages se fait avec l’accord des deux joueurs. Un refus n’est pas un caprice : c’est une limite.',
      '**5. Rythme et qualité**\nUne réponse en trois lignes minimum est attendue en scène principale. Spammer une ligne pour « avancer » casse le rythme de tout le monde.',
      '**6. Hors-RP et modération**\nLes conflits se règlent en **ticket**, pas en scène. Une sanction RP doit être justifiée par un écrit : on ne punit pas un personnage sur un soupçon.',
      '*Le règlement des événements spéciaux (soirées, enquêtes, guerres de factions) s’ajoute à celui-ci et prime pendant la scène.*',
    ].join('\n\n'),
  },
  amis: {
    label: 'Entre amis — serveur privé',
    hint: 'Court et détendu : petit groupe, vocaux, invites.',
    text: [
      '> **{serveur} — le salon de la bande.** On s’invite entre gens d’accord, et on garde ça agréable.',
      '**1. On invite avec la tête**\nUn nouvel invité est présenté dans **👋 accueil**. Les comptes créés la veille ou sans pseudo lisible repartent sans discussion.',
      '**2. Le vocal est à tout le monde**\nPas de musique en boucle, pas de micro ouvert dans le vide, on se tait quand quelqu’un raconte quelque chose.',
      '**3. Pas de capture d’écran méchante**\nCe qui se dit ici reste ici. Publier une capture pour se moquer, c’est sortir du groupe.',
      '**4. On se dit les choses**\nUn agacement se règle en MP ou à la prochaine partie, pas par trois messages passifs-agressifs dans le général.',
      '*Aucun rôle, aucune sanction automatique : ici, c’est le bon sens qui fait la règle.*',
    ].join('\n\n'),
  },
  famille: {
    label: 'Famille & jeunes publics',
    hint: 'Un texte court, des parents rassurés, l’âge minimum rappelé.',
    text: [
      '> **{serveur} — un endroit calme pour tous les âges.** Les plus jeunes sont encadrés, les parents peuvent être rassurés.',
      '**1. Âge minimum**\nCe serveur est ouvert aux **13 ans et plus**, conformément à l’âge minimum de Discord. Un compte reste sous la seule responsabilité de son titulaire.',
      '**2. Langage propre**\nPas d’insulte, pas de blague humiliante, pas de mot pour désigner quelqu’un. Un avertissement, puis une pause de 24 h.',
      '**3. Rien de choquant**\nImages, vidéos, liens et jeux doivent rester adaptés à un public de 13 ans. En cas de doute : demandez au staff avant de publier.',
      '**4. On ne donne aucune information personnelle**\nAdresse, école, âge exact, numéro, nom de famille, photo de classe : jamais, même en MP, même entre amis.',
      '**5. Les adultes du staff tranchent**\nUn parent qui signale un problème est reçu en **ticket** et reçoit une réponse sous 48 h.',
      '*En acceptant, vous confirmez avoir lu ces règles avec la personne qui vous accompagne.*',
    ].join('\n\n'),
  },
  support: {
    label: 'Communauté officielle & support',
    hint: 'Produit ou créateur : le bon canal pour chaque demande.',
    text: [
      '> **{serveur} — communauté officielle.** Ici on s’entraide, on signale, et on attend le support par le bon canal.',
      '**1. Une demande = un ticket**\nLes problèmes de compte, de commande ou de paiement passent **uniquement** par les tickets. Un message posté ailleurs sera supprimé, sans réponse.',
      '**2. Aucun détail sensible en public**\nJamais de mot de passe, de clé de licence ni de capture de facture dans un salon public. En ticket, masquez ce qui n’est pas nécessaire.',
      '**3. Réponses de l’équipe**\nSeuls les membres du rôle **🛠️ staff** engagent le serveur (remboursement, délai, promesse). Le reste de la communauté partage son expérience, sans la présenter comme officielle.',
      '**4. Courtoisie dans les échanges**\nPas d’insulte, pas de meute sur un message, pas de menace juridique en chaîne. Une plainte se dépose en ticket, pas dans le général.',
      '**5. Publicité et liens**\nEst interdite : la promotion d’un service concurrent, d’un groupe parallèle, de tout lien d’affiliation non déclaré.',
      '**6. Modération des fausses infos**\nUne réponse erronée peut être corrigée ou masquée par le staff. La version officielle d’un sujet reste la réponse en ticket.',
      '*Les horaires de support sont indiqués dans **📬 tickets**. En dehors, le serveur reste une entraide entre membres.*',
    ].join('\n\n'),
  },
  tournoi: {
    label: 'Compétition & tournois',
    hint: 'Règles de match, arbitrage, inscriptions et litiges.',
    text: [
      '> **{serveur} — circuit compétitif.** Une inscription vaut acceptation du règlement du format en cours.',
      '**1. Inscription et présence**\nLe rôle **🏆 inscrit** est donné après inscription en **📋 inscriptions**. Absent 10 minutes après l’appel : match perdu.',
      '**2. Équipes et substitutions**\nUne équipe est déclarée avant la première manche. Une substitution se signale à l’arbitre AVANT le match, jamais pendant.',
      '**3. Matériel et logiciels**\nAucun logiciel tiers, aucune macro non prévue par le jeu, aucun périphérique non déclaré. Vérification possible avant chaque manche.',
      '**4. Comportement en match**\nInsultes, provocation, abandon de match volontaire ou *griefing* : disqualification du tournoi en cours, points retirés.',
      '**5. Litiges**\nSe règlent en **ticket arbitrage**, avec preuve (rediffusion, capture horodatée). Aucune réclamation dans le salon général ni en vocal.',
      '**6. Argent et lots**\nLes lots sont versés après vérification des identifiants fournis. Aucun remboursement, aucune revente de place.',
      '*Le calendrier, la formule (poules, élimination directe) et le barème de points sont publiés avant chaque édition : ils complètent ce règlement.*',
    ].join('\n\n'),
  },
  createurs: {
    label: 'Créateurs & streamers',
    hint: 'Auto-promo cadrée, droits d’image, entraide assumée.',
    text: [
      '> **{serveur} — le coin des créateurs.** Chacun peut montrer son travail, dans un cadre qui protège tout le monde.',
      '**1. Auto-promo : un seul endroit**\nLes liens (chaîne, réseaux, boutique) se publient dans **📣 autopromo**, à raison de **deux posts par semaine**. Ailleurs, c’est suppression.',
      '**2. Aucun spam entre créateurs**\nS’abonner pour s’abonner, déposer un commentaire d’abonnement en MP, ou organiser des raids d’abonnement : interdit.',
      '**3. Droits d’image**\nUne capture, une vidéo ou un extrait d’un membre ou d’un stream en cours nécessite son accord. Un refus se respecte sans négociation.',
      '**4. Le chat d’un autre, c’est pas le vôtre**\nOn ne vient pas polluer un stream partenaire avec de la pub, du spoil ou des remarques sur les spectateurs.',
      '**5. Contenu et monétisation**\nPas de contenu choquant, pas de loterie non déclarée, pas de lien de paiement hors cadre annoncé. Toute collaboration payante est signalée.',
      '**6. Statistiques et entraide**\nLes retours d’analyse (vues, référencement, miniature) se font en **💬 entraide**, avec des faits : les conseils gratuits ne sont pas une obligation.',
      '*Les créateurs référencés dans **🌟 partenaires** gardent les mêmes règles : la visibilité ne dispense pas du respect du cadre.*',
    ].join('\n\n'),
  },
  evenement: {
    label: 'Événement ponctuel',
    hint: 'Soirée, convention, salon : règles courtes et datées.',
    text: [
      '> **{serveur} — événement du moment.** Ces règles ne valent que pour la durée de l’événement, puis le salon est archivé.',
      '**1. Programme**\nLes horaires affichés dans **📅 programme** sont ceux de référence. Un retard de plus de 20 minutes annule l’atelier correspondant.',
      '**2. Inscriptions et places**\nUne place est nominative : elle ne se revend pas et ne se cède qu’auprès du staff, qui la réattribue le jour même.',
      '**3. Sur place et en ligne**\nPas de course, pas de poussette dans les passages, pas d’objet en hauteur. En vocal, on lève la main (réaction ✋) avant de couper la parole.',
      '**4. Photos et vidéos**\nChaque participant peut être photographié. Pour ne pas apparaître, prenez le rôle **🚫 sans-photos** à l’accueil.',
      '**5. Sécurité**\nUne consigne du staff (évacuation, micro coupé, fin de session) s’applique immédiatement, sans discussion.',
      '*En cas de désaccord pendant l’événement, le staff présent tranche ; la réclamation se dépose ensuite en ticket.*',
    ].join('\n\n'),
  },
};

const DEFAULT_PRESET = 'essentiel';

function presets() {
  // `blocks` et `components` reprennent EXACTEMENT le compte que fera
  // v2container : le tableau de bord peut ainsi annoncer « ce modèle tient
  // dans le panneau » avant la publication, sans dupliquer la logique.
  return Object.entries(PRESETS).map(([id, p]) => {
    const blocks = ui.paragraphs(cleanBody(p.text)).length;
    return {
      id, label: p.label, hint: p.hint || '', text: p.text,
      length: p.text.length, blocks, components: blocks * 2 + 5, airy: blocks <= MAX_BLOCKS,
    };
  });
}

// ------------------------------------------------------------
// Réglages
// ------------------------------------------------------------
function colorOf(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : COLOR_DEFAULT;
}

function styleOf(value) {
  const key = String(value || 'vert').toLowerCase();
  return RULES_STYLES[key] ? key : 'vert';
}

// Retire les faux séparateurs, normalise les fins de ligne et les lignes vides
// en série. Le texte de l'administrateur reste le texte de l'administrateur :
// on ne touche qu'aux lignes qui n'étaient QUE des traits.
function cleanBody(text) {
  const src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  const kept = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (t.length >= 1 && FAKE_SEPARATOR.test(t)) continue;
    kept.push(line);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Compte le panneau tel que v2container va le construire (même découpe, même
// réservation) : le tableau de bord annonce donc la couleur AVANT l'envoi, au
// lieu de découvrir un panneau amputé après coup.
//
// Deux chiffres, parce qu'ils ne racontent pas la même chose :
//   • `blocks`   : ce que VOUS avez écrit (un paragraphe = un bloc = un
//     séparateur naturel entre les règles) ;
//   • `shown`    : ce que Discord affichera. Au-delà de MAX_BLOCKS blocs,
//     les paragraphes sont regroupés deux par deux dans le même bloc — le
//     texte reste ENTIER, il y a juste moins d'air, et surtout le bouton est
//     conservé (c'était l'inverse avant v363).
function plan(cfg, lang, vars = {}) {
  const t = texts(cfg, lang, vars);
  const blocks = Math.max(1, ui.paragraphs(t.body).length);
  const chars = t.title.length + t.body.length + t.footer.length;
  // Simulation de la fusion de ui.v2container (2n - 1 composants pour n blocs,
  // budget = 40 - conteneur - titre - pied - ligne de bouton).
  const available = ui.V2_COMPONENT_CAP - 2 - 2 - 2;
  let shown = blocks;
  while (shown > 1 && shown * 2 - 1 > available) shown = Math.ceil(shown / 2);
  const components = 1 + 1 + (shown * 2 - 1) + 2 + 2;
  return {
    blocks,
    shown,
    max_blocks: MAX_BLOCKS,
    chars,
    max_chars: ui.V2_TEXT_BUDGET,
    components,
    cap: ui.V2_COMPONENT_CAP,
    // Les blocs de l'administrateur tiennent-ils tels quels ?
    airy: blocks <= MAX_BLOCKS,
    // Le texte total tient-il dans le budget de caractères Discord ?
    fits: chars <= ui.V2_TEXT_BUDGET,
    placement: t.placement,
  };
}

function fill(text, vars) {
  let out = String(text == null ? '' : text);
  for (const [key, value] of Object.entries(vars || {})) {
    out = out.split(`{${key}}`).join(String(value == null ? '' : value));
  }
  return out;
}

function cfgOf(guildId) {
  let raw = {};
  try { raw = JSON.parse(store.settings.get(`rules_cfg:${guildId}`) || '{}') || {}; } catch {}
  const cfg = { ...raw };
  cfg.enabled = !!cfg.enabled;
  cfg.channel = String(cfg.channel || '').slice(0, 30);
  cfg.role = String(cfg.role || '').slice(0, 30);
  cfg.title = String(cfg.title || '').slice(0, TITLE_MAX);
  cfg.body = String(cfg.body || '').slice(0, BODY_MAX);
  cfg.color = colorOf(cfg.color);
  cfg.button_label = String(cfg.button_label || '').slice(0, BUTTON_MAX);
  cfg.button_style = styleOf(cfg.button_style);
  cfg.button_placement = BUTTON_PLACEMENTS[String(cfg.button_placement || '').toLowerCase()] || PLACEMENT_DEFAULT;
  cfg.footer = String(cfg.footer || '').slice(0, FOOTER_MAX);
  cfg.thanks = String(cfg.thanks || '').slice(0, 500);
  cfg.log_channel = String(cfg.log_channel || '').slice(0, 30);
  cfg.panel_message = String(cfg.panel_message || '').slice(0, 30);
  cfg.panel_channel = String(cfg.panel_channel || '').slice(0, 30);
  cfg.using_default = !cfg.body; // le panneau s'appuie sur un modèle livré
  cfg.plan = plan(cfg, i18n.langForGuild(guildId), { serveur: '{serveur}', role: '{role}', membres: '{membres}' });
  return cfg;
}

function saveCfg(guildId, patch) {
  const current = cfgOf(guildId);
  const next = { ...current };
  const allowed = ['enabled', 'channel', 'role', 'title', 'body', 'color', 'button_label',
    'button_style', 'button_placement', 'footer', 'thanks', 'log_channel', 'panel_message', 'panel_channel'];
  for (const key of allowed) {
    if (patch && patch[key] !== undefined) next[key] = patch[key];
  }
  // Un corps qui redevient vide doit sortir du mode « modèle par défaut ».
  // `plan` est une valeur CALCULEE par cfgOf : elle n'a rien a faire en base.
  delete next.plan;
  store.settings.set(`rules_cfg:${guildId}`, JSON.stringify(next));
  return cfgOf(guildId);
}

function texts(cfg, lang, vars = {}) {
  const preset = PRESETS[DEFAULT_PRESET];
  // Les modèles livrés commencent par « Bienvenue sur {serveur} » : le corps
  // est nettoyé (faux séparateurs), puis rempli, puis coupé au plafond — dans
  // cet ordre, sinon un marqueur tronqué resterait affiché à l'écran.
  const body = fill(cleanBody(cfg.body) || cleanBody(preset.text), vars).slice(0, BODY_MAX);
  const placement = BUTTON_PLACEMENTS[String(cfg.button_placement || '').toLowerCase()] || PLACEMENT_DEFAULT;
  return {
    title: fill(cfg.title || i18n.t(lang, 'rules_title'), vars).slice(0, TITLE_MAX),
    body,
    footer: fill(cfg.footer || i18n.t(lang, 'rules_footer'), vars).slice(0, FOOTER_MAX),
    button: fill(cfg.button_label || i18n.t(lang, 'rules_button'), vars).slice(0, BUTTON_MAX),
    color: cfg.color || COLOR_DEFAULT,
    style: styleOf(cfg.button_style),
    placement,
    hint: fill(i18n.t(lang, 'rules_accept_hint'), vars),
  };
}

function channelFor(guild, ref) {
  const id = String(ref || '').trim().replace(/^#/, '');
  if (!id) return null;
  const direct = guild.channels && guild.channels.cache ? guild.channels.cache.get(id) : null;
  if (direct) return direct;
  const name = id.toLowerCase();
  const list = (guild.channels && guild.channels.cache ? [...guild.channels.cache.values()] : []);
  return list.find((c) => c && c.name && c.name.toLowerCase() === name && typeof c.send === 'function') || null;
}

function fail(message, code) {
  const e = new Error(message);
  e.code = code || 'RULES_ERROR';
  return e;
}

// Le payload exact (extrait pour être testé sans bot ni réseau).
function buildPanel(t, botId) {
  const button = new ButtonBuilder()
    .setCustomId(`hxrules:${botId}:accept`)
    .setLabel(t.button || i18n.t('fr', 'rules_button'))
    .setEmoji('✅')
    .setStyle(RULES_STYLES[t.style] || ButtonStyle.Success);
  const rows = [];
  if (t.placement === 'carte') {
    // Bouton en accessoire d'une Section (disposition des tickets) : la ligne
    // d'instruction est à gauche, le bouton à droite, dans le panneau.
    rows.push(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(t.hint || ' '))
      .setButtonAccessory(button));
  } else {
    rows.push(new ActionRowBuilder().addComponents(button));
  }
  // ui.v2panel s'occupe des séparateurs entre paragraphes, de la réservation
  // du budget pour les composants interactifs et de l'audit des plafonds
  // Discord (titre, budget de texte, nombre de composants).
  return ui.v2panel({
    color: t.color,
    title: `📜 ${t.title}`,
    description: t.body,
    footer: t.footer || false,
  }, rows);
}

// Le bouton est-il bien présent dans le message TEL QUE Discord le renvoie ?
// C'est le contrôle qui manque pour ne plus jamais annoncer un panneau
// « publié » alors qu'il est arrivé sans bouton.
function panelHasButton(message, botId) {
  const cid = `hxrules:${botId}:accept`;
  let comps = [];
  try {
    comps = (message && (message.components || (message.data && message.data.components))) || [];
    if (typeof comps.toJSON === 'function') comps = comps.toJSON();
    if (typeof comps === 'string') comps = JSON.parse(comps);
  } catch { return false; }
  // Les composants peuvent arriver tels que Discord les renvoie (JSON fil) ou
  // tels que discord.js les garde en mémoire (builders, avec .data / toJSON) :
  // on normalise pour que le contrôle fonctionne dans les deux cas.
  const pick = (c, key) => {
    if (!c || typeof c !== 'object') return undefined;
    if (c[key] !== undefined) return c[key];
    if (c.data && c.data[key] !== undefined) return c.data[key];
    return undefined;
  };
  const walk = (list) => {
    for (const c of list || []) {
      if (!c || typeof c !== 'object') continue;
      const id = pick(c, 'custom_id') || pick(c, 'customId');
      if (id === cid) return true;
      const kids = pick(c, 'components');
      if (Array.isArray(kids) && walk(kids)) return true;
      const acc = pick(c, 'accessory');
      if (acc && walk([acc])) return true;
    }
    return false;
  };
  try { return walk(comps); } catch { return false; }
}

// ------------------------------------------------------------
// Publication : mise à jour du panneau suivi, sinon nouvel envoi
// ------------------------------------------------------------
async function sendPanel(botId, guild, channelId) {
  const cfg = cfgOf(guild.id);
  const lang = i18n.langForGuild(guild.id);
  const target = channelFor(guild, channelId || cfg.channel);
  if (!target) throw fail(i18n.t(lang, 'rules_no_channel'), 'NO_CHANNEL');
  const roleSuivi = cfg.role && guild.roles && guild.roles.cache ? guild.roles.cache.get(cfg.role) : null;
  const t = texts(cfg, lang, {
    serveur: guild.name || 'le serveur',
    role: roleSuivi ? `@${roleSuivi.name}` : '—',
    rôle: roleSuivi ? `@${roleSuivi.name}` : '—',
    membres: String(stateOf(guild.id).count),
  });
  const payload = buildPanel(t, botId);
  // 🛡️ Un panneau de règles ne doit JAMAIS notifier : {role} est remplacé par
  // « @NomDuRôle » et un texte peut contenir « @everyone ». Sans cette ligne,
  // la publication pingait tout le serveur.
  payload.allowedMentions = { parse: [], repliedUser: false };
  const plan_ = plan(cfg, lang, { serveur: guild.name || 'le serveur', role: roleSuivi ? `@${roleSuivi.name}` : '—', membres: String(stateOf(guild.id).count) });

  // Déjà un panneau suivi sur ce serveur → on le met à jour.
  if (cfg.panel_message && cfg.panel_channel) {
    const previous = channelFor(guild, cfg.panel_channel);
    const message = previous && previous.messages
      ? await previous.messages.fetch(cfg.panel_message).catch(() => null) : null;
    if (message) {
      const edited = await message.edit(payload).catch(() => null);
      if (edited && String(previous.id) === String(target.id)) {
        const verified = panelHasButton(edited, botId);
        if (!verified) noteMissingButton(botId, guild, plan_);
        saveCfg(guild.id, { panel_message: edited.id, panel_channel: previous.id });
        if (verified) notePublished(botId, guild, 'edit', edited, plan_);
        else noteMissingButton(botId, guild, plan_);
        return { mode: 'edit', message: edited, verified, plan: plan_ };
      }
      if (String(previous.id) !== String(target.id)) {
        // Le salon a changé : l'ancien message est retiré, le nouveau part ailleurs.
        await message.delete().catch(() => {});
      }
    } else {
      // Le message suivi n'existe plus (supprime a la main) : on repart
      // d'un envoi propre plutot que de garder une reference morte.
      saveCfg(guild.id, { panel_message: '', panel_channel: '' });
    }
  }
  const sent = await target.send(payload);
  const verified = panelHasButton(sent, botId);
  if (!verified) noteMissingButton(botId, guild, plan_);
  else notePublished(botId, guild, 'send', sent, plan_);
  saveCfg(guild.id, {
    panel_message: sent.id,
    panel_channel: sent.channel.id,
    channel: String(cfg.channel || sent.channel.id),
  });
  logging.log(botId, guild, {
    title: '📜 Panneau de règles publié', color: t.color, type: 'other',
    fields: [
      { name: '📣 Salon', value: `#${sent.channel.name || sent.channel.id}`, inline: true },
      { name: '🏷️ Rôle donné', value: cfg.role ? '<@&' + cfg.role + '>' : 'aucun', inline: true },
    ],
  });
  return { mode: 'send', message: sent, verified, plan: plan_ };
}

// Succès affiché dans les journaux : le fondateur (et nous) peut vérifier
// qu'un panneau publié contient BIEN son bouton, sans avoir à ouvrir Discord.
function notePublished(botId, guild, mode, message, plan_) {
  console.log(`[BotDev] 📜 panneau de règles ${mode === 'edit' ? 'mis à jour' : 'publié'} sur ${guild.name || guild.id} — bouton ✅ vérifié (${plan_.shown}/${plan_.blocks} bloc(s), ${plan_.components}/${plan_.cap} composants, id ${message && message.id})`);
}

// Le panneau est parti sans bouton ? On ne le cache pas : journal + santé, pour
// que le tableau de bord puisse le dire à l'administrateur au lieu de faire
// semblant d'avoir réussi.
function noteMissingButton(botId, guild, plan_) {
  const detail = `bot ${botId} · guild ${guild.id} · ${plan_.blocks} bloc(s), ${plan_.components}/${plan_.cap} composants, ${plan_.chars}/${plan_.max_chars} caractères`;
  console.error(`[BotDev] 📜 panneau de règles publié SANS bouton (${detail})`);
  try { require('../health').recordError('panneau-regles-sans-bouton', detail); } catch {}
}

async function deletePanel(botId, guild) {
  const cfg = cfgOf(guild.id);
  if (!cfg.panel_message || !cfg.panel_channel) return { mode: 'none' };
  const channel = channelFor(guild, cfg.panel_channel);
  const message = channel && channel.messages
    ? await channel.messages.fetch(cfg.panel_message).catch(() => null) : null;
  if (message) await message.delete().catch(() => {});
  saveCfg(guild.id, { panel_message: '', panel_channel: '' });
  return { mode: message ? 'deleted' : 'forgotten' };
}

// ------------------------------------------------------------
// Acceptations
// ------------------------------------------------------------
function stateOf(guildId) {
  let raw = { count: 0, last_at: 0, members: [] };
  try {
    const parsed = JSON.parse(store.settings.get(`rules_state:${guildId}`) || '{}') || {};
    raw = { ...raw, ...parsed };
  } catch {}
  if (!Array.isArray(raw.members)) raw.members = [];
  raw.count = Number(raw.count) || 0;
  raw.last_at = Number(raw.last_at) || 0;
  raw.members = raw.members.slice(0, HISTORY_CAP);
  return raw;
}

function noteAcceptation(guildId, user) {
  const state = stateOf(guildId);
  const id = String(user.id);
  const others = state.members.filter((m) => String(m.id) !== id);
  const deja = state.members.find((m) => String(m.id) === id);
  const entry = {
    id,
    tag: String(user.tag || user.username || id).slice(0, 80),
    at: Date.now(),
    // La PREMIÈRE acceptation est la date qui compte juridiquement pour le
    // staff (« à quand remonte son accord ? ») : un re-clic ne l'écrase plus.
    first_at: (deja && (deja.first_at || deja.at)) || Date.now(),
  };
  const members = [entry, ...others].slice(0, HISTORY_CAP);
  store.settings.set(`rules_state:${guildId}`, JSON.stringify({
    count: Math.max(state.count, members.length), last_at: entry.at, members,
  }));
  return entry;
}

function resetAcceptations(guildId) {
  store.settings.set(`rules_state:${guildId}`, JSON.stringify({ count: 0, last_at: 0, members: [] }));
  return true;
}

// Qui n'a PAS le rôle alors que le panneau est en ligne (liste d'appel).
async function missingMembers(botId, guild, limit = 200) {
  const cfg = cfgOf(guild.id);
  const roleId = String(cfg.role || '');
  if (!roleId) return { error: 'Aucun rôle d\'acceptation n\'est configuré.' };
  const role = guild.roles && guild.roles.cache ? guild.roles.cache.get(roleId) : null;
  if (!role) return { error: 'Le rôle configuré est introuvable sur ce serveur.' };
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return { error: 'Le serveur n\'est pas encore chargé, réessayez dans une minute.' };
  const cap = Math.max(1, Math.min(Number(limit) || 200, 500));
  const out = [];
  for (const member of members.values()) {
    if (out.length >= cap) break;
    if (!member || !member.roles || !member.roles.cache || member.roles.cache.has(role.id)) continue;
    if (member.user && member.user.bot) continue;
    out.push({
      id: member.id,
      tag: (member.user && (member.user.tag || member.user.username)) || member.id,
      joined: member.joinedTimestamp || 0,
    });
  }
  return { total: out.length, role: role.name, members: out };
}

// ------------------------------------------------------------
// Clic sur « J'accepte les règles »
// ------------------------------------------------------------
async function handleButton(botId, interaction) {
  const cid = String(interaction.customId || '');
  if (!cid.startsWith('hxrules:')) return false;
  const guild = interaction.guild;
  const member = interaction.member;
  const lang = guild ? i18n.langForGuild(guild.id) : 'fr';
  const say = (content) => interaction.reply({ content, ephemeral: true }).catch(() => {});
  if (!guild || !member) { await say(i18n.t(lang, 'rules_need_guild')); return true; }

  const cfg = cfgOf(guild.id);
  if (!cfg.enabled) { await say(i18n.t(lang, 'rules_off')); return true; }

  const roleId = String(cfg.role || '');
  const role = roleId && guild.roles && guild.roles.cache ? guild.roles.cache.get(roleId) : null;
  const vars = {
    serveur: guild.name || 'le serveur',
    role: role ? `@${role.name}` : '—',
    membres: String(stateOf(guild.id).count),
  };

  const already = !!(member.roles && member.roles.cache && role && member.roles.cache.has(role.id));
  if (already) {
    // Le bouton reste visible pour tout le monde : Discord ne sait pas cacher
    // un composant à un seul membre. Un re-clic est donc sans effet — il
    // remonte la date de la première acceptation au lieu de faire un doublon.
    const state = stateOf(guild.id);
    const mine = state.members.find((m) => String(m.id) === String(member.id));
    const quand = mine && (mine.first_at || mine.at)
      ? i18n.t(lang, 'rules_already_at').replace('{date}',
          new Date(mine.first_at || mine.at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }))
      : '';
    noteAcceptation(guild.id, member.user || { id: member.id, tag: member.displayName });
    await say(fill(cfg.thanks || i18n.t(lang, 'rules_already'), vars) + quand);
    return true;
  }

  if (roleId && !role) { await say(i18n.t(lang, 'rules_no_role')); return true; }

  if (role) {
    const me = guild.members && guild.members.me;
    const canManage = !!me && (typeof me.permissions?.has !== 'function' || me.permissions.has(F.ManageRoles) || me.permissions.has(F.Administrator));
    if (!canManage) { await say(i18n.t(lang, 'rules_no_manage_roles')); return true; }
    const highest = me && me.roles && me.roles.highest ? me.roles.highest.position : 0;
    if (role.managed) { await say(i18n.t(lang, 'rules_managed_role')); return true; }
    if (!(role.position < highest)) { await say(fill(i18n.t(lang, 'rules_role_position'), { role: role.name })); return true; }
    try {
      await member.roles.add(role, 'Règles du serveur acceptées');
    } catch {
      await say(fill(i18n.t(lang, 'rules_grant_failed'), { role: role.name }));
      return true;
    }
  }

  const entry = noteAcceptation(guild.id, interaction.user || { id: member.id, tag: member.displayName });
  await say(fill(cfg.thanks || i18n.t(lang, 'rules_thanks'), vars));
  const logChannel = channelFor(guild, cfg.log_channel) || logging.logChannel(botId, guild);
  if (logChannel) {
    logChannel.send({
      content: `📜 **Règles acceptées** — ${interaction.user ? interaction.user.toString() : `<@${entry.id}>`} · ${role ? 'rôle @' + role.name : 'sans rôle'}`,
    }).catch(() => {});
  }
  return true;
}

// Récap pour le tableau de bord (payload du serveur).
function summary(guildId) {
  const cfg = cfgOf(guildId);
  const state = stateOf(guildId);
  return {
    ...cfg,
    accepts: state.count,
    last_at: state.last_at,
    recent: state.members.slice(0, 12),
    presets: presets(),
    default_preset: DEFAULT_PRESET,
    // L'aperçu du tableau de bord doit dire la même phrase que le panneau
    // publié : la formule d'acceptation vient du MÊME i18n, langue du serveur.
    accept_hint: i18n.t(i18n.langForGuild(guildId), 'rules_accept_hint'),
  };
}

module.exports = {
  TITLE_MAX, BODY_MAX, BUTTON_MAX, FOOTER_MAX, HISTORY_CAP, COLOR_DEFAULT, DEFAULT_PRESET, PRESETS,
  cfgOf, saveCfg, texts, plan, buildPanel, panelHasButton, cleanBody, MAX_BLOCKS, PLACEMENT_DEFAULT, channelFor,
  sendPanel, deletePanel, handleButton,
  stateOf, noteAcceptation, resetAcceptations, missingMembers, summary, presets, fill,
};
