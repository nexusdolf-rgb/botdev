// ============================================================================
// v240 — PASSAGE n°2 : les fichiers que la première conversion n'a pas couverts.
//
//   node scripts/v240-complements.js          # DRY-RUN (ne modifie rien)
//   node scripts/v240-complements.js --write  # applique
//
// `scripts/v240-passage-vous.js` ne balayait que `server/discord/*` et
// `public/js/dashboard.js`. Quatre zones visibles par l'utilisateur sont
// passées à travers, plus une poignée d'impératifs isolés dans les fichiers déjà
// convertis :
//
//   • server/routes.js   → messages d'erreur de l'API, affichés en TOAST dans
//                          le dashboard (« Tu dois être propriétaire… »)
//   • public/js/app.js   → page de CONNEXION OAuth
//   • public/js/views.js → menus de rôles
//   • public/js/editor.js→ éditeur de commandes personnalisées
//   • server/db.js       → valeurs PAR DÉFAUT en base (placeholder des menus de
//                          rôles, message par défaut du panneau de tickets)
//
// + 3 désaccords verbe/pronom laissés par la conversion automatique :
//   « connecte votre compte », « je vous propose… tape `@` »,
//   « ajoutez… ou retire-les, supprime-le ».
//
// ⚠️ La LANDING PAGE (`public/js/public.js`) est EXCLUE de ce lot : décision
//    utilisateur à part (voir docs/AGENT.md, v240).
//
// Chaque remplacement est une chaîne EXACTE et son absence est SIGNALÉE, jamais
// ignorée en silence. Les 4 variantes d'échappement sont essayées.
// ============================================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const WRITE = process.argv.includes('--write');
const ROOT = path.join(__dirname, '..');

