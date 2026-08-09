#!/usr/bin/env bash
set -euo pipefail
EXCEL_OUT="output/leads-$(date +%Y%m%d-%H%M%S).xlsx"

echo "Step 1: validating the scraper image..."
bash "$SCRIPT_DIR/scripts/ensure-latest.sh"

echo "Step 2: running crawl (20 city queries, depth 1)..."
bash "$SCRIPT_DIR/scripts/run-local.sh" \
  --queries "$QUERIES" \
  --output-dir "$OUTPUT_DIR" \
  --format json \
  --depth 1 \
  --skip-image-pull

echo "Step 3: enriching leads and exporting Excel..."
node "$SCRIPT_DIR/cli.js" \
  --input-file "$OUTPUT_DIR/results.json" \
  --limit 50 \
  --output "$EXCEL_OUT"

echo "DONE: $EXCEL_OUT"
