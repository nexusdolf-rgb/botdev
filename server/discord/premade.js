// ============================================================
// BotDev - Commandes pré-faites (modules activables en 1 clic)
// ============================================================
const { EmbedBuilder, ApplicationCommandOptionType, PermissionsBitField } = require('discord.js');
const { xpForLevel, levelFromXp, resolveRole } = require('./xp');
const logging = require('./logging');
const suggestEngine = require('./suggest');
const giveawayEngine = require('./giveaway');
const tasks = require('./tasks');
const store = require('../db');
const ui = require('./ui');
const { canConfigureGuild } = require('./permissions');

const MODULES = {
  moderation: {
    label: 'Modération', emoji: '🛡️', description: 'Kick, ban, warn, timeout, clear…',
    commands: ['kick', 'ban', 'unban', 'timeout', 'warn', 'warns', 'clear'],
  },
  utility: {
    label: 'Utilitaires', emoji: '🔧', description: 'Ping, avatar, infos serveur et utilisateur…',
    commands: ['ping', 'avatar', 'userinfo', 'serverinfo', 'botinfo', 'help', 'invite', 'lang'],
  },
  fun: {
    label: 'Fun', emoji: '🎉', description: '8ball, meme, pile ou face, dés, say…',
    commands: ['8ball', 'meme', 'coinflip', 'roll', 'say', 'reverse'],
  },
  economy: {
    label: 'Économie', emoji: '💰', description: 'Coins, daily, classement…',
    commands: ['daily', 'balance', 'leaderboard'],
  },
  levels: {
    label: 'Niveaux', emoji: '📈', description: 'XP en discutant, niveau, classement…',
    commands: ['rank', 'levels', 'profile'],
  },
  community: {
    label: 'Communauté', emoji: '🎉', description: 'Giveaways, suggestions, boutique, rôles temporaires, sanctions…',
    commands: ['giveaway', 'suggest', 'suggestions', 'shop', 'buy', 'pay', 'temprole', 'sanction'],
  },
};

const CMD_DEFS = {
  ping: { label: 'ping', desc: 'Latence du bot' },
  avatar: { label: 'avatar', desc: 'Affiche l\'avatar d\'un utilisateur' },
  userinfo: { label: 'userinfo', desc: 'Informations sur un utilisateur' },
  serverinfo: { label: 'serverinfo', desc: 'Informations sur le serveur' },
  botinfo: { label: 'botinfo', desc: 'Informations sur le bot' },
  help: { label: 'help', desc: 'Liste des commandes activées' },
  '8ball': { label: '8ball', desc: 'La boule magique répond à ta question' },
  meme: { label: 'meme', desc: 'Un meme aléatoire' },
  coinflip: { label: 'coinflip', desc: 'Pile ou face' },
  roll: { label: 'roll', desc: 'Lance un dé' },
  // 🔐 /say fait parler le bot : réservé au propriétaire / administrateurs
  // (défini à l'enregistrement + vérifié à l'exécution + message de refus propre)
  say: { label: 'say', desc: 'Répète ton message (réservé aux admins)', perms: [PermissionsBitField.Flags.Administrator] },
  reverse: { label: 'reverse', desc: 'Inverse ton texte' },
  profile: { label: 'profile', desc: 'Carte de profil d\'un membre' },
  kick: { label: 'kick', desc: 'Expulse un membre', perms: [PermissionsBitField.Flags.KickMembers] },
  ban: { label: 'ban', desc: 'Bannit un membre', perms: [PermissionsBitField.Flags.BanMembers] },
  unban: { label: 'unban', desc: 'Débannit un utilisateur', perms: [PermissionsBitField.Flags.BanMembers] },
  timeout: { label: 'timeout', desc: 'Met un membre en timeout', perms: [PermissionsBitField.Flags.ModerateMembers] },
  warn: { label: 'warn', desc: 'Avertit un membre', perms: [PermissionsBitField.Flags.ModerateMembers] },
  // 🔐 /warns liste les avertissements de N'IMPORTE QUEL membre : c'est une
  // lecture réservée au staff (même permission que /warn). Sans cette
  // restriction, n'importe qui pourrait consulter le casier de tout le monde.
  warns: { label: 'warns', desc: 'Liste les avertissements d\'un membre (staff)', perms: [PermissionsBitField.Flags.ModerateMembers] },
  clear: { label: 'clear', desc: 'Supprime des messages', perms: [PermissionsBitField.Flags.ManageMessages] },
  daily: { label: 'daily', desc: 'Récupère tes coins quotidiens' },
  balance: { label: 'balance', desc: 'Affiche ton solde de coins' },
  leaderboard: { label: 'leaderboard', desc: 'Classement des coins' },
  rank: { label: 'rank', desc: 'Ton niveau, ton XP et ton rang' },
  levels: { label: 'levels', desc: 'Le classement des niveaux du serveur' },
  invite: { label: 'invite', desc: 'Le lien pour inviter le bot' },
  lang: { label: 'lang', desc: 'Choisis la langue du bot sur ce serveur (fr, en, es, de, pt, it)', perms: [PermissionsBitField.Flags.Administrator] },
  giveaway: { label: 'giveaway', desc: 'Lancer un giveaway avec tirage automatique', perms: [PermissionsBitField.Flags.Administrator] },
  suggest: { label: 'suggest', desc: 'Proposer une suggestion (votes 👍👎)' },
  suggestions: { label: 'suggestions', desc: 'Configurer le salon des suggestions', perms: [PermissionsBitField.Flags.Administrator] },
  shop: { label: 'shop', desc: 'Voir la boutique du serveur' },
  buy: { label: 'buy', desc: 'Acheter un article avec tes coins' },
  pay: { label: 'pay', desc: 'Transférer des coins à un membre' },
  temprole: { label: 'temprole', desc: 'Donner un rôle temporaire', perms: [PermissionsBitField.Flags.ManageRoles] },
  sanction: { label: 'sanction', desc: 'Appliquer une sanction prédéfinie', perms: [PermissionsBitField.Flags.ModerateMembers] },
};

// ============================================================
// 🗂️ Visibilité des commandes (v226) — tri par public visé.
//
// Chaque commande appartient à UNE classe :
//   - 'public' : visible par tous, aucune restriction à l'enregistrement ;
//   - 'staff'  : modération — le membre doit avoir la permission Discord
//                « métier » du module (KickMembers, BanMembers,
//                ModerateMembers, ManageMessages, ManageRoles) ;
//   - 'admin'  : configuration — propriétaire du serveur ou permission
//                Administrateur (règle centrale `canConfigureGuild`).
//
// Cette classification alimente à la fois l'enregistrement Discord
// (`default_member_permissions`) et l'affichage du centre d'aide /help,
// pour que les commandes staff restent invisibles aux non-staff partout.
// ============================================================

// Commandes de configuration enregistrées hors CMD_DEFS (payloads dédiés)
const ADMIN_COMMAND_NAMES = new Set([
  'ticket', 'botprofile', 'modlogs', 'blacklist', 'roles',
  'lockdown', 'voicetemp', 'apply', 'event',
]);

function defaultPermissionBitsFor(def) {
  const perms = (def && def.perms) || [];
  if (!perms.length) return null;
  const flags = perms.map((p) => BigInt(p));
  const admin = BigInt(PermissionsBitField.Flags.Administrator);
  if (flags.includes(admin)) return admin; // commande de configuration → Administrateur
  return flags.reduce((a, b) => a | b, 0n); // permission « métier » exacte
}

function commandKind(name) {
  const def = CMD_DEFS[name];
  if (def) {
    if (def.perms && def.perms.length) {
      return def.perms.some((p) => String(p) === String(PermissionsBitField.Flags.Administrator)) ? 'admin' : 'staff';
    }
    return 'public';
  }
  return ADMIN_COMMAND_NAMES.has(name) ? 'admin' : 'public';
}

// Un membre peut-il utiliser cette commande ? (miroir exact de la garde
// d'exécution : même classe, mêmes permissions que hasPremadeCommandPermission.)
function canViewCommandName(name, guild, member) {
  // Sans contexte serveur/membre (aperçus internes, dashboard), on affiche
  // tout : impossible de filtrer, mieux vaut montrer le catalogue complet.
  if (!guild || !member) return true;
  const kind = commandKind(name);
  if (kind === 'public') return true;
  if (kind === 'admin') return canConfigureGuild(guild, member, member && member.id);
  return hasPremadeCommandPermission(CMD_DEFS[name], guild, member);
}

// Blocs du centre d'aide, dans l'ordre : tout le monde → staff → admins.
const HELP_BLOCKS = [
  // --- Tout le monde ---
  { title: '🧰 Utilitaires', names: ['ping', 'avatar', 'userinfo', 'serverinfo', 'botinfo', 'help', 'invite'] },
  { title: '🎉 Fun & divertissement', names: ['8ball', 'meme', 'coinflip', 'roll', 'reverse'] },
  { title: '💍 Social & interactions', names: ['marry', 'divorce', 'couple', 'hug', 'kiss', 'slap', 'pat', 'punch'] },
  { title: '🕹️ Jeux dans le chat', names: ['rps', 'pendu', 'morpion', 'quiz'] },
  { title: '🗓️ Organisation & pratique', names: ['birthday', 'remind', 'afk', 'poll', 'snipe', 'top', 'invites'] },
  { title: '📈 Niveaux & XP', names: ['rank', 'levels', 'profile'] },
  { title: '💰 Économie & boutique', names: ['daily', 'balance', 'leaderboard', 'work', 'gamble', 'rob', 'pay', 'shop', 'buy'] },
  { title: '💡 Communauté', names: ['suggest'] },
  // --- Modération (permissions métier) ---
  { title: '🛡️ Modération & sanctions (staff)', kind: 'staff', names: ['kick', 'ban', 'unban', 'timeout', 'warn', 'warns', 'clear', 'sanction', 'temprole'] },
  // --- Administration (propriétaire / Administrateur) ---
  { title: '🎫 Tickets & menus de rôles', kind: 'admin', names: ['ticket', 'roles'] },
  { title: '🤖 Personnalisation du serveur', kind: 'admin', names: ['botprofile', 'modlogs', 'blacklist'] },
  // Aide historique : « 🎮 Événements & tournois (admins) » — le bloc actuel
  // regroupe aussi la sécurité (lockdown) et les vocaux temporaires.
  { title: '🚨 Sécurité & événements', kind: 'admin', names: ['lockdown', 'voicetemp', 'apply', 'event'] },
  { title: '⚙️ Configuration avancée', kind: 'admin', names: ['giveaway', 'suggestions', 'lang', 'say'] },
];

