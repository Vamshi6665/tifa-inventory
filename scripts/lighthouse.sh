#!/usr/bin/env bash
# Regenerate Lighthouse reports against the production build (demo data).
# Usage: npm run build:demo && npx vite preview --mode demo --port 4173 & bash scripts/lighthouse.sh
set -euo pipefail
OUT=${OUT:-lighthouse-reports}
mkdir -p "$OUT"
for preset in mobile desktop; do
  for p in "login" "?as=admin" "inventory?as=admin" "count?as=staff" "reorder?as=admin" "orders?as=admin" "analytics?as=admin" "settings?as=admin"; do
    name=$(echo "$p" | sed 's/?as=[a-z]*//'); name=${name:-overview}
    flag=""; [ "$preset" = "desktop" ] && flag="--preset=desktop"
    npx lighthouse "http://localhost:4173/$p" $flag --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility,best-practices,seo --output=json --output=html \
      --output-path="$OUT/${preset}-${name}" --quiet
  done
done
echo "Reports in $OUT/"
