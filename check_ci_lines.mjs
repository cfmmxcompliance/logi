import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
});
const db = getFirestore(app);

console.log("Cargando commercial_invoices (puede tardar)...");
const snap = await getDocs(collection(db, "commercial_invoices"));
console.log(`Total docs: ${snap.size}`);

// Group by invoiceNo
const byInvoice = new Map();
snap.docs.forEach(d => {
  const inv = d.data().invoiceNo || d.data().INVOICE_NO || 'SIN_NUMERO';
  byInvoice.set(inv, (byInvoice.get(inv) || 0) + 1);
});

const counts = [...byInvoice.values()].sort((a, b) => b - a);
const max    = counts[0];
const min    = counts[counts.length - 1];
const avg    = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);
const top10  = [...byInvoice.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log(`\n=== ANÁLISIS POR FACTURA ===`);
console.log(`Facturas únicas:     ${byInvoice.size}`);
console.log(`Líneas máximas:      ${max}`);
console.log(`Líneas mínimas:      ${min}`);
console.log(`Promedio por factura:${avg}`);
console.log(`\n=== TOP 10 FACTURAS CON MÁS LÍNEAS ===`);
top10.forEach(([inv, count]) => console.log(`  ${String(count).padStart(5)} líneas → ${inv}`));

// Distribution
const ranges = { '1-10': 0, '11-50': 0, '51-100': 0, '101-200': 0, '200+': 0 };
counts.forEach(c => {
  if (c <= 10) ranges['1-10']++;
  else if (c <= 50) ranges['11-50']++;
  else if (c <= 100) ranges['51-100']++;
  else if (c <= 200) ranges['101-200']++;
  else ranges['200+']++;
});
console.log(`\n=== DISTRIBUCIÓN ===`);
Object.entries(ranges).forEach(([r, n]) => console.log(`  ${r.padEnd(8)} líneas: ${n} facturas`));

process.exit(0);
