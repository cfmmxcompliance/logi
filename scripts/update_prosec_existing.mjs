
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, query, limit } from 'firebase/firestore';

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

async function updateProsec() {
    console.log("🚀 Starting PROSEC Backfill...");

    // 1. Fetch Master Data
    console.log("📦 Fetching Parts...");
    const partsSnap = await getDocs(collection(db, 'parts'));
    const partsMap = new Map();
    let prosecCount = 0;

    partsSnap.docs.forEach(doc => {
        const data = doc.data();
        const pn = (data.PART_NUMBER || data.PartNo || '').toString().trim().toUpperCase();
        if (pn && data.PROSEC) {
            partsMap.set(pn, data.PROSEC.toString().trim());
            prosecCount++;
        }
    });
    console.log(`✅ Loaded ${partsMap.size} parts with PROSEC data.`);

    // 2. Fetch Invoices
    console.log("🧾 Fetching Invoices...");
    const invoicesSnap = await getDocs(collection(db, 'commercial_invoices'));
    console.log(`✅ Found ${invoicesSnap.size} invoice items.`);

    // 3. Process Updates
    console.log("🔄 Calculating updates...");
    const batches = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;
    let updateCount = 0;

    for (const docSnap of invoicesSnap.docs) {
        const item = docSnap.data();
        const partNo = (item.partNo || '').toString().trim().toUpperCase();
        const masterProsec = partsMap.get(partNo);

        // Update if: 
        // 1. We have a Master Data PROSEC value
        // 2. AND (Item doesn't have PROSEC OR Item's PROSEC is different)
        if (masterProsec && (!item.prosec || item.prosec.toString().trim() !== masterProsec)) {
            // console.log(`✏️ Updating ${partNo}: ${item.prosec} -> ${masterProsec}`);

            currentBatch.update(docSnap.ref, { prosec: masterProsec });
            operationCount++;
            updateCount++;

            if (operationCount >= 500) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                operationCount = 0;
            }
        }
    }

    if (operationCount > 0) {
        batches.push(currentBatch);
    }

    // 4. Commit Writes
    console.log(`💾 Committing ${batches.length} batches (${updateCount} updates)...`);
    for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        console.log(`   - Batch ${i + 1}/${batches.length} committed.`);
    }

    console.log("🎉 Done! All items updated.");
    process.exit(0);
}

updateProsec().catch(console.error);
