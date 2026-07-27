import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, query, where } from 'firebase/firestore';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("Fetching contratos...");
  const contratosSnap = await getDocs(collection(db, 'contratos'));
  const contratos = contratosSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  console.log(`Found ${contratos.length} contratos.`);

  let count = 0;
  for (const c of contratos) {
    if (!c.numeroOperacion || (!c.layoutUrl && !c.ccpUrl)) continue;

    const q = query(
      collection(db, 'asignacion_cajas'),
      where('numeroOperacion', '==', c.numeroOperacion)
    );
    const snap = await getDocs(q);
    
    // Buscar la asignacion con la misma fecha
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const asig = docs.find(d => d.fecha === c.fecha);

    if (asig) {
      const updates: any = {};
      if (c.layoutUrl && asig.layoutUrl !== c.layoutUrl) {
        updates.layoutUrl = c.layoutUrl;
        updates.layoutUploadedBy = c.layoutUploadedBy || '';
        updates.layoutUploadedAt = c.layoutUploadedAt || '';
        updates.layoutFileName = c.layoutFileName || '';
      }
      if (c.ccpUrl && asig.ccpUrl !== c.ccpUrl) {
        updates.ccpUrl = c.ccpUrl;
        updates.ccpUploadedBy = c.ccpUploadedBy || '';
        updates.ccpUploadedAt = c.ccpUploadedAt || '';
        updates.ccpFileName = c.ccpFileName || '';
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'asignacion_cajas', asig.id), updates);
        console.log(`Fixed ${c.numeroOperacion} for date ${c.fecha}`);
        count++;
      }
    }
  }

  console.log(`DONE. Fixed ${count} records.`);
  process.exit(0);
}

run().catch(console.error);
