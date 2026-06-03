import { initializeApp } from "firebase/app";
import { getFirestore, collection, getCountFromServer } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
});
const db = getFirestore(app);

const cols = [
  "parts","users","carriers","drivers","cajas","transport_lines","models",
  "asignacion_cajas","liberacionesCaja","sellos","shipments","pre_alerts",
  "customs_clearance","vessel_tracking","equipment_tracking","cfdi_invoices",
  "xml_ci","shipping_schedules","fianzas","wms_vehicles","wms_transfers"
];

let allOk = true;
for (const col of cols) {
  const count = (await getCountFromServer(collection(db, col))).data().count;
  const ok = count > 0 ? "✅" : "⚠️";
  if (count === 0) allOk = false;
  console.log(`${ok} ${col.padEnd(28)} ${count}`);
}
console.log(allOk ? "\n✅ Todo en orden." : "\n⚠️ Algunas colecciones vacías.");
process.exit(0);
