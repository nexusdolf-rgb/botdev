#!/usr/bin/env python3
"""Serre le decor du tableau de bord : rayons, tuiles en degrade, hauteurs.

Ce que la mesure (test/tools/audit-design-system.js, rendu reel, 11 modules,
1440 x 900) trouvait avant v367 sur une seule page :

    rayons             10 px x241 | 4 x105 | 14 x81 | 999 x54 | 12 x36 | 50 % x33
                       | 11 x21 | 16 x16     -> huit valeurs, aucune regle
    surfaces en        22 elements encore peints en degrade dans les modules
    degrade            courants (tuiles, pastilles, en-tetes)
    hauteurs de        44 x113 | 34 x81 | 20 x42 | 40 x14 | 38 x9 | 32 x5 | 36 x4
    controles          -> trois champs de saisie sur quatre a 34 px

Un produit tenu par une equipe a trois rayons, des surfaces plates et une
hauteur de controle. Le dégradé sur une tuile de 36 px n’apporte aucune
information : il signale seulement qu’on a « décoré » sans maquette. DraftBot,
mesuré sur sa propre feuille (/_nuxt/entry.css), emploie border-radius: 8px
dans la moitié de ses cas et un height: 46px pour ses champs.

Les trois regles, et leur justification :

  RAYONS - quatre valeurs : 4 (champs, pastilles, chips imitees de Discord),
    8 (boutons, cartes, menus), 12 (blocs et modales), 999 (pilules). Le 50 %
    (ronds : avatars) est une forme, pas un rayon : il est laissé. Classement au
    plus proche, et à distance égale vers le BAS — un rayon se resserre, il ne se
    gonfle pas. Tout ce qui vaut 99 px ou plus est une pilule assumée : on la
    laisse telle quelle. Un rayon à plusieurs valeurs (la feuille du bas,
    « 20px 20px 0 0 ») est traité valeur par valeur, jamais écrasé par une seule.

  TUILES - tout dégradé dont les deux stopps ne diffèrent que par l’alpha du
    même accent est aplati en une couleur pleine : le dégradé ne disait rien.
    Les dégradés qui portent une intention (halo de bannière, fond de héros,
    anneaux, jauges) sont gardés — listés ci-dessous, pas devinés.

  HAUTEURS - 40 px pour les champs et les petits boutons sur ordinateur. Sur
    écran tactile, les 48 px de la v366 ne bougent pas : ils vivent dans le bloc
    mobile, hors de portée ici. 40 px, c’est la hauteur du bouton Discord et le
    haut de la fourchette Apple/Google ; 34 px, c’est du menu contextuel.

Idempotent : relancé, il ne change plus rien. --bilan pour ne rien écrire.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FEUILLES = [RACINE / 'public' / 'css' / 'dashboard.css', RACINE / 'public' / 'css' / 'style.css']

RAYONS = [4, 8, 12]
# lignes ignorees par la passe de rayons en ligne : l'aperçu Discord reproduit
# les mesures reelles de Discord (vignette 6 px, pied 11,5 px). Un test le verifie
# (test/v239-test.js), donc la passe ne doit pas les « arrondir » à notre échelle.
GARDE_LIGNE = re.compile(r'E\(serverName\)|border-radius:6px;flex-shrink|\.dp-|apercu')
PILON = 99  # au-dela, c'est une pilule : on n'y touche pas


def rayon(v: float) -> float:
    if v >= PILON or v == 0:
        return v
    meilleur, distance = None, None
    for c in RAYONS:
        d = abs(c - v)
        if distance is None or d < distance - 1e-9 or (abs(d - distance) < 1e-9 and c < meilleur):
            meilleur, distance = c, d
    return meilleur


def normalise_liste(valeurs: str) -> str:
    """Chaque « Npx » de la liste passe au cran ; les 0 et les % restent."""
    def un(m):
        v = float(m.group(1))
        return f'{int(rayon(v))}px'
    return re.sub(r'([0-9.]+)px', un, valeurs)


TX_RAYON = re.compile(r'border-radius:\s*([^;{}]+);')
TX_RAYON_COIN = re.compile(r'(border-[a-z-]+-radius):\s*([0-9.]+)px;')

# Dégradés qui portent une intention : ils restent, listés et non devinés.
ON_GARDE = [
    'radial-gradient', 'conic-gradient',
    '142A46', '193F67', 'B62F43',          # la marque : banniere, badge, rubis
    'e07a5f', 'c96a4f',                    # l’accent de la maison
    'hero', 'halo', 'anneau', 'gauge',      # mots-clés de nos propres règles
    'linear-gradient(180deg, #1c1e26', 'linear-gradient(180deg,#1c1e26',  # fond du shell (v199)
]
TX_DECL = re.compile(r'(background(?:-image)?:\s*)(linear-gradient\([^;{}]*\))\s*;')


def aplatir(gradient: str) -> str | None:
    """Aplatit un degrade dont les deux bouts sont LA MEME COULEUR, seulement plus
    ou moins transparente. C'est le motif « tuile decorate » : la moitie du
    gradient ne dit rien de plus que l'autre. Un degrade qui va d'une couleur a
    une autre garde son intention (halo, banniere, jauge) et n'est pas touche."""
    if any(g in gradient for g in ON_GARDE):
        return None
    couleurs = []
    for m in re.finditer(r'rgba?\(\s*(var\(--[a-z-]+\)|[0-9]{1,3}\s*,\s*[0-9]{1,3}\s*,\s*[0-9]{1,3})\s*(?:,\s*([0-9.]+))?\s*\)', gradient):
        couleurs.append((m.group(1).replace(' ', ''), float(m.group(2) or 1)))
    for m in re.finditer(r'(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b', gradient):
        h = m.group(1)[1:]
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        couleurs.append((','.join(str(int(h[i:i + 2], 16)) for i in (0, 2, 4)), 1.0))
    if len(couleurs) < 2:
        return None
    base = couleurs[0][0]
    if any(c != base for c, a in couleurs):
        return None
    alphas = [a for c, a in couleurs]
    if max(alphas) - min(alphas) > 0.42:
        return None          # un fondu vers le transparent : intention gardeé
    alpha = round(min(alphas) + (max(alphas) - min(alphas)) / 2 + 0.02, 2)
    return f'rgba({base}, {max(alpha, 0.05):.2f})'