function enabledModules(botId) {
  const m = store.modules.all(botId);
  return Object.keys(MODULES).filter(k => m[k]);
}

function enabledCommandNames(botId) {
  const names = [];
  for (const key of enabledModules(botId)) names.push(...MODULES[key].commands);
  return names;
}

// ---------------------- Payloads slash ----------------------
function buildSlashPayloads(botId) {
  const payloads = [];
  for (const name of enabledCommandNames(botId)) {
    const def = CMD_DEFS[name];
    const options = [];
    if (name === 'lang') {
      options.push({ name: 'langue', description: 'fr · en · es · de · pt · it', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: '🇫🇷 Français', value: 'fr' },
        { name: '🇬🇧 English', value: 'en' },
        { name: '🇪🇸 Español', value: 'es' },
        { name: '🇩🇪 Deutsch', value: 'de' },
        { name: '🇵🇹 Português', value: 'pt' },
        { name: '🇮🇹 Italiano', value: 'it' },
      ]});
    }
    if (['avatar', 'userinfo', 'kick', 'ban', 'timeout', 'warn', 'warns', 'balance', 'rank', 'profile'].includes(name)) {
      options.push({ name: 'utilisateur', description: 'L\'utilisateur ciblé', type: ApplicationCommandOptionType.User, required: ['kick', 'ban', 'timeout', 'warn'].includes(name) });
    }
    // IMPORTANT : Discord exige que les options requises soient placées avant les optionnelles
    if (['timeout'].includes(name)) {
      options.push({ name: 'minutes', description: 'Durée en minutes', type: ApplicationCommandOptionType.Integer, required: true });
    }
    if (['kick', 'ban', 'timeout', 'warn'].includes(name)) {
      options.push({ name: 'raison', description: 'La raison', type: ApplicationCommandOptionType.String, required: false });
    }
    if (['8ball', 'say', 'reverse'].includes(name)) {
      options.push({ name: 'texte', description: 'Ton texte / question', type: ApplicationCommandOptionType.String, required: true });
    }
    if (['clear'].includes(name)) {
      options.push({ name: 'nombre', description: 'Nombre de messages (1-100)', type: ApplicationCommandOptionType.Integer, required: true });
    }
    if (['roll'].includes(name)) {
      options.push({ name: 'max', description: 'Valeur max (défaut 6)', type: ApplicationCommandOptionType.Integer, required: false });
    }
    if (['unban'].includes(name)) {
      options.push({ name: 'identifiant', description: 'ID de l\'utilisateur à débannir', type: ApplicationCommandOptionType.String, required: true });
    }
    if (['help'].includes(name)) {
      options.push({ name: 'commande', description: 'Nom de la commande à détailler (ex : ticket)', type: ApplicationCommandOptionType.String, required: false });
    }
    if (['suggest'].includes(name)) {
      options.push({ name: 'texte', description: 'Ta suggestion', type: ApplicationCommandOptionType.String, required: true });
    }
    if (['shop'].includes(name)) {
      options.push({ name: 'article', description: 'Nom de l\'article à acheter (optionnel : pour voir la boutique, laisse vide)', type: ApplicationCommandOptionType.String, required: false });
    }
    if (['buy'].includes(name)) {
      options.push({ name: 'article', description: 'Nom de l\'article', type: ApplicationCommandOptionType.String, required: true });
    }
    if (['pay'].includes(name)) {
      options.push({ name: 'membre', description: 'Le membre à qui envoyer des coins', type: ApplicationCommandOptionType.User, required: true });
      options.push({ name: 'montant', description: 'Nombre de coins', type: ApplicationCommandOptionType.Integer, required: true });
    }
    if (['temprole'].includes(name)) {
      options.push({ name: 'membre', description: 'Le membre', type: ApplicationCommandOptionType.User, required: true });
      options.push({ name: 'role', description: 'Le rôle temporaire', type: ApplicationCommandOptionType.Role, required: true });
      options.push({ name: 'duree', description: 'Durée (ex : 30m, 2h, 1d)', type: ApplicationCommandOptionType.String, required: true });
    }
    if (['sanction'].includes(name)) {
      options.push({ name: 'membre', description: 'Le membre à sanctionner', type: ApplicationCommandOptionType.User, required: true });
      options.push({ name: 'sanction', description: 'Nom de la sanction prédéfinie', type: ApplicationCommandOptionType.String, required: true });
    }
    if (['giveaway'].includes(name)) {
      options.push({ name: 'action', description: 'Action', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: 'create', value: 'create' }, { name: 'end', value: 'end' }, { name: 'reroll', value: 'reroll' },
      ]});
      options.push({ name: 'duree', description: 'Durée (ex : 30m, 2h, 1d)', type: ApplicationCommandOptionType.String, required: false });
      options.push({ name: 'prix', description: 'Le prix à gagner', type: ApplicationCommandOptionType.String, required: false });
      options.push({ name: 'gagnants', description: 'Nombre de gagnants', type: ApplicationCommandOptionType.Integer, required: false });
      options.push({ name: 'message', description: 'ID du message du giveaway (pour end/reroll)', type: ApplicationCommandOptionType.String, required: false });
    }
    if (['suggestions'].includes(name)) {
      options.push({ name: 'action', description: 'Action', type: ApplicationCommandOptionType.String, required: true, choices: [
        { name: 'set', value: 'set' }, { name: 'off', value: 'off' }, { name: 'view', value: 'view' },
      ]});
      options.push({ name: 'salon', description: 'Salon des suggestions', type: ApplicationCommandOptionType.Channel, required: false });
    }
    const payload = { name, description: def.desc, options };
    // Commandes réservées : visibles uniquement par les membres autorisés.
    // ⚠️ Discord évalue `default_member_permissions` sur le bitfield COMBINÉ
    // du membre : exiger « Administrateur + KickMembers » masquerait /kick à
    // un modérateur qui a KickMembers mais pas Administrateur (pourtant
    // autorisé par la garde d'exécution). On enregistre donc la permission
    // « métier » exacte — les Administrateurs et le propriétaire passent de
    // toute façon côté Discord. Les commandes de configuration (Administrateur
    // dans leurs perms) restent en '8'.
    const bits = defaultPermissionBitsFor(def);
    if (bits !== null) payload.default_member_permissions = bits.toString();
    payloads.push(payload);
  }

  // Commandes personnalisées du bot (slash) — une seule fois chacune
  const custom = store.commands.all(botId).filter(c => c.enabled && c.trigger_type === 'slash');
  for (const c of custom) {
    payloads.push({
      name: c.name.toLowerCase().replace(/[^a-z0-9\-_]/g, '-').slice(0, 32),
      description: (c.description || 'Commande BotDev').slice(0, 100),
      options: JSON.parse(c.options || '[]')
        .slice(0, 25)
        .map(o => ({
          name: (o.name || 'option').toLowerCase().slice(0, 32),
          description: (o.description || '').slice(0, 100),
          type: optionType(o.type),
          required: !!o.required,
        }))
        .sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0)),
    });
  }

  // Commandes de gestion des panneaux (toujours disponibles, admin uniquement)
  payloads.push({
    name: 'ticket',
    description: '🎫 Configurer et gérer le système de tickets',
    default_member_permissions: '8',
    options: [
      { name: 'types', description: 'Gérer les types de tickets : assistant, ajout, suppression, rôles staff multiples', type: ApplicationCommandOptionType.SubcommandGroup, options: [
        { name: 'setup', description: 'Assistant interactif : renommer, emoji, catégorie, PLUSIEURS rôles staff, suppression', type: ApplicationCommandOptionType.Subcommand },
        { name: 'add', description: 'Ajouter ou renommer un type de ticket', type: ApplicationCommandOptionType.Subcommand, options: [
          { name: 'nom', description: 'Nom du type (ex : Candidature staff)', type: ApplicationCommandOptionType.String, required: true },
          { name: 'emoji', description: 'Emoji affiché dans le menu', type: ApplicationCommandOptionType.String, required: false },
          { name: 'description', description: 'Explication affichée sous le type dans le menu', type: ApplicationCommandOptionType.String, required: false },
          { name: 'categorie', description: 'Catégorie dédiée (optionnel)', type: ApplicationCommandOptionType.String, required: false },
          { name: 'staffrole', description: 'Ajoute un rôle staff (pour EN ajouter plusieurs : /ticket types setup)', type: ApplicationCommandOptionType.String, required: false },
        ]},
        { name: 'remove', description: 'Supprimer un type de ticket', type: ApplicationCommandOptionType.Subcommand, options: [
          { name: 'nom', description: 'Nom du type à supprimer', type: ApplicationCommandOptionType.String, required: true },
        ]},
        { name: 'list', description: 'Voir les types de tickets', type: ApplicationCommandOptionType.Subcommand },
      ]},
      { name: 'setup', description: 'Assistant pas à pas : nom → catégorie → salon → rôle staff', type: ApplicationCommandOptionType.Subcommand },
      { name: 'channel', description: 'Définir le salon du panneau de tickets', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'salon', description: 'Le salon où sera envoyé le panneau', type: ApplicationCommandOptionType.Channel, required: true },
      ]},
      { name: 'category', description: 'Définir la catégorie des salons de tickets', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'nom', description: 'Nom de la catégorie', type: ApplicationCommandOptionType.String, required: true },
      ]},
      { name: 'role', description: 'Définir le rôle du staff (accès à tous les tickets)', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'role', description: 'Le rôle staff', type: ApplicationCommandOptionType.Role, required: true },
      ]},
      { name: 'button', description: 'Changer le texte du bouton', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'texte', description: 'Texte du bouton', type: ApplicationCommandOptionType.String, required: true },
      ]},
      { name: 'message', description: 'Changer le message affiché sur le panneau', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'texte', description: 'Message du panneau', type: ApplicationCommandOptionType.String, required: true },
      ]},
      { name: 'panel', description: 'Envoyer le panneau de tickets', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'salon', description: 'Salon (défaut : salon configuré ou salon actuel)', type: ApplicationCommandOptionType.Channel, required: false },
      ]},
      { name: 'config', description: 'Voir la configuration actuelle', type: ApplicationCommandOptionType.Subcommand },
      { name: 'close', description: 'Verrouiller le ticket actuel (réouvrable)', type: ApplicationCommandOptionType.Subcommand },
      { name: 'delete', description: 'Supprimer le ticket — envoie la transcription au créateur', type: ApplicationCommandOptionType.Subcommand },
      { name: 'add', description: 'Autoriser un membre à voir ce ticket', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'membre', description: 'Le membre à ajouter', type: ApplicationCommandOptionType.User, required: true },
      ]},
      { name: 'remove', description: 'Retirer un membre de ce ticket', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'membre', description: 'Le membre à retirer', type: ApplicationCommandOptionType.User, required: true },
      ]},
    ],
  });

  payloads.push({
    name: 'botprofile',
    description: '🤖 Personnaliser l\'identité du bot sur CE serveur',
    default_member_permissions: '8',
    options: [
      { name: 'setup', description: 'Assistant pas à pas : nom → bio → couleur → avatar → bannière', type: ApplicationCommandOptionType.Subcommand },
      { name: 'view', description: 'Voir le profil actuel du bot sur ce serveur', type: ApplicationCommandOptionType.Subcommand },
      { name: 'set', description: 'Définir le nom, la bio et la couleur', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'nom', description: 'Nom affiché par le bot sur ce serveur', type: ApplicationCommandOptionType.String, required: false },
        { name: 'bio', description: 'Bio affichée sur le profil', type: ApplicationCommandOptionType.String, required: false },
        { name: 'couleur', description: 'Couleur du profil (ex : #e07a5f)', type: ApplicationCommandOptionType.String, required: false },
      ]},
      { name: 'avatar', description: 'Choisir un avatar depuis ta galerie', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'image', description: '📱 La galerie s\'ouvre automatiquement — choisis ta photo (3 Mo max)', type: ApplicationCommandOptionType.Attachment, required: true },
      ]},
      { name: 'banner', description: 'Choisir une bannière depuis ta galerie', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'image', description: '📱 La galerie s\'ouvre automatiquement — choisis ta photo (3 Mo max)', type: ApplicationCommandOptionType.Attachment, required: true },
      ]},
      { name: 'reset', description: 'Retirer l\'identité personnalisée de ce serveur', type: ApplicationCommandOptionType.Subcommand },
    ],
  });

  payloads.push({
    name: 'modlogs',
    description: '📋 Journaux de modération (salon de logs)',
    default_member_permissions: '8',
    options: [
      { name: 'set', description: 'Définir le salon des journaux', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'salon', description: 'Salon où seront envoyés les journaux', type: ApplicationCommandOptionType.Channel, required: true },
      ]},
      { name: 'off', description: 'Désactiver les journaux', type: ApplicationCommandOptionType.Subcommand },
      { name: 'view', description: 'Voir le salon des journaux actuel', type: ApplicationCommandOptionType.Subcommand },
    ],
  });

  payloads.push({
    name: 'blacklist',
    description: '🔇 Liste noire de mots interdits',
    default_member_permissions: '8',
    options: [
      { name: 'add', description: 'Interdire un mot (suppression automatique)', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'mot', description: 'Le mot à interdire', type: ApplicationCommandOptionType.String, required: true },
      ]},
      { name: 'remove', description: 'Retirer un mot de la liste', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'mot', description: 'Le mot à retirer', type: ApplicationCommandOptionType.String, required: true },
      ]},
      { name: 'list', description: 'Voir les mots interdits', type: ApplicationCommandOptionType.Subcommand },
    ],
  });

  payloads.push({
    name: 'roles',
    description: '📋 Gérer les menus de rôles',
    default_member_permissions: '8',
    options: [
      { name: 'setup', description: 'Assistant pas à pas : nom → texte → salon → rôles (menus de sélection)', type: ApplicationCommandOptionType.Subcommand },
      { name: 'edit', description: 'Modifier un panneau de rôles existant', type: ApplicationCommandOptionType.Subcommand },
      { name: 'list', description: 'Lister les menus de rôles de ce serveur', type: ApplicationCommandOptionType.Subcommand },
      { name: 'send', description: 'Envoyer un menu de rôles', type: ApplicationCommandOptionType.Subcommand, options: [
        { name: 'numero', description: 'Numéro du menu (voir /roles list)', type: ApplicationCommandOptionType.Integer, required: true },
        { name: 'salon', description: 'Salon (défaut : salon configuré ou salon actuel)', type: ApplicationCommandOptionType.Channel, required: false },
      ]},
    ],
  });

  return payloads;
}

