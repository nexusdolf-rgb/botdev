// ============================================================
// Optimus Prime / Hoxera — Conservation des données (v396)
//
// Pourquoi ce fichier existe : la vérification Discord exige que la
// politique de confidentialité corresponde au code. Or dix familles de
// données n'étaient JAMAIS purgées (XP, économie, quiz, signalements,
// anti-nuke, modmail…), et le départ du bot d'un serveur ne supprimait
// rien du tout.
//
// Deux mécanismes :
//   1. PURGE QUOTIDIENNE (purgeConservation) — branchée sur la maintenance
//      existante. Chaque table a une durée, écrite ICI et nulle part
//      ailleurs : la page /privacy dit exactement ce tableau.
//   2. DÉPART D'UN SERVEUR (noteDepartServeur / purgeGuildesParties) —
//      à la sortie du bot, on note la date. 30 jours plus tard, toutes les
//      données de ce serveur sont effacées, SAUF le registre des sanctions
//      de plateforme (platform_bans), qui doit survivre à la sortie.
//
// Aucune donnée n'est modifiée tant qu'elle est dans sa durée de vie.
// Le module est défensif : une table absente ou en erreur ne casse
// jamais le démarrage ni le nettoyage des autres.
// ============================================================
const store = require('./db');

// ---------- Durées, en jours ----------
// « null » = conservé tant que le serveur utilise le bot (données de
// configuration ou de progression voulues par le serveur), puis effacé
// 30 jours après le départ du bot (voir DEPART_GRACE_DAYS).
const CONSERVATION = {
  // Historique de modération et de sécurité
  automod_logs: 30,              // extrait du message qui a déclenché une règle
  automod_warning_messages: 7,   // références des messages d'avertissement
  automod_strikes: 90,           // compteur de manquements par règle
  automod_temp_bans: 30,         // bannissements temporaires expirés
  warnings: 90,                  // avertissements de modération
  reports: 90,                   // signalements de messages
  antinuke_actions: 90,          // actions anti-nuke (pid de sécurité)
  modmail_threads: 90,           // fils de modmail archivés
  // Tickets
  transcripts: 30,               // contenu complet des tickets fermés
  closed_tickets: 7,             // registre de secours des salons fermés
  // Administration de la plateforme (comptes du dashboard)
  platform_audit_log: 365,       // journal des actions d'administration
  discord_tokens: 30,            // jetons OAuth expirés depuis plus de 30 j
  // Mesures agrégées
  message_stats: 30,
  join_stats: 90,
  cmd_stats: 30,
  // Historique d'achats
  shop_purchases: 90,
  suggestions: 90,
  // Rappels envoyés, giveaways tirés
  reminders: 1,
  giveaways: 30,
  // Données vivantes : pas de purge à la journée, mais un plafond
  quiz_scores: 365,              // classement du quiz
  invite_joins: 365,             // qui a été invité par qui
  afk: 365,                      // statuts AFK abandonnés
  guild_events: 365,             // événements terminés
  guilde_depart: 30,             // délai après le départ du bot (voir plus bas)
};

// Intitulés affichés sur /privacy. Une durée sans intitulé n'est pas
// publiée : le test v396 le vérifie, pour qu'aucune ligne du tableau ne
// puisse mentir sur ce que le code fait réellement.
const LIBELLES = {
  automod_logs: ['Extrait de message en auto-modération', 'Automoderation message excerpt'],
  automod_warning_messages: ['Références des messages d’avertissement', 'Warning message references'],
  automod_strikes: ['Compteur de manquements par règle', 'Per-rule strike counter'],
  automod_temp_bans: ['Bannissement temporaire expiré', 'Expired temporary ban'],
  warnings: ['Avertissement de modération', 'Moderation warning'],
  reports: ['Signalement de message', 'Message report'],
  antinuke_actions: ['Action anti-nuke', 'Anti-nuke action'],
  modmail_threads: ['Fil de modmail fermé', 'Closed modmail thread'],
  transcripts: ['Transcription de ticket', 'Ticket transcript'],
  closed_tickets: ['Registre des salons de ticket fermés', 'Closed ticket channel register'],
  platform_audit_log: ['Journal d’administration de la plateforme', 'Platform administration log'],
  discord_tokens: ['Jeton OAuth2 expiré', 'Expired OAuth2 token'],
  message_stats: ['Statistiques de messages par jour', 'Daily message statistics'],
  join_stats: ['Statistiques d’arrivées par jour', 'Daily join statistics'],
  cmd_stats: ['Statistiques de commandes par jour', 'Daily command statistics'],
  shop_purchases: ['Historique d’achats en boutique', 'Shop purchase history'],
  suggestions: ['Suggestion', 'Suggestion'],
  reminders: ['Rappel envoyé', 'Sent reminder'],
  giveaways: ['Giveaway tiré', 'Drawn giveaway'],
  quiz_scores: ['Classement du quiz', 'Quiz leaderboard'],
  invite_joins: ['Attribution d’invitation', 'Invite attribution'],
  afk: ['Statut AFK', 'AFK status'],
  guild_events: ['Événement terminé', 'Finished event'],
};

