import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';

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

const TARGET_COLS = [
    // Range 501-512
    'ds501', 'ds502', 'ds503', 'ds504', 'ds505', 'ds506', 'ds507', 'ds508', 'ds509', 'ds510', 'ds511', 'ds512',
    // Range 551-558
    'ds551', 'ds552', 'ds553', 'ds554', 'ds555', 'ds556', 'ds557', 'ds558',
    // Range 701-702
    'ds701', 'ds702',
    // Standalone
    'ds520',
    // Special Named
    'dsInci', 'dsResumen', 'dsSel',
    // System
    'ds_items', 'ds_files'
];

async function createPlaceholder(colName) {
    try {
        const ref = doc(db, colName, '_init_placeholder');
        await setDoc(ref, {
            _init: true,
            createdAt: new Date().toISOString(),
            description: "Placeholder document to force collection creation in Firebase Console."
        });
        console.log(`✅ Created placeholder in: ${colName}`);
    } catch (e) {
        console.error(`❌ Error creating ${colName}:`, e.message);
    }
}

async function run() {
    console.log("🚀 Initializing PLACEHOLDER collections in Firestore...");
    console.log("   (Requires active Rules allowing writes to ds*)");

    for (const col of TARGET_COLS) {
        await createPlaceholder(col);
    }

    console.log("\n✨ Initialization Complete.");
    console.log("   Check Firebase Console. You should see these collections now.");
    process.exit(0);
}

run();
