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

async function globalPurgeJan2026() {
    const start = "2026-01-01";
    const end = "2026-01-31 23:59:59";

    console.log(`🚀 Starting Global Purge for Jan 2026...`);

    for (const colName of collectionsToPurge) {
        console.log(`\nChecking ${colName}...`);

        // Find date field
        const dateFields = ['FechaPagoReal', 'FechaValidacionPagoR'];
        let snap = null;
        let usedField = "";

        for (const field of dateFields) {
            const q = query(collection(db, colName), where(field, ">=", start), where(field, "<=", end));
            const s = await getDocs(q);
            if (!s.empty) {
                snap = s;
                usedField = field;
                break;
            }
        }

        if (snap && !snap.empty) {
            console.log(`Found ${snap.size} records via ${usedField}. Deleting...`);
            const CHUNK_SIZE = 400;
            for (let i = 0; i < snap.docs.length; i += CHUNK_SIZE) {
                const batch = writeBatch(db);
                const chunk = snap.docs.slice(i, i + CHUNK_SIZE);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            console.log(`Done.`);
        } else {
            console.log("No records found.");
        }
    }

    console.log("\n✅ Global Purge Complete.");
    process.exit(0);
}

globalPurgeJan2026().catch(console.error);
