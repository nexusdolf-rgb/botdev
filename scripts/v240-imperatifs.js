// ============================================================================
// v240 — Dernière passe CURATÉE : les impératifs que le passage automatique ne
// pouvait pas trancher seul.
//
//   node scripts/v240-imperatifs.js          # DRY-RUN
//   node scripts/v240-imperatifs.js --write  # applique
//
// Pourquoi à la main : chaque verbe ci-dessous existe AUSSI à la 3ᵉ personne ou
// comme nom dans le dépôt. Une règle globale casserait du texte correct :
//   « le bot envoie l'annonce »   → 3ᵉ personne, à garder
//   « Blacklist active »          → adjectif, à garder
//   « Règle détectée sans action »→ NOM, à garder
//   « {a} donne une claque à {b} »→ roleplay 3ᵉ personne, à garder
// Chaque remplacement est donc une chaîne EXACTE, et son absence est signalée
// (au lieu d'être ignorée en silence) : si le texte bouge, on le voit.
//
// Le lot contient aussi 2 RÉPARATIONS de conversions automatiques fautives :
//   • events.js  « un membre quittez le serveur » → 3ᵉ personne écrasée
//   • extra.js   « Si vous rates, vous lui payes » → verbes non accordés
// ============================================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const WRITE = process.argv.includes('--write');
const ROOT = path.join(__dirname, '..');

// [fichier, ancien, nouveau, commentaire]
const LOT = [
  // ── RÉPARATIONS : la conversion automatique avait écrasé une 3ᵉ personne ──
  ['server/discord/events.js',
    'Envoie un message quand un membre quittez le serveur.',
    'Envoie un message quand un membre quitte le serveur.',
    'RÉPARATION — « un membre quitte » est une 3ᵉ personne'],
  ['server/discord/extra.js',
    'Si vous rates, vous lui payes une amende !',
    'Si vous ratez, vous lui payez une amende !',
    'RÉPARATION — verbes non accordés après tu → vous'],

  // ── events.js : aides de configuration ────────────────────────────────────
  ['server/discord/events.js',
    'une phrase par salon, utilise {channels} dans le message',
    'une phrase par salon, utilisez {channels} dans le message'],
  ['server/discord/events.js',
    '📌 Salons à mentionner — utilise {channels} dans le message',
    '📌 Salons à mentionner — utilisez {channels} dans le message'],

  // ── extra.js : descriptions de commandes + messages envoyés ───────────────
  ['server/discord/extra.js', '🪢 Joue au pendu : devine le mot caché !', '🪢 Jouez au pendu : devinez le mot caché !'],
  ['server/discord/extra.js', '⭕ Joue au morpion contre un membre', '⭕ Jouez au morpion contre un membre'],
  ['server/discord/extra.js', '🧠 Quiz : gagne des points, monte au classement !', '🧠 Quiz : gagnez des points, montez au classement !'],
  ['server/discord/extra.js', '🌙 Passe AFK : on prévient les autres', '🌙 Passez AFK : on prévient les autres'],
  ['server/discord/extra.js', '🗳️ Crée un sondage avec des boutons de vote', '🗳️ Créez un sondage avec des boutons de vote'],
  ['server/discord/extra.js', '🦹 Tente de voler des coins à un membre (risqué !)', '🦹 Tentez de voler des coins à un membre (risqué !)'],
  ['server/discord/extra.js', 'Joue contre moi : choisissez pierre, feuille ou ciseaux !', 'Jouez contre moi : choisissez pierre, feuille ou ciseaux !'],
  ['server/discord/extra.js', "Crée un sondage : les membres votent avec des boutons", "Créez un sondage : les membres votent avec des boutons"],
  ['server/discord/extra.js', 'Tente de voler un membre : 40 % de réussite', 'Tentez de voler un membre : 40 % de réussite'],
  ['server/discord/extra.js', 'Je te rappellerai', 'Je vous rappellerai'],
  ['server/discord/extra.js', 'Utilise `/lockdown off` quand la situation est maîtrisée.', 'Utilisez `/lockdown off` quand la situation est maîtrisée.'],
  ['server/discord/extra.js', 'Le salon des candidatures a été supprimé. Préviens un admin !', 'Le salon des candidatures a été supprimé. Prévenez un admin !'],

  // ── Autres modules bot ────────────────────────────────────────────────────
  ['server/discord/giveaway.js', 'Réagis avec 🎉 pour participer !', 'Réagissez avec 🎉 pour participer !'],
  ['server/discord/announcements.js', 'Vérifie les permissions du bot.', 'Vérifiez les permissions du bot.'],
  ['server/discord/advancedTickets.js', "Demande au staff de le renvoyer.", "Demandez au staff de le renvoyer."],
  ['server/discord/panelCommands.js', 'Modifie tout à tout moment avec /ticket channel', 'Modifiez tout à tout moment avec /ticket channel'],
  ['server/discord/panelCommands.js', 'Supprime : /ticket types remove', 'Supprimez : /ticket types remove'],
  ['server/discord/panelCommands.js', 'Modifie tout avec /ticket setup', 'Modifiez tout avec /ticket setup'],
  ['server/discord/profileCommands.js', 'Modifie : `/modlogs set #salon` · Désactive : `/modlogs off`', 'Modifiez : `/modlogs set #salon` · Désactivez : `/modlogs off`'],
  ['server/discord/identity.js', 'Personnalise avec /botprofile set · avatar · banner · reset', 'Personnalisez avec /botprofile set · avatar · banner · reset'],
  ['server/discord/roleWizard.js', 'Modifie-le à tout moment avec /roles edit.', 'Modifiez-le à tout moment avec /roles edit.'],
  ['server/discord/guildEvents.js', 'Crée des événements datés (tournois, events, soirées…)', 'Créez des événements datés (tournois, events, soirées…)'],
  ['server/discord/guildEvents.js', 'pour en supprimer un, note son **ID**', 'pour en supprimer un, notez son **ID**'],
  ['server/discord/premade.js', 'Il te manque', 'Il vous manque'],
  ['server/discord/premade.js', 'Achète un article de la boutique (rôle donné automatiquement).', 'Achetez un article de la boutique (rôle donné automatiquement).'],
  ['server/discord/premade.js', 'choisissez un type, renomme-le, choisissez son emoji', 'choisissez un type, renommez-le, choisissez son emoji'],
  ['server/discord/panels.js', 'Ex : signale un abus du staff, en toute confidentialité', 'Ex : signalez un abus du staff, en toute confidentialité'],

  // ── Dashboard ─────────────────────────────────────────────────────────────
  ['public/js/dashboard.js', '🔗 Lie votre compte Discord', '🔗 Liez votre compte Discord'],
  ['public/js/dashboard.js', 'Lecture seule : il te faut la permission Discord', 'Lecture seule : il vous faut la permission Discord'],
  ['public/js/dashboard.js', 'Il te faut la permission Discord', 'Il vous faut la permission Discord'],
  ['public/js/dashboard.js', 'Ex : signale un abus du staff, en toute confidentialité', 'Ex : signalez un abus du staff, en toute confidentialité'],
  ['public/js/dashboard.js', 'Réagis avec 🎉 pour participer !', 'Réagissez avec 🎉 pour participer !'],
  ['public/js/dashboard.js', 'Indique le prix à gagner !', 'Indiquez le prix à gagner !'],
  ['public/js/dashboard.js', 'Personnalise Optimus Prime uniquement sur', 'Personnalisez Optimus Prime uniquement sur'],
];

