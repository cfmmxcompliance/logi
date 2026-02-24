import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, writeBatch, deleteDoc, doc } from "firebase/firestore";

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

async function deleteCollection(colName) {
    console.log(`\n🧹 Wiping collection: ${colName}...`);
    try {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(colRef);

        if (snapshot.empty) {
            console.log(`   - ${colName} is already empty.`);
            return;
        }

        console.log(`   - Found ${snapshot.docs.length} documents in ${colName}.`);
        let count = 0;
        const BATCH_SIZE = 200;

        for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
            chunk.forEach(d => {
                batch.delete(d.ref);
                count++;
            });
            await batch.commit();
            process.stdout.write(`     - Deleted ${count}/${snapshot.docs.length} from ${colName}\r`);
            await new Promise(r => setTimeout(r, 100)); // Delay for stability
        }
        console.log(`\n✅ ${colName} fully wiped.`);
    } catch (e) {
        console.error(`\n❌ Error wiping ${colName}:`, e.message);
    }
}

async function runNuclearWipe() {
    console.log("⚠️ STARTING RESILIENT NUCLEAR WIPE ⚠️");
    for (const col of COLLECTIONS_TO_WIPE) {
        await deleteCollection(col);
    }
    console.log("\n✨ NUCLEAR WIPE COMPLETED.");
}

runNuclearWipe().then(() => process.exit(0));