// Après le départ du bot, le serveur peut le remettre : on attend 30 j
// avant d'effacer quoi que ce soit.
const DEPART_GRACE_DAYS = CONSERVATION.guilde_depart;

// ---------- Tables de serveur effacées après le départ ----------
// Mêmes colonnes `bot_id`/`guild_id` que dans le reste du code. La liste
// reprend celle de server/routes.js (deleteUserData) et ajoute les tables
// qui n'y figuraient pas.
const TABLES_SERVEUR = [
  'commands', 'modules', 'events', 'guild_settings', 'xp', 'xp_roles', 'economy',
  'quiz_scores', 'warnings', 'reports', 'role_menus', 'tickets', 'settings',
  'shop_items', 'giveaways', 'suggestions', 'temp_roles', 'sanctions',
  'blacklist_words', 'automod_logs', 'automod_member_blacklist',
  'automod_blacklist_counters', 'automod_strikes', 'automod_temp_bans',
  'native_automod_rules', 'automod_warning_messages', 'warning_counters',
  'open_tickets', 'ticket_counters', 'ticket_ratings', 'closed_tickets',
  'transcripts', 'marriages', 'birthdays', 'reminders', 'afk', 'guild_events',
  'cmd_stats', 'scheduled_messages', 'custom_announcements', 'message_stats',
  'join_stats', 'shop_purchases', 'applications', 'voicetemp', 'starboard_posts',
  'invite_uses', 'invite_joins', 'live_socials', 'ticket_log_msgs',
  'advanced_ticket_panels', 'advanced_ticket_channels', 'ticket_menus',
  'modmail_threads', 'antinuke_actions', 'activity', 'embed_templates',
];

// Tables qui ne portent pas de colonne `guild_id` mais une colonne par
// serveur : elles sont traitées séparément (aucune pour l'instant, la
// liste est gardée explicite pour la prochaine qui arriverait).
const TABLES_SERVEUR_HORS_GUILD = [];

// ---------- Registre des départs ----------
// Clé dans la table `settings` : { "<guild_id>": "<ISO>", … }
const CLE_DEPARTS = 'guildes_parties';

function lireDeparts() {
  try {
    const brut = store.settings.get(CLE_DEPARTS);
    const objet = brut ? JSON.parse(brut) : {};
    return objet && typeof objet === 'object' && !Array.isArray(objet) ? objet : {};
  } catch {
    return {};
  }
}

function ecrireDeparts(objet) {
  try {
    store.settings.set(CLE_DEPARTS, JSON.stringify(objet));
  } catch (e) {
    console.error('[Hoxera] registre des départs :', e.message);
  }
}

// Appelé quand le bot quitte un serveur (événement guildDelete).
function noteDepartServeur(botId, guildId) {
  const id = String(guildId || '').trim();
  if (!/^\d{15,21}$/.test(id)) return false;
  const departs = lireDeparts();
  // Déjà noté (redémarrage, événement rejoué) : on garde la PREMIÈRE date,
  // sinon un simple redéploiement repousserait l'effacement.
  if (!departs[id]) {
    departs[id] = new Date().toISOString();
    ecrireDeparts(departs);
    console.log(`[Hoxera] départ noté : serveur ${id} — données effacées dans ${DEPART_GRACE_DAYS} j s'il ne revient pas`);
  }
  // Un serveur qui revient annule son départ.
  try {
    const entry = require('./discord/botManager').clients && require('./discord/botManager').clients.get(botId);
    const guild = entry && entry.client && entry.client.guilds && entry.client.guilds.cache.get(id);
    if (guild) oublieDepart(id);
  } catch { /* lecture d'état uniquement */ }
  return true;
}

// Le bot revient sur le serveur : on annule le compte à rebours.
function oublieDepart(guildId) {
  const id = String(guildId || '');
  const departs = lireDeparts();
  if (!departs[id]) return false;
  delete departs[id];
  ecrireDeparts(departs);
  console.log(`[Hoxera] retour du bot : serveur ${id} — effacement annulé`);
  return true;
}

// ---------- Effacement d'un serveur ----------
function effaceGuild(db, guildId) {
  const id = String(guildId || '');
  if (!/^\d{15,21}$/.test(id)) return 0;
  let total = 0;
  for (const table of TABLES_SERVEUR) {
    try {
      total += db.prepare(`DELETE FROM ${table} WHERE guild_id = ?`).run(id).changes;
    } catch { /* table absente sur une base ancienne : on continue */ }
  }
  for (const table of TABLES_SERVEUR_HORS_GUILD) {
    try {
      total += db.prepare(`DELETE FROM ${table} WHERE guild_id = ?`).run(id).changes;
    } catch { /* idem */ }
  }
  return total;
}

