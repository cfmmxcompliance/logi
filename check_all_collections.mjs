import { initializeApp } from "firebase/app";
import { getFirestore, collection, getCountFromServer } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// All collections referenced in the app code
const COLLECTIONS = [
  // Auth / Users
  "users",
  // Logistics core
  "shipments", "pre_alerts", "parts", "commercial_invoices",
  "customs_clearance", "electronic_dossiers", "costs",
  "vessel_tracking", "equipment_tracking", "spare_parts_tracking",
  // Transport
  "carriers", "drivers", "cajas", "transport_lines",
  "asignacion_cajas", "liberacionesCaja", "liberacionesDock",
  "sellos", "vigilancia",
  // Catalogs
  "models", "suppliers", "pricing_matrix", "productos",
  "apendice10", "shipping_schedules",
  // Finance
  "fianzas", "cfdi_invoices", "xml_ci",
  // Ops
  "BPM", "counters", "logs", "daily_changes", "daily_reports",
  "data_stage_reports", "master_data_reports",
  "audit_subscriptions", "training_submissions",
  "system_metadata",
  // WMS
  "wms_vehicles", "wms_transfers",
  // Ventanas 53
  "demandasCarga53", "ventanasCarga53", "reservasVentanasCarga53",
  // Other
  "snapshots", "data_stage_drafts", "electronic_dossiers_v2",
  "logistics",
];

console.log("Checking all collections...\n");
const results = [];

for (const col of COLLECTIONS) {
  try {
    const snap = await getCountFromServer(collection(db, col));
    const count = snap.data().count;
    results.push({ col, count, status: count > 0 ? "✅" : "⚠️ VACÍA" });
  } catch (e) {
    results.push({ col, count: 0, status: "❌ ERROR: " + e.code });
  }
}

// Print results
let empty = 0;
for (const r of results) {
  const pad = r.col.padEnd(32);
  console.log(`${r.status.padEnd(5)} ${pad} ${r.count} docs`);
  if (r.count === 0) empty++;
}

console.log(`\n--- SUMMARY ---`);
console.log(`Total colecciones: ${results.length}`);
console.log(`Con datos: ${results.length - empty}`);
console.log(`Vacías: ${empty}`);
process.exit(0);
