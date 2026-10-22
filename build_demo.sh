#!/bin/bash
# Rebuild the demo from the extracted asset pack.
#   1. bake world-space geometry with the official Spine runtime (offline only)
#   2. renormalise UVs from atlas pixels to each cut-out part
#   3. assert the result is renderable
set -e
cd "$(dirname "$0")"

SKEL=out/spine/103.skel
ATLAS=out/spine/103_skin1.atlas
OUT=demo/assets/baked.json

[ -f "$SKEL" ] || { echo "missing $SKEL — run extract_all.py first"; exit 1; }
[ -f "$ATLAS" ] || { echo "missing $ATLAS"; exit 1; }

(cd tooling && node bake.mjs "../$SKEL" "../$ATLAS" skin0 30 > "../$OUT")
(cd tooling && node fix_uv.mjs "../$OUT" "../$ATLAS" "../$OUT")

.venv/Scripts/python.exe check_baked.py
