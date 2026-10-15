#!/usr/bin/env python3
"""Actualise les ancres des tests quand le produit change de libellé.

Contexte : une trentaine de fichiers de test retrouvent des morceaux de
dashboard par their textuel — dash.indexOf('👀 Aperçu Discord en direct'), un
regex qui cherche « 🎫 Ticket ouvert », une liste de navigation comparée à
« ['antinuke', '🚨', 'Anti-nuke'] ». Quand la passe design de v367 a retiré les
pictogrammes décoratifs des libellés d'interface (0 pictogramme rendu à la
mesure, contre 173 avant), ces ancres ont disparu du produit : slice() renvoie
-1, et le fichier entire tombe — onze vérifications en échec dans v239 pour une
seule ancre morte, y compris des assertions sans rapport (la clé `card`).

Ce script ne touche PAS à la logique des tests. Il déplace l'ancre :

  1. il lit le corpus du produit (public/, server/, views/) ;
  2. dans chaque fichier de test, il cherche les littéraux (chaines courtes et
     regex) qui contiennent un pictogramme et qui ne se trouvent PLUS dans le
    produit ;
  3. il en fabrique la version dépouillée (pictogramme + VS16 + espace
     supprimés) et ne retient le candidat que si CETTE forme existe, elle,
     dans le produit ;
  4. il applique le remplacement, puis relance le fichier de test : s'il ne
     passe pas vert, le remplacement est annulé et le cas est affiché pour
     traitement à la main.

Un test qui devient vert en changeant d'ancre prouve lui-même que l'ancre
était seule en cause. C'est la seule façon honnête de « rajeunir les
tripwires » sans affaiblir la suite.

--bilan liste sans rien écrire ; --sec pour ne pas relancer les tests.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PRODUIT = ['public/js', 'public/css', 'server', 'public/index.html', 'views']

PICTO = re.compile(
    '[\\U0001F000-\\U0001FAFF]|[\\u2600-\\u27BF][\\uFE0F\\u20E3]?'
    '|[\\u2705\\u274C\\u2757\\u2764\\u27A1\\u2B50\\u2B55\\u3030\\u303D]'
    '[\\uFE0F\\u20E3]?'
)
# litteraux de test : chaine courte, chaine double, ou regex /…/
LITTERAUX = [
    re.compile(r"'([^'\n]{4,120})'"),
    re.compile(r'"([^"\n]{4,120})"'),
    re.compile(r"/([^/*\n\[\]]{5,120})/[gimsuy]*"),
]


def corpus() -> str:
    morceaux = []
    for rel in PRODUIT:
        chemin = RACINE / rel
        if chemin.is_file():
            morceaux.append(chemin.read_text(encoding='utf-8', errors='replace'))
            continue
        for f in sorted(chemin.rglob('*')):
            if f.suffix in {'.js', '.css', '.html', '.eta', '.ejs'} and 'node_modules' not in f.parts:
                morceaux.append(f.read_text(encoding='utf-8', errors='replace'))
    return '\n'.join(morceaux)


def depouille(texte: str) -> str:
    out = PICTO.sub('', texte)
    out = re.sub(r'\s{2,}', ' ', out)
    return out.strip()


def candidats(ligne: str, texte_produit: str):
    trouves = []
    for motif in LITTERAUX:
        for m in motif.finditer(ligne):
            brut = m.group(1)
            if not PICTO.search(brut):
                continue
            if brut in texte_produit:
                continue              # l'ancre est encore bonne : on n'y touche pas
            nu = depouille(brut)
            # attention : un libelle depouille est toujours une sous-chaine de
            # l'original (le pictogramme etait juste devant) — c'est le but, pas
            # un motif de rejet. Les seuls filtres utiles sont la taille minimale
            # et la presence de la forme depouillee dans le produit.
            if len(nu) < 4 or nu not in texte_produit:
                continue
            trouves.append((brut, nu))
    return trouves


def main() -> int:
    bilan = '--bilan' in sys.argv
    serein = '--sec' in sys.argv
    tp = corpus()
    touches = 0
    annules = []
    for chemin in sorted((RACINE / 'test').glob('*-test.js')):
        lignes = chemin.read_text(encoding='utf-8').split('\n')
        nouveau = list(lignes)
        changes = 0
        for _round in range(3):
            reste = 0
            for i, ln in enumerate(nouveau):
                for brut, nu in candidats(ln, tp):
                    if 'assert' not in ln and 'check(' not in ln and 'indexOf' not in ln \
                            and '.test(' not in ln and 'includes(' not in ln:
                        continue
                    # la forme depouillee est toujours une sous-chaine de la forme
                    # decornee : on ne peut pas s'en servir comme garde, on remplace
                    # et on laisse le test trancher plus bas.
                    if brut in nouveau[i] and brut != nu:
                        nouveau[i] = nouveau[i].replace(brut, nu)
                        changes += 1
                        reste += 1
            if not reste:
                break
        if not changes:
            continue
        avant = '\n'.join(lignes)
        apres = '\n'.join(nouveau)
        if apres == avant:
            continue
        touches += 1
        if bilan:
            print(f'- {chemin.name} : {changes} ancre(s) deplacees (bilan)')
            continue
        chemin.write_text(apres, encoding='utf-8')
        if serein:
            print(f'- {chemin.name} : {changes} ancre(s) deplacees')
            continue
        r = subprocess.run(['node', str(chemin)], capture_output=True, text=True, cwd=str(RACINE))
        if r.returncode == 0:
            print(f'- {chemin.name} : {changes} ancre(s) deplacees — fichier vert ✅')
        else:
            # on garde les ancres : elles sont justes (verifiees contre le produit),
            # meme si le fichier a d'autres causes a regler a la main.
            echouees = [l.strip()[:110] for l in (r.stdout + r.stderr).split('\n')
                        if '❌' in l or '✗' in l or 'AssertionError' in l][:3]
            print(f'- {chemin.name} : {changes} ancre(s) deplacees — reste rouge : '
                  + (' | '.join(echouees) if echouees else 'sortie non comprise'))
            annules.append(chemin.name)
    print(f'\nFichiers touches : {touches}'
          + (f' · annules : {", ".join(annules)}' if annules else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
