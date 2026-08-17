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

// ---------------------- États de jeu (en mémoire) ----------------------
const penduGames = new Map();   // `${guildId}:${messageId}` -> { word, shown, lives, playerId }
const morpionGames = new Map(); // `${guildId}:${messageId}` -> { board, turn, p1, p2, over }
const pollState = new Map();    // `${guildId}:${messageId}` -> { question, choices, votes: Map<userId, index> }

// ---------------------- Snipe (derniers messages supprimés) ----------------------
const snipeCache = new Map();   // `${guildId}:${channelId}` -> { tag, avatar, content, attachments, ts }

function trackDeleted(botId, message) {
  if (!message || !message.guild || message.author?.bot) return;
  const key = `${message.guild.id}:${message.channel.id}`;
  const attachments = message.attachments ? message.attachments.size : 0;
  snipeCache.set(key, {
    tag: message.author.tag || message.author.username,
    avatar: message.author.displayAvatarURL({ size: 64 }) || '',
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
  return !!member && (member.permissions.has(PermissionsBitField.Flags.ManageGuild) || member.id === member.guild?.ownerId);
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
  const admin = PermissionsBitField.Flags.ManageGuild.toString();
  return [
    // ---------- Social ----------
    {
      name: 'marry', description: '💍 Demande un membre en mariage (il/elle doit accepter !)',
      options: [{ name: 'membre', description: 'L\'élu(e) de ton cœur', type: ApplicationCommandOptionType.User, required: true }],
    },
    {
      name: 'divorce', description: '💔 Divorcer de ton époux/épouse actuel(le)',
    },
    {
      name: 'couple', description: '💑 Voir le couple d\'un membre (ou le tien)',
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
      options: [{ name: 'choix', description: 'Ton coup', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: '🪨 Pierre', value: 'pierre' }, { name: '🍃 Feuille', value: 'feuille' }, { name: '✂️ Ciseaux', value: 'ciseaux' },
      ]}],
    },
    {
      name: 'pendu', description: '🪢 Joue au pendu : devine le mot caché !',
    },
    {
      name: 'morpion', description: '⭕ Joue au morpion contre un membre',
      options: [{ name: 'adversaire', description: 'Ton adversaire', type: ApplicationCommandOptionType.User, required: true }],
    },
    // ---------- Communauté ----------
    {
      name: 'birthday', description: '🎂 Gère ton anniversaire (le bot te souhaite le jour J !)',
      options: [
        { name: 'action', description: 'Que faire ?', type: ApplicationCommandOptionType.String, required: true, choices: [
          { name: 'set', value: 'set' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' },
        ]},
        { name: 'jour', description: 'Le jour (1-31)', type: ApplicationCommandOptionType.Integer, required: false },
        { name: 'mois', description: 'Le mois (1-12)', type: ApplicationCommandOptionType.Integer, required: false },
      ],
    },
    {
      name: 'remind', description: '⏰ Le bot t\'envoie un rappel en message privé',
      options: [
        { name: 'duree', description: 'Dans combien de temps ? (ex : 10m, 2h, 1d)', type: ApplicationCommandOptionType.String, required: true },
        { name: 'texte', description: 'Le message du rappel', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'poll', description: '🗳️ Crée un sondage avec des boutons de vote',
      options: [
        { name: 'question', description: 'La question', type: ApplicationCommandOptionType.String, required: true },
        { name: 'choix', description: 'Les choix séparés par | (ex : Oui | Non | Peut-être)', type: ApplicationCommandOptionType.String, required: true },
      ],
    },
    {
      name: 'snipe', description: '🕵️ Affiche le dernier message supprimé de ce salon',
    },
    // ---------- Économie enrichie ----------
    {
      name: 'work', description: '💼 Travaille pour gagner des coins (1 fois par heure)',
    },
    {
      name: 'gamble', description: '🎰 Parie tes coins : double ou rien !',
      options: [{ name: 'montant', description: 'Combien de coins miser ?', type: ApplicationCommandOptionType.Integer, required: true }],
    },
    {
      name: 'rob', description: '🦹 Tente de voler des coins à un membre (risqué !)',
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
      name: 'voicetemp', description: '🔊 Salons vocaux temporaires (création auto + suppression quand vides)',
      default_member_permissions: admin,
      options: [
        { name: 'action', description: 'Action', type: ApplicationCommandOptionType.String, required: true, choices: [
          { name: 'set', value: 'set' }, { name: 'off', value: 'off' }, { name: 'view', value: 'view' },
        ]},
        { name: 'salon', description: 'Le salon « ➕ Créer un vocal » (pour set)', type: ApplicationCommandOptionType.Channel, required: false },
        { name: 'categorie', description: 'La catégorie des salons créés (pour set)', type: ApplicationCommandOptionType.Channel, required: false },
      ],
    },
    {
      name: 'apply', description: '📝 Candidatures : les membres répondent à TES questions',
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
  marry: ['💍 Mariage', 'Demande un membre en mariage : il/elle reçoit une demande avec des boutons **Accepter / Refuser**. Une fois mariés, `/couple` affiche votre couple. Divorce possible à tout moment.', '`/marry @membre`', '`/marry @Léa` → demande envoyée 💍'],
  divorce: ['💔 Divorce', 'Rompt ton mariage actuel sur ce serveur.', '`/divorce`'],
  couple: ['💑 Couple', 'Affiche le couple d\'un membre (ou le tien si tu ne précises personne).', '`/couple @membre`', '`/couple @Léo` → 💍 Marié à @Léa depuis le 12/03/2026'],
  hug: ['🤗 Câlin', 'Fais un câlin à un membre (message aléatoire).', '`/hug @membre`'],
  kiss: ['😘 Bisou', 'Fais un bisou à un membre.', '`/kiss @membre`'],
  slap: ['👋 Claque', 'Gifle un membre (pour rire !).', '`/slap @membre`'],
  pat: ['🐶 Tape-tête', 'Tapote gentiment la tête d\'un membre.', '`/pat @membre`'],
  punch: ['👊 Coup de poing', 'Met un coup de poing à un membre (pour rire !).', '`/punch @membre`'],
  rps: ['🪨 Pierre-feuille-ciseaux', 'Joue contre moi : choisis pierre, feuille ou ciseaux !', '`/rps choix`', '`/rps pierre` → 🪨 vs 🍃 … je gagne !'],
  pendu: ['🪢 Pendu', 'Devine le mot caché lettre par lettre (8 vies).', '`/pendu`'],
  morpion: ['⭕ Morpion', 'Joue au morpion (tic-tac-toe) contre un membre, à tour de rôle sur une grille à boutons.', '`/morpion @membre`'],
  birthday: ['🎂 Anniversaire', 'Enregistre ta date : le jour J, le bot te souhaite un joyeux anniversaire dans le salon configuré (et te donne le rôle anniversaire s\'il est défini).', '`/birthday set jour mois` · `/birthday remove` · `/birthday list`', '`/birthday set 14 7` → 🎂 Enregistré ! (14 juillet)'],
  remind: ['⏰ Rappel', 'Le bot t\'envoie un message privé à l\'heure dite.', '`/remind durée texte` (durée : 10m, 2h, 1d)', '`/remind 2h sortir le poulet` → MP dans 2 h'],
  poll: ['🗳️ Sondage', 'Crée un sondage : les membres votent avec des boutons, les résultats s\'affichent en direct.', '`/poll question choix1 | choix2 | …`', '`/poll Pizza ou burger ? Pizza | Burger | Sushi`'],
  snipe: ['🕵️ Snipe', 'Affiche le dernier message supprimé de ce salon.', '`/snipe`'],
  work: ['💼 Travail', 'Travaille pour gagner des coins (entre 50 et 150, 1 fois par heure).', '`/work`', '`/work` → 🧑‍🍳 Tu as cuisiné : +120 coins !'],
  gamble: ['🎰 Pari', 'Parie des coins : 50 % de chances de doubler, 50 % de tout perdre.', '`/gamble montant`', '`/gamble 100` → 🎰 JACKPOT ! +100 coins !'],
  rob: ['🦹 Vol', 'Tente de voler un membre : 40 % de réussite (10-20 % de ses coins). Si tu rates, tu lui payes une amende !', '`/rob @membre`', '`/rob @Millionnaire` → 🚓 Raté ! Tu lui dois 15 % de ton solde.'],
  lockdown: ['🚨 Anti-raid', 'Verrouille tous les salons texte en 1 clic (personne ne peut écrire sauf les admins) puis rouvre tout. Idéal contre un raid.', '`/lockdown on` · `/lockdown off`', '`/lockdown on` → 🔒 12 salons verrouillés'],
  voicetemp: ['🔊 Salons vocaux temporaires', 'Un salon « ➕ Créer un vocal » : dès qu\'un membre le rejoint, un salon à son nom est créé, et il est supprimé automatiquement quand il est vide.', '`/voicetemp set` (avec salon + catégorie) · `/voicetemp view` · `/voicetemp off`'],
  apply: ['📝 Candidatures', 'Les membres cliquent sur un bouton, répondent à TES questions dans une fenêtre, et leurs réponses arrivent dans un salon avec des boutons Accepter/Refuser pour le staff.', '`/apply set #salon` · `/apply question ta question` (max 5) · `/apply panel` · `/apply view` · `/apply off`', '`/apply set #candidatures` puis `/apply question Quel âge as-tu ?` puis `/apply panel`'],
};

// ============================================================
// Gestion des interactions
// ============================================================
async function handleInteraction(botId, entry, interaction) {
  try {
    if (interaction.isChatInputCommand()) return await handleSlash(botId, entry, interaction);
    if (interaction.isButton()) return await handleButton(botId, entry, interaction);
    if (interaction.isModalSubmit()) return await handleModal(botId, entry, interaction);
  } catch (e) {
    console.error('[Hoxera] extra interaction error:', e.message);
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Une erreur est survenue, réessaie.', ephemeral: true });
      }
    } catch {}
  }
  return false;
}

// ---------------------- Commandes slash ----------------------
const EXTRA_CMDS = new Set(['marry', 'divorce', 'couple', 'hug', 'kiss', 'slap', 'pat', 'punch', 'rps', 'pendu', 'morpion', 'birthday', 'remind', 'poll', 'snipe', 'work', 'gamble', 'rob', 'lockdown', 'voicetemp', 'apply']);

async function handleSlash(botId, entry, interaction) {
  const cmd = interaction.commandName.toLowerCase();
  if (!EXTRA_CMDS.has(cmd)) return false;
  // 🌍 Commandes globales : elles existent aussi en message privé.
  // Ici on répond poliment et on invite à ajouter le bot sur un serveur.
  if (!interaction.guild) {
    return interaction.reply({
      content: '🌍 Cette commande fonctionne sur un **serveur Discord**. Ajoute-moi à ton serveur avec `/invite` pour l\'utiliser !',
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
        return interaction.reply({ content: target && target.id === user.id ? '💍 Tu ne peux pas te marier avec toi-même… même si tu t\'aimes beaucoup 😅' : '❓ Mentionne un membre valide.', ephemeral: true });
      }
      const cur = store.marriages.get(botId, guild.id, user.id);
      if (cur) return interaction.reply({ content: `💍 Tu es déjà marié(e) avec <@${cur.user_a === user.id ? cur.user_b : cur.user_a}> ! Divorce d\'abord si tu veux changer.`, ephemeral: true });
      const targetCur = store.marriages.get(botId, guild.id, target.id);
      if (targetCur) return interaction.reply({ content: `💍 ${target} est déjà marié(e)… dommage !`, ephemeral: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hx:marry:${guild.id}:a:${user.id}:${target.id}`).setLabel('💍 Accepter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`hx:marry:${guild.id}:r:${user.id}:${target.id}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
      );
      await interaction.reply({
        content: `💍 **${target}**, ${user} te demande en mariage !\nUne belle histoire commence peut-être… clique sur ton choix :`,
        components: [row],
      });
      return true;
    }
    case 'divorce': {
      const cur = store.marriages.get(botId, guild.id, user.id);
      if (!cur) return interaction.reply({ content: '💔 Tu n\'es pas marié(e) sur ce serveur.', ephemeral: true });
      const other = cur.user_a === user.id ? cur.user_b : cur.user_a;
      store.marriages.remove(botId, guild.id, cur.user_a, cur.user_b);
      return interaction.reply({ content: `💔 ${user} et <@${other}> ont divorcé… le serveur verse une petite larme.` });
    }
    case 'couple': {
      const target = interaction.options.getUser('membre') || user;
      const cur = store.marriages.get(botId, guild.id, target.id);
      if (!cur) {
        return interaction.reply({ content: target.id === user.id ? '💑 Tu es célibataire ! Demande quelqu\'un en mariage avec `/marry @membre` 💍' : `💑 ${target} est célibataire.` });
      }
      const other = cur.user_a === target.id ? cur.user_b : cur.user_a;
      const d = cur.date ? new Date(cur.date.replace(' ', 'T') + 'Z') : null;
      const dateStr = d && !isNaN(d) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'récemment';
      const embed = new EmbedBuilder()
        .setColor('#EB459E')
        .setTitle(`💍 Couple de ${target.username}`)
        .setDescription(`${target} ❤️ <@${other}>`)
        .setFooter({ text: `Mariés depuis le ${dateStr}` });
      return interaction.reply({ embeds: [embed] });
    }
    case 'hug': case 'kiss': case 'slap': case 'pat': case 'punch': {
      const target = interaction.options.getUser('membre');
      if (!target || target.id === user.id) return interaction.reply({ content: '❓ Mentionne un membre (autre que toi).', ephemeral: true });
      const text = rand(ACTION_TEXTS[cmd]).replace('{a}', `<@${user.id}>`).replace('{b}', `<@${target.id}>`);
      return interaction.reply({ content: text });
    }
    // ---------------- Jeux ----------------
    case 'rps': {
      const move = interaction.options.getString('choix');
      const botMove = rand(RPS_MOVES);
      let result;
      if (move === botMove) result = `Égalité ! ${RPS_EMOJI[move]} contre ${RPS_EMOJI[botMove]} — on refait ?`;
      else if (RPS_WINS[move] === botMove) result = `Tu gagnes ! ${RPS_EMOJI[move]} bat ${RPS_EMOJI[botMove]} 🏆`;
      else result = `Je gagne ! ${RPS_EMOJI[botMove]} bat ${RPS_EMOJI[move]} 😎`;
      return interaction.reply({ content: `🪨🍃✂️ **${user.username}** joue ${RPS_EMOJI[move]} **${move}**…\nMoi je joue ${RPS_EMOJI[botMove]} **${botMove}** !\n\n${result}` });
    }
    case 'pendu': {
      const word = rand(PENDU_WORDS);
      const shown = word.split('').map(() => '⬜').join(' ');
      const state = { word, guessed: new Set(), lives: 8, playerId: user.id };
      const msg = await interaction.reply({
        content: `🪢 **Pendu** — ${user}, devine le mot !\n\n${shown}\n\nVies : ${'❤️'.repeat(8)}`,
        components: letterRows(guild.id),
        fetchReply: true,
      });
      penduGames.set(`${guild.id}:${msg.id}`, state);
      return true;
    }
    case 'morpion': {
      const target = interaction.options.getUser('adversaire');
      if (!target || target.bot || target.id === user.id) return interaction.reply({ content: '❓ Mentionne un membre (autre que toi) comme adversaire.', ephemeral: true });
      const state = { board: Array(9).fill(null), turn: user.id, p1: user.id, p2: target.id, over: false, symbols: { } };
      state.symbols[user.id] = '❌';
      state.symbols[target.id] = '⭕';
      const msg = await interaction.reply({
        content: `⭕❌ **Morpion** : ${user} (❌) contre ${target} (⭕)\n\nAu tour de ${user} !`,
        components: boardRows(guild.id, state),
        fetchReply: true,
      });
      morpionGames.set(`${guild.id}:${msg.id}`, state);
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
        return interaction.reply({ content: `🎂 Enregistré ! Je te souhaiterai ton anniversaire le **${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}** 🎉` });
      }
      if (action === 'remove') {
        store.birthdays.remove(botId, guild.id, user.id);
        return interaction.reply({ content: '🗑️ Ton anniversaire a été retiré de ma liste.', ephemeral: true });
      }
      const list = store.birthdays.all(botId, guild.id);
      if (!list.length) return interaction.reply({ content: '🎂 Personne n\'a encore enregistré son anniversaire ! Fais-le avec `/birthday set jour mois`.', ephemeral: true });
      const now = new Date();
      const sorted = list.map((b) => {
        let d = new Date(Date.UTC(now.getUTCFullYear(), b.month - 1, b.day));
        if (d < new Date(now.toISOString().slice(0, 10))) d = new Date(Date.UTC(now.getUTCFullYear() + 1, b.month - 1, b.day));
        return { ...b, next: d };
      }).sort((a, b) => a.next - b.next).slice(0, 10);
      const lines = sorted.map((b, i) => `${i === 0 ? '🎂' : '📅'} <@${b.user_id}> — le **${String(b.day).padStart(2, '0')}/${String(b.month).padStart(2, '0')}**${i === 0 ? ' *(le prochain !)*' : ''}`);
      const embed = new EmbedBuilder().setColor('#FEE75C').setTitle('🎂 Anniversaires du serveur').setDescription(lines.join('\n') || 'Aucun');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    case 'remind': {
      const duree = interaction.options.getString('duree') || '';
      const texte = interaction.options.getString('texte') || '';
      const ms = parseDuration(duree);
      if (!ms) return interaction.reply({ content: '❓ Durée invalide. Exemples : `10m` (minutes), `2h` (heures), `1d` (jours).', ephemeral: true });
      if (ms > 30 * 86400000) return interaction.reply({ content: '⏰ Max 30 jours pour un rappel.', ephemeral: true });
      if (store.reminders.userCount(user.id) >= 10) return interaction.reply({ content: '⏰ Tu as déjà 10 rappels en attente, attends qu\'ils partent.', ephemeral: true });
      store.reminders.add(botId, guild.id, interaction.channel.id, user.id, Date.now() + ms, texte.slice(0, 300));
      return interaction.reply({ content: `⏰ C\'est noté ! Je te rappellerai **${formatDuration(ms)}** en message privé.`, ephemeral: true });
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
      return true;
    }
    case 'snipe': {
      const key = `${guild.id}:${interaction.channel.id}`;
      const s = snipeCache.get(key);
      if (!s) return interaction.reply({ content: '🕵️ Aucun message supprimé récemment dans ce salon.', ephemeral: true });
      const minutes = Math.max(1, Math.floor((Date.now() - s.ts) / 60000));
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setAuthor(s.avatar ? { name: s.tag, iconURL: s.avatar } : { name: s.tag })
        .setDescription(s.content || (s.attachments ? `*${s.attachments} pièce(s) jointe(s)*` : '*Message vide*'))
        .setFooter({ text: `Supprimé il y a ~${minutes} min` });
      return interaction.reply({ embeds: [embed] });
    }
    // ---------------- Économie enrichie ----------------
    case 'work': {
      const key = `work_${guild.id}_${user.id}`;
      const last = Number(store.settings.get(key)) || 0;
      const cooldown = 3600000;
      if (Date.now() - last < cooldown) {
        const wait = Math.ceil((cooldown - (Date.now() - last)) / 60000);
        return interaction.reply({ content: `💼 Tu es fatigué ! Reviens dans **${wait} min** pour retravailler.`, ephemeral: true });
      }
      const job = rand([
        ['🧑‍🍳', 'tu as cuisiné un festin'], ['👨‍💻', 'tu as codé un site web'], ['🧹', 'tu as nettoyé tout le salon'],
        ['🎨', 'tu as peint un chef-d\'œuvre'], ['🚚', 'tu as livré des colis'], ['🎤', 'tu as chanté au karaoké'],
      ]);
      const gain = 50 + Math.floor(Math.random() * 101);
      store.economy.ensure(botId, guild.id, user.id);
      store.economy.add(botId, guild.id, user.id, gain);
      store.settings.set(key, String(Date.now()));
      return interaction.reply({ content: `💼 ${job[0]} **${job[1]}** → tu gagnes **${gain} coins** ! 🪙` });
    }
    case 'gamble': {
      const amount = interaction.options.getInteger('montant');
      if (!amount || amount <= 0) return interaction.reply({ content: '❓ Mise un montant positif : `/gamble 100`.', ephemeral: true });
      store.economy.ensure(botId, guild.id, user.id);
      const row = store.economy.get(botId, guild.id, user.id);
      if (row.coins < amount) return interaction.reply({ content: `❌ Il te manque **${amount - row.coins}** coins (tu as ${row.coins}).`, ephemeral: true });
      const win = Math.random() < 0.5;
      if (win) {
        store.economy.add(botId, guild.id, user.id, amount);
        return interaction.reply({ content: `🎰 **JACKPOT !** Tu doubles ta mise : **+${amount} coins** ! (nouveau solde : ${row.coins + amount})` });
      }
      store.economy.add(botId, guild.id, user.id, -amount);
      return interaction.reply({ content: `🎰 Raté… tu perds **${amount} coins**. (solde : ${row.coins - amount})` });
    }
    case 'rob': {
      const target = interaction.options.getUser('membre');
      if (!target || target.id === user.id) return interaction.reply({ content: '❓ Choisis une cible (autre que toi).', ephemeral: true });
      const key = `rob_${guild.id}_${user.id}`;
      const last = Number(store.settings.get(key)) || 0;
      if (Date.now() - last < 600000) {
        const wait = Math.ceil((600000 - (Date.now() - last)) / 60000);
        return interaction.reply({ content: `🦹 La police te cherche encore… attends **${wait} min**.`, ephemeral: true });
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
        return interaction.reply({ content: `🦹 Nuit réussie ! Tu voles **${stolen} coins** à ${target} 😈` });
      }
      const fine = Math.max(10, Math.floor(me.coins * 0.15));
      store.economy.add(botId, guild.id, user.id, -fine);
      store.economy.add(botId, guild.id, target.id, fine);
      return interaction.reply({ content: `🚓 **Raté !** ${target} t'a surpris et te réclame **${fine} coins** de dédommagement…` });
    }
    // ---------------- Modération / organisation ----------------
    case 'lockdown': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const action = interaction.options.getString('action');
      const lockdown = require('./lockdown');
      if (action === 'on') {
        const res = await lockdown.on(botId, guild, member.user.tag);
        if (res.already) return interaction.reply({ content: '🔒 Le serveur est déjà verrouillé. `/lockdown off` pour rouvrir.', ephemeral: true });
        return interaction.reply({ content: `🚨 **Serveur verrouillé !** ${res.channels} salon(s) sont en lecture seule. Rouvre avec \`/lockdown off\`` });
      }
      const res = await lockdown.off(botId, guild, member.user.tag);
      if (!res.reopened) return interaction.reply({ content: '🔓 Le serveur n\'est pas verrouillé.', ephemeral: true });
      return interaction.reply({ content: `🔓 **Serveur rouvert !** ${res.reopened} salon(s) sont de nouveau ouverts.` });
    }
    case 'voicetemp': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const action = interaction.options.getString('action');
      if (action === 'off') {
        store.voicetemp.remove(botId, guild.id);
        return interaction.reply({ content: '🔊 Salons vocaux temporaires désactivés.', ephemeral: true });
      }
      if (action === 'view') {
        const cfg = store.voicetemp.get(botId, guild.id);
        if (!cfg || !cfg.creator_channel) return interaction.reply({ content: '🔊 Non configuré. Utilise `/voicetemp set` avec le salon de création et la catégorie.', ephemeral: true });
        return interaction.reply({ content: `🔊 **Configuration actuelle**\nSalon de création : <#${cfg.creator_channel}>\nCatégorie : <#${cfg.category || 'aucune'}>\nNom : \`${cfg.name_template || '🔊 {name}'}\``, ephemeral: true });
      }
      const salon = interaction.options.getChannel('salon');
      const categorie = interaction.options.getChannel('categorie');
      if (!salon || salon.type !== ChannelType.GuildVoice) return interaction.reply({ content: '❓ Choisis un **salon vocal** comme salon « ➕ Créer un vocal » : `/voicetemp set #vocal #catégorie`.', ephemeral: true });
      store.voicetemp.set(botId, guild.id, {
        creator_channel: salon.id,
        category: categorie ? categorie.id : (salon.parentId || ''),
      });
      return interaction.reply({ content: `🔊 **Activé !** Quand un membre rejoint ${salon}, un salon vocal à son nom est créé (et supprimé quand il est vide).` });
    }
    case 'apply': {
      if (!isAdmin(member)) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const action = interaction.options.getString('action');
      const cfg = store.applications.get(botId, guild.id) || { channel: '', questions: '[]', title: '📝 Candidature', enabled: 0 };
      const questions = (() => { try { return JSON.parse(cfg.questions || '[]'); } catch { return []; } })();
      if (action === 'set') {
        const salon = interaction.options.getChannel('salon');
        if (!salon || !salon.isTextBased()) return interaction.reply({ content: '❓ Choisis le **salon texte** où arriveront les candidatures.', ephemeral: true });
        store.applications.set(botId, guild.id, { ...cfg, channel: salon.id, questions: cfg.questions, enabled: 1 });
        return interaction.reply({ content: `📝 **Candidatures activées !** Les réponses arriveront dans ${salon}.\nAjoute tes questions avec \`/apply question\` puis envoie le panneau avec \`/apply panel\`.` });
      }
      if (action === 'question') {
        const texte = interaction.options.getString('texte');
        if (!texte || !texte.trim()) return interaction.reply({ content: '❓ Écris la question : `/apply question Quel âge as-tu ?`', ephemeral: true });
        if (questions.length >= 5) return interaction.reply({ content: '❌ Maximum 5 questions.', ephemeral: true });
        questions.push(texte.trim().slice(0, 45));
        store.applications.set(botId, guild.id, { ...cfg, questions: JSON.stringify(questions) });
        return interaction.reply({ content: `✅ Question ajoutée (${questions.length}/5) : « ${texte.trim().slice(0, 45)} »`, ephemeral: true });
      }
      if (action === 'view') {
        return interaction.reply({
          content: `📝 **Candidatures**\nSalon : ${cfg.channel ? `<#${cfg.channel}>` : '❌ non défini'}\nQuestions (${questions.length}/5) :\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n') || '*aucune*'}\n\nEnvoie le panneau avec \`/apply panel\``,
          ephemeral: true,
        });
      }
      if (action === 'off') {
        store.applications.set(botId, guild.id, { ...cfg, enabled: 0 });
        return interaction.reply({ content: '📝 Candidatures désactivées.', ephemeral: true });
      }
      // panel
      if (!cfg.channel) return interaction.reply({ content: '❓ Définis d\'abord le salon : `/apply set #salon`.', ephemeral: true });
      if (!questions.length) return interaction.reply({ content: '❓ Ajoute au moins une question : `/apply question ta question`.', ephemeral: true });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hx:apply:${guild.id}`).setLabel('📝 Faire une candidature').setStyle(ButtonStyle.Primary),
      );
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(cfg.title || '📝 Candidature')
        .setDescription(`Clique sur le bouton pour candidater : tu répondras à **${questions.length} question(s)** dans une fenêtre privée.`)
        .setFooter({ text: 'Seul le staff verra tes réponses.' });
      await interaction.reply({ embeds: [embed], components: [row] });
      return true;
    }
  }
  return false;
}

// ---------------------- Boutons ----------------------
async function handleButton(botId, entry, interaction) {
  const id = interaction.customId || '';
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
        return interaction.reply({ content: '💍 Cette demande ne t\'est pas adressée !', ephemeral: true });
      }
      const cur = store.marriages.get(botId, guild.id, from) || store.marriages.get(botId, guild.id, to);
      if (cur) return interaction.reply({ content: '💍 L\'un de vous est déjà marié…', ephemeral: true });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hx:done').setLabel(choice === 'a' ? '💍 Accepté !' : '💔 Refusé').setStyle(choice === 'a' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true),
      );
      if (choice === 'a') {
        store.marriages.set(botId, guild.id, from, to);
        await interaction.update({ content: `🎉 **Félicitations ${user} et <@${from}> !**\nVous êtes désormais mariés sur ce serveur 💍❤️\n*${rand(MARRIED_POINTS)} ${guild.name} compte ${store.marriages.count(botId, guild.id)} couple(s)*`, components: [row] });
      } else {
        await interaction.update({ content: `💔 ${user} a refusé la demande de <@${from}>… ce n\'est que partie remise !`, components: [row] });
      }
      return true;
    }
    case 'rps': break;
    case 'pendu': {
      const gid = parts[2], letter = (parts[3] || '').toLowerCase();
      const key = `${gid}:${interaction.message.id}`;
      const state = penduGames.get(key);
      if (!state) return interaction.reply({ content: '🪢 Cette partie est terminée.', ephemeral: true });
      if (user.id !== state.playerId) return interaction.reply({ content: '🪢 Ce n\'est pas ta partie ! Lance la tienne avec `/pendu`.', ephemeral: true });
      if (state.guessed.has(letter)) return interaction.reply({ content: `Tu as déjà essayé « ${letter.toUpperCase()} » !`, ephemeral: true });
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
      if (over) {
        penduGames.delete(key);
        await interaction.update({ content, components: [] });
      } else {
        await interaction.update({ content, components: letterRows(guild.id) });
      }
      return true;
    }
    case 'morpion': {
      const gid = parts[2], cell = parseInt(parts[3], 10);
      const key = `${gid}:${interaction.message.id}`;
      const state = morpionGames.get(key);
      if (!state || state.over) return interaction.reply({ content: '⭕ Cette partie est terminée.', ephemeral: true });
      if (user.id !== state.turn) return interaction.reply({ content: '⏳ Ce n\'est pas ton tour !', ephemeral: true });
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
      await interaction.update({ content, components: state.over ? boardRows(guild.id, state, true) : boardRows(guild.id, state) });
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
          await applicant.send({ content: `🎉 **Bonne nouvelle !** Ta candidature sur **${guild.name}** a été **acceptée** par ${user.tag}.` }).catch(() => {});
        } catch {}
      } else {
        await interaction.update({
          embeds: [EmbedBuilder.from(emb).setColor('#ED4245').setFooter({ text: `❌ Refusée par ${user.tag}` })],
          components: [],
        });
        try {
          const applicant = await guild.members.fetch(applicantId);
          await applicant.send({ content: `😔 Ta candidature sur **${guild.name}** a été **refusée**. Tu peux retenter plus tard !` }).catch(() => {});
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
  if (!channel) return interaction.reply({ content: '📝 Le salon des candidatures a été supprimé. Préviens un admin !', ephemeral: true });

  const authorAvatar = interaction.user.displayAvatarURL ? interaction.user.displayAvatarURL({ size: 128 }) : '';
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
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

function pollEmbed(question, choices, votes) {
  const total = votes.size || 1;
  const counts = choices.map(() => 0);
  for (const idx of votes.values()) counts[idx] = (counts[idx] || 0) + 1;
  const lines = choices.map((c, i) => {
    const pct = Math.round((counts[i] / total) * 100);
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return `${['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'][i]} **${c}**\n${bar} **${pct}%** (${counts[i]} vote${counts[i] > 1 ? 's' : ''})`;
  });
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(`🗳️ ${question}`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `${votes.size} vote(s) — clique sur un bouton pour voter (re-clique pour annuler)` });
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
        try { await newState.member.send('🔊 Trop de salons vocaux ouverts (max 10). Rejoins-en un existant !').catch(() => {}); } catch {}
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
      }
    }
  } catch (e) {
    console.error('[Hoxera] voicetemp error:', e.message);
  }
}

