import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, writeBatch } from "firebase/firestore";

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

const collectionsToPurge = [
    'ds501', 'ds502', 'ds503', 'ds504', 'ds505', 'ds506', 'ds507', 'ds508', 'ds509', 'ds510',
    'ds511', 'ds512', 'ds520', 'ds551', 'ds552', 'ds553', 'ds554', 'ds555', 'ds556', 'ds557', 'ds558',
    'ds701', 'ds702', 'dsSel', 'dsInci'
];

async function aggressivePurgeJan2026() {
    console.log(`🚀 Starting AGGRESSIVE Purge for Jan 2026...`);

    for (const colName of collectionsToPurge) {
        console.log(`\nChecking ${colName}...`);

        let snap = null;
        // Targeted wipe: anything from the Jan 2026 source files
        const q = query(collection(db, colName), where("_sourceFile", ">=", "1839316"), where("_sourceFile", "<=", "1839316\uf8ff"));
        snap = await getDocs(q);

        if (!snap.empty) {
            console.log(`Found ${snap.size} records from target source files. Deleting...`);
            const CHUNK_SIZE = 400;
            for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
                const batch = writeBatch(db);
                const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            console.log(`Done.`);
        } else {
            console.log("No records found by source file.");
            // Fallback: check by Date in ANY of c0..c31 if it starts with 2026-01
            // But that's hard to query. Let's just trust sourceFile for now since that's what I used.
        }
    }

    console.log("\n✅ Aggressive Purge Complete.");
    process.exit(0);
}

aggressivePurgeJan2026().catch(console.error);
