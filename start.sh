#!/bin/bash
# Google Maps Leads - One Command
# Usage: ./start.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"
mkdir -p "$OUTPUT_DIR"

WINDOWS_DESKTOP="/mnt/c/Users/shree02/Desktop"
OUTPUT_DESKTOP="${WINDOWS_DESKTOP}"

export SKILL_DIR="$SCRIPT_DIR"

bash "$SCRIPT_DIR/scripts/run-local.sh" \
  --queries "$SCRIPT_DIR/temp-queries.txt" \
  --output-dir "$SCRIPT_DIR/temp-output" \
  --depth 1 \
  --format json \
  --skip-image-pull

if [ ! -f "$SCRIPT_DIR/temp-output/results.json" ]; then
  echo "ERROR: Scraper did not produce results.json"
  exit 1
fi

echo ""
echo "Enriching leads (website audit + contact extraction)..."
echo ""

OUTPUT_XLSX="$OUTPUT_DESKTOP/leads-${LIMIT}-${QUERY// /-}-${CITY// /-}-$(date +%Y%m%d)-merged.xlsx"

node -e "
import { runPipeline } from './pipeline.js';
(async () => {
  const result = await runPipeline({
    inputFile: '$SCRIPT_DIR/temp-output/results.json',
    query: '$QUERY',
    city: '$CITY',
    states: [{ code: '$STATE', name: 'State $STATE' }],
    limit: $LIMIT,
    outputFile: '$OUTPUT_XLSX',
  });
  console.log(JSON.stringify({ outputPath: result.outputPath, leadCount: result.leads.length }, null, 2));
})();
"

rm -rf "$SCRIPT_DIR/temp-queries.txt" "$SCRIPT_DIR/temp-output"

echo ""
echo "============================================"
echo "  DONE! Excel file on Desktop:"
echo "  $OUTPUT_XLSX"
echo "============================================"