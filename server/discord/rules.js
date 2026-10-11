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
// ||spoiler||, <a:nom:id> et <:nom:id>. Les quatre modèles livrés respectent ces
// balises et les plafonds de l'API (voir server/discord/ui.js :
// V2_TEXT_BUDGET = 4000 caractères et 40 composants par panneau).
//
// v363 — trois corrections de fond, toutes conservées en v363.2 (où les
// six modèles ajoutés sont retirés à la demande du fondateur : on revient
// aux quatre d'origine, sans toucher aux correctifs) :
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
// Modèles livrés (les quatre d'origine, remis à leur place sur demande du
// fondateur en v363.2). Trois choses ont tout de même changé ici, et elles
// tiennent à la correction du bug du bouton :
//   • plus aucun trait « ━ » écrit à la main : Discord pose un VRAI
//     séparateur entre chaque bloc, et chaque trait coûtait 2 composants
//     sur les 40 autorisées (c'est ce gaspillage qui faisait sauter le
//     bouton sur les panneaux longs) ;
//   • une règle = un bloc : le titre et son développement sont dans le
//     MÊME paragraphe (avant, le titre seul formait un bloc de plus) ;
//   • « @everyone » est écrit entre accents graves : hors d'un span de
//     code, cette mention aurait notifié tout le serveur à la publication
//     (le message part maintenant avec allowedMentions vide, donc double
//     protection).
// Le marqueur « {serveur} » est remplacé par le nom du serveur.
// ------------------------------------------------------------
const PRESETS = {
  classique: {
    label: 'Classique — communauté générale',
    hint: 'Polyvalent : discussions, salon vocal, événements.',
    text: [
      '> **Bienvenue sur {serveur}.** Ces règles sont là pour que tout le monde puisse discuter tranquillement. En restant ici, vous les acceptez.',
      '**1. Respect avant tout**\\nAucune insulte, moquerie, harcèlement ou provocation. Un désaccord se règle en **MP avec le staff**, jamais en public. __Les remarques racistes, sexistes, homophobes ou transphobes entraînent un bannissement immédiat.__',
      '**2. Pas de spam ni de pub**\\nPas de flood, de messages en MAJUSCULES, de `@everyone` non autorisé, ni de publicité pour un autre serveur sans accord du staff. Les liens raccourcis sont interdits.',
      '**3. Contenu réservé aux adultes**\\nEst interdit : contenu pornographique, gore, violent ou choquant, apologie du crime ou de la drogue, ainsi que toute information personnelle (adresse, téléphone, nom complet) publiée sur quelqu’un.',
      '**4. Un salon pour chaque sujet**\\nÉcrivez dans le bon salon. Les demandes de support passent par les **tickets** ; les bugs et suggestions ont leur salon dédié.',
      '**5. Pseudos et identités**\\nPseudo lisible, sans lien ni caractères exotiques rendant la modération impossible. Interdiction d’usurper l’identité d’un membre ou d’un membre du staff.',
      '**6. Mineurs**\\nCe serveur est ouvert aux 13 ans et plus, conformément à l’âge minimum de Discord. Un compte doit rester sous la seule responsabilité de son titulaire.',
      '**7. Décisions du staff**\\nLe staff peut supprimer un message, masquer un membre ou exclure **sans préavis** quand la situation l’exige. Contester une sanction se fait en ticket, en privé.',
      '*En cas de doute sur une règle, demandez : une question posée n’a jamais été sanctionnée. Bonne visite !*',
    ].join('\n\n'),
  },
  gaming: {
    label: 'Gaming — équipe & tournois',
    hint: 'File d’attente, squad, triche et micro.',
    text: [
      '> **{serveur} — salle d’attente, puis terrain.** Ici on joue sérieusement sans être lourd.',
      '**1. Esport mindset**\\nLe tilt se garde pour la partie. On n’insulte ni un coéquipier, ni un adversaire, ni un arbitre. La prise de place se fait en vocal, calmement.',
      '**2. Triche & exploit**\\nTout logiciel tiers, script, macro matérielle ou abus de bug est **interdit** : exclusion définitive du serveur et des tournois, sans appel si la preuve est là.',
      '**3. Vocal et micro**\\nPas de musique, de cris permanents ni de microphone qui sert de réveil. Un **push-to-talk** est conseillé en partie classée.',
      '**4. Inscriptions aux tournois**\\nPseudo du joueur = pseudo du formulaire. Tout retrait après le début de la poule bloque l’accès à la prochaine édition.',
      '**5. Recherche de coéquipiers**\\nUn seul poste de recrutement à la fois, dans le salon dédié, avec le niveau indiqué. Le harcèlement par MP après un refus se signale en ticket.',
      '**6. Contenu et langage**\\nAucun contenu haineux, aucun doxxing, aucune capture d’écran personnelle publiée sans accord. Le spoil d’un match se place derrière un ||spoiler||.',
      '*Le staff peut changer une règle de tournoi jusqu’à 24 h avant le début ; la version affichée ici fait foi.*',
    ].join('\n\n'),
  },
  roleplay: {
    label: 'Roleplay — serveur RP',
    hint: 'Immersion, hors-RP, consentement en scène.',
    text: [
      '> **{serveur} — l’histoire passe avant le joueur.** Le hors-RP se dit en parenthèses, jamais dans la scène.',
      '**1. Séparation joueur / personnage**\\nCe qui arrive en jeu reste en jeu. Une frustration de personnage ne devient jamais une attaque contre le joueur. Le staff arbitre, il ne joue pas contre vous.',
      '**2. No RDM / no VDM**\\nAucun meurtre ni vol sans scène préparée, aucun véhicule utilisé comme arme. Une interaction commence par un signal clair (salut, regard, appel).',
      '**3. Fear RP et cohérence**\\nVotre personnage tient à sa vie : il recule face à une arme, il négocie, il fuit. Un personnage suicidaire ou invincible se voit retirer la scène.',
      '**4. Métagaming & powergaming**\\nN’utilisez aucune information obtenue hors-jeu (stream, Discord, vocal). Une action impossible en une seconde ne se joue pas.',
      '**5. New Life Rule**\\nAprès une mort, votre personnage oublie la scène qui l’a tué et ne revient pas sur les lieux avant le temps indiqué par le règlement de la ville.',
      '**6. Prénoms, tenues, véhicules**\\nAucun nom de marque réel, aucune tenue parodiant une marque, aucun véhicule non validé dans le salon de réception.',
      '**7. Scènes sensibles**\\nTout contenu sexuel ou autodestructeur est interdit. Les thèmes lourds se concertent **avant** la scène et s’arrêtent au premier refus.',
      '**8. Staff en scène**\\nUn membre du staff qui intervient porte l’épaulette. Son arbitrage est définitif pour la scène en cours ; le recours se fait en ticket.',
      '*Le règlement complet de la ville est épinglé dans le salon des annonces. Cette page reste la version courte qui fait foi côté Discord.*',
    ].join('\n\n'),
  },
  essentiel: {
    label: 'Essentiel — cinq lignes',
    hint: 'Le plus lu : dix secondes de lecture, zéro ambiguïté.',
    text: [
      '> **{serveur} — le minimum pour que ça reste agréable.**',
      '**1.** Restez courtois : pas d’insulte, pas de harcèlement, pas de propos haineux.',
      '**2.** Gardez le serveur propre : pas de spam, pas de pub, pas de liens douteux.',
      '**3.** Rien de choquant : pas de contenu adulte, violent ou personnel exposé.',
      '**4.** Écrivez dans le bon salon, et passez par un ticket pour toute demande sérieuse.',
      '**5.** Les décisions du staff sont appliquées avec bon sens et se discutent en privé.',
      '*Refuser ces règles, c’est quitter le serveur. En acceptant, vous vous engagez à les lire vraiment.*',
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
