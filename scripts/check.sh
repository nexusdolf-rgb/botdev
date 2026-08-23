#!/usr/bin/env bash
# ============================================================
# 🛡️ Vérification complète AVANT tout déploiement.
# Usage : bash scripts/check.sh
# 1. Syntaxe de tous les fichiers JS (serveur + dashboard + tests)
# 2. Recherche de secrets oubliés dans le code
# 3. Suite de tests complète
# Sortie 0 = feu vert. Toute autre valeur = NE PAS POUSSER.
# ============================================================
set -u
cd "$(dirname "$0")/.."
ERR=0

echo "── 1/3 Vérification de syntaxe ─────────────────"
while IFS= read -r f; do
  if ! node --check "$f" 2>/tmp/synerr; then
    echo "❌ Erreur de syntaxe : $f"; cat /tmp/synerr; ERR=1
  fi
done < <(find server public test scripts -name "*.js" -not -path "*/node_modules/*" 2>/dev/null)
[ $ERR -eq 0 ] && echo "✅ Syntaxe OK"

echo "── 2/3 Recherche de secrets en dur ─────────────"
if grep -rnIE "(ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_]{15,}" server public test --include="*.js" 2>/dev/null | grep -v "exemple" ; then
  echo "❌ SECRET DÉTECTÉ dans le code — à retirer avant de pousser !"; ERR=1
elif grep -rnIE "['\"][MN][A-Za-z0-9_-]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,}['\"]" server public test --include="*.js" 2>/dev/null ; then
  echo "❌ TOKEN DISCORD suspect détecté dans le code !"; ERR=1
else
  echo "✅ Aucun secret détecté"
fi

echo "── 3/3 Suite de tests complète ─────────────────"
if ! node test/run-all.js; then ERR=1; fi

echo
if [ $ERR -eq 0 ]; then
  echo "🟢 FEU VERT — tu peux pousser / déployer."
else
  echo "🔴 FEU ROUGE — corrige avant de pousser."
fi
exit $ERR
