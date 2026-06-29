#!/usr/bin/env bash
#
# make-placeholders.sh — generate placeholder screenshot PNGs.
#
# Scans the area markdown (and index.md) for image references of the form
#   ![alt](../images/<Component>--<state>.png)
# and renders one fixed-size placeholder PNG per referenced file, so the docs
# and PDF never show broken images. Re-running overwrites cleanly (idempotent).
#
# These are PLACEHOLDERS ONLY. Real screenshots come from the Storybook capture
# pipeline (see capture-screenshots.ts) and drop in at the same paths with no
# Markdown changes.
#
# Requires ImageMagick (`convert`). Output: 1440x900 (planned capture viewport).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # docs/frontend
IMAGES_DIR="$ROOT/images"
WIDTH=1440
HEIGHT=900

# Theme-ish colours pulled from the app (global.css).
BG="#e6eec9"
INK="#173d42"
ACCENT="#35858e"

if ! command -v convert >/dev/null 2>&1; then
  echo "ERROR: ImageMagick 'convert' not found. Install it, then re-run." >&2
  echo "  Debian/Ubuntu: sudo apt-get install imagemagick" >&2
  echo "  macOS:         brew install imagemagick" >&2
  exit 1
fi

mkdir -p "$IMAGES_DIR"

# Collect every referenced image filename (basename) from the docs, de-duped.
mapfile -t files < <(
  grep -rhoE '\.\./images/[A-Za-z0-9_.-]+\.png' "$ROOT"/areas/*.md "$ROOT"/index.md 2>/dev/null \
    | sed 's#\.\./images/##' \
    | sort -u
)

if [ "${#files[@]}" -eq 0 ]; then
  echo "No image references found under $ROOT. Nothing to do."
  exit 0
fi

count=0
for file in "${files[@]}"; do
  base="${file%.png}"
  name="${base%%--*}"
  state="${base#*--}"
  if [ "$state" = "$base" ]; then
    state="default"
  fi

  # Canvas is sized so the 6px frame brings the final image to exactly WIDTHxHEIGHT.
  convert -size "$((WIDTH - 12))x$((HEIGHT - 12))" "xc:${BG}" \
    -gravity North     -fill "$INK"    -pointsize 38 -annotate +0+110 "Virly · Frontend component" \
    -gravity Center    -fill "$INK"    -pointsize 66 -annotate +0-30  "$name" \
    -gravity Center    -fill "$ACCENT" -pointsize 40 -annotate +0+60  "state: $state" \
    -gravity South     -fill "$ACCENT" -pointsize 26 -annotate +0+90  "PLACEHOLDER — replace via Storybook capture (1440x900)" \
    -bordercolor "$ACCENT" -border 6 \
    "$IMAGES_DIR/$file"

  count=$((count + 1))
done

echo "Generated $count placeholder image(s) in $IMAGES_DIR"