function optionType(t) {
  switch (t) {
    case 'user': return ApplicationCommandOptionType.User;
    case 'channel': return ApplicationCommandOptionType.Channel;
    case 'role': return ApplicationCommandOptionType.Role;
    case 'number': return ApplicationCommandOptionType.Number;
    case 'boolean': return ApplicationCommandOptionType.Boolean;
    default: return ApplicationCommandOptionType.String;
  }
}

function hasPremadeCommandPermission(def, guild, member) {
  if (!def || !def.perms || !def.perms.length) return true;
  // Les commandes déclarées avec Administrator sont des commandes de
  // configuration : propriétaire et Administrator sont autorisés. Les
  // commandes qui demandent une permission métier (Kick, ManageRoles, etc.)
  // restent contrôlées par cette permission précise.
  const administrator = String(PermissionsBitField.Flags.Administrator);
  const isConfigurationCommand = def.perms.some((p) => String(p) === administrator);
  if (isConfigurationCommand && canConfigureGuild(guild, member, member && member.id)) return true;
  return !!(member && member.permissions && typeof member.permissions.has === 'function'
    && member.permissions.has(def.perms));
}

// ---------------------- Gestion préfixe ----------------------
async function handlePremadePrefix(botId, entry, message, cmdName, args) {
  try {
    const enabled = enabledCommandNames(botId);
    const cmd = cmdName.toLowerCase();
    if (!enabled.includes(cmd)) return false;
    const def = CMD_DEFS[cmd];

    if (!hasPremadeCommandPermission(def, message.guild, message.member)) {
      await message.channel.send('⛔ Cette commande est réservée au propriétaire du serveur ou à un membre ayant la permission Discord « Administrateur ».').catch(() => {});
      return true;
    }

    await execute(botId, entry, cmd, { message, args });
    return true;
  } catch (e) {
    // 🛡️ Les commandes préfixe ne plantent jamais non plus
    console.error('[BotDev] commande préfixe :', (e && e.message) || e);
    try { await message.channel.send('⚠️ Une erreur est survenue — elle a été enregistrée.').catch(() => {}); } catch {}
    return true;
  }
}

async function handlePremadeSlash(botId, entry, interaction) {
  try {
    const enabled = enabledCommandNames(botId);
    const cmd = interaction.commandName.toLowerCase();
    if (!enabled.includes(cmd)) return;
    const def = CMD_DEFS[cmd];
    if (!hasPremadeCommandPermission(def, interaction.guild, interaction.member)) {
      // permissions manquantes → refus propre
      return interaction.reply({ content: '⛔ Cette commande est réservée au propriétaire du serveur ou à un membre ayant la permission Discord « Administrateur ».', ephemeral: true });
    }
    await execute(botId, entry, cmd, { interaction, args: '' });
  } catch (e) {
    // 🛡️ Aucune commande ne doit planter : réponse polie systématique
    console.error('[BotDev] commande slash :', (e && e.message) || e);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Oups, une erreur est survenue — elle a été enregistrée, réessaie.', ephemeral: true }).catch(() => {});
      }
    } catch {}
  }
}

// ============================================================
// 🎭 Mèmes aléatoires (v221) : sources FRANCOPHONES en priorité.
// L'API externe (meme-api.com) renvoie les posts d'un sous-reddit : on
// pioche dans des sous-reddits de mèmes français pour que les titres soient
// en français. Repli automatique si une source est vide/privée/hors-ligne.
// ============================================================
const MEME_API = 'https://meme-api.com/gimme';
const MEME_FR_SOURCES = ['memesfr', 'frenchmemes', 'rance'];
const MEME_FETCH_TIMEOUT_MS = 8000;
const MEME_PASSES = 3;

async function fetchMemeJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEME_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json().catch(() => null);
    if (!data || typeof data.title !== 'string' || typeof data.url !== 'string') throw new Error('Réponse invalide');
    return data;
  } finally { clearTimeout(timer); }
}

// Sélectionne un mème SÛR (jamais NSFW/spoiler) : sources françaises d'abord,
// puis repli général — plusieurs passages pour qu'une panne d'une source ne
// bloque jamais la commande. Si TOUTES les sources expirent (timeout), l'erreur
// remonte en AbortError pour afficher le bon message (« ⏱️ » vs « 😢 »).
async function fetchRandomMeme() {
  const attempts = [];
  for (let pass = 0; pass < MEME_PASSES; pass++) {
    for (const sub of MEME_FR_SOURCES) attempts.push(sub);
    attempts.push(''); // source générale (dernier recours)
  }
  let sawAbort = false;
  for (const sub of attempts) {
    const url = sub ? `${MEME_API}/${sub}` : MEME_API;
    try {
      const data = await fetchMemeJson(url);
      if (data && data.url && !data.nsfw && !data.spoiler) return data;
    } catch (e) {
      if (e && e.name === 'AbortError') sawAbort = true;
    }
  }
  const err = new Error(sawAbort ? 'L\'API de mèmes est injoignable (timeout)' : 'Aucune source de mème disponible');
  if (sawAbort) err.name = 'AbortError';
  throw err;
}

