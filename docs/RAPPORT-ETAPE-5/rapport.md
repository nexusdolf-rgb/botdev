# Étape 5 — Vérification réelle des restaurations (v399)

## Ce que fait `restore()`, ligne par ligne

Appelé **au démarrage**, avant l'ouverture de la base (`server/index.js:22-26`) :

1. si la sauvegarde est désactivée (pas de jeton ou pas de dépôt), on garde les
   données locales et on l'écrit dans le journal ;
2. téléchargement du manifeste `botdev-backup.json`, puis de chaque morceau ;
3. **vérification du SHA-256 de chaque morceau** et du SHA-256 global de la
   base avant toute écriture ;
4. refus d'une sauvegarde **sans aucun bot** (`countBotsIn`) : c'est la
   protection qui avait manqué lors de l'incident, où une base vide restaurée
   écrasait la bonne et où tout le monde la restaurait ensuite ;
5. écriture **atomique** : fichier temporaire en mode `0600` avec `flag: 'wx'`
   (il refuse d'écraser un fichier existant), puis `rename` ;
6. suppression des fichiers `-wal` et `-shm` qui décriraient l'ancienne base.

En cas d'échec, tout est rattrapé : le démarrage se poursuit avec les données
locales et la raison est enregistrée dans `lastRestoreInfo`.

`_retryRestoreOnce` retente toutes les 5 minutes **si et seulement si** la base
locale est vide (`guild_settings = 0`), et abandonne le processus si une base
non vide apparaît entre-temps.

## L'arrêt propre existe bien

`shutdown()` (`server/index.js:479-488`) attrape `SIGTERM` et `SIGINT`, envoie
une dernière sauvegarde (`backup.upload`), arrête tous les bots
(`botManager.stopAll`) puis quitte. Une plateforme d'hébergement qui envoie
`SIGTERM` avant de tuer le conteneur laisse donc passer la dernière sauvegarde,
**à condition** que le délai de grâce soit suffisant pour l'envoi.

## Le défaut trouvé, et pourquoi il n'est pas corrigé ici

**`restore()` ne compare pas les dates.** Il ne connaît que deux issues :
restaurer, ou ne rien faire. Si la sauvegarde distante est **plus ancienne** que
la base locale — par exemple parce que l'application a tourné quelque temps sans
pouvoir joindre GitHub, ou parce qu'un déploiement a démarré sur un disque vide
puis que le disque a été remonté —, le démarrage suivant **écrasera des données
plus récentes par des plus anciennes**. Le garde-fou « au moins un bot » ne
couvre pas ce cas : une sauvegarde d'hier a très bien un bot.

Pourquoi je ne le corrige pas dans cette étape :

- la correction est simple à écrire et **très** risquée à se tromper : une
  comparaison de dates mal placée empêche de restaurer après une vraie perte,
  c'est-à-dire au moment où tout dépend d'elle ;
- elle doit être testée sur des scénarios réels (horloge du conteneur, fuseau,
  manifeste absent, ancien format sans date), et un test avec un GitHub simulé
  ne prouve pas le comportement en production ;
- elle sort du périmètre « vérifier la procédure » demandé pour cette étape.

**Recommandation** : traiter ce point comme une étape à part, avec la
procédure ci-dessous exécutée **avant** et **après** la modification.

## Procédure de vérification réelle d'une restauration

À exécuter sur une copie de l'infrastructure, jamais directement en production.

### 1. Sauvegarder l'état de référence
```bash
# sur le service en production
curl -s -H "Cookie: <session fondateur>" -X POST https://<hôte>/api/backup/now
# puis, côté GitHub : noter la date du manifeste botdev-backup.json
```

### 2. Créer une instance de test isolée
- même image, **même `BOTDEV_DATA_ENCRYPTION_KEY`**, **autre** `BOTDEV_DATA_DIR` ;
- `BOTDEV_DATA_REPO` et `BOTDEV_GH_TOKEN` pointés vers le **même** dépôt privé ;
- aucun bot ne doit être connecté : couper `DISCORD_TOKEN` si l'image démarre
  les connexions automatiquement.

### 3. Vérifier la restauration
```bash
# dans les journaux de l'instance de test, on doit lire :
#   [BotDev] ✅ Données restaurées depuis GitHub (… octets)
# et non :
#   🛟 Sauvegarde distante SANS bot — ignorée
```

### 4. Comparer données réelles et données restaurées
```sql
SELECT count(*) FROM bots;
SELECT count(*) FROM guild_settings;
SELECT count(*) FROM closed_tickets;
SELECT max(created_at) FROM activity;   -- fraîcheur réelle des données
```
Les quatre compteurs doivent être **identiques ou supérieurs** à ceux de la
production au moment de l'étape 1.

### 5. Vérifier que les jetons sont lisibles
Sur l'instance de test, ouvrir un panneau qui lit un jeton de bot (par exemple
la page d'un bot). Si `BOTDEV_DATA_ENCRYPTION_KEY` est la bonne, les jetons se
déchiffrent ; sinon la lecture échoue — et c'est **le bon signe que la clé est
indispensable**.

### 6. Mesurer le délai de grâce de l'hébergeur
```bash
# sur l'instance de production, déclencher un arrêt propre et chronométrer
# jusqu'à la disparition du conteneur, en vérifiant que la dernière
# sauvegarde est bien arrivée sur GitHub.
```
Si l'arrêt intervient avant la fin de `backup.upload`, la sauvegarde de
`shutdown()` est perdue — sans gravité si la sauvegarde périodique de 10
minutes tourne, mais à savoir.

### 7. Répéter une fois par trimestre
Une procédure de restauration qui n'a jamais été exécutée n'est pas une
procédure, c'est une intention.

## Résumé

| Point | État |
|---|---|
| Restauration au démarrage, avant la base | ✅ |
| SHA-256 par morceau et global | ✅ |
| Refus d'une base sans bot | ✅ |
| Écriture atomique, permissions 0600 | ✅ |
| Arrêt propre (`SIGTERM`/`SIGINT`) | ✅ |
| Nouvelle tentative si base vide | ✅ |
| **Comparaison des dates** | ❌ non implémentée, hors périmètre |
| Procédure testée sur une vraie instance | ⬜ à exécuter par le propriétaire |
