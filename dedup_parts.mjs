#!/usr/bin/env node
// dedup_parts.mjs — Deletes UUID-keyed parts that have a PART_NUMBER-keyed counterpart
// SAFE: Only deletes a UUID doc if a PART_NUMBER doc already exists for that part

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, deleteDoc, doc, writeBatch } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873"
});
const db = getFirestore(app);

const isUUID = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

console.log("Cargando colección parts...");
const snap = await getDocs(collection(db, "parts"));
console.log(`Total documentos: ${snap.size}`);

// Build a set of all PART_NUMBER-based doc IDs
const pnIds = new Set();
const uuidDocs = [];

snap.docs.forEach(d => {
  if (isUUID(d.id)) {
    uuidDocs.push(d);
  } else {
    pnIds.add(d.id.toUpperCase());
  }
});

console.log(`\nDocs con PART_NUMBER como ID: ${pnIds.size}`);
console.log(`Docs con UUID como ID:        ${uuidDocs.length}`);

// Only delete UUID docs that have a confirmed PART_NUMBER counterpart
const toDelete = [];
const toKeep   = [];

for (const d of uuidDocs) {
  const data = d.data();
  const fieldPN = (data.PART_NUMBER || data.part_number || '').trim().replace(/\//g, '__').toUpperCase();
  if (fieldPN && pnIds.has(fieldPN)) {
    toDelete.push(d.ref);
  } else {
    toKeep.push(d.id); // UUID doc with no PART_NUMBER counterpart — keep it
  }
}

console.log(`\nUUID docs con contraparte PN (a eliminar): ${toDelete.length}`);
console.log(`UUID docs SIN contraparte PN (a conservar): ${toKeep.length}`);

if (toKeep.length > 0) {
  console.log("  → Conservados (sin contraparte):", toKeep.slice(0,5).join(', '), toKeep.length > 5 ? '...' : '');
}

if (toDelete.length === 0) {
  console.log("\nNada que eliminar.");
  process.exit(0);
}

console.log(`\nEliminando ${toDelete.length} documentos duplicados...`);

// Delete in batches of 400
let deleted = 0;
let batch = writeBatch(db);
let batchCount = 0;

for (const ref of toDelete) {
  batch.delete(ref);
  batchCount++;
  deleted++;

  if (batchCount === 400) {
    await batch.commit();
    batch = writeBatch(db);
    batchCount = 0;
    process.stdout.write(`  Eliminados: ${deleted}/${toDelete.length}...\r`);
  }
}

if (batchCount > 0) await batch.commit();

console.log(`\n✅ Limpieza completa.`);
console.log(`   Eliminados: ${deleted} docs UUID duplicados`);
console.log(`   Conservados: ${pnIds.size} docs con PART_NUMBER`);
console.log(`   Total esperado en Firebase: ${pnIds.size + toKeep.length}`);
process.exit(0);