async function execute(botId, entry, cmd, src) {
  const { client } = entry;
  const record = store.bots.get(botId);
  const isInt = !!src.interaction;
  const guild = src.message ? src.message.guild : src.interaction.guild;
  const channel = src.message ? src.message.channel : src.interaction.channel;
  const author = src.message ? src.message.author : src.interaction.user;
  const member = src.message ? src.message.member : src.interaction.member;

  const send = async (payload) => {
    // 🛡️ L'envoi ne doit JAMAIS faire tomber une commande : en cas d'échec
    // (limite Discord, message trop long…), on journalise et on continue.
    try {
      if (isInt) {
        if (!src._replied) { await src.interaction.reply(payload); src._replied = true; }
        else await src.interaction.followUp(payload);
      } else {
        await channel.send(payload);
      }
    } catch (e) {
      console.error('[BotDev] send:', (e && e.message) || e);
    }
  };
  const reply = async (content) => send({ content });
  const replyEmbed = async (embed) => send({ embeds: [embed] });
  const replyPanel = async (options, components = []) => send(ui.panel(options, components));

  // 🌍 Commandes globales : en message privé, seules les commandes
  // universelles fonctionnent. Les autres répondent poliment.
  const DM_SAFE = ['ping', 'invite', 'botinfo', 'help', '8ball', 'meme', 'coinflip', 'roll', 'say', 'reverse', 'avatar'];
  if (!guild && isInt && !DM_SAFE.includes(cmd)) {
    return reply('🌍 Cette commande fonctionne sur un **serveur Discord**. Ajoute-moi à ton serveur avec `/invite` !');
  }

  const getUserArg = (name = 'utilisateur') => {
    if (isInt) {
      const opt = src.interaction.options.get(name);
      if (!opt) return null;
      const m = src.interaction.options.getMember(name);
      if (m) return m.user;
      return src.interaction.options.getUser(name);
    }
    const mention = argsMatch(src.args || '', /^<@!?(\d+)>/);
    if (mention) {
      const m = guild.members.cache.get(mention[1]);
      if (m) return m.user;
      return client.users.cache.get(mention[1]) || null;
    }
    return null;
  };

  switch (cmd) {
    case 'ping': {
      const m = await reply('🏓 Ping…');
      const latency = client.ws.ping;
      if (isInt) await src.interaction.editReply(`🏓 Pong ! Latence : **${latency} ms**`);
      else if (m) await m.edit(`🏓 Pong ! Latence : **${latency} ms**`);
      break;
    }
    case 'avatar': {
      const target = getUserArg() || author;
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setAuthor({ name: `Avatar de ${target.tag || target.username}` })
        .setImage(target.displayAvatarURL({ size: 512, dynamic: true }))
        .setFooter({ text: `Hoxera · ${guild.name}` })
        .setTimestamp();
      await replyEmbed(embed);
      break;
    }
    case 'userinfo': {
      const target = getUserArg() || author;
      const tMember = target.id ? guild.members.cache.get(target.id) : null;
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
        .addFields(
          { name: '🆔 ID', value: target.id, inline: true },
          { name: '📅 Compte créé le', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:d>`, inline: true },
        );
      if (tMember) embed.addFields({ name: '🚪 A rejoint le', value: `<t:${Math.floor(tMember.joinedTimestamp / 1000)}:d>`, inline: true });
      embed.setFooter({ text: `Hoxera · ${guild.name}` }).setTimestamp();
      await replyEmbed(embed);
      break;
    }
    case 'serverinfo': {
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
        .addFields(
          { name: '👑 Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
          { name: '👥 Membres', value: String(guild.memberCount), inline: true },
          { name: '💬 Salons', value: String(guild.channels.cache.size), inline: true },
          { name: '🔐 Rôles', value: String(guild.roles.cache.size), inline: true },
          { name: '📅 Créé le', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:d>`, inline: true },
          { name: '🆔 ID', value: guild.id, inline: true },
        )
        .setFooter({ text: `Hoxera · ${guild.name}` })
        .setTimestamp();
      await replyEmbed(embed);
      break;
    }
    case 'botinfo': {
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setAuthor({ name: client.user.tag, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
        .addFields(
          { name: '🌍 Serveurs', value: String(client.guilds.cache.size), inline: true },
          { name: '👥 Utilisateurs', value: String(client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)), inline: true },
          { name: '⚡ Latence', value: `${client.ws.ping} ms`, inline: true },
          { name: '🤖 Créé avec amour', value: 'Hoxera ✨', inline: true },
        )
        .setFooter({ text: `Hoxera · ${guild.name}` })
        .setTimestamp();
      await replyEmbed(embed);
      break;
    }
    case 'help': {
      let requested = null;
      if (isInt) requested = src.interaction.options.getString('commande') || null;
      else requested = String(src.args || '').trim().split(/\s+/)[0] || null;
      const embed = buildHelpEmbed(botId, record, client, guild, requested, member);
      await replyEmbed(embed);
      break;
    }
    case 'rank': {
      // 🎴 v216 — Carte de niveau « façon DraftBot » : avatar, grand niveau,
      // progression vers le niveau suivant, rang et prochain palier à débloquer.
      const target = getUserArg() || author;
      const row = store.xp.get(botId, guild.id, target.id) || { xp: 0, level: 0 };
      const level = row.level || 0;
      const cur = xpForLevel(level);
      const next = xpForLevel(level + 1);
      const need = Math.max(1, next - cur);
      const within = Math.max(0, row.xp - cur);
      const pct = Math.max(0, Math.min(1, within / need));
      const bars = 10;
      const bar = '▰'.repeat(Math.round(pct * bars)) + '▱'.repeat(bars - Math.round(pct * bars));
      const pos = store.xp.rankOf(botId, guild.id, target.id);
      const xpMembers = store.xp.count(botId, guild.id) || 0;
      const remaining = Math.max(0, need - within);
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setAuthor({ name: target.username || target.tag || 'Membre', iconURL: target.displayAvatarURL({ dynamic: true }) })
        .setTitle(`Niveau ${level}`)
        .setDescription(`${bar} ${Math.round(pct * 100)}%`)
        .addFields(
          { name: '✨ XP', value: `${within} / ${need}`, inline: true },
          { name: '🏆 Rang', value: `#${pos}${xpMembers ? ` sur ${xpMembers}` : ''}`, inline: true },
          { name: '🎯 Encore', value: `${remaining} XP avant le niveau ${level + 1}`, inline: false },
        );
      // 🎁 Prochain palier (rôle de niveau) si configuré au-dessus du niveau actuel
      try {
        const rewards = store.xpRoles.all(botId, guild.id) || [];
        const nextReward = rewards.find((r) => Number(r.level) > level);
        if (nextReward) {
          const roleRef = resolveRole(guild, nextReward.role);
          const roleLabel = roleRef ? roleRef.toString() : String(nextReward.role).slice(0, 100);
          const toReward = Math.max(0, xpForLevel(Number(nextReward.level)) - row.xp);
          embed.addFields({ name: '🎁 Prochain palier', value: `Niveau ${nextReward.level} → ${roleLabel}${toReward ? ` (encore ${toReward} XP)` : ''}`, inline: false });
        }
      } catch {}
      embed.setFooter({ text: `Hoxera · ${guild.name}` }).setTimestamp();
      await replyEmbed(embed);
      break;
    }
    case 'levels': {
      // 🏆 v216 — Classement façon DraftBot : top + ta position toujours visible
      const LIMIT = 10;
      const top = store.xp.top(botId, guild.id, LIMIT);
      if (!top.length) return reply('📈 Personne n\'a encore gagné d\'XP sur ce serveur. Discute pour monter de niveau !');
      const medal = ['🥇', '🥈', '🥉'];
      const lines = top.map((r, i) => `${medal[i] || `**${i + 1}.**`} <@${r.user_id}> — **${r.level}** · ${r.xp} XP`);
      // 👤 Si l'auteur n'est pas dans le top affiché, on ajoute sa position.
      const inTop = top.some((r) => String(r.user_id) === String(author.id));
      let own = '';
      if (!inTop && author) {
        const myRow = store.xp.get(botId, guild.id, author.id);
        if (myRow && Number(myRow.xp) > 0) {
          const myPos = store.xp.rankOf(botId, guild.id, author.id);
          own = `\n…\n**${myPos}.** <@${author.id}> — **${myRow.level || 0}** · ${myRow.xp} XP ⬅️ toi`;
        }
      }
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setTitle('📈 Classement des niveaux')
        .setDescription(ui.sectionize(`**Top ${LIMIT} — les membres les plus actifs**\n\n${lines.join('\n')}${own}`, 4096))
        .setFooter({ text: `Hoxera · ${guild.name}` })
        .setTimestamp();
      await replyEmbed(embed);
      break;
    }
    case 'profile': {
      // 🪪 Carte de profil d'un membre (Phase 3, v196) : niveau, coins,
      // rang, rôle principal et date d'arrivée sur le serveur.
      const target = getUserArg() || author;
      const row = store.xp.get(botId, guild.id, target.id) || { xp: 0, level: 0 };
      const level = row.level || 0;
      const cur = xpForLevel(level);
      const next = xpForLevel(level + 1);
      const pct = Math.max(0, Math.min(1, (row.xp - cur) / Math.max(1, (next - cur))));
      const bars = 10;
      const bar = '▰'.repeat(Math.round(pct * bars)) + '▱'.repeat(bars - Math.round(pct * bars));
      const pos = store.xp.rankOf(botId, guild.id, target.id);
      const coins = (store.economy.get(botId, guild.id, target.id) || {}).coins || 0;
      const member = (guild.members && guild.members.cache.get(target.id)) || null;
      const topRole = member && member.roles && member.roles.cache
        ? [...member.roles.cache.values()].filter((r) => r.name !== '@everyone').sort((a, b) => b.position - a.position)[0]
        : null;
      const joined = member && member.joinedAt ? new Date(member.joinedAt) : null;
      const joinedStr = joined && !isNaN(joined)
        ? joined.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'inconnue';
      const fields = [
        { name: '📈', value: String(level), inline: true },
        { name: '🏆 Rang', value: `#${pos}`, inline: true },
        { name: '💰 Coins', value: String(coins), inline: true },
        { name: 'Progression', value: `${bar} ${Math.round(pct * 100)}%` },
      ];
      if (topRole) fields.push({ name: '🛡️ Rôle principal', value: topRole.name.slice(0, 100), inline: true });
      fields.push({ name: '📅 Membre depuis', value: joinedStr, inline: true });
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setTitle(`🪪 Profil de ${target.username}`)
        .setThumbnail(target.displayAvatarURL({ dynamic: true }))
        .addFields(fields)
        .setFooter({ text: `Hoxera · ${guild.name}` })
        .setTimestamp();
      await replyEmbed(embed);
      break;
    }
    case 'invite': {
      if (!record.client_id) return reply('❌ Application ID manquant.');
      await replyPanel({
        variant: 'brand',
        title: '🔗 Ajouter Hoxera à un serveur',
        description: 'Utilise le bouton ou le lien ci-dessous pour inviter le bot.',
        fields: [{ name: '🌐 Lien d’invitation', value: `https://discord.com/oauth2/authorize?client_id=${record.client_id}&permissions=8&scope=bot%20applications.commands` }],
        footer: 'Hoxera · Invitation officielle',
      }, [ui.linkRow('➕ Inviter le bot', `https://discord.com/oauth2/authorize?client_id=${record.client_id}&permissions=8&scope=bot%20applications.commands`)]);
      break;
    }
    case 'lang': {
      if (!guild) return reply('🌍 Cette commande se configure sur un serveur.');
      const wanted = isInt ? (src.interaction.options.getString('langue') || '') : (src.args || '').trim();
      if (!['fr', 'en', 'es', 'de', 'pt', 'it'].includes(wanted)) {
        return reply('❓ Utilisation : `/lang fr|en|es|de|pt|it`.');
      }
      store.guildSettings.set(botId, guild.id, { lang: wanted });
      const i18n = require('../i18n');
      await reply(i18n.t(wanted, 'lang_set'));
      break;
    }
    // ===================== Communauté =====================
    case 'shop': {
      const items = store.shop.all(botId, guild.id);
      if (!items.length) {
        return reply('🛒 La boutique est vide. Les administrateurs peuvent ajouter des articles depuis le **dashboard Hoxera** (onglet Boutique).');
      }
      const solde = (store.economy.get(botId, guild.id, author.id) || {}).coins || 0;
      // v229 — EXCLUSION VOLONTAIRE de la grammaire des sections (traits ━) :
      // deux phrases très courtes → un trait produirait l'effet « trait orphelin »
      // corrigé en v220. Les articles sont déjà séparés par des champs d'embed.
      const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('🛒 Boutique du serveur')
        .setDescription(`Achète un article avec tes coins : \`/buy article\`\n\n💰 **Ton solde : ${solde} coins**`)
        .setFooter({ text: `Hoxera · ${guild.name} · Boutique` })
        .setTimestamp();
      for (const it of items) {
        embed.addFields({ name: `${it.emoji} ${it.name} — ${it.price} coins`, value: it.description || 'Aucune description' });
      }
      await replyEmbed(embed);
      break;
    }
    case 'buy': {
      const name = isInt ? (src.interaction.options.getString('article') || '') : (src.args || '').trim();
      const item = store.shop.all(botId, guild.id).find((i) => i.name.toLowerCase() === name.toLowerCase());
      if (!item) return reply('❓ Article introuvable. Vois la boutique avec `/shop`.');
      store.economy.ensure(botId, guild.id, author.id);
      const row = store.economy.get(botId, guild.id, author.id);
      if (row.coins < item.price) return reply(`❌ Il te manque **${item.price - row.coins}** coins (article à ${item.price}).`);
      store.economy.add(botId, guild.id, author.id, -item.price);
      store.shopPurchases.add(botId, guild.id, author.id, item.name, item.price);
      const role = guild.roles.cache.find((r) => r.name.toLowerCase() === item.role.toLowerCase());
      if (!role) {
        store.economy.add(botId, guild.id, author.id, item.price); // remboursement
        return reply('⚠️ Le rôle de cet article n\'existe plus — achat annulé.');
      }
      const member = guild.members.cache.get(author.id);
      if (member) await member.roles.add(role).catch(() => {});
      await logging.log(botId, guild, {
        title: '🛒 Achat boutique', color: '#FEE75C',
        fields: [
          { name: '👤 Membre', value: `${author.tag || author.username}`, inline: true },
          { name: '🛍️ Article', value: `${item.emoji} ${item.name}`, inline: true },
          { name: '💰 Prix', value: String(item.price), inline: true },
        ],
      });
      await replyPanel({
        variant: 'economy',
        title: '🛒 Achat réussi !',
        description: `Tu reçois **${role.toString()}**.`,
        fields: [{ name: '💰 Prix', value: `${item.price} coins`, inline: true }, { name: '🏷️ Rôle', value: role.name, inline: true }],
        footer: `Hoxera · ${guild.name} · Boutique`,
      });
      break;
    }
    case 'pay': {
      const target = isInt ? (src.interaction.options.getUser('membre') || null) : null;
      const amount = isInt ? (src.interaction.options.getInteger('montant') || 0) : parseInt((src.args || '').split(/\s+/)[1], 10);
      if (!target || !amount || amount <= 0) return reply('❓ Utilisation : `/pay @membre montant`.');
      if (target.id === author.id) return reply('❌ Tu ne peux pas te payer toi-même.');
      store.economy.ensure(botId, guild.id, author.id);
      store.economy.ensure(botId, guild.id, target.id);
      const from = store.economy.get(botId, guild.id, author.id);
      if (from.coins < amount) return reply('❌ Solde insuffisant.');
      store.economy.add(botId, guild.id, author.id, -amount);
      store.economy.add(botId, guild.id, target.id, amount);
      await replyPanel({
        variant: 'economy',
        title: '💸 Transfert effectué',
        description: `${author} a envoyé des coins à ${target}.`,
        fields: [{ name: '🪙 Montant', value: `${amount} coins`, inline: true }, { name: '👤 Destinataire', value: `${target}`, inline: true }],
        footer: `Hoxera · ${guild.name} · Économie`,
      });
      break;
    }
    case 'suggest': {
      if (!isInt) return reply('💡 Utilise la commande slash `/suggest` pour envoyer une suggestion.');
      const text = src.interaction.options.getString('texte') || '';
      if (!text.trim()) return reply('❓ Écris ta suggestion : `/suggest ton idée`.');
      return suggestEngine.submitSuggestion(botId, src.interaction, text);
    }
    case 'suggestions': {
      const action = isInt ? (src.interaction.options.getString('action') || 'view') : 'view';
      if (action === 'set') {
        const ch = src.interaction.options.getChannel('salon');
        if (!ch || !ch.isTextBased()) return reply('❌ Salon invalide.');
        store.guildSettings.set(botId, guild.id, { suggestion_channel: `#${ch.name}` });
        return reply(`✅ Les suggestions seront postées dans ${ch}.`);
      }
      if (action === 'off') {
        store.guildSettings.set(botId, guild.id, { suggestion_channel: '' });
        return reply('⛔ Suggestions désactivées.');
      }
      const gs = store.guildSettings.get(botId, guild.id) || {};
      return reply(gs.suggestion_channel
        ? `💡 Salon des suggestions : **${gs.suggestion_channel}**\nVotes avec 👍👎, statut par le staff (✅ Approuver / ❌ Refuser).`
        : '💡 Aucun salon configuré. Utilise `/suggestions set #salon`.');
    }
    case 'giveaway': {
      if (!isInt) return reply('🎁 Utilise la commande slash `/giveaway` pour lancer un tirage.');
      const action = src.interaction.options.getString('action') || 'create';
      const duree = src.interaction.options.getString('duree') || '1h';
      const prix = src.interaction.options.getString('prix') || '🎁 Lot surprise';
      const gagnants = src.interaction.options.getInteger('gagnants') || 1;
      if (action === 'end' || action === 'reroll') {
        const msgId = src.interaction.options.getString('message') || '';
        const g = msgId ? store.giveaways.active(botId, guild.id).find((x) => x.message_id === msgId)
          : store.giveaways.active(botId, guild.id)[0];
        if (!g) return reply('❌ Aucun giveaway en cours trouvé.');
        const res = await giveawayEngine.endGiveaway(botId, client, g, false);
        return reply(res.ok
          ? `🎉 Tirage terminé ! Gagnants : ${res.winners.join(', ') || 'aucun participant'}`
          : `❌ ${res.reason}`);
      }
      const ms = giveawayEngine.parseDuration(duree);
      if (!ms) return reply('❌ Durée invalide (ex : 30m, 2h, 1d).');
      return giveawayEngine.startGiveaway(botId, src.interaction, ms, prix, gagnants);
    }
    case 'temprole': {
      if (!isInt) return reply('⏳ Utilise la commande slash `/temprole`.');
      const target = src.interaction.options.getMember('membre') || null;
      const role = src.interaction.options.getRole('role') || null;
      const duree = src.interaction.options.getString('duree') || '';
      if (!target || !role) return reply('❓ Utilisation : `/temprole @membre @rôle 2h`.');
      const ms = tasks.parseRoleDuration(duree);
      if (!ms) return reply('❌ Durée invalide (ex : 30m, 2h, 1d).');
      return tasks.giveTempRole(botId, src.interaction, target, role, ms);
    }
    case 'sanction': {
      const target = isInt ? (src.interaction.options.getMember('membre') || null) : null;
      const sname = isInt ? (src.interaction.options.getString('sanction') || '') : (src.args || '').trim();
      if (!target) return reply('❓ Utilisation : `/sanction @membre nom_de_la_sanction`.');
      const s = store.sanctions.get(botId, guild.id, sname);
      if (!s) {
        const list = store.sanctions.all(botId, guild.id);
        return reply(list.length
          ? `❓ Sanction introuvable. Disponibles : ${list.map((x) => x.name).join(', ')}`
          : '❓ Aucune sanction prédéfinie. Ajoute-les depuis le **dashboard Hoxera** (onglet Modération).');
      }
      const reason = s.message || 'Sanction prédéfinie';
      try {
        await target.send(ui.panel({
          variant: 'danger',
          title: '⚠️ Sanction appliquée',
          description: `Tu as été sanctionné sur **${guild.name}**.`,
          fields: [
            { name: '⚖️ Type', value: s.name, inline: true },
            { name: '📝 Motif', value: reason, inline: false },
          ],
          footer: `Hoxera · ${guild.name} · Modération`,
        }));
      } catch {}
      if (s.action === 'warn') {
        store.warnings.add(botId, guild.id, target.id, reason, author.id);
        await reply(`⚠️ ${target} averti : ${reason}`);
      } else if (s.action === 'timeout') {
        await target.timeout(Math.max(s.duration || 5, 1) * 60000, reason).catch(() => {});
        await reply(`⏳ ${target} mis en timeout ${s.duration || 5} min : ${reason}`);
      } else if (s.action === 'kick') {
        await target.kick(reason).catch(() => reply('⚠️ Expulsion impossible.'));
        await reply(`👢 ${target.user.tag} expulsé : ${reason}`);
      } else if (s.action === 'ban') {
        await target.ban({ reason }).catch(() => reply('⚠️ Bannissement impossible.'));
        await reply(`🔨 ${target.user.tag} banni : ${reason}`);
      }
      await logging.log(botId, guild, {
        title: '🛡️ Sanction prédéfinie', color: '#ED4245',
        fields: [
          { name: '👤 Membre', value: `${target.user.tag}`, inline: true },
          { name: '⚖️ Sanction', value: s.name, inline: true },
          { name: '🛡️ Par', value: `${author.tag || author.username}`, inline: true },
          { name: '📝 Raison', value: reason },
        ],
      });
      break;
    }
    case '8ball': {
      const answers = ['Oui, absolument.', 'C\'est certain.', 'Sans aucun doute.', 'Oui, définitivement.', 'Tu peux compter dessus.', 'Essaie encore plus tard.', 'Ne compte pas dessus.', 'Ma réponse est non.', 'Mes sources disent non.', 'Très incertain.'];
      const q = isInt ? (src.interaction.options.getString('texte') || '') : (src.args || '');
      await reply(`🎱 **${q || '...'}**\n${answers[Math.floor(Math.random() * answers.length)]}`);
      break;
    }
    case 'meme': {
      // 🎭 Mèmes aléatoires : sources FRANCOPHONES en priorité (r/MemesFR,
      // r/FrenchMemes, r/rance) → titres en français ; repli auto sinon.
      try {
        const data = await fetchRandomMeme();
        const title = String(data.title || 'Meme').slice(0, 256);
        const url = data.url;
        const sub = data.subreddit ? `r/${String(data.subreddit).slice(0, 100)}` : 'meme-api.com';
        const embed = new EmbedBuilder()
          .setColor('#e07a5f')
          .setTitle(title)
          .setImage(url)
          .setFooter({ text: `🎭 ${sub} · Hoxera` });
        await replyEmbed(embed);
      } catch (e) {
        if (e && e.name === 'AbortError') {
          await reply('⏱️ L\'API de mèmes ne répond pas pour le moment. Réessaie dans quelques instants.');
        } else {
          await reply('😢 Impossible de récupérer un mème pour le moment. Réessaie dans quelques secondes.');
        }
      }
      break;
    }
    case 'coinflip': {
      await reply(Math.random() < 0.5 ? '🪙 **Pile !**' : '🪙 **Face !**');
      break;
    }
    case 'roll': {
      let max = 6;
      if (isInt) max = src.interaction.options.getInteger('max') || 6;
      else { const n = parseInt(src.args, 10); if (n) max = n; }
      max = Math.min(Math.max(max, 2), 1000000);
      await reply(`🎲 Tu as lancé un dé et obtenu : **${Math.floor(Math.random() * max) + 1}** (1-${max})`);
      break;
    }
    case 'say': {
      const text = isInt ? src.interaction.options.getString('texte') : src.args;
      await send({ content: text });
      break;
    }
    case 'reverse': {
      const text = isInt ? src.interaction.options.getString('texte') : src.args;
      await reply(text.split('').reverse().join(''));
      break;
    }
    case 'kick': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const tMember = guild.members.cache.get(target.id);
      if (!tMember || !tMember.kickable) return reply('⛔ Je ne peux pas expulser cet utilisateur.');
      const reason = isInt ? (src.interaction.options.getString('raison') || '') : '';
      await tMember.kick(reason || 'Aucune raison').catch(() => {});
      await logging.log(botId, guild, {
        title: '👢 Expulsion', color: '#ED4245',
        fields: [
          { name: '👤 Membre', value: `${target.tag || target.username}`, inline: true },
          { name: '🛡️ Par', value: `${author.tag || author.username}`, inline: true },
          { name: '📝 Raison', value: reason || 'Aucune', inline: true },
        ],
      });
      await replyPanel({
        variant: 'success',
        title: '👢 Expulsion effectuée',
        description: `**${target.tag || target.username}** a été expulsé du serveur.`,
        fields: [{ name: '📝 Raison', value: reason || 'Aucune', inline: true }],
        footer: `Hoxera · ${guild.name} · Modération`,
      });
      break;
    }
    case 'ban': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const tMember = guild.members.cache.get(target.id);
      if (!tMember || !tMember.bannable) return reply('⛔ Je ne peux pas bannir cet utilisateur.');
      const reason = isInt ? (src.interaction.options.getString('raison') || '') : '';
      await tMember.ban({ reason: reason || 'Aucune raison' }).catch(() => {});
      await logging.log(botId, guild, {
        title: '🔨 Bannissement', color: '#ED4245',
        fields: [
          { name: '👤 Membre', value: `${target.tag || target.username}`, inline: true },
          { name: '🛡️ Par', value: `${author.tag || author.username}`, inline: true },
          { name: '📝 Raison', value: reason || 'Aucune', inline: true },
        ],
      });
      await replyPanel({
        variant: 'danger',
        title: '🔨 Bannissement effectué',
        description: `**${target.tag || target.username}** a été banni du serveur.`,
        fields: [{ name: '📝 Raison', value: reason || 'Aucune', inline: true }],
        footer: `Hoxera · ${guild.name} · Modération`,
      });
      break;
    }
    case 'unban': {
      const id = isInt ? src.interaction.options.getString('identifiant') : (src.args || '').trim();
      if (!/^\d{15,21}$/.test(id)) return reply('❓ Identifiant invalide.');
      await guild.bans.remove(id).catch(() => reply('❓ Utilisateur non banni ou introuvable.'));
      await logging.log(botId, guild, {
        title: '🔓 Débannissement', color: '#57F287',
        fields: [
          { name: '🆔 Utilisateur', value: id, inline: true },
          { name: '🛡️ Par', value: `${author.tag || author.username}`, inline: true },
        ],
      });
      await replyPanel({
        variant: 'success',
        title: '🔓 Débannissement effectué',
        description: `L'utilisateur ${id} a été débanni.`,
        fields: [{ name: '🆔 Identifiant', value: id, inline: true }],
        footer: `Hoxera · ${guild.name} · Modération`,
      });
      break;
    }
    case 'timeout': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const tMember = guild.members.cache.get(target.id);
      const minutes = isInt ? (src.interaction.options.getInteger('minutes') || 5) : (parseInt(src.args, 10) || 5);
      if (!tMember || !tMember.moderatable) return reply('⛔ Je ne peux pas mettre cet utilisateur en timeout.');
      await tMember.timeout(Math.min(Math.max(minutes, 1), 40320) * 60000).catch(() => {});
      await logging.log(botId, guild, {
        title: '⏳ Timeout', color: '#ED4245',
        fields: [
          { name: '👤 Membre', value: `${target.tag || target.username}`, inline: true },
          { name: '🛡️ Par', value: `${author.tag || author.username}`, inline: true },
          { name: '⏱ Durée', value: `${minutes} minute(s)`, inline: true },
        ],
      });
      await replyPanel({
        variant: 'warning',
        title: '⏳ Timeout appliqué',
        description: `**${target.tag || target.username}** ne peut plus écrire temporairement.`,
        fields: [{ name: '⏱ Durée', value: `${minutes} minute(s)`, inline: true }],
        footer: `Hoxera · ${guild.name} · Modération`,
      });
      break;
    }
    case 'warn': {
      const target = getUserArg();
      if (!target || !target.id) return reply('❓ Utilisateur introuvable.');
      const reason = isInt ? (src.interaction.options.getString('raison') || '') : '';
      store.warnings.add(botId, guild.id, target.id, reason || 'Aucune raison', author.id);
      const n = store.warnings.count(botId, guild.id, target.id);
      store.activity.add(botId, guild.id, '⚠️', `${target.tag || target.username} averti par ${author.tag || author.username} (total : ${n})`);
      let extra = '';
      let sanctionApplied = false;
      // ⚖️ Paliers de sanctions automatiques (v1.98) : palier 1 = timeout,
      // palier 2 = timeout/kick/ban — la sanction la plus sévère atteinte s'applique.
      const gs = store.guildSettings.get(botId, guild.id) || {};
      const { sanctionForWarns } = require('./community');
      const auto = sanctionForWarns(n, gs);
      if (auto) {
        const tMember = guild.members.cache.get(target.id);
        if (tMember) {
          try {
            if (auto.action === 'timeout' && tMember.moderatable) {
              await tMember.timeout(auto.minutes * 60000, `${n} avertissements — sanction automatique`);
              sanctionApplied = true;
              extra = `\n⏳ **Timeout automatique** : ${auto.minutes} min (${n} avertissements).`;
            } else if (auto.action === 'kick' && tMember.kickable) {
              await tMember.kick('Limite d\'avertissements atteinte');
              sanctionApplied = true;
              extra = '\n👢 **Expulsé** : limite d\'avertissements atteinte.';
            } else if (auto.action === 'ban' && tMember.bannable) {
              await tMember.ban({ reason: 'Limite d\'avertissements atteinte' });
              sanctionApplied = true;
              extra = '\n🔨 **Banni** : limite d\'avertissements atteinte.';
            }
          } catch {}
        }
      }
      if (sanctionApplied) {
        try { store.warnings.resetActive(botId, guild.id, target.id); } catch {}
      }
      await logging.log(botId, guild, {
        title: '⚠️ Avertissement', color: '#FEE75C',
        fields: [
          { name: '👤 Membre', value: `${target.tag || target.username}`, inline: true },
          { name: '🛡️ Par', value: `${author.tag || author.username}`, inline: true },
          { name: '📝 Raison', value: reason || 'Aucune', inline: true },
          { name: '🔢 Total', value: String(n), inline: true },
        ],
      });
      await replyPanel({
        variant: 'warning',
        title: '⚠️ Avertissement enregistré',
        description: `**${target.tag || target.username}** a été averti.`,
        fields: [
          { name: '📝 Raison', value: reason || 'Aucune', inline: false },
          { name: '🔢 Total actif', value: `${n} avertissement(s)`, inline: true },
          ...(extra ? [{ name: '⚖️ Suite', value: extra.replace(/^\n/, '') }] : []),
        ],
        footer: `Hoxera · ${guild.name} · Modération`,
      });
      break;
    }
    case 'warns': {
      const target = getUserArg() || author;
      const list = store.warnings.list(botId, guild.id, target.id);
      if (!list.length) return reply(`✅ **${target.tag || target.username}** n'a aucun avertissement.`);
      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle(`⚠️ Avertissements de ${target.tag || target.username}`)
        .setDescription(list.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(new Date(w.created_at + 'Z').getTime() / 1000)}:R>`).join('\n').slice(0, 1900));
      await replyEmbed(embed);
      break;
    }
    case 'clear': {
      let n = isInt ? src.interaction.options.getInteger('nombre') : parseInt(src.args, 10);
      n = Math.min(Math.max(n || 0, 1), 100);
      const deleted = await channel.bulkDelete(n, true).catch(() => null);
      const count = deleted ? deleted.size : 0;
      await logging.log(botId, guild, {
        title: '🧹 Purge de messages', color: '#e07a5f',
        fields: [
          { name: '📨 Salon', value: `<#${channel.id}>`, inline: true },
          { name: '🔢 Messages', value: String(count), inline: true },
          { name: '🛡️ Par', value: `${author.tag || author.username}`, inline: true },
        ],
      });
      await replyPanel({
        variant: 'success',
        title: '🧹 Nettoyage terminé',
        description: `${count} message(s) ont été supprimé(s) dans ce salon.`,
        fields: [{ name: '🛡️ Action effectuée par', value: `${author.tag || author.username}`, inline: true }],
        footer: `Hoxera · ${guild.name} · Modération`,
      });
      break;
    }
    case 'daily': {
      if (!guild) return;
      const row = store.economy.get(botId, guild.id, author.id);
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (row && row.last_daily === today) {
        const streak = Number(row.daily_streak) || 0;
        return reply(streak > 1
          ? `⏳ Tu as déjà récupéré tes coins aujourd'hui (série : ${streak} jours 🔥). Reviens demain pour continuer !`
          : `⏳ Tu as déjà récupéré tes coins aujourd'hui. Reviens demain !`);
      }
      // 🔥 Série de connexion (v190) : un jour consécutif → +1, sinon reset
      let streak = 0;
      if (row && row.last_daily === yesterday) streak = (Number(row.daily_streak) || 0) + 1;
      else streak = 1;
      const base = 100;
      const bonus = Math.min(25 * (streak - 1), 300); // plafond +300
      const reward = base + bonus;
      store.economy.ensure(botId, guild.id, author.id);
      store.economy.add(botId, guild.id, author.id, reward);
      store.economy.setDaily(botId, guild.id, author.id, today);
      store.economy.setDailyStreak(botId, guild.id, author.id, streak);
      const after = store.economy.get(botId, guild.id, author.id);
      await replyPanel({
        variant: 'economy',
        title: '🎁 Récompense quotidienne',
        description: streak > 1 ? `Série de **${streak} jours** 🔥 continue !` : 'Tu as récupéré ta récompense du jour.',
        fields: [
          { name: '🪙 Récompense', value: `+${reward} coins${bonus > 0 ? ` (dont +${bonus} de bonus série 🔥)` : ''}`, inline: true },
          { name: '💰 Nouveau solde', value: `${after.coins} coins`, inline: true },
        ],
        footer: `Hoxera · ${guild.name} · Économie`,
      });
      break;
    }
    case 'balance': {
      if (!guild) return;
      const target = getUserArg() || author;
      const row = store.economy.get(botId, guild.id, target.id);
      await replyPanel({
        variant: 'economy',
        title: '💰 Solde de coins',
        description: `**${target.tag || target.username}** possède des coins sur ce serveur.`,
        fields: [{ name: '🪙 Solde actuel', value: `${row ? row.coins : 0} coins`, inline: true }],
        footer: `Hoxera · ${guild.name} · Économie`,
      });
      break;
    }
    case 'leaderboard': {
      if (!guild) return;
      const top = store.economy.top(botId, guild.id, 10);
      if (!top.length) return reply('🏆 Le classement est vide pour le moment.');
      const medal = ['🥇', '🥈', '🥉'];
      const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('🏆 Classement des coins')
        .setDescription(top.map((r, i) => `${medal[i] || `**${i + 1}.**`} <@${r.user_id}> — **${r.coins}** coins`).join('\n'))
        .setFooter({ text: `Hoxera · ${guild.name} · Économie` })
        .setTimestamp();
      await replyEmbed(embed);
      break;
    }
  }
}