// [fichier, ancien, nouveau, commentaire]
const LOT = [
  // ── 1. DÉSACCORDS verbe/pronom (fichiers déjà convertis) ───────────────────
  ['public/js/dashboard.js',
    'connecte votre compte Discord',
    'connectez votre compte Discord',
    'impératif non accordé après « vos serveurs »'],
  ['server/i18n.js',
    '— tape `@` puis le début du pseudo',
    '— tapez `@` puis le début du pseudo',
    'la même phrase dit « je vous propose la liste »'],
  ['server/discord/premade.js',
    'ou retire-les, supprime-le avec confirmation',
    'ou retirez-les, supprimez-le avec confirmation',
    'la phrase commence par « choisissez un type, renommez-le »'],

  // ── 2. server/routes.js — erreurs d'API affichées en toast ─────────────────
  ['server/routes.js', 'Vérifie-le dans le portail développeur Discord.',
    'Vérifiez-le dans le portail développeur Discord.', 'impératif'],
  ['server/routes.js', 'Active les intents "MESSAGE CONTENT" et "SERVER MEMBERS" dans le portail développeur Discord.',
    'Activez les intents "MESSAGE CONTENT" et "SERVER MEMBERS" dans le portail développeur Discord.', 'impératif'],
  ['server/routes.js', 'Tu dois être propriétaire du serveur ou avoir la permission Discord « Administrateur ».',
    'Vous devez être propriétaire du serveur ou avoir la permission Discord « Administrateur ».', 'pronom'],
  ['server/routes.js', "Tu n\\'es pas membre de ce serveur.",
    "Vous n\\'êtes pas membre de ce serveur.", 'pronom'],
  ['server/routes.js', 'Indique le prix à gagner.', 'Indiquez le prix à gagner.', 'impératif'],
  ['server/routes.js', 'Choisis un salon (ou configure le salon par défaut).',
    'Choisissez un salon (ou configurez le salon par défaut).', '2 impératifs'],
  ['server/routes.js', 'ajoute des récompenses puis réessaie.',
    'ajoutez des récompenses puis réessayez.', '2 impératifs'],
  ['server/routes.js', 'Colle un lien complet (tiktok.com/@pseudo',
    'Collez un lien complet (tiktok.com/@pseudo', 'impératif'],
  ['server/routes.js', "Traqueur d\\'invitations : donne « Gérer le serveur » au bot",
    "Traqueur d\\'invitations : donnez « Gérer le serveur » au bot", 'impératif'],
  ['server/routes.js', 'Choisis un salon pour le test.', 'Choisissez un salon pour le test.', 'impératif'],
  ['server/routes.js', "Active d\\'abord l\\'auto-modération, puis relance le test.",
    "Activez d\\'abord l\\'auto-modération, puis relancez le test.", '2 impératifs'],
  ['server/routes.js', 'Clique sur le bouton pour ouvrir un ticket !',
    'Cliquez sur le bouton pour ouvrir un ticket !', 'impératif'],
  ['server/routes.js', 'Configure d\'abord le salon du panneau.',
    'Configurez d\'abord le salon du panneau.', 'impératif'],
  ['server/routes.js', 'Ajoute au moins un rôle au menu.',
    'Ajoutez au moins un rôle au menu.', 'impératif (2 occurrences)'],
  ['server/routes.js', 'Renseigne d\'abord le salon du menu.',
    'Renseignez d\'abord le salon du menu.', 'impératif'],
  ['server/routes.js', 'Choisis au moins un salon de publication.',
    'Choisissez au moins un salon de publication.', 'impératif'],

  // ── 3. server/db.js — valeurs PAR DÉFAUT écrites en base ───────────────────
  ['server/db.js', 'Choisis tes rôles…', 'Choisissez vos rôles…',
    'placeholder par défaut des menus de rôles (2 occurrences)'],
  ['server/db.js', 'Clique sur le bouton pour ouvrir un ticket !',
    'Cliquez sur le bouton pour ouvrir un ticket !', 'message par défaut du panneau de tickets'],

  // ── 4. public/js/app.js — page de connexion OAuth ──────────────────────────
  ['public/js/app.js', 'Session expirée — reconnecte-toi avec Discord.',
    'Session expirée — reconnectez-vous avec Discord.', 'pronom réfléchi'],
  ['public/js/app.js', 'Fenêtre Discord ouverte : choisis ton serveur dans le sélecteur !',
    'Fenêtre Discord ouverte : choisissez votre serveur dans le sélecteur !', 'impératif + pronom'],
  ['public/js/app.js', 'Choisis ton serveur dans la fenêtre Discord !',
    'Choisissez votre serveur dans la fenêtre Discord !', 'impératif + pronom'],
  ['public/js/app.js', 'Configure ton serveur<br/><span>en quelques clics</span>',
    'Configurez votre serveur<br/><span>en quelques clics</span>', 'titre H1 de la page de connexion'],
  ['public/js/app.js', 'on vérifie simplement avec ton compte Discord.',
    'on vérifie simplement avec votre compte Discord.', 'pronom'],
  ['public/js/app.js', 'Connecte-toi avec Discord', 'Connectez-vous avec Discord',
    'titre H2 + commentaire de section (2 occurrences)'],
  ['public/js/app.js', 'Discord vérifie automatiquement tes serveurs et tes permissions.',
    'Discord vérifie automatiquement vos serveurs et vos permissions.', 'pronom'],
  ['public/js/app.js', 'Accès demandé : ton pseudo, ton avatar et ta liste de serveurs.',
    'Accès demandé : votre pseudo, votre avatar et votre liste de serveurs.', '3 pronoms'],

  // ── 5. public/js/views.js + editor.js ──────────────────────────────────────
  ['public/js/views.js', 'Choisis tes rôles…', 'Choisissez vos rôles…', 'placeholder (2 occurrences)'],
  ['public/js/views.js', 'Choisis tes rôles !', 'Choisissez vos rôles !', 'toast'],
  ['public/js/views.js', 'Renseigne au moins un nom de rôle.',
    'Renseignez au moins un nom de rôle.', 'toast'],
  ['public/js/editor.js', 'Donne un nom à ta commande.', 'Donnez un nom à votre commande.', 'toast'],

  // ── 6. Impératifs isolés dans les fichiers déjà convertis ──────────────────
  ['server/discord/extra.js', 'Joue au morpion (tic-tac-toe) contre un membre',
    'Jouez au morpion (tic-tac-toe) contre un membre', 'le bot ne joue pas : impératif'],
  ['server/discord/extra.js', 'Mise un montant positif : `/gamble 100`.',
    'Misez un montant positif : `/gamble 100`.', 'impératif'],
  ['server/discord/extra.js', 'Utilise `/voicetemp set` avec le salon de création',
    'Utilisez `/voicetemp set` avec le salon de création', 'impératif'],
  ['server/discord/panelCommands.js', 'utilise un vrai emoji',
    'utilisez un vrai emoji', 'erreur d\'emoji invalide (2 occurrences)'],
  ['server/discord/panelCommands.js', 'Utilise cette commande dans un salon de ticket',
    'Utilisez cette commande dans un salon de ticket', '2 occurrences'],
  ['server/discord/panelCommands.js', 'Utilise `/roles list`',
    'Utilisez `/roles list`', 'impératif'],
  ['server/discord/panelCommands.js', '(utilise `/ticket setup`)',
    '(utilisez `/ticket setup`)', 'impératif'],
  ['server/discord/panelCommands.js', 'envoie le panneau avec `/ticket panel`',
    'envoyez le panneau avec `/ticket panel`', 'impératif'],
  ['server/discord/panelCommands.js', 'Re-envoie le panneau avec \\`/ticket panel\\`',
    'Re-envoyez le panneau avec \\`/ticket panel\\`', '2 occurrences'],
  ['server/discord/panelCommands.js', 'Envoie un menu avec /roles send <numéro>',
    'Envoyez un menu avec /roles send <numéro>', 'impératif'],
  ['server/discord/panels.js', 'utilise un vrai emoji', 'utilisez un vrai emoji', 'erreur d\'emoji invalide'],
  ['server/discord/premade.js', 'Utilise le bouton ou le lien ci-dessous',
    'Utilisez le bouton ou le lien ci-dessous', 'impératif'],
  ['server/discord/premade.js', 'Utilise la commande slash', 'Utilisez la commande slash',
    '3 occurrences (suggest / giveaway / temprole)'],
  ['server/discord/premade.js', 'Utilise `/suggestions set #salon`.',
    'Utilisez `/suggestions set #salon`.', 'impératif'],
  ['server/discord/profileCommands.js', 'Active : `/modlogs set #salon`',
    'Activez : `/modlogs set #salon`', 'impératif'],
  ['server/discord/roleWizard.js', 'Envoie-le ensuite avec `/roles send',
    'Envoyez-le ensuite avec `/roles send', 'impératif + pronom'],
  ['server/index.js', 'ajoute la variable sur Render',
    'ajoutez la variable sur Render', 'log de démarrage'],

  // ── 7. Oublis trouvés par test/v240-test.js APRÈS le premier passage ──────
  //    (multi-lignes : les templates HTML et SQL ne sont pas vus ligne à ligne)
  ['server/routes.js', "placeholder || 'Choisis tes rôles…'",
    "placeholder || 'Choisissez vos rôles…'", 'valeur par défaut du placeholder'],
  ['server/routes.js', 'Écris le contenu de ton annonce.',
    'Écrivez le contenu de votre annonce.', 'erreur 400 — annonce'],
  ['server/routes.js', 'Tu ne peux pas modifier ton propre compte administrateur.',
    'Vous ne pouvez pas modifier votre propre compte administrateur.', 'erreur 400 — admin'],
  ['public/js/app.js', 'nous ne voyons <b>jamais</b> ton mot de passe',
    'nous ne voyons <b>jamais</b> votre mot de passe', 'rassurance OAuth, page de connexion'],
  ['public/js/app.js', 'Délier Discord, bannir ou supprimer un compte. Ton propre compte est toujours protégé.',
    'Délier Discord, bannir ou supprimer un compte. Votre propre compte est toujours protégé.', 'sous-titre de la section admin'],

  // ── 8. Oublis repérés par le balayage final (apostrophes + impératifs) ─────
  //    `suggest.js` et `panelCommands.js` sont vus SUR DISCORD.
  ['server/discord/suggest.js', 'Hoxera · Vote avec les boutons',
    'Hoxera · Votez avec les boutons', 'pied du panneau de suggestion'],
  ['server/discord/panelCommands.js', 'introuvable. Utilise \`/ticket types list\`.',
    'introuvable. Utilisez \`/ticket types list\`.', 'erreur « type introuvable »'],
  ['public/js/dashboard.js', 'Importe une image (PNG/JPG/GIF/WebP)',
    'Importez une image (PNG/JPG/GIF/WebP)', 'aide du champ image'],
  ['public/js/dashboard.js', "Besoin d\\'aide ? Ouvre un ticket !",
    "Besoin d\\'aide ? Ouvrez un ticket !", 'repli de l\'aperçu du message de ticket'],
  ['public/js/dashboard.js', 'Teste une phrase avec les vraies règles du serveur.',
    'Testez une phrase avec les vraies règles du serveur.', 'carte « simulateur sans risque »'],
  ['public/js/dashboard.js', 'Change le statut (synchronisé avec Discord) ou supprime une suggestion.',
    'Changez le statut (synchronisé avec Discord) ou supprimez une suggestion.', 'carte « liste » des suggestions'],
  ['public/js/dashboard.js', "Vous n\\'avez pas encore créé de quiz — utilise le formulaire",
    "Vous n\\'avez pas encore créé de quiz — utilisez le formulaire", 'état vide de la liste des quiz'],
];

