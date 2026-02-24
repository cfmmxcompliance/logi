import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, query, limit } from 'firebase/firestore';

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

// Standard + Potential Dynamic Collections
const BASE_COLS = ['ds_items', 'ds_files'];
const DYNAMIC_COLS = [];
for (let i = 500; i <= 600; i++) {
    DYNAMIC_COLS.push(`ds${i}`);
}

const ALL_TARGETS = [...BASE_COLS, ...DYNAMIC_COLS];

async function deleteCollection(colName) {
    const colRef = collection(db, colName);
    let deletedCount = 0;

    while (true) {
        // Get batch of docs
        const q = query(colRef, limit(400));
        const snapshot = await getDocs(q);

        if (snapshot.empty) break;

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        deletedCount += snapshot.size;
        process.stdout.write(`.`);
    }

    if (deletedCount > 0) {
        console.log(`\n✅ Deleted ${colName}: ${deletedCount} docs`);
    }
}

async function wipeAll() {
    console.log("🔥 STARTING DATA STAGE WIPE...");
    console.log("   Targeting ds_items, ds_files, and ds500-ds600 range.");

    for (const col of ALL_TARGETS) {
        // Quick check to avoid log spam if empty
        const qCheck = query(collection(db, col), limit(1));
        const snap = await getDocs(qCheck);
        if (!snap.empty) {
            process.stdout.write(`Deleting ${col}`);
            await deleteCollection(col);
        }
    }

    console.log("\n✨ WIPE COMPLETE. Firebase Data Stage is clean.");
    console.log("   You can now re-upload the file.");
    process.exit(0);
}

wipeAll();
