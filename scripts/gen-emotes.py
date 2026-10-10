#!/usr/bin/env python3
"""Génère les émoticônes de modules d'Hoxera dans le style déjà en place.

Style relevé sur les fichiers existants (public/emotes/hox_*.png) :
carré arrondi 128x128, fond #CB5D38 (rayon ~20 px), pictogramme blanc plein.
Les nouveaux tracés sont dessinés à 512 px puis réduits, pour des bords nets.

Usage : python3 scripts/gen-emotes.py [--force]

Le tableau de bord lit les images dans public/emotes ; server/assets/emotes
garde la même copie pour que le pack reste installable sur Discord par
/emotes install (la liste installée, HOX_SIG_EMOTES dans
server/discord/extra.js, reste volontairement à 25 émojis).
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 128
SS = 4  # facteur de supersampling
CANVAS = SIZE * SS
BG = (203, 93, 56, 255)
FG = (255, 255, 255, 255)
RADIUS = int(round(20.5 * SS))
OUT = Path(__file__).resolve().parent.parent / "public" / "emotes"


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, CANVAS - 1, CANVAS - 1], radius=RADIUS, fill=BG)
    return img, draw


def save(img: Image.Image, name: str) -> Path:
    target = OUT / f"hox_{name}.png"
    img.resize((SIZE, SIZE), Image.LANCZOS).save(target, optimize=True)
    return target


def U(v: float) -> float:  # unité 0..1 vers pixels supersamplés
    return v * CANVAS


def bubble(d: ImageDraw.ImageDraw, x0=0.18, y0=0.20, x1=0.82, y1=0.62, tail=True):
    d.rounded_rectangle([U(x0), U(y0), U(x1), U(y1)], radius=U(0.09), outline=FG, width=int(U(0.045)))
    if tail:
        d.polygon([(U(x0 + 0.10), U(y1 - 0.01)), (U(x0 + 0.02), U(y1 + 0.13)), (U(x0 + 0.22), U(y1 - 0.01))], fill=FG)


def verification(d: ImageDraw.ImageDraw):
    """Membre + coche dans un badge : la porte s'ouvre une fois vérifié."""
    d.rounded_rectangle([U(0.13), U(0.16), U(0.70), U(0.84)], radius=U(0.11), outline=FG, width=int(U(0.05)))
    d.ellipse([U(0.51), U(0.43), U(0.97), U(0.89)], fill=BG)
    d.ellipse([U(0.27), U(0.28), U(0.47), U(0.48)], fill=FG)
    d.pieslice([U(0.19), U(0.50), U(0.55), U(0.86)], 180, 360, fill=FG)
    d.rectangle([U(0.19), U(0.68), U(0.55), U(0.74)], fill=FG)
    d.ellipse([U(0.56), U(0.48), U(0.92), U(0.84)], fill=FG)
    cx, cy = U(0.74), U(0.66)
    d.line([(cx - U(0.075), cy + U(0.005)), (cx - U(0.02), cy + U(0.06))], fill=BG, width=int(U(0.055)))
    d.line([(cx - U(0.02), cy + U(0.06)), (cx + U(0.09), cy - U(0.07))], fill=BG, width=int(U(0.055)))


def blacklist(d: ImageDraw.ImageDraw):
    """Bulle barrée : le mot interdit saute."""
    bubble(d, 0.16, 0.18, 0.84, 0.62)
    d.ellipse([U(0.30), U(0.30), U(0.70), U(0.70)], outline=FG, width=int(U(0.05)))
    d.line([(U(0.36), U(0.36)), (U(0.64), U(0.64))], fill=FG, width=int(U(0.05)))


def antiraid(d: ImageDraw.ImageDraw):
    """Barrière baissée sur le serveur : plus personne n'entre en rafale."""
    d.rectangle([U(0.14), U(0.30), U(0.86), U(0.52)], fill=FG)
    for i in range(5):
        x = U(0.16 + i * 0.17)
        d.polygon([(x, U(0.30)), (x + U(0.06), U(0.30)), (x - U(0.02), U(0.52)), (x - U(0.08), U(0.52))], fill=BG)
    d.rectangle([U(0.17), U(0.52), U(0.27), U(0.86)], fill=FG)
    d.rectangle([U(0.73), U(0.52), U(0.83), U(0.86)], fill=FG)
    d.ellipse([U(0.44), U(0.10), U(0.56), U(0.22)], fill=FG)