// ---------- Purge quotidienne ----------
function purgeConservation(db, maintenant = Date.now()) {
  // Seules les suppressions RÉELLES sont rapportées : une table sans ligne
  // ancienne ne doit pas encombrer le journal (ni fausser le décompte d'un
  // ancien test qui comptait les entrées nettoyées).
  const rapport = {};
  const note = (cle, lignes) => { if (lignes > 0) rapport[cle] = lignes; };
  const jour = (n) => `-${n} days`;

  // 1) Tables datées par `created_at` (format SQLite « YYYY-MM-DD HH:MM:SS »)
  const parCreatedAt = [
    'automod_logs', 'automod_strikes', 'automod_temp_bans', 'warnings',
    'reports', 'transcripts', 'platform_audit_log', 'shop_purchases',
    'suggestions',
  ];
  for (const table of parCreatedAt) {
    const jours = nombre(CONSERVATION[table]);
    if (jours === null) continue;
    try {
      note(table, db.prepare(`DELETE FROM ${table} WHERE created_at < datetime('now', ?)`)
        .run(jour(jours)).changes);
    } catch { /* colonne absente : on n'invente rien */ }
  }

  // 2) Tables datées par `closed_at` (modmail) : on ne purge que les fils
  //    réellement fermés — un fil ouvert garde sa place.
  try {
    note('modmail_threads', db.prepare(
      `DELETE FROM modmail_threads WHERE closed = 1 AND closed_at != '' AND closed_at < datetime('now', ?)`,
    ).run(jour(nombre(CONSERVATION.modmail_threads))).changes);
  } catch { /* ignore */ }

  // 3) Colonnes numériques « millisecondes »
  try {
    note('quiz_scores', db.prepare(
      `DELETE FROM quiz_scores WHERE updated_at != '' AND updated_at < datetime('now', ?)`,
    ).run(jour(nombre(CONSERVATION.quiz_scores))).changes);
  } catch {}
  try {
    note('invite_joins', db.prepare(`DELETE FROM invite_joins WHERE joined_at < datetime('now', ?)`)
      .run(jour(nombre(CONSERVATION.invite_joins))).changes);
  } catch {}
  try {
    note('afk', db.prepare(`DELETE FROM afk WHERE since_ts < ?`)
      .run(maintenant - nombre(CONSERVATION.afk) * 86400000).changes);
  } catch {}
  try {
    note('guild_events', db.prepare(`DELETE FROM guild_events WHERE starts_at < ?`)
      .run(maintenant - nombre(CONSERVATION.guild_events) * 86400000).changes);
  } catch {}

  // 3 bis) Anti-nuke : `created_at` y est un horodatage en SECONDES, il ne se
  //        compare donc pas à datetime('now'). Une requête dédiée.
  try {
    const limiteAntinuke = Math.floor((maintenant - nombre(CONSERVATION.antinuke_actions) * 86400000) / 1000);
    note('antinuke_actions', db.prepare(`DELETE FROM antinuke_actions WHERE created_at < ?`)
      .run(limiteAntinuke).changes);
  } catch {}

  // 4) Jetons OAuth expirés depuis plus que la durée : plus rien à en faire.
  try {
    note('discord_tokens', db.prepare(`DELETE FROM discord_tokens WHERE expires_at < datetime('now', ?)`)
      .run(jour(nombre(CONSERVATION.discord_tokens))).changes);
  } catch {}

  // 5) Purges déjà existantes (voir server/maintenance.js) : on ne les
  //    réécrit pas ici, elles restent la référence pour message_stats,
  //    join_stats, cmd_stats, reminders, giveaways, closed_tickets et
  //    automod_warning_messages.

  // 6) Serveurs partis depuis plus que le délai de grâce.
  const limite = maintenant - DEPART_GRACE_DAYS * 86400000;
  const departs = lireDeparts();
  let serveurs = 0;
  let lignes = 0;
  let aJour = false;
  for (const [guildId, iso] of Object.entries(departs)) {
    const date = Date.parse(iso);
    if (!Number.isFinite(date)) { delete departs[guildId]; aJour = true; continue; }
    if (date > limite) continue;
    lignes += effaceGuild(db, guildId);
    delete departs[guildId];
    aJour = true;
    serveurs += 1;
  }
  if (aJour) ecrireDeparts(departs);
  if (serveurs) {
    rapport.serveurs_partis = serveurs;
    rapport.lignes_serveurs_partis = lignes;
  }

  return rapport;
}

function nombre(valeur) {
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---------- Vue lisible pour la page /privacy ----------
// Renvoie le tableau tel qu'il sera affiché : une seule source de vérité.
function tableauConservation() {
  return Object.entries(CONSERVATION)
    .filter(([cle]) => cle !== 'guilde_depart')
    .map(([cle, jours]) => {
      const [fr, en] = LIBELLES[cle] || ['', ''];
      const texte = jours === 1 ? ['1 jour', '1 day'] : [`${jours} jours`, `${jours} days`];
      return { cle, jours, fr, en, frDuree: texte[0], enDuree: texte[1] };
    });
}

module.exports = {
  CONSERVATION,
  LIBELLES,
  DEPART_GRACE_DAYS,
  TABLES_SERVEUR,
  purgeConservation,
  noteDepartServeur,
  oublieDepart,
  effaceGuild,
  tableauConservation,
  lireDeparts,
};
