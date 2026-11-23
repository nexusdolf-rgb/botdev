# Étape 4 — Contenu et protection du dépôt de sauvegarde (v399)

## Ce qui part dans `botdev-data`

Le serveur sauvegarde la base **toutes les 10 minutes** (`server/index.js`,
minuteur) et au moment d'un arrêt propre (`shutdown()`). `POST /api/backup/now`
permet un déclenchement manuel, réservé au compte fondateur.

Format actuel (v2) :

1. la base SQLite est copiée, puis **compressée en gzip niveau 9** ;
2. le résultat est découpé en morceaux (`removeStaleParts` nettoie les plus
   anciens) ;
3. les morceaux sont envoyés **avant** le manifeste `botdev-backup.json` ; le
   manifeste porte la date, la taille, le SHA-256 de chaque morceau et le
   SHA-256 global de la base ;
4. le manifeste étant écrit en dernier, il ne peut jamais désigner un morceau
   qui n'existe pas encore : une sauvegarde interrompue est détectée, pas
   restaurée de travers.

## La correction importante de cette étape : le README mentait

`README.md` affirmait que les fichiers SQLite déposés dans le dépôt étaient
« chiffrés avec `BOTDEV_DATA_ENCRYPTION_KEY` ». **C'est faux.**

Ce qui est vrai :

- les **jetons de bots**, les **jetons OAuth** et les **sessions** sont
  chiffrés **au niveau du champ**, en AES-256-GCM, dans la base elle-même
  (`server/secretStore.js`) ;
- les noms de serveurs, salons, rôles, messages, réglages et statistiques,
  eux, sont **en clair** dans la base ;
- la sauvegarde, elle, n'applique **aucun chiffrement** : `gzip` uniquement.

Autrement dit : la sauvegarde protège les jetons (déjà chiffrés à la source),
mais **pas** le reste. Sa confidentialité repose entièrement sur le caractère
privé du dépôt `botdev-data` et sur le jeton qui y donne accès.

Le README est corrigé dans ce commit pour dire exactement cela.

## Ce que contient réellement la base

**65 tables** (comptées sur une base neuve), en six familles :

| Famille | Exemples |
|---|---|
| Cœur du bot | `bots`, `commands`, `guild_settings`, `cmd_stats` |
| Modération | `automod_logs`, `automod_strikes`, `blacklist_words`, `antinuke_actions` |
| Tickets | `closed_tickets`, `advanced_ticket_panels`, `advanced_ticket_channels` |
| Communauté | `economy`, `giveaways`, `birthdays`, `afk`, `activity` |
| Contenu publié | `custom_announcements`, `embed_templates`, `events`, `applications` |
| Identité et accès | `discord_tokens`, `sessions`, `invite_joins` |

Les tables de la dernière famille sont celles qui justifient la vigilance :
`discord_tokens` et `sessions` ne sont lisibles qu'avec la clé de chiffrement,
qui ne doit **jamais** être stockée dans le dépôt ni dans ses variables
GitHub.

## Exposition actuelle

- `botdev-data` est **privé** : une requête anonyme à l'API GitHub renvoie 404,
  et le dépôt n'est accessible qu'avec le jeton.
- `GET /api/health/backup` est public mais ne renvoie que `{ enabled }` : il
  ne divulgue ni la date, ni la taille, ni le contenu de la dernière
  sauvegarde.
- La branche `backup` du dépôt **public** n'a rien à voir avec la sauvegarde :
  elle contient du code ancien et une base de test vide (voir étape 3). Elle
  n'expose aucune donnée d'exploitation.

## Recommandations, par ordre d'importance

1. **Jeton GitHub dédié, fine-grained, limité au seul dépôt `botdev-data`**,
   permission **Contents : Read and write**, rien d'autre. Un jeton qui donne
   aussi accès à d'autres dépôts transforme une fuite de variable
   d'environnement en compromission de tout le compte.
2. **Protéger la branche** de sauvegarde contre les réécritures et les
   suppressions, pour qu'un jeton volé ne puisse pas effacer l'historique des
   sauvegardes (c'est précisément ce qu'un attaquant ferait avant une rançon).
3. **Activer la *push protection*** et le *secret scanning* sur les deux
   dépôts. Le dépôt public y est déjà soumis ; il faut l'activer aussi sur
   `botdev-data`, sinon une clé poussée par erreur dans un fichier de
   sauvegarde y resterait.
4. **Garder `BOTDEV_DATA_ENCRYPTION_KEY` hors de GitHub** (Render uniquement)
   et en conserver une copie hors ligne : sans elle, les jetons restaurés sont
   illisibles et le bot ne redémarre pas.
5. **Une copie hors ligne** (téléchargement manuel occasionnel) : un dépôt
   GitHub n'est pas une sauvegarde contre la suppression du compte.
6. Corriger la formulation du README : **fait dans ce commit**.

## Ce que cette étape ne change pas

Aucun code de sauvegarde n'est modifié : le format, la cadence et la
restauration restent ceux qui tournent aujourd'hui. Changer le format d'une
sauvegarde sans pouvoir en tester la restauration sur les vraies données serait
le meilleur moyen de découvrir un problème au pire moment. Le test
`test/backup-v2-test.js` continue de couvrir l'aller-retour avec un GitHub
simulé en mémoire.
