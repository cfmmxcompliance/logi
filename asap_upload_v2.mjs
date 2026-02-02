import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    doc,
    writeBatch,
    getDocs
} from 'firebase/firestore';
import fs from 'fs';
import crypto from 'crypto';

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

// Helper for CSV parsing
function parseCSV(content) {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(row => {
        const values = row.split(',').map(v => v.trim());
        const item = {};
        headers.forEach((h, idx) => {
            if (h) item[h] = values[idx] || "";
        });
        return item;
    });
}

async function run() {
    try {
        console.log("🔍 Fetching existing parts for Ghost Exterminator Local Map...");
        const snap = await getDocs(collection(db, 'parts'));
        const ghostMap = new Map(); // PN -> Set of IDs
        snap.forEach(d => {
            const data = d.data();
            const pn = (data.PART_NUMBER || data.PartNo || data.PARTNUMBER || '').toString().toUpperCase().trim();
            if (pn) {
                if (!ghostMap.has(pn)) ghostMap.set(pn, new Set());
                ghostMap.get(pn).add(d.id);
            }
        });
        console.log(`📊 Map ready. Indexed ${ghostMap.size} unique Part Numbers.`);

        const allItemsToUpload = [];
        const allIdsToDelete = new Set();

        for (const file of FILES) {
            console.log(`📂 Parsing: ${file}`);
            const content = fs.readFileSync(file, 'utf8');
            const items = parseCSV(content);
            console.log(`   Found ${items.length} items.`);

            for (const item of items) {
                if (!item.PART_NUMBER) continue;
                const standardPN = item.PART_NUMBER.toUpperCase().trim();
                const newId = crypto.randomUUID();

                const prepared = {
                    ...item,
                    id: newId,
                    PART_NUMBER: standardPN,
                    UPDATE_TIME: new Date().toISOString()
                };

                // Identify ghosts
                if (ghostMap.has(standardPN)) {
                    ghostMap.get(standardPN).forEach(gid => {
                        allIdsToDelete.add(gid);
                    });
                }

                allItemsToUpload.push(prepared);
            }
        }

        console.log(`🧹 Ghost Exterminator: Found ${allIdsToDelete.size} records to purge.`);
        console.log(`📤 Preparing to upload ${allItemsToUpload.length} new records.`);

        // EXECUTE BATCHES
        const operations = [
            ...Array.from(allIdsToDelete).map(id => ({ type: 'delete', id })),
            ...allItemsToUpload.map(item => ({ type: 'set', id: item.id, data: item }))
        ];

        const CHUNK_SIZE = 400;
        for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
            const chunk = operations.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);

            chunk.forEach(op => {
                const ref = doc(db, 'parts', op.id);
                if (op.type === 'delete') batch.delete(ref);
                else batch.set(ref, op.data);
            });

            await batch.commit();
            console.log(`✅ Progress: ${Math.min(i + CHUNK_SIZE, operations.length)} / ${operations.length} operations committed.`);
        }

        console.log("\n🚀 ASAP UPLOAD COMPLETE. FIREBASE IS NOW CLEAN AND UPDATED.");
        process.exit(0);
    } catch (e) {
        console.error("\n❌ FAILED:", e);
        process.exit(1);
    }
}

run();
