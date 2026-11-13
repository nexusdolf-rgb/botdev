#!/usr/bin/env python3
"""Génère la légende dessinée du panneau vocal.

Le panneau a dix boutons-émojis sans libellé : la légende est ce qui les nomme.
Elle doit donc suivre EXACTEMENT la disposition des boutons — quatre colonnes,
puis quatre, puis deux — et non des colonnes de largeurs variables comme la
version précédente, où « NOM » commençait sous le crayon mais « RÉCUPÉRER »
commençait sous la clé.

Grille retenue :
  • quatre colonnes de largeur égale (celles des rangées de boutons) ;
  • dans chaque cellule, l'icône à gauche et le mot à droite, même écart ;
  • trois rangées, mêmes hauteurs ;
  • icônes : les dix PNG du panneau (aucune n'est modifiée) ;
  • texte en #DBDEE1 : 9,4:1 sur le fond Discord, contre 6,5:1 pour l'ancien
    gris — même famille, simplement lisible sans plisser les yeux.

Usage : python3 scripts/gen-legende-vocale.py [--force]
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "server" / "assets" / "voicetemp"
SORTIE = SOURCE / "legende-vocale.png"

# Disposition : la même que les boutons du panneau (4 / 4 / 2).
LIGNES = [
    [("nom", "NOM"), ("limite", "LIMITE"), ("prive", "PRIVÉ"), ("public", "PUBLIC")],
    [("recup", "RÉCUPÉRER"), ("ajouter", "AJOUTER"), ("retirer", "RETIRER"), ("expulser", "EXPULSER")],
    [("transfer", "TRANSFÉRER"), ("suppr", "SUPPRIMER")],
]

COLONNES = 4
CELLULE = 258           # largeur d'une colonne : le mot le plus long
                        # (TRANSFÉRER, 197 px) + icône + écart + marge
RANGEE = 88             # hauteur d'une ligne
MARGE_H = 8             # marge à gauche de la grille
ICONE = 34              # taille de l'icône
ECART = 11              # entre l'icône et le mot
TEXTE = (219, 222, 225, 255)   # #DBDEE1
SS = 3                  # supersampling

LARGEUR = COLONNES * CELLULE
HAUTEUR = len(LIGNES) * RANGEE + 2 * 18

POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def construire() -> Image.Image:
    # On dessine en grand puis on réduit : bords nets, texte net.
    img = Image.new("RGBA", (LARGEUR * SS, HAUTEUR * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    police = ImageFont.truetype(POLICE, 28 * SS)

    for i, ligne in enumerate(LIGNES):
        y0 = (18 + i * RANGEE) * SS
        for j, (cle, mot) in enumerate(ligne):
            x0 = (MARGE_H + j * CELLULE) * SS
            # Chaque PNG a ses propres marges transparentes : sans recadrage,
            # l'œil voit l'icône « flotter » à une place différente d'une
            # colonne à l'autre. On recadre sur le dessin, puis on le pose dans
            # une case de largeur fixe : le mot commence donc TOUJOURS au même x.
            brut = Image.open(SOURCE / f"hox_{cle}.png").convert("RGBA")
            boite_icone = brut.getbbox()
            dessin = brut.crop(boite_icone) if boite_icone else brut
            echelle = (ICONE * SS) / max(dessin.size)
            dessin = dessin.resize((max(1, round(dessin.width * echelle)), max(1, round(dessin.height * echelle))), Image.LANCZOS)
            y_icone = int(y0 + (RANGEE * SS - dessin.height) / 2)
            x_icone = int(x0 + (ICONE * SS - dessin.width) / 2)
            img.alpha_composite(dessin, (x_icone, y_icone))
            boite = d.textbbox((0, 0), mot, font=police)
            h_texte = boite[3] - boite[1]
            y_texte = int(y0 + (RANGEE * SS - h_texte) / 2 - boite[1])
            d.text((x0 + (ICONE + ECART) * SS, y_texte), mot, font=police, fill=TEXTE)

    return img.resize((LARGEUR, HAUTEUR), Image.LANCZOS)


def main() -> None:
    force = "--force" in sys.argv
    if SORTIE.exists() and not force:
        print(f"{SORTIE.name} existe déjà — relancer avec --force pour la régénérer.")
        return
    img = construire()
    img.save(SORTIE, optimize=True)
    print(f"écrit : {SORTIE} — {img.size[0]}×{img.size[1]}, {SORTIE.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
