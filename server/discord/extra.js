// ============================================================
// Hoxera 2.0 — Nouveaux modules : jeux, social, anniversaires,
// rappels, sondages, snipe, économie enrichie, anti-raid,
// salons vocaux temporaires, candidatures
// ============================================================
const {
  EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle,
  ApplicationCommandOptionType, ModalBuilder, TextInputBuilder,
  TextInputStyle, PermissionsBitField, ChannelType,
} = require('discord.js');
const store = require('../db');
const logging = require('./logging');
const { canConfigureGuild } = require('./permissions');
const tzUtil = require('../tz');
const ui = require('./ui');

// ---------------------- États de jeu (en mémoire) ----------------------
const penduGames = new Map();   // `${guildId}:${messageId}` -> { word, shown, lives, playerId }
const morpionGames = new Map(); // `${guildId}:${messageId}` -> { board, turn, p1, p2, over }
const pollState = new Map();    // `${guildId}:${messageId}` -> { question, choices, votes: Map<userId, index> }
const quizState = new Map();    // `${guildId}:${messageId}` -> { q, correct, answered, ts }

// 🧠 Banque de questions du quiz (v190) — culture générale + gaming
const QUIZ_BANK = [
  ['Quelle est la capitale du Japon ?', 'Tokyo', 'Osaka', 'Kyoto'],
  ['Quelle est la capitale de l\'Australie ?', 'Canberra', 'Sydney', 'Melbourne'],
  ['Quel est le plus grand océan du monde ?', 'Pacifique', 'Atlantique', 'Indien'],
  ['Combien de joueurs dans une équipe de football ?', '11', '10', '12'],
  ['Quel jeu a popularisé le mode « Battle Royale » ?', 'PUBG', 'Fortnite', 'Apex Legends'],
  ['Quelle console a sorti Nintendo en 2017 ?', 'Switch', 'Wii U', 'GameCube'],
  ['Quel est le créateur de Minecraft ?', 'Notch', 'Mark Zuckerberg', 'Gabe Newell'],
  ['Combien de côtés a un hexagone ?', '6', '5', '7'],
  ['Quel est le plus haut sommet du monde ?', 'Everest', 'K2', 'Mont Blanc'],
  ['Quel pays a gagné la Coupe du Monde 2018 ?', 'France', 'Brésil', 'Allemagne'],
  ['Quel est le symbole chimique de l\'or ?', 'Au', 'Ag', 'Fe'],
  ['Combien de couleurs a un arc-en-ciel ?', '7', '6', '8'],
  ['Quel est le plus grand désert du monde ?', 'Antarctique', 'Sahara', 'Gobi'],
  ['Quel studio a créé Fortnite ?', 'Epic Games', 'Riot Games', 'Ubisoft'],
  ['Quelle année a vu la sortie du premier iPhone ?', '2007', '2005', '2010'],
  ['Quel est l\'animal le plus rapide sur terre ?', 'Guépard', 'Lion', 'Antilope'],
  ['Combien de minutes dans une heure ?', '60', '100', '90'],
  ['Quel jeu a pour héros « Mario » ?', 'Super Mario', 'Sonic', 'Crash Bandicoot'],
  ['Quel est le pays le plus peuplé du monde ?', 'Inde', 'Chine', 'USA'],
  ['Quel est le plus petit os du corps humain ?', 'Étrier', 'Phalange', 'Côtes'],
  ['Quel est le nom du serveur Minecraft le plus célèbre ?', 'Hypixel', 'Mineplex', 'Cubecraft'],
  ['Quel est le continent le plus grand ?', 'Asie', 'Afrique', 'Europe'],
  ['Combien de joueurs dans une équipe de basketball ?', '5', '6', '7'],
  ['Quel est le nom du personnage principal de Zelda ?', 'Link', 'Zelda', 'Ganon'],
  ['Quelle est la monnaie du Japon ?', 'Yen', 'Won', 'Yuan'],
  ['Quel est le premier jeu Pokémon ?', 'Vert/Rouge', 'Or/Argent', 'Émeraude'],
  ['Combien de planètes dans notre système solaire ?', '8', '9', '7'],
  ['Quel est le sport national du Japon ?', 'Sumo', 'Judo', 'Karate'],
  ['Quel est le nom du robot mascotte de Hoxera ?', 'Optimus Prime', 'Bender', 'Robo'],
  ['Quel est le plus grand mammifère du monde ?', 'Baleine bleue', 'Éléphant', 'Girafe'],
];

// 🛡️ Anti-fuite mémoire : les parties/sondages abandonnés sont purgés
// (les plus anciens d'abord) dès qu'un plafond est dépassé.
function capMap(map, max) {
  while (map.size > max) {
    const first = map.keys().next().value;
    map.delete(first);
  }
}

// ---------------------- Snipe (derniers messages supprimés) ----------------------
const snipeCache = new Map();   // `${guildId}:${channelId}` -> { tag, avatar, content, attachments, ts }

function trackDeleted(botId, message) {
  if (!message || !message.guild || !message.channel) return;
  // 🧩 v228 : message « partiel » (supprimé sans avoir été mis en cache,
  // ex. envoyé avant le démarrage du bot) → Discord ne fournit ni auteur ni
  // contenu. Rien d'exploitable pour /snipe : on ignore, sans planter.
  // (Avant : `message.author.tag` sur un auteur null → promesse non gérée
  // signalée dans la santé du bot.)
  const author = message.author;
  if (!author || author.bot) return;
  const key = `${message.guild.id}:${message.channel.id}`;
  const attachments = message.attachments && typeof message.attachments.size === 'number' ? message.attachments.size : 0;
  let avatar = '';
  try { avatar = typeof author.displayAvatarURL === 'function' ? (author.displayAvatarURL({ size: 64 }) || '') : ''; } catch { avatar = ''; }
  snipeCache.set(key, {
    tag: author.tag || author.username || 'Membre',
    avatar,
    content: message.content || '',
    attachments,
    ts: Date.now(),
  });
  if (snipeCache.size > 500) {
    const first = snipeCache.keys().next().value;
    snipeCache.delete(first);
  }
}

// ---------------------- Statistiques (messages/jour) ----------------------
function trackMessage(botId, message) {
  if (!message || !message.guild || message.author?.bot) return;
  const day = new Date().toISOString().slice(0, 10);
  store.msgStats.bump(botId, message.guild.id, message.author.id, day);
}

// ---------------------- Helpers ----------------------
function isAdmin(member) {
  return canConfigureGuild(member && member.guild, member, member && member.id);
}


function dayKey() {
  return new Date().toISOString().slice(0,10);
}

// ---------- Noms / mots pour les jeux ----------
const PENDU_WORDS = [
  'discord', 'serveur', 'moderateur', 'ticket', 'niveau', 'boutique', 'giveaway',
  'suggestion', 'anniversaire', 'mariage', 'rapelle', 'sondage', 'economie', 'jeux',
  'banane', 'chocolat', 'ordinateur', 'telephone', 'internet', 'communauté',
  'aventure', 'cadeau', 'musique', 'weekend', 'vacances', 'champion',
];

const RPS_MOVES = ['pierre', 'feuille', 'ciseaux'];
const RPS_EMOJI = { pierre: '🪨', feuille: '🍃', ciseaux: '✂️' };
const RPS_WINS = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };

const ACTION_TEXTS = {
  hug: ['{a} fait un gros câlin à {b} 🤗', '{a} serre {b} dans ses bras, c\'est trop mignon 🥰', '{a} envoie un câlin géant à {b} ! 💞'],
  kiss: ['{a} embrasse {b} 😘', '{a} envoie un bisou à {b} 💋', 'Oh là là… {a} fait un bisou à {b} ! 😳'],
  slap: ['{a} donne une claque à {b} 👋💥', 'PAF ! {a} a giflé {b} ! 😱', '{a} corrige {b} d\'une tape bien méritée 😤'],
  pat: ['{a} tapote gentiment la tête de {b} 🐶', '{a} fait une caresse sur la tête de {b} ✨', '{a} dit « bon toutou » à {b} en le caressant 😄'],
  punch: ['{a} met un coup de poing à {b} 👊💢', 'BIM ! {a} a frappé {b} ! 🥊', '{a} règle ses comptes avec {b} à coups de poing 😠'],
};

const MARRIED_POINTS = ['💍', '❤️', '💑'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function helpFor(key) {
  return HELP_EXTRA[key] || null;
}

// ---------------------- Définitions des commandes slash ----------------------
function buildExtraPayloads() {
  const admin = PermissionsBitField.Flags.Administrator.toString();
  return [
    // ---------- Social ----------
    {
      name: 'marry', description: '💍 Demander un membre en mariage (il/elle doit accepter !)',
      options: [{ name: 'membre', description: 'L\'élu(e) de votre cœur', type: ApplicationCommandOptionType.User, required: true }],
    },
    {
      name: 'divorce', description: '💔 Divorcer de votre époux/épouse actuel(le)',
    },
    {
      name: 'couple', description: '💑 Voir le couple d\'un membre (ou le vôtre)',
      options: [{ name: 'membre', description: 'Le membre (optionnel)', type: ApplicationCommandOptionType.User, required: false }],
    },
    {
      name: 'hug', description: '🤗 Faire un câlin à un membre',
      options: [{ name: 'membre', description: 'La personne à câliner', type: ApplicationCommandOptionType.User, required: true }],
    },
    {
      name: 'kiss', description: '😘 Faire un bisou à un membre',
      options: [{ name: 'membre', description: 'La personne à embrasser', type: ApplicationCommandOptionType.User, required: true }],
    },
    {
      name: 'slap', description: '👋 Gifler un membre (pour rire)',
      options: [{ name: 'membre', description: 'La victime', type: ApplicationCommandOptionType.User, required: true }],
    },
    {
      name: 'pat', description: '🐶 Tapoter la tête d\'un membre',
      options: [{ name: 'membre', description: 'La personne', type: ApplicationCommandOptionType.User, required: true }],
    },
    {
      name: 'punch', description: '👊 Mettre un coup de poing à un membre (pour rire)',
      options: [{ name: 'membre', description: 'La cible', type: ApplicationCommandOptionType.User, required: true }],
    },
    // ---------- Jeux ----------
    {
      name: 'rps', description: '🪨 Pierre-feuille-ciseaux contre moi !',
      options: [{ name: 'choix', description: 'Votre coup', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: '🪨 Pierre', value: 'pierre' }, { name: '🍃 Feuille', value: 'feuille' }, { name: '✂️ Ciseaux', value: 'ciseaux' },
      ]}],
    },
    {
      name: 'pendu', description: '🪢 Jouez au pendu : devinez le mot caché !',
    },
    {
      name: 'morpion', description: '⭕ Jouez au morpion contre un membre',
      options: [{ name: 'adversaire', description: 'Votre adversaire', type: ApplicationCommandOptionType.User, required: true }],
    },
    {
      name: 'quiz', description: '🧠 Quiz : gagnez des points, montez au classement !',
      options: [{ name: 'action', description: 'Jouer ou voir le classement', type: ApplicationCommandOptionType.String, required: false, choices: [
        { name: 'jouer — lancer une question', value: 'jouer' }, { name: 'top — classement du serveur', value: 'top' },
      ]}],
    },
    // ---------- Communauté ----------
    {
      name: 'birthday', description: '🎂 Gérez votre anniversaire (le bot vous souhaite le jour J !)',
      options: [
        { name: 'action', description: 'Que faire ?', type: ApplicationCommandOptionType.String, required: true, choices: [
          { name: 'set', value: 'set' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' },
        ]},
        { name: 'jour', description: 'Le jour (1-31)', type: ApplicationCommandOptionType.Integer, required: false },
        { name: 'mois', description: 'Le mois (1-12)', type: ApplicationCommandOptionType.Integer, required: false },
      ],
    },
    {
      name: 'remind', description: '⏰ Le bot vous envoie un rappel en message privé (répétable)',
      options: [
        { name: 'duree', description: 'Dans combien de temps ? (ex : 10m, 2h, 1d)', type: ApplicationCommandOptionType.String, required: true },
        { name: 'texte', description: 'Le message du rappel', type: ApplicationCommandOptionType.String, required: true },
        { name: 'repeat', description: 'Répéter ce rappel ? (optionnel)', type: ApplicationCommandOptionType.String, required: false, choices: [
          { name: '🔂 Une seule fois', value: 'once' },
          { name: '⏱️ Toutes les heures', value: 'hourly' },
          { name: '📅 Tous les jours', value: 'daily' },
          { name: '🗓️ Toutes les semaines', value: 'weekly' },
        ]},
      ],
    },
    {
      name: 'afk', description: '🌙 Passez AFK : on prévient les autres quand ils vous mentionnent',
      options: [{ name: 'raison', description: 'Pourquoi êtes-vous AFK ? (optionnel)', type: ApplicationCommandOptionType.String, required: false }],
    },
    {
      name: 'top', description: '🏆 Classement du serveur : XP ou coins, avec navigation par pages',
      options: [{ name: 'type', description: 'Le classement à afficher', type: ApplicationCommandOptionType.String, required: false, choices: [
        { name: '✨ XP', value: 'xp' }, { name: '🪙 Coins', value: 'coins' },
      ]}],
    },
    {
      name: 'poll', description: '🗳️ Créez un sondage avec des boutons de vote',
      options: [
        { name: 'question', description: 'La question', type: ApplicationCommandOptionType.String, required: true },
        { name: 'choix', description: 'Les choix séparés par | (ex : Oui | Non | Peut-être)', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'snipe', description: '🕵️ Affiche le dernier message supprimé de ce salon',
    },
    {
      name: 'invites', description: '📨 Vos invitations + le top des recruteurs du serveur',
      options: [{ name: 'membre', description: 'Voir les invitations d\'un autre membre (optionnel)', type: ApplicationCommandOptionType.User, required: false }],
    },
    // ---------- Économie enrichie ----------
    {
      name: 'work', description: '💼 Travaille pour gagner des coins (1 fois par heure)',
    },
    {
      name: 'gamble', description: '🎰 Pariez vos coins : double ou rien !',
      options: [{ name: 'montant', description: 'Combien de coins miser ?', type: ApplicationCommandOptionType.Integer, required: true }],
    },
    {
      name: 'rob', description: '🦹 Tentez de voler des coins à un membre (risqué !)',
      options: [{ name: 'membre', description: 'La cible du vol', type: ApplicationCommandOptionType.User, required: true }],
    },
    // ---------- Modération / organisation ----------
    {
      name: 'lockdown', description: '🚨 Verrouille ou rouvre tous les salons du serveur (anti-raid)',
      default_member_permissions: admin,
      options: [{ name: 'action', description: 'Verrouiller ou rouvrir ?', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: 'on', value: 'on' }, { name: 'off', value: 'off' },
      ]}],
    },
    {
      name: 'sticky', description: '📌 État du message épinglé en bas de salon (v276)',
    },
    {
      name: 'emotes', description: "🎨 Installe le pack d'émojis Hoxera (icônes des modules) sur le serveur",
      default_member_permissions: admin,
      options: [
        { name: 'action', description: 'Action', type: ApplicationCommandOptionType.String, required: true, choices: [
          { name: 'install', value: 'install' }, { name: 'view', value: 'view' },
        ]},
      ],
    },
    {
      name: 'voicetemp', description: '🔊 Salons vocaux temporaires (création auto + suppression quand vides)',
      default_member_permissions: admin,
      options: [
        { name: 'action', description: 'Action', type: ApplicationCommandOptionType.String, required: true, choices: [
          { name: 'set', value: 'set' }, { name: 'off', value: 'off' }, { name: 'view', value: 'view' }, { name: 'emotes', value: 'emotes' },
        ]},
        { name: 'salon', description: 'Le salon « ➕ Créer un vocal » (pour set)', type: ApplicationCommandOptionType.Channel, required: false },
        { name: 'categorie', description: 'La catégorie des salons créés (pour set)', type: ApplicationCommandOptionType.Channel, required: false },
        { name: 'panneau', description: 'Le salon textuel du panneau de contrôle (pour set)', type: ApplicationCommandOptionType.Channel, required: false },
      ],
    },
    {
      name: 'apply', description: '📝 Candidatures : les membres répondent à VOS questions',
      default_member_permissions: admin,
      options: [
        { name: 'action', description: 'Action', type: ApplicationCommandOptionType.String, required: true, choices: [
          { name: 'set', value: 'set' }, { name: 'question', value: 'question' }, { name: 'panel', value: 'panel' }, { name: 'view', value: 'view' }, { name: 'off', value: 'off' },
        ]},
        { name: 'salon', description: 'Salon où arrivent les candidatures (pour set)', type: ApplicationCommandOptionType.Channel, required: false },
        { name: 'texte', description: 'La question à ajouter (pour question)', type: ApplicationCommandOptionType.String, required: false },
      ],
    },
  ];
}