// ---------------------- Tâches périodiques (appelées depuis tasks.js) ----------------------
async function sweepReminders(botId, entry) {
  const due = store.reminders.due(Date.now()).filter((r) => r.bot_id === botId);
  for (const r of due) {
    try {
      const user = await entry.client.users.fetch(r.user_id).catch(() => null);
      const sent = user && await user.send({ content: `⏰ **Rappel** : ${r.text}` }).then(() => true).catch(() => false);
      if (!sent) {
        const guild = entry.client.guilds.cache.get(r.guild_id);
        const channel = guild && r.channel_id ? guild.channels.cache.get(r.channel_id) : null;
        if (channel) await channel.send({ content: `⏰ <@${r.user_id}>, ton rappel : ${r.text}` }).catch(() => {});
      }
    } catch (e) { console.error('[Hoxera] reminder error:', e.message); }
    store.reminders.remove(r.id);
  }
}

function sweepScheduled(botId, entry) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // 1 = lundi … 7 = dimanche
  const dow = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  for (const s of store.scheduled.allEnabled()) {
    if (s.bot_id !== botId) continue;
    if (s.last_sent === today) continue;
    const days = String(s.days || '').split(',').map((x) => parseInt(x.trim(), 10)).filter(Boolean);
    if (!days.includes(dow)) continue;
    if (s.hour !== hour || s.minute !== minute) continue;
    const guild = entry.client.guilds.cache.get(s.guild_id);
    const channel = guild ? guild.channels.cache.get(s.channel_id) : null;
    if (channel) {
      channel.send({ content: s.text }).catch(() => {});
      store.scheduled.update(s.id, { last_sent: today });
    }
  }
}

