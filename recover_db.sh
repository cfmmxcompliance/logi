#!/bin/bash
TOKEN=$(gcloud auth print-access-token 2>/dev/null)
READ_TIME="2026-06-03T14:37:00Z"
OUTDIR="/Users/alex/Logimaster_CFMoto/firestore_recovery"
mkdir -p "$OUTDIR"

declare -a COLLECTIONS=("carriers" "drivers" "cajas" "transport_lines" "models" "suppliers" "pricing_matrix" "shipping_schedules" "equipment_tracking" "spare_parts_tracking" "vessel_tracking" "electronic_dossiers" "customs_clearance" "costs" "sellos" "liberacionesCaja" "asignacion_cajas" "BPM" "apendice10" "productos" "fianzas" "vigilancia" "shipments" "pre_alerts" "data_stage_reports" "counters" "audit_subscriptions" "training_submissions" "daily_changes" "master_data_reports" "xml_ci" "cfdi_invoices" "wms_vehicles" "wms_transfers")

for COL in "${COLLECTIONS[@]}"; do
  echo -n "Recovering $COL... "
  RESULT=$(curl -s "https://firestore.googleapis.com/v1/projects/logimaster-cfmoto/databases/(default)/documents/${COL}?readTime=${READ_TIME}&pageSize=500" \
    -H "Authorization: Bearer $TOKEN")
  COUNT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('documents',[])))" 2>/dev/null || echo "0")
  echo "$RESULT" > "$OUTDIR/${COL}.json"
  echo "$COUNT docs"
done

echo ""
echo "=== RECOVERY SUMMARY ==="
for f in "$OUTDIR"/*.json; do
  NAME=$(basename "$f" .json)
  COUNT=$(python3 -c "import json; d=json.load(open('$f')); print(len(d.get('documents',[])))" 2>/dev/null || echo "0")
  echo "$NAME: $COUNT docs"
done
