# Bancs de mesure du tableau de bord

Ces scripts ne sont **pas des tests** : ils ont besoin d'un serveur et de
Chromium. `scripts/run-all.js` ne les lance donc pas. Ils servent à vérifier
le rendu réel avant un déploiement, et à mesurer l'impact d'un changement.

```bash
node test/tools/audit-mobile.js 360              # audit complet, souris
node test/tools/audit-mobile.js 360 --tactile    # idem, écran tactile émulé
```

## Ce que l'audit vérifie

Pour chacun des 28 modules, à la largeur demandée :

| Indicateur | Seuil |
|---|---|
| débordements horizontaux | doit être **0** |
| cibles tactiles < 40 px | doit être **0** en `--tactile` |
| modules en erreur | doit être **0** |
| hauteur cumulée | suivi d'une version à l'autre |

`--tactile` active `hasTouch` + `isMobile` dans Chromium, ce qui déclenche les
media queries `(hover: none)` et `(pointer: coarse)`. Sans ça un iPad en mode
paysage passe pour un poste à souris et les planchers tactiles ne s'appliquent
pas. **Vérifier toujours les deux modes.**

> L'émulation tactile était un fichier séparé (`audit-mobile-tactile.js`).
> Il avait fini par diverger du banc principal et mesurait du code périmé.
> C'est désormais un drapeau du banc unique — ne pas recréer de copie.

## Drapeaux

| Drapeau | Effet |
|---|---|
| `--sans-repli` | désactive le repli des textes longs (comparer avec/sans) |
| `--seuil=N` | change le seuil de repli des textes (défaut 120) |
| `--classes=a,b,c` | ne mesure que ces modules |
| `--tout-ouvert` | force toutes les cartes ouvertes |
| `--tout-plier` | force toutes les cartes pliées |
| `--clic` | teste un vrai clic sur une carte pliable |
| `--tactile` | émule un écran tactile |
| `--textes` | détail des blocs de texte |
| `--repartition` | répartition de la hauteur par famille |
| `--cartes` | hauteur de chaque carte |
| `--pliables` | cartes éligibles au repli par module |

Sans `--tout-ouvert` ni `--tout-plier`, l'audit mesure le **comportement
produit** : première carte ouverte, sauf si elle dépasse 1 500 px.

## Comparer les trois comportements

```bash
node test/tools/comparer-repli.js
```

Mesure à 360 px, onglet par onglet : avant (tout ouvert) / nouveau défaut /
tout replié, avec le pourcentage de gain.

## Fidélité du banc

Le banc rejoue la même chaîne que le produit réel : `layoutSettingRows`,
`plierTextesLongs`, puis `rendreCartesPliables`. Les hauteurs sont mesurées sur
un DOM frais, **avant** l'application de tout repli, sinon le repli se
nourrirait de sa propre mesure.

Les données sont des maquettes : leurs formes doivent correspondre exactement à
l'API réelle (`tickets.types` est un tableau, `sanctions` renvoie
`{sanctions:[...]}`, `stats` attend `activity` + `joins` + `top_active`,
`economy/leaderboard` renvoie `{top:[...], me:null}`).
