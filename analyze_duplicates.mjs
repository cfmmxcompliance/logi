import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";

const app = initializeApp({
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  projectId: "logimaster-cfmoto",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
});
const db = getFirestore(app);

// 1. Duplicates WITHIN the CSV
console.log("=== 1. DUPLICADOS EN EL CSV ===");
const csv = readFileSync("/Users/alex/Downloads/logimaster (2)/MasterData_Full_2026-06-02.csv", "utf-8");
const lines = csv.split("\n").filter(l => l.trim());
const csvParts = new Map(); // partNo -> count
for (let i = 1; i < lines.length; i++) {
  const pn = lines[i].split(",")[0].trim().replace(/^"|"$/g, '').toUpperCase();
  if (!pn) continue;
  csvParts.set(pn, (csvParts.get(pn) || 0) + 1);
}
const csvDups = [...csvParts.entries()].filter(([,c]) => c > 1);
console.log(`Part numbers duplicados dentro del CSV: ${csvDups.length}`);
if (csvDups.length > 0 && csvDups.length <= 20) {
  csvDups.forEach(([pn, count]) => console.log(`  ${pn}: ${count} veces`));
} else if (csvDups.length > 20) {
  csvDups.slice(0, 15).forEach(([pn, count]) => console.log(`  ${pn}: ${count} veces`));
  console.log(`  ... y ${csvDups.length - 15} más`);
}

// 2. Check Firebase for docs where part_number field differs from doc ID
console.log("\n=== 2. DOC ID vs PART_NUMBER FIELD EN FIREBASE ===");
const snap = await getDocs(collection(db, "parts"));
let mismatch = 0;
let slashDups = 0;
const byPartNumber = new Map(); // field value -> [docIds]

snap.docs.forEach(d => {
  const data = d.data();
  const fieldPN = (data.PART_NUMBER || data.part_number || '').trim().toUpperCase();
  const docId = d.id.toUpperCase();

  if (fieldPN && fieldPN !== docId) {
    // Check if it's a slash replacement
    const normalizedDocId = docId.replace(/__/g, '/');
    if (normalizedDocId !== fieldPN) {
      mismatch++;
      if (mismatch <= 5) console.log(`  DocID: ${d.id}  →  Field: ${fieldPN}`);
    }
  }

  // Group by part_number field to detect logical duplicates
  if (fieldPN) {
    if (!byPartNumber.has(fieldPN)) byPartNumber.set(fieldPN, []);
    byPartNumber.get(fieldPN).push(d.id);
  }
});

const logicalDups = [...byPartNumber.entries()].filter(([,ids]) => ids.length > 1);
console.log(`\nMismatches doc ID vs field: ${mismatch}`);
console.log(`\n=== 3. DUPLICADOS LÓGICOS EN FIREBASE (mismo PART_NUMBER, distintos docIDs) ===`);
console.log(`Grupos con más de 1 documento: ${logicalDups.length}`);
if (logicalDups.length > 0) {
  logicalDups.slice(0, 20).forEach(([pn, ids]) => {
    console.log(`  PART: ${pn}`);
    ids.forEach(id => console.log(`    → docID: ${id}`));
  });
  if (logicalDups.length > 20) console.log(`  ... y ${logicalDups.length - 20} más`);
}

console.log(`\n=== RESUMEN ===`);
console.log(`Total docs en Firebase: ${snap.size}`);
console.log(`Part numbers únicos (por field): ${byPartNumber.size}`);
console.log(`Documentos duplicados lógicos: ${logicalDups.reduce((acc, [,ids]) => acc + ids.length - 1, 0)}`);
process.exit(0);
