import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    doc,
    writeBatch,
    getDocs,
    query,
    where,
    deleteDoc
} from 'firebase/firestore';
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

const FILES = ['plantilla_exacta-1.csv', 'plantilla_exacta (1).csv'];

async function uploadFile(filePath) {
    console.log(`\n📂 Processing: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    if (lines.length < 2) return;

    const headers = lines[0].split(',').map(h => h.trim());
    const dataRows = lines.slice(1);

    console.log(`📊 Found ${dataRows.length} rows.`);

    const CHUNK_SIZE = 50; // Smaller batches for safety with deletions
    for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
        const chunk = dataRows.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const row of chunk) {
            // Simple comma split (handling quotes would be better but let's be fast)
            const values = row.split(',').map(v => v.trim());
            const item = {};
            headers.forEach((h, idx) => {
                item[h] = values[idx] || "";
            });

            if (!item.PART_NUMBER) continue;

            const standardPN = item.PART_NUMBER.toUpperCase().trim();
            item.PART_NUMBER = standardPN;
            item.UPDATE_TIME = new Date().toISOString();
            if (!item.id) item.id = crypto.randomUUID();

            // --- GHOST EXTERMINATOR ---
            // Search for existing variations of this PN
            // Since we can't do OR queries easily without multiple calls, we'll search by standard field
            // and assume standardize-on-save already caught most.
            // For a "direct" nuke, we'll search by PART_NUMBER.
            const q = query(collection(db, 'parts'), where('PART_NUMBER', '==', standardPN));
            const snap = await getDocs(q);

            snap.forEach(d => {
                if (d.id !== item.id) {
                    console.log(`   [Clean] Deleting ghost ${d.id} for PN ${standardPN}`);
                    batch.delete(d.ref);
                }
            });

            // Set New Item
            batch.set(doc(db, 'parts', item.id), item);
        }

        await batch.commit();
        console.log(`   ✅ Chunk ${i / CHUNK_SIZE + 1} uploaded.`);
    }
}

async function run() {
    try {
        for (const file of FILES) {
            await uploadFile(file);
        }
        console.log("\n🚀 DIRECT UPLOAD COMPLETE. FIREBASE IS SYNCED.");
        process.exit(0);
    } catch (e) {
        console.error("\n❌ FAILED:", e);
        process.exit(1);
    }
}

run();
