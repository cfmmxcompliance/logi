import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, limit, getDocs, writeBatch, doc } from "firebase/firestore";

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

// Targeted wipe for everything that could be polluted
const collections = [
    'ds501', 'ds502', 'ds503', 'ds504', 'ds505', 'ds506', 'ds507', 'ds508', 'ds509', 'ds510',
    'ds511', 'ds512', 'ds520', 'ds551', 'ds552', 'ds553', 'ds554', 'ds555', 'ds556', 'ds557', 'ds558', 'ds701', 'ds702',
    'dsInci', 'dsResumen', 'dsSel'
];

async function deleteCollection(colName) {
    console.log(`🧹 Wiping polluted or unvisited: ${colName}...`);
    let deletedCount = 0;
    while (true) {
        const q = query(collection(db, colName), limit(500));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deletedCount += snap.size;
        process.stdout.write(`   - Deleted ${deletedCount} so far\r`);
        await new Promise(r => setTimeout(r, 100)); // Throttling
    }
    console.log(`\n✅ ${colName} fully wiped.`);
}

async function runSweep() {
    for (const col of collections) {
        await deleteCollection(col);
    }
    console.log("\n✨ FINAL SWEEP COMPLETED.");
}

runSweep().catch(console.error);
