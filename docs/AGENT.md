# 🤖 GUIDE DE L'AGENT — Projet Hoxera (bot Discord « Optimus Prime » + dashboard)

> Document de passation : tout agent (IA ou humain) qui reprend ce projet doit lire ceci.

> **Mode d'emploi** : si l'agent actuel est bloqué, copie TOUT ce document dans une
> nouvelle conversation, remplace les `<<< ... >>>` par tes vrais accès, et envoie.
> Le nouvel agent pourra reprendre le travail immédiatement.

---

## 🎭 TON RÔLE

Tu es mon développeur senior attitré sur le projet **Hoxera**. Tu prends le relais d'un
agent précédent. Comporte-toi comme un vrai développeur expérimenté :
- **Vérifie avant de toucher** : clone le dépôt, lis le code, comprends avant de modifier
- **Teste TOUT avant de mettre en ligne** : jamais de push sans feu vert de `bash scripts/check.sh`
- **Chaque nouvelle fonctionnalité = son test automatique** (dossier `test/`, nommage `vNNN-test.js`)
- Trouve des solutions vite, protège le bot et ses données, explique-moi simplement (je suis débutant)
- Commits en français, préfixés par un numéro de version (dernier : **v228**) avec description détaillée

## 🧑‍💻 MOI, L'UTILISATEUR (à respecter scrupuleusement)

- **Débutant** : je suis juste tes instructions, fais TOUT le travail technique toi-même
- **Toujours en français simple**, explications courtes et rassurantes
- **Je refuse de repartir de zéro** : on continue toujours le code existant
- **Vérifie les faits AVANT de me rassurer** (je panique vite ; j'ai déjà cru un token
  changé alors que non)
- Quand une demande annule du travail récent : demande-moi une clarification avant d'exécuter
- Je fournis mes tokens/access dans le chat quand tu me les demandes

## 📦 LE PROJET

**Hoxera** : plateforme web + bot Discord tout-en-un, 100 % gratuit.
- **Bot « Optimus Prime »** (ex-« Nexora », renommé le 29/08/2026) — client_id :
  `1537443352281088000` — en ligne sur 7 serveurs
- Tickets pro (types, transcriptions, notes ⭐), modération + auto-mod + anti-raid,
  XP/niveaux, économie, giveaways, jeux, mariages, anniversaires, sondages, rappels,
  rôles par boutons, salons vocaux temporaires, starboard, traqueur d'invitations,
  annonces de live, cartes de bienvenue, auto-rôles, i18n 6 langues (fr/en/es/de/pt/it)
- **Dashboard** : https://hoxera.is-a.dev — connexion OAuth2 Discord, PWA installable,
  16 modules, thème sombre + clair, mobile + desktop

## 🗂️ INFRASTRUCTURE

| Élément | Détail |
|---|---|
| Code | `github.com/nexusdolf-rgb/botdev` (branche `main`, **dépôt PUBLIC** → zéro secret dedans) |
| Sauvegardes données | `github.com/nexusdolf-rgb/botdev-data` (PRIVÉ — botdev.db poussé toutes les ~10 min, restauré au boot) |
| Hébergement | Render **web service « hoxera »** `srv-da5i2h2jobas73epvos0`, région **Oregon**, plan free |
| ⚠️ Ancien service | « Dash-hoxora » `srv-da133gs9v7es73afo2lg` **SUSPENDU** — ne pas réactiver (IP bloquée par Discord) : jamais 2 services actifs avec le même token |
| Déploiement | `git push` sur main → Render redéploie automatiquement (~1 min) |
| CI | GitHub Actions (tests à chaque push, ~2,5 min) |
| Santé | `https://hoxera.is-a.dev/api/health/bot` (JSON : bot, serveurs, erreurs 24h, backup) |

## 🏗️ ARCHITECTURE DU CODE

- Node.js + Express + discord.js v14 + better-sqlite3 + sharp — `npm start` → `server/index.js`
- `server/db.js` : toute la base (tables + accesseurs `store.*`, migrations `ALTER TABLE…catch`)
- `server/discord/` : `botManager.js` (connexion, sync commandes, bio, rôle), `panels.js`
  (tickets), `premade.js`, `extra.js`, `events.js`, `community.js`, `liveWatch.js`,
  `automod.js`, `antiraid.js`, `xp.js`, `logging.js`, `i18n.js`, `nativeAutomod.js`
- `public/` : SPA vanilla JS — `js/dashboard.js` (modules), `js/app.js`, `js/public.js`
  (landing), `css/dashboard.css` (bloc « mode clair » en fin de fichier)
- `test/` : **155 tests**. `bash scripts/check.sh` = syntaxe + secrets + suite (OBLIGATOIRE, ~2,5 min)
- `docs/AGENT.md` : ce document — **le mettre à jour à chaque grande étape**

## 🔁 RECETTE DE LIVRAISON (à connaître par cœur)

1. Modifier le code → `bash scripts/check.sh` → tout vert
2. **Bump de version** : `public/index.html` `?v=NNN` **×7** + `public/sw.js` `botdev-vNNN`
   + TOUS les tests qui épinglent la version (commande magique, depuis la racine :
   `grep -rl "v=ANCIEN\|botdev-vANCIEN'" test/ public/ | xargs sed -i 's/?v=ANCIEN/?v=NOUVEAU/g; s/botdev-vANCIEN/botdev-vNOUVEAU/g'`
   — attention à ne pas toucher les `botdev-vNNN-${Date.now()}` des DATA_DIR, ils
   sont hors motif) + nouveau `test/vNNN-test.js` qui vérifie lui aussi les pins
3. Commit FR détaillé → `git push origin main` → CI verte → Render déploie
4. Vérifier prod : `?v=NNN` dans l'HTML, `/api/health/bot` (0 erreur), CI success

## 📜 HISTORIQUE RÉCENT (décisions à ne pas défaire)

- **v163** : landing « DraftBot-like » REJETÉE (longs textes + fausses données perso) —
  interdit définitif de ces éléments
- **v167** : restauration de **l'ancienne page d'origine Nexora** (badge « synchronisé en
  direct », titre dégradé animé, stats live, 10 fonctionnalités, accent Argile `#e07a5f`).
  **FINALE — ne plus la retoucher** (le clone DraftBot ne doit pas revenir)