// ---------------------- Aide ----------------------
const HELP_EXTRA = {
  marry: ['💍 Mariage', 'Demander un membre en mariage : il/elle reçoit une demande avec des boutons **Accepter / Refuser**. Une fois mariés, `/couple` affiche votre couple. Divorce possible à tout moment.', '`/marry @membre`', '`/marry @Léa` → demande envoyée 💍'],
  divorce: ['💔 Divorce', 'Rompt votre mariage actuel sur ce serveur.', '`/divorce`'],
  couple: ['💑 Couple', 'Affiche le couple d\'un membre (ou le vôtre si vous ne précisez personne).', '`/couple @membre`', '`/couple @Léo` → 💍 Marié à @Léa depuis le 12/03/2026'],
  hug: ['🤗 Câlin', 'Faites un câlin à un membre (message aléatoire).', '`/hug @membre`'],
  kiss: ['😘 Bisou', 'Faites un bisou à un membre.', '`/kiss @membre`'],
  slap: ['👋 Claque', 'Gifle un membre (pour rire !).', '`/slap @membre`'],
  pat: ['🐶 Tape-tête', 'Tapote gentiment la tête d\'un membre.', '`/pat @membre`'],
  punch: ['👊 Coup de poing', 'Met un coup de poing à un membre (pour rire !).', '`/punch @membre`'],
  rps: ['🪨 Pierre-feuille-ciseaux', 'Jouez contre moi : choisissez pierre, feuille ou ciseaux !', '`/rps choix`', '`/rps pierre` → 🪨 vs 🍃 … je gagne !'],
  pendu: ['🪢 Pendu', 'Devine le mot caché lettre par lettre (8 vies).', '`/pendu`'],
  morpion: ['⭕ Morpion', 'Jouez au morpion (tic-tac-toe) contre un membre, à tour de rôle sur une grille à boutons.', '`/morpion @membre`'],
  birthday: ['🎂 Anniversaire', 'Enregistrez votre date : le jour J, le bot vous souhaite un joyeux anniversaire dans le salon configuré (et vous donnez le rôle anniversaire s\'il est défini).', '`/birthday set jour mois` · `/birthday remove` · `/birthday list`', '`/birthday set 14 7` → 🎂 Enregistré ! (14 juillet)'],
  remind: ['⏰ Rappel', 'Le bot vous envoie un message privé à l\'heure dite. Vous pouvez aussi le **répéter** toutes les heures, tous les jours ou toutes les semaines.', '`/remind durée texte` (durée : 10m, 2h, 1d) · `/remind durée texte repeat: quotidien|hebdo|horaire`', '`/remind 2h sortir le poulet` → MP dans 2 h · `/remind 1d check-up daily` → MP chaque jour'],
  poll: ['🗳️ Sondage', 'Créez un sondage : les membres votent avec des boutons, les résultats s\'affichent en direct.', '`/poll question choix1 | choix2 | …`', '`/poll Pizza ou burger ? Pizza | Burger | Sushi`'],
  snipe: ['🕵️ Snipe', 'Affiche le dernier message supprimé de ce salon.', '`/snipe`'],
  work: ['💼 Travail', 'Travaille pour gagner des coins (entre 50 et 150, 1 fois par heure).', '`/work`', '`/work` → 🧑‍🍳 Vous avez cuisiné : +120 coins !'],
  gamble: ['🎰 Pari', 'Pariez des coins : 50 % de chances de doubler, 50 % de tout perdre.', '`/gamble montant`', '`/gamble 100` → 🎰 JACKPOT ! +100 coins !'],
  rob: ['🦹 Vol', 'Tentez de voler un membre : 40 % de réussite (10-20 % de ses coins). Si vous ratez, vous lui payez une amende !', '`/rob @membre`', '`/rob @Millionnaire` → 🚓 Raté ! Vous lui devez 15 % de votre solde.'],
  lockdown: ['🚨 Anti-raid', 'Verrouille tous les salons texte en 1 clic (personne ne peut écrire sauf les admins) puis rouvre tout. Idéal contre un raid.', '`/lockdown on` · `/lockdown off`', '`/lockdown on` → 🔒 12 salons verrouillés'],
  sticky: 'Message épinglé en bas de salon (sticky) : état et salon configuré. Réglage complet dans le dashboard → Annonces.',
    emotes: ["🎨 Émojis Hoxera", "Un pack d'émojis dessinés pour Hoxera, un par module (tickets, modération, niveaux…). `/emotes install` les ajoute au serveur : tout le monde peut les utiliser, et le dashboard affiche les mêmes icônes en PNG.", "`/emotes install` · `/emotes view`"],
  voicetemp: ['🔊 Salons vocaux temporaires +', 'Un salon « ➕ Créer un vocal » : dès qu\'un membre le rejoint, un salon à son nom est créé, et il est supprimé automatiquement quand il est vide. Le propriétaire gère SON salon depuis le panneau de contrôle (style TempVoice, en mieux) : NOM, LIMITE, PRIVÉ, PUBLIC, RÉCUPÉRER, ajout/retrait/expulsion de membres, TRANSFÉRER la propriété, SUPPRIMER — chaque réponse est personnelle. `/voicetemp emotes` installe les émojis Hoxera du panneau.', '`/voicetemp set` (salon + catégorie + panneau) · `/voicetemp emotes` · `/voicetemp view` · `/voicetemp off`'],
  apply: ['📝 Candidatures', 'Les membres cliquent sur un bouton, répondent à VOS questions dans une fenêtre, et leurs réponses arrivent dans un salon avec des boutons Accepter/Refuser pour le staff.', '`/apply set #salon` · `/apply question votre question` (max 5) · `/apply panel` · `/apply view` · `/apply off`', '`/apply set #candidatures` puis `/apply question Quel âge avez-vous ?` puis `/apply panel`'],
  afk: ['🌙 AFK', 'Vous passes AFK : si quelqu\'un vous mentionnez, le bot le prévient. Votre statut se retire tout seul dès que vous écrivez à nouveau.', '`/afk` · `/afk raison`', '`/afk je mange` → 🔕 @X est AFK : je mange (depuis 2 min)'],
  top: ['🏆 Classement', 'Affiche le classement du serveur (XP ou coins) en pages de 10, navigables avec les boutons ◀ ▶.', '`/top` (XP) · `/top type:coins`', '`/top` → 🥇 @Léa — ✨ Niv. 12 (3 250 XP)'],
  quiz: ['🧠 Quiz', 'Répondez aux questions à choix multiples : +10 points par bonne réponse, +5 si vous répondez vite. Votre score monte au classement du serveur.', '`/quiz` · `/quiz action:top`', '`/quiz` → 🧠 Quelle est la capitale du Japon ? → 🇯🇵 Tokyo → +10 points !'],
};

// ============================================================
// Gestion des interactions
// ============================================================
async function handleInteraction(botId, entry, interaction) {
  try {
    // 🎙️ v267 — panneau de contrôle des vocaux temporaires : boutons, menus
    // « utilisateur » et modale de renommage, toujours en éphémère.
    if ((interaction.isButton && interaction.isButton())
      || (interaction.isUserSelectMenu && interaction.isUserSelectMenu())
      || (interaction.isModalSubmit && interaction.isModalSubmit())) {
      const vt = await handleVtInteraction(botId, entry, interaction);
      if (vt) return true;
    }
    if (interaction.isChatInputCommand()) return await handleSlash(botId, entry, interaction);
    if (interaction.isButton()) return await handleButton(botId, entry, interaction);
    if (interaction.isModalSubmit()) return await handleModal(botId, entry, interaction);
  } catch (e) {
    console.error('[Hoxera] extra interaction error:', e.message);
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Une erreur est survenue, réessayez.', ephemeral: true });
      }
    } catch {}
  }
  return false;
}

// ---------------------- Commandes slash ----------------------
const EXTRA_CMDS = new Set(['marry', 'divorce', 'couple', 'hug', 'kiss', 'slap', 'pat', 'punch', 'rps', 'pendu', 'morpion', 'birthday', 'remind', 'poll', 'snipe', 'work', 'gamble', 'rob', 'lockdown', 'voicetemp', 'emotes', 'sticky', 'apply', 'invites', 'afk', 'top', 'quiz']);

