#!/usr/bin/env bash
# Contrôles locaux/CI avant déploiement. Aucune suppression générale dans /tmp.
set -u
cd "$(dirname "$0")/.."
ERR=0
SYNERR="$(mktemp)"
trap 'rm -f "$SYNERR"' EXIT

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
echo "── 1/5 Runtime Node.js ─────────────────────────"
if [[ "$node_major" != "24" ]]; then
  echo "❌ Node.js 24 requis (détecté : $(node --version 2>/dev/null || echo absent))."
  ERR=1
else
  echo "✅ $(node --version)"
fi

echo "── 2/5 Vérification de syntaxe ─────────────────"
syntax_failed=0
while IFS= read -r -d '' file; do
  if ! node --check "$file" 2>"$SYNERR"; then
    echo "❌ Erreur de syntaxe : $file"
    cat "$SYNERR"
    syntax_failed=1
  fi
done < <(find server public test scripts -type f -name '*.js' -not -path '*/node_modules/*' -print0 2>/dev/null)
if [[ "$syntax_failed" -eq 0 ]]; then echo "✅ Syntaxe OK"; else ERR=1; fi

echo "── 3/5 Recherche de secrets ────────────────────"
if ! node scripts/secret-scan.js; then ERR=1; fi

echo "── 4/5 Audit des dépendances ───────────────────"
if ! npm audit --audit-level=low; then ERR=1; fi

echo "── 5/5 Suite de tests complète ─────────────────"
if ! node test/run-all.js; then ERR=1; fi

echo
if [[ "$ERR" -eq 0 ]]; then
  echo "🟢 Contrôles locaux réussis. Vérifie ensuite la CI et la santé après déploiement."
else
  echo "🔴 Contrôles en échec — ne déploie pas avant correction."
fi
exit "$ERR"