- **v170/v171** : plus AUCUN texte invisible (mobile + desktop, thème sombre + clair ;
  l'app suit `prefers-color-scheme`, bloc `hx-light` complet dans dashboard.css)
- **v172-v176** : le bot « Nexora » devient **« Optimus Prime »** (Discord + code + base).
  Le SITE garde le nom « Hoxera » (c'est la plateforme). Conservés : chemins `/api/nexora`,
  variables `NEXORA_ADMIN_*`, noms de fichiers `nexora-*` (procure pas de renommer)
- **v174** : le nom du bot vit dans la base (renommable via `PATCH /api/bots/1`) ;
  `provisionHoxera()` ne force PLUS le nom au démarrage
- **v180** : retour à la bannière « robot 3D cinéma + typographie Poppins » (fichier
  historique `banner-pro-final.png`) après rejet des variantes v178/v179.
- **v181** : première tentative — tête premium posée à la place exacte du robot
  (centre 1331/288, 373×394). L'utilisateur a corrigé : « t'aurais dû le calquer ».
- **v182** : tête premium calquée pixel par pixel depuis la v179 (426×450 @ 1300/322)
  sur le fond v177 vidé de son robot. Remplacée dès la v183.
- **v183** : logo argent calqué sur le fond v177 — remplacé dès la v184.
- **v184** : retour à la bannière « 3D premium » v179 — remplacée dès la v185.
- **v185** : **RETOUR à la bannière « robot 3D cinéma » (v177)** — la favorite
  de l'utilisateur, identifiée par LUI parmi 4 candidates présentées en image (sa
  description : « police professionnelle + tête de robot avec des couleurs »). Fichier
  actif : `assets/banner-pro-final.png`, appliqué TEL QUEL (hash Discord 6b5b30ea78d3 =
  celui des époques v177/v180 → fichier identique à l'octet près). C'est la 2e restauration
  de cette bannière (v180 puis v185) : après v177→v185, l'utilisateur a comparé robot
  cinéma / tête premium / logo argent et revient à la v177.
- **v186** : **AUDIT UI COMPLET DU DASHBOARD** (demande : « plein de
  débordements de textes » + « aucune trace des bugs » avant déploiement). Audit
  Puppeteer maison (`/home/user/audit-tools/audit.js` + `audit2.js`) : 12 passes
  (6 tailles d'écran 320→1920px × 18 modules × 2 thèmes + modales + page admin +
  contraste mode clair) → **0 problème**. Correctifs (fin de `dashboard.css`, bloc
  « AUDIT UI v186 » + correctifs 6-22) :
  1. topbar ≤520px (marges -12px vs padding), badge cloche `hidden` écrasé par
     `display:inline-flex`, pied `.card-actions` injecté dans la colonne 36px des
     grilles de cartes (`grid-column:1/-1` + boutons nowrap + `flex:1 1 auto`),
     `.am-warning-grid` 2 colonnes 521-1100px.
  2. Labels écrasés : `.setting-row > .dash-label { flex:1 1 auto; min-width:100px;
     overflow-wrap:anywhere }` + `input[type=number]{min-width:84px}`.
  3. **LE bug « textes cachés » v171 (ordinateur de l'utilisateur = thème CLAIR)** :
     la couche « Discord » du CSS (l.3000-4300, sédiment v9-v13) code ses couleurs
     EN DUR et redéfinit les variables sur `:root` → en thème clair : ~20 surfaces
     sombres (`#40444b/#2b2d31` dont certaines avec `!important`) + ~200 textes
     `#b5bac1/#f2f3f5` illisibles (ratio 1,8-2). Fix : bloc light complet en fin de
     fichier — remap des variables (`--d-dim:#5d6375`, `--d-surface-*`…), flip des
     surfaces avec `!important` (la couche sédimentaire en utilise → il en faut aussi),
     textes internes foncés via `:is(...)` groupé, puis RÉ-AFFIRMATION des couleurs
     d'accent (vert statut `#178a43`, bandeau jaune `#8a6d00`, boutons primaires).
  4. **Les 5 maquettes « comme sur Discord » restent sombres dans les 2 thèmes**
     (`.dc-preview`, `.adv-discord-preview`, `.ca-discord-preview`, `.eb-discord`,
     panneau tickets) : textes clairs dessus, ratios mesurés 4,5-12,6 → lisibles.
  5. Cartes « types de tickets » à 1024px : cellules de 151px → labels `min-width:0`,
     `.adv-type-head{flex-wrap:wrap}` (la ligne emoji+nom+couleur débordait de 11px).
  6. Auto-Mod à 320px : `.am-native-grid` en `minmax(0,1fr)` (la colonne gonflait à
     325px derrière un sélecteur custom réfractaire au rétrécissement).
  7. Puces d'action rapides de l'accueil ≤360px (« Personnaliser » clippé de 3px).
  8. Chips des jours d'annonces : `minmax(125px,1fr)` dans `dashboard.js` (« Dimanche »).
  ⚠️ Leçons : le thème clair se teste avec un VRAI audit contraste (passe D) ; les
  overrides light doivent gagner contre `!important` ; jamais de `white-space:nowrap`
  sans base flex correcte ; jamais de flip de surface sans gérer ses textes internes.
- **v193 (ACTUELLE)** : **PHASE 1 — sécurité, nettoyage et corrections urgentes**.
  1) Rebranding : « BotDev »/« NEXORA » visibles remplacés par Hoxera (statut
  par défaut, panneau par défaut, bannières, boutique, sanctions, footer
  transcription, aide dashboard) ; ancien domaine de secours retiré des
  origines autorisées. 2) `/say` protégé : réservé au propriétaire/
  Administrateur (vérifié à l'exécution + masqué à l'enregistrement, refus propre).
  3) `/meme` robuste : timeout 8 s, erreurs HTTP/réseau/données invalides
  gérées, le bot ne se bloque jamais. 4) Routes mortes `/auth/register` et
  `/auth/login` supprimées (connexion 100 % OAuth2 ; bcrypt conservé pour
  l'OAuth2). 5) Env vars obsolètes : plus que HOXERA_TOKEN (les anciens noms
  n'existaient pas en prod). 6) Anciens domaines retirés (sauf règles de
  correction de base restaurée). 7) Sécurité : le token Discord n'est PLUS
  jamais renvoyé par l'API ; tokens de transcription passés de 64 à 128 bits.
  125 tests verts (`test/v193-test.js`). Bump cache v193.
- **v194 (ACTUELLE)** : **DASHBOARD ULTRA PRO (Phase 2)** — finitions UX
  complètes en couche purement additive (rien n'est retiré) :
  1) Design tokens (`--dp-radius-card`, `--dp-shadow-*`, `--dp-ring`, …) ;
  2) Accessibilité : focus visible restauré partout (outline 3px accent,
  neutralise l'ancien « outline: none ») ;
  3) Hiérarchie : cartes avec hover lift + ombre douce, stats élargies,
  survol de lignes de tableaux, méta du module en chips ;
  4) États vides `.dash-empty` affinés (bordures pointillées, icône) ;
  5) Scrollbar fine ; 6) Mode clair v194 (ombres et survols adaptés) ;
  7) `prefers-reduced-motion` global (animations coupées) ;
  8) Page Modules enrichie (badge ● Activé/○ Désactivé + compteur de
  commandes + mise à jour du badge sans rechargement) ;
  9) Notifications annoncées aux lecteurs d'écran (`aria-live="polite"`),
  scroll doux respectant reduced-motion.
  126 tests verts (`test/v194-test.js`). Bump cache v194.
- **v195 → v199 (01/09)** : Phase 3 — Home Ultra Pro (v195), **Modmail**,
  `/profile`, recherche de transcriptions, aide intégrée (v196), audit UI 0 problème
  26 modules (v197), « tout est configurable » : giveaways, suggestions, image des
  panneaux tickets, MP de fermeture, quiz personnalisés (v198), **Hub Fondateur**
  5 onglets (v199).
- **v200 → v204 (01-02/09)** : bienvenue pro — salons cliquables `{channels}` /
  `{salon}` par phrase, modèle prêt à l'emploi, correctif `<#undefined>`, sélecteur
  de salons, audit UI (polices, accès rapides, sélecteur de serveurs compact).
- **v205 → v208 (02/09)** : pings salons fiables + sécurité renforcée, anti-images
  cassées global, avatar du bot toujours visible, **photos Discord servies via notre
  proxy** (`server/imgproxy.js`, route `/api/img`).
- **v209 → v211 (04/09)** : messages Discord à l'identité Hoxera « façon bots pro »
  (`server/discord/ui.js`), **carte image de montée de niveau** (sharp), **profils
  d'envoi multiples par serveur** (`bot_profile_aliases`, qui signe les messages).
- **v212 → v214 (04/09)** : tickets — embed du salon privé propre & personnalisable,
  actions staff en menu déroulant ; Auto-Mod — **barème progressif** des sanctions
  (`automod_strikes`, récidives par règle) ; XP — **rôles par niveau en échelle de rangs**.
- **v215 → v217 (05/09)** : XP affichage « niveau » chiffre seul, panneaux `/rank`
  `/levels` façon DraftBot, finition visuelle des panneaux (grammaire couleurs & signatures).
- **v218 → v219** : dashboard — resynchronisation rôles/salons via l'API Discord,
  **menus de rôles modifiables** en place (`PUT /role-menus/:id`).
- **v220 (série de 10 commits)** : traits de séparation « pro » (━) entre les
  sections des panneaux, séparateurs NATIFS dans le panneau tickets personnalisés,
  **garde-fou anti-régression : aucun trait texte dans les panneaux natifs V2**,
  embed du salon de ticket allégé, plus de trait orphelin sur les messages courts.
  + `/meme` pioche d'abord dans des sources FRANÇAISES ; fix quiz (réponses A/B/C).
- **v226** : commandes triées par public visé (`commandKind` : public / staff / admin)
  → `default_member_permissions` à l'enregistrement + `/help` filtré (`HELP_BLOCKS`).
- **v227** : identité par serveur — aperçu dashboard unifié photo/bannière/nom.
- **v228 (05/09 — reprise par un nouvel agent)** : correctif de la seule
  erreur visible dans `/api/health/bot` (« Cannot read properties of null (reading
  'tag') ») : un message supprimé **partiel** (pas en cache) n'a pas d'auteur →
  `trackDeleted` (/snipe, `extra.js`) plantait ; idem `tasks.js` (`member.user.tag`).
  Gardes ajoutées, test `test/v228-test.js`, docs remises à jour (v194 → v228).
