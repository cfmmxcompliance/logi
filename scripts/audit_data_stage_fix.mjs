
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

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

async function runAudit() {
    console.log("🔍 AUDIT: Verifying Data Stage Collections Presence...");

    const collectionsToCheck = [
        'ds501', 'ds502', 'ds503', 'ds504', 'ds505',
        'ds510', 'ds551', 'ds553', 'ds554', 'ds520'
    ];

    for (const col of collectionsToCheck) {
        try {
            const sn = await getDocs(query(collection(db, col), limit(5)));
            const realDocs = sn.docs.filter(d => d.id !== '_init_placeholder' && d.id !== '_schema_example');

            if (realDocs.length > 0) {
                console.log(`✅ ${col}: Found ${realDocs.length} REAL records.`);
                console.log(`   Sample:`, JSON.stringify(realDocs[0].data(), null, 2).substring(0, 100) + "...");
            } else {
                console.log(`⚠️ ${col}: Empty (or only placeholders/schemas).`);
            }
        } catch (e) {
            console.error(`❌ ${col}: Error - ${e.message}`);
        }
    }

    console.log("\nAudit Complete.");
    process.exit(0);
}

runAudit();
