# Bancs de mesure (non exécutés par `scripts/check.sh`)

Ces fichiers ne sont **pas des tests** : ce sont des outils de mesure que l'on
lance à la main. `test/run-all.js` ne parcourt que `test/*.js` (pas les
sous-dossiers), donc rien ici ne peut faire rougir la suite.

| Fichier | À quoi ça sert | Comment lancer |
|---|---|---|
| `audit-mobile.js` | Rend les 28 modules du dashboard dans Chromium et mesure : débordements horizontaux, hauteur en écrans, polices < 12 px, cibles tactiles < 40 px, textes rognés par ellipsis, blocs repliés. | `node test/tools/audit-mobile.js 360` |
| `audit-mobile-tactile.js` | Idem, mais en émulation tactile (`hasTouch` + `isMobile`) pour vérifier les media queries `(hover: none) and (pointer: coarse)`. | `node test/tools/audit-mobile-tactile.js 768` |
| `test-detecteur-debordement.js` | Valide la logique du détecteur de débordement lui-même (3 cas : vrai débordement, conteneur défilant légitime, élément normal). À lancer si l'on modifie le détecteur. | `node test/tools/test-detecteur-debordement.js` |

## Modes de `audit-mobile.js`

`node test/tools/audit-mobile.js <largeur> [modules…] [drapeaux…]`

Les drapeaux ne sont pas des noms de module — ils sont filtrés.

| Drapeau | Effet |
|---|---|
| `--sans-repli` | Désactive le repli des textes (v245). Sert à mesurer l'avant/après. |
| `--tout-plier` | Replie TOUTES les cartes. Mesure le gain maximal du repli. |
| `--seuil=N` | Change le seuil de repli des textes (défaut produit : 120 caractères). |
| `--classes=a,b,c` | Remplace la liste blanche des classes repliables (sans les points). |
| `--textes` | Rapport dédié : pavés d'explication par module, répartition par classe, les 25 plus hauts. |
| `--repartition` | Répartition de la hauteur par nature : contrôles / textes / tableaux / autre. |
| `--cartes` | Cartes par module, hauteur, part du module, les 20 plus hautes. |
| `--clic` | Test de bout en bout du repli d'une carte : clic sur le titre, chevron, `sessionStorage`, `aria-expanded`. |

### Mesures de référence (360 px, 28 modules)

| Configuration | Hauteur |
|---|---|
| Post-traitements désactivés (`--sans-repli`) | 78 écrans |
| Défaut v245 (textes repliés, cartes ouvertes) | 77 écrans |
| Toutes les cartes repliées (`--tout-plier`) | **29 écrans** |

Le défaut reste proche du « sans repli » : c'est voulu, l'utilisateur a choisi
que **toutes les cartes soient ouvertes au départ**. Le gain n'apparaît que
lorsqu'il replie ce qui le gêne — et ce choix est alors mémorisé pour la
session. Le repli des textes, lui, s'applique d'office.

Répartition de la hauteur (62 282 px) : cartes/titres/espacements 50 %,
contrôles 29 %, textes d'explication 21 %. C'est cette mesure qui a montré que
replier les textes seuls ne suffisait pas, et qu'il fallait rendre les cartes
pliables.

## Prérequis

1. Un serveur local qui tourne sur le port 3000, **avec des données isolées** :
   ```bash
   BOTDEV_DATA_DIR=/tmp/uiaudit node server/index.js
   ```
   Le bot doit être désactivé (jeton factice) pour ne jamais toucher Discord.
2. `npm i playwright-core` et le navigateur Chromium headless téléchargé.
3. Un utilisateur + une session insérés directement en base (l'authentification
   passe par Discord OAuth, impossible à jouer en local sans jeton réel).

## ⚠️ Le banc DOIT rejouer le pipeline réel

`Dashboard.renderContent` ne se contente pas d'appeler le rendeur : il enchaîne
sur `layoutSettingRows` puis `plierTextesLongs` et `rendreCartesPliables`.

Pendant la v244, le banc appelait les rendeurs **seuls**. Il mesurait donc une
page que personne ne voit. Conséquence concrète : il annonçait « 0 cible tactile
sous 40 px », alors que `layoutSettingRows` déplace les boutons en fin de carte
dans `.card-actions`, où un sélecteur trop spécifique leur imposait 38 px.
**47 boutons** du tableau de bord étaient concernés, et le banc ne les voyait
pas. Le correctif est en place, et `test/v245-test.js` verrouille le fait que le
banc rejoue bien les trois post-traitements.

Toute mesure annoncée à l'utilisateur doit provenir du banc avec le pipeline
complet. `--sans-repli` ne désactive que le repli v245, jamais
`layoutSettingRows`.

## Pourquoi ces bancs existent

L'audit v244 a révélé des défauts invisibles à l'œil nu et non reproductibles
sans mesure automatisée : un `<small>` à 9,58 px (80 % appliqué par le
navigateur), un conflit de spécificité entre deux classes sur un même élément
(« Identité du bot » rogné de 9 px), et 13 cibles tactiles sous 40 px.

⚠️ Le banc ne mesure que les éléments **réellement visibles** (`display`,
`visibility`, `opacity`, boîte non nulle). Sans ce filtre il remontait
`.ov-stat-note` à 9,5 px alors que cette classe est déjà masquée sous 520 px —
un faux positif qui aurait fait « corriger » du code mort.
