import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";
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
    return Object.fromEntries(Object.entries(fields).map(([k,v]) => [k, convertValue(v)]));
  }
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(convertValue);
  return val;
}

function convertDoc(firestoreDoc) {
  const fields = firestoreDoc.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([k,v]) => [k, convertValue(v)]));
}

const BASE = "/Users/alex/Logimaster_CFMoto/firestore_recovery";
const toRestore = ["users", "system_metadata", "daily_reports"];
let total = 0;

for (const col of toRestore) {
  const raw = JSON.parse(readFileSync(`${BASE}/${col}.json`, 'utf-8'));
  const documents = raw.documents || [];
  if (documents.length === 0) { console.log(`  SKIP ${col} — 0 docs`); continue; }
  
  console.log(`  Restoring ${col} (${documents.length} docs)...`);
  let batch = writeBatch(db);
  let count = 0;

  for (const firestoreDoc of documents) {
    const docId = firestoreDoc.name.split('/').pop();
    const data = convertDoc(firestoreDoc);
    batch.set(doc(db, col, docId), data);
    count++;
    total++;
    if (count % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  if (count % 400 !== 0) await batch.commit();
  console.log(`  ✅ ${col}: ${documents.length} docs restored`);
}

console.log(`\nTotal: ${total} docs restored`);
process.exit(0);
