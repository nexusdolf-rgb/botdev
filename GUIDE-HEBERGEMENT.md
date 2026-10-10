# Héberger Hoxera — configuration sûre

Ce guide décrit les prérequis actuels du dépôt. **Hoxera exige Node.js 24**. Les contrôles réduisent les risques, sans garantir l’absence de toute vulnérabilité.

## Avant le déploiement

- Utilise un hébergement de confiance et **HTTPS** pour toute URL publique. Ne publie pas directement le port HTTP 3000 sur Internet : les cookies de session sont sécurisés et les écritures API vérifient l’origine.
- Garde le code et les secrets séparés. Ne commite jamais de fichier `.env`, de token Discord, de secret OAuth ou de PAT GitHub. Configure les valeurs dans le gestionnaire de secrets de l’hébergeur.
- Prévois un stockage persistant pour SQLite et les images, ou configure les sauvegardes GitHub privées. Sans stockage persistant ni sauvegarde, un redéploiement peut faire perdre les données locales.

## Variables indispensables en production

Configure-les dans l’environnement de l’hébergeur, jamais dans le dépôt :

| Variable | Rôle |
|---|---|
| `NODE_ENV=production` | Active le mode production et les contrôles stricts. |
| `PUBLIC_ORIGIN=https://ton-domaine.example` | Origine publique exacte, sans chemin final. Utilise ton vrai domaine HTTPS. |
| `HOXERA_TOKEN` | Token du bot Discord principal. Traite-le comme un mot de passe. |
| `HOXERA_CLIENT_ID` | ID de l’application Discord du bot. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Identifiants OAuth2 configurés dans le portail développeur Discord. |
| `DISCORD_REDIRECT_URI` | `https://ton-domaine.example/api/auth/discord/callback`; cette URL doit aussi être enregistrée dans le portail Discord. |
| `NEXORA_ADMIN_DISCORD_ID` | ID numérique exact du compte fondateur. Sans configuration valide, les fonctions d’administration restent verrouillées. |
| `BOTDEV_DATA_ENCRYPTION_KEY` | Clé stable de 64 caractères hexadécimaux pour les tokens SQLite. Génère-la avec `openssl rand -hex 32`, conserve-la hors du dépôt et garde une copie de secours séparée. |
| `BOTDEV_DATA_DIR` | Répertoire persistant réservé aux données Hoxera, si l’hébergeur le permet. |

Pour utiliser les sauvegardes GitHub, ajoute `BOTDEV_GH_TOKEN` (PAT fine-grained avec uniquement **Contents: Read and write** sur le dépôt de sauvegarde) et `BOTDEV_DATA_REPO=propriétaire/dépôt`. Ce dépôt doit être **privé**. N’utilise pas un PAT personnel plus puissant que nécessaire.

### Rotation de la clé de chiffrement

Ne remplace pas simplement `BOTDEV_DATA_ENCRYPTION_KEY` : les anciennes données ne seraient plus déchiffrables. Pour une rotation, place l’ancienne clé temporairement dans `BOTDEV_DATA_ENCRYPTION_KEY_PREVIOUS`, définis la nouvelle clé active, démarre Hoxera pour la migration automatique, vérifie la sauvegarde, puis retire l’ancienne clé. Si tu n’es pas certain de la clé actuelle, arrête-toi et sauvegarde les données avant toute modification.

## Installation et vérification

Depuis la racine du dépôt, avec Node.js 24 :

```bash
npm ci
npm run check
```

La vérification comprend le contrôle de version Node, la syntaxe, la recherche de motifs de secrets, `npm audit` et la suite de tests. Elle a besoin des dépendances de développement : exécute-la en CI ou dans un environnement de préparation, pas dans l’image runtime allégée.

Pour un serveur directement géré :

```bash
npm start
```

Pour l’image Docker fournie :

```bash
docker build -t hoxera .
docker run --env-file /chemin/hors-depot/hoxera.env \
  -v hoxera-data:/app/data -p 127.0.0.1:3000:3000 hoxera
```

Le port de l’exemple Docker est lié à l’interface locale : place un reverse proxy HTTPS de confiance devant le conteneur. N’expose pas le service en HTTP public. Le serveur est configuré pour un proxy de confiance ; si ton hébergement utilise une topologie différente, vérifie ce réglage avant publication.

## Contrôles avant mise en ligne

1. Vérifie dans le portail Discord l’URL de redirection OAuth et les intents réellement nécessaires au bot.
2. Vérifie que la clé de chiffrement et le PAT ne figurent ni dans Git, ni dans l’image Docker, ni dans les journaux.
3. Vérifie que le volume de données est persistant et sauvegardé; protège aussi les sauvegardes et la clé de chiffrement.
4. Attends la réussite de `npm run check` et de la CI sur le commit exact à déployer. Un audit des dépendances ne remplace pas la revue des changements.
5. Après mise en ligne, teste la connexion Discord, les cookies HTTPS, les écritures API, la restauration et les journaux de santé. N’effectue pas ces tests sur un dépôt de sauvegarde de production.

Les liens d’invitation Hoxera n’incluent pas la permission Discord `Administrator`. Vérifie les permissions affichées par Discord et n’accorde au bot que les rôles indispensables au serveur concerné.
