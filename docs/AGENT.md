# 🤖 GUIDE DE L'AGENT — Projet Hoxera (bot Discord + dashboard)

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
- **Chaque nouvelle fonctionnalité = son test automatique** (dossier `test/`, nommage `vNN-test.js`)
- Trouve des solutions vite, protège le bot et ses données, explique-moi simplement (je suis débutant)
- Commits en français, préfixés par un numéro de version (dernier : v2.3) avec description détaillée

## 📦 LE PROJET

**Hoxera** : bot Discord tout-en-un (~25 000 lignes) + dashboard web, 100 % gratuit.
- **Bot Discord « Optimus Prime »** — client_id : `1537443352281088000` — en ligne sur 7+ serveurs
- 61+ commandes slash GLOBALES : tickets pro (types, transcriptions, notes ⭐, journal staff),
  modération + auto-mod + anti-raid + sanctions progressives (paliers timeout/kick/ban),
  XP/niveaux, économie, giveaways, jeux (morpion, pendu, rps), mariages, anniversaires,
  sondages, rappels, rôles par boutons/menus, salons vocaux temporaires, candidatures,
  starboard ⭐, traqueur d'invitations 📨, annonces de live 🔴 (TikTok/Twitch/YouTube/Kick),
  cartes de bienvenue en image 🖼️, auto-rôles multiples, i18n FR/EN
- **Dashboard** : https://hoxera.is-a.dev — connexion OAuth2 Discord, design pro
  façon DraftBot (sidebar avec carte serveur, fil d'ariane, PWA installable)

## 🗂️ INFRASTRUCTURE

| Élément | Détail |
|---|---|
| Code | `github.com/nexusdolf-rgb/botdev` (branche `main`) |
| Sauvegardes données | `github.com/nexusdolf-rgb/botdev-data` (botdev.db poussé toutes les 10 min + à l'extinction, restauré au démarrage) |
| Hébergement | Render **web service « hoxera »** `srv-da5i2h2jobas73epvos0`, région **Oregon**, plan free |
| ⚠️ Ancien service | « Dash-hoxora » (Frankfurt) **SUSPENDU** — ne pas réactiver (IP bloquée par Discord le 23/08) : deux bots simultanés = conflit |
| Déploiement | `git push` sur main → Render redéploie automatiquement (~1 min) |
| CI | GitHub Actions sur botdev (tests à chaque push) |
| Garde-éveil externe | workflow `keepalive.yml` dans botdev-data (ping /ping toutes les 10 min) |
| Santé | `https://hoxera.is-a.dev/api/health/bot` (JSON : bot en ligne, serveurs, erreurs, sauvegardes) |

## 🏗️ ARCHITECTURE DU CODE

- Node.js + Express + discord.js v14 + better-sqlite3 + sharp — `npm start` → `server/index.js`
- `server/db.js` : TOUTE la base (tables + accesseurs `store.*`, migrations par `ALTER TABLE ... catch`)
- `server/discord/` : `botManager.js` (connexion, intents, commandes globales, garde d'interaction),
  `panels.js` (tickets), `premade.js` (commandes), `extra.js` (jeux/social/invites),
  `events.js` (bienvenue/auto-rôle), `community.js` (starboard/invitations/carte bienvenue/sanctions),
  `liveWatch.js` (annonces de live), `automod.js`, `antiraid.js`, `xp.js`, `logging.js`, `i18n.js`
- `server/backup.js` : sauvegarde/restauration GitHub (garde-fou anti-écrasement si base vide)
- `public/` : SPA vanilla JS — `js/dashboard.js` (modules), `js/views.js`, `css/dashboard.css`
- `test/` : ~43 tests. **`bash scripts/check.sh` = syntaxe + secrets + suite complète (OBLIGATOIRE avant push)**
- `scripts/preview-ui.js` : rendu jsdom du dashboard pour inspecter l'interface sans navigateur

## ⚠️ PIÈGES CONNUS (appris à la dure)

1. **Frontend** : les assets sont chargés avec `?v=NNN` dans `public/index.html` + cache
   `botdev-vNNN` dans `public/sw.js` → **INCRÉMENTE LES DEUX à chaque modif frontend**,
   sinon personne ne voit les changements (PWA/cache navigateur)
2. **Commandes slash** : GLOBALES uniquement (pas de copies par serveur : doublons).
   Anti-dérive automatique intégré (vérifie l'état réel chez Discord toutes les 10 min)
3. **IP partagée Render free** : Discord peut bloquer la passerelle (connexions suspendues).
   Protections en place : timeout login 5 min, pauses persistantes 10→20 min (`gw_fail_state`),
   chien de garde patient. Si blocage long : migrer de région via l'API Render (créer un
   service dans une autre région, copier les env vars, suspendre l'ancien — déjà fait une fois)
4. **Jamais 2 services actifs** avec le même token Discord
5. TikTok live = point d'accès non officiel (`/api-live/user/room/`) : peut casser un jour
6. La base SQLite est EFFACÉE à chaque déploiement Render → tout passe par la
   restauration GitHub au boot. Ne jamais casser `backup.js`
7. Détection de secrets dans check.sh : ne jamais mettre de token en dur dans le code

## 🔑 MES ACCÈS (à remplacer avant d'envoyer)

- ⚠️ **Aucun secret dans ce dépôt.** L'utilisateur (nexusdolf-rgb) fournira dans le chat :
  un token GitHub fine-grained (botdev + botdev-data, Contents RW + Workflows RW),
  la clé API Render, et le token du bot Discord si nécessaire.
- Variables d'environnement sur Render (service hoxera → Environment) :
  `HOXERA_TOKEN` (token Discord), `HOXERA_CLIENT_ID`/`DISCORD_CLIENT_ID` = 1537443352281088000,
  `DISCORD_CLIENT_SECRET` (OAuth dashboard), `BOTDEV_GH_TOKEN` (sauvegardes),
  `BOTDEV_DATA_REPO` = nexusdolf-rgb/botdev-data
- Serveur support officiel : https://discord.gg/X9hTdr9N3 (affiché dans la bio du bot)

## 🚀 PREMIÈRE MISSION DU NOUVEL AGENT

1. Clone `https://github.com/nexusdolf-rgb/botdev`, `npm install`, lis le dernier commit
2. Vérifie l'état : `https://hoxera.is-a.dev/api/health/bot` (bot en ligne ? erreurs ?)
3. Lance `bash scripts/check.sh` → doit être 🟢 (43+ tests)
4. Vérifie mes tokens (GitHub 200, Render 200, Discord `users/@me`)
5. Fais-moi un point de situation clair, puis attends mes instructions

## 📌 ÉTAT AU 24/08/2026 (dernière mise à jour de ce document)

- Dernière version : **v2.3** (journal des tickets staff avec récap + note ⭐ auto)
- Bot en ligne, 7 serveurs, 0 erreur, toutes protections actives
- Idées en attente (non commencées) : recherche dans les transcriptions depuis le
  dashboard, rappels récurrents, constructeur d'embeds, /afk
