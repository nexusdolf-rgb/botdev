// ============================================================================
// v240 — PASSAGE n°3 : la LANDING PAGE publique (`public/js/public.js`).
//
//   node scripts/v240-landing.js          # DRY-RUN (ne modifie rien)
//   node scripts/v240-landing.js --write  # applique
//
// ⚠️ ZONE PROTÉGÉE. La landing v167 est « FINALE — ne plus la retoucher »
//    (docs/AGENT.md) : cette interdiction porte sur le DESIGN et la STRUCTURE
//    (le clone DraftBot ne doit pas revenir). Le passage au « vous » ne touche
//    AUCUN des deux : uniquement des mots, jamais une balise, une classe, un
//    identifiant ou une mise en page.
//
//    Accord explicite de l'utilisateur le 06/09 (v240). Il était nécessaire :
//    `index.html` disait déjà « Le bot de VOTRE serveur Discord » tandis que le
//    titre géant rendu par public.js disait encore « TON serveur Discord ».
//
// Deux chaînes sont volontairement ÉCARTÉES (faux positifs) :
//   • « aux jours et heures choisis »  → participe passé, pas un impératif
//   • class="mock-item active"         → classe CSS
//
// Chaque remplacement est une chaîne EXACTE et son absence est SIGNALÉE,
// jamais ignorée en silence.
// ============================================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const WRITE = process.argv.includes('--write');
const FICHIER = path.join(__dirname, '..', 'public/js/public.js');