const parFichier = new Map();
for (const [f, avant, apres] of LOT) {
  if (!parFichier.has(f)) parFichier.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
}

let appliques = 0; const manquants = [];
for (const [f, avant, apres, note] of LOT) {
  let s = parFichier.get(f);
  // Selon le type de quote du littéral, l'apostrophe ET le backtick peuvent
  // être échappés dans le source (chaîne '…' → \' ; template `…` → \`).
  // On essaie les 4 combinaisons avant de conclure à une absence.
  const ech = (t, q) => t.replace(/'/g, q ? "\\'" : "'").replace(/`/g, q === 2 || q === 3 ? '\\`' : '`');
  let trouve = false;
  for (const q of [0, 1, 2, 3]) {
    const v = ech(avant, q);
    if (!s.includes(v)) continue;
    s = s.split(v).join(ech(apres, q));
    trouve = true;
    break;
  }
  if (trouve) { parFichier.set(f, s); appliques++; }
  else manquants.push(`  ⚠️  ${f} — « ${avant.slice(0, 72)} »${note ? '\n        ' + note : ''}`);
}

if (WRITE) for (const [f, s] of parFichier) fs.writeFileSync(path.join(ROOT, f), s);

manquants.forEach((m) => console.log(m));
console.log('\n════════════════════════════════════════════════════════════');
console.log(`  Remplacements appliqués : ${appliques}/${LOT.length}   ·   ${WRITE ? 'ÉCRIT' : 'DRY-RUN'}`);
if (manquants.length) console.log(`  Non trouvés : ${manquants.length} (texte déjà à jour, ou déplacé)`);
console.log('════════════════════════════════════════════════════════════');
