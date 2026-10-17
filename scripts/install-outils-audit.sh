#!/bin/sh
# ============================================================
#  apprets des outils de mesure du front
#  ------------------------------------------------------------
#  Les bancs (test/tools/audit-mobile.js et audit-mobile-interactions.js)
#  exigent un Node récent et un Chromium. Le sandbox perd ces outils à chaque
#  restauration de snapshot (node_modules/, ~/.cache/ms-playwright, /tmp sont
#  exclus des captures) : ce script les remet en place en une commande.
#
#    sh scripts/install-outils-audit.sh          # tout installer ce qui manque
#    sh scripts/install-outils-audit.sh --verif  # vérifier seulement
#
#  Rien n'est écrit hors de /home/user/.node24, /home/user/botdev-review/node_modules
#  et /tmp/libs. Le dépôt, lui, ne contient que ce script.
# ============================================================
set -e
RACINE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
HOME_NODE="$HOME/.node24"
LIBS=/tmp/libs
VERIF=0
[ "${1:-}" = "--verif" ] && VERIF=1

etape() { printf '\n\033[1m— %s\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
non() { printf '  \033[33m→\033[0m %s\n' "$1"; }

# ---------------------------------------------------------------- Node 24 ---
etape "Node 24 (jsdom et better-sqlite3 cassent sous Node 20)"
if [ -x "$HOME_NODE/bin/node" ]; then
  ok "$("$HOME_NODE/bin/node" --version) déjà en place"
elif [ "$VERIF" = 1 ]; then
  non "absent — lancez le script sans --verif"
else
  non "téléchargement de la dernière build linux-x64…"
  LST=$(curl -s https://nodejs.org/dist/latest-v24.x/)
  NOM=$(printf '%s' "$LST" | sed -n 's/.*\(node-v[0-9.]*-linux-x64\.tar\.xz\).*/\1/p' | head -1)
  [ -n "$NOM" ] || { echo "  ✗ nom d'archive introuvable (réseau ?)" >&2; exit 1; }
  curl -sS -o "/tmp/$NOM" "https://nodejs.org/dist/latest-v24.x/$NOM"
  mkdir -p "$HOME_NODE"
  tar -xJf "/tmp/$NOM" -C "$HOME_NODE" --strip-components=1
  rm -f "/tmp/$NOM"
  ok "$("$HOME_NODE/bin/node" --version) installé dans $HOME_NODE"
fi
PATH="$HOME_NODE/bin:$PATH"; export PATH

# --------------------------------------------------------------- paquets ---
etape "Dépendances du dépôt (jsdom, css-tree, better-sqlite3, playwright-core)"
if [ "$VERIF" = 1 ] || [ -d "$RACINE/node_modules/jsdom" ]; then
  ( cd "$RACINE" && node -e "require('jsdom'); require('playwright-core')" >/dev/null 2>&1 ) \
    && ok "node_modules en place pour $(node --version)" \
    || { [ "$VERIF" = 1 ] && non "incohérent avec ce Node" || { non "npm install…"; ( cd "$RACINE" && npm install --no-audit --no-fund >/dev/null 2>&1 ); ok "installé"; }; }
else
  non "npm install…"
  ( cd "$RACINE" && npm install --no-audit --no-fund >/dev/null 2>&1 )
  ok "installé"
fi

# --------------------------------------------- bibliothèques système de Chromium ---
etape "Bibliothèques système attendues par Chromium (extraites sans root)"
# Les paquets de Debian 13 ont pour la plupart pris le suffixe « t64 » : le nom
# simple n'existe plus, un « apt-get download libasound2 » échoue en silence et
# Chromium refusait de se lancer faute de libnspr4. On tente les deux noms.
PAQUETS="libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 libx11-6 libxext6 libxcb1 libexpat1 libuuid1 libgraphite2-3 libharfbuzz0b libfreetype6 libfontconfig1 libpng16-16"
if ls "$LIBS"/usr/lib/x86_64-linux-gnu/libnss3.so >/dev/null 2>&1; then
  ok "$LIBS déjà peuplée"
elif [ "$VERIF" = 1 ]; then
  non "absente"
else
  mkdir -p "$LIBS/pool"
  ( sudo -n apt-get update -qq || apt-get update -qq ) >/dev/null 2>&1 || true
  ( cd "$LIBS/pool" && for p in $PAQUETS; do
      t64=$(printf %s "$p" | sed 's/\([0-9][0-9]*\)$/\1t64/')
      for nom in "$p" "$p-t64" "$t64"; do
        if apt-get download "$nom" >/dev/null 2>&1; then break; fi
      done
    done ) || true
  DEBATS=$(ls "$LIBS"/pool/*.deb 2>/dev/null | wc -l)
  if [ "$DEBATS" -gt 0 ]; then
    for d in "$LIBS"/pool/*.deb; do dpkg -x "$d" "$LIBS" >/dev/null 2>&1 || true; done
    ok "$DEBATS paquets extraits dans $LIBS"
  else
    non "aucun .deb récupérable — les bancs tourneront sans Chromium (ils sortent avec le code 2)"
  fi
fi

# ------------------------------------------------------------- Chromium ---
etape "Navigateur de mesure (Chromium pour Playwright)"
if ls "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome >/dev/null 2>&1; then
  ok "Chromium déjà téléchargé"
elif [ "$VERIF" = 1 ]; then
  non "absent"
else
  non "npx playwright install chromium (~170 Mo)…"
  ( cd "$RACINE" && npx --yes playwright@1.64.0 install chromium >/dev/null 2>&1 ) \
    && ok "Chromium installé" || non "échec du téléchargement (réseau ?)"
fi

# ------------------------------------------------------------- auto-test ---
etape "Test de bout en bout"
BIN=$(ls "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1 || true)
if [ -n "$BIN" ]; then
  LD_LIBRARY_PATH="$LIBS/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}" \
  node -e '
    const { chromium } = require("playwright-core");
    (async () => {
      const b = await chromium.launch({ executableName: "chrome", args: ["--no-sandbox"] });
      const p = await b.newPage({ viewport: { width: 360, height: 780 } });
      await p.setContent("<div style=\"width:123px;height:45px\"></div>");
      const r = await p.evaluate(() => { const d = document.querySelector("div").getBoundingClientRect(); return [d.width, d.height]; });
      await b.close();
      if (r[0] !== 123 || r[1] !== 45) { console.error("  ✗ mesure fausse : " + r); process.exit(1); }
      console.log("  \x1b[32m✓\x1b[0m Chromium mesure juste (123×45 retrouvé) — les bancs sont utilisables");
    })().catch((e) => { console.error("  ✗ Chromium ne démarre pas : " + String(e.message).slice(0, 90) + "\n    → exportez LD_LIBRARY_PATH=" + process.env.LD_LIBRARY_PATH); process.exit(3); });
  ' 2>&1 | tail -3
else
  non "pas de Chromium : les bancs afficheront « Chromium indisponible » et sortiront avec le code 2"
fi

printf '\n\033[1mPour mesurer :\033[0m\n'
printf '  source %s/../env24.sh  (ou : export PATH=%s/bin:$PATH)\n' "$0" "$HOME_NODE"
printf '  export LD_LIBRARY_PATH=%s/usr/lib/x86_64-linux-gnu\n' "$LIBS"
printf '  cd %s && node test/tools/audit-mobile.js 360 --tactile\n' "$RACINE"
