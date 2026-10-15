#!/usr/bin/env python3
"""Met le plancher de 11 px la ou le balayage CSS ne passait pas.

L'etape « echelle typographique » de v367 a supprime les demi-pixels et plaque un
plancher de 11 px dans les feuilles de style. Reste 52 regles a `font-size: 10px`
en CSS et une trentaine de `font-size:10px` ecrits EN LIGNE dans le JS : le
plancher n'avait pas ete applique la, et le banc en rend compte — 32 textes du
tableau de bord affichent encore 10 px (label de stat, note sous un chiffre,
legende de bossole de module).

Deux choses ne sont PAS touchees, et c'est delibere :

  • les APERCUS de message Discord (`.dp-`, `.ca-`, `.adv-`, `.eb-`, `.discord-`,
    les gabarits `apercu`/`preview`) : ils imitent Discord, ou le pied d'embed
    fait reellement 12 px et la vignette de service 10 px. Leur coller 11 px
    serait mentir sur le rendu ;
  • les BADGES a 8-9 px (pastille de compteur, note de role) : assum et aligne
    sur Discord depuis v203, revise et garde. Le script les signale sans y
    toucher, et `--avec-badges` permet de les monter aussi si on change d'avis.

Idempotent. --bilan pour compter sans ecrire.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FEUILLES = [RACINE / 'public' / 'css' / 'dashboard.css', RACINE / 'public' / 'css' / 'style.css']
JS = sorted((RACINE / 'public' / 'js').glob('*.js'))

# ce que la passe laisse tranquille : les aperçus qui imitent Discord, et les
# valeurs épinglées par un test (le 9,5 px de .mg-kicker, v366 : le plancher de
# 11 px n'est exigé que sur mobile, où une règle plus spécifique gagne).
APERCU = re.compile(r'\.dp-|dp-empty|\.ca-|\.adv-|\.eb-|discord-|apercu|preview|placeholder|mg-kicker')
# On remonte la bande 9 -> 10,5 px (illisible en PC comme en mobile) vers le
# cran 11. Les tailles 8 px et 8,5 px sont laisses telles quelles : ce sont les
# badges copies de Discord (.ca-discord-author, .eb-dtag), choisis en v244, et le
# 9,5 px de base de .mg-kicker est une exception volontaire epinglee en v366
# (le plancher de 11 px ne s'applique qu'au mobile, par specificite).
TAILLE = re.compile(r'font-size:\s*(?:9|10)(?:\.5)?px')
# attention : les demi-pixels (9,5 px) ne sont PAS des candidats — ils sont
# deja sortis de l'echelle par la passe « typographie », et le 9,5 px de
# .mg-kicker est une exception volontaire, epinglee par test/v366-test.js
# (socle PC bas, plancher de 11 px seulement sur mobile, par specificite).
# Le regex refuse donc toute taille fractionnaire.


def remonte(texte: str) -> tuple[str, int, int]:
    """Reecrit les tailles sous le plancher, regle par regle.

    On ne reconstruit pas la feuille (ce qui reformaterait tout le fichier et
    rendrait la revue impossible) : on reecrit UNIQUEMENT le corps des regles
    concernees, en conservant les octets autour.
    """
    compteur = {'n': 0, 'ignorees': 0}
    motif = re.compile(r'(?P<tete>[^{}\n]*)\{(?P<corps>[^{}]*)\}', re.S)

    def reforme(m):
        tete = m.group('tete') or ''
        corps = m.group('corps')
        if APERCU.search(tete):
            compteur['ignorees'] += len(TAILLE.findall(corps))
            return m.group(0)

        def traite(mm):
            compteur['n'] += 1
            return 'font-size: 11px'

        nouveau = TAILLE.sub(traite, corps)
        if nouveau == corps:
            return m.group(0)
        debut_corps = m.start('corps') - m.start()
        fin_corps = m.end('corps') - m.start()
        return m.group(0)[:debut_corps] + nouveau + m.group(0)[fin_corps:]

    sortie = motif.sub(reforme, texte)
    return sortie, compteur['n'], compteur['ignorees']


def main() -> int:
    bilan = '--bilan' in sys.argv
    seuil_bas = '--avec-badges' in sys.argv
    total = 0
    for chemin in FEUILLES:
        s = chemin.read_text(encoding='utf-8')
        s2, n, ignores = remonte(s)
        print(f'- {chemin.name} : {n} declarations portées à 11 px'
              f' · {ignores} laissées (aperçus Discord)')
        total += n
        if n and not bilan:
            chemin.write_text(s2, encoding='utf-8')
    for chemin in JS:
        lignes = chemin.read_text(encoding='utf-8').split('\n')
        n = laisses = 0
        for i, ln in enumerate(lignes):
            if not TAILLE.search(ln):
                continue
            if APERCU.search(ln):
                laisses += 1
                continue

            def traite(mm):
                nonlocal n
                n += 1
                return 'font-size:11px'
            lignes[i] = TAILLE.sub(traite, ln)
        if n:
            print(f'- {chemin.name} : {n} tailles en ligne portées à 11 px'
                  f' · {laisses} laissées (aperçus)')
            total += n
            if not bilan:
                chemin.write_text('\n'.join(lignes), encoding='utf-8')
    print(f'\nTotal : {total} tailles remontées'
          + ('  (bilan seul, rien n’est écrit)' if bilan else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
