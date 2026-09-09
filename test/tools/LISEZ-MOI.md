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
| `--inspect=SÉLECTEUR` | dump des boîtes réelles (diagnostic de débordement) |
| `--module=onglet` | onglet à inspecter avec `--inspect` (défaut `antinuke`) |
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

## Diagnostiquer un débordement

```bash
node test/tools/audit-mobile.js 901 --inspect=.nk-limit-list --module=antinuke
```

Affiche pour chaque élément : position gauche/droite, largeur rendue,
`scrollWidth` contre `clientWidth` (un `scrollWidth` supérieur trahit un contenu
plus large que sa boîte), la grille CSS réellement appliquée, `min-width` et
`flex`. C'est ce qui a révélé en v248 une colonne de libellé réduite à `0px` et
une liste enfermée dans 300 px alors qu'il lui en fallait 392.

Le rapport standard se termine par deux lignes de contrôle :

    disposition : shell flex ✅ | sidebar flex 300px ✅ | nav basse none | contenu 1140px
    repli cartes : 0/71 pliées — doit être INACTIF (écran large) ✅

La disposition attendue est déduite de la media query du produit elle-même, pas
d'une supposition sur la largeur : en mode tactile un viewport de 1 440 × 780
bascule en mobile à cause du `max-height: 800px`.

## Fidélité du banc

Le banc construit la structure RÉELLE du shell, celle de `Dashboard.mount`
(`public/js/dashboard.js`) :

    .dashboard-shell-host > .dash-shell
      ├── aside.dash-side
      ├── main.dash-main > .dash-topbar + #dash-content
      └── nav.dash-bnav

Il se contentait auparavant d'un `<div class="dash-content">` isolé. Deux
conséquences mesurées : aucune règle CSS portant sur `#dash-content`,
`.dash-side` ou `.dash-main` ne s'appliquait, et la bascule bureau/mobile
n'était jamais vérifiée — ce qui a laissé passer le repli automatique appliqué à
tort sur ordinateur (v246) et 45 débordements entre 901 et 1 350 px (v244).
Une fois fidèle, la hauteur mesurée sur PC est passée de 30 à 51 écrans : le
banc était 40 % trop optimiste sur ordinateur.

Le banc rejoue la même chaîne que le produit réel : `layoutSettingRows`,
`plierTextesLongs`, puis `rendreCartesPliables`. Les hauteurs sont mesurées sur
un DOM frais, **avant** l'application de tout repli, sinon le repli se
nourrirait de sa propre mesure.

⚠️ `Dashboard` et `App` sont des `const` de portée script : ils ne sont **pas**
sur `window`. Dans un `page.evaluate`, il faut les référencer nus
(`Dashboard.state`), jamais `window.Dashboard` — qui vaut `undefined` et fait
court-circuiter silencieusement les gardes.

## Démarrer le serveur

Le banc attend un serveur sur `http://127.0.0.1:3000` :

```bash
BOTDEV_DATA_DIR=/tmp/botdev-audit HOXERA_TOKEN= PORT=3000 node server/index.js
```

`HOXERA_TOKEN=` vide et un dossier de données isolé : le serveur sert les
fichiers sans se connecter à Discord. **Ne jamais lancer deux services avec le
même token de bot** — l'instance de production tourne déjà sur Render.

Les données sont des maquettes : leurs formes doivent correspondre exactement à
l'API réelle (`tickets.types` est un tableau, `sanctions` renvoie
`{sanctions:[...]}`, `stats` attend `activity` + `joins` + `top_active`,
`economy/leaderboard` renvoie `{top:[...], me:null}`).