- **v236 (ACTUELLE, 05/09)** : **SÉPARATEURS NATIFS PLEINE LARGEUR — lot n°6,
  le DERNIER : 16 emplacements sur 12 fichiers.** `logging` (journal de
  modération) · `liveWatch` (annonce de live) · `community` (starboard :
  publication **et** édition) · `engine` (action `send_embed` du dashboard) ·
  `roleWizard` (accusé de réception) · `panelCommands` ×2 · `profileCommands` ×2
  · `profileWizard` · `automod` ×2 (panneau de blacklist + avertissement MP) ·
  `announcements` (`buildEmbed` **renommé** `buildPanel`) · `tasks` · `events` ×2
  (bienvenue + départ).
  ✅ **BILAN DE LA MIGRATION (v231 → v236) : 90 emplacements.** Il reste
  **0 `ui.panel(`** et **0 `ui.embed(`** dans TOUT `server/`, et seulement
  **3 `ui.sectionize(` actifs**, tous volontaires (voir plus bas).
  🚨 **PIÈGE n°11 — `components: []` sur un accusé de réception V2.**
  `roleWizard.js` terminait par `interaction.editReply({ embeds: [embed],
  components: [] })` pour effacer les boutons de l'assistant. En V2 **le
  conteneur EST le composant du message** : ajouter `components: []` aurait
  **effacé tout l'affichage**. L'accusé passe à
  `{ ...ui.v2panel({…}), content: null, embeds: [] }` — **sans** `components`.
  ⚠️ Les autres `components: []` du fichier sont **légitimes** : ce sont les
  étapes de l'assistant, qui restent en messages classiques à boutons.
  🚨 **PIÈGE n°12 — `events.js` : V2 + webhook + pièce jointe = 400.** La carte
  de bienvenue (`cfg.card`) est une **image générée envoyée en `files`** via
  `identity.sendAsProfile` (webhook). Or la doc officielle Discord (ressource
  *Webhook*) est explicite : « When the flag IS_COMPONENTS_V2 is set, the webhook
  message can only contain components. Providing content, embeds, **files[n]** or
  poll will fail with a 400 BAD REQUEST ». D'où le **branchement** :
  `if (files.length) { embed classique } else { ui.v2panel(…) }`.
  • `cfg.card` vaut **false par défaut** → le panneau de bienvenue est **en V2
    dans le cas nominal** ; l'embed classique ne sert que si l'admin active la
    carte image. Les 3 compteurs sont **factorisés** dans `welcomeFields` et
    partagés par les 2 rendus (aucune divergence possible).
  • Le panneau de **départ** n'envoie **jamais** de pièce jointe → **toujours
    V2**, aucun branchement.
  🚨 **PIÈGE n°13 — `v2.rows()` renvoie un TABLEAU.** `assert.ok(v2.rows(p) >= 1)`
  compare un tableau à un nombre → coercion en `NaN` → **toujours faux**. Écrire
  `v2.rows(p).length`. (`v2.dividers()` renvoie bien un nombre, lui.)
  🔧 **`test/helpers/v2.js` enrichi** : `allText(payload)` (concatène `content`
  du message **et** les TextDisplay du conteneur — permet de conserver les
  assertions `reponse.content.includes('…')` en remplaçant seulement
  `reponse.content` par `v2.allText(reponse)`), `accentColor(payload)`
  (équivalent V2 de `embed.color`), et `thumbnailUrls()` descend désormais dans
  **`accessory`** (la vignette d'en-tête est l'accessoire d'une `Section`, pas un
  enfant `components`).
  🔗 **Chaîne d'édition migrée ENTIÈRE** : le **starboard** (`community.js`)
  publie puis **édite** le même message quand le compteur d'étoiles change → les
  2 appels partagent `starOptions`, et l'édition vide
  `content`/`embeds`/`attachments`.
  📣 **`announcements.js` : API renommée.** `buildEmbed` → **`buildPanel`** (elle
  renvoie désormais un **payload**, plus un embed). `buildPayload` = spread du
  panneau + `allowedMentions`. Le **ping des rôles** devient un TextDisplay en
  tête de conteneur (`content` du conteneur), `allowedMentions` restant au niveau
  du message → **les rôles sont toujours réellement notifiés**. Seul appelant
  externe : `test/v126-test.js`.
  🧪 **11 tests existants mis à jour** (v18, v21, v84, v107, v114, v124, v126,
  v143, v217, v220, v229) — presque tous pour la même raison : ils lisaient
  `reponse.content` ou `reponse.embeds[0].data.*` sur des messages passés en V2.
  • v18/v21/v84 : lectures de texte → `v2.allText(…)` (le MP d'avertissement
    Auto-Mod porte désormais son détail dans le conteneur) ;
  • v114 : `sent[0].embeds.length` → `v2.isV2` + titre + séparateurs + ligne de
    boutons **dans** le conteneur ;
  • v126/v143 : `payload.embeds[0].data.title/color/fields` et `payload.content`
    → `v2.title` / `v2.accentColor` / `v2.allText`, et vérification que
    **`payload.content` est bien `undefined`** (interdit en V2) ;
  • v107/v217 : marqueurs de source `setThumbnail(avatarUrl)` /
    `.setAuthor({…})` / `if (cfg.image) {…}` → options V2 `thumbnail:` /
    `author:` / `image:` ;
  • v124 : `automodSource.includes('embeds: [ui.embed({')` → `ui.v2panel({` +
    assertion que `ui.embed({` a disparu ;
  • v220 (section « Couverture des autres panneaux ») et v229 (aiguilles des
    « 10 messages cibles ») : réécrits pour la v236.
  ⛔ **Les 3 `ui.sectionize(` restants sont VOLONTAIRES et vérifiés par
  `test/v236-test.js`** :
  • `events.js` — la **branche « carte image »** uniquement (pièce jointe +
    webhook, piège n°12) ;
  • `panels.js` — le **wizard « assistant types »** (6 étapes éditées en place,
    reporté depuis la v234) ;
  • `xp.js` — la **carte de niveau** (pièce jointe + webhook, piège n°10).
