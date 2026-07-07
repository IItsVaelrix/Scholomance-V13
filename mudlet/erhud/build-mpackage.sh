#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

OUT="../erhud.mpackage"
rm -f "$OUT"

echo "Packaging Erion ArcForge HUD..."

zip -r "$OUT" . \
  -x "*.sh" \
  -x ".*" \
  -x "__MACOSX/*" \
  -x "examples/*"

echo "Created $OUT"
echo "Install via Mudlet Package Manager."