// [ancien, nouveau, commentaire]
const LOT = [
  // ── Héro : titre géant + accroche + bouton ─────────────────────────────────
  ['<span class="grad grad-anim">ton serveur Discord</span></h1>',
    '<span class="grad grad-anim">votre serveur Discord</span></h1>',
    'H1 héro — à aligner sur le <title> d\'index.html'],
  ['Ajoute Hoxera à ton serveur, puis configure tout depuis le dashboard avec ton compte Discord.',
    'Ajoutez Hoxera à votre serveur, puis configurez tout depuis le dashboard avec votre compte Discord.',
    'accroche sous le H1'],
  ['➕ Ajouter Hoxera à ton serveur</button>',
    '➕ Ajouter Hoxera à votre serveur</button>',
    'bouton principal (héro + CTA final, 2 occurrences)'],
  ['un dashboard qui te fait gagner du temps.',
    'un dashboard qui vous fait gagner du temps.',
    'bloc « expérience complète »'],
  ['<h3>Optimus Prime, ton nouveau membre</h3>',
    '<h3>Optimus Prime, votre nouveau membre</h3>',
    'titre de carte'],

  // ── Les 3 étapes « Comment ça marche » ────────────────────────────────────
  ['<b>Ajoute le bot</b><p>Un clic sur « Ajouter Hoxera », choisis ton serveur.</p>',
    '<b>Ajoutez le bot</b><p>Un clic sur « Ajouter Hoxera », choisissez votre serveur.</p>',
    'étape 1'],
  ['<b>Connecte-toi</b><p>Identifie-toi avec Discord pour accéder à ton dashboard.</p>',
    '<b>Connectez-vous</b><p>Identifiez-vous avec Discord pour accéder à votre dashboard.</p>',
    'étape 2 — 2 pronoms réfléchis'],
  ['<b>Configure</b><p>Active les modules et personnalise ton serveur en direct.</p>',
    '<b>Configurez</b><p>Activez les modules et personnalisez votre serveur en direct.</p>',
    'étape 3 — titre déjà à l\'infinitif? non : impératif'],

  // ── Grille de fonctionnalités ─────────────────────────────────────────────
  ['Un clic pour créer ton vocal, supprimé automatiquement quand il est vide.',
    'Un clic pour créer votre vocal, supprimé automatiquement quand il est vide.',
    'salons vocaux temporaires'],
  ['coins, rôles et kick — tout depuis ton téléphone.',
    'coins, rôles et kick — tout depuis votre téléphone.',
    'dashboard complet'],
  ['Configure tout depuis ton téléphone ou ton PC — design pro, sauvegarde intelligente, flux d\'activité en direct.',
    'Configurez tout depuis votre téléphone ou votre PC — design pro, sauvegarde intelligente, flux d\'activité en direct.',
    'bloc dashboard, 3 changements'],

  // ── FAQ ───────────────────────────────────────────────────────────────────
  ['sans abonnement ni compte payant. Tu ne paies que si tu veux un jour soutenir le projet',
    'sans abonnement ni compte payant. Vous ne payez que si vous voulez un jour soutenir le projet',
    'FAQ « est-ce gratuit » — 2 verbes à conjuguer, pas seulement le pronom'],
  ['et modérer (kick, ban, timeout). Tu peux les ajuster ensuite dans les réglages de ton serveur.',
    'et modérer (kick, ban, timeout). Vous pouvez les ajuster ensuite dans les réglages de votre serveur.',
    'FAQ « permissions »'],
  ['Uniquement avec ton compte Discord (OAuth2). Aucun mot de passe à retenir : tu te connectes, on vérifie tes serveurs et ta permission, et tu configures tes serveurs en quelques clics.',
    'Uniquement avec votre compte Discord (OAuth2). Aucun mot de passe à retenir : vous vous connectez, on vérifie vos serveurs et votre permission, et vous configurez vos serveurs en quelques clics.',
    'FAQ « compte » — 8 changements'],

  // ── CTA final + pieds de page ─────────────────────────────────────────────
  ['<h2>Prêt à donner vie à ton serveur ?</h2>',
    '<h2>Prêt à donner vie à votre serveur ?</h2>',
    'H2 du CTA final'],
  ['<p>Ajoute Hoxera maintenant — c\'est gratuit, configuré en quelques minutes, et il t\'accompagne pas à pas.</p>',
    '<p>Ajoutez Hoxera maintenant — c\'est gratuit, configuré en quelques minutes, et il vous accompagne pas à pas.</p>',
    'CTA final'],
  ['<p>Le bot d\'animation tout-en-un pour ton serveur Discord.</p>',
    '<p>Le bot d\'animation tout-en-un pour votre serveur Discord.</p>',
    'pied de page de la landing'],

  // ── Page publique du bot (/bot/:id) ───────────────────────────────────────
  ['>➕ Ajouter à ton serveur</button>',
    '>➕ Ajouter à votre serveur</button>',
    'bouton d\'invitation de la page bot'],
  ['💡 Une fois le bot sur ton serveur, tape <b>/help</b>',
    '💡 Une fois le bot sur votre serveur, tapez <b>/help</b>',
    'astuce de la page bot'],
  ['— ajoute-le à ton serveur, puis configure-le avec ton compte Discord.',
    '— ajoutez-le à votre serveur, puis configurez-le avec votre compte Discord.',
    'pied de page de la page bot'],
];

let src = fs.readFileSync(FICHIER, 'utf8');
const avant = src;
let ok = 0;
const manques = [];

console.log('════════════════════════════════════════════════════════════');
console.log('  v240 — landing page (public/js/public.js)');
console.log('════════════════════════════════════════════════════════════\n');

for (const [ancien, nouveau, commentaire] of LOT) {
  const n = src.split(ancien).length - 1;
  if (n === 0) { manques.push([ancien, commentaire]); continue; }
  src = src.split(ancien).join(nouveau);
  ok += 1;
  console.log(`  ✅ ×${n}  « ${ancien.slice(0, 58)}${ancien.length > 58 ? '…' : ''} »`);
}

if (manques.length) {
  console.log(`\n  ⚠️  ${manques.length} chaîne(s) introuvable(s) :`);
  for (const [a, c] of manques) console.log(`     « ${a.slice(0, 68)} »  (${c})`);
}

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  Appliqués : ${ok}/${LOT.length}   ·   ${WRITE ? 'ÉCRIT' : 'DRY-RUN'}`);
console.log('════════════════════════════════════════════════════════════\n');

if (WRITE && src !== avant) {
  fs.writeFileSync(FICHIER, src, 'utf8');
  console.log('  → public/js/public.js écrit.\n');
}
