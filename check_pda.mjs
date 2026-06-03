import { initializeApp } from "firebase/app";
import { getFirestore, collection, getCountFromServer, getDocs, limit, query } from "firebase/firestore";

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

// PDA-specific collections
const cols = ["wms_vehicles", "wms_transfers", "users", "liberacionesCaja", "liberacionesDock", "sellos", "asignacion_cajas", "vigilancia"];

for (const col of cols) {
  const snap = await getCountFromServer(collection(db, col));
  console.log(`${col.padEnd(25)} ${snap.data().count} docs`);
}

// Show sample wms_vehicles
console.log("\n--- wms_vehicles (muestra) ---");
const vSnap = await getDocs(query(collection(db, "wms_vehicles"), limit(5)));
vSnap.forEach(d => console.log(` VIN: ${d.data().vin || d.id} | station: ${d.data().currentStation || '?'} | qa: ${d.data().qa_cleared}`));

process.exit(0);
