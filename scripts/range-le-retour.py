#!/usr/bin/env python3
"""Cable le retour d'enregistrement sur les boutons qui sauvent.

Forme REELLE du code, relevee dans public/js/dashboard.js (47 appels PUT) :

      cm.querySelector('#tm-save').onclick = async () => {
        try {
          await App.api(`/bots/${bot.id}/tickets`, { method: 'PUT', body: {
            guild_id: guildId,
            menu_channel: …,
          }});
          App.toast('Ticket menu enregistre.');

Donc : le handler ne recoit meme pas l'evenement, et l'appel PUT s'etale sur
plusieurs lignes. Il etait impossible de cabler « le bouton confirme » sans
toucher a la signature — c'est ce que fait ce script :

  1. `async ()` -> `async (e)` (aucun de ces handlers n'utilisait d'autre
     argument ; la verification est faite ligne par ligne) ;
  2. `const bouton = e.currentTarget;` en entree de bloc — obligatoire, car
     currentTarget ne survit pas au premier await ;
  3. `App.retourEnregistrement(bouton);` juste avant le premier toast de succes
     du bloc (le toast d'erreur du catch n'est pas une confirmation).

Un bloc est ignore s'il ne contient pas de PUT, s'il a deja ete cable, ou si le
nom `bouton` est deja employe a l'interieur (pas d'ecrasement de variable).

Idempotent. --bilan pour lister sans ecrire, --large pour inclure POST/DELETE.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CIBLES = ['public/js/dashboard.js']

ENTREE = re.compile(r"^(\s*)(\w+)\.querySelector\('(?:#[\w-]+)'\)\.onclick = async \(\) => \{\s*$")
FERMETURE = re.compile(r"^\s*\};\s*$")
VERBES = {'PUT'}


def analyse(lignes, verbes):
    sortie = []
    n = 0
    rapports = []
    i = 0
    while i < len(lignes):
        ln = lignes[i]
        m = ENTREE.match(ln)
        if not m:
            sortie.append(ln)
            i += 1
            continue
        indent, hote = m.group(1), m.group(2)
        selecteur = re.search(r"querySelector\('(#[\w-]+)'\)", ln).group(1)
        # bornes du bloc
        debut = i + 1
        fin = debut
        while fin < len(lignes) and not FERMETURE.match(lignes[fin]):
            fin += 1
        bloc = lignes[debut:fin + 1]
        if any('App.retourEnregistrement(' in x for x in bloc):
            sortie.append(ln)
            i += 1
            continue
        if not any(f"method: '{v}'" in x for x in bloc for v in verbes) or any('const bouton' in x for x in bloc):
            sortie.append(ln)
            i += 1
            continue
        # premier toast de succes (ni 'error', ni dans un catch)
        visee = None
        dans_catch = False
        for k, x in enumerate(bloc):
            if re.search(r"\bcatch\b", x):
                dans_catch = True
            elif re.match(r'^\s*\}\s*$', x):
                dans_catch = False
            if re.match(r"^\s*App\.toast\(", x) and "'error'" not in x and not dans_catch:
                visee = debut + k
                break
        if visee is None:
            sortie.append(ln)
            i += 1
            continue
        # --- reecriture ------------------------------------------------------
        entree = f'{indent}{hote}.querySelector(\'{selecteur}\').onclick = async (e) => {{'
        corps = [entree, f'{indent}  const bouton = e.currentTarget;']
        for k, x in enumerate(bloc):
            j = debut + k
            if j == visee:
                tab = re.match(r'\s*', x).group(0)
                corps.append(f'{tab}App.retourEnregistrement(bouton);')
            if k == 0 and re.match(r'^\s*try \{\s*$', x):
                corps.append(x)
                continue
            corps.append(x)
        sortie.extend(corps)
        rapports.append((selecteur, visee + 1, len(bloc)))
        n += 1
        i = fin + 1
    return sortie, n, rapports


def main() -> int:
    bilan = '--bilan' in sys.argv
    verbes = VERBES | ({'POST', 'DELETE'} if '--large' in sys.argv else set())
    total = 0
    for rel in CIBLES:
        chemin = RACINE / rel
        lignes = chemin.read_text(encoding='utf-8').split('\n')
        sortie, n, rapports = analyse(lignes, verbes)
        print(f'- {rel} : {n} gestionnaires cablés')
        for selecteur, ligne, taille in rapports:
            print(f'    {selecteur:<26} toast a la ligne {ligne} (bloc de {taille} lignes)')
        total += n
        if not bilan and sortie != lignes:
            chemin.write_text('\n'.join(sortie), encoding='utf-8')
    print(f'\nTotal : {total}' + ('  (bilan seul, rien n’est écrit)' if bilan else ''))
    if not bilan:
        print('Verifiez : node --check public/js/dashboard.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())
