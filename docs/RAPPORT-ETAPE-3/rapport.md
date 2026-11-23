# Étape 3 — Secrets dans l'historique Git (v399)

## Méthode

Tout l'historique, toutes branches confondues, pas seulement `main` :

- **502 commits** (`git rev-list --all --count`) ;
- **18 700 objets blob distincts** extraits par `git rev-list --objects --all`
  puis lus par lots de 400 avec `git cat-file --batch`.

Chaque blob est passé à dix motifs qui cherchent des **secrets réels**, pas des
mots-clés dans le code :

| Motif | Forme recherchée |
|---|---|
| Jeton GitHub | `ghp_…`, `gho_…`, `github_pat_…` |
| Jeton de bot Discord | `M…`/`N…` + 23-26 caractères, `.`, 6, `.`, 27-38 |
| Clé AWS | `AKIA` + 16 caractères |
| Clé privée | `-----BEGIN … PRIVATE KEY-----` |
| Clé Google API | `AIza` + 35 caractères |
| Clé Stripe | `sk_live_…` / `rk_live_…` |
| Jeton Slack | `xox[baprs]-…` |
| Secret OpenAI | `sk-…` (32 caractères et plus) |
| Chaîne de connexion | `postgres://user:motdepasse@…` et équivalents |
| Affectation en dur | `api_key`/`secret`/`password`/`token` `=` `"…20 caractères et plus"` |

## Résultat : un seul objet signalé, et ce n'est pas un secret

```
affectation en dur : 1 blob
   ce9bb8e32b … "SECRET = 'oauth-only-test-value'"
```

Origine : commit `8f48661b`, *v361 : identité visuelle par module + durcissement
sécurité*. C'est la valeur qu'un test injecte pour simuler un jeton ; elle ne
donne accès à rien. Aucune autre catégorie n'a produit de résultat.

**Conclusion : aucun secret d'exploitation n'a jamais été commité. Aucune
rotation de clé n'est nécessaire** pour la partie historique Git.

## Cas particulier : `botdev.db`

Trois versions de la base sont présentes dans l'historique, toutes atteignables
depuis la branche distante **`origin/backup`** (commits `ad53c191`,
`6266f0b8`, `6d8090c2`, entre autres « nettoyage » qui la retirent du tip).

Contenu réel, table par table :

| Blob | Taille | Tables | Lignes |
|---|---|---|---|
| `a5c69338…` | 86 016 o | 13 | 2 |
| `7c464cb1…` | 86 016 o | 13 | 1 |
| `64850df0…` | 8 192 o | 1 | 1 |

Les lignes trouvées sont **toutes dans une table nommée `fake`** :

```
[{"id":42,"nom":"test-real"},{"id":7,"nom":"nexora"}]
```

Aucun jeton, aucun identifiant Discord, aucune donnée d'utilisateur. `.gitignore`
exclut déjà `*.db`, `*.db-*` et `*.db.*` : la fuite ne peut plus se reproduire
par accident.

**Mais `origin/backup` reste une branche publique qui porte l'historique d'un
fichier de base.** Même vide de secrets, elle donne l'image d'un dépôt qui
sauvegarde sa base dans Git, ce qui n'est pas le modèle retenu (étape 4 : la
sauvegarde vit dans `botdev-data`). Recommandation, à faire par le propriétaire :
supprimer la branche `backup` une fois la sauvegarde vérifiée.

## Ce que ce balayage ne couvre pas

- Les secrets présents dans les **journaux d'exécution** (Render) : hors dépôt.
- Les secrets postés dans des **issues ou commentaires** : GitHub les scanne
  déjà de son côté, et le dépôt est public (donc déjà soumis au *secret
  scanning* de GitHub).
- Les secrets dans **`botdev-data`** : dépôt privé distinct, traité à l'étape 4.

## Remarque de méthode

Le dépôt est public. Un secret commité serait donc **déjà** considéré comme
compromis, même après suppression du commit : nettoyer l'historique ne rend pas
une clé secrète. C'est pour cela que la conclusion porte sur la rotation, pas
sur la réécriture d'historique : rien à réécrire puisque rien n'a fuité.