// ---------------------------------------------------------------------------
// Application : chaque chaîne est cherchée sous ses 4 variantes d'échappement.
// ---------------------------------------------------------------------------
function variantes(s) {
  return [s, s.replace(/'/g, "\\'"), s.replace(/`/g, '\\`'),
    s.replace(/'/g, "\\'").replace(/`/g, '\\`')];
}

const cache = new Map();
// ⚠️ ZONE PROTÉGÉE — le bloc de migration de données de `server/db.js` contient
// VOLONTAIREMENT les anciens textes en « tu » : ce sont les clés du `WHERE`.
// Un `split/join` sur tout le fichier les réécrivait en « vous » et rendait la
// migration inopérante (les deux paramètres devenaient identiques). C'est
// arrivé pour de vrai ; on découpe donc le fichier autour de ce bloc et on ne
// touche JAMAIS à l'intérieur.
const MARQUEUR_DEBUT = 'for (const [sql, params] of [';
const MARQUEUR_FIN = 'try { db.prepare(sql).run(...params); } catch (e) {}';

function decoupe(src) {
  const i = src.indexOf(MARQUEUR_DEBUT);
  if (i < 0) return [{ texte: src, protege: false }];
  const j = src.indexOf(MARQUEUR_FIN, i);
  if (j < 0) return [{ texte: src, protege: false }];
  const fin = j + MARQUEUR_FIN.length;
  return [
    { texte: src.slice(0, i), protege: false },
    { texte: src.slice(i, fin), protege: true },
    { texte: src.slice(fin), protege: false },
  ];
}

function lire(f) {
  if (!cache.has(f)) {
    const p = path.join(ROOT, f);
    cache.set(f, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
  }
  return cache.get(f);
}

let ok = 0;
const manques = [];
const dejaFait = [];
const compte = [];

// Le lot est REJOUABLE : une chaîne déjà convertie n'est pas une erreur, c'est
// la preuve que le script a déjà tourné. On la distingue donc d'un vrai manque
// (texte qui a bougé pour une autre raison et qu'il faut re-vérifier à la main).
for (const [f, avant, apres, commentaire] of LOT) {
  let src = lire(f);
  if (src === null) { manques.push([f, avant, 'FICHIER INTROUVABLE']); continue; }

  let fait = false;
  for (const a of variantes(avant)) {
    const idx = variantes(avant).indexOf(a);
    const b = variantes(apres)[idx];
    const morceaux = decoupe(src);
    let n = 0;
    for (const m of morceaux) {
      if (m.protege) continue;                    // jamais touché
      const k = m.texte.split(a).length - 1;
      if (k) { m.texte = m.texte.split(a).join(b); n += k; }
    }
    if (n === 0) continue;
    src = morceaux.map((m) => m.texte).join('');
    cache.set(f, src);
    ok += 1;
    compte.push(`  ✅ ${f.replace('server/discord/', '')} ×${n}  « ${avant.slice(0, 46)}${avant.length > 46 ? '…' : ''} »`);
    fait = true;
    break;
  }
  if (fait) continue;

  // Non trouvé : déjà appliqué, ou vraiment disparu ?
  const deja = variantes(apres).some((b) => src.includes(b))
    || variantes(avant).some((a) => src.includes(a));
  if (deja) dejaFait.push([f, apres, commentaire]);
  else manques.push([f, avant, commentaire]);
}

console.log('════════════════════════════════════════════════════════════');
console.log(`  v240 — compléments (routes.js, app.js, views.js, editor.js, db.js)`);
console.log('════════════════════════════════════════════════════════════\n');
for (const l of compte) console.log(l);

if (dejaFait.length) {
  console.log(`\n  ↩️  ${dejaFait.length} déjà appliqué(s) dans un passage précédent.`);
}
if (manques.length) {
  console.log(`\n  ⚠️  ${manques.length} chaîne(s) INTROUVABLE(S) — ni l'ancienne ni la nouvelle.`);
  console.log('     Le texte a bougé pour une autre raison : à re-vérifier à la main.');
  for (const [f, a, c] of manques) console.log(`     ${f}  « ${a.slice(0, 60)} »  (${c})`);
}

console.log('\n════════════════════════════════════════════════════════════');
console.log(`  ${ok} appliqué(s) · ${dejaFait.length} déjà fait · ${manques.length} manquant(s)  (lot de ${LOT.length})   ·   ${WRITE ? 'ÉCRIT' : 'DRY-RUN'}`);
console.log('════════════════════════════════════════════════════════════\n');

if (WRITE) {
  for (const [f, src] of cache) if (src !== null) fs.writeFileSync(path.join(ROOT, f), src, 'utf8');
  console.log('  → fichiers écrits.\n');
}
process.exit(manques.length ? 1 : 0);