async function handleSlash(botId, entry, interaction) {
  const cmd = interaction.commandName.toLowerCase();
  if (!EXTRA_CMDS.has(cmd)) return false;
  // 🌍 Commandes globales : elles existent aussi en message privé.
  // Ici on répond poliment et on invite à ajouter le bot sur un serveur.
  if (!interaction.guild) {
    return interaction.reply({
      content: '🌍 Cette commande fonctionne sur un **serveur Discord**. Ajoutez-moi à votre serveur avec `/invite` pour l\'utiliser !',
      ephemeral: true,
    });
  }
  const guild = interaction.guild;
  const user = interaction.user;
  const member = interaction.member;

  switch (cmd) {
    // ---------------- Social ----------------
    case 'marry': {
      const target = interaction.options.getUser('membre');
      if (!target || target.bot || target.id === user.id) {
        return interaction.reply({ content: target && target.id === user.id ? '💍 Vous ne pouvez pas vous marier avec vous-même… même si vous vous aimez beaucoup 😅' : '❓ Mentionnez un membre valide.', ephemeral: true });
      }
      const cur = store.marriages.get(botId, guild.id, user.id);
      if (cur) return interaction.reply({ content: `💍 Vous êtes déjà marié(e) avec <@${cur.user_a === user.id ? cur.user_b : cur.user_a}> ! Divorcez d\'abord si vous voulez changer.`, ephemeral: true });
      const targetCur = store.marriages.get(botId, guild.id, target.id);
      if (targetCur) return interaction.reply({ content: `💍 ${target} est déjà marié(e)… dommage !`, ephemeral: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hx:marry:${guild.id}:a:${user.id}:${target.id}`).setLabel('💍 Accepter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`hx:marry:${guild.id}:r:${user.id}:${target.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
      );
      const proposal = ui.v2panel({
        variant: 'live',
        title: '💍 Une demande en mariage !',
        // Message COURT interactif : pas de trait plaqué entre 2 phrases.
        sections: false,
        description: `**${target}**, ${user} vous demande en mariage !\n\nUne belle histoire commence peut-être. Choisissez votre réponse ci-dessous.`,
        fields: [
          { name: '💌 Demandeur', value: `${user}`, inline: true },
          { name: '💑 Destinataire', value: `${target}`, inline: true },
        ],
        footer: `Hoxera · ${guild.name} · Réponse réservée à ${target.username}`,
      }, [row]);
      await interaction.reply({ ...proposal, fetchReply: true });
      return true;
    }
    case 'divorce': {
      const cur = store.marriages.get(botId, guild.id, user.id);
      if (!cur) return interaction.reply({ content: '💔 Vous n\'êtes pas marié(e) sur ce serveur.', ephemeral: true });
      const other = cur.user_a === user.id ? cur.user_b : cur.user_a;
      store.marriages.remove(botId, guild.id, cur.user_a, cur.user_b);
      return interaction.reply(ui.v2panel({
        variant: 'danger',
        title: '💔 Divorce enregistré',
        description: `${user} et <@${other}> ont divorcé… le serveur verse une petite larme.`,
        footer: `Hoxera · ${guild.name} · Vie sociale`,
      }));
    }
    case 'couple': {
      const target = interaction.options.getUser('membre') || user;
      const cur = store.marriages.get(botId, guild.id, target.id);
      if (!cur) {
        return interaction.reply({ content: target.id === user.id ? '💑 Vous êtes célibataire ! Demandez quelqu’un en mariage avec `/marry @membre` 💍' : `💑 ${target} est célibataire.` });
      }
      const other = cur.user_a === target.id ? cur.user_b : cur.user_a;
      const d = cur.date ? new Date(cur.date.replace(' ', 'T') + 'Z') : null;
      const dateStr = d && !isNaN(d) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'récemment';
      return interaction.reply(ui.v2panel({
        variant: 'social',
        title: `💍 Couple de ${target.username}`,
        description: `${target} ❤️ <@${other}>`,
        fields: [{ name: '📅 Depuis', value: dateStr, inline: true }],
        footer: `Hoxera · ${guild.name} · Vie sociale`,
      }));
    }
    case 'hug': case 'kiss': case 'slap': case 'pat': case 'punch': {
      const target = interaction.options.getUser('membre');
      if (!target || target.id === user.id) return interaction.reply({ content: '❓ Mentionnez un membre (autre que vous).', ephemeral: true });
      const text = rand(ACTION_TEXTS[cmd]).replace('{a}', `<@${user.id}>`).replace('{b}', `<@${target.id}>`);
      return interaction.reply(ui.v2panel({
        variant: 'live',
        title: `${cmd === 'hug' ? '🤗 Câlin' : cmd === 'kiss' ? '😘 Bisou' : cmd === 'slap' ? '👋 Petite claque' : cmd === 'pat' ? '🐶 Caresse' : '👊 Duel amical'}`,
        description: text,
        footer: `Hoxera · ${guild.name} · Vie sociale`,
      }));
    }
    // ---------------- Jeux ----------------
    case 'rps': {
      const move = interaction.options.getString('choix');
      const botMove = rand(RPS_MOVES);
      let result;
      if (move === botMove) result = `Égalité ! ${RPS_EMOJI[move]} contre ${RPS_EMOJI[botMove]} — on refait ?`;
      else if (RPS_WINS[move] === botMove) result = `Vous gagnes ! ${RPS_EMOJI[move]} bat ${RPS_EMOJI[botMove]} 🏆`;
      else result = `Je gagne ! ${RPS_EMOJI[botMove]} bat ${RPS_EMOJI[move]} 😎`;
      return interaction.reply(ui.v2panel({
        variant: result.startsWith('Vous gagnes') ? 'success' : result.startsWith('Je gagne') ? 'danger' : 'warning',
        title: '🪨🍃✂️ Pierre · Feuille · Ciseaux',
        description: result,
        fields: [
          { name: '🎮 Votre choix', value: `${RPS_EMOJI[move]} ${move}`, inline: true },
          { name: '🤖 Mon choix', value: `${RPS_EMOJI[botMove]} ${botMove}`, inline: true },
        ],
        footer: `Hoxera · Duel de ${user.username}`,
      }));
    }
    case 'pendu': {
      const word = rand(PENDU_WORDS);
      const shown = word.split('').map(() => '⬜').join(' ');
      const state = { word, guessed: new Set(), lives: 8, playerId: user.id };
      const penduPanel = ui.v2panel({
        variant: 'brand',
        title: '🪢 Pendu',
        // Partie interactive : pas de trait entre l'invite et la grille.
        sections: false,
        description: `${user}, devine le mot caché !\n\n${shown}`,
        fields: [{ name: '❤️ Vies restantes', value: '❤️'.repeat(8), inline: true }, { name: '🧭 Règle', value: 'Choisissez une lettre par bouton.', inline: true }],
        footer: `Hoxera · Partie de ${user.username}`,
      }, letterRows(guild.id));
      const msg = await interaction.reply({ ...penduPanel, fetchReply: true });
      penduGames.set(`${guild.id}:${msg.id}`, state);
      capMap(penduGames, 150); // 🛡️ purge les parties abandonnées
      return true;
    }
    case 'morpion': {
      const target = interaction.options.getUser('adversaire');
      if (!target || target.bot || target.id === user.id) return interaction.reply({ content: '❓ Mentionnez un membre (autre que vous) comme adversaire.', ephemeral: true });
      const state = { board: Array(9).fill(null), turn: user.id, p1: user.id, p2: target.id, over: false, symbols: { } };
      state.symbols[user.id] = '❌';
      state.symbols[target.id] = '⭕';
      const morpionPanel = ui.v2panel({
        variant: 'brand',
        title: '⭕❌ Morpion',
        // Partie interactive : pas de trait entre les deux courtes lignes.
        sections: false,
        description: `${user} (❌) contre ${target} (⭕)\n\nAu tour de ${user} !`,
        fields: [{ name: '🎯 Objectif', value: 'Aligne trois symboles pour gagner.', inline: true }, { name: '🔁 Tour', value: `${user}`, inline: true }],
        footer: `Hoxera · Partie de ${user.username}`,
      }, boardRows(guild.id, state));
      const msg = await interaction.reply({ ...morpionPanel, fetchReply: true });
      morpionGames.set(`${guild.id}:${msg.id}`, state);
      capMap(morpionGames, 150); // 🛡️ purge les parties abandonnées
      return true;
    }
    // ---------------- Quiz (v190) ----------------
    case 'quiz': {
      const action = interaction.options.getString('action') || 'jouer';
      if (action === 'top') {
        const top = store.quizScores.top(botId, guild.id, 10);
        if (!top.length) return interaction.reply({ content: '🧠 Personne n\'a encore joué au quiz sur ce serveur — lancez `/quiz` !', ephemeral: true });
        const lines = top.map((r, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '`' + (i + 1) + '.`';
          return `${medal} <@${r.user_id}> — ${r.score} pts (${r.answers} réponse(s))`;
        });
        // v235 — `ephemeral: true` APRÈS le spread ÉCRASAIT le champ `flags` et
        // faisait perdre IsComponentsV2 : il est passé DANS les options.
        return interaction.reply(ui.v2panel({
          variant: 'brand', title: '🧠 Classement Quiz', description: lines.join('\n'),
          footer: `Hoxera · ${guild.name} · Quiz`, ephemeral: true,
        }));
      }
      // Jouer : choisir une question au hasard (quiz personnalisés du serveur
      // s'il y en a, sinon la banque par défaut), répartir les 3 choix.
      const quizSettings = store.guildSettings.get(botId, guild.id) || {};
      const pts = Math.min(Math.max(parseInt(quizSettings.quiz_points, 10) || 10, 1), 1000);
      const bonus = Math.min(Math.max(parseInt(quizSettings.quiz_bonus, 10) || 5, 0), 500);
      const bonusWindow = Math.min(Math.max(parseInt(quizSettings.quiz_bonus_window, 10) || 8, 1), 120);
      const pool = store.quizSets.pool(botId, guild.id);
      const bank = pool.length ? pool : QUIZ_BANK;
      const raw = bank[Math.floor(Math.random() * bank.length)];
      let question, correct, wrongs;
      if (raw && typeof raw === 'object' && raw.q) {
        question = raw.q; correct = raw.correct;
        wrongs = Array.isArray(raw.wrong) ? raw.wrong.slice(0, 2) : [];
        while (wrongs.length < 2) wrongs.push('…');
      } else {
        [question, correct, ...wrongs] = raw;
      }
      const choices = [correct, ...wrongs].sort(() => Math.random() - 0.5);
      const correctIdx = choices.indexOf(correct);
      // v231 — SÉPARATEURS NATIFS PLEINE LARGEUR (Components V2).
      //
      // POURQUOI : le trait texte ━ s'arrêtait AVANT le bord arrondi de
      // l'embed — Discord applique un padding interne à tout contenu d'embed
      // — et sa longueur visible dépendait du nombre de caractères. Résultat :
      // des traits de longueurs différentes d'un panneau à l'autre. Le
      // Separator de Components V2 est un composant de LAYOUT : Discord le
      // dessine bord à bord, jusqu'aux arrondis. C'est la grammaire déjà
      // utilisée par le panneau de tickets personnalisés (v220), qui sert de
      // référence à tout le bot.
      //
      // Le lancement ET le résultat du quiz partagent cette grammaire :
      // Discord interdit de revenir à un message classique en éditant un
      // message V2 (doc « Display Components »).
      //
      // Le critère de section v229 reste valable : « jamais de trait entre deux COURTES phrases ».
      // Le quiz affiche 3 blocs substantiels
      // (question / 3 réponses A-B-C / bonus de rapidité) → les séparateurs
      // sont utiles. Mariage, pendu et morpion restent en sections:false :
      // 2 phrases courtes chacun + mises à jour live à chaque tour.
      //
      // Les 3 réponses sont TOUJOURS affichées sous la question (A/B/C) —
      // sinon le joueur ne peut pas choisir en connaissance de cause.
      const quizOptions = {
        color: 0xe07a5f,
        title: '🧠 Quiz',
        description: `**${question}**\n\n🇦 **${choices[0]}**\n🇧 **${choices[1]}**\n🇨 **${choices[2]}**\n\n⚡ Répondez vite : **+${bonus} points bonus** si vous répondez en moins de **${bonusWindow} secondes** !`,
        footer: `Hoxera · ${guild.name} · Quiz`,
      };
      // Préfixe `hx:quiz:` → routé par handleButton (comme hx:poll, hx:pendu…).
      const row = new ActionRowBuilder().addComponents(
        ['🇦', '🇧', '🇨'].map((e, i) => new ButtonBuilder()
          .setCustomId(`hx:quiz:${guild.id}:${i}`)
          .setLabel(e)
          .setStyle(ButtonStyle.Primary)),
      );
      // Salon configuré : la question est envoyée là-bas (réponse éphémère ici)
      let target = interaction.channel;
      let ephemeralSend = false;
      const chanRef = String(quizSettings.quiz_channel || '').trim();
      if (chanRef) {
        const idMatch = chanRef.match(/(\d{15,21})/);
        const found = idMatch ? guild.channels.cache.get(idMatch[1]) : null
          || guild.channels.cache.find((c) => c && c.name && c.name.toLowerCase() === chanRef.replace(/^#/, '').toLowerCase() && c.isTextBased && c.isTextBased());
        if (found && typeof found.send === 'function') { target = found; ephemeralSend = true; }
      }
      const quizPayload = ui.v2panel(quizOptions, [row]);
      const msg = ephemeralSend
        ? await target.send(quizPayload)
        : await interaction.reply({ ...quizPayload, fetchReply: true });
      quizState.set(`${guild.id}:${msg.id}`, { q: question, correct, correctIdx, answered: false, ts: Date.now(), points: pts, bonus, window: bonusWindow });
      capMap(quizState, 200);
      if (ephemeralSend) await interaction.reply({ content: `🧠 Question envoyée dans ${target} !`, ephemeral: true }).catch(() => {});
      return true;
    }
    // ---------------- Communauté ----------------
    case 'birthday': {
      const action = interaction.options.getString('action');
      if (action === 'set') {
        const day = interaction.options.getInteger('jour');
        const month = interaction.options.getInteger('mois');
        if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
          return interaction.reply({ content: '❓ Utilisation : `/birthday set jour mois` — ex : `/birthday set 14 7` pour le 14 juillet.', ephemeral: true });
        }
        store.birthdays.set(botId, guild.id, user.id, day, month);
        return interaction.reply({ content: `🎂 Enregistré ! Je vous souhaiterai votre anniversaire le **${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}** 🎉` });
      }
      if (action === 'remove') {
        store.birthdays.remove(botId, guild.id, user.id);
        return interaction.reply({ content: '🗑️ Votre anniversaire a été retiré de ma liste.', ephemeral: true });
      }
      const list = store.birthdays.all(botId, guild.id);
      if (!list.length) return interaction.reply({ content: '🎂 Personne n\'a encore enregistré son anniversaire ! Faites-le avec `/birthday set jour mois`.', ephemeral: true });
      const now = new Date();
      const sorted = list.map((b) => {
        let d = new Date(Date.UTC(now.getUTCFullYear(), b.month - 1, b.day));
        if (d < new Date(now.toISOString().slice(0, 10))) d = new Date(Date.UTC(now.getUTCFullYear() + 1, b.month - 1, b.day));
        return { ...b, next: d };
      }).sort((a, b) => a.next - b.next).slice(0, 10);
      const lines = sorted.map((b, i) => `${i === 0 ? '🎂' : '📅'} <@${b.user_id}> — le **${String(b.day).padStart(2, '0')}/${String(b.month).padStart(2, '0')}**${i === 0 ? ' *(le prochain !)*' : ''}`);
      // v235 — `ephemeral` DANS les options, sinon le spread écrase `flags`.
      return interaction.reply(ui.v2panel({
        variant: 'warning',
        title: '🎂 Anniversaires du serveur',
        description: lines.join('\n') || 'Aucun',
        footer: `Hoxera · ${guild.name} · Anniversaires`,
        ephemeral: true,
      }));
    }
    case 'remind': {
      const duree = interaction.options.getString('duree') || '';
      const texte = interaction.options.getString('texte') || '';
      const repeat = interaction.options.getString('repeat') || 'once';
      const ms = parseDuration(duree);
      if (!ms) return interaction.reply({ content: '❓ Durée invalide. Exemples : `10m` (minutes), `2h` (heures), `1d` (jours).', ephemeral: true });
      if (ms > 30 * 86400000) return interaction.reply({ content: '⏰ Max 30 jours pour un rappel.', ephemeral: true });
      if (store.reminders.userCount(user.id) >= 10) return interaction.reply({ content: '⏰ Vous avez déjà 10 rappels en attente, attendez qu\'ils partent.', ephemeral: true });
      store.reminders.add(botId, guild.id, interaction.channel.id, user.id, Date.now() + ms, texte.slice(0, 300), repeat);
      const repeatLabel = { once: '', hourly: ' (répété toutes les heures)', daily: ' (répété chaque jour)', weekly: ' (répété chaque semaine)' }[repeat] || '';
      return interaction.reply({ content: `⏰ C\'est noté ! Je vous rappellerai **${formatDuration(ms)}** en message privé${repeatLabel}.`, ephemeral: true });
    }
    case 'afk': {
      const raison = interaction.options.getString('raison') || '';
      store.afk.set(botId, guild.id, user.id, raison);
      return interaction.reply({ content: `🌙 Vous êtes maintenant AFK${raison ? ` : **${raison}**` : ''}. Je préviendrai les autres qui vous mentionnent, et votre statut se retirera tout seul dès que vous écriras.`, ephemeral: true });
    }
    case 'top': {
      const type = interaction.options.getString('type') || 'xp';
      return renderTop(botId, entry, interaction, guild, type, 0);
    }
    case 'poll': {
      const question = (interaction.options.getString('question') || '').slice(0, 250);
      const raw = interaction.options.getString('choix') || '';
      const choices = raw.split('|').map((c) => c.trim()).filter(Boolean).slice(0, 10);
      if (choices.length < 2) return interaction.reply({ content: '❓ Il faut au moins 2 choix séparés par `|` — ex : `/poll Pizza ? Oui | Non`', ephemeral: true });
      const votes = new Map();
      const msg = await interaction.reply({
        embeds: [pollEmbed(question, choices, votes)],
        components: pollRows(guild.id, choices),
        fetchReply: true,
      });
      pollState.set(`${guild.id}:${msg.id}`, { question, choices, votes });
      capMap(pollState, 300); // 🛡️ purge les anciens sondages
      return true;
    }
    case 'snipe': {
      const key = `${guild.id}:${interaction.channel.id}`;
      const s = snipeCache.get(key);
      if (!s) return interaction.reply({ content: '🕵️ Aucun message supprimé récemment dans ce salon.', ephemeral: true });
      const minutes = Math.max(1, Math.floor((Date.now() - s.ts) / 60000));
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setAuthor(s.avatar ? { name: s.tag, iconURL: s.avatar } : { name: s.tag })
        .setDescription(s.content || (s.attachments ? `*${s.attachments} pièce(s) jointe(s)*` : '*Message vide*'))
        .setFooter({ text: `Supprimé il y a ~${minutes} min` });
      return interaction.reply({ embeds: [embed] });
    }
    // ---------------- 📨 Invitations ----------------
    case 'invites': {
      const target = interaction.options.getUser('membre') || user;
      const count = store.inviteJoins.countBy(botId, guild.id, target.id);
      const top = store.inviteJoins.top(botId, guild.id, 10);
      const whoMe = store.inviteJoins.whoInvited(botId, guild.id, target.id);
      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.length
        ? top.map((r, idx) => `${medals[idx] || `**${idx + 1}.**`} <@${r.inviter_id}> — **${r.n}** invitation(s)`).join('\n')
        : '*Aucune invitation traquée pour l\'instant. (Le bot doit avoir la permission « Gérer le serveur » pour voir les invitations.)*';
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setTitle('📨 Invitations')
        .setDescription(whoMe
          ? `👤 **${target.username}** a invité **${count}** membre(s) — 🎟️ invité(e) par <@${whoMe.inviter_id}>.`
          : `👤 **${target.username}** a invité **${count}** membre(s) sur le serveur.`)
        .addFields(
          { name: '🏆 Top des recruteurs', value: lines, inline: false },
        )
        .setFooter({ text: `Hoxera · ${guild.name}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
    // ---------------- Économie enrichie ----------------
    case 'work': {
      const key = `work_${guild.id}_${user.id}`;
      const last = Number(store.settings.get(key)) || 0;
      const cooldown = 3600000;
      if (Date.now() - last < cooldown) {
        const wait = Math.ceil((cooldown - (Date.now() - last)) / 60000);
        return interaction.reply({ content: `💼 Vous êtes fatigué ! Revenez dans **${wait} min** pour retravailler.`, ephemeral: true });
      }
      const job = rand([
        ['🧑‍🍳', 'vous avez cuisiné un festin'], ['👨‍💻', 'vous avez codé un site web'], ['🧹', 'vous avez nettoyé tout le salon'],
        ['🎨', 'vous avez peint un chef-d\'œuvre'], ['🚚', 'vous avez livré des colis'], ['🎤', 'vous avez chanté au karaoké'],
      ]);
      const gain = 50 + Math.floor(Math.random() * 101);
      store.economy.ensure(botId, guild.id, user.id);
      store.economy.add(botId, guild.id, user.id, gain);
      store.settings.set(key, String(Date.now()));
      return interaction.reply(ui.v2panel({
        variant: 'economy',
        title: '💼 Travail terminé',
        description: `${job[0]} ${job[1]} !`,
        fields: [{ name: '🪙 Récompense', value: `+${gain} coins`, inline: true }],
        footer: `Hoxera · ${guild.name} · Économie`,
      }));
    }
    case 'gamble': {
      const amount = interaction.options.getInteger('montant');
      if (!amount || amount <= 0) return interaction.reply({ content: '❓ Misez un montant positif : `/gamble 100`.', ephemeral: true });
      store.economy.ensure(botId, guild.id, user.id);
      const row = store.economy.get(botId, guild.id, user.id);
      if (row.coins < amount) return interaction.reply({ content: `❌ Il vous manque **${amount - row.coins}** coins (vous avez ${row.coins}).`, ephemeral: true });
      const win = Math.random() < 0.5;
      if (win) {
        store.economy.add(botId, guild.id, user.id, amount);
        return interaction.reply(ui.v2panel({
          variant: 'economy',
          title: '🎰 JACKPOT !',
          description: `Vous doublez votre mise : **+${amount} coins** !`,
          fields: [{ name: '💰 Nouveau solde', value: `${row.coins + amount} coins`, inline: true }],
          footer: `Hoxera · ${guild.name} · Économie`,
        }));
      }
      store.economy.add(botId, guild.id, user.id, -amount);
      return interaction.reply(ui.v2panel({
        variant: 'danger',
        title: '🎰 Pari perdu',
        description: `Vous perdez **${amount} coins**.`,
        fields: [{ name: '💰 Solde restant', value: `${row.coins - amount} coins`, inline: true }],
        footer: `Hoxera · ${guild.name} · Économie`,
      }));
    }
    case 'rob': {
      const target = interaction.options.getUser('membre');
      if (!target || target.id === user.id) return interaction.reply({ content: '❓ Choisissez une cible (autre que vous).', ephemeral: true });
      const key = `rob_${guild.id}_${user.id}`;
      const last = Number(store.settings.get(key)) || 0;
      if (Date.now() - last < 600000) {
        const wait = Math.ceil((600000 - (Date.now() - last)) / 60000);
        return interaction.reply({ content: `🦹 La police vous cherche encore… attendez **${wait} min**.`, ephemeral: true });
      }
      store.settings.set(key, String(Date.now()));
      store.economy.ensure(botId, guild.id, user.id);
      store.economy.ensure(botId, guild.id, target.id);
      const victim = store.economy.get(botId, guild.id, target.id);
      if (victim.coins < 50) return interaction.reply({ content: `🦹 ${target} n'a que ${victim.coins} coins… pas assez intéressant.`, ephemeral: true });
      const me = store.economy.get(botId, guild.id, user.id);
      const success = Math.random() < 0.4;
      if (success) {
        const stolen = Math.floor(victim.coins * (0.1 + Math.random() * 0.1));
        store.economy.add(botId, guild.id, target.id, -stolen);
        store.economy.add(botId, guild.id, user.id, stolen);
        return interaction.reply(ui.v2panel({
          variant: 'economy',
          title: '🦹 Vol réussi !',
          description: `Vous volez **${stolen} coins** à ${target} 😈`,
          fields: [{ name: '🎯 Cible', value: `${target}`, inline: true }],
          footer: `Hoxera · ${guild.name} · Économie`,
        }));
      }
      const fine = Math.max(10, Math.floor(me.coins * 0.15));
      store.economy.add(botId, guild.id, user.id, -fine);
      store.economy.add(botId, guild.id, target.id, fine);
      return interaction.reply(ui.v2panel({
        variant: 'danger',
        title: '🚓 Vol échoué',
        description: `${target} vous a surpris et vous réclame **${fine} coins** de dédommagement…`,
        fields: [{ name: '💸 Amende', value: `${fine} coins`, inline: true }],
        footer: `Hoxera · ${guild.name} · Économie`,
      }));
    }
    // ---------------- Modération / organisation ----------------
    case 'lockdown': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const action = interaction.options.getString('action');
      const lockdown = require('./lockdown');
      if (action === 'on') {
        const res = await lockdown.on(botId, guild, member.user.tag);
        if (res.already) return interaction.reply({ content: '🔒 Le serveur est déjà verrouillé. `/lockdown off` pour rouvrir.', ephemeral: true });
        return interaction.reply(ui.v2panel({
          variant: 'danger',
          title: '🚨 Serveur verrouillé',
          description: `${res.channels} salon(s) sont maintenant en lecture seule.`,
          fields: [{ name: '🔓 Pour rouvrir', value: 'Utilisez `/lockdown off` quand la situation est maîtrisée.' }],
          footer: `Hoxera · ${guild.name} · Sécurité`,
        }));
      }
      const res = await lockdown.off(botId, guild, member.user.tag);
      if (!res.reopened) return interaction.reply({ content: '🔓 Le serveur n\'est pas verrouillé.', ephemeral: true });
      return interaction.reply(ui.v2panel({
        variant: 'success',
        title: '🔓 Serveur rouvert',
        description: `${res.reopened} salon(s) sont de nouveau ouverts.`,
        footer: `Hoxera · ${guild.name} · Sécurité`,
      }));
    }
    case 'emotes': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const action = interaction.options.getString('action');
      if (action === 'install') {
        try {
          const created = await installHoxEmotes(botId, guild);
          return interaction.reply({ ...hoxEmotesPanel(botId, guild, created), ephemeral: true });
        } catch (e) {
          return interaction.reply({ content: `⚠️ Installation impossible : ${String(e.message || e).slice(0, 160)}\nLe bot a besoin de la permission « Gérer les expressions ».`, ephemeral: true });
        }
      }
      return interaction.reply({ ...hoxEmotesPanel(botId, guild, null), ephemeral: true });
    }
    case 'sticky': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const st = require('./sticky').cfgOf(guild.id);
      const last = require('./sticky').lastIdOf(guild.id);
      return interaction.reply({ content: st.enabled && st.channel ? `📌 Sticky **actif** dans <#${st.channel}> : republication toutes les ${st.every} messages.${last ? `\nDernier message épinglé : [voir](https://discord.com/channels/${guild.id}/${st.channel}/${last})` : '\nAucun sticky publié pour le moment.'}` : '📌 Sticky **désactivé** sur ce serveur. Réglez-le dans le dashboard → Annonces → « Message épinglé en bas ».', ephemeral: true });
    }
    case 'voicetemp': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const action = interaction.options.getString('action');
      if (action === 'off') {
        store.voicetemp.remove(botId, guild.id);
        return interaction.reply({ content: '🔊 Salons vocaux temporaires désactivés.', ephemeral: true });
      }
      if (action === 'emotes') {
        try {
          const created = await installVtEmotes(botId, guild);
          let note = '';
          if (created.length) {
            const cfg = store.voicetemp.get(botId, guild.id);
            if (cfg && cfg.panel_channel) {
              try { await sendVtPanel(botId, guild, cfg.panel_channel); note = "\n🎙️ Le **panneau de contrôle** a été mis à jour avec les nouveaux émojis."; } catch {}
            }
          }
          return interaction.reply({ content: created.length ? `🎨 **${created.length} émojis Hoxera installés** : le panneau de contrôle vocal les affichera automatiquement.${note}` : '🎨 Les émojis Hoxera sont déjà installés sur ce serveur.', ephemeral: true });
        } catch (e) {
          return interaction.reply({ content: `⚠️ Installation impossible : ${String(e.message || e).slice(0, 160)}\nLe bot a besoin de la permission « Gérer les expressions ».`, ephemeral: true });
        }
      }
      if (action === 'view') {
        const cfg = store.voicetemp.get(botId, guild.id);
        if (!cfg || !cfg.creator_channel) return interaction.reply({ content: '🔊 Non configuré. Utilisez `/voicetemp set` avec le salon de création et la catégorie.', ephemeral: true });
        return interaction.reply({ content: `🔊 **Configuration actuelle**\nSalon de création : <#${cfg.creator_channel}>\nCatégorie : <#${cfg.category || 'aucune'}>\nNom : \`${cfg.name_template || '🔊 {name}'}\`\nPanneau de contrôle : ${cfg.panel_channel ? `<#${cfg.panel_channel}>` : 'non envoyé'}`, ephemeral: true });
      }
      const salon = interaction.options.getChannel('salon');
      const categorie = interaction.options.getChannel('categorie');
      const panneau = interaction.options.getChannel('panneau');
      if (!salon || salon.type !== ChannelType.GuildVoice) return interaction.reply({ content: '❓ Choisissez un **salon vocal** comme salon « ➕ Créer un vocal » : `/voicetemp set #vocal #catégorie`.', ephemeral: true });
      // 🎙️ v267 — on PRÉSERVE les autres réglages (panneau déjà envoyé…).
      const cfgPrev = store.voicetemp.get(botId, guild.id) || {};
      store.voicetemp.set(botId, guild.id, {
        ...cfgPrev,
        creator_channel: salon.id,
        category: categorie ? categorie.id : (salon.parentId || ''),
        panel_channel: panneau ? panneau.id : (cfgPrev.panel_channel || ''),
      });
      let panelNote = '';
      if (panneau) {
        try {
          await sendVtPanel(botId, guild, panneau.id);
          panelNote = `\n🎙️ Le **panneau de contrôle** est envoyé dans ${panneau} : chaque propriétaire de salon vocal y gère son salon (privé/public, invités, nom, suppression).`;
        } catch (e) { panelNote = `\n⚠️ Panneau non envoyé : ${String(e.message || e).slice(0, 120)}`; }
      }
      return interaction.reply({ content: `🔊 **Activé !** Quand un membre rejoint ${salon}, un salon vocal à son nom est créé (et supprimé quand il est vide).${panelNote}` });
    }
    case 'apply': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const action = interaction.options.getString('action');
      const cfg = store.applications.get(botId, guild.id) || { channel: '', questions: '[]', title: '📝 Candidature', enabled: 0 };
      const questions = (() => { try { return JSON.parse(cfg.questions || '[]'); } catch { return []; } })();
      if (action === 'set') {
        const salon = interaction.options.getChannel('salon');
        if (!salon || !salon.isTextBased()) return interaction.reply({ content: '❓ Choisissez le **salon texte** où arriveront les candidatures.', ephemeral: true });
        store.applications.set(botId, guild.id, { ...cfg, channel: salon.id, questions: cfg.questions, enabled: 1 });
        return interaction.reply({ content: `📝 **Candidatures activées !** Les réponses arriveront dans ${salon}.\nAjoutez vos questions avec \`/apply question\` puis envoyez le panneau avec \`/apply panel\`.` });
      }
      if (action === 'question') {
        const texte = interaction.options.getString('texte');
        if (!texte || !texte.trim()) return interaction.reply({ content: '❓ Écrivez la question : `/apply question Quel âge avez-vous ?`', ephemeral: true });
        if (questions.length >= 5) return interaction.reply({ content: '❌ Maximum 5 questions.', ephemeral: true });
        questions.push(texte.trim().slice(0, 45));
        store.applications.set(botId, guild.id, { ...cfg, questions: JSON.stringify(questions) });
        return interaction.reply({ content: `✅ Question ajoutée (${questions.length}/5) : « ${texte.trim().slice(0, 45)} »`, ephemeral: true });
      }
      if (action === 'view') {
        // v235 — ce résumé passait par ui.sectionize() dans le `content` du
        // message : le trait texte ━ ne touchait pas les bords. Il devient la
        // description du conteneur → séparateur NATIF pleine largeur entre les
        // 2 paragraphes. `footer: false` : l'original n'avait pas de pied.
        return interaction.reply(ui.v2panel({
          description: `📝 **Candidatures**\nSalon : ${cfg.channel ? `<#${cfg.channel}>` : '❌ non défini'}\nQuestions (${questions.length}/5) :\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n') || '*aucune*'}\n\nEnvoyez le panneau avec \`/apply panel\``,
          footer: false,
          ephemeral: true,
        }));
      }
      if (action === 'off') {
        store.applications.set(botId, guild.id, { ...cfg, enabled: 0 });
        return interaction.reply({ content: '📝 Candidatures désactivées.', ephemeral: true });
      }
      // panel
      if (!cfg.channel) return interaction.reply({ content: '❓ Définis d\'abord le salon : `/apply set #salon`.', ephemeral: true });
      if (!questions.length) return interaction.reply({ content: '❓ Ajoutez au moins une question : `/apply question votre question`.', ephemeral: true });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hx:apply:${guild.id}`).setLabel('📝 Faire une candidature').setStyle(ButtonStyle.Primary),
      );
      await interaction.reply(ui.v2panel({
        variant: 'brand',
        title: cfg.title || '📝 Candidature',
        description: `Cliquez sur le bouton pour candidater : vous répondrez à **${questions.length} question(s)** dans une fenêtre privée.`,
        fields: [{ name: '🔒 Confidentialité', value: 'Seul le staff verra vos réponses.' }],
        footer: `Hoxera · ${guild.name} · Candidatures`,
      }, [row]));
      return true;
    }
  }
  return false;
}

// ---------------------- Boutons ----------------------
// ---------------------- Classement /top (v188) ----------------------
async function topUserName(guild, client, userId) {
  try {
    const member = guild.members.cache.get(String(userId));
    if (member) return member.user.username;
    const u = await client.users.fetch(String(userId)).catch(() => null);
    return u ? u.username : 'Membre inconnu';
  } catch { return 'Membre inconnu'; }
}

async function renderTop(botId, entry, interaction, guild, type, page, message = null) {
  const perPage = 10;
  const total = type === 'coins' ? store.economy.count(botId, guild.id) : store.xp.count(botId, guild.id);
  const maxPage = Math.max(0, Math.ceil(total / perPage) - 1);
  page = Math.min(Math.max(page, 0), maxPage);
  const rows = type === 'coins'
    ? store.economy.top(botId, guild.id, (page + 1) * perPage)
    : store.xp.top(botId, guild.id, (page + 1) * perPage);
  const pageRows = rows.slice(page * perPage, (page + 1) * perPage);
  if (!pageRows.length) {
    const empty = { content: type === 'coins'
      ? '🪙 Personne n\'a encore de coins ici — les membres en gagnent avec `/daily`, `/work`, `/gamble`…'
      : '✨ Personne n\'a encore d\'XP ici — les membres en gagnent automatiquement en discutant !' };
    if (message) return message.update(empty).catch(() => {});
    return interaction.reply({ ...empty, ephemeral: true });
  }
  const lines = [];
  for (let i = 0; i < pageRows.length; i++) {
    const r = pageRows[i];
    const rank = page * perPage + i + 1;
    const name = await topUserName(guild, entry.client, r.user_id);
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `\`${rank}.\``;
    if (type === 'coins') lines.push(`${medal} **${name}** — 🪙 ${r.coins}`);
    else lines.push(`${medal} **${name}** — ✨ Niv. ${r.level} (${r.xp} XP)`);
  }
  const embed = new EmbedBuilder()
    .setColor(type === 'coins' ? 0xf1c40f : 0xe07a5f)
    .setTitle(type === 'coins' ? '🪙 Classement Coins' : '✨ Classement XP')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Hoxera · ${guild.name} · Page ${page + 1}/${maxPage + 1} · ${total} membre(s) classé(s)` })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hxtop:${guild.id}:${type}:${page - 1}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`hxtop:${guild.id}:${type}:${page + 1}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage),
  );
  const payload = { embeds: [embed], components: [row] };
  if (message) return message.update(payload).catch(() => {});
  return interaction.reply({ ...payload, fetchReply: true });
}

// ---------------------- Statut AFK (v188) ----------------------
// Appelé à chaque message : sort l'auteur de l'AFK et prévient quand
// on mentionne un membre AFK.
async function onMessage(botId, m) {
  if (!m || !m.guild || !m.guild.id) return;
  if (m.author && m.author.bot) return;
  const guildId = m.guild.id;
  const uid = String(m.author.id);
  // 1) L'auteur revient : il écrit → fin de l'AFK.
  const own = store.afk.get(botId, guildId, uid);
  if (own) {
    store.afk.remove(botId, guildId, uid);
    await m.reply({ content: '👋 Bienvenue ! Vous n\'êtes plus AFK.' }).catch(() => {});
    return;
  }
  // 2) On mentionne un membre AFK → on prévient (sans boucle de mentions).
  const mentions = m.mentions && m.mentions.users ? [...m.mentions.users.values()] : [];
  if (!mentions.length) return;
  const hit = [];
  for (const u of mentions) {
    const r = store.afk.get(botId, guildId, String(u.id));
    if (r) hit.push(r);
  }
  if (!hit.length) return;
  const lines = hit.map((r) => {
    const mins = Math.max(1, Math.floor((Date.now() - r.since_ts) / 60000));
    return `<@${r.user_id}> est AFK${r.reason ? ` : **${r.reason}**` : ''} (depuis ${mins} min)`;
  }).join('\n');
  await m.reply({ content: `🔕 ${lines}`, allowedMentions: { users: [] } }).catch(() => {});
}

async function handleButton(botId, entry, interaction) {
  const id = interaction.customId || '';
  if (id.startsWith('hxtop:')) {
    const parts = id.split(':');
    const gid = parts[1], type = parts[2] === 'coins' ? 'coins' : 'xp', page = parseInt(parts[3], 10) || 0;
    if (gid !== interaction.guild.id) return true;
    await renderTop(botId, entry, interaction, interaction.guild, type, page, interaction.message).catch(() => {});
    return true;
  }
  if (!id.startsWith('hx:')) return false;
  const parts = id.split(':');
  const kind = parts[1];
  const guild = interaction.guild;
  const user = interaction.user;
  const member = interaction.member;

  switch (kind) {
    case 'marry': {
      const gid = parts[2], choice = parts[3], from = parts[4], to = parts[5];
      if (gid !== guild.id) return true;
      if (user.id !== to) {
        return interaction.reply({ content: '💍 Cette demande ne vous est pas adressée !', ephemeral: true });
      }
      const cur = store.marriages.get(botId, guild.id, from) || store.marriages.get(botId, guild.id, to);
      if (cur) return interaction.reply({ content: '💍 L\'un de vous est déjà marié…', ephemeral: true });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hx:done').setLabel(choice === 'a' ? '💍 Accepté !' : '💔 Refusé').setStyle(choice === 'a' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true),
      );
      if (choice === 'a') {
        store.marriages.set(botId, guild.id, from, to);
        await interaction.update(ui.v2panel({
          variant: 'success',
          title: '💍 Mariage accepté !',
          description: `Félicitations ${user} et <@${from}> ! Vous êtes désormais mariés sur ce serveur 💍❤️`,
          fields: [{ name: '✨ Ambiance', value: `${rand(MARRIED_POINTS)} ${guild.name} compte ${store.marriages.count(botId, guild.id)} couple(s)` }],
          footer: `Hoxera · ${guild.name} · Vie sociale`,
        }, [row]));
      } else {
        await interaction.update(ui.v2panel({
          variant: 'danger',
          title: '💔 Demande refusée',
          description: `${user} a refusé la demande de <@${from}>… ce n'est que partie remise !`,
          footer: `Hoxera · ${guild.name} · Vie sociale`,
        }, [row]));
      }
      return true;
    }
    case 'rps': break;
    case 'pendu': {
      const gid = parts[2], letter = (parts[3] || '').toLowerCase();
      const key = `${gid}:${interaction.message.id}`;
      const state = penduGames.get(key);
      if (!state) return interaction.reply({ content: '🪢 Cette partie est terminée.', ephemeral: true });
      if (user.id !== state.playerId) return interaction.reply({ content: '🪢 Ce n\'est pas votre partie ! Lancez la vôtre avec `/pendu`.', ephemeral: true });
      if (state.guessed.has(letter)) return interaction.reply({ content: `Vous avez déjà essayé « ${letter.toUpperCase()} » !`, ephemeral: true });
      state.guessed.add(letter);
      let over = false, won = false;
      if (!state.word.includes(letter)) {
        state.lives--;
        if (state.lives <= 0) { over = true; won = false; }
      } else if (state.word.split('').every((l) => state.guessed.has(l))) {
        over = true; won = true;
      }
      const shown = state.word.split('').map((l) => (state.guessed.has(l) ? `**${l.toUpperCase()}**` : '⬜')).join(' ');
      const lettersTried = [...state.guessed].sort().join(', ').toUpperCase();
      let content;
      if (over && won) {
        content = `🪢 **Gagné !** ${user} a trouvé le mot **${state.word.toUpperCase()}** 🎉\n\n${shown}\n\n*${lettersTried}*`;
      } else if (over) {
        content = `🪢 **Perdu !** Le mot était **${state.word.toUpperCase()}** 💀\n\n${shown}\n\n*${lettersTried}*`;
      } else {
        const correct = state.word.includes(letter);
        content = `🪢 **Pendu** — ${user}, devine le mot !\n\n${shown}\n\nVies : ${'❤️'.repeat(state.lives)}${'🖤'.repeat(8 - state.lives)}\n\n${correct ? '✅ Bonne lettre !' : '❌ Raté…'}\n*Lettres essayées : ${lettersTried}*`;
      }
      if (over) penduGames.delete(key);
      await interaction.update(ui.v2panel({
        variant: over && won ? 'success' : over ? 'danger' : 'brand',
        title: over ? (won ? '🪢 Pendu · gagné !' : '🪢 Pendu · terminé') : '🪢 Pendu',
        // Mise à jour LIVE à chaque lettre : garder le texte simple,
        // sans traits qui sautent à chaque tour.
        sections: false,
        description: content,
        footer: `Hoxera · Partie de ${state.playerId}`,
      }, over ? [] : letterRows(guild.id)));
      return true;
    }
    case 'morpion': {
      const gid = parts[2], cell = parseInt(parts[3], 10);
      const key = `${gid}:${interaction.message.id}`;
      const state = morpionGames.get(key);
      if (!state || state.over) return interaction.reply({ content: '⭕ Cette partie est terminée.', ephemeral: true });
      if (user.id !== state.turn) return interaction.reply({ content: '⏳ Ce n\'est pas votre tour !', ephemeral: true });
      if (state.board[cell] !== null) return interaction.reply({ content: '❌ Cette case est déjà prise.', ephemeral: true });
      state.board[cell] = state.symbols[user.id];
      const winner = checkMorpionWin(state.board);
      state.over = !!winner || state.board.every((c) => c !== null);
      let content;
      if (winner) {
        content = `⭕❌ **Morpion** : <@${state.p1}> (❌) contre <@${state.p2}> (⭕)\n\n🏆 **<@${user.id}> a gagné !**`;
      } else if (state.over) {
        content = `⭕❌ **Morpion** : <@${state.p1}> (❌) contre <@${state.p2}> (⭕)\n\n🤝 Égalité !`;
      } else {
        state.turn = state.turn === state.p1 ? state.p2 : state.p1;
        content = `⭕❌ **Morpion** : <@${state.p1}> (❌) contre <@${state.p2}> (⭕)\n\nAu tour de <@${state.turn}> !`;
      }
      if (state.over) morpionGames.delete(key);
      await interaction.update(ui.v2panel({
        variant: winner ? 'success' : state.over ? 'warning' : 'brand',
        title: state.over ? '⭕❌ Morpion · partie terminée' : '⭕❌ Morpion',
        // Mise à jour LIVE : pas de trait entre les courtes lignes.
        sections: false,
        description: content,
        footer: `Hoxera · Tour de ${state.over ? 'fin de partie' : state.turn}`,
      }, state.over ? boardRows(guild.id, state, true) : boardRows(guild.id, state)));
      return true;
    }
    case 'quiz': {
      const gid = parts[2], pick = parseInt(parts[3], 10);
      const key = `${gid}:${interaction.message.id}`;
      const st = quizState.get(key);
      if (!st) return interaction.reply({ content: '🧠 Cette question est terminée.', ephemeral: true });
      if (st.answered) return interaction.reply({ content: '🧠 Déjà répondu !', ephemeral: true });
      st.answered = true;
      const correctPick = pick === st.correctIdx;
      const pts = st.points || 10, bonus = st.bonus || 5, windowMs = (st.window || 8) * 1000;
      const fast = Date.now() - st.ts <= windowMs;
      const gained = correctPick ? (fast ? pts + bonus : pts) : 0;
      if (correctPick) store.quizScores.addResult(botId, guild.id, user.id, gained);
      const emojis = ['🇦', '🇧', '🇨'];
      const row = new ActionRowBuilder().addComponents(
        [0, 1, 2].map((i) => new ButtonBuilder()
          .setCustomId(`hx:quiz:${guild.id}:${i}`)
          .setLabel(emojis[i])
          .setStyle(i === st.correctIdx ? ButtonStyle.Success : ButtonStyle.Danger)
          .setDisabled(true)),
      );
      // v231 — même grammaire V2 qu'au lancement : le message d'origine est
      // déjà en Components V2 et Discord interdit d'en sortir à l'édition.
      // Le flag IsComponentsV2 est accepté par interaction.update()
      // (InteractionUpdateOptions étend MessageEditOptions, qui l'autorise).
      const resultPayload = ui.v2panel({
        color: correctPick ? 0x57f287 : 0xed4245,
        title: '🧠 Quiz',
        description: `${correctPick ? '✅ **Bonne réponse !**' : '❌ **Mauvaise réponse…**'}\n\n**${st.q}**\n\nLa bonne réponse était : **${st.correct}**${correctPick ? `\n\n✨ +${gained} points${fast ? ' (bonus rapidité ⚡)' : ''}` : ''}`,
        footer: `Hoxera · ${guild.name} · Quiz`,
      }, [row]);
      await interaction.update(resultPayload);
      return true;
    }
    case 'poll': {
      const gid = parts[2], idx = parseInt(parts[3], 10);
      const key = `${gid}:${interaction.message.id}`;
      const st = pollState.get(key);
      if (!st) return interaction.reply({ content: '🗳️ Ce sondage est terminé.', ephemeral: true });
      const prev = st.votes.get(user.id);
      if (prev === idx) st.votes.delete(user.id);
      else st.votes.set(user.id, idx);
      await interaction.update({ embeds: [pollEmbed(st.question, st.choices, st.votes)], components: pollRows(guild.id, st.choices) });
      return true;
    }
    case 'apply': {
      const gid = parts[2];
      const cfg = store.applications.get(botId, guild.id);
      if (!cfg || !cfg.enabled || !cfg.channel) return interaction.reply({ content: '📝 Les candidatures sont fermées.', ephemeral: true });
      const questions = (() => { try { return JSON.parse(cfg.questions || '[]'); } catch { return []; } })();
      if (!questions.length) return interaction.reply({ content: '📝 Les candidatures sont fermées.', ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`hxapply:${guild.id}`).setTitle((cfg.title || 'Candidature').slice(0, 45));
      questions.slice(0, 5).forEach((q, i) => {
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(`q${i}`)
            .setLabel(q.slice(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ));
      });
      await interaction.showModal(modal);
      return true;
    }
    case 'applyd': {
      // décision staff sur une candidature
      const gid = parts[2], decision = parts[3], applicantId = parts[4];
      if (!isAdmin(member) && member.id !== guild.ownerId) {
        return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
      }
      const emb = interaction.message.embeds[0];
      const title = emb ? emb.title : '📝 Candidature';
      if (decision === 'accept') {
        await interaction.update({
          embeds: [EmbedBuilder.from(emb).setColor('#57F287').setFooter({ text: `✅ Acceptée par ${user.tag}` })],
          components: [],
        });
        try {
          const applicant = await guild.members.fetch(applicantId);
          await applicant.send(ui.v2panel({
            variant: 'success',
            title: '🎉 Candidature acceptée',
            description: `Bonne nouvelle ! Votre candidature sur **${guild.name}** a été acceptée par ${user.tag}.`,
            fields: [{ name: '✅ Prochaine étape', value: 'Le staff va maintenant vous transmettre les informations nécessaires.' }],
            footer: `Hoxera · ${guild.name} · Candidatures`,
          })).catch(() => {});
        } catch {}
      } else {
        await interaction.update({
          embeds: [EmbedBuilder.from(emb).setColor('#ED4245').setFooter({ text: `❌ Refusée par ${user.tag}` })],
          components: [],
        });
        try {
          const applicant = await guild.members.fetch(applicantId);
          await applicant.send(ui.v2panel({
            variant: 'danger',
            title: '😔 Candidature refusée',
            description: `Votre candidature sur **${guild.name}** a été refusée. Vous pourrez retenter plus tard.`,
            fields: [{ name: '💡 Conseil', value: 'N’hésitez pas à améliorer votre candidature avant une nouvelle demande.' }],
            footer: `Hoxera · ${guild.name} · Candidatures`,
          })).catch(() => {});
        } catch {}
      }
      return true;
    }
  }
  return false;
}

// ---------------------- Modales (candidatures) ----------------------
async function handleModal(botId, entry, interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('hxapply:')) return false;
  const gid = id.split(':')[1];
  const guild = interaction.guild;
  const cfg = store.applications.get(botId, guild.id);
  if (!cfg || !cfg.channel) return interaction.reply({ content: '📝 Les candidatures sont fermées.', ephemeral: true });
  const questions = (() => { try { return JSON.parse(cfg.questions || '[]'); } catch { return []; } })();
  const channel = guild.channels.cache.get(cfg.channel);
  if (!channel) return interaction.reply({ content: '📝 Le salon des candidatures a été supprimé. Prévenez un admin !', ephemeral: true });

  const authorAvatar = interaction.user.displayAvatarURL ? interaction.user.displayAvatarURL({ size: 128 }) : '';
  const embed = new EmbedBuilder()
    .setColor('#e07a5f')
    .setTitle(cfg.title || '📝 Candidature')
    .setAuthor(authorAvatar ? { name: interaction.user.tag, iconURL: authorAvatar } : { name: interaction.user.tag })
    .setFooter({ text: `ID : ${interaction.user.id}` });
  questions.forEach((q, i) => {
    embed.addFields({ name: `❓ ${q}`, value: interaction.fields.getTextInputValue(`q${i}`) || '*pas de réponse*' });
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hx:applyd:${guild.id}:accept:${interaction.user.id}`).setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hx:applyd:${guild.id}:refuse:${interaction.user.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  );
  // ✅ Réponse d'abord (rapide), puis l'envoi au salon : sinon Discord
  // coupe l'interaction si l'envoi prend du temps.
  await interaction.reply({ content: '📝 Candidature envoyée ! Le staff va l\'examiner. ✅', ephemeral: true });
  await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
  return true;
}

// ---------------------- Composants de jeu ----------------------
function letterRows(guildId) {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const rows = [];
  for (let r = 0; r < 2; r++) {
    const row = new ActionRowBuilder();
    letters.slice(r * 13, r * 13 + 13).forEach((l) => {
      row.addComponents(new ButtonBuilder().setCustomId(`hx:pendu:${guildId}:${l}`).setLabel(l.toUpperCase()).setStyle(ButtonStyle.Secondary));
    });
    rows.push(row);
  }
  return rows;
}

function boardRows(guildId, state, disabled = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const val = state.board[i];
      row.addComponents(new ButtonBuilder()
        .setCustomId(`hx:morpion:${guildId}:${i}`)
        .setLabel(val || '⠀')
        .setStyle(val ? (val === '❌' ? ButtonStyle.Danger : ButtonStyle.Primary) : ButtonStyle.Secondary)
        .setDisabled(disabled || !!val));
    }
    rows.push(row);
  }
  return rows;
}

function checkMorpionWin(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const l of lines) {
    if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[1]] === board[l[2]]) return true;
  }
  return false;
}

// v230 — Le sondage passe en CHAMPS D'EMBED : un champ par option.
// La séparation devient NATIVE (Discord dessine l'espace entre les champs),
// donc plus besoin de lignes vides ni de traits ━. Le pourcentage et la barre
// de progression sont alignés sur leur propre ligne, ce qui rend la lecture
// des résultats nettement plus rapide qu'avec 10 blocs de texte empilés.
//
// ⚖️ Le critère v229 reste respecté : une LISTE D'OPTIONS n'est pas une suite
// de sections → ui.sectionize() ne s'applique toujours pas ici (il dessinerait
// 9 traits pour 10 choix). C'est la raison d'être de cette version : aérer le
// sondage SANS passer par le trait.
//
// Garde-fous :
//   • Discord limite un embed à 25 champs — /poll plafonne à 10 choix, la
//     marge est large mais la borne est posée (.slice(0, 25)).
//   • Chaque libellé est tronqué à 100 caractères AVANT d'être mis en gras :
//     les choix de /poll arrivaient ici sans AUCUNE limite de longueur
//     (`raw.split('|')`), et la troncature Discord aurait coupé le `**` final
//     → markdown déséquilibré. Pire : avec l'ancien rendu en description,
//     10 choix longs dépassaient la limite de 4096 caractères et **le sondage
//     échouait à s'envoyer**. Bug latent corrigé au passage.
//   • `votes.size || 1` évite toute division par zéro (hérité de l'ancien code).
//   • La barre est bornée à 10 segments (arrondi de pourcentage > 100 impossible).
function pollEmbed(question, choices, votes) {
  const total = votes.size || 1;
  const counts = choices.map(() => 0);
  for (const idx of votes.values()) counts[idx] = (counts[idx] || 0) + 1;
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  // Troncature PROPRE : on coupe le texte nu, puis on ajoute le gras — ainsi
  // les marqueurs ** restent toujours appariés.
  const shortLabel = (v, n) => {
    const t = String(v == null ? '' : v).trim();
    return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
  };
  const fields = choices.slice(0, 25).map((c, i) => {
    const pct = Math.round((counts[i] / total) * 100);
    const filled = Math.min(10, Math.max(0, Math.round(pct / 10)));
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    return {
      name: ui.text(`${emojis[i] || '•'} **${shortLabel(c, 100)}**`, 256),
      value: ui.text(`${bar} **${pct}%** (${counts[i]} vote${counts[i] > 1 ? 's' : ''})`, 1024),
      inline: false,
    };
  });
  const embed = new EmbedBuilder()
    .setColor('#e07a5f')
    .setTitle(`🗳️ ${question}`)
    .addFields(fields)
    .setFooter({ text: `${votes.size} vote(s) — cliquez sur un bouton pour voter (re-cliquez pour annuler)` });
  // État vide : aucun vote pour l'instant (comme les états vides du dashboard).
  if (!votes.size) embed.setDescription('*Aucun vote pour l\'instant — choisissez un numéro ci-dessous 👇*');
  return embed;
}

function pollRows(guildId, choices) {
  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const rows = [];
  for (let r = 0; r < Math.ceil(choices.length / 5); r++) {
    const row = new ActionRowBuilder();
    choices.slice(r * 5, r * 5 + 5).forEach((c, i) => {
      row.addComponents(new ButtonBuilder()
        .setCustomId(`hx:poll:${guildId}:${r * 5 + i}`)
        .setLabel(emojis[r * 5 + i])
        .setStyle(ButtonStyle.Primary));
    });
    rows.push(row);
  }
  return rows;
}

// ---------------------- Durées ----------------------
function parseDuration(str) {
  const s = String(str || '').trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(s|sec|m|min|h|d|j)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n) return null;
  const mult = { s: 1000, sec: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000, j: 86400000 }[m[2]];
  return n * mult;
}

function formatDuration(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d} jour(s)`;
  if (h > 0) return `${h} heure(s)`;
  return `${m} minute(s)`;
}

// ---------------------- Salons vocaux temporaires ----------------------
async function onVoiceState(botId, entry, oldState, newState) {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const cfg = store.voicetemp.get(botId, guild.id);
    if (!cfg || !cfg.creator_channel) return;

    // Création : quelqu'un rejoint le salon « ➕ Créer un vocal »
    if (newState.channelId === cfg.creator_channel && newState.member) {
      const creatingKey = `vt_creating_${guild.id}`;
      if (store.settings.get(creatingKey)) return; // déjà en cours
      // Limite : 10 salons temporaires max
      const mineKey = `vt_channels_${guild.id}`;
      let mine = [];
      try { mine = JSON.parse(store.settings.get(mineKey) || '[]'); } catch {}
      mine = mine.filter((id) => guild.channels.cache.has(id));
      if (mine.length >= 10) {
        try {
          await newState.member.send(ui.v2panel({
            variant: 'warning',
            title: '🔊 Limite de salons vocaux',
            description: 'Vous avez atteint la limite de 10 salons vocaux temporaires ouverts.',
            fields: [{ name: '💡 Que faire ?', value: 'Rejoignez un salon existant ou quittez un salon temporaire avant d’en créer un nouveau.' }],
            footer: 'Hoxera · Salons vocaux temporaires',
          })).catch(() => {});
        } catch {}
        return;
      }
      store.settings.set(creatingKey, '1');
      try {
        const name = (cfg.name_template || '🔊 {name}').replace('{name}', newState.member.displayName || newState.member.user.username);
        const channel = await guild.channels.create({
          name: name.slice(0, 100),
          type: ChannelType.GuildVoice,
          parent: cfg.category || undefined,
        }).catch(() => null);
        if (channel) {
          mine.push(channel.id);
          store.settings.set(mineKey, JSON.stringify(mine));
          // 🎙️ v267 — on mémorise le PROPRIÉTAIRE du salon : c'est lui (et
          // seulement lui) qui pourra le gérer via le panneau de contrôle.
          vtSetOwner(guild.id, channel.id, newState.member.id);
          await newState.member.voice.setChannel(channel).catch(() => {});
        }
      } finally {
        store.settings.set(creatingKey, '');
      }
    }

    // Suppression : un salon temporaire est devenu vide
    if (oldState.channel && oldState.channel.members.size === 0) {
      const mineKey = `vt_channels_${guild.id}`;
      let mine = [];
      try { mine = JSON.parse(store.settings.get(mineKey) || '[]'); } catch {}
      if (mine.includes(oldState.channel.id) && oldState.channel.id !== cfg.creator_channel) {
        await oldState.channel.delete('Salon vocal temporaire vide').catch(() => {});
        mine = mine.filter((id) => id !== oldState.channel.id);
        store.settings.set(mineKey, JSON.stringify(mine));
        vtClearOwner(guild.id, oldState.channel.id);
      }
    }
  } catch (e) {
    console.error('[Hoxera] voicetemp error:', e.message);
  }
}

// ---------------------- 🎙️ v267 — Vocaux temporaires + ----------------------
// Panneau de contrôle PRO dans un salon textuel choisi : chaque propriétaire
// d'un salon vocal temporaire gère SON salon (privé/public, ajouter/retirer
// des membres, renommer, supprimer). Toutes les réponses sont ÉPHÉMÈRES :
// ce que clique quelqu'un ne se voit que chez lui.
function vtOwnerKey(guildId, channelId) { return `vt_owner:${guildId}:${channelId}`; }
function vtSetOwner(guildId, channelId, userId) { try { store.settings.set(vtOwnerKey(guildId, channelId), String(userId || '')); } catch {} }
function vtGetOwner(guildId, channelId) { try { return String(store.settings.get(vtOwnerKey(guildId, channelId)) || ''); } catch { return ''; } }
function vtClearOwner(guildId, channelId) { try { store.settings.set(vtOwnerKey(guildId, channelId), ''); } catch {} }

// Le salon temporaire actuel d'un membre (s'il en possède un encore existant).
function vtChannelOf(botId, guild, userId) {
  const cfg = store.voicetemp.get(botId, guild.id);
  if (!cfg) return null;
  let mine = [];
  try { mine = JSON.parse(store.settings.get(`vt_channels_${guild.id}`) || '[]'); } catch {}
  for (const id of mine) {
    if (vtGetOwner(guild.id, id) !== String(userId)) continue;
    const channel = guild.channels.cache.get ? guild.channels.cache.get(id) : null;
    if (channel) return channel;
  }
  return null;
}

function vtNoChannelPanel() {
  return ui.v2panel({
    color: '#e07a5f',
    title: '🎙️ Pas encore de salon vocal personnel',
    description: 'Rejoignez le salon vocal **« ➕ Créer un vocal »** : un salon à votre nom se crée automatiquement et vous êtes déplacé dedans.\nRevenez ensuite sur ce panneau pour le gérer.',
  });
}

// v274 — Pack « signatures » : UN émoji Hoxera par module du bot, dessiné
// pour nous (server/assets/emotes). /emotes l'installe sur le serveur :
// les membres le voient et peuvent l'utiliser ; le dashboard, lui, affiche
// ces PNG directement comme icônes de modules.
const HOX_SIG_EMOTES = ['vue', 'ticket', 'bienvenue', 'niveaux', 'eco', 'boutique', 'mod', 'antinuke', 'roles', 'suggestion', 'cadeau', 'events', 'quiz', 'vocal', 'communaute', 'annonce', 'embed', 'membres', 'stats', 'journal', 'transcript', 'modmail', 'reglages', 'bot', 'aide'];
const HOX_SIG_FALLBACK = { vue: '📊', ticket: '🎫', bienvenue: '👋', niveaux: '📈', eco: '💰', boutique: '🛒', mod: '🛡️', antinuke: '🚨', roles: '📋', suggestion: '💡', cadeau: '🎁', events: '🎮', quiz: '🧠', vocal: '🎙️', communaute: '⭐', annonce: '📅', embed: '🧱', membres: '👥', stats: '📈', journal: '📜', transcript: '🔎', modmail: '💬', reglages: '⚙️', bot: '🤖', aide: '❓' };
function hoxSigMap(guild) { try { return JSON.parse(store.settings.get(`hox_emotes:${guild.id}`) || '{}'); } catch { return {}; } }
async function installHoxEmotes(botId, guild) {
  const fs = require('fs'); const path = require('path');
  const map = hoxSigMap(guild);
  const created = [];
  for (const key of HOX_SIG_EMOTES) {
    const name = 'hox_' + key;
    const existing = guild.emojis && guild.emojis.cache ? guild.emojis.cache.find((e) => e.name === name) : null;
    if (existing) { map[key] = existing.id; continue; }
    const file = path.join(__dirname, '..', 'assets', 'emotes', name + '.png');
    if (!fs.existsSync(file)) continue;
    const em = await guild.emojis.create({ attachment: fs.readFileSync(file), name });
    map[key] = em.id; created.push(name);
  }
  store.settings.set(`hox_emotes:${guild.id}`, JSON.stringify(map));
  return created;
}
function hoxEmotesPanel(botId, guild, created) {
  const map = hoxSigMap(guild);
  const lines = HOX_SIG_EMOTES.map((key) => {
    const id = map[key];
    const emo = guild && guild.emojis && guild.emojis.cache ? guild.emojis.cache.get(String(id)) : null;
    return emo ? `${emo} ${key}` : `${HOX_SIG_FALLBACK[key]} ${key}`;
  });
  return ui.v2panel({
    color: '#e07a5f',
    titleLevel: 3,
    title: '🎨 Émojis Hoxera du serveur',
    description: created && created.length
      ? `**${created.length} émojis installés** : ils sont maintenant utilisables par tout le monde sur ce serveur.`
      : 'Le pack est déjà installé : chaque émoji ci-dessous est utilisable par tout le monde sur ce serveur.',
    fields: [
      { name: 'Le pack signatures', value: lines.join(' · ') },
      { name: 'À savoir', value: 'Les émojis vocaux (panneau de contrôle) s\'installent avec `/voicetemp emotes`. Le dashboard affiche ces mêmes icônes, en PNG Hoxera.' },
    ],
  });
}

// v268 — Pack d'émojis Hoxera (générés pour nous, rangés dans server/assets/
// voicetemp). Installés sur le serveur par /voicetemp emotes ou le dashboard :
// le panneau affiche NOS émojis ; sinon repli sur les émojis unicode.
const VT_EMOTES = ['nom', 'limite', 'prive', 'public', 'suppr', 'ajouter', 'retirer', 'expulser', 'recup', 'transfer'];
const VT_EMOTE_FALLBACK = { nom: '✏️', limite: '👥', prive: '🔒', public: '🔓', suppr: '🗑️', ajouter: '➕', retirer: '➖', expulser: '👢', recup: '🔑', transfer: '🤝' };
function vtEmotesOf(guild) { try { return JSON.parse(store.settings.get(`vt_emotes:${guild.id}`) || '{}'); } catch { return {}; } }
function vtEmoji(guild, key) {
  try {
    const id = vtEmotesOf(guild)[key];
    if (guild && id && guild.emojis && guild.emojis.cache) {
      const e = guild.emojis.cache.get(String(id));
      if (e) return e.id;
    }
  } catch {}
  return VT_EMOTE_FALLBACK[key];
}
async function installVtEmotes(botId, guild) {
  const fs = require('fs'); const path = require('path');
  const crypto = require('crypto');
  // v275 — REMPLACEMENT : si nos fichiers d'émojis changent (ex. passage en
  // style premium), on supprime les anciens et on recrée ; si rien n'a
  // changé, on ne touche à rien (idempotent).
  const dir = path.join(__dirname, '..', 'assets', 'voicetemp');
  const blobs = {};
  const hash = crypto.createHash('sha256');
  for (const key of VT_EMOTES) {
    const file = path.join(dir, 'hox_' + key + '.png');
    const buf = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
    blobs[key] = buf;
    hash.update(buf);
  }
  const ver = hash.digest('hex').slice(0, 16);
  const savedVer = store.settings.get(`vt_emotes_ver:${guild.id}`);
  const map = vtEmotesOf(guild);
  const created = [];
  for (const key of VT_EMOTES) {
    const name = 'hox_' + key;
    const existing = guild.emojis && guild.emojis.cache ? guild.emojis.cache.find((e) => e.name === name) : null;
    if (existing && savedVer === ver) { map[key] = existing.id; continue; }
    if (existing) { try { await existing.delete(); } catch {} }
    if (!blobs[key].length) continue;
    const em = await guild.emojis.create({ attachment: blobs[key], name });
    map[key] = em.id; created.push(name);
  }
  store.settings.set(`vt_emotes:${guild.id}`, JSON.stringify(map));
  store.settings.set(`vt_emotes_ver:${guild.id}`, ver);
  return created;
}

// Salon temporaire récupérable : la personne est DEDANS et le propriétaire
// n'y est plus (parti ou déconnecté).
function vtClaimableChannel(botId, guild, userId) {
  const cfg = store.voicetemp.get(botId, guild.id);
  if (!cfg) return null;
  let ids = [];
  try { ids = JSON.parse(store.settings.get(`vt_channels_${guild.id}`) || '[]'); } catch {}
  for (const id of ids) {
    const ch = guild.channels.cache.get ? guild.channels.cache.get(id) : null;
    if (!ch || !ch.members || !ch.members.has) continue;
    const owner = vtGetOwner(guild.id, id);
    if (owner && ch.members.has(String(owner))) continue;
    if (ch.members.has(String(userId))) return ch;
  }
  return null;
}

// Le panneau de contrôle, envoyé dans le salon textuel choisi.
// v272 — présentation façon TempVoice (la référence pro) : une LÉGENDE
// émoji + nom dans le message, une phrase d'invitation, puis des boutons
// CARRÉS SANS TEXTE (juste nos émojis Hoxera) alignés par rangées de 5.
function buildVtPanel(botId, guild) {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
  const id = (act) => `vt:${botId}:${act}`;
  const emo = (key) => vtEmoji(guild, key);
  const tag = (key, label) => {
    const e = emo(key);
    return /^\d+$/.test(String(e)) ? `<:hox_${key}:${e}> ${label}` : `${e} ${label}`;
  };
  // v273 — légende en PETIT TEXTE (« -# ») : chez TempVoice la légende est
  // minuscule ; c'est elle (et le titre « ## ») qui agrandissait notre panneau.
  const legende = [
    [tag('nom', 'NOM'), tag('limite', 'LIMITE'), tag('prive', 'PRIVÉ'), tag('public', 'PUBLIC')].join('   '),
    [tag('recup', 'RÉCUPÉRER'), tag('ajouter', 'AJOUTER'), tag('retirer', 'RETIRER'), tag('expulser', 'EXPULSER')].join('   '),
    [tag('transfer', 'TRANSFÉRER'), tag('suppr', 'SUPPRIMER')].join('   '),
  ].map((l) => `-# ${l}`).join('\n');
  // Rangée 1 : les 5 boutons du salon, carrés, émojis seuls (style TempVoice).
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('rename')).setEmoji(emo('nom')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('limit')).setEmoji(emo('limite')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('lock')).setEmoji(emo('prive')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('unlock')).setEmoji(emo('public')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('claim')).setEmoji(emo('recup')).setStyle(ButtonStyle.Secondary),
  );
  // v272 — AJOUTER / RETIRER / EXPULSER / TRANSFÉRER sont des BOUTONS-ÉMOJIS
  // (comme TempVoice) : un appui ouvre un petit panneau PERSONNEL avec le
  // menu « utilisateur » pour choisir le membre en 2 clics.
  // v273 — rangées de 4 boutons maxi : 5 ne tenaient pas sur mobile et le
  // 5ᵉ retombait tout seul sur une ligne (panneau « pas rangé »). 4/4/2 =
  // même disposition partout, téléphone compris.
  const row1b = new ActionRowBuilder().addComponents(row1.components.slice(0, 4));
  const row2 = new ActionRowBuilder().addComponents(
    row1.components[4],
    new ButtonBuilder().setCustomId(id('add')).setEmoji(emo('ajouter')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('rem')).setEmoji(emo('retirer')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('kick')).setEmoji(emo('expulser')).setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id('transfer')).setEmoji(emo('transfer')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(id('del')).setEmoji(emo('suppr')).setStyle(ButtonStyle.Danger),
  );
  return ui.v2panel({
    color: '#e07a5f',
    titleLevel: 3,
    title: '🎙️ Interface Hoxera — vocaux temporaires',
    description: `Gérez **votre salon vocal temporaire** — chaque réponse est **personnelle**.\n${legende}\n\n**Appuyez sur les boutons ci-dessous pour utiliser l'interface.**`,
  }, [row1b, row2, row3]);
}

// Envoie (ou remplace) le panneau dans le salon textuel configuré.
async function sendVtPanel(botId, guild, channelId) {
  const channel = guild.channels.cache.get ? guild.channels.cache.get(channelId) : null;
  if (!channel || typeof channel.send !== 'function') throw new Error('salon textuel introuvable');
  const cfg = store.voicetemp.get(botId, guild.id) || {};
  if (cfg.panel_message) {
    try {
      const old = await channel.messages.fetch(cfg.panel_message);
      if (old) await old.delete();
    } catch {}
  }
  const msg = await channel.send(buildVtPanel(botId, guild));
  store.voicetemp.set(botId, guild.id, { ...cfg, panel_message: msg.id });
  return msg.id;
}

// Boutons / menus / modale du panneau : toujours éphémère, toujours LE salon
// de la personne qui clique.
async function handleVtInteraction(botId, entry, i) {
  const cid = String(i.customId || '');
  const isVtModal = i.isModalSubmit && i.isModalSubmit() && (cid.startsWith(`vtrename:${botId}`) || cid.startsWith(`vtlimit:${botId}`));
  const isVtComp = !isVtModal && cid.startsWith(`vt:${botId}:`);
  if (!isVtModal && !isVtComp) return false;
  const guild = i.guild;
  if (!guild) return false;
  const act = isVtModal ? (cid.startsWith(`vtrename:${botId}`) ? 'rename' : 'limit') : cid.slice(`vt:${botId}:`.length);
  if (act === 'claim') {
    const ch = vtClaimableChannel(botId, guild, i.user.id);
    if (!ch) {
      await i.reply({ ...ui.v2panel({ color: '#e07a5f', title: '🔑 Rien à récupérer', description: 'Pour récupérer un salon, soyez **dedans** alors que son propriétaire n\'y est plus (parti ou déconnecté).' }), ephemeral: true }).catch(() => {});
      return true;
    }
    vtSetOwner(guild.id, ch.id, i.user.id);
    await ch.permissionOverwrites.edit(i.user.id, { Connect: true, ViewChannel: true, Speak: true }).catch(() => {});
    await i.reply({ ...ui.v2panel({ color: '#e07a5f', title: '🔑 Salon récupéré', description: `Vous êtes maintenant propriétaire de **${ch.name}** : le panneau agit sur ce salon.` }), ephemeral: true }).catch(() => {});
    return true;
  }
  const channel = vtChannelOf(botId, guild, i.user.id);
  if (!channel) {
    await i.reply({ ...vtNoChannelPanel(), ephemeral: true }).catch(() => {});
    return true;
  }
  const say = async (title, desc, color = '#e07a5f') => {
    await i.reply({ ...ui.v2panel({ color, title, description: desc }), ephemeral: true }).catch(() => {});
  };
  try {
    if (act === 'lock') {
      await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: true, Connect: false });
      await channel.permissionOverwrites.edit(i.user.id, { Connect: true, ViewChannel: true, Speak: true });
      await say('🔒 Salon privé', `Personne ne peut entrer dans **${channel.name}**, sauf vous et les membres que vous ajouterez.`);
      return true;
    }
    if (act === 'unlock') {
      await channel.permissionOverwrites.set([]);
      await say('🔓 Salon public', `Tout le serveur peut maintenant rejoindre **${channel.name}**.`);
      return true;
    }
    if (act === 'rename') {
      if (isVtModal) {
        const name = String(i.fields.getTextInputValue('name') || '').trim().slice(0, 100);
        if (!name) {
          await say('⚠️ Nom vide', 'Donnez un nom à votre salon vocal.', '#ED4245');
          return true;
        }
        await channel.setName(name, 'Salon renommé par son propriétaire');
        await say('✏️ Salon renommé', `Votre salon s'appelle maintenant **${name}**.`);
        return true;
      }
      const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      const modal = new ModalBuilder().setCustomId(`vtrename:${botId}`).setTitle('✏️ Renommer votre salon vocal');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Nouveau nom de votre salon').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true),
      ));
      await i.showModal(modal);
      return true;
    }
    if (act === 'limit') {
      if (isVtModal) {
        const raw = String(i.fields.getTextInputValue('limit') || '').trim();
        const n = Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
        await channel.setUserLimit(n);
        await say('👥 Limite fixée', n === 0 ? `**${channel.name}** accepte un nombre illimité de personnes.` : `**${channel.name}** est limité à **${n}** place(s).`);
        return true;
      }
      const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
      const modal = new ModalBuilder().setCustomId(`vtlimit:${botId}`).setTitle('👥 Limite de votre salon vocal');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('limit').setLabel('Nombre de places (0 = illimité, 99 max)').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true),
      ));
      await i.showModal(modal);
      return true;
    }
    if (act === 'add' || act === 'rem' || act === 'kick' || act === 'transfer') {
      const target = String((i.values && i.values[0]) || '');
      if (!target) {
        // Bouton-émoji appuyé : petit panneau personnel avec le menu membre.
        const { ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');
        const cfg = {
          add: ['➕ AJOUTER UN MEMBRE', 'Choisissez le membre à autoriser dans votre salon (même privé).'],
          rem: ["➖ RETIRER UN MEMBRE", "Choisissez le membre à qui couper l'accès (s'il est dedans, il y reste jusqu'à sa sortie)."],
          kick: ['👢 EXPULSER UN MEMBRE', 'Choisissez le membre à sortir du vocal ET à empêcher de revenir.'],
          transfer: ['🤝 TRANSFÉRER LA PROPRIÉTÉ', 'Choisissez le membre qui deviendra propriétaire de votre salon.'],
        }[act];
        await i.reply({
          ...ui.v2panel({ color: '#e07a5f', title: cfg[0], description: cfg[1] }),
          components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`vt:${botId}:${act}`).setPlaceholder('Choisissez un membre…').setMinValues(1).setMaxValues(1))],
          ephemeral: true,
        }).catch(() => {});
        return true;
      }
      if (act === 'add') {
        await channel.permissionOverwrites.edit(target, { ViewChannel: true, Connect: true, Speak: true });
        await say('➕ Membre invité', `<@${target}> peut rejoindre **${channel.name}** — même si votre salon est privé, il fait désormais partie de vos invités.`);
      } else if (act === 'rem') {
        await channel.permissionOverwrites.edit(target, { Connect: false });
        await say('➖ Membre retiré', `<@${target}> ne peut plus entrer dans **${channel.name}**.`);
      } else if (act === 'kick') {
        const m = channel.members && channel.members.get ? channel.members.get(target) : null;
        if (m && m.voice && typeof m.voice.setChannel === 'function') await m.voice.setChannel(null);
        await channel.permissionOverwrites.edit(target, { Connect: false });
        await say('👢 Membre expulsé', `<@${target}> a été sorti de **${channel.name}** et ne peut plus y entrer (➕ pour le réinviter).`);
      } else {
        vtSetOwner(guild.id, channel.id, target);
        await channel.permissionOverwrites.edit(target, { ViewChannel: true, Connect: true, Speak: true });
        await say('🤝 Propriété transférée', `<@${target}> est maintenant propriétaire de **${channel.name}** : c'est lui qui le gère.`);
      }
      return true;
    }
    if (act === 'del') {
      const name = channel.name;
      await channel.delete('Salon vocal temporaire supprimé par son propriétaire');
      vtClearOwner(guild.id, channel.id);
      await say('🗑️ Salon supprimé', `**${name}** a été supprimé. Merci d'avoir utilisé les vocaux temporaires !`);
      return true;
    }
  } catch (e) {
    await say('⚠️ Action impossible', `Discord a refusé l'action : ${String(e.message || e).slice(0, 180)}\nVérifiez que le bot a bien les permissions de gérer les salons.`, '#ED4245');
    return true;
  }
  return false;
}

