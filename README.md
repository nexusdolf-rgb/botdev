# 🤖 Hoxera

**Hoxera** est un bot Discord complet + dashboard web **100 % gratuit** (Render + GitHub), inspiré de DraftBot et Ticket Tool — sans écrire une ligne de code.

## 🆕 Hoxera 2.0 (v33) — la grosse mise à jour

### 🎮 Fun & communauté (côté Discord)
- 💍 **Mariages** : `/marry @membre` (demande avec boutons Accepter/Refuser), `/divorce`, `/couple`
- 🤗 **Actions entre membres** : `/hug` `/kiss` `/slap` `/pat` `/punch` (messages aléatoires)
- 🕹️ **Jeux** : `/rps` (pierre-feuille-ciseaux), `/pendu` (8 vies, boutons A-Z), `/morpion @membre` (grille 3×3 à boutons)
- 🎂 **Anniversaires** : `/birthday set jour mois` — le bot souhaite le jour J dans le salon configuré + rôle anniversaire (24 h)
- ⏰ **Rappels** : `/remind 2h texte` → message privé à l'heure dite (max 30 jours, 10 en attente)
- 🗳️ **Sondages** : `/poll question choix1 | choix2 | …` (jusqu'à 10 choix, votes par boutons, résultats en direct)
- 🕵️ **Snipe** : `/snipe` — le dernier message supprimé du salon
- 💰 **Économie enrichie** : `/work` (métiers, 1×/heure), `/gamble montant` (double ou rien), `/rob @membre` (40 % de réussite, sinon amende)

### 🛡️ Modération & organisation
- 🚨 **Anti-raid** : `/lockdown on|off` — verrouille/rouvre tous les salons en 1 clic (et restaure les permissions d'origine)
- 🔊 **Salons vocaux temporaires** : un salon « ➕ Créer un vocal » → vocal au nom du membre, supprimé quand vide (max 10)
- 📝 **Candidatures** : `/apply set #salon` + `/apply question …` (max 5) + `/apply panel` → formulaire en fenêtre privée, réponses dans un salon avec boutons ✅/❌ pour le staff (notification en MP au candidat)
- 🔘 **Rôles par boutons** : en plus des menus déroulants, un clic = un rôle (re-clic = retiré)
- 📜 **Journaux au choix** : filtres par type dans le dashboard (tickets / modération / auto-mod / arrivées-départs / boutique)

### 📊 Dashboard enrichi
- 👥 **Module Membres** : liste complète (avatar, rôles, niveau, coins) + recherche + **donner des coins, ajouter/retirer un rôle, kick** directement
- 📈 **Module Statistiques** : graphiques 7 jours (messages/jour, nouveaux membres) + top actifs
- 📅 **Module Annonces** : messages automatiques aux jours/heures choisis (jusqu'à 20)
- 💡 Suggestions : approuver/refuser/supprimer depuis le dashboard
- 🎫 Tickets : compteur de tickets ouverts + total
- 🛒 Boutique : historique des 15 derniers achats
- 💾 Sauvegarde : bouton « Sauvegarder maintenant » + date de la dernière sauvegarde
- 🎂 Réglages serveur : salon/rôle des anniversaires + salons vocaux temporaires

## ✨ Fonctionnalités

## ✨ Fonctionnalités

- **Comptes utilisateurs** : inscription / connexion sécurisée (bcrypt + sessions)
- **Gestion de bots** : crée autant de bots que tu veux, démarre / arrête-les en 1 clic, lien d'invitation Discord automatique
- **Éditeur de commandes visuel** : système de blocs glisser-déposer
  - 💬 Messages : envoyer un message, un embed, des boutons, réponse aléatoire, MP, suppression
  - 🛡️ Modération : ajouter/retirer un rôle, kick, ban, timeout
  - 💰 Économie : donner des coins
  - 🔀 Logique : conditions SI / SINON (blocs imbriqués)
  - Déclencheurs : commande préfixe, commande slash (avec options), mot-clé
  - Variables : `{user}`, `{args}`, `{server}`, `{coins}`, `{random.user}`…
  - Cooldowns par commande, boutons reliés à d'autres commandes
- **Modules pré-faits en 1 clic** : Modération (kick, ban, warn, timeout, clear…), Utilitaires (ping, avatar, serverinfo…), Fun (8ball, meme, coinflip…), Économie (daily, balance, leaderboard) — **activés automatiquement à la création du bot**
- **Panneaux interactifs** (configuration par serveur, depuis le dashboard OU depuis Discord) :
  - 🎫 **Système de tickets façon Ticket Tool** : **`/ticket setup` = assistant interactif pas à pas avec boutons** (nom du panel → catégorie → salon → rôle staff → « Suivant ➡️ » → « ✅ Terminer »). Bouton → salon privé automatique par membre (rôle staff, catégorie, bouton fermeture). Configuration rapide : `/ticket channel`, `/ticket role`, `/ticket category`, `/ticket button`, `/ticket message`, `/ticket panel`, `/ticket config`, `/ticket close`, `/ticket add`, `/ticket remove` — 🔒 réservé au **propriétaire du serveur**
  - 📋 **Menus de rôles** : menus déroulants où les membres choisissent leurs rôles (`/roles list`, `/roles send`)
- **📚 Centre d'aide complet** : `/help` affiche toutes les catégories (tickets, rôles, modération, utilitaires, fun, économie, commandes personnalisées) et `/help commande` donne le détail + exemples (ex : `/help ticket`)
- **🌍 Utilisable par tous, sans compte** : n'importe quel serveur qui ajoute le bot reçoit automatiquement toutes les commandes — aucun compte BotDev nécessaire pour les membres. La modération est réservée aux administrateurs.
- **🔗 Connexion avec Discord (OAuth2)** : « Se connecter avec Discord » lie le compte Discord au dashboard. BotDev vérifie automatiquement les serveurs de l'utilisateur et ses permissions.
- **⚙️ Dashboard par serveur façon DraftBot** : le propriétaire ou un admin d'un serveur Discord peut configurer Hoxera sur SON serveur directement depuis le dashboard — sans rien taper sur Discord : préfixe du serveur, système de tickets complet, message de bienvenue/départ (embed, couleur, image), auto-rôle, menus de rôles, et auto-modération (action automatique après X avertissements).
- **📈 Niveaux (XP)** : les membres gagnent de l'XP en discutant, montent en niveau avec annonce automatique, **rôles de récompense par niveau**, `/rank` (niveau, XP, progression, rang) et `/levels` (classement) — configurable par serveur dans le dashboard (XP par message, cooldown, message personnalisé, salon d'annonce)
- **🛡️ Auto-modération par serveur** : suppression automatique des liens (invitations/URL), des messages en majuscules, limite de mentions, anti-spam avec timeout 5 min (les admins/modérateurs sont ignorés)
- **🎫 Système de tickets complet (façon Ticket Tool)** :
  - **📝 Raison demandée à l'ouverture** : chaque ouverture de ticket (bouton ou menu de types) demande la raison de la demande dans une fenêtre — affichée dans le ticket et dans la transcription
  - **🗑 Suppression avec raison** : le staff qui clique « Supprimer » saisit la raison de la suppression — consignée dans la transcription
  - **⚠️ Vérification des MP à l'ouverture** : si les messages privés du membre sont fermés, il est prévenu dès l'ouverture qu'il ne recevra pas la transcription (et comment activer les MP)
- **🎫 Système de tickets complet (façon Ticket Tool)** :
  - **Assistant interactif des types** (`/ticket types setup`) : comme l'assistant de configuration, mais pour le menu déroulant — choisis un type, **renomme-le**, choisis son **emoji**, sa **catégorie** et son **rôle staff** avec des menus de sélection (rien à écrire), ou supprime-le avec confirmation
  - **Boutons du ticket réservés au staff** : 🔒 **Fermer** · ⏸ **En attente** · 🔓 **Réouvrir** · 🗑 **Supprimer** (avec confirmation)
  - **📄 Transcription en MP fiable** : double résolution de l'utilisateur + statut honnête — si le MP échoue (messages privés fermés côté membre), le staff en est averti
- **🎫 Système de tickets complet (façon Ticket Tool)** :
  - **📝 Raison demandée à l'ouverture** : chaque ouverture de ticket (bouton ou menu de types) demande la raison de la demande dans une fenêtre — affichée dans le ticket et dans la transcription
  - **🗑 Suppression avec raison** : le staff qui clique « Supprimer » saisit la raison de la suppression — consignée dans la transcription
  - **⚠️ Vérification des MP à l'ouverture** : si les messages privés du membre sont fermés, il est prévenu dès l'ouverture qu'il ne recevra pas la transcription (et comment activer les MP)
- **🎫 Système de tickets complet (façon Ticket Tool)** :
  - **Types de tickets 100 % personnalisables** : ajoute, renomme, supprime autant de types que tu veux (`/ticket types add|remove|list` ou dashboard) — « Ticket contre admin », « Candidature staff », « Signaler un bug »… Le panneau affiche un **menu déroulant** où chaque membre choisit son type
  - **PLUSIEURS rôles staff PAR type de ticket** : ajoute autant de rôles que tu veux (sélecteur de rôle répétable dans `/ticket types setup` → « ➕ Ajouter un rôle staff », ou dashboard) — tous peuvent gérer les tickets du type, et le retrait se fait par menu
  - **Boutons réservés au staff** dans chaque ticket : 🔒 **Fermer** (verrouille) · ⏸ **En attente** (lecture seule) · 🔓 **Réouvrir** · 🗑 **Supprimer** (transcription en MP)
  - **Salon de ticket soigné** : message de bienvenue avec l'avatar du créateur, le type, TOUS les rôles staff, la raison de la demande et le mode d'emploi en étapes
  - **📄 Transcription automatique — à la SUPPRESSION** : 🔒 Fermer = verrouiller (réouvrable, sans transcription) ; 🗑 Supprimer (`/ticket delete` ou bouton) = le créateur reçoit en **MP un message professionnel** + le **lien de sa transcription** (page web) + le **fichier .txt** joint
- **🗂️ Types de tickets** : le panneau affiche un **menu déroulant** où le membre choisit son type (Partenariat, Réclamation, Recrutement…) ; chaque type peut avoir sa catégorie dédiée. Configurable depuis le dashboard (onglet Serveurs) et via `/ticket type`. 🔒 Seuls le **staff** (rôle support) et les administrateurs peuvent fermer/gérer les tickets.
- **🔗 OAuth2 intelligent** : lier Discord fusionne avec le compte déjà connecté (pas de doublon), les boutons inutiles disparaissent une fois lié, et les boutons « Ajouter à ton serveur » ouvrent le **sélecteur de serveur Discord** (flux OAuth natif).
- **🛡️ Fiabilité de l'import de photos** : le téléchargement des photos est « différé » (plus de « l'application ne répond plus » sur Discord), les photos du dashboard sont **redimensionnées automatiquement** (avatar 512 px / bannière 1024 px) avant l'envoi — plus aucun rejet serveur, et la limite JSON est passée à 15 Mo. L'assistant ne bloque plus jamais : si l'édition du message échoue, il en renvoie un nouveau. L'identité s'applique aussi aux **panneaux de tickets** (bienvenue + panneau).
- **🤖 Identité du bot par serveur — assistant interactif** : `/botprofile setup` guide pas à pas avec boutons (comme `/ticket setup`) : 📛 **Nom** (modale) → 📝 **Bio** → 🎨 **sélecteur de couleurs** (11 couleurs + hex personnalisé) → 🖼️ **Avatar** — bouton visible « 📷 Importer la photo » + 📱 **galerie native** : tape `/botprofile avatar` (l'option « image » ouvre la galerie automatiquement) ou bouton ➕ — la photo s'applique directement à l'étape de l'assistant → 🎴 **Bannière** (pareil). Le dashboard a aussi de vrais boutons « 📱 Choisir dans la galerie » → ✅ **Enregistrer** (boutons Suivant/Retour/Annuler, récapitulatif en direct). L'identité s'applique sur CE serveur uniquement — le bot s'exprime avec elle (webhooks) dans ses messages : bienvenue, niveaux, tickets… Les images sont stockées dans le dépôt de données et servies via /assets.
- **🤖 Identité du bot par serveur** : `/botprofile` (propriétaire du serveur) — nom, **avatar et bannière depuis la galerie**, bio et couleur propres à CHAQUE serveur. Le bot s'exprime avec cette identité (webhooks) dans ses messages : bienvenue, niveaux, tickets… Les images sont stockées dans le dépôt de données (elles survivent aux mises à jour) et servies via /assets.
- **📋 Journaux de modération** (`/modlogs`) : un salon trace tout — kicks, bans, timeouts, avertissements, purges, tickets ouverts/fermés/supprimés, auto-modération, arrivées/départs.
- **🔇 Liste noire de mots** (`/blacklist`) : les messages contenant un mot interdit sont supprimés automatiquement et journalisés.
- **👑 Panneau admin plateforme** : page /admin (réservée au fondateur — premier compte, ou emails définis via ADMIN_EMAILS) : statistiques globales, liste des utilisateurs (avec suppression), liste des bots et leur statut.
- **🌐 Dashboard public de Hoxera** : chaque bot a sa **page publique** (`/bot/id`) avec ses statistiques **synchronisées en direct** (serveurs, membres, latence, uptime), la liste de ses commandes groupées par catégorie et son lien d'invitation — accessible à tous, sans compte. La page d'accueil affiche les stats de la plateforme en temps réel et l'annuaire des bots publics.
- **📱 Mode application (PWA)** : icône, installation sur l'écran d'accueil, navigation par barre d'onglets sur mobile, chargement hors ligne
- **Événements** : message de bienvenue (embed, couleur, image), message de départ, auto-rôle
- **Économie** : solde en coins par serveur, classement consultable dans le dashboard

## 🚀 Installation

```bash
npm install
npm start          # démarre sur http://localhost:3000
```

## ⚡ Hoxera — site public + dashboard (connexion 100 % Discord)

La plateforme est devenue un **site dédié à Hoxera** :

- **Site public** (aucun compte requis) : accueil avec stats en direct, fonctionnalités, bouton d'invitation
- **Connexion 100 % Discord** : les formulaires email/mot de passe sont supprimés — un seul bouton « 🎮 Se connecter avec Discord ». Une fois lié, les boutons disparaissent et le dashboard s'ouvre directement
- **Dashboard pré-câblé à Hoxera** : sidebar avec la liste des serveurs Discord de l'utilisateur + tous les modules (tickets, niveaux, boutique, giveaways, modération, journaux…) — seuls les propriétaires/administrateurs des serveurs où Hoxera est présent peuvent configurer
- **Provisionnement automatique** : Hoxera est créé et connecté automatiquement au démarrage via les variables d'environnement (`HOXERA_TOKEN` recommandé — `NOXERA_TOKEN`/`NEXORA_TOKEN` restent acceptés par compatibilité, et `HOXERA_CLIENT_ID`) — plus aucune « création de bot »

## 🎨 Dashboard v2 (façon DraftBot) — reconstruction propre

Le dashboard a été **entièrement reconstruit** (anciennes interfaces et fichiers morts supprimés) :

- **Shell professionnel** : barre latérale avec **la liste de tes serveurs Discord** (icônes + statut) en haut, puis les modules du serveur sélectionné, puis les réglages du bot
- **Sélecteur de serveur** + modules synchronisés en temps réel avec le bot (même base par serveur)
- **Flux d'authentification fluide** : connexion avec Discord → les boutons « Se connecter / Créer un compte » **disparaissent automatiquement** → le dashboard s'ouvre directement sur tes serveurs. Si le compte n'est pas encore lié, un bouton « 🎮 Lier mon Discord » est proposé partout.

## 🎨 Dashboard v2 (façon DraftBot) + couche animation

Le dashboard a été **entièrement reconstruit** : shell professionnel avec **barre latérale**, **sélecteur de serveur**, et un module par fonctionnalité — tout est configuré par serveur et **synchronisé en temps réel** avec le bot (même base).

| Module | Fonctionnalités |
|---|---|
| 🎫 Tickets | Types personnalisés, plusieurs rôles staff par type, transcriptions en MP à la suppression, **couleur du bouton**, **questionnaire d'ouverture optionnel**, badge d'état du panneau en direct |
| 👋 Bienvenue | Message d'accueil/départ (embed, couleur, image) + auto-rôles — **sélecteurs de salon/rôle** et palette de couleurs dans le dashboard |
| 📈 Niveaux | XP par message, annonces, récompenses de rôles |
| 💰 Économie | Classement des coins |
| 🛒 **Boutique** | Articles (rôle + prix en coins) — `/shop`, `/buy`, `/pay` |
| 🛡️ Modération | Auto-mod, liste noire, **sanctions prédéfinies** (`/sanction`) |
| 📋 Rôles | Menus déroulants de rôles |
| 💡 **Suggestions** | `/suggest` + votes 👍👎 + statut staff — synchronisé dashboard ↔ Discord |
| 🎁 **Giveaways** | `/giveaway create durée prix gagnants` — réaction 🎉, tirage automatique |
| ⏳ **Rôles temporaires** | `/temprole @membre @rôle 2h` — retiré automatiquement |
| 📜 Journaux | Salon de logs complet |

## 🔗 Connexion avec Discord (OAuth2) — configuration

Pour activer « Se connecter avec Discord » et le dashboard par serveur :

1. Sur le **portail développeur Discord** (application de ton bot) : onglet **OAuth2** → **Reset Secret** (copie le *Client Secret*), et dans **Redirects**, ajoute :
   `https://hoxera.is-a.dev/api/auth/discord/callback`
   (remplace par ton URL si différente)
2. Sur Render → ton service → **Environment** :
   | Variable | Valeur |
   |---|---|
   | `DISCORD_CLIENT_ID` | `1537443352281088000` |
   | `DISCORD_CLIENT_SECRET` | le secret copié à l'étape 1 |
   | `DISCORD_REDIRECT_URI` | (optionnel) auto-détecté sinon |

C'est tout : le bouton « 🎮 Se connecter avec Discord » apparaît, et l'onglet « 🌍 Serveurs » de chaque bot permet de configurer ses serveurs.

## 💾 Sauvegarde automatique (survit aux mises à jour)

Sur Render (plan gratuit), le disque est effacé à chaque redéploiement. BotDev sauvegarde donc automatiquement sa base sur un dépôt GitHub **privé** et la restaure au démarrage → les mises à jour sont 100 % automatiques, personne n'a besoin de se reconnecter.

Variables d'environnement à définir sur Render :

| Variable | Valeur |
|---|---|
| `BOTDEV_GH_TOKEN` | Token GitHub fine-grained, permission **Contents : Read and write**, limité à un dépôt **privé** (ex : `botdev-data`) |
| `BOTDEV_DATA_REPO` | `pseudo/botdev-data` |
| `BOTDEV_DATA_BRANCH` | (optionnel) branche du dépôt |

Fréquence : sauvegarde toutes les 10 min + sauvegarde finale à l'arrêt. Restauration automatique à chaque démarrage.

## 🌍 Mettre BotDev en ligne gratuitement

BotDev est une application web : elle s'ouvre dans n'importe quel navigateur (Chrome, Firefox, Safari, mobile…). Pour la rendre accessible 24h/24 gratuitement — **y compris depuis un téléphone Android sans PC** (Termux) — suis le guide pas-à-pas :

👉 **[GUIDE-HEBERGEMENT.md](GUIDE-HEBERGEMENT.md)**

## 🧩 Créer ton premier bot

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
2. Onglet **Bot** → **Reset Token** → copie le token
3. Copie aussi l'**Application ID** (onglet General Information)
4. Toujours dans l'onglet Bot, active **SERVER MEMBERS INTENT** et **MESSAGE CONTENT INTENT**
5. Dans BotDev : *Nouveau bot* → colle le token + l'Application ID → **Créer**
6. Clique sur **Inviter** pour ajouter le bot à ton serveur Discord

## 🗂️ Structure

```
botdev/
├── server/
│   ├── index.js              # Serveur Express + démarrage des bots
│   ├── db.js                 # SQLite (utilisateurs, bots, commandes, économie…)
│   ├── routes.js             # API REST du dashboard
│   └── discord/
│       ├── botManager.js     # Connexion des bots à la passerelle Discord
│       ├── engine.js         # Moteur de blocs (variables, conditions, actions)
│       ├── premade.js        # Commandes pré-faites des modules
│       └── events.js         # Événements (bienvenue, départ, auto-rôle)
└── public/                   # Dashboard (HTML / CSS / JS)
```

## 🔜 Idées pour la suite

- OAuth2 Discord (connexion des utilisateurs avec leur compte Discord, comme BotGhost)
- Connexion des bots via OAuth2 (plus besoin de coller le token)
- Système de niveaux / XP, tickets, musique
- Monétisation (plans payants), bannière par serveur
