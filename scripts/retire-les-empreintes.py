#!/usr/bin/env python3
"""Retire les empreintes du generateur : les pictogrammes pris comme icones
d'INTERFACE, et rien d'autre.

La mesure (test/tools/audit-design-system.js, rendu reel, 1440 x 900, 11 modules)
trouvait 173 pictogrammes dans l'interface pour 6 seulement dans les apercus de
messages Discord — c'est-a-dire l'inverse de ce qu'il faudrait. Un tableau de bord
convenu n'illustre pas chaque bouton, chaque titre et chaque notification d'un
emoji : il employe des formes dessinees (le jeu App.glyphe, 22 tailles tracees a
la main, en currentColor) et des glyphes typographiques. Un emoji dans un MESSAGE
simule est en revanche realiste — Discord en est plein — donc conserve.

Le tri est fait par CONTEXTE, jamais par mot-cle :

 1. SEUL CONTENU D'UN ELEMENT   <button class="btn btn-icon">[picto]</button>
                                -> ${App.glyphe('corbeille', { taille: 16 })}
    (une icone mappee ; sans equivalent dans le jeu, la ligne est signalee et
    LAISSEE : mieux vaut un emoji que un bouton vide)
 2. EN TETE DE LIBELLE          <h3>[picto] Liez votre compte</h3> -> <h3>Liez…</h3>
    titres, boutons, champs de liste — la ou l'emoji faisait la décoration
 3. TOAST                       App.toast('[picto] Tout est enregistre !')
                                -> App.toast('Tout est enregistre.')
    (le point d'exclamation d'approbation saute aussi : un produit constate)
 4. CSS content: '…'            '.toast::before { content: '✅' }' -> '\\2713'
 5. COMMENTAIRES                '// [emoji] v364 — …' -> '// v364 — …'
    (ils ne s'affichent pas, mais ils se lisent en revue de code)

Ce que le script ne touche PAS, et c'est verifiable ligne par ligne :
  • le CONTENU Discord simule : les lignes qui parlent d'apercu, d'embed, de
    message, de banniere, de signature, de placeholder, ainsi que les blocs
    .dp-/.adv-/.ca-/.am-/.discord- ;
  • la metadonnee `e: '…'` de MODULE_META : c'est le REPLI affiche quand le PNG
    d'emoticone ne charge pas ;
  • les fleches (« Reglages → ») : ce ne sont pas des emojis, c'est de la
    ponctuation d'interface, et le banc les compte separement.

Un pictogramme n'est traite que s'il est « presentation emoji » : plage
U+1F000-U+1FAFF, ou symbole U+2600-U+27BF suivi du selecteur de presentation
U+FE0F, ou l'un des cas ou l'emoji est le seul glypheme possible (coche verte,
croix rouge, etoile…). Le check simple U+2713, la croix U+2715, le menu U+2630
et les fleches ne sont donc pas des cibles : ils sont deja typographiques.

Idempotent. --bilan pour ne rien ecrire, --detail pour tout afficher.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
JS = ['public/js/dashboard.js', 'public/js/app.js', 'public/js/public.js',
      'public/js/editor.js', 'public/js/views.js', 'public/index.html']
CSS = ['public/css/dashboard.css', 'public/css/style.css']

# Ce qu'on considere un pictogramme de decoratif : la plage emoji complete, plus
# les signes U+2600-U+27BF SAUF les marques typographiques legitimes (puces,
# losanges, coches de validation, cases de menu, fleches) - elles ont leur place
# dans une interface, un emoji dessine n'en a pas. La MEME definition sert au
# banc de mesure (test/tools/audit-design-system.js) : un seul arbitre.
GARDE_TYPO = "·•‣▪▫●○◆◇■□✓✔✕✖☰☱☲☳⌂⌃⌄⌅←→↑↓↻↺⇄⇆"
PICTO = (
    '(?:[\\U0001F000-\\U0001FAFF]'
    '|(?![' + GARDE_TYPO + '])[\\u2600-\\u27BF])'
)
UN_PICTO = PICTO + '(?:\\u200D' + PICTO + ')*'          # touches ZWJ (familles, drapeaux)
PICTO_SEUL = re.compile(r'^\s*(?:' + UN_PICTO + r'\s*)+$')

# Ce qui fait du CONTENU et non de l'habillage : on n'y touche pas.
CONTENU = re.compile(
    # ce qui fait du CONTENU (un message Discord simule, un champ de modele) et
    # non de l'habillage de notre interface : on n'y touche pas.
    r"(\.dp-|dp-empty|discord-|\.adv-|\.ca-|HOX_|data-fb-text|\bapercu|\.eb-|preview|E\(serverName\)|\bvignette\b|"
    r"|placeholder|\bemote:|\be:\s*['\"]|\bemoji:|\bicon:)"
)

# Pictogramme -> glyphe du jeu App.GLYPHES. Les cls sont de vrais
# caractres Unicode : une suite dchappement Python ne matche jamais un emoji.
MAPPE = {
    '♛': 'couronne',
    '🗑': 'corbeille',
    '⚠': 'alerte',
    '✅': 'coche',
    '❌': 'croix',
    '⚡': 'eclair',
    '🔍': 'recherche',
    '🔎': 'recherche',
    '🌓': 'theme',
    '🧠': 'cerveau',
    '📭': 'boite',
    '🤖': 'robot',
    '🔗': 'lien',
    '👑': 'couronne',
    '✨': 'etincelle',
    '🎧': 'casque',
    '🛡': 'bouclier',
    '💬': 'bulle',
    '🔒': 'cadenas',
    '⚙': 'reglages',
    '🎫': 'ticket',
    '🎟': 'ticket',
    '🕐': 'horloge',
    '⏱': 'horloge',
    '🕑': 'horloge',
    '🛠': 'reglages',
    '🔧': 'reglages',
    '📋': 'presse',
    '🧾': 'presse',
    '📈': 'courbe',
    '🛒': 'panier',
    '📱': 'telephone',
    '🎓': 'diplome',
    '🔊': 'son',
    '📅': 'calendrier',
    '💰': 'billets',
    '💡': 'ampoule',
    '⭐': 'etoile',
    '📁': 'dossier',
    '🗂': 'dossier',
    '👤': 'personne',
    '🪙': 'piece',
    '🚫': 'interdit',
    '🔠': 'lettres',
    '🔡': 'lettres',
    '🔤': 'lettres',
    '☁': 'nuage',
    '🧩': 'morceau',
    '🎂': 'calendrier',
    '🎭': 'etiquette',
    '👋': 'porte',
    '🎣': 'hamecon',
    '🎨': 'palette',
    '👥': 'personnes',
    '🚀': 'fusee',
    '🔄': 'rafraichir',
    '📣': 'megaphone',
    '📢': 'megaphone',
    '💥': 'impact',
    '🖼': 'image',
    '📝': 'crayon',
    '✏': 'crayon',
    '📨': 'boite',
    '🔕': 'cadenas',
    '🔓': 'cadenas',
    '🔏': 'cadenas',
    '🔐': 'cadenas',
    '🎉': 'etincelle',
    '🔪': 'robot',
    '🛑': 'interdit',
}


TX_SEUL = re.compile(r'(<(button|span|a|div|td|i|b)([^>]*)>)\s*(' + UN_PICTO + r')\s*(</\2>)')
# n'importe quel element de texte d'interface : le pictogramme de decoratif
# s'accroche partout (h3, label, option, div.lbl, span, p…). La liste complete
# coute un faux positif a verifier et fait gagner 40 passages manuels.
BALISE = r'h[1-4]|b|i|em|strong|small|summary|legend|span|div|p|li|label|option|td|th|button|a'
TX_TETE = re.compile(r'(<(' + BALISE + r')([^>]*)>)\s*(?:' + UN_PICTO + r'[\uFE0F\u20E3]?\s*)+')
TX_FIN = re.compile(r'((?:' + UN_PICTO + r'[\uFE0F\u20E3]?\s*)+)\s*(</(?:' + BALISE + r')>)')
Q = '([' + chr(34) + chr(39) + chr(96) + '])'   # les trois delimiteurs de chaine JS : le
# guillemet simple etait oublie, ce qui rendait la regle 6 muette sur pres de toutes les chaines
TXT_SET = re.compile(r'((?:textContent|innerText)\s*=\s*)' + Q + r'\s*(?:' + UN_PICTO + r'[\uFE0F\u20E3]?\s*)+')
# une chaine litterale qui S'OUVRE sur un pictogramme : « '⚠️ ' + e.message »,
# « `☁️ ${count} règle(s)` », « Dashboard.card(r, '📣 Annonce…', …) ».
TX_CHAINE = re.compile(Q + r'\s*(?:' + UN_PICTO + r'[\uFE0F\u20E3]?\s*)+')
LIGNE_DEBUTE = re.compile(r'^(\s*)' + UN_PICTO + r'[\uFE0F\u20E3]?\s*')
TX_ICONE_REGLE = re.compile(r'\s*<span class="(?:am-rule-icon|am-native-icon)">[^<]*</span>')
TX_TOAST_LEAD = re.compile(r"(App\.toast\(\s*['`])(?:" + UN_PICTO + r"\s*)+")
TX_TOAST_BANG = re.compile(r"(App\.toast\(\s*['`][^'`\n]*?)\s*!(?=\s*['`])")
TX_COM_EMPRISE = re.compile(r'^(\s*(?://|\*|/\*)\s*)' + UN_PICTO + r'[️]?\s*')
CONTENU_CSS = {
    "'✅'": "'\\2713'", "'❌'": "'\\2717'", "'⚠️'": "'!'", "'⚠'": "'!'",
}


def charge_glyphes() -> dict:
    """Relit App.GLYPHES dans public/js/app.js : le script et le navigateur
    doivent dessiner exactement le meme trait, un seul endroit le definit."""
    texte = (RACINE / 'public/js/app.js').read_text(encoding='utf-8')
    debut = texte.index('App.GLYPHES = {')
    fin = texte.index('\n    };', debut)
    corps = texte[debut:fin]
    out = {}
    for cle, trac in re.findall(r"^\s*([a-z0-9_]+):\s*'(.*)',?\s*$", corps, re.M):
        if cle != 'App':
            out[cle] = trac
    return out


GLYPHES = charge_glyphes()


def svg_brut(nom: str, taille: int) -> str:
    """Le meme balisage que App.glyphe(), en clair : utile dans les chaines
    simples, ou ${...} n'a aucun sens."""
    attributs = f'class="ico-svg" viewBox="0 0 24 24" width="{taille}" height="{taille}" aria-hidden="true"'
    return f'<svg {attributs}>{GLYPHES[nom]}</svg>'