// ---------------------- Tâches périodiques (appelées depuis tasks.js) ----------------------
// Calcule la prochaine échéance d'un rappel récurrent (v188).
function nextRepeatTs(mode, fromTs) {
  if (mode === 'hourly') return fromTs + 3600000;
  if (mode === 'weekly') return fromTs + 7 * 86400000;
  return fromTs + 86400000; // daily (et défaut)
}

async function sweepReminders(botId, entry) {
  const due = store.reminders.due(Date.now()).filter((r) => r.bot_id === botId);
  for (const r of due) {
    try {
      const user = await entry.client.users.fetch(r.user_id).catch(() => null);
      // v235 — options factorisées : le même panneau sert au MP et au repli en
      // salon. En V2 il n'y a plus de `reminderPanel.embeds` à réinjecter, et le
      // ping ne peut plus être dans `content` (interdit) → il devient un
      // TextDisplay en tête de conteneur, d'où la 2e construction.
      const reminderOptions = {
        variant: 'warning',
        title: '⏰ Votre rappel',
        description: String(r.text || 'Rappel sans texte').slice(0, 4000),
        fields: [{ name: '🧭 Serveur', value: entry.client.guilds.cache.get(r.guild_id)?.name || 'Votre serveur', inline: true }],
        footer: 'Hoxera · Rappel personnel',
      };
      const sent = user && await user.send(ui.v2panel(reminderOptions)).then(() => true).catch(() => false);
      if (!sent) {
        const guild = entry.client.guilds.cache.get(r.guild_id);
        const channel = guild && r.channel_id ? guild.channels.cache.get(r.channel_id) : null;
        if (channel) {
          await channel.send({
            ...ui.v2panel({ ...reminderOptions, content: `<@${r.user_id}>` }),
            allowedMentions: { users: [String(r.user_id)] },
          }).catch(() => {});
        }
      }
    } catch (e) { console.error('[Hoxera] reminder error:', e.message); }
    // 🔁 Rappel récurrent : on le reprogramme à la prochaine échéance
    // au lieu de le supprimer.
    const mode = r.repeat_mode || 'once';
    if (mode !== 'once') {
      try {
        store.reminders.add(r.bot_id, r.guild_id, r.channel_id, r.user_id, nextRepeatTs(mode, r.at_ts), r.text, mode);
      } catch (e) { console.error('[Hoxera] reminder rearm error:', e.message); }
    }
    store.reminders.remove(r.id);
  }
}

