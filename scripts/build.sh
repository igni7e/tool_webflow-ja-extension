#!/usr/bin/env bash
# 配布用ZIPを作る。ストアに出すファイルはここで一元管理する。
set -euo pipefail
OUT="${1:-dist/webflow-ja-extension.zip}"
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
zip -r "$OUT" \
  manifest.json \
  utils.js \
  content.js \
  translation_terms.csv \
  options.html \
  options.js \
  popup.html \
  popup.js \
  popup.css \
  icon16.png \
  icon48.png \
  icon128.png
echo "built: $OUT"
