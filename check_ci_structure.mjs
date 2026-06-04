import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
});
const db = getFirestore(app);

// Get 3 sample docs to understand structure
const snap = await getDocs(query(collection(db, "commercial_invoices"), limit(3)));

snap.docs.forEach((d, i) => {
  const data = d.data();
  const keys = Object.keys(data);
  console.log(`\n=== Doc ${i+1} ===`);
  console.log(`ID: ${d.id}`);
  console.log(`Fields (${keys.length}): ${keys.join(', ')}`);
  // Show key identifying fields
  const keyFields = ['invoice_no', 'INVOICE_NO', 'part_number', 'PART_NUMBER',
    'shipment_id', 'SHIPMENT_ID', 'po_number', 'PO_NUMBER', 'date', 'DATE',
    'quantity', 'QUANTITY', 'unit_price', 'UNIT_PRICE', 'description', 'DESCRIPTION'];
  keyFields.forEach(f => {
    if (data[f] !== undefined) console.log(`  ${f}: ${data[f]}`);
  });
});

process.exit(0);
