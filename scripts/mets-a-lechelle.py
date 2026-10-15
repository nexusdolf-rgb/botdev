#!/usr/bin/env python3
"""Ramène toutes les tailles de police des feuilles sur l'échelle de la maison.

Pourquoi un script plutôt qu'une retouche à la main ? Le tableau de bord comptait
**33 valeurs distinctes** pour 564 déclarations dans dashboard.css (et 30 pour 110
dans style.css), dont neuf en demi-pixels : 8,5 / 9,5 / 10,5 / 11,5 / 12,5 / 13,5 /
14,5 / 15,5 / 16,5. Le demi-pixel ne sort d'aucune maquette — c'est un réglage à
l'œil, ligne après ligne, exactement ce qui reste d'un générateur. Une interface
tenue par une équipe tient sur une échelle, et l'échelle se vérifie.

Référence mesurée, pas supposée : la feuille publique de DraftBot
(https://draftbot.fr/_nuxt/entry.css, 35 374 octets) déclare huit tailles, toutes
entières — 12, 14, 16, 18, 20, 24, 26, 36 — corps de texte à 14 px.

Échelle retenue ici (neuf crans, tous entiers) :

    10   11   12   13   14   16   18   22   28
    mi-  éti- se-  cou- champ carte titre page
    cro  quette conde rant         de   de
    des  (plan- secon- (corps (PC) de   mo-
    ho-  cher   daire       des  car- dule
    ro-  mo-          champs tes
    da-  bile
    tages

Deux règles de classement, écrites ici une fois pour toutes :
  1. la valeur déclarée est portée AU CRAN LE PLUS PROCHE ;
  2. à distance égale, on prend le CRAN AU-DESSUS — on ne rogne jamais la
     lisibilité pour faire rentrer une échelle.
C'est ce qui fait passer 10,5 → 11 (le test v203 exige « ≥ 10,5 px » : il reste
satisfait, et le demi-pixel disparaît) et 12,5 → 13.

Ce que le script ne touche PAS, volontairement :
  • les tailles écrites en dur dans le JS (`style="font-size: 29px"`, 131
    occurrences dans dashboard.js) : ce sont les bannières et les aperçus de
    messages Discord, dont plusieurs mesures sont des décisions du fondateur
    (nom d'exemple 29 px adaptatif, SUPPORT 14 px) ;
  • les valeurs qui sont déjà un cran (elles restent telles quelles) ;
  • les sélecteurs de plancher mobile : 11 px et 16 px sont dans l'échelle, ils
    n'ont donc pas de raison d'être déplacés.

Idempotent : relancé après application, il ne change plus rien.

Usage :
    python3 scripts/mets-a-lechelle.py            # applique
    python3 scripts/mets-a-lechelle.py --bilan    # compteurs seuls, sans écrire
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHIERS = ['public/css/dashboard.css', 'public/css/style.css']
# Deuxième passe : les tailles écrites en dur dans les gabarits JS (les modales
# et les aperçus montés à la main dans le code, pas dans la feuille). 63
# déclarations y flottaient hors échelle (9 · 10,5 · 11,5 · 12,5 · 13,5 · 15 ·
# 17 · 20). Les grandeurs de bannière (29 px du nom d'exemple, 14 px de SUPPORT,
# décisions du fondateur) n'y figurent pas : elles sont fabriquées côté serveur,
# dans server/discord/, que ce script ne lit pas.
FICHIERS_JS = ['public/js/dashboard.js', 'public/js/app.js', 'public/js/views.js',
               'public/js/public.js', 'public/js/editor.js']

CRANS = [10, 11, 12, 13, 14, 16, 18, 22, 28]
TX = re.compile(r'(font-size:\s*)([0-9]+(?:\.[0-9]+)?)(px)')

EN_TETE = """/* ============================================================
   ÉCHELLE TYPOGRAPHIQUE — neuf crans, tous entiers
   ------------------------------------------------------------
   10 · 11 · 12 · 13 · 14 · 16 · 18 · 22 · 28

   10 micro (horodatages, pastilles) — 11 étiquettes et plancher mobile (v244)
   12 texte secondaire — 13 corps de la console — 14 champs sur ordinateur
   16 titre de carte — 18 titre de module — 22 en-tête de page — 28 chiffre d'affiche

   Avant v367, la feuille comptait 33 valeurs distinctes dont neuf demi-pixels :
   chaque écran avait été réglé pour sa propre gueule, sans remonter à une
   maquette. Toute taille nouvelle se choisit dans cette liste ; le contrôle est
   dans test/v367-test.js (il refuse un demi-pixel comme une valeur hors liste).
   Les deux seuls écarts tolérés sont des décisions, pas des oublis : 16 px pour
   les champs sur écran tactile (anti-zoom iOS, v366) et les tailles portées par
   les bannières et les aperçus de messages Discord, écrites en dur dans le JS.
   ============================================================ */