function sweepScheduled(botId, entry, now = new Date()) {
  const nowMin = Math.floor(now.getTime() / 60000);
  for (const s of store.scheduled.allEnabled()) {
    if (s.bot_id !== botId) continue;
    // Heure LOCALE du serveur Discord (Europe/Paris par défaut), jamais UTC
    const tz = tzUtil.safeTz((store.guildSettings.get(botId, s.guild_id) || {}).timezone);
    const p = tzUtil.parts(now, tz);
    if (s.last_sent === p.ymd) continue; // déjà envoyée aujourd'hui (heure locale)
    const days = String(s.days || '').split(',').map((x) => parseInt(x.trim(), 10)).filter(Boolean);
    if (!days.includes(p.dow)) continue; // pas le bon jour de la semaine
    const occMin = Math.floor(tzUtil.zonedInstant(p.ymd, s.hour, s.minute, tz) / 60000);
    if (occMin > nowMin) continue;          // pas encore l'heure
    if (occMin < nowMin - 10) continue;     // fenêtre ratée depuis > 10 min → on saute
    const guild = entry.client.guilds.cache.get(s.guild_id);
    const channel = guild ? guild.channels.cache.get(s.channel_id) : null;
    if (!channel) continue;                 // salon introuvable → on réessaiera au prochain balayage
    const localTime = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
    // v235 — le message programmé (s.text) ne peut plus être dans le `content`
    // du message : Components V2 l'interdit. Il devient un TextDisplay en tête
    // de conteneur (même position visuelle qu'avant : au-dessus du titre, ce
    // que le champ « affiché juste au-dessus » décrit). Les allowedMentions
    // restent au niveau du message et continuent de notifier.
    const scheduledOptions = {
      variant: 'brand',
      title: '📅 Annonce programmée',
      content: s.text,
      description: '',
      fields: [{ name: '🕘 Horaire', value: `${localTime} · ${tz}`, inline: true }, { name: '💬 Message programmé', value: 'Le message personnalisé est affiché juste au-dessus.', inline: false }],
      footer: `Hoxera · ${guild.name} · Annonce automatique`,
    };
    const visualPayload = { ...ui.v2panel(scheduledOptions), allowedMentions: { parse: ['everyone', 'roles', 'users'] } };
    channel.send(visualPayload)
      .then(() => {
        store.scheduled.update(s.id, { last_sent: p.ymd });
        console.log(`[Hoxera] ✅ Annonce envoyée (serveur ${s.guild_id}, salon #${s.channel_id}, ${p.ymd} ${localTime} ${tz})`);
      })
      .catch((err) => {
        if (err && err.code === 50013) {
          // Mentions (@everyone/@here) interdites par les permissions → on retente sans les activer
          channel.send({ ...ui.v2panel(scheduledOptions), allowedMentions: { parse: [] } })
            .then(() => {
              store.scheduled.update(s.id, { last_sent: p.ymd });
              console.log(`[Hoxera] ✅ Annonce envoyée sans mentions (permission manquante) — ${p.ymd} ${localTime} ${tz}`);
            })
            .catch((e2) => console.error(`[Hoxera] ❌ Annonce impossible à envoyer (#${s.channel_id}) : ${e2.message} — nouvel essai au prochain balayage`));
          return;
        }
        console.error(`[Hoxera] ❌ Annonce impossible à envoyer (#${s.channel_id}) : ${err.message} — nouvel essai au prochain balayage`);
      });
  }
}

