import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import fs from 'fs';

const firebaseConfig = {
  apiKey: "AIzaSyDEezg2uRbLKAfkGcXt1x0p0KamaTKAaBU",
  authDomain: "logimaster-cfmoto.firebaseapp.com",
  projectId: "logimaster-cfmoto",
  storageBucket: "logimaster-cfmoto.firebasestorage.app",
  messagingSenderId: "924452835722",
  appId: "1:924452835722:web:11a7eedec65ba034dc7873",
  measurementId: "G-01VXE7L5C3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadCatalog() {
  try {
    console.log("Reading Productos.xlsx...");
    const filePath = 'Productos.xlsx';
    if (!fs.existsSync(filePath)) {
      console.error("❌ Archivo Productos.xlsx no encontrado en la raiz.");
      process.exit(1);
    }
    
    // Read the file as buffer so XLSX works correctly in Node
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: null });
    
    const validEntries = [];
    
    for (const row of json) {
      const vals = Object.values(row).map(v => String(v ?? '').trim());
      if (vals[0] === 'MODEL' || vals[0] === 'model') continue;
      
      const keys = Object.keys(row);
      const modelVal = String(row[keys[0]] ?? '').trim();
      const productVal = String(row[keys[1]] ?? '').trim();
      // Remove any trailing periods and spaces globally
      const cleanProductVal = productVal.toUpperCase().replace(/[\.\s]+$/, '').trim();
      
      if (modelVal && cleanProductVal && !['MODEL', 'model'].includes(modelVal)) {
        validEntries.push({
          id: cleanProductVal,
          estilo: cleanProductVal,
          modelo: modelVal
        });
      }
    }
    
    console.log(`Found ${validEntries.length} valid products to upload.`);
    if (validEntries.length === 0) {
      console.log("Nothing to upload.");
      process.exit(0);
    }
    
    // Upload in batches of 500
    const chunks = [];
    for (let i = 0; i < validEntries.length; i += 500) {
        chunks.push(validEntries.slice(i, i + 500));
    }
    
    let uploadedCount = 0;
    for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(entry => {
            const docRef = doc(db, 'productos', entry.id);
            batch.set(docRef, {
                estilo: entry.estilo,
                modelo: entry.modelo,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        });
        await batch.commit();
        uploadedCount += chunk.length;
        console.log(`✅ Uploaded ${uploadedCount}/${validEntries.length} products...`);
    }
    
    console.log("🎉 All products uploaded to 'catalogo_productos' collection successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Critical error:", error);
    process.exit(1);
  }
}

uploadCatalog();
