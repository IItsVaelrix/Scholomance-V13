#!/usr/bin/env bash
# Build a Mudlet .mpackage from the vaelrix directory
# Run this from inside the vaelrix folder or adjust paths.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

OUT_FILE="../vaelrix.mpackage"

echo "Creating Vaelrix .mpackage..."

# Clean previous
rm -f "$OUT_FILE"

# Create zip with the right structure.
# Mudlet expects the package files at the root of the archive.
zip -r "$OUT_FILE" . \
  -x "*.sh" \
  -x ".*" \
  -x "__MACOSX/*"

echo "Created: $OUT_FILE"
echo ""
echo "To install:"
echo "  1. In Mudlet: Packages → Install → select vaelrix.mpackage"
echo "  2. Make sure GMCP is enabled in your profile"
echo "  3. Reconnect"
echo ""
echo "For easiest editing, also load vaelrix.lua directly as a Script."