def autoroles(d: ImageDraw.ImageDraw):
    """Étiquette de rôle qui descend toute seule vers le membre."""
    d.polygon([(U(0.16), U(0.18)), (U(0.62), U(0.18)), (U(0.84), U(0.40)), (U(0.40), U(0.84)), (U(0.16), U(0.60))], fill=FG)
    d.ellipse([U(0.27), U(0.34), U(0.41), U(0.48)], fill=BG)
    d.line([(U(0.62), U(0.60)), (U(0.86), U(0.84))], fill=FG, width=int(U(0.05)))
    d.polygon([(U(0.86), U(0.72)), (U(0.94), U(0.86)), (U(0.76), U(0.88))], fill=FG)


def starboard(d: ImageDraw.ImageDraw):
    """Bulle épinglée d'une étoile : le mur de la gloire."""
    bubble(d, 0.14, 0.16, 0.86, 0.60, tail=False)
    cxx, cyy, r = U(0.5), U(0.38), U(0.19)
    pts = []
    for i in range(10):
        ang = -1.5708 + i * 0.6283
        rad = r if i % 2 == 0 else r * 0.45
        pts.append((cxx + rad * __import__("math").cos(ang), cyy + rad * __import__("math").sin(ang)))
    d.polygon(pts, fill=FG)
    d.rectangle([U(0.34), U(0.70), U(0.66), U(0.80)], fill=FG)


def invites(d: ImageDraw.ImageDraw):
    """Un membre en amène un autre."""
    d.ellipse([U(0.18), U(0.20), U(0.44), U(0.46)], fill=FG)
    d.pieslice([U(0.10), U(0.48), U(0.52), U(0.90)], 180, 360, fill=FG)
    d.ellipse([U(0.56), U(0.28), U(0.78), U(0.50)], outline=FG, width=int(U(0.045)))
    d.arc([U(0.50), U(0.54), U(0.84), U(0.88)], 180, 360, fill=FG, width=int(U(0.045)))
    d.line([(U(0.84), U(0.30)), (U(0.92), U(0.30))], fill=FG, width=int(U(0.04)))
    d.line([(U(0.84), U(0.42)), (U(0.92), U(0.42))], fill=FG, width=int(U(0.04)))


def lives(d: ImageDraw.ImageDraw):
    """Antenne qui diffuse : le live démarre."""
    d.ellipse([U(0.42), U(0.40), U(0.58), U(0.56)], fill=FG)
    d.line([(U(0.50), U(0.56)), (U(0.50), U(0.86))], fill=FG, width=int(U(0.05)))
    for k, rad in enumerate((0.16, 0.28)):
        d.arc([U(0.5 - rad), U(0.48 - rad), U(0.5 + rad), U(0.48 + rad)], 200, 340, fill=FG, width=int(U(0.045)))
    d.line([(U(0.36), U(0.86)), (U(0.64), U(0.86))], fill=FG, width=int(U(0.05)))


def sticky(d: ImageDraw.ImageDraw):
    """Note punaisée : une bulle accrochée par sa punaise."""
    d.ellipse([U(0.43), U(0.10), U(0.57), U(0.24)], fill=FG)
    d.line([(U(0.50), U(0.24)), (U(0.50), U(0.34))], fill=FG, width=int(U(0.05)))
    d.rounded_rectangle([U(0.16), U(0.32), U(0.84), U(0.86)], radius=U(0.08), fill=FG)
    d.line([(U(0.28), U(0.50)), (U(0.72), U(0.50))], fill=BG, width=int(U(0.045)))
    d.line([(U(0.28), U(0.64)), (U(0.62), U(0.64))], fill=BG, width=int(U(0.045)))
    d.line([(U(0.28), U(0.76)), (U(0.50), U(0.76))], fill=BG, width=int(U(0.045)))


