# 🤖 BotDev

**BotDev** est une plateforme web pour créer et héberger des bots Discord **sans écrire une ligne de code** — inspirée de BotGhost, mais 100 % à toi.

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
- **Modules pré-faits en 1 clic** : Modération (kick, ban, warn, timeout, clear…), Utilitaires (ping, avatar, serverinfo…), Fun (8ball, meme, coinflip…), Économie (daily, balance, leaderboard)
- **Événements** : message de bienvenue, message de départ, auto-rôle
- **Économie** : solde en coins par serveur, classement consultable dans le dashboard

## 🚀 Installation

```bash
npm install
npm start          # démarre sur http://localhost:3000
```

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
