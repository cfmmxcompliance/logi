#!/bin/bash
# fetch_remaining.sh — Second pass to get docs beyond page 300 for large collections

TOKEN=$(gcloud auth print-access-token 2>/dev/null)
READ_TIME="2026-06-03T14:37:00Z"
OUTDIR="/Users/alex/Logimaster_CFMoto/firestore_recovery/page2"
mkdir -p "$OUTDIR"

# Only collections that returned exactly 300 (may have more)
declare -a BIG_COLS=("drivers" "cajas" "cfdi_invoices" "customs_clearance" "daily_changes" "equipment_tracking" "liberacionesCaja" "sellos" "shipping_schedules" "vessel_tracking" "xml_ci" "asignacion_cajas")

for COL in "${BIG_COLS[@]}"; do
  echo -n "Checking $COL for more docs... "
  
  # Get the page token from first page
  FIRST=$(cat "/Users/alex/Logimaster_CFMoto/firestore_recovery/${COL}.json")
  PAGE_TOKEN=$(echo "$FIRST" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('nextPageToken',''))" 2>/dev/null || echo "")
  
  if [ -z "$PAGE_TOKEN" ]; then
    echo "no more pages"
    continue
  fi

  ALL_EXTRA=()
  PAGE=2
  while [ -n "$PAGE_TOKEN" ]; do
    RESULT=$(curl -s "https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/${COL}?readTime=${READ_TIME}&pageSize=500&pageToken=${PAGE_TOKEN}" \
      -H "Authorization: Bearer $TOKEN")
    
    COUNT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('documents',[])))" 2>/dev/null || echo "0")
    echo "$RESULT" > "$OUTDIR/${COL}_page${PAGE}.json"
    echo "  page $PAGE: $COUNT docs"
    
    PAGE_TOKEN=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('nextPageToken',''))" 2>/dev/null || echo "")
    PAGE=$((PAGE + 1))
    
    if [ "$COUNT" = "0" ]; then break; fi
  done
done

echo ""
echo "=== EXTRA PAGES FETCHED ==="
ls -la "$OUTDIR/"