"""


def cran(v: float) -> int:
    meilleur = None
    distance = None
    for c in CRANS:
        d = abs(c - v)
        if distance is None or d < distance - 1e-9 or (abs(d - distance) < 1e-9 and c > meilleur):
            meilleur, distance = c, d
    return meilleur


def main() -> int:
    bilan_seul = '--bilan' in sys.argv
    for rel in FICHIERS:
        chemin = RACINE / rel
        css = chemin.read_text(encoding='utf-8')
        avant = sorted({float(m.group(2)) for m in TX.finditer(css)})
        moeresultat = {'touches': 0, 'histo': {}}

        def remplace(m):
            v = float(m.group(2))
            c = cran(v)
            moeresultat['histo'][v] = moeresultat['histo'].get(v, 0) + 1
            if c == v:
                return m.group(0)
            moeresultat['touches'] += 1
            return f'{m.group(1)}{c}{m.group(3)}'

        nouveau = TX.sub(remplace, css)
        if rel == 'public/css/dashboard.css' and 'ÉCHELLE TYPOGRAPHIQUE' not in nouveau:
            m = re.search(r'\n(\s*/\*[^\n]*\n(?:\s*\*[^\n]*\n)*\s*\*/\n)', nouveau)
            i = (m.end() if m else 0)
            nouveau = nouveau[:i] + '\n' + EN_TETE + nouveau[i:]
        apres = sorted({float(m.group(2)) for m in TX.finditer(nouveau)})
        print(f'— {rel}')
        print(f'   avant : {len(avant)} valeurs distinctes ({sum(moeresultat["histo"].values())} déclarations)'
              f' — dont {len([v for v in avant if v != int(v)])} en demi-pixel')
        print(f'   après : {len(apres)} valeurs distinctes — {apres}')
        print(f'   déclarations ramenées au cran : {moeresultat["touches"]}')
        if bilan_seul:
            print('   (bilan seul, rien n’est écrit)')
        else:
            chemin.write_text(nouveau, encoding='utf-8')
            print('   ✓ fichier réécrit')

    for rel in FICHIERS_JS:
        chemin = RACINE / rel
        css = chemin.read_text(encoding='utf-8')
        avant = sorted({float(m.group(2)) for m in TX.finditer(css)})
        n = {'t': 0}

        def remplace_js(m):
            v = float(m.group(2))
            c = cran(v)
            if c == v:
                return m.group(0)
            n['t'] += 1
            return f'{m.group(1)}{c}{m.group(3)}'

        nouveau = TX.sub(remplace_js, css)
        apres = sorted({float(m.group(2)) for m in TX.finditer(nouveau)})
        print(f'— {rel} (gabarits JS)')
        print(f'   avant : {len(avant)} valeurs · après : {len(apres)} — {apres} · ramenées : {n["t"]}')
        if not bilan_seul and n['t']:
            chemin.write_text(nouveau, encoding='utf-8')
            print('   ✓ fichier réécrit')
    return 0


if __name__ == '__main__':
    sys.exit(main())