# ---------------------------------------------------------------------------
# v367 — trois passes ajoutees apres mesure du rendu (banc :
# test/tools/audit-design-system.js) :
#   • les rayons ecrits EN LIGNE dans le JS (16px x11, 10px x8, 14px x1 au
#     rendu) echappaient au balayage CSS ;
#   • les variables --d-radius-* portent encore 20px et 13px, hors echelle :
#     elles ne s'affichent pas aujourd'hui parce qu'une regle plus tardive gagne,
#     mais elles reapparaissent des qu'un theme est actif ;
#   • les boutons de controle rendaient 34px de haut la ou DraftBot tient ses
#     champs a 46px et Discord a 38-40 : on releve au cran de 40, sans toucher
#     au bloc tactile v366 (44-48px) qui gagne en cascade sur mobile.
# ---------------------------------------------------------------------------

FEUILLES_JS = sorted((RACINE / 'public' / 'js').glob('*.js'))
MARQUEUR = '/* v367 — controles au cran de 40 (harmonise-le-decor) */'
BLOC_CONTROLES = MARQUEUR + """
@media (min-width: 768px) {
  .am-filter { min-height: 40px; }
}

/* Retour d'enregistrement : etat du bouton + horodatage a cote. Le style est
   volontairement discret — c'est une constatation, pas une fanfare. */
.dash-btn.is-done, .dash-save-action.is-done {
  border-color: rgba(87, 242, 135, .5);
  color: #b6f3c9;
  background: rgba(87, 242, 135, .12);
}
.save-stamp {
  display: inline-block;
  margin-left: 10px;
  align-self: center;
  font-size: 11px;
  color: var(--d-dim, #8a93a8);
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity .18s ease, transform .18s ease;
  white-space: nowrap;
}
.save-stamp.is-on { opacity: 1; transform: none; }
"""


def rayons_en_ligne(bilan: bool) -> int:
    """rayons ecrits en style inline dans le JS. Limite assumee : la passe ne
    voit que les formes `border-radius:NNpx` ; une valeur cachee dans un ternaire
    (`border-radius:${cond ? '50%' : '10px'}`) lui echappe — le banc v367 rattrape
    le reste en mesurant les styles computes, pas le texte."""
    n = 0
    motif = re.compile(r'border-radius:\s*([0-9.]+)px')
    for chemin in FEUILLES_JS:
        lignes = chemin.read_text(encoding='utf-8').split('\n')

        def traite(m):
            nonlocal n
            value = float(m.group(1))
            nouveau = rayon(value)
            if nouveau != value:
                n += 1
                return f'border-radius:{int(nouveau)}px'
            return m.group(0)

        for i, ligne in enumerate(lignes):
            # une ligne d'aperçu est une mesure Discord, pas notre decor
            if GARDE_LIGNE.search(ligne):
                continue
            lignes[i] = motif.sub(traite, ligne)
        s2 = '\n'.join(lignes)
        if s2 != chemin.read_text(encoding='utf-8') and not bilan:
            chemin.write_text(s2, encoding='utf-8')
    return n