def is_contenu(ligne: str) -> bool:
    return bool(CONTENU.search(ligne))


def traite(ligne: str, journal: list, rel: str, n: int) -> str:
    nu = ligne

    # — 5. commentaires —————————————————————————————————————————————
    if nu.lstrip().startswith(('//', '*', '/*')):
        nu = TX_COM_EMPRISE.sub(r'\1', nu)
        return nu

    # — 3. toasts ————————————————————————————————————————————————————
    if 'App.toast(' in nu:
        nu = TX_TOAST_LEAD.sub(r'\1', nu)
        nu = TX_TOAST_BANG.sub(r'\1.', nu)

    if is_contenu(nu):
        return nu      # contenu Discord simule : l'emoji y est du texte

    # la pastille d'amorce des regles d'auto-mod ne porte QUE l'emoji : on la
    # retire entierement (le titre de la regle suffit, c'est ce que fait le
    # panneau natif de Discord). A faire avant la rege 1, sinon l'element se
    # retrouve vide et remplace par un glyphe sans objet.
    nu = TX_ICONE_REGLE.sub('', nu)

    # — 1. pictogramme seul dans un element : on le remplace par un glyphe —
    def remplace_seul(m):
        emoji = m.group(4)
        nom = MAPPE.get(emoji) or MAPPE.get(emoji.replace('\uFE0F', ''))
        if not nom:
            journal.append((rel, n, "supprime (pas d'equivalent)", emoji, m.group(0)[:70]))
            return ''        # element vid: mieux vaut le retirer que laisser un trou
        # la taille du glyphe reprend celle de l'element qu'il remplace, sinon
        # l'icone flotte dans une pastille prevue pour 20 px.
        attributs = m.group(3) or ''
        inline = re.search(r'font-size:\s*(\d+)px', attributs)
        if inline:
            taille = int(inline.group(1))
        elif 'big' in attributs:
            taille = 26
        elif re.search(r'(f-ico|hp-pillar-ico|ov-stat-icon|ov-module-icon|am-shield-icon|img-fb)', attributs):
            taille = 20
        elif 'am-rule-icon' in attributs or 'am-native-icon' in attributs:
            taille = 18
        else:
            taille = 16
        if '`' in nu or '`' in ligne:
            interieur = '${' + f"App.glyphe('{nom}', {{ taille: {taille} }})" + '}'
        elif 'class="' in ligne or 'style="' in ligne:
            # chaine JS en quotes simples (les attributs HTML y sont en double) :
            # le balisage en clair s'y glisse sans echappement.
            interieur = svg_brut(nom, taille)
        elif 'class=\\"' in ligne:
            interieur = svg_brut(nom, taille).replace('"', '\\"')
        else:
            journal.append((rel, n, 'delimiteur non reconnu', emoji, m.group(0)[:70]))
            return m.group(0)
        return m.group(1) + interieur + m.group(5)

    nu = TX_SEUL.sub(remplace_seul, nu)

    # — 2. pictogramme en tete ou en queue d'un libelle -----------------------
    # bannieres de commentaire du type «    🏆 HOXERA v2.0 — … » : une ligne qui
    # s'ouvre sur un pictogramme n'est jamais du contenu, c'est un titre de section.
    nu = LIGNE_DEBUTE.sub(r'\1', nu)
    nu = TX_TETE.sub(r'\1', nu)
    nu = TX_FIN.sub(r'\1', nu)
    nu = TXT_SET.sub(r'\1\2', nu)
    # — 6. chaine litterale qui s'ouvre sur un pictogramme -------------------
    nu = TX_CHAINE.sub(r'\1', nu)
    return nu


