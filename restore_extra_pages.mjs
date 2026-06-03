#!/usr/bin/env node
// restore_extra_pages.mjs — Restores all page2+ JSON files from firestore_recovery/page2/

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

const PAGE2_DIR = "/Users/alex/Logimaster_CFMoto/firestore_recovery/page2";
const files = readdirSync(PAGE2_DIR).filter(f => f.endsWith('.json')).sort();

let totalRestored = 0;

for (const file of files) {
  // Extract collection name from filename like "asignacion_cajas_page2.json"
  const collectionName = file.replace(/_page\d+\.json$/, '');
  const raw = JSON.parse(readFileSync(join(PAGE2_DIR, file), 'utf-8'));
  const documents = raw.documents || [];

  if (documents.length === 0) continue;

  process.stdout.write(`  ${file}: ${documents.length} docs... `);

  let batch = writeBatch(db);
  let batchCount = 0;

  for (const firestoreDoc of documents) {
    const docId = firestoreDoc.name.split('/').pop();
    const data = convertDoc(firestoreDoc);
    const ref = doc(db, collectionName, docId);
    batch.set(ref, data);
    batchCount++;
    totalRestored++;

    if (batchCount === 400) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log('✅');
}

console.log(`\n=== EXTRA PAGES RESTORE COMPLETE ===`);
console.log(`Additional documents restored: ${totalRestored}`);
process.exit(0);
