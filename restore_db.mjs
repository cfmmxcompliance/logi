#!/usr/bin/env node
// restore_db.mjs — Converts Firestore REST format → SDK format and writes back to Firestore

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

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

// Convert Firestore REST API value format to plain JS
function convertValue(val) {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue'    in val) return val.stringValue;
  if ('integerValue'   in val) return Number(val.integerValue);
  if ('doubleValue'    in val) return val.doubleValue;
  if ('booleanValue'   in val) return val.booleanValue;
  if ('nullValue'      in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('mapValue'       in val) {
    const fields = val.mapValue.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, convertValue(v)]));
  }
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(convertValue);
  }
  return val;
}

function convertDoc(firestoreDoc) {
  const fields = firestoreDoc.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, convertValue(v)]));
}

const RECOVERY_DIR = "/Users/alex/Logimaster_CFMoto/firestore_recovery";
const files = readdirSync(RECOVERY_DIR).filter(f => f.endsWith('.json'));

let totalRestored = 0;
let totalSkipped = 0;

for (const file of files) {
  const collectionName = file.replace('.json', '');
  const raw = JSON.parse(readFileSync(join(RECOVERY_DIR, file), 'utf-8'));
  const documents = raw.documents || [];

  if (documents.length === 0) {
    console.log(`  SKIP ${collectionName} — 0 docs`);
    totalSkipped++;
    continue;
  }

  console.log(`  Restoring ${collectionName} (${documents.length} docs)...`);

  // Write in batches of 400 (Firestore limit is 500)
  let batch = writeBatch(db);
  let batchCount = 0;
  let restored = 0;

  for (const firestoreDoc of documents) {
    // Extract doc ID from name: projects/.../documents/collection/docId
    const docId = firestoreDoc.name.split('/').pop();
    const data = convertDoc(firestoreDoc);
    const ref = doc(db, collectionName, docId);
    batch.set(ref, data);
    batchCount++;
    restored++;

    if (batchCount === 400) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`  ✅ ${collectionName}: ${restored} docs restored`);
  totalRestored += restored;
}

console.log(`\n=== RESTORE COMPLETE ===`);
console.log(`Total restored: ${totalRestored} documents`);
console.log(`Collections skipped (empty): ${totalSkipped}`);
process.exit(0);
