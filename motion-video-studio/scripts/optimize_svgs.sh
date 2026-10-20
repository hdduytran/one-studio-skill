#!/usr/bin/env bash
# Clean and minify SVGs with SVGO while keeping what animation code needs
# (viewBox, ids, separate paths, strokes). Outputs to <out-dir> (default: in place).
#
# Usage: optimize_svgs.sh <in-dir-or-file> [out-dir]
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IN="${1:?usage: optimize_svgs.sh <in> [out]}"
OUT="${2:-}"
CFG="$SKILL_DIR/assets/svgo.config.mjs"
SVGO="npx --yes svgo@4.1.0"

if [[ -d "$IN" ]]; then
  if [[ -n "$OUT" ]]; then mkdir -p "$OUT"; $SVGO --config "$CFG" -f "$IN" -o "$OUT"; else $SVGO --config "$CFG" -f "$IN"; fi
else
  if [[ -n "$OUT" ]]; then mkdir -p "$OUT"; $SVGO --config "$CFG" -i "$IN" -o "$OUT/$(basename "$IN")"; else $SVGO --config "$CFG" -i "$IN"; fi
fi
