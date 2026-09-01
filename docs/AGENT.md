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
- Commits en français, préfixés par un numéro de version (dernier : **v194**) avec description détaillée

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
- `test/` : **112 tests**. `bash scripts/check.sh` = syntaxe + secrets + suite (OBLIGATOIRE)
- `docs/AGENT.md` : ce document — **le mettre à jour à chaque grande étape**

## 🔁 RECETTE DE LIVRAISON (à connaître par cœur)

1. Modifier le code → `bash scripts/check.sh` → tout vert
2. **Bump de version** : `public/index.html` `?v=NNN` **×7** + `public/sw.js` `botdev-vNNN`
   + les 6 « pinneurs » (`test/v120/121/123/128/142/147-test.js`) + nouveau
   `test/vNNN-test.js` (reprend les pins de version, on les retire du test précédent)
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
   requis avant `check.sh` ; `git config user.name/email` + remote à restaurer
   (token GitHub dans `/home/user/agent-config.sh` s'il persiste, sinon l'utilisateur
   fournit) ; `/tmp` vidé ; tesseract via `apt-get install tesseract-ocr` ;
   le token du bot se récupère via l'API Render (env vars du service)
6. **Token GitHub fine-grained expire ~7 jours** : si push refusé, demander un nouveau
   à l'utilisateur (droits : Contents RW + Workflows RW sur botdev ET botdev-data)
7. **Commandes slash** : GLOBALES uniquement. **Jamais 2 services actifs** avec le même
   token. IP Render free peut être bloquée par Discord → migrer de région via l'API
8. Détection de secrets dans check.sh : **jamais de token en dur** (le dépôt est public)
9. Ancien token PAT dans les vieux scripts : INVALIDE — toujours tester `api.github.com/user`

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

## 📌 ÉTAT AU 01/09/2026 (dernière mise à jour de ce document)

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
