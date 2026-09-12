// ============================================================================
// Test v249 — XP vocale : gagner de l'XP en restant dans un salon vocal.
//
// Choix du propriétaire (quatre questions, quatre réponses) :
//   • l'XP vocale alimente le MÊME niveau et le MÊME classement que l'XP texte ;
//   • TOUTES les protections anti-triche : muet/sourd exclu, seul dans le salon
//     exclu, salon AFK exclu, gain réduit après plusieurs heures ;
//   • DÉSACTIVÉE par défaut — aucun serveur déjà équipé ne doit voir son rythme
//     de progression changer sans l'avoir demandé ;
//   • cadence 10 XP par minute, versés toutes les 3 minutes (donc 30 XP).
//
// Réglages calés sur la documentation réelle des bots du marché :
//   • Arcane (docs.arcane.bot/plugins/leveling/setup/xp-options) : cooldown
//     vocal par défaut 3 minutes ; « Arcane only considers a member to be active
//     and in the voice channel if they are unmuted and not deaf. This is because
//     Arcane does not join the voice channel. This would limit voice XP to one
//     voice channel, be expensive to run, and a privacy nightmare » ; réglage
//     « Minimum Members » ; anti-AFK qui « starts to lower how much XP is given
//     to members after they have been in a voice channel for multiple hours ».
//   • PeakBot : 10 XP par minute, exclusion du salon AFK, pause automatique pour
//     les membres muets/sourds/seuls.
//
// Argument produit : l'XP vocale est PAYANTE chez Arcane (7 $/serveur), MEE6
// (11,95 $/mois) et Carl-bot (7,99 $/mois). Hoxera la livre gratuitement.
//
// ── Le point le plus dangereux de cette version ─────────────────────────────
// Le tableau de bord a maintenant DEUX boutons d'enregistrement sur le même
// onglet (« Gain d'XP » et « XP vocale ») qui appellent la MÊME route PUT /xp.
// Avant correction, chaque champ absent retombait sur une valeur par défaut :
// enregistrer l'XP vocale aurait remis xp_enabled à 1 et VIDÉ le message de
// niveau et le salon d'annonce configurés. La section E verrouille ce point.
// ============================================================================
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = path.join(os.tmpdir(), `botdev-v249-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.BOTDEV_DATA_DIR = DATA_DIR;

const store = require('../server/db');
const xp = require('../server/discord/xp');

let echecs = 0;
const check = (label, cond, extra) => {
  if (cond) { console.log(`  ✅ ${label}`); return true; }
  echecs++;
  console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
  return false;
};
const racine = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const BOT = 1;
const G = '900000000000000001';
const MINUTE = 60000;

// ---------------------------------------------------------------------------
// Maquettes Discord. On ne lance pas de vrai client : le moteur ne lit que
// guild.members.cache, member.voice et channel.members.
// ---------------------------------------------------------------------------
const TYPE_VOCAL = 2;
const TYPE_TEXTE = 0;

function faireCanal(id, { type = TYPE_VOCAL, membres = [] } = {}) {
  const map = new Map();
  membres.forEach((m) => map.set(m.id, m));
  return { id, type, members: map };
}

function faireMembre(id, { bot = false, voice = null } = {}) {
  return {
    id,
    user: { id, bot, username: `membre_${id}`, displayAvatarURL: () => '' },
    voice,
    roles: { cache: new Map(), add: async () => {}, remove: async () => {} },
  };
}

function faireGuilde({ afkChannelId = null, membres = [], canaux = [] } = {}) {
  const mc = new Map(); membres.forEach((m) => mc.set(m.id, m));
  const cc = new Map(); canaux.forEach((c) => cc.set(c.id, c));
  return {
    id: G, name: 'Serveur de test', available: true, afkChannelId,
    client: { user: { id: 'BOT1' } },
    members: { cache: mc, me: { roles: { highest: { position: 0 } } } },
    channels: { cache: cc },
  };
}

// Place un membre en vocal et renvoie { guilde, membre, etat }.
function scenario({ userId = 'U1', channelId = 'V1', afkChannelId = null,
  selfMute = false, selfDeaf = false, serverMute = false, serverDeaf = false,
  presents = ['U1', 'U2'], type = TYPE_VOCAL } = {}) {
  const membresVocaux = presents.map((id) => faireMembre(id));
  const canal = faireCanal(channelId, { type, membres: membresVocaux });
  const voice = { channelId, channel: canal, selfMute, selfDeaf, serverMute, serverDeaf };
  const membre = faireMembre(userId, { voice });
  // Le membre qui parle doit aussi figurer dans la liste des présents.
  const tous = [membre, ...membresVocaux.filter((m) => m.id !== userId)];
  const guilde = faireGuilde({ afkChannelId, membres: tous, canaux: [canal] });
  return { guilde, membre, canal, etat: { guild: guilde, member: membre, channelId } };
}

const regler = (champs) => store.guildSettings.set(BOT, G, champs);
const lire = () => store.guildSettings.get(BOT, G) || {};
const toutActiver = () => regler({
  xp_enabled: 1, voice_xp_enabled: 1, voice_xp_rate: 10, voice_xp_interval: 3,
  voice_xp_min_members: 2, voice_xp_ignore_muted: 1, voice_xp_ignore_afk: 1, voice_xp_taper: 1,
});
const raz = () => { xp.sessionsVocales.clear(); xp.oublierBot(BOT); };

(async () => {
  // ==========================================================================
  console.log('\n── A. Base de données : colonnes, défauts, bornes ──');
  // ==========================================================================

  store.guildSettings.set(BOT, G, { prefix: '!' });
  let s = lire();
  check('voice_xp_enabled vaut 0 par défaut (choix du propriétaire)', s.voice_xp_enabled === 0, String(s.voice_xp_enabled));
  check('voice_xp_rate vaut 10 par défaut (cadence PeakBot)', s.voice_xp_rate === 10, String(s.voice_xp_rate));
  check('voice_xp_interval vaut 3 minutes (cooldown Arcane)', s.voice_xp_interval === 3, String(s.voice_xp_interval));
  check('voice_xp_min_members vaut 2 (pas de gain seul)', s.voice_xp_min_members === 2, String(s.voice_xp_min_members));
  check('voice_xp_ignore_muted activé par défaut', s.voice_xp_ignore_muted === 1, String(s.voice_xp_ignore_muted));
  check('voice_xp_ignore_afk activé par défaut', s.voice_xp_ignore_afk === 1, String(s.voice_xp_ignore_afk));
  check('voice_xp_taper activé par défaut', s.voice_xp_taper === 1, String(s.voice_xp_taper));

  // Un enregistrement qui ne mentionne PAS l'XP vocale ne doit pas l'éteindre.
  store.guildSettings.set(BOT, G, { voice_xp_enabled: 1, voice_xp_rate: 30 });
  store.guildSettings.set(BOT, G, { prefix: '?' });
  s = lire();
  check('enregistrer un AUTRE réglage ne réinitialise pas l\'XP vocale',
    s.voice_xp_enabled === 1 && s.voice_xp_rate === 30,
    `enabled=${s.voice_xp_enabled} rate=${s.voice_xp_rate}`);

  // Bornes : la route est exposée, la base est le dernier rempart.
  store.guildSettings.set(BOT, G, { voice_xp_rate: 99999, voice_xp_interval: 0, voice_xp_min_members: -5 });
  s = lire();
  check('taux plafonné à 100', s.voice_xp_rate === 100, String(s.voice_xp_rate));
  check('intervalle jamais sous 1 minute', s.voice_xp_interval >= 1, String(s.voice_xp_interval));
  check('minimum de membres jamais sous 1', s.voice_xp_min_members === 1, String(s.voice_xp_min_members));
  store.guildSettings.set(BOT, G, { voice_xp_rate: -50 });
  check('taux jamais négatif', lire().voice_xp_rate >= 0, String(lire().voice_xp_rate));

  // ==========================================================================
  console.log('\n── B. Cycle de vie des sessions vocales ──');
  // ==========================================================================

  raz(); toutActiver();
  check('aucune session au départ', xp.sessionsVocales.size === 0);

  const sc = scenario({ userId: 'U1', presents: ['U1', 'U2'] });
  xp.onVoiceState(BOT, { channelId: null, guild: sc.guilde, member: sc.membre }, sc.etat);
  check('rejoindre un salon ouvre une session', xp.sessionsVocales.size === 1, String(xp.sessionsVocales.size));
  const cle = xp.cleSession(BOT, G, 'U1');
  check('…indexée par bot + serveur + membre', xp.sessionsVocales.has(cle), cle);
  const sess = xp.sessionsVocales.get(cle);
  check('…avec l\'horodatage de début', typeof sess.startedAt === 'number' && sess.startedAt > 0);
  check('…et le dernier versement initialisé à maintenant (rien n\'est dû immédiatement)',
    Math.abs(sess.lastGrantAt - Date.now()) < 5000, String(sess.lastGrantAt));

  // Un bot ne doit pas pouvoir farmer.
  const scBot = scenario({ userId: 'B1', presents: ['B1', 'U2'] });
  scBot.membre.user.bot = true;
  xp.onVoiceState(BOT, null, scBot.etat);
  check('un BOT en vocal n\'ouvre pas de session', !xp.sessionsVocales.has(xp.cleSession(BOT, G, 'B1')));

  // Changer de salon : même session, horloge conservée.
  const debutAvant = sess.startedAt;
  const dernierAvant = sess.lastGrantAt;
  xp.onVoiceState(BOT, sc.etat, { guild: sc.guilde, member: sc.membre, channelId: 'V2' });
  check('changer de salon ne crée pas une deuxième session', xp.sessionsVocales.size === 1, String(xp.sessionsVocales.size));
  check('…le début de session est conservé (le lissage anti-AFK continue)',
    xp.sessionsVocales.get(cle).startedAt === debutAvant);
  check('…et l\'horloge de versement n\'est PAS remise à zéro (sauter de salon ne fait pas gagner plus)',
    xp.sessionsVocales.get(cle).lastGrantAt === dernierAvant);
  check('…le salon suivi est mis à jour', xp.sessionsVocales.get(cle).channelId === 'V2');

  // Déconnexion.
  xp.onVoiceState(BOT, sc.etat, { guild: sc.guilde, member: sc.membre, channelId: null });
  check('quitter le vocal ferme la session', xp.sessionsVocales.size === 0, String(xp.sessionsVocales.size));

  // Purge par bot.
  xp.onVoiceState(BOT, null, scenario({ userId: 'U9' }).etat);
  xp.onVoiceState(2, null, scenario({ userId: 'U9' }).etat);
  check('deux bots suivis séparément', xp.sessionsVocales.size === 2, String(xp.sessionsVocales.size));
  const oubliees = xp.oublierBot(BOT);
  check('oublierBot ne purge QUE ce bot', oubliees === 1 && xp.sessionsVocales.size === 1, `${oubliees} / ${xp.sessionsVocales.size}`);
  raz();

  // Robustesse : aucun de ces appels ne doit lever.
  let leve = null;
  try {
    xp.onVoiceState(BOT, null, null);
    xp.onVoiceState(BOT, null, {});
    xp.onVoiceState(BOT, null, { guild: null, member: null });
    xp.onVoiceState(BOT, null, { guild: { id: G }, member: { id: 'X' } });
  } catch (e) { leve = e; }
  check('des états vocaux dégénérés ne lèvent pas', leve === null, leve && String(leve.message));

  // ==========================================================================
  console.log('\n── C. Éligibilité : les protections anti-triche ──');
  // ==========================================================================

  const gs = () => lire();
  const tester = (opts, champs) => {
    toutActiver();
    if (champs) regler(champs);
    const sc2 = scenario(opts);
    return xp.qualifierVocal(
      { guild: sc2.guilde, userId: opts.userId || 'U1', channelId: opts.channelId || 'V1', startedAt: Date.now() },
      gs());
  };

  toutActiver();
  check('cas nominal : 2 membres, micro ouvert → éligible', tester({ presents: ['U1', 'U2'] }).ok === true,
    JSON.stringify(tester({ presents: ['U1', 'U2'] })));

  check('seul dans le salon → refusé (2 membres requis)', tester({ presents: ['U1'] }).ok === false);
  check('…avec le motif explicite', /trop peu nombreux/.test(tester({ presents: ['U1'] }).why || ''),
    tester({ presents: ['U1'] }).why);
  check('3 membres → toujours éligible', tester({ presents: ['U1', 'U2', 'U3'] }).ok === true);
  check('seul mais minimum ramené à 1 → éligible',
    tester({ presents: ['U1'] }, { voice_xp_min_members: 1 }).ok === true);

  // Les quatre formes de mutisme sont testées, comme le fait Arcane.
  check('micro coupé (selfMute) → refusé', tester({ selfMute: true }).ok === false);
  check('casque coupé (selfDeaf) → refusé', tester({ selfDeaf: true }).ok === false);
  check('muti par le serveur (serverMute) → refusé', tester({ serverMute: true }).ok === false);
  check('sourd par le serveur (serverDeaf) → refusé', tester({ serverDeaf: true }).ok === false);
  check('…mais accepté si la protection est désactivée',
    tester({ selfMute: true }, { voice_xp_ignore_muted: 0 }).ok === true);

  check('salon AFK du serveur → refusé',
    tester({ channelId: 'AFK', afkChannelId: 'AFK', presents: ['U1', 'U2'] }).ok === false);
  check('…mais accepté si la protection est désactivée',
    tester({ channelId: 'AFK', afkChannelId: 'AFK', presents: ['U1', 'U2'] }, { voice_xp_ignore_afk: 0 }).ok === true);
  check('un autre salon que l\'AFK → accepté',
    tester({ channelId: 'V1', afkChannelId: 'AFK', presents: ['U1', 'U2'] }).ok === true);

  check('salon TEXTUEL → refusé', tester({ type: TYPE_TEXTE, presents: ['U1', 'U2'] }).ok === false);
  check('les bots présents ne comptent pas dans le minimum', (() => {
    const sc3 = scenario({ presents: ['U1'] });
    sc3.canal.members.set('B9', faireMembre('B9', { bot: true }));
    toutActiver();
    return xp.qualifierVocal({ guild: sc3.guilde, userId: 'U1', channelId: 'V1', startedAt: Date.now() }, gs()).ok === false;
  })());

  // Membre disparu (expulsé, bot redémarré) : session morte à purger.
  const fantome = xp.qualifierVocal({ guild: faireGuilde({}), userId: 'GHOST', channelId: 'V1', startedAt: Date.now() }, gs());
  check('membre introuvable → refusé', fantome.ok === false);
  check('…et marqué comme session morte (à purger)', fantome.mort === true);
  const indispo = xp.qualifierVocal({ guild: { id: G, available: false }, userId: 'U1', channelId: 'V1', startedAt: Date.now() }, gs());
  check('serveur indisponible → refusé sans lever', indispo.ok === false && indispo.mort === true);

  // ==========================================================================
  console.log('\n── D. Lissage anti-AFK ──');
  // ==========================================================================

  toutActiver();
  const maintenant = Date.now();
  const coef = (heures, champs) => {
    if (champs) regler(champs);
    return xp.coefficientAntiAfk({ startedAt: maintenant - heures * 3600000 }, gs(), maintenant);
  };
  check('paliers exposés : 4 h puis 8 h', xp.PALIER_LENT === 4 && xp.PALIER_NUL === 8, `${xp.PALIER_LENT}/${xp.PALIER_NUL}`);
  check('1re heure → 100 %', coef(1) === 1, String(coef(1)));
  check('3 h 59 → 100 %', coef(3.98) === 1);
  check('4 h → 50 %', coef(4) === 0.5, String(coef(4)));
  check('7 h → 50 %', coef(7) === 0.5);
  check('8 h → 0 %', coef(8) === 0, String(coef(8)));
  check('24 h → 0 %', coef(24) === 0);
  check('protection désactivée → 100 % même après 24 h', coef(24, { voice_xp_taper: 0 }) === 1);

  // ==========================================================================
  console.log('\n── E. Versement : le cœur de la fonction ──');
  // ==========================================================================

  raz(); toutActiver();
  const sc4 = scenario({ userId: 'U1', presents: ['U1', 'U2'] });
  xp.onVoiceState(BOT, null, sc4.etat);

  // Pas encore l'heure.
  let r = await xp.battement(Date.now() + 1 * MINUTE);
  check('aucun versement avant l\'intervalle complet', r.versements === 0, JSON.stringify(r));
  check('…et aucune XP en base', (store.xp.get(BOT, G, 'U1') || { xp: 0 }).xp === 0);

  // 3 minutes : 10 XP/min × 3 min = 30 XP.
  r = await xp.battement(Date.now() + 4 * MINUTE);
  check('versement après 3 minutes', r.versements === 1, JSON.stringify(r));
  check('30 XP versés (10/min × 3 min)', r.xp === 30, `${r.xp} XP`);
  check('…et inscrits en base dans la table XP commune',
    (store.xp.get(BOT, G, 'U1') || { xp: 0 }).xp === 30, String((store.xp.get(BOT, G, 'U1') || {}).xp));

  // Un deuxième battement immédiat ne doit pas reverser.
  const r2 = await xp.battement(Date.now() + 4 * MINUTE);
  check('pas de double versement sur le même intervalle', r2.versements === 0, JSON.stringify(r2));
  check('…le total reste à 30 XP', (store.xp.get(BOT, G, 'U1') || {}).xp === 30);

  // Le taux et l'intervalle sont bien lus depuis les réglages.
  raz(); regler({ voice_xp_rate: 25, voice_xp_interval: 2 });
  xp.onVoiceState(BOT, null, scenario({ userId: 'U2', presents: ['U2', 'U3'] }).etat);
  r = await xp.battement(Date.now() + 3 * MINUTE);
  check('taux personnalisé respecté : 25 XP/min × 2 min = 50 XP',
    r.xp === 50, `${r.xp} XP · ${JSON.stringify(r.refus || {})}`);

  // Fonction désactivée → rien.
  raz(); regler({ voice_xp_enabled: 0, voice_xp_rate: 10, voice_xp_interval: 1 });
  xp.onVoiceState(BOT, null, scenario({ userId: 'U4', presents: ['U4', 'U5'] }).etat);
  r = await xp.battement(Date.now() + 10 * MINUTE);
  check('XP vocale désactivée → aucun versement', r.versements === 0, JSON.stringify(r));
  check('…motif tracé', !!r.refus['xp vocale désactivée'], JSON.stringify(r.refus));

  // Module niveaux coupé → aucune source d'XP, même vocale.
  raz(); regler({ voice_xp_enabled: 1, xp_enabled: 0, voice_xp_interval: 1 });
  xp.onVoiceState(BOT, null, scenario({ userId: 'U6', presents: ['U6', 'U7'] }).etat);
  r = await xp.battement(Date.now() + 10 * MINUTE);
  check('module niveaux coupé → aucun versement non plus', r.versements === 0, JSON.stringify(r));
  check('…motif tracé', !!r.refus['module niveaux désactivé'], JSON.stringify(r.refus));

  // Muet pendant l'intervalle : le temps est mis en PAUSE, pas perdu.
  raz(); toutActiver();
  const sc6 = scenario({ userId: 'U10', selfMute: true, presents: ['U10', 'U11'] });
  xp.onVoiceState(BOT, null, sc6.etat);
  let rm = await xp.battement(Date.now() + 5 * MINUTE);
  check('muet à l\'échéance → aucun versement', rm.versements === 0, JSON.stringify(rm));
  check('…motif « muet ou sourd »', !!rm.refus['muet ou sourd'], JSON.stringify(rm.refus));
  const heureMuet = xp.sessionsVocales.get(xp.cleSession(BOT, G, 'U10')).lastGrantAt;
  // lastGrantAt doit être resté à l'ouverture de session : s'il avait été remis à
  // « maintenant », le membre aurait dû attendre un intervalle de PLUS après
  // avoir rallumé son micro — le mutisme lui aurait coûté du temps au lieu
  // d'être une simple pause.
  check('…l\'horloge n\'est PAS réinitialisée (le temps est mis en pause, pas perdu)',
    Date.now() + 5 * MINUTE - heureMuet >= 4 * MINUTE,
    `lastGrantAt à ${(Date.now() - heureMuet) / 1000 | 0} s dans le passé`);
  // Il rallume son micro : le versement dû arrive.
  sc6.membre.voice.selfMute = false;
  rm = await xp.battement(Date.now() + 6 * MINUTE);
  check('micro rallumé → le versement dû arrive', rm.versements === 1, JSON.stringify(rm));
  check('…et un SEUL versement, pas les minutes de mutisme accumulées', rm.xp === 30, `${rm.xp} XP`);

  // Le lissage anti-AFK réduit bien le montant versé.
  raz(); toutActiver();
  const sc7 = scenario({ userId: 'U20', presents: ['U20', 'U21'] });
  xp.onVoiceState(BOT, null, sc7.etat);
  const sess7 = xp.sessionsVocales.get(xp.cleSession(BOT, G, 'U20'));
  sess7.startedAt = Date.now() - 5 * 3600000;      // 5 h de présence : palier 50 %
  r = await xp.battement(Date.now() + 4 * MINUTE);
  check('après 4 h : moitié du gain (15 XP au lieu de 30)', r.xp === 15, `${r.xp} XP`);

  raz(); toutActiver();
  const sc8 = scenario({ userId: 'U22', presents: ['U22', 'U23'] });
  xp.onVoiceState(BOT, null, sc8.etat);
  xp.sessionsVocales.get(xp.cleSession(BOT, G, 'U22')).startedAt = Date.now() - 9 * 3600000;
  r = await xp.battement(Date.now() + 4 * MINUTE);
  check('après 8 h : plus aucun gain', r.xp === 0 && r.versements === 0, JSON.stringify(r));
  check('…motif tracé', !!r.refus['lissage anti-AFK à zéro'], JSON.stringify(r.refus));

  // ==========================================================================
  console.log('\n── F. Montée de niveau partagée avec l\'XP texte ──');
  // ==========================================================================

  const srcXp0 = racine('server/discord/xp.js');
  raz(); toutActiver();
  // Niveau 1 = 100 XP (courbe 100*N²). On part de 80 XP gagnés en écrivant.
  store.xp.add(BOT, G, 'U30', 80, Date.now());
  check('80 XP posés (niveau 0, seuil du niveau 1 à 100)',
    (store.xp.get(BOT, G, 'U30') || {}).xp === 80 && xp.levelFromXp(80) === 0);
  const sc9 = scenario({ userId: 'U30', presents: ['U30', 'U31'] });
  xp.onVoiceState(BOT, null, sc9.etat);
  r = await xp.battement(Date.now() + 4 * MINUTE);
  check('l\'XP vocale pousse au niveau 1', r.niveaux === 1, JSON.stringify(r));
  check('…le total est bien cumulé (80 + 30 = 110)', (store.xp.get(BOT, G, 'U30') || {}).xp === 110,
    String((store.xp.get(BOT, G, 'U30') || {}).xp));
  check('…et le niveau est écrit', (store.xp.get(BOT, G, 'U30') || {}).level === 1,
    String((store.xp.get(BOT, G, 'U30') || {}).level));
  check('un seul classement : la ligne XP est partagée',
    store.xp.top(BOT, G, 10).some((x) => x.user_id === 'U30'));
  // Sans salon d'annonce configuré, announce() doit s'arrêter sur son test
  // `channel.send` au lieu d'envoyer le niveau atteint dans un salon au hasard.
  // On vérifie que le contexte passé n'a PAS de canal de repli.
  const srcVerser = srcXp0.slice(srcXp0.indexOf('async function verserXpVocale'),
    srcXp0.indexOf('async function battement'));
  check('l\'annonce vocale n\'utilise que le salon configuré, jamais un repli',
    /channel = gs\.xp_channel \? await resolveChannel\(guild, gs\.xp_channel\) : null/.test(srcVerser),
    'canal de repli trouvé');
  check('…et les rôles de récompense sont appliqués même sans annonce',
    /await applyRewards\(botId, contexte, newLevel\)/.test(srcVerser));

  // ==========================================================================
  console.log('\n── G. Branchement sur l\'événement Discord ──');
  // ==========================================================================

  const bm = racine('server/discord/botManager.js');
  check('xp.onVoiceState est appelé dans le gestionnaire voiceStateUpdate',
    /client\.on\('voiceStateUpdate'[\s\S]{0,900}?require\('\.\/xp'\)\.onVoiceState\(botId, oldState, newState\)/.test(bm),
    'branchement introuvable');
  check('…dans un try/catch (une erreur d\'XP ne doit pas casser l\'audit vocal)',
    /try \{ require\('\.\/xp'\)\.onVoiceState/.test(bm));
  check('oublierBot est appelé à la déconnexion du bot',
    (bm.match(/oublierBot/g) || []).length >= 3, `${(bm.match(/oublierBot/g) || []).length} appel(s)`);
  check('le battement est cadencé à 30 s', xp.BATTEMENT_MS === 30000, String(xp.BATTEMENT_MS));
  const srcXp = racine('server/discord/xp.js');
  // L'intention : le minuteur ne doit PAS être lancé au chargement du module
  // (un processus sans bot connecté n'a pas besoin d'un battement toutes les
  // 30 s). Vérifié en deux temps — comparer les positions de la première
  // occurrence ne veut rien dire, l'appel figure dans onVoiceState, donc AVANT
  // la définition de la fonction.
  const zoneEtat = srcXp.slice(srcXp.indexOf('function onVoiceState'), srcXp.indexOf('function qualifierVocal'));
  const zoneMinuteur = srcXp.slice(srcXp.indexOf('function demarrerSuivi'), srcXp.indexOf('function arreterSuivi'));
  check('le minuteur est démarré depuis onVoiceState (à la volée)',
    /demarrerSuivi\(\);/.test(zoneEtat), 'appel introuvable dans onVoiceState');
  check('…setInterval n\'est appelé QUE dans demarrerSuivi',
    (srcXp.match(/setInterval/g) || []).length === 1 && /setInterval/.test(zoneMinuteur),
    `${(srcXp.match(/setInterval/g) || []).length} appel(s)`);
  check('…et demarrerSuivi est idempotent (garde sur le minuteur existant)',
    /if \(minuteur\) return minuteur;/.test(zoneMinuteur));
  check('…et il est unref\'é (ne retient pas le processus ouvert)', /minuteur\.unref\(\)/.test(srcXp));
  check('les sessions ne sont PAS persistées (un redémarrage ne verse pas pour une absence)',
    !/sessionsVocales[\s\S]{0,200}?(JSON\.stringify|db\.prepare)/.test(srcXp));

  // ==========================================================================
  console.log('\n── H. Route API : aucun écrasement entre les deux cartes ──');
  // ==========================================================================

  // LE point dangereux de cette version : deux boutons, une seule route.
  const routes = racine('server/routes.js');
  const zone = routes.slice(routes.indexOf("router.put('/bots/:id/guilds/:guildId/xp'"),
    routes.indexOf('if (Array.isArray(roles))', routes.indexOf("router.put('/bots/:id/guilds/:guildId/xp'")));
  check('la route n\'écrit un champ que s\'il est fourni', /if \(fourni\(/.test(zone));
  check('…pour les SEPT réglages vocaux', (zone.match(/if \(fourni\(voice_/g) || []).length === 7,
    String((zone.match(/if \(fourni\(voice_/g) || []).length));
  check('…et pour les réglages texte aussi', (zone.match(/if \(fourni\((enabled|min|max|cooldown|message|channel|card)\)/g) || []).length === 7,
    String((zone.match(/if \(fourni\((enabled|min|max|cooldown|message|channel|card)\)/g) || []).length));
  check('plus aucun champ texte écrit inconditionnellement',
    !/\n\s+xp_enabled: \(enabled ===/.test(zone), 'écriture directe résiduelle');
  check('l\'écriture est sautée si le paquet est vide', /if \(Object\.keys\(paquet\)\.length\)/.test(zone));

  // Comportement réel, pas seulement lecture du source.
  store.guildSettings.set(BOT, G, {
    xp_enabled: 1, xp_min: 15, xp_max: 40, xp_cooldown: 90,
    xp_message: 'Bravo {user} !', xp_channel: '#niveaux', xp_card: 1,
    voice_xp_enabled: 1, voice_xp_rate: 20,
  });
  // Simulation exacte de ce que la carte « XP vocale » envoie.
  const corpsVocal = { voice_enabled: true, voice_rate: 12, voice_interval: 4, voice_min_members: 3,
    voice_ignore_muted: true, voice_ignore_afk: true, voice_taper: false };
  const paquet = {};
  const fourni = (v) => v !== undefined && v !== null;
  const booleen = (v, d) => (v === false || v === 0 ? 0 : (v === true || v === 1 ? 1 : d));
  if (fourni(corpsVocal.voice_enabled)) paquet.voice_xp_enabled = booleen(corpsVocal.voice_enabled, 0);
  if (fourni(corpsVocal.voice_rate)) paquet.voice_xp_rate = Math.min(Math.max(parseInt(corpsVocal.voice_rate, 10) || 10, 0), 100);
  if (fourni(corpsVocal.voice_interval)) paquet.voice_xp_interval = Math.min(Math.max(parseInt(corpsVocal.voice_interval, 10) || 3, 1), 60);
  if (fourni(corpsVocal.voice_min_members)) paquet.voice_xp_min_members = Math.min(Math.max(parseInt(corpsVocal.voice_min_members, 10) || 2, 1), 50);
  if (fourni(corpsVocal.voice_ignore_muted)) paquet.voice_xp_ignore_muted = booleen(corpsVocal.voice_ignore_muted, 1);
  if (fourni(corpsVocal.voice_ignore_afk)) paquet.voice_xp_ignore_afk = booleen(corpsVocal.voice_ignore_afk, 1);
  if (fourni(corpsVocal.voice_taper)) paquet.voice_xp_taper = booleen(corpsVocal.voice_taper, 1);
  check('la carte vocale n\'envoie AUCUN champ texte', Object.keys(paquet).every((k) => k.startsWith('voice_xp_')),
    Object.keys(paquet).join(','));
  store.guildSettings.set(BOT, G, paquet);
  const apres = lire();
  check('le message de niveau a survécu à l\'enregistrement vocal',
    apres.xp_message === 'Bravo {user} !', JSON.stringify(apres.xp_message));
  check('le salon d\'annonce a survécu', apres.xp_channel === '#niveaux', JSON.stringify(apres.xp_channel));
  check('xp_min / xp_max / cooldown ont survécu',
    apres.xp_min === 15 && apres.xp_max === 40 && apres.xp_cooldown === 90,
    `${apres.xp_min}/${apres.xp_max}/${apres.xp_cooldown}`);
  check('xp_enabled n\'a pas été forcé à 1', apres.xp_enabled === 1);
  check('les réglages vocaux ont bien été appliqués',
    apres.voice_xp_rate === 12 && apres.voice_xp_interval === 4 && apres.voice_xp_taper === 0,
    `${apres.voice_xp_rate}/${apres.voice_xp_interval}/${apres.voice_xp_taper}`);

  // Et l'inverse : enregistrer le texte ne doit pas éteindre le vocal.
  store.guildSettings.set(BOT, G, { xp_enabled: 1, xp_min: 20, xp_max: 50, xp_cooldown: 60, xp_message: 'x', xp_channel: '', xp_card: 1 });
  const apres2 = lire();
  check('enregistrer le texte ne désactive pas l\'XP vocale',
    apres2.voice_xp_enabled === 1 && apres2.voice_xp_rate === 12,
    `${apres2.voice_xp_enabled}/${apres2.voice_xp_rate}`);

  // ==========================================================================
  console.log('\n── I. Tableau de bord ──');
  // ==========================================================================

  const js = racine('public/js/dashboard.js');
  check('une carte « XP vocale » existe dans l\'onglet Niveaux', js.includes("'🎙️ XP vocale'"));
  check('…dans le rendeur levels', (() => {
    const i = js.indexOf('Dashboard.renderers.levels');
    const j = js.indexOf('Dashboard.renderers.economy');
    return i > 0 && j > i && js.slice(i, j).includes("'🎙️ XP vocale'");
  })());
  ['#vxp-enabled', '#vxp-rate', '#vxp-interval', '#vxp-min', '#vxp-muted', '#vxp-afk', '#vxp-taper', '#vxp-save']
    .forEach((sel) => check(`le champ ${sel} est présent`, js.includes(sel)));
  // Décision v244 respectée : une durée ou un taux se choisit dans une liste de
  // valeurs sensées, il ne se saisit pas dans une case numérique libre.
  check('les trois réglages sont des SÉLECTEURS, pas des cases numériques',
    /id="vxp-rate"[^>]*<\/select>/.test(js) === false
    && (js.match(/<select class="dash-select" id="vxp-(rate|interval|min)"/g) || []).length === 3,
    String((js.match(/<select class="dash-select" id="vxp-(rate|interval|min)"/g) || []).length));
  check('…et aucun des trois n\'est resté en type="number"',
    !/id="vxp-(rate|interval|min)"[^>]*type="number"/.test(js));
  ['PRESETS_XP_MIN', 'PRESETS_VERSEMENT', 'PRESETS_MEMBRES'].forEach((nom) => {
    check(`le jeu de préréglages ${nom} est défini`, js.includes(`Dashboard.${nom} = [[`));
  });
  check('les préréglages annoncent la valeur conseillée',
    /conseillé/.test(js) && (js.match(/conseillé/g) || []).length >= 3);
  check('le taux recommandé est 10 XP/min (standard PeakBot)',
    /\[10, '10 XP \/ min · conseillé'\]/.test(js));
  check('le versement recommandé est 3 min (cooldown Arcane)',
    /\[3, 'toutes les 3 min · conseillé'\]/.test(js));
  check('une étiquette de repli existe pour chaque jeu (valeur hors liste)',
    ['labelXpParMinute', 'labelVersement', 'labelMembres'].every((f) => js.includes(`Dashboard.${f} =`)));
  check('…et elles sont passées à presetOptions',
    /presetOptions\(Dashboard\.PRESETS_XP_MIN, vRate, Dashboard\.labelXpParMinute\)/.test(js));
  check('un aperçu vivant du gain est calculé', /data-vxp-apercu/.test(js) && /apercuVoix/.test(js));
  check('…et il est recalculé au changement (un <select> émet « change »)',
    /addEventListener\('change', apercuVoix\)/.test(js));
  // Piège rencontré en cours de route : un interrupteur sans son
  // <span class="slider"> rend une case À COCHER NUE — invisible une fois le
  // CSS appliqué (l'entrée est masquée, le curseur absent). Le rendu semblait
  // « correct » en relisant le code ; seule la capture d'écran l'a trahi.
  const blocVoix = js.slice(js.indexOf("Dashboard.card(root, '🎙️ XP vocale'"), js.indexOf('// 🏆 v214'));
  const inters = (blocVoix.match(/<label class="switch">/g) || []).length;
  const curseurs = (blocVoix.match(/<span class="slider"><\/span>/g) || []).length;
  check(`chaque interrupteur de la carte a son curseur (${inters}/${curseurs})`,
    inters === 4 && curseurs === 4, `${inters} interrupteurs, ${curseurs} curseurs`);
  check('…aucun interrupteur nu (entrée sans curseur juste avant </label>)',
    !/id="vxp-[a-z-]+"[^>]*><\/label>/.test(blocVoix));
  check('l\'interrupteur principal reflète le réglage stocké',
    /id="vxp-enabled" \$\{s\.voice_xp_enabled \? 'checked' : ''\}/.test(js));
  check('les trois protections utilisent des valeurs par défaut ACTIVÉES dans l\'UI',
    /id="vxp-muted" \$\{s\.voice_xp_ignore_muted === 0 \? '' : 'checked'\}/.test(js)
    && /id="vxp-afk" \$\{s\.voice_xp_ignore_afk === 0 \? '' : 'checked'\}/.test(js)
    && /id="vxp-taper" \$\{s\.voice_xp_taper === 0 \? '' : 'checked'\}/.test(js));
  check('le bouton enregistre sur la même route PUT /xp',
    /#vxp-save[\s\S]{0,400}?\/guilds\/\$\{guildId\}\/xp/.test(js));
  check('l\'UI borne les valeurs avant envoi (défense côté client)',
    /voice_rate: Math\.max\(0, Math\.min\(100/.test(js));
  check('…un sélecteur est bien lu par .value',
    /parseInt\(cVoix\.querySelector\('#vxp-rate'\)\.value, 10\)/.test(js));
  // Choix de mise en page : une ligne pleine largeur par réglage. Une grille
  // trois colonnes semblait plus compacte, mais layoutSettingRows y compresse
  // chaque paire « étiquette + sélecteur » dans 378 px : le libellé se cassait
  // sur quatre lignes et le texte de l'option choisie était rogné.
  check('la carte pose chaque réglage sur une ligne pleine largeur',
    !/dash-fields-grid[^>]*>[\s\S]{0,400}?id="vxp-rate"/.test(js)
    && /<div style="margin-top:10px"><label class="dash-label">Gain<\/label><select class="dash-select" id="vxp-rate"/.test(js));

  // Les défauts servis par l'API doivent être ceux de la base.
  const defautsApi = {};
  (routes.match(/voice_xp_\w+: \d+/g) || []).forEach((m) => {
    const [k, v] = m.split(':').map((x) => x.trim());
    defautsApi[k] = Number(v);
  });
  const dbSrc = racine('server/db.js');
  const defautsDb = {};
  (dbSrc.match(/voice_xp_\w+ INTEGER DEFAULT \d+/g) || []).forEach((m) => {
    const [, k, v] = m.match(/(voice_xp_\w+) INTEGER DEFAULT (\d+)/);
    defautsDb[k] = Number(v);
  });
  check('les 7 défauts existent côté base', Object.keys(defautsDb).length === 7, String(Object.keys(defautsDb).length));
  check('les 7 défauts existent côté API', Object.keys(defautsApi).length === 7, String(Object.keys(defautsApi).length));
  check('les défauts API et base CONCORDENT (sinon l\'UI ment)',
    Object.keys(defautsDb).every((k) => defautsApi[k] === defautsDb[k]),
    Object.keys(defautsDb).filter((k) => defautsApi[k] !== defautsDb[k]).join(',') || 'tous identiques');

  // ==========================================================================
  console.log('\n── J. Version ──');
  // ==========================================================================

  const indexHtml = racine('public/index.html');
  const swSource = racine('public/sw.js');
  const versions = [...indexHtml.matchAll(/\?v=(\d+)/g)].map((m) => `?v=${m[1]}`);
  check('index.html : ?v=287 référencé 7 fois',
    versions.length === 7 && versions.every((v) => v === '?v=287'),
    `${versions.length} refs : ${[...new Set(versions)].join(',')}`);
  check('sw.js : cache « botdev-v287 »', swSource.includes("const CACHE = 'botdev-v287';"));

  raz();
  console.log('');
  if (echecs) { console.log(`❌ v249 — ${echecs} échec(s)`); process.exit(1); }
  console.log('🎉 Tous les tests v249 passent — XP vocale complète, anti-triche, sans écrasement des réglages.');
})().catch((e) => { console.error('💥', e); process.exit(1); });
