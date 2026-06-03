#!/usr/bin/env node
// import_masterdata.mjs — Imports MasterData_Full_2026-06-02.csv into Firebase parts collection

import { initializeApp } from "firebase/app";
import { getFirestore, doc, writeBatch, collection } from "firebase/firestore";
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

const CSV_PATH = "/Users/alex/Downloads/logimaster (2)/MasterData_Full_2026-06-02.csv";

// Simple CSV parser that handles quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const raw = readFileSync(CSV_PATH, 'utf-8');
const lines = raw.split('\n').filter(l => l.trim());
const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^\uFEFF/, ''));

console.log(`Headers (${headers.length}): ${headers.slice(0,5).join(', ')}...`);
console.log(`Total rows to import: ${lines.length - 1}`);
console.log('Starting import...\n');

let batch = writeBatch(db);
let batchCount = 0;
let totalImported = 0;
let skipped = 0;
const BATCH_SIZE = 400;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  const values = parseCSVLine(line);
  const partNumber = values[0]?.trim().replace(/^"|"$/g, '');

  if (!partNumber || partNumber === 'PART_NUMBER') { skipped++; continue; }

  // Firestore doesn't allow '/' in document IDs — replace with '__'
  const safeDocId = partNumber.replace(/\//g, '__');

  const data = {};
  headers.forEach((header, idx) => {
    const val = (values[idx] || '').trim().replace(/^"|"$/g, '');
    if (val !== '') data[header] = val;
  });

  // Ensure part_number field is set (original, with slashes)
  data['part_number'] = partNumber;

  const ref = doc(db, 'parts', safeDocId);
  batch.set(ref, data, { merge: true });
  batchCount++;
  totalImported++;

  if (batchCount >= BATCH_SIZE) {
    await batch.commit();
    batch = writeBatch(db);
    batchCount = 0;
    process.stdout.write(`  Imported ${totalImported}/${lines.length - 1}...\r`);
  }
}

// Commit remaining
if (batchCount > 0) {
  await batch.commit();
}

console.log(`\n✅ Import complete!`);
console.log(`   Imported: ${totalImported} parts`);
console.log(`   Skipped:  ${skipped} invalid rows`);
process.exit(0);