def rayon_apercus(bilan: bool) -> int:
    """--dp-radius-card etait a 16px : hors echelle, et hors modele (un encart
    Discord fait 8px). L'apercu imite Discord, il n'interprete pas."""
    n = 0
    for chemin in FEUILLES:
        s = chemin.read_text(encoding='utf-8')
        motif = re.compile(r'(--dp-radius-[\w-]+):\s*([0-9.]+)px;')

        def traite(m):
            nonlocal n
            value = float(m.group(2))
            nouveau = rayon(value)
            if nouveau != value:
                n += 1
                return f'{m.group(1)}: {int(nouveau)}px;'
            return m.group(0)

        s2 = motif.sub(traite, s)
        if s2 != s and not bilan:
            chemin.write_text(s2, encoding='utf-8')
    return n


def variables_de_rayon(bilan: bool) -> int:
    n = 0
    for chemin in FEUILLES:
        s = chemin.read_text(encoding='utf-8')

        def traite(m):
            nonlocal n
            value = float(m.group(2))
            nouveau = rayon(value)
            if nouveau != value:
                n += 1
                return f'{m.group(1)}: {int(nouveau)}px;'
            return m.group(0)

        # les jetons de rayon, y compris les anciens nommes --r-* (un seul
        # usage : les boites qui imitent Discord dans les apercus)
        s2 = re.sub(r'(--(?:d-radius|r)-[\w-]+):\s*([0-9.]+)px;', traite, s)
        if s2 != s and not bilan:
            chemin.write_text(s2, encoding='utf-8')
    return n


def bloc_controles(bilan: bool) -> bool:
    chemin = RACINE / 'public' / 'css' / 'dashboard.css'
    s = chemin.read_text(encoding='utf-8')
    if MARQUEUR in s:
        return False
    if not bilan:
        chemin.write_text(s.rstrip('\n') + '\n\n' + BLOC_CONTROLES, encoding='utf-8')
    return True


def main() -> int:
    bilan = '--bilan' in sys.argv
    for chemin in FEUILLES:
        s = chemin.read_text(encoding='utf-8')
        av_r, ap_r = set(), set()
        n_rayon = n_degrade = 0

        def traite(m):
            nonlocal n_rayon
            liste = m.group(1)
            avant = [float(v) for v in re.findall(r'([0-9.]+)px', liste)]
            apres = [rayon(v) for v in avant]
            av_r.update(avant)
            ap_r.update(apres)
            nouveau = normalise_liste(liste)
            if nouveau.replace(' ', '') != liste.replace(' ', ''):
                n_rayon += 1
            return f'border-radius: {nouveau};'

        s = TX_RAYON.sub(traite, s)
        s = TX_RAYON_COIN.sub(lambda m: f'{m.group(1)}: {int(rayon(float(m.group(2))))}px;', s)

        avant_g = len(re.findall(r'linear-gradient', s))

        def traite_degrade(m):
            nonlocal n_degrade
            plat = aplatir(m.group(2))
            if plat is None:
                return m.group(0)
            n_degrade += 1
            return f'background: {plat};'

        s = TX_DECL.sub(traite_degrade, s)
        apres_g = len(re.findall(r'linear-gradient', s))
        print(f'- {chemin.name}')
        print(f'  rayons   : {len(av_r)} valeurs → {sorted(ap_r)} ({n_rayon} déclarations ramenées)')
        print(f'  dégradés : {avant_g} → {apres_g} (aplaties : {n_degrade})')
        if bilan:
            print('  (bilan seul, rien n’est écrit)')
        else:
            chemin.write_text(s, encoding='utf-8')
            print('  ✓ fichier réécrit')

    n_ligne = rayons_en_ligne(bilan)
    print(f'- rayons en ligne dans public/js/*.js : {n_ligne} valeurs ramenées à l’échelle')
    n_dp = rayon_apercus(bilan)
    print(f'- variables --dp-radius-* des aperçus : {n_dp} valeur(s) recadree(s) a 8 px')
    n_var = variables_de_rayon(bilan)
    print(f'- variables --d-radius-* : {n_var} valeurs remises sur l’échelle')
    if bloc_controles(bilan):
        print('- dashboard.css : bloc « contrôles au cran de 40 + retour d‘enregistrement » ajouté'
              if bilan else '- dashboard.css : bloc de controles et de retour d‘enregistrement ajoute')
    else:
        print('- dashboard.css : bloc deja en place (idempotent)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
