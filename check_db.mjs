import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

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

const cols = [
  'users','shipments','pre_alerts','parts','carriers','drivers',
  'cajas','transport_lines','models','suppliers','pricing_matrix',
  'shipping_schedules','equipment_tracking','spare_parts_tracking',
  'vessel_tracking','electronic_dossiers','customs_clearance',
  'commercial_invoices','costs','sellos','liberacionesCaja',
  'liberacionesDock','asignacion_cajas','BPM','apendice10',
  'productos','fianzas','vigilancia','logs','counters',
  'data_stage_reports','daily_reports','wms_vehicles','wms_transfers'
];

for (const col of cols) {
  const snap = await getDocs(query(collection(db, col), limit(1)));
  const status = snap.empty ? '❌ VACÍA/BORRADA' : `✅ OK (tiene datos)`;
  console.log(`${col.padEnd(30)} ${status}`);
}
process.exit(0);