function argsMatch(str, regex) {
  const m = String(str).match(regex);
  return m ? m : null;
}

// ============================================================
// Centre d'aide /help (complet : catégories + détails par commande)
// ============================================================
const HELP_DETAILS = {
  ticket: ['🎫 Tickets', 'Le système de tickets complet : un bouton dans un salon, chaque clic crée un salon privé réservé au membre et au staff.',
    '`/ticket types setup` — **Assistant interactif des types** : choisis un type, renomme-le, choisis son emoji, sa catégorie, **ajoute AUTANT de rôles staff que tu veux** (sélecteur de rôle, répétable) ou retire-les, supprime-le avec confirmation\n`/ticket types add Nom` — Ajouter/renommer un **type de ticket** (option `staffrole` pour un rôle — pour en mettre plusieurs : setup) (emoji, catégorie et rôle staff dédiés en options) — le panneau affiche un menu déroulant de types\n`/ticket types remove Nom` — Supprimer un type\n`/ticket types list` — Voir les types\n`/ticket setup` — **Assistant avec menus de sélection** : nom → catégorie → salon → rôle staff\n`/ticket panel` — Envoyer le panneau\n`/ticket channel #salon` — Changer le salon\n`/ticket role @Staff` — Changer le rôle staff\n`/ticket category Nom` — Changer la catégorie\n`/ticket button Texte` — Changer le texte du bouton\n`/ticket message Texte` — Changer le message\n`/ticket config` — Voir la configuration\n`/ticket close` — **Verrouiller** un ticket (staff, réouvrable avec 🔓)\n`/ticket delete` — **Supprimer** un ticket (staff) — 📄 la **transcription** est envoyée en MP au créateur à ce moment\n`/ticket add @membre` / `/ticket remove @membre` — Gérer l\'accès au ticket (staff)\n\n🔒 Configuration réservée au **propriétaire du serveur** ou aux membres ayant la permission **Administrateur** · gestion réservée au **staff**\n📄 La transcription part à la **suppression** (pas à la fermeture).\n\n🗂️ Exemples de types : Candidature staff, Ticket contre admin, Signaler un bug, Partenariat…'],
  ping: ['🔧 Utilitaire', 'Affiche la latence du bot.', '`/ping`', '`/ping` → 🏓 Pong ! Latence : 42 ms'],
  avatar: ['🔧 Utilitaire', 'Affiche l\'avatar d\'un membre.', '`/avatar @membre`', '`/avatar @Hoxera`'],
  userinfo: ['🔧 Utilitaire', 'Informations sur un membre (ID, date de création, arrivée).', '`/userinfo @membre`', '`/userinfo`'],
  serverinfo: ['🔧 Utilitaire', 'Informations sur le serveur (membres, salons, rôles…).', '`/serverinfo`'],
  botinfo: ['🔧 Utilitaire', 'Informations sur le bot (serveurs, latence…).', '`/botinfo`'],
  kick: ['🛡️ Modération', 'Expulse un membre du serveur (il peut revenir avec une invitation).', '`/kick @membre raison`', '`/kick @spammeur Flood`'],
  ban: ['🛡️ Modération', 'Bannit un membre définitivement.', '`/ban @membre raison`', '`/ban @spammeur`'],
  unban: ['🛡️ Modération', 'Débannit un utilisateur avec son identifiant.', '`/unban ID`', '`/unban 123456789012345678`'],
  timeout: ['🛡️ Modération', 'Empêche un membre d\'écrire pendant X minutes.', '`/timeout @membre minutes`', '`/timeout @membre 10`'],
  warn: ['🛡️ Modération', 'Avertit un membre (les avertissements sont comptés).', '`/warn @membre raison`', '`/warn @membre insultes`'],
  warns: ['🛡️ Modération', 'Liste les avertissements d\'un membre.', '`/warns @membre`'],
  clear: ['🛡️ Modération', 'Supprime un nombre de messages du salon.', '`/clear nombre`', '`/clear 20`'],
  '8ball': ['🎉 Fun', 'Pose une question, la boule magique répond.', '`/8ball question`', '`/8ball BotDev est-il génial ?`'],
  meme: ['🎉 Fun', 'Envoie un meme aléatoire.', '`/meme`'],
  coinflip: ['🎉 Fun', 'Lance une pièce : pile ou face.', '`/coinflip`', '`/coinflip` → 🪙 Face !'],
  roll: ['🎉 Fun', 'Lance un dé (jusqu\'à la valeur choisie, défaut 6).', '`/roll max`', '`/roll 100` → 🎲 73'],
  say: ['🎉 Fun', 'Le bot répète ton message.', '`/say texte`', '`/say Coucou !`'],
  reverse: ['🎉 Fun', 'Inverse ton texte.', '`/reverse texte`', '`/reverse bonjour` → ruojnob'],
  daily: ['💰 Économie', 'Récupère 100 coins, une fois par jour.', '`/daily`', '`/daily` → 🎁 +100 coins !'],
  balance: ['💰 Économie', 'Affiche ton solde de coins.', '`/balance @membre`'],
  leaderboard: ['💰 Économie', 'Le classement des coins du serveur.', '`/leaderboard`'],
  rank: ['📈 Niveaux', 'Ton niveau, ton XP et ton rang sur ce serveur. Gagne de l\'XP en discutant !', '`/rank @membre`', '`/rank` → carte « Niveau 3 » · ✨ XP · 🏆 rang · 🎁 prochain palier'],
  levels: ['📈 Niveaux', 'Le classement des niveaux du serveur.', '`/levels`'],
  invite: ['🔧 Utilitaire', 'Le lien pour inviter le bot sur un autre serveur.', '`/invite`'],
  lang: ['🌍 Langue', 'Choisis la langue du bot sur CE serveur : fr, en, es, de, pt ou it. Tous les messages publics (panneau de tickets, bienvenue, transcriptions…) suivent.', '`/lang fr` · `/lang en` · `/lang es` · `/lang de` · `/lang pt` · `/lang it`', '`/lang it` → 🌍 Lingua del bot impostata su italiano in questo server. 🇮🇹'],
  shop: ['🛒 Boutique', 'La boutique du serveur : achète des rôles avec tes coins.', '`/shop` (voir) · `buy` est `/buy article`'],
  buy: ['🛒 Boutique', 'Achète un article de la boutique (rôle donné automatiquement).', '`/buy article`', '`/buy vip` → ✅ Tu reçois @VIP pour 500 coins'],
  pay: ['💰 Économie', 'Transfère des coins à un membre.', '`/pay @membre montant`'],
  suggest: ['💡 Suggestions', 'Propose une idée : les membres votent (👍👎), le staff tranche.', '`/suggest ton idée`'],
  suggestions: ['💡 Suggestions', 'Configure le salon des suggestions (propriétaire/admin).', '`/suggestions set #salon` · `/suggestions off` · `/suggestions view`'],
  giveaway: ['🎁 Giveaways', 'Lance un giveaway : les membres réagissent 🎉, le tirage est automatique.', '`/giveaway create 2h Prix 3` · `/giveaway end` · `/giveaway reroll`', '`/giveaway create 1d 🎁 Clé du jeu 1`'],
  temprole: ['⏳ Rôles temporaires', 'Donne un rôle pour une durée limitée — retiré automatiquement.', '`/temprole @membre @rôle 2h`', '`/temprole @Membre @VIP 1d`'],
  sanction: ['⚖️ Sanctions', 'Applique une sanction prédéfinie (configurée dans le dashboard).', '`/sanction @membre nom_de_la_sanction`'],
  botprofile: ['🤖 Identité du bot', 'Personnalise le bot sur CE serveur : nom, avatar, bannière (depuis ta galerie), bio et couleur. Le bot s\'exprime avec cette identité dans ses messages ici.',
    '`/botprofile setup` — **Assistant pas à pas** : nom → bio → **sélecteur de couleurs** → avatar (**📱 ta galerie s\'ouvre directement**, envoie la photo) → bannière (galerie aussi) → ✅ Enregistrer (boutons Suivant/Retour/Annuler)\n`/botprofile view` — voir le profil\n`/botprofile set nom|bio|couleur` — nom, bio, couleur\n`/botprofile avatar` — 📱 la galerie s\'ouvre automatiquement\n`/botprofile banner` — 📱 galerie aussi\n`/botprofile reset` — revenir à l\'identité globale\n\n🔒 Réservé au **propriétaire du serveur** ou à un membre ayant la permission **Administrateur**'],
  modlogs: ['📋 Journaux', 'Un salon où le bot trace tout : modération, tickets, auto-mod, arrivées et départs.',
    '`/modlogs set #salon` — activer\n`/modlogs view` — voir\n`/modlogs off` — désactiver'],
  blacklist: ['🔇 Liste noire', 'Des mots interdits : les messages qui les contiennent sont supprimés automatiquement.',
    '`/blacklist add mot` · `/blacklist remove mot` · `/blacklist list`'],
};