async function sweepBirthdays(botId, entry) {
  const today = new Date();
  const keyDate = `${botId}`;
  if (!store.birthdays.celebrated.isNewDay(keyDate)) return;
  // Retire le rôle anniversaire des fêtés d'hier
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const guild of entry.client.guilds.cache.values()) {
      const gs = store.guildSettings.get(botId, guild.id) || {};
      if (!gs.birthday_role) continue;
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
  const day = today.getUTCDate();
  const month = today.getUTCMonth() + 1;
  for (const b of store.birthdays.today(day, month)) {
    try {
      const guild = entry.client.guilds.cache.get(b.guild_id);
      if (!guild) continue;
      const gs = store.guildSettings.get(botId, b.guild_id) || {};
      const member = await guild.members.fetch(b.user_id).catch(() => null);
      if (!member) continue;
      const channel = gs.birthday_channel ? (guild.channels.cache.get(gs.birthday_channel) || guild.channels.cache.find((c) => c.name.toLowerCase() === String(gs.birthday_channel).toLowerCase())) : null;
      if (channel) {
        await channel.send({ content: `🎂🎉 **Joyeux anniversaire ${member} !** On te souhaite une superbe journée ! 🥳🎁` }).catch(() => {});
      }
      if (gs.birthday_role) {
        const role = guild.roles.cache.get(gs.birthday_role) || guild.roles.cache.find((r) => r.name.toLowerCase() === String(gs.birthday_role).toLowerCase());
        if (role && guild.members.me && role.position < guild.members.me.roles.highest.position) {
          await member.roles.add(role).catch(() => {});
          const key = `bday_role_${guild.id}_${today.toISOString().slice(0, 10)}`;
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

module.exports = {
  buildExtraPayloads,
  handleInteraction,
  trackDeleted,
  trackMessage,
  onVoiceState,
  sweepReminders,
  sweepScheduled,
  sweepBirthdays,
  parseDuration,
  formatDuration,
  HELP_EXTRA,
};