def main() -> int:
    bilan = '--bilan' in sys.argv
    detail = '--detail' in sys.argv
    n_total = 0
    non_couverts = []
    for rel in JS:
        chemin = RACINE / rel
        lignes = chemin.read_text(encoding='utf-8').split('\n')
        sorties = []
        touches = 0
        for i, ln in enumerate(lignes):
            if not re.search(UN_PICTO, ln):
                sorties.append(ln)
                continue
            nu = traite(ln, non_couverts, rel, i + 1)
            if nu != ln:
                touches += 1
            sorties.append(nu)
        print(f'- {rel} : {touches} lignes corrigees')
        if detail:
            for a, b in zip(lignes, sorties):
                if a != b:
                    print(f'    - {a.strip()[:96]}\n    + {b.strip()[:96]}')
        n_total += touches
        if not bilan and touches:
            chemin.write_text('\n'.join(sorties), encoding='utf-8')

    for rel in CSS:
        chemin = RACINE / rel
        s = chemin.read_text(encoding='utf-8')
        s, k_titre = LIGNE_DEBUTE.subn(r'\1', s)
        n = k_titre
        for old, new in CONTENU_CSS.items():
            motif = re.compile(r'(content:\s*)' + re.escape(old))
            s, k = motif.subn(lambda m: m.group(1) + new, s)
            n += k
        motif = re.compile(r'(content:\s*)(["\'])(?:' + UN_PICTO + r')+\2')
        s, k = motif.subn(r"\1''", s)
        n += k
        motif_com = re.compile(r'^(\s*/?\*\s*)' + UN_PICTO + r'\s*', re.M)
        s, k = motif_com.subn(r'\1', s)
        n += k
        print(f'- {rel} : {n} reecritures')
        if not bilan and n:
            chemin.write_text(s, encoding='utf-8')

    if non_couverts:
        vus = set()
        print('\n  pictogrammes sans equivalent dans le jeu (laisses tels quels) :')
        for rel, n, why, emoji, extrait in non_couverts:
            cle = emoji
            if cle in vus:
                continue
            vus.add(cle)
            print(f'    {emoji}  ({rel}:{n}, {why}) {extrait[:60]}')
    print(f'\nTotal : {n_total} lignes corrigees' + (' — bilan seul, rien n’est écrit' if bilan else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
