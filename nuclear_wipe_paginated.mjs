import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, query, limit } from "firebase/firestore";

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

const COLLECTIONS_TO_WIPE = [
    'ds501', 'ds502', 'ds503', 'ds504', 'ds505', 'ds506', 'ds507', 'ds508', 'ds509', 'ds510', 'ds511', 'ds512',
    'ds520', 'ds551', 'ds552', 'ds553', 'ds554', 'ds555', 'ds556', 'ds557', 'ds558', 'ds701', 'ds702',
    'dsInci', 'dsResumen', 'dsSel', 'ds_items', 'ds999', 'ds_files'
];

async function deleteCollectionPaginated(colName) {
    console.log(`\n🧹 Paginated Wiping: ${colName}...`);
    let totalDeleted = 0;
    const PAGE_SIZE = 500;

    while (true) {
        const q = query(collection(db, colName), limit(PAGE_SIZE));
        const snapshot = await getDocs(q);

        if (snapshot.empty) break;

        const batch = writeBatch(db);
        snapshot.docs.forEach(d => {
            batch.delete(d.ref);
        });

        await batch.commit();
        totalDeleted += snapshot.docs.length;
        process.stdout.write(`     - Deleted ${totalDeleted} so far\r`);
        await new Promise(r => setTimeout(r, 100)); // Cool down
    }
    console.log(`\n✅ ${colName} fully wiped (${totalDeleted} total).`);
}

async function runNuclearWipe() {
    console.log("⚠️ STARTING PAGINATED NUCLEAR WIPE ⚠️");
    for (const col of COLLECTIONS_TO_WIPE) {
        try {
            await deleteCollectionPaginated(col);
        } catch (e) {
            console.error(`\n❌ Error wiping ${col}:`, e.message);
        }
    }
    console.log("\n✨ PAGINATED NUCLEAR WIPE COMPLETED.");
}

runNuclearWipe().then(() => process.exit(0));