- **v235 (05/09)** : **SÉPARATEURS NATIFS PLEINE LARGEUR — lot n°5 :
  `extra.js` (le plus gros fichier de commandes).** **26 `ui.panel(` →
  `ui.v2panel(`**, le dernier `ui.embed(` (anniversaire du jour) et le dernier
  `ui.sectionize(` actif (`/apply view`). Il reste **0 `ui.panel(`**, **0
  `ui.embed(`** et **0 `ui.sectionize(` actif** (les 2 occurrences restantes sont
  dans des commentaires). **32 emplacements V2** dans le fichier.
  🚨 **PIÈGE n°1 — `{...ui.v2panel(…), ephemeral: true}`** (2 sites : `/quiz top`
  et `/birthday list`). Accoler `ephemeral` **APRÈS** le spread **écrase le champ
  `flags`** et fait perdre `IsComponentsV2` → le message serait parti en
  composant classique, illisible. `ephemeral` est passé **DANS** les options, qui
  combinent les deux flags. (Même piège qu'en v233 sur `/event list`.)
  🚨 **PIÈGE n°2 — `content` au niveau du message** (3 sites : annonce
  programmée `s.text`, anniversaire du jour `<@membre>`, rappel en repli salon).
  Interdit en V2 → le texte devient un **TextDisplay en tête de conteneur** (même
  position visuelle). **`allowedMentions` reste au niveau du message** et les
  mentions continuent de notifier.
  🚨 **PIÈGE n°3 — `reminderPanel.embeds`.** Le repli en salon du rappel faisait
  `channel.send({ content: <ping>, embeds: reminderPanel.embeds, … })`. Sur un
  payload V2, **`.embeds` vaut `undefined`** → **le message serait parti VIDE**
  (bug silencieux, visible seulement quand le membre a ses MP fermés). Les
  options sont **factorisées** dans `reminderOptions` et le panneau est
  reconstruit avec le ping.
  🔗 **Chaînes d'édition migrées ENTIÈRES** (Discord interdit de sortir du V2 à
  l'édition) : mariage (`proposal` → 2 × `interaction.update`), pendu
  (`penduPanel` → update live à chaque lettre), morpion (`morpionPanel` → update
  live à chaque case). **4 `interaction.update(ui.v2panel(…))`**. Les jeux
  gardent **`sections: false`** (2 phrases courtes + mise à jour live → un
  séparateur sauterait à chaque tour ; critère v229 inchangé).
  ✅ **`applyd` n'était PAS un vrai bloqueur.** Le « bloqueur extra.js:1128 »
  identifié en v232 disparaît de lui-même : le **message de candidature**
  (`handleModal`) est un `EmbedBuilder` avec **uniquement des champs** (une ligne
  par question) et **AUCUNE description** → il ne produit **AUCUN trait**. Il
  reste donc en embed classique, et `applyd` peut continuer à relire
  `interaction.message.embeds[0]` pour le recolorer. **Les 2 MP de décision**
  (acceptée / refusée), eux, sont migrés.
  ⛔ **NON migré (volontaire)** : `/poll` (`pollEmbed` — v230 l'a passé en champs
  d'embed, séparation déjà native, **aucun trait**), `/top` (`renderTop` —
  description en `\n` simples, **aucun trait**, pagination éditée en place),
  `/snipe` et `/invites` (EmbedBuilder bruts, aucune description
  multi-paragraphes).
  🧪 **4 tests existants mis à jour** (v34, v80, v124, v229) :
  • v34 vérifiait `payload.components.length === 2` pour les 2 rangées de lettres
    du pendu → `v2.rows(payload).length === 2` (les rangées sont DANS le
    conteneur) ;
  • v80 lisait `sent[0].content` (annonce programmée) et `bdayMsgs[0].content`
    (anniversaire) → lecture via `test/helpers/v2.js` ;
  • v124 vérifiait `extraSource.includes('ui.panel({')` → `ui.v2panel({` +
    assertion que `ui.panel(` a bien disparu ;
  • v229 avait `/apply view` dans sa liste des « 10 messages qui passent par
    `ui.sectionize` » → needle mis à jour **et** contrôle de rendu remplacé :
    1 **séparateur natif** entre les 2 paragraphes, **0 trait texte**, et
    `footer: false` respecté (l'original n'avait pas de pied).
  📌 **RÈGLE ENCORE ÉTENDUE** : après un remplacement global `ui.panel(` →
  `ui.v2panel(`, un **`grep -n "\.embeds"` sur le fichier migré est OBLIGATOIRE**
  (réinjection d'un payload V2 dans un message classique) — ainsi qu'un grep sur
  `content:` accolé au payload.
- **v234 (05/09)** : **SÉPARATEURS NATIFS PLEINE LARGEUR — lot n°4 :
  les tickets.** 🎫 **`panels.js` — TOUT le fichier passe en V2 (11
  emplacements)** : le panneau de tickets principal, le menu de rôles, les 4
  annonces de salon (fermé / réouvert / pris en charge / en attente), les 3
  panneaux automatiques (fermeture, rappel, suppression) et les 2 MP
  (confirmation d'ouverture, demande d'évaluation). Il reste **0 `ui.panel(`** et
  **0 `ui.embed(`** dans le fichier.
  📐 **`buildTicketPanelEmbed` → `buildTicketPanel`** : retourne désormais un
  **PAYLOAD** (et non un `EmbedBuilder`) et reçoit **`rows` en 6e argument**, car
  en V2 les lignes de boutons/menus vont **DANS** le conteneur.
  🚨 **PIÈGE n°1 — `pruneOldPanels`.** Cette fonction relit `msg.embeds[0].title`
  pour ne garder qu'**un seul panneau par genre** dans le salon. Un payload V2 n'a
  plus de champ `embeds` : sans correction, les **nouveaux** panneaux n'auraient
  jamais été nettoyés et se seraient **accumulés en doublons**. → Nouveau helper
  **`panelTitleOf(msg)`** (exporté en `__testPanelTitleOf`) qui lit le titre dans
  les **DEUX** formats : `embeds[0].title` pour les panneaux **déjà en place**
  dans les salons, conteneur type 17 → TextDisplay `## …` pour les nouveaux.
  🚨 **PIÈGE n°2 — `sendRoleMenu` ÉDITE un message déjà en place**, envoyé avant
  cette version en embed classique. Discord exige alors `content` / `embeds` /
  `attachments` **explicitement vidés** pour basculer en V2 →
  `existing.edit({ ...payload, content: null, embeds: [], attachments: [] })`.
  🚨 **PIÈGE n°3 — `roleMenuPayload` faisait `payload.components = components`
  APRÈS coup** : en V2 cela **écrasait le conteneur**. Les rangées passent en 2e
  argument de `ui.v2panel`.
  🧹 **Bug trouvé au passage** : les 3 panneaux automatiques posaient le **MÊME
  texte DEUX FOIS** (`content` du message + `description` de l'embed) → rendu
  dupliqué visible. La duplication est supprimée (`Panel.content = i18n.t(...)`
  retiré), seule la description dans le conteneur est conservée.
  🎨 **`ui.js` — `v2fieldName`** : le panneau de tickets utilisait
  `{ name: '\u200b', value: P.patience }` comme **espaceur** d'embed. En V2 cela
  aurait affiché un intitulé gras invisible. Un nom de champ composé uniquement
  de caractères invisibles (U+200B-200F, U+2060, BOM, espaces) est désormais
  traité comme **vide** → seule la valeur est rendue (`v2fieldLine` +
  `v2fieldBlock`).
  ✅ **Webhook OK** : le panneau part via `identity.sendAsProfile` (webhook).
  V2 + webhook + **pièce jointe** = 400, mais ici la bannière est une **URL HTTP**
  servie par le site (`/api/tickets/panel-banner/…`) → aucune pièce jointe,
  `MediaGallery` compatible. Vérifié : `sendAsProfile` n'ajoute pas de `files`.
  ⛔ **NON migré dans ce lot (volontaire)** :
  • le **wizard « assistant types »** (6 étapes `types*Embed` éditées en place via
    `upd({embeds, components})`). Une seule de ses étapes produit un trait
    (`typesQuestionsEmbed`), et Discord **interdit de revenir à un message
    classique** une fois en V2 : migrer UNE étape sans les 5 autres **casserait le
    wizard**. → **Lot dédié requis.**
  • le **récapitulatif de ticket** (journal, `📔 Récapitulatif — Ticket #N`) :
    construit en `EmbedBuilder` brut **SANS description** → il ne produit
    **AUCUN trait**. Le migrer imposerait de réécrire `updateRecapRating`, qui
    relit `msg.embeds[0].fields` pour remplacer la note ⭐. Bénéfice visuel nul
    pour le trait → reporté.
  🧪 **9 tests existants mis à jour** (v32, v36, v48, v49, v79, v85, v124, v198,
  v219) — tous lisaient `payload.embeds[0].toJSON()`. Nouveau module partagé
  **`test/helpers/v2.js`** (`texts`, `title`, `author`, `footer`, `dividers`,
  `mediaUrls`, `thumbnailUrls`, `rows`, `controls`, `controlByPrefix`, `isV2`,
  `json`, `componentCount`) : centralise l'équivalence embed → V2 pour éviter de
  la réécrire à chaque lot. **`run-all.js` n'est pas récursif** → un
  sous-dossier `test/helpers/` n'est pas exécuté comme un test.
  📌 **RÈGLE COMPLÉTÉE POUR LES LOTS SUIVANTS** : avant de migrer, chercher dans
  `test/` **ET** dans `scripts/` les motifs `embeds[0]`, `.setFooter(`,
  `.setImage(`, `ui.panel(`, `ui.embed(` — et ne pas oublier que les tests qui
  capturent `p.content` (v85) perdent le texte quand `content` disparaît.
- **v233 (05/09)** : **SÉPARATEURS NATIFS PLEINE LARGEUR — lot n°3.**
  🎁 **`giveaway.js` — 5 emplacements.** `buildEmbed` → **`buildPanel`**,
  `buildEndedEmbed` → **`buildEndedPanel`** (exports renommés, `EmbedBuilder`
  retiré des imports). Les 2 lancements (slash + dashboard), **l'ÉDITION du
  message en fin de tirage** et l'annonce des gagnants.
  ⚠️ **Point de risque principal** : le giveaway est un message **PERMANENT**
  édité à la fin du tirage. Discord interdisant de sortir du V2 à l'édition,
  **les deux bouts devaient migrer ensemble** — un lancement V2 avec une fin en
  embed classique aurait été rejeté par l'API.
  ✅ **La réaction 🎉 continue de fonctionner** : les réactions sont
  indépendantes des composants d'un message.
  Le ping `@everyone`/rôle devient un TextDisplay en tête (`content` interdit en
  V2) et `allowedMentions` reste appliqué. Les 2 compteurs (`🏆 Nombre de
  gagnants`, `⏰ Fin du tirage`) étaient en `inline:true` → regroupés sur une
  ligne ; le compte à rebours reste un timestamp Discord `<t:…:R>` natif.
  🎮 **`guildEvents.js` — 7 emplacements.** `eventPanel(entry, guildId, ev)`
  devient **`eventPanel(entry, guildId, ev, rows = [], content = '')`** :
    • `rows` — en V2 les lignes de boutons vont **DANS le conteneur**, pas au
      niveau du message. Les 4 appelants qui faisaient
      `{ embeds: eventPanel(...).embeds, components: eventButtons(ev) }`
      **cassaient à coup sûr** (`.embeds` vaut `undefined` sur un payload V2) :
      tous convertis.
    • `content` — le texte des rappels 24 h / 1 h devient un TextDisplay.
  Couverts : création, **mise à jour des inscrits** (`interaction.update`),
  rappels 24 h et 1 h, `/event list`, `/event delete`.
  🐛 **Piège évité au passage** : `/event list` et `/event delete` faisaient
  `interaction.reply({ ...ui.panel({...}), ephemeral: true })`. Avec un payload
  V2, accoler `ephemeral: true` **après** le spread peut écraser le champ
  `flags` et faire perdre `IsComponentsV2`. `ephemeral` est désormais passé
  **dans les options** de `ui.v2panel`, qui combine les deux flags.
  🧪 **4 tests existants mis à jour** : `test/v198-test.js` (4 assertions) et
  `test/v220-test.js` (6 assertions) appelaient `giveaway.buildEmbed` /
  `buildEndedEmbed` ; `test/v25-test.js` lisait `sentMessage.embeds[0].data.title`
  (un payload V2 n'a plus de champ `embeds`) ; `test/v209-test.js` vérifiait la
  signature Hoxera via `.setFooter({...})` — **l'intention est conservée**, seule
  la forme change (`footer:` dans les options de `ui.v2panel`).
  📌 **RÈGLE POUR LES LOTS SUIVANTS** : un test qui lit `payload.embeds[0]`
  casse systématiquement après migration. Chercher `embeds[0]` et `.setFooter(`
  dans `test/` avant chaque lot.
  **160 tests verts** (`test/v233-test.js`, 74 assertions). Bump cache v233.
- **v232 (05/09)** : **SÉPARATEURS NATIFS PLEINE LARGEUR — lot n°2.**
  🧰 **`ui.v2container` complété** — sans ça la migration aurait **DÉGRADÉ** le
  rendu. Components V2 n'a **ni champs `inline`** (la grille 3 colonnes des
  embeds), **ni champ `author`**, **ni `thumbnail`**, **ni `image`** d'embed :
    • champs `inline:true` **consécutifs regroupés par 3** dans un seul
      TextDisplay, séparés par ` · ` (comme la grille Discord qui passe à la
      ligne tous les 3) ; au-delà de `V2_INLINE_LINE` (150) ils sont empilés
      dans le même bloc — jamais de ligne coupée ;
    • `author` + `iconURL` → **`SectionBuilder` avec `ThumbnailBuilder` en
      accessoire** (l'avatar est conservé) ; `author` sans icône → simple
      TextDisplay ;
    • `thumbnail` → accessoire de la Section du titre ;
    • `image` → **`MediaGallery` pleine largeur, en BAS** (même place que
      `setImage()` sur un embed classique) ;
    • **ordre des blocs calqué sur l'embed classique** : content → author/titre
      → description → champs → image → pied.
  📦 **`premade.js` — 13 messages.** Le helper `replyPanel` est converti en un
  seul point : **11 messages d'un coup** (`invite`, `buy`, `pay`, `kick`, `ban`,
  `unban`, `timeout`, `warn`, `clear`, `daily`, `balance`). Ce sont des réponses
  **TRANSITOIRES**, jamais relues ni éditées → aucune ne dépend de `msg.embeds`.
  Plus `/levels` et la sanction envoyée en MP. **0 `ui.sectionize` restant.**
  💡 **`suggest.js` — 5 emplacements.** `buildEmbed` → **`buildPanel`** (usage
  strictement interne, vérifié). Les 3 compteurs de votes étaient en
  `inline:true` → regroupés sur une ligne. Les **deux `interaction.update()`**
  de vote passent en V2 (Discord interdit d'en sortir à l'édition).
  ⚠️ **Le ping `@everyone`/rôle** : en V2 le champ `content` du message est
  **INTERDIT**. Il devient un TextDisplay en tête de conteneur — les mentions y
  **notifient bien** (doc officielle) et `allowedMentions` reste appliqué.
  🐛 **`queue.js` — clé de dédoublonnage corrigée.** Elle distinguait
  `payload.embeds ? 'embed' : 'msg'`. Un payload V2 n'a **pas** de champ
  `embeds` : tous les panneaux V2 seraient tombés dans la clé `'msg'` et
  amalgamés avec les messages texte. Désormais 3 familles : `embed` / `v2` /
  `msg`. **Ce bug serait apparu dès le lot n°3.**
  ⛔ **`xp.js` — EXCLUSION VOLONTAIRE ET DOCUMENTÉE** (25 lignes de
  commentaire dans le fichier). La carte de montée de niveau est envoyée par
  `identity.sendAsProfile()` → **WEBHOOK** avec la carte en **pièce jointe**
  (`attachment://levelup.png`). Or la doc officielle Discord (*Webhook
  Resource → Execute Webhook*) dit : *« When the flag IS_COMPONENTS_V2 is set,
  the webhook message can only contain components. Providing content, embeds,
  **files[n]** or poll will fail with a **400 BAD REQUEST** response »*. Le
  repli sur `channel.send()` ferait partir le message **sans le nom ni
  l'avatar personnalisés** → on perdrait une fonctionnalité produit pour un
  détail cosmétique. Le webhook étant `application-owned` (créé par
  `channel.createWebhook`), **les messages V2 SANS pièce jointe qui passent par
  `sendAsProfile` restent migrables** (`events.js:217` et `:220`).
  🧪 **4 tests existants mis à jour** (ils suivaient l'ancien rendu) :
  `test/v198-test.js` et `test/v220-test.js` appelaient `suggest.buildEmbed`
  (2 assertions) ; `test/v229-test.js` suivait `/levels` en `sectionize`
  (3 assertions) ; `test/v217-test.js` vérifiait la couleur terracotta de
  `/levels` via `.setColor()` (1 assertion — **l'intention est conservée**,
  seule la forme change : `color:` au lieu de `.setColor()`).
  **159 tests verts** (`test/v232-test.js`, 85 assertions). Bump cache v232.
- **v231 (05/09)** : **SÉPARATEURS NATIFS PLEINE LARGEUR — lot n°1**
  (Components V2). Demande utilisateur : *« le trait du quiz et le panneau du
  Système de tickets personnalisés ne sont pas à la même longueur ; ma
  préférence c'est le trait du ticket personnalisé […] tu vas corriger tout ce
  qui a le même trait que le quiz en trait ticket personnalisé. »*
  📏 **LE PROBLÈME, vérifié et non supposé** : un trait fait de caractères `━`
  est du **TEXTE**. Discord applique un padding interne à tout contenu d'embed →
  le trait s'arrête **avant** le bord arrondi, et sa longueur visible dépend du
  nombre de caractères (20 × `━` ici). Les panneaux du bot n'avaient donc PAS
  tous la même longueur de trait. **Allonger le trait n'est pas une solution** :
  il ne touche jamais l'arrondi et finit par passer à la ligne sur mobile, où
  l'embed est plus étroit.
  ✅ **LA SEULE SOLUTION** : le `Separator` de Components V2, composant de
  **LAYOUT** que Discord dessine bord à bord jusqu'aux arrondis. C'est ce que
  faisait déjà `advancedTickets.js` (v220) — dont le commentaire disait déjà
  « pas un trait de texte qui ne va pas jusqu'au bord du panneau ».
  🧰 **`ui.js` reçoit une API V2 complète** : `v2container`, `v2panel`,
  `v2contentPanel`, `v2status`, `v2edit`, `colorInt`, `V2_TEXT_BUDGET` (4 000),
  `V2_COMPONENT_CAP` (40). **Même grammaire d'options que `embed()`/`panel()`**
  (`title`, `description`, `content`, `fields`, `footer`, `timestamp`,
  `sections:false`, `variant`/`color`) pour que la migration d'un message soit
  **mécanique** : `ui.panel(...)` → `ui.v2panel(...)`. Réutilise `paragraphs()`,
  déjà partagé avec `advancedTickets.js`.
  📐 **Grammaire calquée sur le panneau de référence** : titre en `## …` **sans**
  séparateur juste après (le heading est déjà détaché), un séparateur natif
  **entre** chaque bloc du corps, un séparateur avant le pied, pied en `-# …`
  avec l'heure reportée (V2 n'a pas de champ `timestamp`).
  ⚠️ **CONTRAINTES OFFICIELLES** (doc discord.js « Display Components »,
  vérifiées dans `node_modules/discord.js/typings/index.d.ts`) :
    • avec le flag `IsComponentsV2` on ne peut envoyer **ni `content`, ni
      `embeds`, ni `poll`, ni `stickers`** ;
    • **40 composants max, imbriqués compris** (le conteneur compte) ;
    • **4 000 caractères max CUMULÉS** sur tous les TextDisplay ;
    • **impossible de revenir** à un message classique en éditant → un message
      mis à jour (`interaction.update`) doit **rester** en V2 ;
    • on **peut** passer en V2 à l'édition en mettant explicitement `content`,
      `embeds`, `poll`, `stickers` à null → c'est le rôle de `ui.v2edit()`.
  🧠 **/quiz migré (lancement ET résultat)** : même grammaire aux deux bouts
  puisque Discord interdit d'en sortir à l'édition. `interaction.update()`
  accepte le flag : `InteractionUpdateOptions extends MessageEditOptions`, qui
  autorise `flags: SuppressEmbeds | IsComponentsV2`.
  🐛 **BUG ATTRAPÉ PAR LES TESTS** : `colorFor()` ne reconnaît que les variantes
  nommées et les chaînes `#rrggbb`. Une couleur **numérique** (`0x57f287`)
  retombait donc silencieusement sur `COLORS.info`. Sans le correctif
  (`colorInt` accepte désormais les nombres), **le vert d'un quiz réussi et le
  rouge d'un quiz raté se seraient affichés en orange**.
  🔒 **Garde-fous** : les deux plafonds Discord sont suivis pendant la
  construction (`v2state`/`v2room`/`v2text`/`v2separator`) → un panneau très
  long **se tronque** au lieu de faire rejeter le message par l'API.
  🧪 `test/v229-test.js` (4 assertions) et `test/v230-test.js` (2 assertions)
  mis à jour : ils vérifiaient que le quiz passait par `sectionize()`. Le
  garde-fou « aucun ━ dans les panneaux natifs » exclut désormais `ui.js`
  (module de design system qui définit les DEUX API) et est **renforcé** par un
  contrôle **fonctionnel** du payload réel.
  **158 tests verts** (`test/v231-test.js`, 101 assertions). Bump cache v231.
  🚧 **MIGRATION EN COURS** : 24 emplacements produisaient un trait texte,
  47 messages passent par `ui.panel/embed/status`. Ce lot ne couvre que le
  quiz. **Les lots suivants sont à poursuivre** (mode prudent validé par
  l'utilisateur : un lot = une version, tests + aperçu, feu vert avant push).
- **v230 (05/09)** : **`/poll` passe en CHAMPS D'EMBED** (un champ par
  option) — la demande utilisateur faisait suite à l'aperçu comparatif des 3
  rendus (actuel / avec 9 traits / champs d'embed).
  • Rendu : la séparation devient NATIVE (Discord espace les champs), donc ni
    lignes vides ni traits ━ ; pourcentage et barre alignés sur leur ligne.
  • Le critère v229 est respecté : une LISTE D'OPTIONS n'est pas une suite de
    sections → `sectionize()` ne s'applique toujours pas (9 traits pour 10 choix).
  • 🐛 **BUG LATENT CORRIGÉ AU PASSAGE** : les choix de `/poll` arrivaient dans
    `pollEmbed()` sans AUCUNE limite de longueur (`raw.split('|')`), et l'ancien
    rendu les empilait dans `setDescription()` SANS troncature. 10 choix de 400
    caractères → 4 367 caractères > limite Discord de 4 096 → **le sondage
    échouait à s'envoyer**. Désormais : libellés tronqués à 100 caractères AVANT
    la mise en gras (markdown `**` toujours apparié), `.slice(0, 25)` (limite
    Discord de 25 champs), barre bornée à 10 segments. Même cas : 1 931 octets.
  • État vide (0 vote) : description « *Aucun vote pour l'instant — choisis un
    numéro ci-dessous 👇* » (cohérent avec les états vides du dashboard, v194).
  • `pollEmbed` et `pollRows` sont désormais **exportées** pour être testables.
  • `test/v229-test.js` mis à jour (2 assertions /poll suivaient l'ancien rendu).
  157 tests verts (`test/v230-test.js`, 57 assertions). Bump cache v230.
- **v229 (05/09)** : **le système de traits ━ (v220) est mené à son
  terme.** Audit exhaustif des messages Discord construits HORS design system
  (13 candidats trouvés, 1 faux positif : `guildEvents.js` passe déjà par
  `ui.panel`, donc `sectionize` s'y applique déjà tout seul).
  ⚖️ **CRITÈRE OFFICIEL (v220 précisé par v229 — à ne jamais perdre de vue) :**
  ce n'est PAS « jeu interactif = pas de trait », mais **« jamais de trait entre
  deux COURTES phrases »**. Le trait s'applique dès qu'il y a **≥ 3 blocs
  substantiels**, ou 2 blocs dont au moins un est dense.
  **10 messages reçoivent le trait** :
  1) `/apply view` (`extra.js`, `content:`) — récapitulatif → instruction finale ;
  2) `/ticket types` type mis à jour (`panelCommands.js`, 3 traits) ;
  3) `/ticket types` type ajouté (`panelCommands.js`) ;
  4) assistant types, étape « Questionnaire » (`panels.js`) ;
  5) `/levels` classement des niveaux (`premade.js`) — en-tête → liste ;
  6) `/botprofile` identité mise à jour (`profileCommands.js`, 2 traits) ;
  7) `/botprofile` avatar/bannière enregistré (`profileCommands.js`) ;
  8) `/botprofile setup` mode d'emploi de la galerie (`profileWizard.js`, 2 traits) ;
  9) `/quiz` **lancement** (`extra.js`, 2 traits) — question / réponses A-B-C /
     bonus de rapidité = 3 blocs substantiels ;
  10) `/quiz` **résultat** (`extra.js`, 2 à 3 traits) — ⚠️ les DEUX messages du
     quiz doivent être traités ensemble : le résultat remplace le lancement via
     `interaction.update()`, sinon le message « saute » visuellement au clic.
  → `panelCommands.js`, `profileCommands.js` et `profileWizard.js` **importent
  désormais `ui.js`** (ils ne le faisaient pas).
  **EXCLUSIONS VOLONTAIRES verrouillées** (commentaire `EXCLUSION VOLONTAIRE`
  dans le code + assertions du test — ne JAMAIS les « corriger ») :
  • **`/poll`** : chaque paragraphe EST une option de vote → 10 choix feraient
    **9 traits** et hacheraient le vote. → **Tranché en v230** : le sondage est
    passé en champs d'embed (un champ par option), la question est donc réglée.
  • **`/shop`** : 2 phrases courtes → **trait orphelin** (bug corrigé en v220).
  • **mariage, pendu, morpion** : 2 phrases courtes chacun + mises à jour live à
    chaque tour → `sections: false` (héritage v220, inchangé).
  Garde-fous v220 revérifiés : `extra.js` garde ses 5 `sections: false`, aucun
  ━ texte dans les panneaux natifs Container V2 (`SeparatorBuilder` ≥ 3).
  156 tests verts (`test/v229-test.js`, 47 assertions). Bump cache v229
  (`?v=229` ×7 + `botdev-v229`) ; les 7 `DATA_DIR` `botdev-v228-${Date.now()}`
  des tests sont laissés intacts volontairement.
