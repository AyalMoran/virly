#!/usr/bin/env bash
#
# build-docs.sh — (re)generate placeholders, then build the consolidated PDF.
#
# Consolidation order is fixed (matches the feature-area order in the brief):
#   index → auth → dashboard → transfers → transactions → ai-assistant
#         → layout-nav → shared-ui
#
# Default engine is WeasyPrint (CSS path: best for screenshots + tables, easiest
# install). If no PDF engine is present, the Markdown remains the deliverable and
# this script prints the install command and exits non-zero.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # docs/frontend
cd "$HERE"

FILES=(
  index.md
  areas/auth.md
  areas/dashboard.md
  areas/transfers.md
  areas/transactions.md
  areas/ai-assistant.md
  areas/layout-nav.md
  areas/shared-ui.md
)

OUT="frontend-components.pdf"

# 1) Refresh placeholder images so the PDF never has broken-image gaps.
if command -v convert >/dev/null 2>&1; then
  bash capture/make-placeholders.sh
else
  echo "WARN: ImageMagick 'convert' not found — skipping placeholder refresh." >&2
  echo "      (Existing images/*.png, if any, will still be used.)" >&2
fi

# 2) Build the PDF.
if ! command -v pandoc >/dev/null 2>&1; then
  cat >&2 <<'EOF'

PDF NOT BUILT: `pandoc` is not installed.
The Markdown files in docs/frontend/ are the deliverable as-is.

Install pandoc + a PDF engine, then re-run this script:
  pip install weasyprint               # the PDF engine (CSS path)
  # plus pandoc itself:
  #   Debian/Ubuntu: sudo apt-get install pandoc
  #   macOS:         brew install pandoc
  #   (or download:  https://github.com/jgm/pandoc/releases )
EOF
  exit 1
fi

if ! command -v weasyprint >/dev/null 2>&1; then
  cat >&2 <<'EOF'

PDF NOT BUILT: pandoc is present but the WeasyPrint engine is not installed.
Install it and re-run:
  pip install weasyprint

(Alternatively, switch --pdf-engine below to one you have installed, e.g.
 --pdf-engine=wkhtmltopdf, but WeasyPrint gives the best table/screenshot output.)
EOF
  exit 1
fi

echo "Building $OUT with pandoc + weasyprint ..."
# --resource-path lets the area files' "../images/..." refs resolve from here:
# the entry `areas` turns "../images/x.png" into "areas/../images/x.png".
pandoc "${FILES[@]}" \
  -o "$OUT" \
  --pdf-engine=weasyprint \
  -c style.css \
  --resource-path=".:areas" \
  --toc \
  --metadata title="Virly Frontend Component Reference"

echo "Built $HERE/$OUT"