def birthdays(d: ImageDraw.ImageDraw):
    """Gâteau et bougies."""
    d.rectangle([U(0.20), U(0.54), U(0.80), U(0.84)], fill=FG)
    d.rectangle([U(0.26), U(0.38), U(0.74), U(0.54)], fill=FG)
    for x in (0.36, 0.50, 0.64):
        d.line([(U(x), U(0.22)), (U(x), U(0.38))], fill=FG, width=int(U(0.032)))
        d.polygon([(U(x), U(0.10)), (U(x + 0.045), U(0.19)), (U(x), U(0.27)), (U(x - 0.045), U(0.19))], fill=FG)
    d.rectangle([U(0.20), U(0.66), U(0.80), U(0.72)], fill=BG)
    for i in range(4):
        x = U(0.28 + i * 0.16)
        d.ellipse([x - U(0.05), U(0.34), x + U(0.05), U(0.44)], fill=FG)


def links(d: ImageDraw.ImageDraw):
    """Deux maillons : le panneau de liens."""
    d.rounded_rectangle([U(0.14), U(0.34), U(0.54), U(0.66)], radius=U(0.16), outline=FG, width=int(U(0.055)))
    d.rounded_rectangle([U(0.46), U(0.34), U(0.86), U(0.66)], radius=U(0.16), outline=FG, width=int(U(0.055)))
    d.line([(U(0.44), U(0.50)), (U(0.56), U(0.50))], fill=FG, width=int(U(0.055)))


def autoclean(d: ImageDraw.ImageDraw):
    """Balai : un message à la fois."""
    d.line([(U(0.72), U(0.16)), (U(0.40), U(0.52))], fill=FG, width=int(U(0.06)))
    d.polygon([(U(0.22), U(0.54)), (U(0.58), U(0.54)), (U(0.66), U(0.74)), (U(0.14), U(0.74))], fill=FG)
    for i in range(4):
        x = U(0.22 + i * 0.14)
        d.line([(x + U(0.02), U(0.74)), (x, U(0.88))], fill=FG, width=int(U(0.035)))


def commands(d: ImageDraw.ImageDraw):
    """Invite de commande : >_"""
    d.rounded_rectangle([U(0.14), U(0.22), U(0.86), U(0.78)], radius=U(0.09), outline=FG, width=int(U(0.05)))
    d.line([(U(0.26), U(0.38)), (U(0.42), U(0.50))], fill=FG, width=int(U(0.05)))
    d.line([(U(0.42), U(0.50)), (U(0.26), U(0.62))], fill=FG, width=int(U(0.05)))
    d.line([(U(0.52), U(0.62)), (U(0.74), U(0.62))], fill=FG, width=int(U(0.05)))


def modules(d: ImageDraw.ImageDraw):
    """Quatre briques dont une s'ajoute."""
    for (x, y) in ((0.16, 0.16), (0.46, 0.16), (0.16, 0.46)):
        d.rounded_rectangle([U(x), U(y), U(x + 0.24), U(y + 0.24)], radius=U(0.06), fill=FG)
    d.rounded_rectangle([U(0.46), U(0.46), U(0.70), U(0.70)], radius=U(0.06), outline=FG, width=int(U(0.045)))
    d.line([(U(0.80), U(0.50)), (U(0.80), U(0.74))], fill=FG, width=int(U(0.05)))
    d.line([(U(0.68), U(0.62)), (U(0.92), U(0.62))], fill=FG, width=int(U(0.05)))


def health(d: ImageDraw.ImageDraw):
    """Pouls dans un boîtier : l'état du processus."""
    d.rounded_rectangle([U(0.14), U(0.24), U(0.86), U(0.76)], radius=U(0.10), outline=FG, width=int(U(0.05)))
    d.line([(U(0.22), U(0.50)), (U(0.36), U(0.50)), (U(0.44), U(0.32)), (U(0.54), U(0.68)), (U(0.62), U(0.50)), (U(0.78), U(0.50))], fill=FG, width=int(U(0.05)), joint="curve")