- **v192** : **CORRECTIF aperçu des annonces de live**. L'aperçu de la
  carte « Annonces de live » affichait un pseudo d'exemple codé en dur
  (« 93_vlz est en live ! ») sur TOUS les serveurs — confondu avec un compte
  suivi réel. Il est désormais DYNAMIQUE : premier compte suivi du serveur,
  ou exemple neutre « @ton_streamer » si aucun. Aussi : nettoyage automatique
  des bases de test dans /tmp au début de check.sh (évite SQLITE_FULL).
  124 tests verts (`test/v192-test.js`). Bump cache v192.
- **v191** : **RETRAIT des pages publiques** (demande utilisateur).
  Les pages publiques par serveur (`#/g/<id>`, route `/public/guilds/:guildId`,
  `guildPublicInfo`/`botPublicGuilds`, section « Serveurs publics » de la page
  bot, `upcomingByGuild`) et la page de statut publique (`#/status`) ont été
  **supprimées** — plus rien de public ne liste les serveurs. Le reste du LOT 4
  reste livré : 6 langues, quiz, série /daily, export CSV, événements.
  123 tests verts (`test/v191-test.js`). Bump cache v191.
- **v190** : **LOT 4 « International & fun »**.
  - **Multi-langues** : `server/i18n.js` étendu à 6 langues (fr, en, es, de, pt, it),
    `/lang` accepte les 6 codes, repli automatique sur le français pour les clés
    non traduites (aucune casse).
  - **Page publique par serveur** : route `/public/guilds/:guildId` +
    `botManager.guildPublicInfo()` / `botPublicGuilds()`, page front `#/g/<id>`
    (nom, icône, membres, événements à venir `guildEvents.upcomingByGuild`,
    top quiz), section « Serveurs publics » sur la page du bot.
  - **Quiz compétitif** : `/quiz` (jouer / top), table `quiz_scores`, boutons
    🇦🇧🇨 (`hxquiz:`), +10 pts (bonus +5 si < 8 s), classement par serveur,
    module dashboard « Quiz » avec export CSV.
  - **Série de connexion** : `/daily` bonus streak +25/jour (plafond +300),
    colonne `economy.daily_streak`, affichée dans l'économie du dashboard.
  - **Page de statut publique** `#/status` + export CSV (Économie).
  - 122 tests verts (`test/v190-test.js`).
