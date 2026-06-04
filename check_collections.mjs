import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
});
const db = getFirestore(app);

const cols = [
  'commercial_invoices','parts','shipments','vessel_tracking',
  'equipment_tracking','customs_clearance','pre_alerts','costs',
  'logs','logistics','suppliers','snapshots','data_stage_reports',
  'users','training_submissions','cfdi_invoices','system_metadata',
  'daily_changes','master_data_reports','xml_ci','spare_parts_tracking',
  'fianzas','wms_vehicles','wms_transfers','models','carriers',
  'drivers','cajas','transport_lines','pricing_matrix',
  'shipping_schedules','apendice10','asignacion_cajas','sellos',
  'liberacionesCaja','liberacionesDock','productos','BPM','counters',
  'demandasCarga53','ventanasCarga53','reservasVentanasCarga53',
  'daily_reports','vigilancia'
];

console.log('\n=== TAMAÑO DE COLECCIONES (docs) ===\n');
const results = [];
for (const col of cols) {
  try {
    const snap = await getDocs(collection(db, col));
    results.push({ col, count: snap.size });
  } catch { results.push({ col, count: -1 }); }
}
results.sort((a, b) => b.count - a.count);
results.forEach(({ col, count }) => {
  const label = count === -1 ? '(error)' : count.toLocaleString();
  const bar = count > 0 ? '█'.repeat(Math.min(30, Math.ceil(count/1000))) : '';
  console.log(`${String(label).padStart(8)}  ${col.padEnd(30)} ${bar}`);
});
process.exit(0);