function helpDescription() {
  let d = 'Voici **tout ce que je sais faire**. Tape `/help commande` pour le détail d\'une commande (ex : `/help ticket`).';
  const site = store.settings.get('public_url');
  if (site) d += `\n🌐 **Dashboard** : ${site}`;
  return d;
}

function buildHelpEmbed(botId, record, client, guild, requested, member) {
  const enabled = enabledCommandNames(botId);
  const { HELP_EXTRA } = require('./extra');
  const { HELP_EVENTS } = require('./guildEvents');
  const DETAILS = { ...HELP_DETAILS, ...HELP_EXTRA, ...HELP_EVENTS };

  // --- Détail d'une commande précise ---
  if (requested) {
    const key = requested.toLowerCase().replace(/^\//, '');
    const detail = DETAILS[key];
    const available = ['ticket', 'roles', 'botprofile', 'modlogs', 'blacklist'].includes(key) || enabled.includes(key) || !!HELP_EXTRA[key] || !!HELP_EVENTS[key];
    if (detail && available) {
      // 🔒 Le détail d'une commande staff n'est pas divulgué aux non-staff.
      if (guild && member && !canViewCommandName(key, guild, member)) {
        return new EmbedBuilder()
          .setColor('#ED4245')
          .setTitle('🔒 Commande réservée au staff')
          .setDescription(`« ${requested} » est réservée au **staff** de ce serveur (modération, administration ou configuration).\nSi tu penses que tu devrais y avoir accès, demande à un administrateur de t'accorder le rôle ou la permission correspondante.`);
      }
      const embed = new EmbedBuilder()
        .setColor('#e07a5f')
        .setTitle(`${detail[0]} · ${key}`)
        .setDescription(detail[1]);
      embed.addFields({ name: '📖 Utilisation', value: detail[2] });
      if (detail[3]) embed.addFields({ name: '✨ Exemple', value: detail[3] });
      embed.setFooter({ text: `Bot : ${client.user.username} · /help pour la liste complète` });
      return embed;
    }
    return new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('❓ Commande introuvable')
      .setDescription(`Je ne connais pas la commande « ${requested} ».\nTape \`/help\` pour voir la liste complète.`);
  }

  // --- Aide générale complète, organisée par public visé ---
  // Un membre ne voit que les blocs (et commandes) auxquels il a accès :
  // les commandes staff & administration sont invisibles pour les autres.
  const isFiltered = !!(guild && member);
  const fields = [];

  const fmtChips = (names) => {
    const chips = names.map((n) => `\`/${n}\``);
    const lines = [];
    for (let i = 0; i < chips.length; i += 6) lines.push(chips.slice(i, i + 6).join(' · '));
    return lines.join('\n');
  };

  for (const block of HELP_BLOCKS) {
    // 1) Noms réellement enregistrés : les modules éteints sont omis,
    //    les commandes dédiées (tickets, jeux…) sont toujours actives.
    const names = block.names.filter((name) => !CMD_DEFS[name] || enabled.includes(name));
    // 2) Filtrage par la visibilité du membre qui consulte l'aide.
    const visible = names.filter((name) => canViewCommandName(name, guild, member));
    if (!visible.length) continue;
    fields.push({ name: block.title, value: fmtChips(visible) });
  }

  // Commandes personnalisées du serveur (toujours publiques, si activées)
  const custom = store.commands.all(botId).filter(c => c.enabled);
  if (custom.length) {
    fields.push({
      name: '🧩 Commandes personnalisées',
      value: custom.map((c) => {
        const trig = c.trigger_type === 'slash' ? `/${c.name}` : c.trigger_type === 'keyword' ? `mot-clé « ${c.trigger_value} »` : `${record.prefix}${c.trigger_value || c.name}`;
        return `\`${trig}\` — ${c.description || 'aucune description'}`;
      }).join('\n').slice(0, 1024),
    });
  }

  const embed = new EmbedBuilder()
    .setColor('#e07a5f')
    .setTitle(`📚 Centre d'aide — ${client.user.username}`)
    .setDescription(helpDescription())
    .setThumbnail(client.user.displayAvatarURL({ dynamic: true }));

  for (const f of fields) embed.addFields(f);

  // Légende discrète quand l'aide a été filtrée pour un membre précis :
  // elle n'apparaît que si des commandes de cette classe existent VRAIMENT
  // sur ce serveur (mais restent invisibles pour le membre qui consulte).
  const hiddenExists = (kindSel) => HELP_BLOCKS.some((b) => b.kind === kindSel && b.names.some((name) => (!CMD_DEFS[name] || enabled.includes(name)) && !canViewCommandName(name, guild, member)));
  const legend = [];
  if (isFiltered && hiddenExists('staff')) legend.push('🛡️ Les commandes de **modération** sont réservées au staff — elles ne sont pas affichées ici.');
  if (isFiltered && hiddenExists('admin')) legend.push('⚙️ Les commandes d\'**administration** sont réservées au propriétaire du serveur et aux Administrateurs.');
  if (legend.length) embed.addFields({ name: '🔒 Commandes invisibles pour toi', value: legend.join('\n') });

  embed.setFooter({
    text: `Préfixe : ${record.prefix} · /help nom_de_la_commande pour le détail · Toutes les commandes fonctionnent automatiquement sur chaque serveur où le bot est présent — aucun compte requis.`,
  });
  return embed;
}

module.exports = { MODULES, CMD_DEFS, ADMIN_COMMAND_NAMES, HELP_BLOCKS, defaultPermissionBitsFor, commandKind, canViewCommandName, enabledModules, enabledCommandNames, buildSlashPayloads, handlePremadePrefix, handlePremadeSlash, buildHelpEmbed, fetchRandomMeme, fetchMemeJson, MEME_FR_SOURCES, MEME_API };