- **v189** : **LOT 2 « Gaming & stream »** — événements/tournois.
  Nouveau module `server/discord/guildEvents.js` : commande `/event`
  (create/list/delete), table `guild_events` (participants JSON, rappels
  reminded_24h/reminded_1h), boutons `hxev:join/leave`, sweep toutes les 60 s
  (rappel 24 h puis 1 h avant, message de démarrage, nettoyage), module dashboard
  « Événements », routes GET/POST/DELETE `/events`, section /help. Les lives
  TikTok/Twitch/YouTube/Kick existaient déjà (liveWatch). 121 tests verts.
- **v188** : **LOT 1 « Quick wins communauté »** — /afk, /top paginé, historique
  sanctions (module Membres), rappels récurrents (repeat_mode). Table `afk`,
  compteurs xp/economy.count, `extra.onMessage`, boutons `hxtop:`. 120 tests verts.
- **v187** : **AUDIT UI ÉTENDU** (`audit-tools/audit3.js`, 5 passes) — l'utilisateur
  a demandé de « continuer les analyses ». Résultat : 0 problème partout.
  1. **E — menus déroulants OUVERTS** (20 panneaux) : le `.dd-panel` restait sombre
     (#232637) en mode clair avec textes hérités foncés → illisible. Version claire
     complète (fond, recherche, options).
  2. **F — contraste MODE SOMBRE** (23 modules × 2 tailles) : propre d'origine ✓
     (les boutons blanc-sur-accent ratio 3 = standard assumé, exclus de la passe).
  3. **G — interfaces éphémères JAMAIS ouvertes par les audits précédents** :
     palette Ctrl+K, cloche 🔔, sélecteur de couleur 🎨, modale de confirmation =
     fonds #36393f forcés par la couche v10 (l.3487-3497) → tous flippés clairs ;
     tiroir « Plus » mobile idem (+ textes du compte) ; toast ✓.
  4. **H — bascule de thème EN DIRECT** : fonctionne (faux positif initial = mesure
     pendant une transition CSS → toujours attendre ~450 ms).
  5. **I — contenu extrême** (noms de 90-160 caractères) : fil d'Ariane en ellipsis,
     titres en `overflow-wrap:anywhere`, pieds de cartes défilables — plus de scroll
     horizontal. Et correction bonus : l'ancienne passe claire v170 (l.4650-4760)
     mettait des textes clairs sur les chips « Lundi…Dimanche » et filtres logs
     devenus blancs → neutralisée (correctif 23).
  Leçons v187 : tester les UI éphémères OUVERTES ; une navigation hash seule ne
  recharge PAS la page (thème non appliqué) → `page.reload()` ; fond rgba : mélanger
  sur l'ancêtre opaque sinon faux positifs.
  (Précédent v183 : fond v177 (sans robot) + LOGO ARGENT calqué
  (l'avatar Discord du bot, `optimus-logo-v2.png`, choisi par l'utilisateur : « pas celui
  que tu viens de créer il y a 4 minutes »). Pose en mode **écran** : le fond noir pur de
  l'avatar laisse la bannière intacte, seul le logo argent se dépose — mêmes taille et
  position que la tête premium (enveloppe 413×429, centre 1299/329, écart 1 px).
  Vérifié : 0 pixel modifié hors du logo, texte intact, marges <25 nettoyées à noir.
  Fichier actif : `assets/banner-v183-final.png` ; bannière Discord = hash `5c094021`.
  Crops site inchangés : profile = `crop(0,2,1632,654)→1500×600` ;
  support = `resize(1696×682)→crop(0,29,1696,653)`.

## 🎨 IDENTITÉ VISUELLE (pipeline pro)

- **Avatar Discord** = logo argent/noir de l'utilisateur (1024×1024) + même image pour
  favicon/PWA (`public/icons/nexora-robot-mark*.png`, `icon-*.png`)
- **Bannière Discord** = 1632×656 (1632 = 5:2) ; même image recadrée pour
  `public/icons/nexora-profile-banner.png` (1500×600, MP transcription) et
  `public/icons/support-banner.png` (1696×624, panneaux tickets)
- **Méthode « pas générée par IA »** : générer le fond/emblème SANS texte, puis composer
  le texte avec une vraie police (Poppins ExtraBold) via PIL : dégradé argent vertical
  sur TOUTE la hauteur des capitales + ombre douce + interlettrage. Vérifier par OCR
  (tesseract) que le texte se lit parfaitement
- Bio du bot = `aboutText()` dans botManager.js, réappliquée à chaque démarrage
  (4 lignes : accroche / modules / dashboard / support — limite Discord 190 caractères)

## ⚠️ PIÈGES CONNUS (appris à la dure)

1. **Cache** : `?v=NNN` ×7 + `botdev-vNNN` (sw.js) à incrémenter à CHAQUE modif frontend
2. **La base SQLite est éphémère** : restaurée depuis GitHub au boot → **toute modif de
   données devant survivre à un déploiement** (ex. renommer le bot via l'API) doit être
   suivie de `POST /api/backup/now` (cookie de session dashboard) sinon elle est perdue
3. **Cloudflare bloque python urllib sur discord.com** (erreur 1010) : utiliser `curl`
   pour l'API Discord (avatar, bannière, username, description — tout passe par
   `PATCH /users/@me` et `PATCH /applications/@me` en base64 data-URI PNG)
4. **Rôle intégré du bot** : Discord ne le renomme JAMAIS quand on renomme le bot
   (le nom est figé à l'ajout). Le bot essaie de le faire lui-même au démarrage
   (`syncBotRoleName`) mais ça ne marche que si le bot possède un rôle AU-DESSUS du sien
   — sinon 403. Seul remède : le renommer à la main par serveur (Paramètres → Rôles)
5. **Environnement sandbox de l'agent** (effacé entre les sessions) : `npm install`
   requis avant `check.sh` ; `/tmp` vidé ; tesseract via `apt-get install tesseract-ocr` ;
   le token du bot se récupère via l'API Render (env vars du service).
   ⚠️ **`.git/config` EST EFFACÉ ENTRE LES TOURS** (chemin sensible exclu des
   sauvegardes du workspace) : `git config user.name/email` **et** l'URL du
   remote `origin` disparaissent, même s'ils ont été posés avec succès plus tôt
   dans la même conversation. Symptômes vécus le 05/09 : `git commit` →
   « Author identity unknown », puis `git push` → « 'origin' does not appear to
   be a git repository ». **Rien n'est perdu** (l'index et les fichiers sont
   intacts, `git log` fonctionne) — ne PAS re-cloner.
   ✅ **La parade qui marche** : ne rien écrire dans la config, tout passer en
   arguments —
   `git -c user.name="…" -c user.email="…" commit -F -` puis
   `git push https://x-access-token:<TOKEN>@github.com/nexusdolf-rgb/botdev.git main:main`.
   Même chose pour `node_modules` (exclu des sauvegardes) : `npm install` à
   refaire à chaque reprise, sinon `Cannot find module 'discord.js'`.
   ⚠️ Un script Node placé HORS du dépôt (`/home/user/…`) ne résout pas
   `node_modules` : lancer avec `NODE_PATH=/home/user/botdev/node_modules`.
6. **Token GitHub fine-grained expire ~7 jours** : si push refusé, demander un nouveau
   à l'utilisateur (droits : Contents RW + Workflows RW sur botdev ET botdev-data)
7. **Commandes slash** : GLOBALES uniquement. **Jamais 2 services actifs** avec le même
   token. IP Render free peut être bloquée par Discord → migrer de région via l'API
8. Détection de secrets dans check.sh : **jamais de token en dur** (le dépôt est public)
9. Ancien token PAT dans les vieux scripts : INVALIDE — toujours tester `api.github.com/user`
10. **⛔ Components V2 + WEBHOOK + PIÈCE JOINTE = 400 BAD REQUEST.** Doc
    officielle Discord (*Webhook Resource → Execute Webhook*) : *« When the flag
    IS_COMPONENTS_V2 is set, the webhook message can only contain components.
    Providing content, embeds, **files[n]** or poll will fail with a 400 BAD
    REQUEST response »*. Conséquence pour ce projet : tout message envoyé par
    `identity.sendAsProfile()` (qui passe par un webhook pour afficher le nom et
    l'avatar personnalisés du bot) **ET** qui transporte une pièce jointe ne peut
    PAS passer en V2. C'est le cas de la carte de montée de niveau (`xp.js`,
    `attachment://levelup.png`) → **exclusion documentée dans le fichier**.
    Le webhook étant `application-owned` (créé par `channel.createWebhook`), les
    messages V2 **sans** pièce jointe y fonctionnent. Ne PAS migrer aveuglément
    un message qui passe par `sendAsProfile` : vérifier d'abord s'il a des
    `files`.
11. **Components V2 n'a ni `content`, ni `embeds`, ni champs `inline`, ni
    `author`, ni `thumbnail`, ni `timestamp`.** Tout doit être reconstruit en
    TextDisplay / Section / MediaGallery, et les plafonds changent : **40
    composants (imbriqués compris)** et **4 000 caractères CUMULÉS** sur tous les
    TextDisplay (contre 4 096 par description). `ui.v2panel()` gère tout ça —
    **ne pas construire de conteneur V2 à la main**. Un message V2 ne peut plus
    redevenir classique à l'édition → les `interaction.update()` doivent suivre.
    Un payload V2 n'a pas de champ `embeds` : **tout code qui relit
    `msg.embeds[0]` casse** (4 emplacements identifiés : `extra.js:1128`,
    `panels.js:426`, `panels.js:1396`, `queue.js`) — vérifier avant de migrer.

## 🔑 MES ACCÈS (à remplacer avant d'envoyer)

- ⚠️ **Aucun secret dans ce dépôt (public !)**. L'utilisateur (nexusdolf-rgb) fournira
  dans le chat : token GitHub fine-grained, clé API Render (`rnd_…`), et si besoin le
  token du bot. Récupération autonome : `GET https://api.render.com/v1/services/
  srv-da5i2h2jobas73epvos0/env-vars` avec la clé Render (contient HOXERA_TOKEN, etc.)
- Variables Render : `HOXERA_TOKEN`, `HOXERA_CLIENT_ID`/`DISCORD_CLIENT_ID` =
  1537443352281088000, `DISCORD_CLIENT_SECRET`, `BOTDEV_GH_TOKEN` (sauvegardes),
  `BOTDEV_DATA_REPO` = nexusdolf-rgb/botdev-data, `NEXORA_ADMIN_*` (accès fondateur)
- Serveur support : https://discord.gg/X9hTdr9N3 · Serveur de test :
  guild `1539668540787925052`
- Dashboard : session via cookie `botdev_session=<<< … >>>` (l'utilisateur la fournit
  ou on se connecte via OAuth) — permet `PATCH /api/bots/1`, `POST /api/backup/now`

## 🚀 PREMIÈRE MISSION DU NOUVEL AGENT

1. Clone `https://github.com/nexusdolf-rgb/botdev`, `npm install`, lis le dernier commit
2. Vérifie l'état : `https://hoxera.is-a.dev/api/health/bot` (bot en ligne ? erreurs ?)
3. `bash scripts/check.sh` → doit être 🟢 (126 tests, ~2,5 min)
4. Vérifie les tokens (GitHub 200, Render 200, Discord `users/@me` avec curl)
5. Fais-moi un point de situation clair, puis attends mes instructions

## 📌 ÉTAT AU 05/09/2026 (dernière mise à jour de ce document)

- Dernière version : **v236** — voir la section v236 ci-dessus. **163 tests verts**.
  ⚠️ **Chantier en cours (v231 →)** : migration des traits texte `━` vers les
  séparateurs **NATIFS pleine largeur** (Components V2).
  • **Migré** : `/quiz` (v231) · `premade.js` 13 messages dont `replyPanel` ×11
    et `/levels` · `suggest.js` 5 emplacements (v232) · `giveaway.js`
    5 emplacements · `guildEvents.js` 7 emplacements (v233) · **`panels.js`
    11 emplacements, TOUT le fichier** (v234) · **`extra.js` 32 emplacements,
    TOUT le design system du fichier** (v235) · **16 emplacements sur 12
    fichiers, LOT FINAL** (v236). **Total : 90 emplacements.**
  • **Exclu, documenté** : `xp.js` (webhook + pièce jointe → 400 en V2, piège n°10).
  • **Reporté, documenté** : le **wizard « assistant types »** de `panels.js`
    (6 étapes éditées en place — il faut migrer les 6 d'un coup) et le
    **récapitulatif de ticket** (aucune description donc **aucun trait** ;
    `updateRecapRating` relit `msg.embeds[0].fields`).
  • **Reporté, documenté (v235)** : dans `extra.js` — `/poll` (champs d'embed
    depuis v230, aucun trait), `/top` (`renderTop`, `\n` simples, aucun trait,
    pagination éditée), `/snipe` et `/invites` (EmbedBuilder bruts), le
    **message de candidature** + `applyd` (aucune description donc aucun trait).
  • **v236 — LOT FINAL FAIT** : `logging`, `liveWatch`, `community`, `engine`,
    `roleWizard`, `panelCommands` ×2, `profileCommands` ×2, `profileWizard`,
    `automod` ×2, `announcements`, `tasks`, `events` ×2 → **16 emplacements**.
    **Total cumulé : 90 emplacements.** **0 `ui.panel(` / 0 `ui.embed(` dans tout
    `server/`.**
  • **Reste (reporté, non bloquant)** : le **wizard « assistant types »** de
    `panels.js` (6 étapes éditées en place → à migrer d'un coup) et les **3
    `ui.sectionize(` volontaires** (`events.js` branche carte image, `panels.js`
    wizard, `xp.js` carte de niveau — tous liés à une pièce jointe envoyée par
    webhook, ou à un assistant multi-étapes).
  • ⚠️ **Avant de migrer un message, vérifier** : (1) s'il passe par
    `sendAsProfile` **avec** des `files` → exclu (sans `files`, c'est bon :
    webhook application-owned) ; (2) si du code relit `msg.embeds[0]` plus tard →
    **plus aucun cas bloquant** (`panels.js:426` corrigé par `panelTitleOf`,
    `extra.js:1128` = `applyd` dont le message n'a aucun trait et reste
    classique, `panels.js:1396` = le récap reporté) ; (3) s'il est **édité**
    ensuite → l'édition doit migrer en même temps **et** vider
    `content`/`embeds`/`attachments` ; (4) si c'est une **étape de wizard** →
    migrer TOUTES les étapes d'un coup ; (5) chercher dans `test/` **et**
    `scripts/` les motifs `embeds[0]`, `.setFooter(`, `.setImage(`, `ui.panel(`,
    `ui.embed(` ; **puis `grep -n "\.embeds"` sur le fichier migré** (une
    réinjection `embeds: monPanel.embeds` vaut `undefined` en V2 → message vide).
    Utiliser **`test/helpers/v2.js`** pour relire un payload V2.
- Prod : https://hoxera.is-a.dev, bot « Optimus Prime » en ligne,
  **8 serveurs / 189 membres**, **0 erreur 24 h**, sauvegardes GitHub OK
  toutes les 10 min, CI verte, service Render « hoxera » non suspendu (Oregon).
- 🔑 **Rotation des secrets faite par l’utilisateur le 05/09 ~12h00** : token du
  bot Discord, `DISCORD_CLIENT_SECRET` et `BOTDEV_GH_TOKEN` ont été changés puis
  reportés dans les variables Render par l’utilisateur lui-même → Render a
  redémarré à **12h01** et le bot s’est reconnecté avec le nouveau token
  (`/api/health/bot` : `ready: true`). L’ancien token GitHub fine-grained est
  révoqué (401). **Vérifier ces 3 variables avant tout diagnostic de connexion.**
- Passation : l’agent v228 a été arrêté par une **limite de contexte**. Le nouvel
  agent a : cloné les 2 dépôts, `npm install`, `check.sh` 🟢 (155), vérifié la prod
  et les tokens, puis livré **v229** (traits ━ sur 10 messages + critère officiel)
  **v230** (`/poll` en champs d'embed + correctif d'un bug latent de
  dépassement de la limite Discord de 4 096 caractères), puis **v231**,
  **v232**, **v233**, **v234** et **v235** : migration des traits texte vers les
  séparateurs **NATIFS pleine largeur** (Components V2) — API `ui.v2panel` +
  **74 messages migrés**, `queue.js` corrigé, `xp.js` exclu et documenté,
  `test/helpers/v2.js` créé.
- 31 commandes slash globales (5 « premade » à sous-commandes + 25 « extra » +
  `/event`) + ~36 commandes de modules (kick, ban, ping, meme, daily, rank,
  giveaway…) — total loin de la limite Discord de 100.
- Dashboard : 22 modules serveur + 5 modules bot (`Dashboard.MODULES` /
  `Dashboard.BOT_MODULES` dans `public/js/dashboard.js`), 142 routes API.
- ⚠️ Token GitHub fine-grained fourni le 05/09 : expire le **04/12/2026**.
- ⏳ Toujours en attente utilisateur : renommer le rôle « Nexora » à la main sur
  les serveurs concernés (piège n°4).

### ⚠️ Avant de lancer une copie locale du projet (vérifié le 05/09)

Piège n°7 : **jamais 2 services actifs avec le même token**. Trois garde-fous :
1. **Le token du bot est stocké DANS la base** (`bots.token`), pas seulement en
   variable d’environnement. Une copie locale démarrée sur une base restaurée de
   prod se connecterait à Discord avec le token réel → **Discord déconnecte le bot
   de production**. Neutraliser d’abord : `UPDATE bots SET token=''`.
2. Sans `BOTDEV_GH_TOKEN` / `BOTDEV_DATA_REPO`, `backup.enabled()` est faux → la
   copie locale **ne peut ni restaurer ni écraser** les sauvegardes de prod.
   Ne jamais renseigner ces deux variables en local.
3. `app.listen(PORT, '0.0.0.0')` → choisir un `PORT` libre.
- Le dashboard **exige une connexion Discord live** pour charger un serveur
  (`GET /api/bots/:id/guilds/:guildId` → « Le bot n’est pas sur ce serveur »), mais
  la **liste** des serveurs vient du cache base (`users.discord_guilds`) donc
  `/api/discord/guilds` répond sans connexion. Pour un aperçu local complet,
  suivre le patron des tests : `botManager.clients.set(1, { client: {…}, startedAt })`
  (voir `test/v128-test.js`, `test/v218-test.js`).
- Connexion OAuth **impossible depuis un aperçu sandbox** : l’URI de redirection
  Discord pointe vers la prod. Injecter plutôt une session (`INSERT INTO sessions`
  + cookie `botdev_session`).
- `scripts/gen-apercu-galerie.js` génère une galerie HTML de tous les panneaux
  (rendu réel depuis les builders) → **l’outil de référence pour tout travail
  visuel sur les messages Discord** (utilisé pour l’audit v229).

### État précédent (v228, 05/09) — conservé pour mémoire

- Dernière version : **v228** — **155 tests verts**.

### État précédent (01/09/2026) — conservé pour mémoire


- Dernière version : **v194** — Dashboard Ultra Pro (Phase 2) : couche UX
  additive (design tokens --dp-*, focus visible partout, hover lift des
  cartes, survol de lignes des tableaux, états vides affinés, scrollbar fine,
  reduced-motion global, mode clair v194), page Modules enrichie (badge
  Activé/Désactivé + compteur de commandes), notifications annoncées
  (aria-live), scroll doux respectant reduced-motion. 126 tests verts.
  Voir la section v194 ci-dessus.
- v193 livré : Phase 1 « Sécurité, nettoyage et corrections urgentes »
  (rebranding, /say protégé, /meme robuste, routes email mortes supprimées,
  env vars nettoyées, token masqué côté API, transcriptions 128 bits).
  125 tests verts. Voir la section v193 ci-dessus.
- v188 livré : LOT 1 « Quick wins communauté » :
  - **/afk** : statut AFK persistant (table `afk`, upsert par membre), sortie auto
    dès que le membre écrit, prévention des autres à la mention (sans boucle)
  - **/top** : classement XP ou coins paginé (10/page, boutons ◀ ▶ `hxtop:`),
    compteurs `store.xp.count` / `store.economy.count` ajoutés
  - **Historique sanctions** dans le dashboard : panneau « Avertissements récents »
    dans le module Membres (route `/warnings` existante, warn/timeout/kick/ban)
  - **Rappels récurrents** : option `repeat` (once/hourly/daily/weekly) sur /remind,
    colonne `reminders.repeat_mode` (migration ALTER), rearm automatique dans
    `sweepReminders` via `nextRepeatTs()`
- Bot « Optimus Prime » en ligne, 7 serveurs, 0 erreur 24h, 120 tests verts
- Identité Discord à jour : avatar (logo argent), bannière (v185 = v177 robot cinéma),
  username, bio 4 lignes, icône d'application
- ⏳ En attente utilisateur : renommer le rôle « Nexora » à la main sur 6 serveurs
  (Discord ne le permet pas automatiquement — voir piège n°4)
- Roadmap : LOT 1 ✅ (v188), LOT 2 ✅ (v189), LOT 4 ✅ (v190, puis v191 :
  retrait des pages publiques serveur/statut à la demande — il reste 6 langues,
  quiz, série de connexion, export CSV). LOT 3 (backlog) = modmail, /profile,
  recherche transcriptions. Musique écartée.