async function sweepBirthdays(botId, entry, now = new Date()) {
  const keyDate = `${botId}`;
  if (!store.birthdays.celebrated.isNewDay(keyDate)) return;
  // Retire le rôle anniversaire des fêtés d'hier (heure locale de chaque serveur)
  try {
    for (const guild of entry.client.guilds.cache.values()) {
      const gs = store.guildSettings.get(botId, guild.id) || {};
      if (!gs.birthday_role) continue;
      const tz = tzUtil.safeTz(gs.timezone);
      const yesterday = tzUtil.parts(new Date(now.getTime() - 86400000), tz).ymd;
      const prevKey = `bday_role_${guild.id}_${yesterday}`;
      let prev = [];
      try { prev = JSON.parse(store.settings.get(prevKey) || '[]'); } catch {}
      const role = guild.roles.cache.get(gs.birthday_role) || guild.roles.cache.find((r) => r.name.toLowerCase() === String(gs.birthday_role).toLowerCase());
      for (const uid of prev) {
        const m = await guild.members.fetch(uid).catch(() => null);
        if (m && role && m.roles.cache.has(role.id)) await m.roles.remove(role).catch(() => {});
      }
    }
  } catch (e) { console.error('[Hoxera] bday cleanup:', e.message); }

  store.birthdays.celebrated.set(keyDate);
  // Célèbre les anniversaires du jour (heure locale de chaque serveur)
  for (const guild of entry.client.guilds.cache.values()) {
    const gs = store.guildSettings.get(botId, guild.id) || {};
    const tz = tzUtil.safeTz(gs.timezone);
    const p = tzUtil.parts(now, tz);
    const list = store.birthdays.today(p.day, p.month).filter((b) => String(b.bot_id) === String(botId) && b.guild_id === guild.id);
    for (const b of list) {
    try {
      const member = await guild.members.fetch(b.user_id).catch(() => null);
      if (!member) continue;
      const channel = gs.birthday_channel ? (guild.channels.cache.get(gs.birthday_channel) || guild.channels.cache.find((c) => c.name.toLowerCase() === String(gs.birthday_channel).replace(/^#/, '').toLowerCase())) : null;
      if (channel) {
        // v235 — le ping devient un TextDisplay en tête de conteneur (`content`
        // interdit en V2) ; allowedMentions reste appliqué et notifie toujours.
        await channel.send({
          ...ui.v2panel({
            content: `<@${member.id}>`,
            variant: 'warning',
            title: '🎂 Joyeux anniversaire !',
            description: `Toute la communauté souhaite une superbe journée à ${member} ! 🥳🎁`,
            fields: [{ name: '🎉 Message du serveur', value: 'Profite bien de cette journée spéciale !' }],
            footer: `Hoxera · ${guild.name} · Anniversaires`,
          }),
          allowedMentions: { users: [String(member.id)] },
        }).catch(() => {});
      }
      if (gs.birthday_role) {
        const role = guild.roles.cache.get(gs.birthday_role) || guild.roles.cache.find((r) => r.name.toLowerCase() === String(gs.birthday_role).toLowerCase());
        if (role && guild.members.me && role.position < guild.members.me.roles.highest.position) {
          await member.roles.add(role).catch(() => {});
          const key = `bday_role_${guild.id}_${p.ymd}`;
          let arr = [];
          try { arr = JSON.parse(store.settings.get(key) || '[]'); } catch {}
          if (!arr.includes(member.id)) {
            arr.push(member.id);
            store.settings.set(key, JSON.stringify(arr));
          }
        }
      }
    } catch (e) { console.error('[Hoxera] bday announce:', e.message); }
    }
  }
}

module.exports = {
  buildExtraPayloads,
  handleInteraction,
  trackDeleted,
  trackMessage,
  onMessage,
  onVoiceState,
  sweepReminders,
  sweepScheduled,
  sweepBirthdays,
  parseDuration,
  formatDuration,
  nextRepeatTs,
  HELP_EXTRA,
  // v230 : builders du sondage exposés pour les tests (rendu en champs d'embed)
  pollEmbed,
  pollRows,
  // 🧪 États internes exposés pour les tests (anti-fuite mémoire)
  _test: { penduGames, morpionGames, pollState, quizState, capMap },
  buildVtPanel, sendVtPanel, handleVtInteraction, vtSetOwner, vtGetOwner, vtClearOwner, vtChannelOf,
  installVtEmotes, vtClaimableChannel, vtEmoji, VT_EMOTES, VT_EMOTE_FALLBACK,
  installHoxEmotes, hoxEmotesPanel, HOX_SIG_EMOTES, HOX_SIG_FALLBACK,
};
