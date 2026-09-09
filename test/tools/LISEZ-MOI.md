# Bancs de mesure (non exécutés par `scripts/check.sh`)

Ces fichiers ne sont **pas des tests** : ce sont des outils de mesure que l'on
lance à la main. `test/run-all.js` ne parcourt que `test/*.js` (pas les
sous-dossiers), donc rien ici ne peut faire rougir la suite.

| Fichier | À quoi ça sert | Comment lancer |
|---|---|---|
| `audit-mobile.js` | Rend les 28 modules du dashboard dans Chromium et mesure : débordements horizontaux, hauteur en écrans, polices < 12 px, cibles tactiles < 40 px, textes rognés par ellipsis. | `node test/tools/audit-mobile.js 360` |
| `audit-mobile-tactile.js` | Idem, mais en émulation tactile (`hasTouch` + `isMobile`) pour vérifier les media queries `(hover: none) and (pointer: coarse)`. | `node test/tools/audit-mobile-tactile.js 768` |
| `test-detecteur-debordement.js` | Valide la logique du détecteur de débordement lui-même (3 cas : vrai débordement, conteneur défilant légitime, élément normal). À lancer si l'on modifie le détecteur. | `node test/tools/test-detecteur-debordement.js` |

## Prérequis

1. Un serveur local qui tourne sur le port 3000, **avec des données isolées** :
   ```bash
   BOTDEV_DATA_DIR=/tmp/uiaudit node server/index.js
   ```
   Le bot doit être désactivé (jeton factice) pour ne jamais toucher Discord.
2. `npm i playwright-core` et le navigateur Chromium headless téléchargé.
3. Un utilisateur + une session insérés directement en base (l'authentification
   passe par Discord OAuth, impossible à jouer en local sans jeton réel).

## Pourquoi ces bancs existent

L'audit v244 a révélé des défauts invisibles à l'œil nu et non reproductibles
sans mesure automatisée : un `<small>` à 9,58 px (80 % appliqué par le
navigateur), un conflit de spécificité entre deux classes sur un même élément
(« Identité du bot » rogné de 9 px), et 13 cibles tactiles sous 40 px.

⚠️ Le banc ne mesure que les éléments **réellement visibles** (`display`,
`visibility`, `opacity`, boîte non nulle). Sans ce filtre il remontait
`.ov-stat-note` à 9,5 px alors que cette classe est déjà masquée sous 520 px —
un faux positif qui aurait fait « corriger » du code mort.
