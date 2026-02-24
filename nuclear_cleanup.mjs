
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, writeBatch, doc } from "firebase/firestore";

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

const TARGET_COLLECTIONS = [
    "ds510", "ds511", "ds551", "ds554", "ds556"
];

async function deleteMisdirected(colName) {
    console.log(`\n🧹 Cleaning collection: ${colName}...`);
    const q = query(collection(db, colName));
    const snap = await getDocs(q);

    let deletedCount = 0;
    let batch = writeBatch(db);
    let count = 0;

    for (const d of snap.docs) {
        const data = d.data();
        const type = data._tipoRegistro;
        const colType = colName.replace("ds", "");

        // IF the record type doesn't match the collection (misdirected) OR it has Jan 2026 data we want to refresh
        const isMisdirected = type && type !== colType;
        const isJan2026 = data.FechaPagoReal && data.FechaPagoReal.startsWith("2026-01");

        if (isMisdirected || isJan2026) {
            batch.delete(d.ref);
            count++;
            deletedCount++;
            if (count === 400) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
                process.stdout.write(".");
            }
        }
    }
    await batch.commit();
    console.log(`\n✅ Done. Deleted ${deletedCount} records from ${colName}.`);
}

async function run() {
    console.log("🔥 INITIATING NUCLEAR DATA CLEANUP...");
    for (const col of TARGET_COLLECTIONS) {
        await deleteMisdirected(col);
    }
    console.log("\n✨ DATABASE SANITIZED. Ready for clean re-upload.");
    process.exit(0);
}

run();