def botsettings(d: ImageDraw.ImageDraw):
    """Trois curseurs réglés au poil."""
    for i, y in enumerate((0.28, 0.50, 0.72)):
        d.line([(U(0.16), U(y)), (U(0.84), U(y))], fill=FG, width=int(U(0.05)))
        x = (0.62, 0.36, 0.56)[i]
        d.ellipse([U(x - 0.08), U(y - 0.08), U(x + 0.08), U(y + 0.08)], fill=BG, outline=FG, width=int(U(0.05)))

def poll(d: ImageDraw.ImageDraw):
    """Urne + bulletin coché qui s'y glisse : le vote natif Discord."""
    # Bulletin au-dessus de la fente, coche en creux.
    d.rounded_rectangle([U(0.38), U(0.11), U(0.68), U(0.38)], radius=U(0.04), fill=FG)
    cx, cy = U(0.53), U(0.245)
    d.line([(cx - U(0.065), cy), (cx - U(0.017), cy + U(0.05))], fill=BG, width=int(U(0.045)))
    d.line([(cx - U(0.017), cy + U(0.05)), (cx + U(0.075), cy - U(0.058))], fill=BG, width=int(U(0.045)))
    # Urne pleine, fente fine et centrée (une fente, pas une poignée).
    d.rounded_rectangle([U(0.15), U(0.45), U(0.85), U(0.86)], radius=U(0.055), fill=FG)
    d.rounded_rectangle([U(0.32), U(0.52), U(0.68), U(0.562)], radius=U(0.021), fill=BG)

def rules(d: ImageDraw.ImageDraw):
    """Page de règlement avec son barre d'accent et son sceau d'acceptation."""
    d.rounded_rectangle([U(0.15), U(0.13), U(0.72), U(0.87)], radius=U(0.06), fill=FG)
    # Barre verticale façon encadré Discord : ce qui distingue une règle d'un brouillon.
    d.rectangle([U(0.215), U(0.22), U(0.255), U(0.78)], fill=BG)
    # Titre + lignes.
    d.rectangle([U(0.31), U(0.24), U(0.60), U(0.30)], fill=BG)
    d.rectangle([U(0.31), U(0.375), U(0.645), U(0.405)], fill=BG)
    d.rectangle([U(0.31), U(0.46), U(0.645), U(0.49)], fill=BG)
    d.rectangle([U(0.31), U(0.545), U(0.545), U(0.575)], fill=BG)
    # Sceau d'acceptation, posé sur le coin bas droit de la page.
    d.ellipse([U(0.52), U(0.56), U(0.90), U(0.94)], fill=BG)
    d.ellipse([U(0.55), U(0.59), U(0.87), U(0.91)], fill=FG)
    cx, cy = U(0.71), U(0.75)
    d.line([(cx - U(0.08), cy + U(0.005)), (cx - U(0.024), cy + U(0.06))], fill=BG, width=int(U(0.05)))
    d.line([(cx - U(0.024), cy + U(0.06)), (cx + U(0.09), cy - U(0.065))], fill=BG, width=int(U(0.05)))



SHAPE = {
    "verification": verification,
    "blacklist": blacklist,
    "antiraid": antiraid,
    "autoroles": autoroles,
    "starboard": starboard,
    "invites": invites,
    "lives": lives,
    "sticky": sticky,
    "birthdays": birthdays,
    "links": links,
    "autoclean": autoclean,
    "commands": commands,
    "modules": modules,
    "health": health,
    "botsettings": botsettings,
    "poll": poll,
    "rules": rules,
}


def main() -> int:
    force = "--force" in sys.argv
    made = []
    skipped = []
    for name, shape in SHAPE.items():
        target = OUT / f"hox_{name}.png"
        if target.exists() and not force:
            skipped.append(target.name)
            continue
        img, draw = canvas()
        shape(draw)
        save(img, name)
        made.append(target.name)
    print(f"émoticônes créées : {len(made)}" + (f" — {', '.join(made)}" if made else ""))
    if skipped:
        print(f"déjà présentes (utiliser --force pour redessiner) : {len(skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
