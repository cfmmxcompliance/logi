import { initializeApp } from "firebase/app";
import { getFirestore, collection, getCountFromServer, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";

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

// Count parts in Firebase
const snap = await getCountFromServer(collection(db, "parts"));
const firebaseCount = snap.data().count;
console.log(`Firebase 'parts': ${firebaseCount} docs`);

// Count rows in CSV (skip header)
const csv = readFileSync("/Users/alex/Downloads/logimaster (2)/MasterData_Full_2026-06-02.csv", "utf-8");
const lines = csv.split("\n").filter(l => l.trim() && !l.startsWith("PART_NUMBER"));
console.log(`CSV MasterData_Full_2026-06-02: ${lines.length} parts`);

const diff = lines.length - firebaseCount;
console.log(`\nDiferencia: ${diff > 0 ? '+' + diff + ' en CSV (faltan en Firebase)' : diff === 0 ? '✅ Mismo número' : Math.abs(diff) + ' más en Firebase que en CSV'}`);

// Get all part numbers from Firebase to compare
console.log("\nObteniendo part numbers de Firebase...");
const allDocs = await getDocs(collection(db, "parts"));
const firebaseIds = new Set(allDocs.docs.map(d => d.id.trim().toUpperCase()));

// Find parts in CSV not in Firebase
const missing = [];
for (const line of lines) {
  const partNo = line.split(",")[0].trim().replace(/^"|"$/g, "").toUpperCase();
  if (partNo && !firebaseIds.has(partNo)) missing.push(partNo);
}

console.log(`\nParts en CSV que NO están en Firebase: ${missing.length}`);
if (missing.length > 0 && missing.length <= 30) {
  missing.forEach(p => console.log(`  - ${p}`));
} else if (missing.length > 30) {
  missing.slice(0, 20).forEach(p => console.log(`  - ${p}`));
  console.log(`  ... y ${missing.length - 20} más`);
}

process.exit(0);
